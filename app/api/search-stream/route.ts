// =============================================
// SSE SEARCH STREAM - Server-Sent Events Route
// =============================================
// Streams live supplier-search telemetry to the Search Phase Dashboard.
// Subscribes to the 'search-progress' event-bus channel (Redis Pub/Sub, so
// emits made on ANY Next.js instance reach every connected client) and forwards
// each SearchProgressEvent as an SSE data frame. Mirrors preview-stream/route.ts.

import { eventBus } from '@/lib/event-bus';
import type { SearchProgressEvent } from '@/types/search-progress';

// Disable static optimization — SSE must be dynamic.
export const dynamic = 'force-dynamic';

/**
 * GET /api/search-stream
 * Opens a persistent SSE connection that forwards "search-progress" events.
 * Includes a 15s heartbeat so dropped clients are detected and torn down.
 */
export async function GET() {
  const encoder = new TextEncoder();
  // Hoisted so the ReadableStream `cancel` handler (fired by the runtime on a
  // clean client disconnect — tab close, navigation, HMR) can run teardown.
  // Without this, listeners leak on every clean disconnect.
  let cleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      // Forward event-bus messages as SSE data frames.
      const onProgress = (data: SearchProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller closed — client disconnected.
          cleanup();
        }
      };

      eventBus.on('search-progress', onProgress);

      // Heartbeat every 15s — SSE comment line keeps the connection alive.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          cleanup();
        }
      }, 15_000);

      // Idempotent teardown — safe from both the enqueue-catch path and `cancel`.
      cleanup = () => {
        eventBus.off('search-progress', onProgress);
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      };
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
