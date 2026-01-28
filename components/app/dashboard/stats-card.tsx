// =============================================
// Stats Card Component
// =============================================
// Displays a single stat with icon, value, and change indicator
// Used in the dashboard stats overview grid

import { LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// =============================================
// Types
// =============================================

// Stat data structure for a single stat card
export interface StatData {
  title: string;              // Stat label (e.g., "Total Quotations")
  value: string;              // Display value (e.g., "142")
  change: string;             // Change indicator (e.g., "+12%")
  changeType: "positive" | "negative";  // Determines indicator color
  icon: LucideIcon;           // Lucide icon component
  description: string;        // Comparison text (e.g., "vs last month")
}

// Component props
interface StatsCardProps {
  stat: StatData;             // Stat data to display
}

// =============================================
// Stats Card Component
// =============================================

/**
 * StatsCard - Displays a single stat card with icon, value, and change indicator
 * Uses design tokens from globals.css for all styling
 */
export function StatsCard({ stat }: StatsCardProps) {
  // Extract icon component from stat data
  const Icon = stat.icon;

  return (
    <Card className="bg-card">
      {/* Card header with title and icon */}
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {stat.title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>

      {/* Card content with value and change indicator */}
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{stat.value}</div>
        <p className="text-xs text-muted-foreground">
          {/* Change indicator with color based on type */}
          <span
            className={
              stat.changeType === "positive"
                ? "text-status-complete-foreground"  // Green for positive
                : "text-destructive"                  // Red for negative
            }
          >
            {stat.change}
          </span>{" "}
          {stat.description}
        </p>
      </CardContent>
    </Card>
  );
}
