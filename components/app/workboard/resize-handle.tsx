"use client";

// =============================================
// ResizeHandle — draggable panel divider
// =============================================

import { useCallback, useRef } from "react";

interface ResizeHandleProps {
  direction: "horizontal" | "vertical";
  onResize: (deltaPx: number) => void; // pixel delta on each mouse move
  className?: string;
}

export function ResizeHandle({ direction, onResize, className = "" }: ResizeHandleProps) {
  const isDragging = useRef(false);
  const lastPos = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      lastPos.current = direction === "horizontal" ? e.clientX : e.clientY;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const current = direction === "horizontal" ? ev.clientX : ev.clientY;
        const delta = current - lastPos.current;
        lastPos.current = current;
        onResize(delta);
      };

      const onMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [direction, onResize]
  );

  const isH = direction === "horizontal";

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`
        flex-shrink-0 group relative
        ${isH ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize"}
        bg-transparent
        hover:bg-neon-cyan/15 active:bg-neon-cyan/35
        transition-colors duration-100
        ${className}
      `}
      aria-hidden="true"
    >
      {/* Three grip dots centered on the divider */}
      <div
        className={`
          absolute inset-0 flex items-center justify-center
          ${isH ? "flex-col gap-[3px]" : "flex-row gap-[3px]"}
          opacity-0 group-hover:opacity-60 transition-opacity duration-150
        `}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-[3px] h-[3px] rounded-full bg-graphite" />
        ))}
      </div>
    </div>
  );
}
