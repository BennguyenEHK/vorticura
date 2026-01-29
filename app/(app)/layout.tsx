"use client";

// =============================================
// App Layout - Dashboard & Workspace
// =============================================
// Shared layout for all authenticated app pages (dashboard, workspace)
// Includes: Topbar, Sidebar, AI Chat FAB, and dynamic main content area

// Import sidebar and topbar from components/app folder
import { DashboardSidebar } from "@/components/app/sidebar";
import { DashboardTopBar } from "@/components/app/topbar";
import {
  SidebarProvider,
  useSidebar,
  MAIN_MARGIN_CLASSES,
} from "@/components/app/sidebar-provider";

// Import DnD context for AI Chat FAB drag & drop
import { DndContext, DragEndEvent, useSensor, useSensors, PointerSensor, TouchSensor } from "@dnd-kit/core";

// Import AI Chat components
import { AIChatProvider, useAIChat, AIChatFab, AIChatPopover } from "@/components/app/ai-chat";

// Import Workboard provider for panel management
import { WorkboardProvider, useWorkboard } from "@/components/app/workboard";

// =============================================
// DnD Handler Component
// =============================================

/**
 * DndHandler - Handles drag & drop events for AI Chat FAB
 * Must be inside both AIChatProvider and WorkboardProvider
 */
function DndHandler({ children }: { children: React.ReactNode }) {
  // Get AI Chat actions
  const { setDocked, setDragging } = useAIChat();

  // Get Workboard actions
  const { addPanel, setDraggingOver } = useWorkboard();

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10, // Require 10px movement before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // Long press for mobile
        tolerance: 5,
      },
    })
  );

  // Handle drag start
  const handleDragStart = () => {
    setDragging(true);
  };

  // Handle drag over workboard
  const handleDragOver = (event: DragEndEvent) => {
    const { over } = event;
    setDraggingOver(over?.id === "workboard-drop-zone");
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { over, active } = event;

    setDragging(false);
    setDraggingOver(false);

    // Check if dropped on workboard
    if (over?.id === "workboard-drop-zone" && active.data.current?.type === "ai-chat-fab") {
      // Dock the AI Chat to workboard
      setDocked(true);
      addPanel("chat");
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {children}
    </DndContext>
  );
}

// =============================================
// App Layout Content
// =============================================

/**
 * AppLayoutContent - Inner layout that consumes sidebar context
 * Separated to allow useSidebar hook usage (requires SidebarProvider parent)
 */
function AppLayoutContent({ children }: { children: React.ReactNode }) {
  // Get sidebar collapsed state from context
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed top navigation bar */}
      <DashboardTopBar />

      {/* Collapsible sidebar navigation */}
      <DashboardSidebar />

      {/* Main content area - dynamic margin based on sidebar state */}
      <main
        className={`
          ${collapsed ? MAIN_MARGIN_CLASSES.collapsed : MAIN_MARGIN_CLASSES.expanded}
          pt-16
          min-h-screen
          transition-all duration-300
          bg-muted
        `}
      >
        {/* Content wrapper with consistent padding */}
        <div className="p-6">
          {children}
        </div>
      </main>

      {/* AI Chat Floating Action Button */}
      <AIChatFab />

      {/* AI Chat Popover (side chatbox) */}
      <AIChatPopover />
    </div>
  );
}

// =============================================
// Main App Layout
// =============================================

/**
 * AppLayout - Root layout for all app pages (dashboard, workspace)
 * Wraps content with all required providers:
 * - SidebarProvider: Shared sidebar state
 * - AIChatProvider: AI Chat state (FAB, popover, messages)
 * - WorkboardProvider: Panel layout state
 * - DndContext: Drag & drop for AI Chat FAB
 *
 * @param children - Page content
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Provider hierarchy: Sidebar -> AIChat -> Workboard -> DnD -> Content
    <SidebarProvider>
      <AIChatProvider>
        <WorkboardProvider>
          <DndHandler>
            <AppLayoutContent>{children}</AppLayoutContent>
          </DndHandler>
        </WorkboardProvider>
      </AIChatProvider>
    </SidebarProvider>
  );
}
