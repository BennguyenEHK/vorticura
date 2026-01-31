"use client";

// =============================================
// Preview Panel Content
// =============================================
// Content component for the quotation preview panel
// Shows a live preview with approval workflow:
// - Header: Edit, Revert, Download buttons
// - Content: Selectable text with inline "Add Note" tooltip
// - Footer: General feedback, Notes counter, Regenerate, Approve

import { useState, useCallback, useRef, useEffect } from "react";
import {
  FileText,
  Download,
  Edit,
  RotateCcw,
  MessageSquarePlus,
  Check,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================
// Types
// =============================================

/** Represents an inline feedback note on selected text */
interface InlineNote {
  id: string;
  selectedText: string;  // The text user selected
  note: string;          // User's feedback/comment
  timestamp: Date;
}

/** Selection position for tooltip placement */
interface SelectionPosition {
  top: number;
  left: number;
}

// =============================================
// Mock Data
// =============================================

// Placeholder quotation data
const quotationData = {
  id: "Q-2024-001",
  version: 2,  // Current version number
  customer: "Acme Corporation",
  date: "January 29, 2026",
  items: [
    { name: "Industrial Bearings", qty: 500, price: 15.5 },
    { name: "Hydraulic Seals", qty: 200, price: 8.25 },
    { name: "Steel Plates", qty: 50, price: 120.0 },
  ],
  subtotal: 15175,
  tax: 1062.25,
  total: 16237.25,
};

// =============================================
// Helper: Generate unique ID
// =============================================
const generateId = () => Math.random().toString(36).substring(2, 9);

// =============================================
// Content Component
// =============================================

interface PreviewPanelContentProps {
  className?: string;
}

/**
 * PreviewPanelContent - Quotation preview with approval workflow
 * Features:
 * - Inline text selection for contextual feedback
 * - General feedback input for overall comments
 * - Regenerate button (acts as implicit reject)
 * - Approve button for finalizing content
 * - Revert to previous version
 */
export function PreviewPanelContent({
  className = "",
}: PreviewPanelContentProps) {
  // =============================================
  // State
  // =============================================

  // Inline notes from text selection
  const [inlineNotes, setInlineNotes] = useState<InlineNote[]>([]);

  // General feedback textarea content
  const [generalFeedback, setGeneralFeedback] = useState("");

  // Feedback section expanded state
  const [isFeedbackExpanded, setIsFeedbackExpanded] = useState(false);

  // Text selection state for floating tooltip
  const [selection, setSelection] = useState<{
    text: string;
    position: SelectionPosition;
  } | null>(null);

  // Note input for selected text
  const [noteInput, setNoteInput] = useState("");

  // Show note input popover
  const [showNotePopover, setShowNotePopover] = useState(false);

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  // =============================================
  // Computed Values
  // =============================================

  // Check if there's any feedback to send
  const hasFeedback = inlineNotes.length > 0 || generalFeedback.trim().length > 0;

  // Total notes count for badge
  const totalNotesCount = inlineNotes.length + (generalFeedback.trim() ? 1 : 0);

  // =============================================
  // Text Selection Handler
  // =============================================

  const handleTextSelection = useCallback(() => {
    const windowSelection = window.getSelection();
    const selectedText = windowSelection?.toString().trim();

    // Early return if no text selected or content ref not available
    if (!selectedText || selectedText.length === 0 || !contentRef.current) {
      if (!showNotePopover) setSelection(null);
      return;
    }

    // IMPORTANT: Verify selection is actually inside the content area
    const anchorNode = windowSelection?.anchorNode;
    if (!anchorNode || !contentRef.current.contains(anchorNode)) {
      if (!showNotePopover) setSelection(null);
      return;
    }

    const range = windowSelection?.getRangeAt(0);
    if (!range) return;

    const rect = range.getBoundingClientRect();
    const contentRect = contentRef.current.getBoundingClientRect();

    // Tooltip dimensions for positioning calculations
    const TOOLTIP_HEIGHT = 40;
    const TOOLTIP_WIDTH = 110;
    const PADDING = 8;

    // Calculate vertical position: BELOW if not enough space above, otherwise ABOVE
    const spaceAbove = rect.top - contentRect.top;
    const top = spaceAbove > TOOLTIP_HEIGHT + PADDING
      ? rect.top - contentRect.top - TOOLTIP_HEIGHT - PADDING  // Position above selection
      : rect.bottom - contentRect.top + PADDING;               // Position below selection

    // Calculate horizontal position: center on selection, clamped within bounds
    const left = Math.max(
      PADDING,  // Minimum padding from left edge
      Math.min(
        rect.left - contentRect.left + (rect.width / 2) - (TOOLTIP_WIDTH / 2),
        contentRect.width - TOOLTIP_WIDTH - PADDING  // Maximum from right edge
      )
    );

    setSelection({ text: selectedText, position: { top, left } });
  }, [showNotePopover]);

  // Listen for text selection changes - scoped to content area only
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;

    // Add listener to content element instead of document for better scoping
    contentEl.addEventListener("mouseup", handleTextSelection);
    return () => contentEl.removeEventListener("mouseup", handleTextSelection);
  }, [handleTextSelection]);

  // Focus note input when popover opens
  useEffect(() => {
    if (showNotePopover && noteInputRef.current) {
      noteInputRef.current.focus();
    }
  }, [showNotePopover]);

  // =============================================
  // Action Handlers
  // =============================================

  /** Open note popover for selected text */
  const handleAddNote = () => {
    setShowNotePopover(true);
  };

  /** Save inline note */
  const handleSaveNote = () => {
    if (selection && noteInput.trim()) {
      const newNote: InlineNote = {
        id: generateId(),
        selectedText: selection.text,
        note: noteInput.trim(),
        timestamp: new Date(),
      };
      setInlineNotes((prev) => [...prev, newNote]);

      // Reset states
      setNoteInput("");
      setShowNotePopover(false);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  /** Cancel note input */
  const handleCancelNote = () => {
    setNoteInput("");
    setShowNotePopover(false);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  /** Remove an inline note */
  const handleRemoveNote = (id: string) => {
    setInlineNotes((prev) => prev.filter((note) => note.id !== id));
  };

  /** Handle Regenerate (send feedback to AI) */
  const handleRegenerate = () => {
    // TODO: Integrate with AI service
    console.log("Regenerating with feedback:", {
      inlineNotes,
      generalFeedback,
    });

    // Clear feedback after submission
    setInlineNotes([]);
    setGeneralFeedback("");
    setIsFeedbackExpanded(false);
  };

  /** Handle Approve */
  const handleApprove = () => {
    // TODO: Integrate with approval workflow
    console.log("Approved quotation:", quotationData.id);
  };

  /** Handle Revert */
  const handleRevert = () => {
    // TODO: Integrate with version history
    console.log("Reverting to previous version");
  };

  // =============================================
  // Render
  // =============================================

  return (
    <div className={`p-4 h-full flex flex-col ${className}`}>
      {/* =============================================
       * HEADER: Title + Version + Actions (Edit, Revert, Download)
       * ============================================= */}
      <div className="flex items-center justify-between mb-4">
        {/* Title and version badge */}
        <div className="flex items-center gap-2">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              Quotation Preview
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select text to add feedback
            </p>
          </div>
          {/* Version badge */}
          <span className="px-2 py-0.5 text-xs font-medium bg-brand-muted text-brand-dark rounded-md">
            v{quotationData.version}
          </span>
        </div>

        {/* Header action buttons */}
        <div className="flex items-center gap-1">
          {/* Edit button - RETAINED as requested */}
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Edit className="w-3.5 h-3.5" />
          </Button>

          {/* Revert button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleRevert}
            title="Revert to previous version"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>

          {/* Download button */}
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Download className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* =============================================
       * CONTENT: Selectable document preview
       * ============================================= */}
      <div
        ref={contentRef}
        className="flex-1 overflow-auto bg-background border border-border rounded-lg p-4 shadow-inner relative select-text"
      >
        {/* Floating "Add Note" tooltip on text selection */}
        {selection && !showNotePopover && (
          <div
            className="absolute z-10 animate-in fade-in-0 zoom-in-95 duration-150"
            style={{
              top: Math.max(0, selection.position.top),
              left: Math.max(0, selection.position.left),
            }}
          >
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-primary text-primary-foreground shadow-lg"
              onClick={handleAddNote}
              onMouseUp={(e) => e.stopPropagation()} // Prevent mouseup from bubbling to contentRef and clearing selection
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Add Note
            </Button>
          </div>
        )}

        {/* Note input popover - stopPropagation prevents mouseup from interfering */}
        {showNotePopover && selection && (
          <div
            className="absolute z-20 w-64 bg-popover border border-border rounded-lg shadow-xl p-3 animate-in fade-in-0 zoom-in-95 duration-150"
            style={{
              top: Math.max(0, selection.position.top),
              left: Math.max(0, Math.min(selection.position.left, 200)),
            }}
            onMouseUp={(e) => e.stopPropagation()} // Prevent clicks inside popover from triggering handleTextSelection
          >
            {/* Selected text preview */}
            <div className="mb-2">
              <p className="text-xs text-muted-foreground mb-1">Selected:</p>
              <p className="text-xs text-foreground bg-brand-muted/50 px-2 py-1 rounded border-l-2 border-brand truncate">
                "{selection.text.substring(0, 50)}{selection.text.length > 50 ? '...' : ''}"
              </p>
            </div>

            {/* Note textarea */}
            <textarea
              ref={noteInputRef}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Your feedback..."
              className="w-full h-16 px-2 py-1.5 text-xs bg-card border border-border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-placeholder"
            />

            {/* Actions - stopPropagation prevents mouseup from clearing selection */}
            <div className="flex justify-end gap-1.5 mt-2" onMouseUp={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleCancelNote}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleSaveNote}
                disabled={!noteInput.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Document header */}
        <div className="text-center border-b border-border pb-3 mb-4">
          <FileText className="w-8 h-8 mx-auto text-brand mb-2" />
          <h4 className="text-lg font-bold text-foreground">QUOTATION</h4>
          <p className="text-xs text-muted-foreground">
            {quotationData.id} | {quotationData.date}
          </p>
        </div>

        {/* Customer info */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground">Bill To:</p>
          <p className="text-sm font-medium text-foreground">
            {quotationData.customer}
          </p>
        </div>

        {/* Items table */}
        <div className="mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1 text-muted-foreground font-medium">
                  Item
                </th>
                <th className="text-center py-1 text-muted-foreground font-medium">
                  Qty
                </th>
                <th className="text-right py-1 text-muted-foreground font-medium">
                  Price
                </th>
                <th className="text-right py-1 text-muted-foreground font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {quotationData.items.map((item, index) => (
                <tr key={index} className="border-b border-border/50">
                  <td className="py-2 text-foreground">{item.name}</td>
                  <td className="py-2 text-center text-foreground">
                    {item.qty}
                  </td>
                  <td className="py-2 text-right text-foreground">
                    ${item.price.toFixed(2)}
                  </td>
                  <td className="py-2 text-right text-foreground">
                    ${(item.qty * item.price).toLocaleString('en-US')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal:</span>
            <span className="text-foreground">
              ${quotationData.subtotal.toLocaleString('en-US')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax (7%):</span>
            <span className="text-foreground">
              ${quotationData.tax.toLocaleString('en-US')}
            </span>
          </div>
          <div className="flex justify-between pt-2 border-t border-border font-bold">
            <span className="text-foreground">TOTAL:</span>
            <span className="text-foreground text-base">
              ${quotationData.total.toLocaleString('en-US')}
            </span>
          </div>
        </div>
      </div>

      {/* =============================================
       * FOOTER: Feedback section + Actions
       * ============================================= */}
      <div className="mt-3 space-y-3">
        {/* Collapsible feedback section */}
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Toggle header */}
          <button
            className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted transition-colors"
            onClick={() => setIsFeedbackExpanded(!isFeedbackExpanded)}
          >
            <span className="text-xs font-medium text-foreground flex items-center gap-2">
              <MessageSquarePlus className="w-3.5 h-3.5 text-muted-foreground" />
              General Feedback
              {totalNotesCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-brand text-brand-foreground rounded-full min-w-[1.25rem] text-center">
                  {totalNotesCount}
                </span>
              )}
            </span>
            {isFeedbackExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {/* Expanded content */}
          {isFeedbackExpanded && (
            <div className="p-3 border-t border-border bg-card space-y-3">
              {/* Inline notes list */}
              {inlineNotes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Inline Notes ({inlineNotes.length})
                  </p>
                  {inlineNotes.map((note) => (
                    <div
                      key={note.id}
                      className="flex items-start gap-2 p-2 bg-muted/50 rounded-md border-l-2 border-brand"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">
                          "{note.selectedText.substring(0, 30)}..."
                        </p>
                        <p className="text-xs text-foreground mt-0.5">
                          {note.note}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0"
                        onClick={() => handleRemoveNote(note.id)}
                      >
                        <X className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* General feedback textarea */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  Overall Comments
                </p>
                <textarea
                  value={generalFeedback}
                  onChange={(e) => setGeneralFeedback(e.target.value)}
                  placeholder="Add general feedback for the AI to consider..."
                  className="w-full h-20 px-3 py-2 text-xs bg-card border border-border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-placeholder"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Notes counter badge (only shows when collapsed and has notes) */}
          {!isFeedbackExpanded && totalNotesCount > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MessageSquarePlus className="w-3.5 h-3.5" />
              {totalNotesCount} note{totalNotesCount > 1 ? 's' : ''}
            </span>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Regenerate button - only enabled when there's feedback */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={!hasFeedback}
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </Button>

          {/* Approve button - uses success token */}
          <Button
            size="sm"
            onClick={handleApprove}
            className="gap-1.5 bg-success text-success-foreground hover:bg-success-hover"
          >
            <Check className="w-3.5 h-3.5" />
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
