"use client";

// =============================================
// AI Chat Panel (Docked Mode)
// =============================================
// Full chat panel for when AI Chat is docked in Workboard
// Shares message history with popover via context

import { useRef, useEffect, useState } from "react";
import { Send, Bot, User, Minimize2 } from "lucide-react";
import { useAIChat } from "./ai-chat-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// =============================================
// Panel Component
// =============================================

interface AIChatPanelProps {
  className?: string;
}

/**
 * AIChatPanel - Full chat panel for workboard integration
 * Features:
 * - Full-height message list
 * - Undock button to return to FAB mode
 * - Shares state with popover
 */
export function AIChatPanel({ className = "" }: AIChatPanelProps) {
  // Get AI Chat state and actions from context
  const { messages, addMessage, setDocked } = useAIChat();

  // Local state for input field
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Handle sending a message
  const handleSend = () => {
    if (!inputValue.trim()) return;

    // Add user message
    addMessage({
      role: "user",
      content: inputValue.trim(),
    });

    // Clear input
    setInputValue("");

    // Simulate AI response (placeholder - no backend)
    setTimeout(() => {
      addMessage({
        role: "assistant",
        content:
          "This is a placeholder response. AI integration will be implemented later.",
      });
    }, 1000);
  };

  // Handle enter key to send
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle undock (return to FAB mode)
  const handleUndock = () => {
    setDocked(false);
  };

  return (
    <div
      className={`
        flex flex-col h-full
        bg-card rounded-lg border border-border
        overflow-hidden
        ${className}
      `}
    >
      {/* Messages area - takes remaining height */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="w-16 h-16 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              Start a conversation with AI
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Ask questions about your quotation, request changes, or get help
              with pricing
            </p>
          </div>
        ) : (
          // Message list
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              {/* Avatar */}
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                  ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-brand/10 text-brand"
                  }
                `}
              >
                {message.role === "user" ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>

              {/* Message bubble */}
              <div
                className={`
                  max-w-[80%] px-4 py-2 rounded-lg
                  ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }
                `}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <span className="text-xs opacity-60 mt-1 block">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))
        )}
        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            aria-label="Send message"
          >
            <Send className="w-4 h-4 mr-2" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
