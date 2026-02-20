// =============================================
// EVENT BUS - In-Process Pub/Sub
// =============================================
// Singleton EventEmitter for real-time preview updates
// In production, replace with Redis Pub/Sub for multi-instance scaling
// Usage: eventBus.emit("preview-update", data) → SSE route streams to clients

import { EventEmitter } from 'events';

// Attach to globalThis to survive HMR in development
const globalForEvents = globalThis as unknown as { eventBus: EventEmitter };

/** Shared event bus instance (singleton via globalThis) */
export const eventBus = globalForEvents.eventBus ??= new EventEmitter();

// Allow up to 100 concurrent SSE listeners before Node warns
eventBus.setMaxListeners(100);
