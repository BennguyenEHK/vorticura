// =============================================
// EVENT BUS — Redis Pub/Sub (multi-instance safe)
// =============================================
// Purpose: deliver real-time events (preview-update, rfq-queue, comms-update)
// to every Next.js instance so SSE subscribers receive emits made on ANY process.
//
// Why Redis: Next.js runs as N independent processes in production (Vercel,
// PM2 cluster, k8s). The old in-process EventEmitter only reached the SAME
// process; events emitted by other instances / CLI scripts were dropped.
// Redis Pub/Sub is the idiomatic solution — ioredis gives us native auto-reconnect
// and cross-process fan-out with minimal surface area.
//
// API compatibility: callers still use eventBus.emit / on / off exactly as before.
// Payload shape is JSON-normalized on emit so same-process and cross-process
// listeners both see the identical (JSON-parseable) object.

import { EventEmitter } from 'events';
import Redis, { type Redis as RedisClient } from 'ioredis';
import { randomUUID } from 'crypto';

// Channel namespace — avoids collisions if the Redis instance is shared with other services
const CHANNEL_PREFIX = 'qfa:';
// Pattern subscribed once at startup; new event names require no extra SUBSCRIBE calls
const PATTERN = `${CHANNEL_PREFIX}*`;

// Envelope wrapping every published message — origin tag lets the subscriber
// drop its own echoes (we already emitted locally on the publishing process)
interface Envelope {
  origin: string; // unique per-process id
  data: unknown;  // the JSON-normalized payload callers passed to emit()
}

// Safely format unknown errors for logging (Error | string | anything else)
function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

class RedisEventBus extends EventEmitter {
  // Unique id for THIS process — used to filter out self-published messages
  private readonly processId = randomUUID();
  // Publisher connection: issues PUBLISH commands (cannot be in subscribe mode)
  private publisher: RedisClient | null = null;
  // Subscriber connection: dedicated client held in subscribe mode for the process lifetime
  private subscriber: RedisClient | null = null;

  constructor() {
    super();
    // Each SSE connection adds a listener; 100 handles a comfortable fleet size
    this.setMaxListeners(100);
    this.init();
  }

  /** Lazy init — degrades to in-process EventEmitter when REDIS_URL is unset (dev convenience) */
  private init(): void {
    const url = process.env.REDIS_URL;
    if (!url) {
      // No Redis configured: behave like a plain EventEmitter so solo-dev still works
      console.warn('[event-bus] REDIS_URL not set — running in-process only (no cross-instance delivery)');
      return;
    }

    // Publisher: short-lived commands only; retry caps prevent unbounded backlog during outages
    this.publisher = new Redis(url, {
      maxRetriesPerRequest: 3,   // fail fast on individual PUBLISH commands
      enableReadyCheck: true,    // wait for server READY before issuing commands
      lazyConnect: false,        // connect immediately at module load
    });
    this.publisher.on('error', (e) => console.warn('[event-bus][publisher] error:', formatError(e)));
    this.publisher.on('ready', () => console.log('[event-bus][publisher] ready'));

    // Subscriber: long-lived subscribe-mode connection; never set maxRetriesPerRequest
    // (ioredis requires null for persistent subscribers so it keeps reconnecting forever)
    this.subscriber = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    this.subscriber.on('error', (e) => console.warn('[event-bus][subscriber] error:', formatError(e)));
    this.subscriber.on('ready', () => console.log('[event-bus][subscriber] ready'));

    // Subscribe once to the whole app namespace — every event name flows through here.
    // ioredis re-issues the PSUBSCRIBE automatically after reconnect, so no manual retry needed.
    this.subscriber.psubscribe(PATTERN)
      .then(() => console.log(`[event-bus] psubscribed to ${PATTERN}`))
      .catch((e) => console.warn('[event-bus] psubscribe failed:', formatError(e)));

    // Inbound cross-process messages: parse envelope, drop echoes, re-emit locally
    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      try {
        // Strip the namespace prefix to recover the caller-visible event name
        const eventName = channel.slice(CHANNEL_PREFIX.length);
        const envelope = JSON.parse(message) as Envelope;
        // Skip messages we ourselves published — we already delivered them locally in emit()
        if (envelope.origin === this.processId) {
          console.log(`[event-bus][sub ${this.processId.slice(0, 8)}] skip self-echo channel=${eventName}`);
          return;
        }
        // Listener count is the diagnostic that tells us whether the SSE route on
        // THIS instance is actually subscribed when the cross-process emit lands.
        const listenerCount = this.listenerCount(eventName);
        console.log(
          `[event-bus][sub ${this.processId.slice(0, 8)}] pmessage channel=${eventName} from=${envelope.origin.slice(0, 8)} listeners=${listenerCount}`,
        );
        // Fan out to in-process listeners (SSE routes subscribed via eventBus.on)
        super.emit(eventName, envelope.data);
      } catch (err) {
        console.warn('[event-bus] pmessage handler failed:', formatError(err));
      }
    });
  }

  /**
   * Emit an event. Delivers synchronously to same-process listeners AND asynchronously
   * publishes to Redis so listeners on other instances receive it too.
   *
   * Payload contract: we JSON round-trip the payload so local listeners receive the EXACT
   * same shape (strings for Dates, plain objects, no prototypes) that cross-process
   * listeners receive via Redis. The SSE client hook already rehydrates Date fields from
   * ISO strings, so this keeps behavior uniform end-to-end.
   */
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    const eventName = String(event);
    // Convention: single-arg emits pass the arg through; multi-arg emits wrap into an array
    const rawPayload = args.length === 1 ? args[0] : args;

    // Normalize once — both paths (local + Redis) receive the identical serialized shape
    let normalized: unknown;
    try {
      normalized = JSON.parse(JSON.stringify(rawPayload));
    } catch (err) {
      // Non-serializable payload (cycles, BigInt, etc.) — log and skip cross-process fan-out
      console.warn(`[event-bus] payload for "${eventName}" is not JSON-serializable:`, formatError(err));
      return super.emit(event, rawPayload);
    }

    // (1) Synchronous local delivery — SSE routes in this process flush immediately
    const localResult = super.emit(event, normalized);

    // (2) Cross-process delivery — fire-and-forget PUBLISH; errors logged but never thrown
    if (this.publisher) {
      const envelope: Envelope = { origin: this.processId, data: normalized };
      const payload = JSON.stringify(envelope);
      this.publisher
        .publish(CHANNEL_PREFIX + eventName, payload)
        .catch((err) => console.warn(`[event-bus] publish failed for "${eventName}":`, formatError(err)));
    }

    return localResult;
  }

  /**
   * Awaitable emit — same delivery as emit() but the caller can `await` cross-process
   * publish completion. Required on Vercel/serverless: a fire-and-forget publish is
   * dropped when the runtime freezes the function instance after the response is sent,
   * so SSE listeners on other instances never receive the event. Use this from server
   * actions / API routes that emit immediately before returning.
   */
  async emitAsync(event: string | symbol, ...args: unknown[]): Promise<boolean> {
    const eventName = String(event);
    const rawPayload = args.length === 1 ? args[0] : args;

    let normalized: unknown;
    try {
      normalized = JSON.parse(JSON.stringify(rawPayload));
    } catch (err) {
      console.warn(`[event-bus] payload for "${eventName}" is not JSON-serializable:`, formatError(err));
      return super.emit(event, rawPayload);
    }

    const localResult = super.emit(event, normalized);

    if (this.publisher) {
      const envelope: Envelope = { origin: this.processId, data: normalized };
      const payload = JSON.stringify(envelope);
      try {
        // Upstash returns the number of subscribers that received the publish.
        // 0 means NO Vercel instance currently has an SSE connection open for
        // this channel — the visible symptom is "DB writes succeed, UI never
        // refreshes until F5". Logging this lets us tell that case apart from
        // a publish/network failure.
        const receivers = await this.publisher.publish(CHANNEL_PREFIX + eventName, payload);
        console.log(
          `[event-bus][pub ${this.processId.slice(0, 8)}] publish channel=${eventName} receivers=${receivers}`,
        );
      } catch (err) {
        console.warn(`[event-bus] publish failed for "${eventName}":`, formatError(err));
      }
    } else {
      // Most useful failure mode: REDIS_URL missing in Vercel env → fallback to
      // in-process EventEmitter → cross-instance fan-out impossible. Each emit
      // logs once so this state is visible in Vercel logs after a few clicks.
      console.warn(
        `[event-bus][pub] no publisher (REDIS_URL unset?) — channel=${eventName} delivered in-process only`,
      );
    }

    return localResult;
  }

  /** Graceful shutdown — disconnects both clients cleanly. Optional; processes exit anyway. */
  async close(): Promise<void> {
    try { await this.subscriber?.quit(); } catch { /* already closed */ }
    try { await this.publisher?.quit(); } catch { /* already closed */ }
    this.subscriber = null;
    this.publisher = null;
  }
}

// Singleton across Next.js HMR reloads in dev — without this, each reload spawns a new
// subscriber and old ones leak Redis connections until the dev server is restarted.
const globalForEvents = globalThis as unknown as { eventBus?: RedisEventBus };

/** Shared event bus instance — use eventBus.emit(channel, payload) / eventBus.on(channel, fn). */
export const eventBus: RedisEventBus = globalForEvents.eventBus ?? (globalForEvents.eventBus = new RedisEventBus());
