"use client";

// =============================================
// useContainerWidth Hook
// =============================================
// Custom hook for measuring container width using ResizeObserver
// Used by workboard-grid.tsx for responsive grid sizing

import { useState, useEffect, type RefObject } from "react";

// =============================================
// Types
// =============================================

interface UseContainerWidthOptions {
  /** Ref to the container element to measure */
  ref: RefObject<HTMLDivElement | null>;
  /** Initial width before measurement (default: 0) */
  initialWidth?: number;
}

interface UseContainerWidthReturn {
  /** Current container width in pixels */
  width: number;
}

// =============================================
// Hook
// =============================================

/**
 * useContainerWidth - Measures container element width
 *
 * Uses ResizeObserver for efficient width tracking.
 * Returns width as 0 until the element is mounted and measured.
 *
 * @param options.ref - Ref to container element
 * @param options.initialWidth - Initial width before measurement
 * @returns Object with current width
 */
export function useContainerWidth({
  ref,
  initialWidth = 0,
}: UseContainerWidthOptions): UseContainerWidthReturn {
  const [width, setWidth] = useState<number>(initialWidth);

  useEffect(() => {
    // Get current element from ref
    const element = ref.current;
    if (!element) return;

    // Create ResizeObserver to track width changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use borderBoxSize for accurate measurement including padding
        const newWidth = entry.contentRect.width;
        setWidth(newWidth);
      }
    });

    // Start observing the element
    resizeObserver.observe(element);

    // Initial measurement
    setWidth(element.offsetWidth);

    // Cleanup on unmount
    return () => {
      resizeObserver.disconnect();
    };
  }, [ref]);

  return { width };
}
