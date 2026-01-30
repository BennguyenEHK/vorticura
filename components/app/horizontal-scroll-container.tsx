"use client";

// =============================================
// Horizontal Scroll Container
// =============================================
// Wrapper component that provides horizontal scroll buttons
// when content overflows on narrow viewports

import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================
// Types
// =============================================

interface HorizontalScrollContainerProps {
  children: ReactNode;
  className?: string;
  scrollAmount?: number; // Pixels to scroll per click
}

// =============================================
// Component
// =============================================

/**
 * HorizontalScrollContainer - Adds scroll buttons for horizontal overflow
 * Features:
 * - Detects horizontal overflow automatically
 * - Shows left/right scroll buttons when content overflows
 * - Smooth scrolling animation
 * - Buttons appear/disappear based on scroll position
 */
export function HorizontalScrollContainer({
  children,
  className = "",
  scrollAmount = 300,
}: HorizontalScrollContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check scroll position and update button visibility
  const checkScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;

    // Can scroll left if not at the start
    setCanScrollLeft(scrollLeft > 0);

    // Can scroll right if not at the end (with 1px tolerance)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  // Set up scroll and resize listeners
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    // Initial check
    checkScroll();

    // Listen to scroll events
    container.addEventListener("scroll", checkScroll);

    // Listen to resize events (window and container)
    window.addEventListener("resize", checkScroll);

    // Use ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll]);

  // Scroll left handler
  const scrollLeftHandler = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.scrollBy({
      left: -scrollAmount,
      behavior: "smooth",
    });
  }, [scrollAmount]);

  // Scroll right handler
  const scrollRightHandler = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.scrollBy({
      left: scrollAmount,
      behavior: "smooth",
    });
  }, [scrollAmount]);

  // Check if any scroll button should be shown
  const showScrollButtons = canScrollLeft || canScrollRight;

  return (
    <div className={`relative ${className}`}>
      {/* Scroll Left Button */}
      {showScrollButtons && canScrollLeft && (
        <Button
          variant="secondary"
          size="icon"
          onClick={scrollLeftHandler}
          className="
            absolute left-2 top-1/2 -translate-y-1/2 z-20
            h-10 w-10 rounded-full
            bg-background/90 backdrop-blur-sm
            shadow-lg border border-border
            hover:bg-accent
            transition-opacity duration-200
          "
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      )}

      {/* Scroll Right Button */}
      {showScrollButtons && canScrollRight && (
        <Button
          variant="secondary"
          size="icon"
          onClick={scrollRightHandler}
          className="
            absolute right-2 top-1/2 -translate-y-1/2 z-20
            h-10 w-10 rounded-full
            bg-background/90 backdrop-blur-sm
            shadow-lg border border-border
            hover:bg-accent
            transition-opacity duration-200
          "
          aria-label="Scroll right"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      )}

      {/* Scrollable Content Container */}
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
      >
        {children}
      </div>
    </div>
  );
}
