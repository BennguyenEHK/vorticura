"use client";

// =============================================
// Global Providers - Wraps entire application
// =============================================
// Contains providers that need to be available across all routes:
// - ThemeProvider: Light/dark mode support via next-themes

import { ThemeProvider } from "next-themes";

// Props interface for Providers component
interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * Providers - Root provider wrapper for the application
 * Wraps children with all necessary context providers
 *
 * @param children - React nodes to wrap with providers
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"           // Apply theme via class on <html> element
      defaultTheme="system"       // Respect user's system preference by default
      enableSystem                // Enable system theme detection
      // Note: disableTransitionOnChange removed to allow smooth theme transitions
    >
      {children}
    </ThemeProvider>
  );
}
