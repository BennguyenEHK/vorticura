"use client";
// Subscribes to /api/comms-stream and invokes a callback for each incoming notification.

import { useEffect } from 'react';

export interface CommsNotification {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  preview: string;
  timestamp: number;
}

export function useCommsSSE(onNotification: (n: CommsNotification) => void) {
  useEffect(() => {
    const es = new EventSource('/api/comms-stream');
    console.log('[comms-notify][hook] connecting to /api/comms-stream');

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as CommsNotification;
        console.log('[comms-notify][hook] received', { id: data.id, fromEmail: data.fromEmail, subject: data.subject });
        onNotification(data);
      } catch (err) {
        console.error('[comms-notify][hook] parse error', err);
      }
    };

    es.onerror = () => {
      console.warn('[comms-notify][hook] connection error — EventSource will auto-reconnect');
    };

    return () => {
      console.log('[comms-notify][hook] closing connection');
      es.close();
    };
  }, [onNotification]);
}
