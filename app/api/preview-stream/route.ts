// =============================================
// SSE PREVIEW STREAM - Server-Sent Events Route
// =============================================
// Streams real-time preview updates to connected clients via Redis Pub/Sub
// (lib/event-bus.ts). Subscribers are per-instance; the Upstash broker fans
// out the publish to every Vercel instance currently holding an SSE connection.

import { eventBus } from '@/lib/event-bus';
import type { ProcessorResult } from '@/lib/utils/validator';
import { randomUUID } from 'crypto';

// Disable static optimization — SSE must be dynamic
export const dynamic = 'force-dynamic';
// Pin to Node.js runtime — Edge runtime on Vercel doesn't support ioredis (TCP)
export const runtime = 'nodejs';
// Keep the streaming function alive long enough to outlive normal action durations.
// Vercel caps to plan limit (Hobby ~60s, Pro 300s); requesting 300 just opts in to
// the highest available duration so SSE clients reconnect less often. Each reconnect
// is a window where Redis Pub/Sub events can be missed.
export const maxDuration = 300;

/**
 * GET /api/preview-stream
 * Opens a persistent SSE connection that forwards "preview-update" events
 * Includes 15s heartbeat to detect client disconnects
 */
export async function GET() {
  const encoder = new TextEncoder();
  // Per-connection id makes log lines correlatable across "subscribed", "frame",
  // "heartbeat", and "cleanup" entries when multiple SSE clients are active.
  const connId = randomUUID().slice(0, 8);
  // Hoisted so the ReadableStream `cancel` handler (fired by the runtime when
  // the client disconnects cleanly — tab close, navigation, HMR) can run
  // teardown. Without this, listeners leak on every clean disconnect.
  let cleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      console.log(`[sse:preview ${connId}] subscribed`);
      // Forward event bus messages as SSE data frames
      const onUpdate = (data: ProcessorResult) => {
        try {
          // Diagnostic log — confirms the cross-process pmessage actually reached
          // THIS instance's listener (vs. being dropped by the broker / wrong region)
          console.log(
            `[sse:preview ${connId}] frame data_type=${data?.data_type} action=${data?.action_type} success=${data?.success}`
          );
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller closed — client disconnected
          cleanup();
        }
      };

      // Subscribe to preview updates
      eventBus.on('preview-update', onUpdate);

      // Heartbeat every 15s — SSE comment line keeps connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // Enqueue failed — client disconnected
          cleanup();
        }
      }, 15_000);

      // Cleanup helper: unsubscribe + close stream. Idempotent — safe to call
      // from both the enqueue-catch path and the `cancel` handler below.
      cleanup = () => {
        console.log(`[sse:preview ${connId}] cleanup`);
        eventBus.off('preview-update', onUpdate);
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      };
    },
    cancel() {
      cleanup();
    },
  });

  // Return SSE-compatible response headers
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',       // SSE MIME type
      'Cache-Control': 'no-cache, no-transform', // Prevent caching/buffering
      'Connection': 'keep-alive',                // Persistent connection
      // Vercel/Nginx can hold streamed chunks until a buffer fills or the
      // connection ends. Without this header SSE chunks may sit in the proxy
      // for tens of seconds, making `controller.enqueue` look like a no-op
      // from the client's perspective.
      'X-Accel-Buffering': 'no',
    },
  });
}
