// =============================================
// Quick Actions Card — Mission Control panel
// =============================================
// Sidebar card with a stack of outline buttons. Each row is hairline-bordered
// and reads like a panel control list (not a SaaS CTA pile). The Button
// primitive's outline variant already carries the Mission Control ink/25
// hairline gesture — we just stack them with a small gap.

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

export interface ActionData {
  label: string;              // Button text (e.g., "Create New Quote")
  icon: LucideIcon;           // Lucide icon component
  onClick?: () => void;       // Optional click handler
}

interface QuickActionsCardProps {
  actions: ActionData[];
}

// =============================================
// Quick Actions Card
// =============================================

/**
 * QuickActionsCard — Stack of outline actions sitting next to the ledger.
 * Renders each action as a left-aligned outline button (hairline ink/25 border).
 */
export function QuickActionsCard({ actions }: QuickActionsCardProps) {
  return (
    <Card>
      {/* Header — display serif title, graphite description */}
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Fast paths into the pipeline</CardDescription>
      </CardHeader>

      {/* Stack of outline buttons — each leads with its icon at 1.5px stroke */}
      <CardContent className="space-y-2">
        {actions.map((action, index) => {
          const Icon = action.icon;

          return (
            <Button
              key={index}
              variant="outline"
              // Full width, left-aligned, square-ish height for a panel-control feel
              className="w-full justify-start h-11"
              onClick={action.onClick}
            >
              {/* Icon — graphite stroke, single weight */}
              <Icon className="mr-2 h-4 w-4 text-graphite" strokeWidth={1.5} />
              {/* Label — body grotesque, ink */}
              <span className="font-body text-sm text-ink">{action.label}</span>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
