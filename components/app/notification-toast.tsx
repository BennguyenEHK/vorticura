"use client";
// =============================================
// Notification Toast — Mission Control instrument readout
// =============================================
// Shown when a new email arrives via Pub/Sub. Auto-dismisses after 5s.
// All state transitions are console.logged with [comms-notify] prefix.

import { useEffect, useState } from "react";
import { Mail, X } from "lucide-react";
import type { CommsNotification } from "@/hooks/use-comms-sse";

interface NotificationToastProps {
  notification: CommsNotification;
  onDismiss: (id: string) => void;
}

export function NotificationToast({ notification, onDismiss }: NotificationToastProps) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    console.log('[comms-notify][toast] mount', { id: notification.id, fromEmail: notification.fromEmail });

    // Progress bar drains over 5s — 50 ticks at 100ms = 5000ms total
    const interval = setInterval(() => {
      setProgress((p) => Math.max(0, p - 2));
    }, 100);

    const timeout = setTimeout(() => {
      console.log('[comms-notify][toast] auto-dismiss', { id: notification.id });
      onDismiss(notification.id);
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [notification.id, notification.fromEmail, onDismiss]);

  // Format ISO timestamp to HH:MM:SS UTC for instrument-readout feel
  const time = new Date(notification.timestamp).toISOString().slice(11, 19) + " UTC";
  const displayName = notification.fromName?.trim() || notification.fromEmail;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="relative w-[360px] bg-paper border border-rule-strong rounded-sm overflow-hidden shadow-[0_8px_24px_-12px_rgba(11,14,20,0.18)] animate-in slide-in-from-right-5 fade-in duration-200"
    >
      {/* Azimuth accent strip — instrument status indicator */}
      <div className="absolute left-0 top-0 bottom-[2px] w-[3px] bg-azimuth" aria-hidden="true" />

      {/* Manual dismiss */}
      <button
        type="button"
        onClick={() => {
          console.log('[comms-notify][toast] manual-dismiss', { id: notification.id });
          onDismiss(notification.id);
        }}
        className="absolute top-2 right-2 p-1 text-graphite/60 hover:text-ink transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="h-3 w-3" />
      </button>

      {/* Body */}
      <div className="pl-5 pr-8 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="h-3 w-3 text-azimuth" aria-hidden="true" />
          <span className="micro-label text-azimuth">INCOMING · NEW MAIL</span>
        </div>
        <p className="font-display text-ink text-[15px] leading-tight truncate">
          {displayName}
        </p>
        <p className="font-body text-graphite text-sm truncate mt-0.5">
          {notification.subject}
        </p>
        <p className="font-data text-[10px] text-graphite/60 tracking-wider mt-1.5 truncate">
          {time}
        </p>
      </div>

      {/* Progress drain bar */}
      <div className="h-[2px] w-full bg-rule">
        <div
          className="h-full bg-azimuth/60 transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
