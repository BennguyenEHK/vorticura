// types/ai-chat.ts
// =============================================
// AI Chat Type Definitions
// =============================================

// =============================================
// Message Types
// =============================================

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

// =============================================
// State Types
// =============================================

export interface AIChatState {
  isOpen: boolean;
  messages: Message[];
  unreadCount: number;
}

export interface AIChatContextType {
  state: AIChatState;
  toggleOpen: () => void;
  addMessage: (msg: Omit<Message, "id" | "timestamp">) => void;
  clearUnread: () => void;
  incrementUnread: () => void;
}

// =============================================
// Default State
// =============================================

export const DEFAULT_AI_CHAT_STATE: AIChatState = {
  isOpen: false,
  messages: [],
  unreadCount: 0,
};
