// =============================================
// Home (Marketing) Layout
// =============================================
// Layout wrapper for public marketing pages (homepage, etc.)
// Provides a clean full-width layout without sidebar/topbar

// Metadata for homepage
export const metadata = {
  title: "QuoteFlow AI | AI-Powered Quotation Management",
  description:
    "Streamline your sales workflow with AI-powered quotation generation. From RFQ analysis to professional documents, QuoteFlow AI helps you close deals faster.",
};

/**
 * HomeLayout - Layout for public marketing pages
 * No sidebar/topbar - uses Navbar component from page
 *
 * @param children - Page content
 */
export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Full-width layout for marketing pages
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
