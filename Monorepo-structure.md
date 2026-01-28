# QuoteFlow AI - Project Structure

> **Last Updated:** January 28, 2026
> **Version:** 2.0 (Route Groups Refactor)

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
│   │   ├── (dashboard)/                   # Dashboard route group (inherits app layout)
│   │   │   └── dashboard/
│   │   │       └── page.tsx ✓             # Dashboard page "/dashboard"
│   │   │
│   │   └── (workspace)/                   # Workspace route group (inherits app layout)
│   │       └── workspace/
│   │           └── [quotationId]/
│   │               └── page.tsx ✓         # Workspace "/workspace/[quotationId]"
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
│   │   ├── sidebar-provider.tsx ✓         # SidebarProvider context for collapse state
│   │   │
│   │   ├── dashboard/                     # Dashboard UI components
│   │   │   ├── index.ts ✓                 # Barrel exports
│   │   │   ├── dashboard-sidebar.tsx ✓    # Collapsible sidebar (uses context)
│   │   │   └── dashboard-topbar.tsx ✓     # Fixed topbar with logo, search, theme toggle
│   │   │
│   │   └── main_workspace/                # Workspace panel components
│   │       ├── index.ts ✓                 # Barrel exports (placeholders)
│   │       ├── chat/                      # AI Chat panel components
│   │       ├── files/                     # File manager panel components
│   │       ├── quotation/                 # Quotation editor components
│   │       └── workflow/                  # Workflow tracker components
│   │
│   ├── home/                              # Homepage (marketing) components
│   │   ├── index.ts ✓                     # Barrel exports
│   │   ├── Navbar.tsx ✓                   # Sticky nav with Logo component
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

### Provider Hierarchy

```
app/layout.tsx (Root)
└── Providers (ThemeProvider)
    ├── (home)/* - Theme works here
    ├── (auth)/* - Theme works here
    └── (app)/layout.tsx
        └── SidebarProvider
            ├── (dashboard)/* - Sidebar + Theme work here
            └── (workspace)/* - Sidebar + Theme work here
```

### Shared Components

| Component | Location | Used By |
|-----------|----------|---------|
| `Logo` | `components/ui/logo.tsx` | Navbar, Topbar, Auth |
| `SidebarProvider` | `components/app/sidebar-provider.tsx` | App layout, Sidebar |

### URL Mapping

| Route Group | URL | Page |
|-------------|-----|------|
| `(home)` | `/` | Homepage (public landing) |
| `(app)/(dashboard)/dashboard` | `/dashboard` | Dashboard overview |
| `(app)/(workspace)/workspace/[id]` | `/workspace/Q-2024-001` | Quotation editor |
| `(auth)` | `/login`, `/signup` | Auth forms |

## Legend

- ✓ = File exists and is implemented
- Empty = Placeholder or to be implemented
