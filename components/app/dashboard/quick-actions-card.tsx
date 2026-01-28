// =============================================
// Quick Actions Card Component
// =============================================
// Displays a panel of quick action buttons
// Used in the dashboard sidebar area

import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// =============================================
// Types
// =============================================

// Action button data structure
export interface ActionData {
  label: string;              // Button text (e.g., "Create New Quote")
  icon: LucideIcon;           // Lucide icon component
  onClick?: () => void;       // Optional click handler
}

// Component props
interface QuickActionsCardProps {
  actions: ActionData[];      // Array of action buttons to display
}

// =============================================
// Quick Actions Card Component
// =============================================

/**
 * QuickActionsCard - Displays a panel of quick action buttons
 * Uses design tokens from globals.css for all styling
 */
export function QuickActionsCard({ actions }: QuickActionsCardProps) {
  return (
    <Card className="bg-card">
      {/* Card header with title and description */}
      <CardHeader>
        <CardTitle className="text-foreground">Quick Actions</CardTitle>
        <CardDescription>Common tasks at your fingertips</CardDescription>
      </CardHeader>

      {/* Card content with action buttons */}
      <CardContent className="space-y-3">
        {actions.map((action, index) => {
          // Extract icon component from action data
          const Icon = action.icon;

          return (
            <Button
              key={index}
              variant="outline"
              className="w-full justify-start"
              onClick={action.onClick}
            >
              <Icon className="mr-2 h-4 w-4" />
              {action.label}
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
