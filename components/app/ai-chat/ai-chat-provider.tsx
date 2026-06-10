"use client";

// =============================================
// AI Chat Provider — simplified (no FAB/drag)
// =============================================
// Manages isOpen toggle + message history.
// FAB and popover removed — AI chat is now a
// fixed right-column pane toggled from the topbar.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { AIChatState, AIChatContextType, Message } from "@/types/ai-chat";
import { DEFAULT_AI_CHAT_STATE } from "@/types/ai-chat";

const AIChatContext = createContext<AIChatContextType | null>(null);

export function AIChatProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AIChatState>(DEFAULT_AI_CHAT_STATE);

  // Toggle the AI chat pane open/closed
  const toggleOpen = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: !prev.isOpen }));
  }, []);

  // Append a message with auto-generated id and timestamp
  const addMessage = useCallback((msg: Omit<Message, "id" | "timestamp">) => {
    setState((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        { ...msg, id: crypto.randomUUID(), timestamp: new Date() },
      ],
    }));
  }, []);

  // Reset unread badge count
  const clearUnread = useCallback(() => {
    setState((prev) => ({ ...prev, unreadCount: 0 }));
  }, []);

  // Increment unread badge (called when new AI message arrives while pane closed)
  const incrementUnread = useCallback(() => {
    setState((prev) => ({ ...prev, unreadCount: prev.unreadCount + 1 }));
  }, []);

  return (
    <AIChatContext.Provider
      value={{ state, toggleOpen, addMessage, clearUnread, incrementUnread }}
    >
      {children}
    </AIChatContext.Provider>
  );
}

export function useAIChat(): AIChatContextType {
  const ctx = useContext(AIChatContext);
  if (!ctx) throw new Error("useAIChat must be used within AIChatProvider");
  return ctx;
}
