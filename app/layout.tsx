import type { Metadata } from "next";
// Geist fonts kept for the dashboard surface (legacy --font-sans / --font-mono tokens)
import { Geist, Geist_Mono, Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// ===== Legacy fonts (dashboard) =====
// The internal app still maps Tailwind's font-sans/font-mono to these two.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ===== Vorticura editorial fonts (home/marketing) =====
// Display: Fraunces — editorial serif with sharp angled terminals (drives hero & H1 headlines)
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

// Body: Inter Tight — neutral grotesque for paragraphs and UI chrome
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Data: JetBrains Mono — tabular monospace for numbers, micro-labels, station IDs
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// =============================================
// Root Layout Metadata (Vorticura)
// =============================================
// SEO copy uses the new positioning: instrument-grade procurement, real numbers, no AI cliché.
export const metadata: Metadata = {
  title: "Vorticura — Mission Control for Procurement",
  description:
    "Procurement teams using Vorticura cut quote response from a median of 38 hours to 4 minutes 47 seconds.",
  keywords: [
    "procurement automation",
    "RFQ management",
    "supplier sourcing",
    "quotation platform",
    "Vorticura",
  ],
  authors: [{ name: "Vorticura" }],
  openGraph: {
    title: "Vorticura — Mission Control for Procurement",
    description:
      "The peak of every bid, four minutes after the RFQ lands.",
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
        // All five font CSS variables exposed; per-surface utilities (font-display/font-body/font-data)
        // pick the right family without disturbing legacy font-sans usage in the dashboard.
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${interTight.variable} ${jetbrainsMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {/* Wrap entire app with global providers (Theme, etc.) */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
