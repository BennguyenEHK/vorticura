"use client";

// =============================================
// AI Chat Panel — right-column pane
// =============================================
// Rendered inside RightColumn when AI chat is open.
// Has its own header row with close button.
// No FAB docking — AI opens/closes from the topbar.

import { useRef, useEffect, useState } from "react";
import { Send, Bot, User, X, Sparkles } from "lucide-react";
import { useAIChat } from "./ai-chat-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AIChatPanel({ className = "" }: { className?: string }) {
  const { state: { messages }, addMessage, toggleOpen } = useAIChat();
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message within the panel (not the page)
  useEffect(() => {
    const container = messagesEndRef.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    addMessage({ role: "user", content: inputValue.trim() });
    setInputValue("");

    // Placeholder AI response (backend integration TBD)
    setTimeout(() => {
      addMessage({
        role: "assistant",
        content: "This is a placeholder response. AI integration coming soon.",
      });
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`flex flex-col h-full bg-vellum overflow-hidden ${className}`}>
      {/* Inline header — Sparkles icon + label + close button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-rule-strong flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-neon-cyan/70" strokeWidth={1.5} />
          <span className="micro-label text-ink">AI ASSISTANT</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={toggleOpen}
          aria-label="Close AI Assistant"
        >
          <X className="w-3 h-3" strokeWidth={1.5} />
        </Button>
      </div>

      {/* Message list — scrollable, fills remaining height */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full text-center gap-2">
            <Bot className="w-10 h-10 text-graphite/30" strokeWidth={1} />
            <p className="text-xs text-graphite">Ask anything about this quotation</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {/* Avatar dot */}
              <div
                className={`w-6 h-6 rounded-sm flex items-center justify-center flex-shrink-0 ${
                  message.role === "user"
                    ? "bg-azimuth text-paper"
                    : "bg-neon-cyan/10 text-neon-cyan"
                }`}
              >
                {message.role === "user" ? (
                  <User className="w-3 h-3" />
                ) : (
                  <Bot className="w-3 h-3" />
                )}
              </div>

              {/* Message bubble */}
              <div
                className={`max-w-[82%] px-3 py-1.5 rounded-sm text-xs leading-relaxed ${
                  message.role === "user"
                    ? "bg-azimuth text-paper"
                    : "bg-paper border border-rule text-ink"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <span className="text-[10px] opacity-50 mt-0.5 block">
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

      {/* Input footer */}
      <div className="p-3 border-t border-rule-strong flex-shrink-0">
        <div className="flex gap-1.5">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything…"
            className="flex-1 h-8 text-xs"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            aria-label="Send message"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
