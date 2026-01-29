"use client";

// =============================================
// AI Chat Provider
// =============================================
// Context provider for AI Chat state management
// Handles FAB position, popover visibility, docked state

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type {
  AIChatState,
  AIChatContextType,
  Message,
  Position,
} from "@/types/ai-chat";
import {
  DEFAULT_AI_CHAT_STATE,
  DEFAULT_FAB_CONFIG,
} from "@/types/ai-chat";
import { AI_CHAT_POSITION_STORAGE_KEY } from "@/types/workboard";

// =============================================
// Context
// =============================================

/** AI Chat context with state and actions */
const AIChatContext = createContext<AIChatContextType | null>(null);

// =============================================
// Provider Component
// =============================================

interface AIChatProviderProps {
  children: ReactNode;
}

/**
 * AIChatProvider - Context provider for AI Chat state
 * Manages: popover visibility, docked state, FAB position, messages
 */
export function AIChatProvider({ children }: AIChatProviderProps) {
  // Initialize state with defaults
  const [state, setState] = useState<AIChatState>(DEFAULT_AI_CHAT_STATE);

  // Load saved position from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPosition = localStorage.getItem(AI_CHAT_POSITION_STORAGE_KEY);
      if (savedPosition) {
        try {
          const parsed = JSON.parse(savedPosition);
          setState((prev) => ({
            ...prev,
            position: parsed.position || prev.position,
            positionPreset: parsed.positionPreset || prev.positionPreset,
          }));
        } catch (e) {
          // Invalid JSON, ignore and use defaults
          console.warn("Failed to parse saved AI Chat position");
        }
      }
    }
  }, []);

  // Save position to localStorage when it changes
  useEffect(() => {
    if (typeof window !== "undefined" && state.positionPreset === "custom") {
      localStorage.setItem(
        AI_CHAT_POSITION_STORAGE_KEY,
        JSON.stringify({
          position: state.position,
          positionPreset: state.positionPreset,
        })
      );
    }
  }, [state.position, state.positionPreset]);

  // =============================================
  // Actions
  // =============================================

  /** Toggle popover open/closed */
  const togglePopover = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isPopoverOpen: !prev.isPopoverOpen,
      // Clear unread when opening popover
      unreadCount: prev.isPopoverOpen ? prev.unreadCount : 0,
    }));
  }, []);

  /** Set docked state (in workboard grid) */
  const setDocked = useCallback((docked: boolean) => {
    setState((prev) => ({
      ...prev,
      isDocked: docked,
      // Close popover when docking
      isPopoverOpen: docked ? false : prev.isPopoverOpen,
    }));
  }, []);

  /** Set dragging state */
  const setDragging = useCallback((dragging: boolean) => {
    setState((prev) => ({
      ...prev,
      isDragging: dragging,
      // Close popover when starting drag
      isPopoverOpen: dragging ? false : prev.isPopoverOpen,
    }));
  }, []);

  /** Update FAB position */
  const setPosition = useCallback((position: Position) => {
    setState((prev) => ({
      ...prev,
      position,
      positionPreset: "custom", // Switch to custom when manually positioned
    }));
  }, []);

  /** Add a new message to chat history */
  const addMessage = useCallback(
    (message: Omit<Message, "id" | "timestamp">) => {
      const newMessage: Message = {
        ...message,
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: new Date(),
      };
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, newMessage],
      }));
    },
    []
  );

  /** Clear unread message count */
  const clearUnread = useCallback(() => {
    setState((prev) => ({
      ...prev,
      unreadCount: 0,
    }));
  }, []);

  /** Increment unread message count */
  const incrementUnread = useCallback(() => {
    setState((prev) => ({
      ...prev,
      unreadCount: prev.unreadCount + 1,
    }));
  }, []);

  // =============================================
  // Context Value
  // =============================================

  const contextValue: AIChatContextType = {
    ...state,
    togglePopover,
    setDocked,
    setDragging,
    setPosition,
    addMessage,
    clearUnread,
    incrementUnread,
  };

  return (
    <AIChatContext.Provider value={contextValue}>
      {children}
    </AIChatContext.Provider>
  );
}

// =============================================
// Hook
// =============================================

/**
 * useAIChat - Hook to access AI Chat context
 * Must be used within AIChatProvider
 */
export function useAIChat(): AIChatContextType {
  const context = useContext(AIChatContext);
  if (!context) {
    throw new Error("useAIChat must be used within an AIChatProvider");
  }
  return context;
}
