/**
 * URL Liveness Pre-Gate (Layer 0)
 *
 * Performs a single fetch per URL to classify its state:
 * - 'live' (2xx): page is accessible, HTML body returned
 * - 'dead' (404/410): page is permanently gone, drop from candidates
 * - 'blocked' (other non-2xx, network error, timeout): bot-protected or transient,
 *   keep candidate but skip HTML enhancement; fall back to Tavily raw_content
 *
 * This module NEVER throws; all outcomes are classified into a LivenessResult.
 * Callers should handle 'blocked' by using alternative text sources (e.g., search engine snippets).
 *
 * When LIVENESS_PROFILE_ROTATION env flag is '1', escalates through a bounded set
 * of realistic browser header profiles to bypass basic WAF challenges (403, 429, etc.).
 * Uses per-host caching to avoid re-walking the ladder on repeated URLs.
 */

export type LivenessStatus = 'live' | 'dead' | 'blocked' | 'timeout';

export interface LivenessResult {
  /** Classification of URL state: 'live'=2xx, 'dead'=404/410, 'blocked'=other non-2xx/network/timeout */
  status: LivenessStatus;
  /** Numeric HTTP status code; 0 on network error or timeout */
  httpStatus: number;
  /** Response body when 2xx (capped to 500k chars), else null */
  html: string | null;
}

/**
 * Realistic browser header profiles for WAF bypass escalation.
 * Each profile is internally consistent: UA, Sec-CH-UA, and Sec-CH-UA-Platform must agree.
 */
interface HeaderProfile {
  name: string;
  headers: Record<string, string>;
}

const HEADER_PROFILES: HeaderProfile[] = [
  {
    name: 'BASE_CHROME',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  },
  {
    name: 'FULL_CHROME',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-User': '?1',
      'Sec-CH-UA': '"Google Chrome";v="137", "Chromium";v="137", ";Not A Brand";v="24"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"Windows"',
      'Upgrade-Insecure-Requests': '1',
    },
  },
  {
    name: 'SAFARI_MAC',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-us',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-User': '?1',
    },
  },
  {
    name: 'FIREFOX',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-User': '?1',
    },
  },
];

/**
 * Per-host cache tracking the winning profile index or 'blocked' status.
 * Once a host's successful profile is found, we start there on the next request,
 * avoiding a full re-walk of the ladder.
 */
const hostProfileCache = new Map<string, number | 'blocked'>();

/**
 * Extract the host from a URL for caching purposes.
 */
function getHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * Attempt a single fetch with a given header profile and timeout.
 * Returns { response, lastHttpStatus } on any outcome (success or non-network error).
 * On network error, returns { response: null, lastHttpStatus: 0 }.
 */
async function fetchWithProfile(
  url: string,
  profile: HeaderProfile,
  timeoutMs: number
): Promise<{ response: Response | null; lastHttpStatus: number }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: profile.headers,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store' as RequestCache,
    });
    return { response, lastHttpStatus: response.status };
  } catch {
    // Network error, timeout, or other fetch failure.
    return { response: null, lastHttpStatus: 0 };
  }
}

/**
 * Attempt a HEAD request with the given profile.
 * Used as a lightweight secondary probe when LIVENESS_HEAD_PROBE is enabled.
 * Returns true if the HEAD request returns 2xx, false otherwise.
 */
async function probeHeadRequest(
  url: string,
  profile: HeaderProfile,
  timeoutMs: number
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: profile.headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Read the response body safely and classify the page.
 * Checks Content-Type BEFORE reading to avoid streaming large non-HTML files
 * (PDFs, images) that would timeout. Wraps body.text() in try-catch so a
 * stream timeout returns 'timeout' instead of crashing the pipeline.
 */
async function readAndClassify(
  response: Response,
): Promise<LivenessResult> {
  const contentType = response.headers.get('content-type') ?? '';
  const isHtml =
    contentType.startsWith('text/html') ||
    contentType.startsWith('application/xhtml+xml');
  // mightBeHtml: empty Content-Type or text/* could still be HTML served with wrong header
  const mightBeHtml = !contentType || contentType.startsWith('text/');

  // Fast path: skip body read for types that cannot be HTML (PDF, images, etc.)
  // to avoid AbortSignal timeout firing during large-file streaming.
  if (!isHtml && !mightBeHtml) {
    return { status: 'blocked', httpStatus: response.status, html: null };
  }

  // Read body — may timeout on slow connections. Guard with try-catch.
  let body: string;
  try {
    body = await response.text();
  } catch {
    // AbortError / TimeoutError during body streaming — classify as timeout.
    return { status: 'timeout', httpStatus: response.status, html: null };
  }

  if (!isHtml) {
    // Content-Type was empty or text/* — sniff first 512 chars for HTML markers.
    const peek = body.slice(0, 512).trimStart().toLowerCase();
    if (!peek.startsWith('<!doctype') && !peek.startsWith('<html')) {
      return { status: 'blocked', httpStatus: response.status, html: null };
    }
  }

  // Valid HTML.
  return { status: 'live', httpStatus: response.status, html: body.slice(0, 500_000) };
}

/**
 * Check liveness of a single URL with optional header profile escalation.
 *
 * @param url - URL to check
 * @param timeoutMs - Fetch timeout in milliseconds; defaults to 8000ms
 * @returns LivenessResult classifying the URL state and body (if live)
 */
export async function checkLiveness(
  url: string,
  timeoutMs?: number
): Promise<LivenessResult> {
  const timeout = timeoutMs ?? 8000;
  const profileRotationEnabled = process.env.LIVENESS_PROFILE_ROTATION === '1';
  const headProbeEnabled = process.env.LIVENESS_HEAD_PROBE === '1';

  // If profile rotation is disabled, use the legacy single-profile behavior.
  if (!profileRotationEnabled) {
    const { response } = await fetchWithProfile(
      url,
      HEADER_PROFILES[0], // BASE_CHROME
      timeout
    );

    if (response === null) {
      return {
        status: 'blocked',
        httpStatus: 0,
        html: null,
      };
    }

    if (response.ok) {
      return await readAndClassify(response);
    }

    if (response.status === 404 || response.status === 410) {
      return {
        status: 'dead',
        httpStatus: response.status,
        html: null,
      };
    }

    return {
      status: 'blocked',
      httpStatus: response.status,
      html: null,
    };
  }

  // Profile rotation enabled: escalate through profiles on blocking responses.
  const host = getHost(url);
  let startIndex = 0;

  // Check per-host cache to avoid re-walking the ladder.
  if (host) {
    const cachedProfileOrStatus = hostProfileCache.get(host);
    if (cachedProfileOrStatus === 'blocked') {
      // All profiles exhausted for this host in a prior request.
      return {
        status: 'blocked',
        httpStatus: 0,
        html: null,
      };
    }
    if (typeof cachedProfileOrStatus === 'number') {
      // Start with the cached winning profile.
      startIndex = cachedProfileOrStatus;
    }
  }

  let lastBlockingStatus = 0;
  let lastHttpStatus = 0;

  for (let i = startIndex; i < HEADER_PROFILES.length; i++) {
    const profile = HEADER_PROFILES[i];
    const { response, lastHttpStatus: httpStatus } = await fetchWithProfile(
      url,
      profile,
      timeout
    );
    lastHttpStatus = httpStatus; // Track last HTTP status for final fallback

    if (response === null) {
      // Network error: try next profile, or give up if no profiles left.
      continue;
    }

    if (response.ok) {
      // 2xx response: check if it's HTML.
      const result = await readAndClassify(response);
      // Cache the profile on any successful response (regardless of HTML status).
      if (host) {
        hostProfileCache.set(host, i);
      }
      // Return result directly — readAndClassify always returns a LivenessResult.
      return result;
    }

    if (response.status === 404 || response.status === 410) {
      // Terminal: page is permanently gone. Cache and return immediately.
      if (host) {
        hostProfileCache.set(host, i);
      }
      return {
        status: 'dead',
        httpStatus: response.status,
        html: null,
      };
    }

    if (response.status === 401 || response.status === 403 || response.status === 429 || response.status === 503) {
      // Blocking status: on 429, optionally honor Retry-After by just moving on
      // (do NOT sleep or retry; that would amplify). For other blocking statuses,
      // escalate to the next profile.
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          // Retry-After header present: skip this profile and move to the next
          // without further delay (429 safety: do not amplify).
          lastBlockingStatus = response.status;
          continue;
        }
      }

      lastBlockingStatus = response.status;
      continue; // Try next profile.
    }

    // Other non-2xx status: treat as blocked, try next profile.
    lastBlockingStatus = response.status;
  }

  // All header profiles exhausted on blocking statuses.
  // Optionally attempt a HEAD probe if enabled (lightweight check).
  if (headProbeEnabled && HEADER_PROFILES.length > 0) {
    const lastProfile = HEADER_PROFILES[HEADER_PROFILES.length - 1];
    const headOk = await probeHeadRequest(url, lastProfile, timeout);
    if (headOk) {
      // HEAD succeeded: return 'live' with bodyless html:null.
      // Caller can fall back to Tavily raw_content.
      if (host) {
        hostProfileCache.set(host, HEADER_PROFILES.length - 1);
      }
      return {
        status: 'live',
        httpStatus: 200,
        html: null,
      };
    }
  }

  // Flag-gated STUB for future TLS-fingerprint-aligned alt fetch engine.
  // Currently returns null (falls through to blocked classification).
  // When implemented, replace with a call to an external fetch engine that
  // mimics a real browser TLS fingerprint (e.g., curl-impersonate, Puppeteer).
  if (process.env.LIVENESS_ALT_ENGINE === '1') {
    // TODO: Call alt fetch engine (e.g., curl-impersonate, real browser).
    // For now, stub returns null; caller treats as blocked.
    const altEngineResult = null; // stub
    if (altEngineResult) {
      if (host) {
        hostProfileCache.set(host, 'blocked');
      }
      return altEngineResult;
    }
  }

  // All profiles and fallback mechanisms exhausted: return blocked.
  // Cache 'blocked' status for this host to short-circuit future requests.
  if (host) {
    hostProfileCache.set(host, 'blocked');
  }

  return {
    status: 'blocked',
    httpStatus: lastBlockingStatus || lastHttpStatus,
    html: null,
  };
}
