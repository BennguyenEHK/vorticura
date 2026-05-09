// =============================================
// SSE RFQ QUEUE STREAM - Server-Sent Events Route
// =============================================
// Streams real-time sidebar-queue upserts to connected clients.
// Uses the same in-process EventEmitter (lib/event-bus.ts) as preview-stream.
// Channel: 'rfq-queue' — payload shape: QueuedRFQ (full row).

import { eventBus } from '@/lib/event-bus';
import type { QueuedRFQ } from '@/types/rfq-queue';
import { randomUUID } from 'crypto';

// Disable static optimization — SSE must be dynamic (long-lived response)
export const dynamic = 'force-dynamic';
// Pin to Node.js — Edge runtime can't run ioredis (requires raw TCP)
export const runtime = 'nodejs';
// Maximize streaming function lifetime so SSE clients reconnect less often
// (each reconnect is a window where Redis Pub/Sub events can be missed).
export const maxDuration = 300;

/**
 * GET /api/rfq-queue-stream
 * Opens a persistent SSE connection that forwards 'rfq-queue' events
 * as `data: {QueuedRFQ JSON}\n\n` frames. 15s heartbeat keeps the
 * connection open behind proxies that buffer idle sockets.
 */
export async function GET() {
  const encoder = new TextEncoder();
  const connId = randomUUID().slice(0, 8);

  const stream = new ReadableStream({
    start(controller) {
      console.log(`[sse:rfq-queue ${connId}] subscribed`);
      // Forward event bus messages as SSE data frames
      const onUpdate = (data: QueuedRFQ) => {
        console.log(`[sse:rfq-queue ${connId}] frame rfqId=${data.rfqId} companyId=${data.companyId}`);
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller closed — client disconnected
          cleanup();
        }
      };

      // Subscribe to rfq-queue channel (emitted by lib/services/rfq-queue/queue-manager:emitQueuedRFQs)
      eventBus.on('rfq-queue', onUpdate);

      // Cleanup helper: unsubscribe + close stream (idempotent — safe to call twice)
      const cleanup = () => {
        console.log(`[sse:rfq-queue ${connId}] cleanup`);
        eventBus.off('rfq-queue', onUpdate);
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      };

      // Heartbeat every 15s — SSE comment line keeps connection alive through proxies
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
      'Content-Type': 'text/event-stream',        // SSE MIME type
      'Cache-Control': 'no-cache, no-transform',  // Prevent caching/buffering
      'Connection': 'keep-alive',                 // Persistent connection
      // Tell Vercel/Nginx-style proxies NOT to buffer the streamed body —
      // without this, chunks can be held until the buffer fills or the
      // connection ends, defeating the point of SSE.
      'X-Accel-Buffering': 'no',
    },
  });
}
