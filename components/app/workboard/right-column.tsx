"use client";

// =============================================
// RightColumn — AI chat + pricing vertical stack
// =============================================
// - AI chat pane: top portion (1/3 default) when both open
// - Pricing pane: bottom portion (2/3 default) when both open
// - Either expands to full height when the other is closed
// - Vertical ResizeHandle allows adjusting the split

import { useCallback, useRef } from "react";
import { useAIChat } from "@/components/app/ai-chat/ai-chat-provider";
import { useWorkboard } from "./workboard-provider";
import { useRFQContext } from "@/hooks/rfq-context";
import { AIChatPanel } from "@/components/app/ai-chat/ai-chat-panel";
import { PricingPanelContent } from "./panels/pricing-panel-content";
import { ResizeHandle } from "./resize-handle";

export function RightColumn() {
  const { state: aiChat } = useAIChat();
  const { pricingOpen, aiChatHeightPercent, setAIChatHeight } = useWorkboard();
  const rfqCtx = useRFQContext();                   // null outside workspace pages
  const activeRfqId = rfqCtx?.rfqId;
  const containerRef = useRef<HTMLDivElement>(null);

  const bothOpen = aiChat.isOpen && pricingOpen;

  // Convert pixel drag delta to percentage of container height
  const handleVerticalResize = useCallback(
    (deltaPx: number) => {
      if (!containerRef.current) return;
      const containerHeight = containerRef.current.offsetHeight;
      const deltaPct = (deltaPx / containerHeight) * 100;
      setAIChatHeight((prev) => prev + deltaPct);
    },
    [setAIChatHeight]
  );

  // Nothing to render if both panes are closed
  if (!aiChat.isOpen && !pricingOpen) return null;

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full overflow-hidden border-l border-rule-strong"
    >
      {/* AI Chat pane — top */}
      {aiChat.isOpen && (
        <div
          style={{ height: bothOpen ? `${aiChatHeightPercent}%` : "100%" }}
          className="flex flex-col overflow-hidden min-h-0 flex-shrink-0"
        >
          <AIChatPanel />
        </div>
      )}

      {/* Vertical resize handle — only when both panes are open */}
      {bothOpen && (
        <ResizeHandle direction="vertical" onResize={handleVerticalResize} />
      )}

      {/* Pricing pane — bottom */}
      {pricingOpen && (
        <div
          style={{
            height: bothOpen ? `${100 - aiChatHeightPercent}%` : "100%",
          }}
          className="flex flex-col overflow-hidden min-h-0 flex-1"
        >
          <PricingPanelContent rfqId={activeRfqId} />
        </div>
      )}
    </div>
  );
}
