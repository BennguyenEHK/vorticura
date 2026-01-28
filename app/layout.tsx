import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// =============================================
// Root Layout Metadata
// =============================================
// SEO and social sharing metadata for QuoteFlow AI
export const metadata: Metadata = {
  title: "QuoteFlow AI | AI-Powered Quotation Management",
  description:
    "Streamline your sales workflow with AI-powered quotation generation. From RFQ analysis to professional documents, QuoteFlow AI helps you close deals faster.",
  keywords: [
    "quotation management",
    "AI quotation",
    "sales automation",
    "RFQ analysis",
    "proposal software",
  ],
  authors: [{ name: "QuoteFlow AI" }],
  openGraph: {
    title: "QuoteFlow AI | AI-Powered Quotation Management",
    description:
      "Create professional quotations in seconds with AI-powered automation.",
    type: "website",
  },
};

// Import global providers (ThemeProvider)
import { Providers } from "./providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning required by next-themes to prevent hydration mismatch
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Wrap entire app with global providers (Theme, etc.) */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
