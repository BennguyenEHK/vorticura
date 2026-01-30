"use client";

// =============================================
// AI Chat Popover
// =============================================
// Small side chatbox that opens when FAB is clicked
// Notion-style popover anchored to FAB position

import { useRef, useEffect, useState } from "react";
import { X, Send, Bot, User } from "lucide-react";
import { useAIChat } from "./ai-chat-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// =============================================
// Popover Component
// =============================================

/**
 * AIChatPopover - Side chatbox UI
 * Features:
 * - Message list with AI/User distinction
 * - Input field for sending messages
 * - Close button to dismiss
 * - Scale animation from FAB origin
 */
export function AIChatPopover() {
  // Get AI Chat state and actions from context
  const { isPopoverOpen, isDocked, messages, addMessage, togglePopover } =
    useAIChat();

  // Local state for input field
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive (container-scoped, not page)
  useEffect(() => {
    const container = messagesEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // Don't render if not open or if docked
  if (!isPopoverOpen || isDocked) {
    return null;
  }

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

  return (
    <div
      className={`
        fixed bottom-20 right-6 z-50
        w-80 h-96
        bg-card border border-border
        rounded-2xl shadow-xl
        flex flex-col
        overflow-hidden
        animate-in zoom-in-95 fade-in-0
        duration-200
        origin-bottom-right
      `}
      role="dialog"
      aria-label="AI Chat"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-brand" />
          </div>
          <span className="font-medium text-foreground">AI Assistant</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePopover}
          className="h-8 w-8"
          aria-label="Close chat"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="w-12 h-12 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              Start a conversation with AI
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Ask questions about your quotation
            </p>
          </div>
        ) : (
          // Message list
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${
                message.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              {/* Avatar */}
              <div
                className={`
                  w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
                  ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-brand/10 text-brand"
                  }
                `}
              >
                {message.role === "user" ? (
                  <User className="w-3 h-3" />
                ) : (
                  <Bot className="w-3 h-3" />
                )}
              </div>

              {/* Message bubble */}
              <div
                className={`
                  max-w-[75%] px-3 py-2 rounded-lg text-sm
                  ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }
                `}
              >
                {message.content}
              </div>
            </div>
          ))
        )}
        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-border">
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
            size="icon"
            disabled={!inputValue.trim()}
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
