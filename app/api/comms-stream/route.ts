// =============================================
// SSE COMMS STREAM - Server-Sent Events Route
// =============================================
// Streams real-time notification updates to connected clients
// Uses in-process EventEmitter (lib/event-bus.ts)
// Mirrors the structure of preview-stream/route.ts

import { eventBus } from '@/lib/event-bus';

// Disable static optimization — SSE must be dynamic
export const dynamic = 'force-dynamic';

/**
 * GET /api/comms-stream
 * Opens a persistent SSE connection that forwards "comms-update" events
 * Includes 15s heartbeat to detect client disconnects
 */
export async function GET() {
  const encoder = new TextEncoder();
  // Hoisted so the ReadableStream `cancel` handler can run teardown
  let cleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      // Forward event bus messages as SSE data frames
      const onUpdate = (data: unknown) => {
        try {
          console.log('[comms-notify][sse] forwarding event', { id: (data as any)?.id });
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller closed — client disconnected
          cleanup();
        }
      };

      // Subscribe to comms updates
      eventBus.on('comms-update', onUpdate);

      // Heartbeat every 15s — SSE comment line keeps connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // Enqueue failed — client disconnected
          cleanup();
        }
      }, 15_000);

      // Cleanup helper: unsubscribe + close stream. Idempotent.
      cleanup = () => {
        eventBus.off('comms-update', onUpdate);
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
      'Content-Type': 'text/event-stream',   // SSE MIME type
      'Cache-Control': 'no-cache, no-transform', // Prevent caching/buffering
      'Connection': 'keep-alive',             // Persistent connection
    },
  });
}
