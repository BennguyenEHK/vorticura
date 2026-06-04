// URL liveness check with WAF profile rotation.

export type LivenessStatus = 'live' | 'dead' | 'blocked' | 'timeout';

export interface LivenessResult {
  /** 'live'=2xx, 'dead'=404/410, 'blocked'=other */
  status: LivenessStatus;
  /** HTTP status code; 0 on network error */
  httpStatus: number;
  /** Response body when 2xx (capped), else null */
  html: string | null;
}

/** Browser header profiles for WAF bypass escalation. */
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

/** Per-host cache: winning profile index or 'blocked'. */
const hostProfileCache = new Map<string, number | 'blocked'>();

// --- Run-scoped exact-URL liveness cache ---
// Key = full URL minus #fragment; query string preserved.
// Each URL is an independent key — never host-keyed.
const livenessCache = new Map<string, { result: LivenessResult; expires: number }>();

/** In-flight de-dup: concurrent identical URLs share one fetch. */
const livenessFlight = new Map<string, Promise<LivenessResult>>();

/** Max cached entries before FIFO eviction. */
const LIVENESS_CACHE_MAX = 64;

/** TTL in ms; default 5 minutes. */
function getLivenessTtlMs(): number {
  const env = process.env.LIVENESS_CACHE_TTL_MS;
  const parsed = env ? parseInt(env, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300_000;
}

/** Strip #fragment; preserve path and query string. */
function toLivenessCacheKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

/** Evict the oldest (first-inserted) cache entry. */
function evictOldestLivenessEntry(): void {
  const firstKey = livenessCache.keys().next().value;
  if (firstKey !== undefined) {
    livenessCache.delete(firstKey);
  }
}

/**
 * Like checkLiveness with a run-scoped in-memory cache.
 * TTL: LIVENESS_CACHE_TTL_MS env, default 5 min. Max 64 entries, FIFO.
 * Fail-open: cache errors fall back to checkLiveness directly.
 */
export async function checkLivenessCached(
  url: string,
  timeoutMs?: number
): Promise<LivenessResult> {
  try {
    const key = toLivenessCacheKey(url);
    const now = Date.now();

    // Cache hit: return if fresh.
    const cached = livenessCache.get(key);
    if (cached && cached.expires > now) {
      return cached.result;
    }

    // De-dup: share in-flight Promise for same URL.
    const inflight = livenessFlight.get(key);
    if (inflight) {
      return await inflight;
    }

    // Miss: fetch, store, return.
    const fetchPromise = checkLiveness(url, timeoutMs).then(
      (result) => {
        // Remove from in-flight map before caching.
        livenessFlight.delete(key);

        // Evict oldest if at capacity.
        if (livenessCache.size >= LIVENESS_CACHE_MAX) {
          evictOldestLivenessEntry();
        }

        livenessCache.set(key, { result, expires: Date.now() + getLivenessTtlMs() });
        return result;
      },
      (err) => {
        // On rejection: remove in-flight so next caller retries.
        livenessFlight.delete(key);
        throw err;
      }
    );

    livenessFlight.set(key, fetchPromise);
    return await fetchPromise;
  } catch {
    // Fail-open: fall back to a direct call.
    return checkLiveness(url, timeoutMs);
  }
}

/** Clear the liveness cache and in-flight de-dup map. */
export function clearLivenessCache(): void {
  livenessCache.clear();
  livenessFlight.clear();
}

/** Extract the host from a URL. */
function getHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** Fetch with a given header profile; null response on network error. */
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
    // Network error or timeout.
    return { response: null, lastHttpStatus: 0 };
  }
}

/** HEAD probe; returns true if 2xx. Used when LIVENESS_HEAD_PROBE=1. */
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

/** Read body and classify page; skips non-HTML content types. */
async function readAndClassify(
  response: Response,
): Promise<LivenessResult> {
  const contentType = response.headers.get('content-type') ?? '';
  const isHtml =
    contentType.startsWith('text/html') ||
    contentType.startsWith('application/xhtml+xml');
  // Empty or text/* could still be HTML served with wrong header.
  const mightBeHtml = !contentType || contentType.startsWith('text/');

  // Skip body read for non-HTML types (PDF, images).
  if (!isHtml && !mightBeHtml) {
    return { status: 'blocked', httpStatus: response.status, html: null };
  }

  // Read body; guard against stream timeout.
  let body: string;
  try {
    body = await response.text();
  } catch {
    // AbortError / TimeoutError during streaming.
    return { status: 'timeout', httpStatus: response.status, html: null };
  }

  if (!isHtml) {
    // Sniff first 512 chars for HTML markers.
    const peek = body.slice(0, 512).trimStart().toLowerCase();
    if (!peek.startsWith('<!doctype') && !peek.startsWith('<html')) {
      return { status: 'blocked', httpStatus: response.status, html: null };
    }
  }

  // Valid HTML.
  return { status: 'live', httpStatus: response.status, html: body.slice(0, 500_000) };
}

/**
 * Check liveness of a URL with optional profile escalation.
 * @param url - URL to check
 * @param timeoutMs - Fetch timeout ms; default 8000
 */
export async function checkLiveness(
  url: string,
  timeoutMs?: number
): Promise<LivenessResult> {
  const timeout = timeoutMs ?? 8000;
  const profileRotationEnabled = process.env.LIVENESS_PROFILE_ROTATION === '1';
  const headProbeEnabled = process.env.LIVENESS_HEAD_PROBE === '1';

  // No rotation: use single BASE_CHROME profile.
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

  // Escalate through profiles on blocking responses.
  const host = getHost(url);
  let startIndex = 0;

  // Start from the cached winning profile for this host.
  if (host) {
    const cachedProfileOrStatus = hostProfileCache.get(host);
    if (cachedProfileOrStatus === 'blocked') {
      // All profiles exhausted in a prior request.
      return {
        status: 'blocked',
        httpStatus: 0,
        html: null,
      };
    }
    if (typeof cachedProfileOrStatus === 'number') {
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
    lastHttpStatus = httpStatus;

    if (response === null) {
      // Network error: try next profile.
      continue;
    }

    if (response.ok) {
      const result = await readAndClassify(response);
      // Cache winning profile index.
      if (host) {
        hostProfileCache.set(host, i);
      }
      return result;
    }

    if (response.status === 404 || response.status === 410) {
      // Permanently gone — cache and return.
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
      // Blocking: escalate to next profile. 429 — do NOT sleep.
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          lastBlockingStatus = response.status;
          continue;
        }
      }

      lastBlockingStatus = response.status;
      continue;
    }

    // Other non-2xx: treat as blocked.
    lastBlockingStatus = response.status;
  }

  // All profiles exhausted. Try HEAD probe if enabled.
  if (headProbeEnabled && HEADER_PROFILES.length > 0) {
    const lastProfile = HEADER_PROFILES[HEADER_PROFILES.length - 1];
    const headOk = await probeHeadRequest(url, lastProfile, timeout);
    if (headOk) {
      // HEAD succeeded: live with no body.
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

  // Flag-gated stub for future alt fetch engine (TLS fingerprint).
  if (process.env.LIVENESS_ALT_ENGINE === '1') {
    // TODO: call curl-impersonate / real browser engine.
    const altEngineResult = null; // stub
    if (altEngineResult) {
      if (host) {
        hostProfileCache.set(host, 'blocked');
      }
      return altEngineResult;
    }
  }

  // All fallbacks exhausted: return blocked.
  if (host) {
    hostProfileCache.set(host, 'blocked');
  }

  return {
    status: 'blocked',
    httpStatus: lastBlockingStatus || lastHttpStatus,
    html: null,
  };
}
