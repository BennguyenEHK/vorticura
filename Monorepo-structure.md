# QuoteFlow AI - Project Structure

> **Last Updated:** January 28, 2026
> **Version:** 3.0 (Route Simplification + Component Extraction)

## Overview

QuoteFlow AI uses Next.js 15 App Router with a professional route group architecture:
- `(home)` - Public marketing pages
- `(app)` - Authenticated app with shared sidebar/topbar
- `(auth)` - Authentication pages

```
quoteflow_ai/
├── app/                                    # Next.js App Router
│   ├── (home)/                            # Route group: Public marketing pages
│   │   ├── layout.tsx ✓                   # Marketing layout (minimal)
│   │   └── page.tsx ✓                     # Homepage "/"
│   │
│   ├── (app)/                             # Route group: Authenticated app
│   │   ├── layout.tsx ✓                   # App layout (sidebar + topbar + SidebarProvider)
│   │   │
│   │   ├── dashboard/                     # Dashboard route (simplified from nested groups)
│   │   │   └── page.tsx ✓                 # Dashboard page "/dashboard"
│   │   │
│   │   └── workspace/                     # Workspace route (simplified from nested groups)
│   │       └── [quotationId]/
│   │           └── page.tsx ✓             # Workspace "/workspace/[quotationId]"
│   │
│   ├── (auth)/                            # Route group: Authentication
│   │   ├── layout.tsx ✓                   # Auth layout (split-screen)
│   │   ├── login/
│   │   │   └── page.tsx ✓                 # Login page "/login"
│   │   └── signup/
│   │       └── page.tsx ✓                 # Signup page "/signup"
│   │
│   ├── api/                               # API Routes (Controllers)
│   │   ├── auth/
│   │   │   ├── signup/route.ts ✓          # POST /api/auth/signup
│   │   │   ├── login/route.ts ✓           # POST /api/auth/login
│   │   │   ├── logout/route.ts ✓          # POST /api/auth/logout
│   │   │   ├── me/route.ts ✓              # GET /api/auth/me
│   │   │   └── verify/route.ts ✓          # GET /api/auth/verify
│   │   │
│   │   ├── webhooks/
│   │   │   ├── module-update/route.ts     # POST /api/webhooks/module-update
│   │   │   ├── workflow-complete/route.ts # POST /api/webhooks/workflow-complete
│   │   │   └── make/data-processing/route.ts
│   │   │
│   │   ├── quotations/
│   │   │   ├── route.ts ✓                 # GET/POST /api/quotations
│   │   │   ├── [id]/route.ts              # GET/PUT/DELETE /api/quotations/:id
│   │   │   ├── save/route.ts              # POST /api/quotations/save
│   │   │   └── pricing-variables/route.ts # POST /api/quotations/pricing-variables
│   │   │
│   │   ├── database/
│   │   │   ├── insert/route.ts ✓          # POST /api/database/insert
│   │   │   ├── select/route.ts ✓          # POST /api/database/select
│   │   │   ├── update/route.ts ✓          # POST /api/database/update
│   │   │   ├── delete/route.ts ✓          # DELETE /api/database/delete
│   │   │   └── stats/route.ts ✓           # GET /api/database/stats
│   │   │
│   │   ├── sessions/
│   │   │   ├── route.ts ✓                 # GET /api/sessions
│   │   │   └── [sessionId]/route.ts       # GET /api/sessions/:sessionId
│   │   │
│   │   ├── files/[fileId]/image/route.ts  # GET /api/files/:fileId/image
│   │   │
│   │   ├── health/
│   │   │   ├── route.ts ✓                 # GET /api/health
│   │   │   └── database/route.ts          # GET /api/health/database
│   │   │
│   │   ├── events/route.ts                # GET /api/events (SSE endpoint)
│   │   └── stats/route.ts                 # GET /api/stats
│   │
│   ├── providers.tsx ✓                    # Global providers (ThemeProvider)
│   ├── layout.tsx ✓                       # Root layout (html, body, providers)
│   └── globals.css ✓                      # Global styles & design tokens
│
├── components/                            # React Components
│   ├── app/                               # App-level components (authenticated section)
│   │   ├── index.ts ✓                     # Barrel exports for app components
│   │   ├── sidebar.tsx ✓                  # Collapsible sidebar (moved from dashboard/)
│   │   ├── topbar.tsx ✓                   # Fixed topbar with theme toggle (moved from dashboard/)
│   │   ├── sidebar-provider.tsx ✓         # SidebarProvider context for collapse state
│   │   │
│   │   ├── dashboard/                     # Dashboard UI components
│   │   │   ├── index.ts ✓                 # Barrel exports (re-exports sidebar/topbar + card components)
│   │   │   ├── stats-card.tsx ✓           # Single stat card component
│   │   │   ├── recent-quotations-card.tsx ✓ # Recent quotations table card
│   │   │   └── quick-actions-card.tsx ✓   # Quick actions panel card
│   │   │
│   │   └── workspace/                     # Workspace panel components
│   │       ├── index.ts ✓                 # Barrel exports for workspace panels
│   │       ├── chat-panel.tsx ✓           # AI Chat panel placeholder
│   │       ├── quotation-editor-panel.tsx ✓ # Quotation editor placeholder
│   │       ├── files-panel.tsx ✓          # File manager placeholder
│   │       └── workflow-panel.tsx ✓       # Workflow tracker placeholder
│   │
│   ├── home/                              # Homepage (marketing) components
│   │   ├── index.ts ✓                     # Barrel exports
│   │   ├── Navbar.tsx ✓                   # Sticky nav with Logo + theme toggle
│   │   ├── HeroSection.tsx ✓              # Hero with headline, CTAs
│   │   ├── FeaturesSection.tsx ✓          # Feature cards grid
│   │   ├── HowItWorksSection.tsx ✓        # 3-step process
│   │   ├── PricingSection.tsx ✓           # Pricing tiers (disabled)
│   │   ├── TestimonialsSection.tsx ✓      # Customer reviews
│   │   ├── CTASection.tsx ✓               # Final CTA
│   │   └── Footer.tsx ✓                   # Footer with links
│   │
│   ├── auth/                              # Authentication components
│   │   └── AuthForm.tsx ✓                 # Reusable auth form
│   │
│   └── ui/                                # Reusable UI components (Shadcn)
│       ├── logo.tsx ✓                     # Shared Logo SVG component
│       ├── button.tsx ✓                   # Button component
│       ├── input.tsx ✓                    # Input component
│       ├── label.tsx ✓                    # Label component
│       ├── form.tsx ✓                     # Form components
│       ├── card.tsx ✓                     # Card component
│       ├── dialog.tsx ✓                   # Dialog component
│       └── table.tsx ✓                    # Table component
│
├── lib/                                   # Business Logic & Utilities
│   ├── services/                          # Business Logic Layer
│   │   ├── quotation/
│   │   │   ├── data-processing-api.ts     # Unified data processing
│   │   │   ├── quotation-processor.ts     # Quotation CRUD
│   │   │   ├── email-processor.ts         # Email generation
│   │   │   ├── rfq-processor.ts           # RFQ analysis
│   │   │   ├── suppliers-processor.ts     # Supplier search
│   │   │   ├── merge.ts                   # Data merging
│   │   │   ├── pricing-processor.ts       # Pricing extraction
│   │   │   ├── document-generator.ts      # HTML/PDF generation
│   │   │   ├── session-loader.ts          # Session reconstruction
│   │   │   └── database-handler.ts        # Database CRUD
│   │   │
│   │   ├── pricing/
│   │   │   └── calculations.ts            # Pricing formulas
│   │   │
│   │   ├── session/
│   │   │   ├── session-manager.ts         # Session lifecycle
│   │   │   └── session-handler.ts         # Session storage
│   │   │
│   │   ├── sse/
│   │   │   ├── sse-broadcaster.ts         # SSE broadcasting
│   │   │   ├── sse-connection-manager.ts  # Connection management
│   │   │   └── sse-database-service.ts    # Connection persistence
│   │   │
│   │   └── auth/
│   │       ├── jwt-service.ts             # JWT handling
│   │       └── workspace-service.ts ✓     # Workspace isolation
│   │
│   ├── utils/                             # Helper Functions
│   │   ├── formatting/
│   │   │   ├── currency.ts
│   │   │   ├── date.ts
│   │   │   ├── mime-types.ts
│   │   │   ├── sanitize.ts
│   │   │   └── uptime.ts
│   │   │
│   │   ├── validation/
│   │   │   ├── quotation-validator.ts
│   │   │   ├── email-validator.ts
│   │   │   ├── input-validator.ts
│   │   │   └── schemas.ts ✓
│   │   │
│   │   ├── generators/
│   │   │   ├── id-generator.ts
│   │   │   └── token-generator.ts
│   │   │
│   │   ├── config/
│   │   │   └── config-loader.ts
│   │   │
│   │   └── api/
│   │       └── get-workspace.ts ✓
│   │
│   ├── db/                                # Database Layer
│   │   ├── client.ts ✓                    # Drizzle client
│   │   ├── schema.ts ✓                    # Schema definitions
│   │   ├── queries.ts ✓                   # Reusable queries
│   │   ├── workspace-helper.ts ✓          # Workspace wrapper
│   │   └── migrations/migrate.ts ✓
│   │
│   └── middleware/                        # Middleware Helpers
│       ├── workspace-context.ts ✓
│       └── auth-helpers.ts ✓
│
├── types/                                 # TypeScript Types
│   ├── quotation.ts
│   ├── email.ts
│   ├── rfq.ts
│   ├── suppliers.ts
│   ├── session.ts
│   ├── user.ts
│   ├── workspace.ts ✓
│   ├── api.ts
│   └── database.ts ✓
│
├── public/                                # Static Assets
│   ├── templates/
│   ├── assets/
│   └── favicon.ico
│
├── drizzle/                               # Drizzle ORM
│   ├── migrations/
│   └── schema/
│
├── scripts/                               # Utility Scripts
│   ├── session-manager.ts
│   ├── port-manager.ts
│   ├── generate-token.ts
│   └── show-config.ts
│
├── tests/                                 # Tests
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── config/                                # Configuration
│   ├── environments.json
│   ├── demo-users.json
│   └── workspace.config.ts ✓
│
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── drizzle.config.ts ✓
├── middleware.ts ✓
├── next.config.ts
├── package.json
├── postcss.config.mjs ✓
├── tsconfig.json
└── README.md
```

## Key Architecture Decisions

### Route Groups

| Route Group | Purpose | Layout |
|-------------|---------|--------|
| `(home)` | Public marketing pages | Minimal (no sidebar) |
| `(app)` | Authenticated app | Shared sidebar + topbar |
| `(auth)` | Authentication | Split-screen |

### Route Simplification (v3.0)

Previously (v2.0):
```
(app)/(dashboard)/dashboard/page.tsx → /dashboard
(app)/(workspace)/workspace/[quotationId]/page.tsx → /workspace/[id]
```

Now (v3.0):
```
(app)/dashboard/page.tsx → /dashboard
(app)/workspace/[quotationId]/page.tsx → /workspace/[id]
```

The nested route groups `(dashboard)` and `(workspace)` were removed as they added unnecessary complexity without providing additional layout separation.

### Component Organization (v3.0)

**Sidebar and Topbar moved to parent folder:**
- `components/app/sidebar.tsx` (was `components/app/dashboard/dashboard-sidebar.tsx`)
- `components/app/topbar.tsx` (was `components/app/dashboard/dashboard-topbar.tsx`)

**Reason:** These components are shared across all app pages (dashboard, workspace), not just dashboard.

**Dashboard Card Components extracted:**
- `components/app/dashboard/stats-card.tsx` - Single stat display card
- `components/app/dashboard/recent-quotations-card.tsx` - Quotations table card
- `components/app/dashboard/quick-actions-card.tsx` - Quick action buttons card

**Workspace Panel Components created:**
- `components/app/workspace/chat-panel.tsx` - AI Chat panel
- `components/app/workspace/quotation-editor-panel.tsx` - Quotation editor
- `components/app/workspace/files-panel.tsx` - File manager
- `components/app/workspace/workflow-panel.tsx` - Workflow tracker

### Provider Hierarchy

```
app/layout.tsx (Root)
└── Providers (ThemeProvider)
    ├── (home)/* - Theme works here
    ├── (auth)/* - Theme works here
    └── (app)/layout.tsx
        └── SidebarProvider
            ├── dashboard/* - Sidebar + Theme work here
            └── workspace/* - Sidebar + Theme work here
```

### Shared Components

| Component | Location | Used By |
|-----------|----------|---------|
| `Logo` | `components/ui/logo.tsx` | Navbar, Topbar, Auth |
| `SidebarProvider` | `components/app/sidebar-provider.tsx` | App layout, Sidebar |
| Theme Toggle | `components/app/topbar.tsx`, `components/home/Navbar.tsx` | Dashboard, Homepage |

### URL Mapping

| Route Group | URL | Page |
|-------------|-----|------|
| `(home)` | `/` | Homepage (public landing) |
| `(app)/dashboard` | `/dashboard` | Dashboard overview |
| `(app)/workspace/[id]` | `/workspace/Q-2024-001` | Quotation editor |
| `(auth)` | `/login`, `/signup` | Auth forms |

## Design Token System

All styling uses design tokens from `app/globals.css`:

### Color Tokens
- **Backgrounds:** `bg-background`, `bg-card`, `bg-muted`, `bg-sidebar`
- **Text:** `text-foreground`, `text-body`, `text-muted-foreground`, `text-label`
- **Brand:** `bg-brand`, `text-brand`, `hover:bg-brand-hover`
- **Status:** `bg-status-draft`, `bg-status-pending`, `bg-status-complete`

### Border Radius Tokens
- `rounded-sm` → `rounded-4xl` (from `--radius` base)

## Legend

- ✓ = File exists and is implemented
- Empty = Placeholder or to be implemented
