// =============================================
// SSE PREVIEW STREAM - Server-Sent Events Route
// =============================================
// Streams real-time preview updates to connected clients
// Uses in-process EventEmitter (lib/event-bus.ts)
// Future: swap eventBus for Redis Pub/Sub subscriber

import { eventBus } from '@/lib/event-bus';
import type { ProcessorResult } from '@/lib/data-processor';

// Disable static optimization — SSE must be dynamic
export const dynamic = 'force-dynamic';

/**
 * GET /api/preview-stream
 * Opens a persistent SSE connection that forwards "preview-update" events
 * Includes 15s heartbeat to detect client disconnects
 */
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Forward event bus messages as SSE data frames
      const onUpdate = (data: ProcessorResult) => {
        try {
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

      // Cleanup helper: unsubscribe + close stream
      const cleanup = () => {
        eventBus.off('preview-update', onUpdate);
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      };

      // Heartbeat every 15s — SSE comment line keeps connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // Enqueue failed — client disconnected
          cleanup();
        }
      }, 15_000);
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
