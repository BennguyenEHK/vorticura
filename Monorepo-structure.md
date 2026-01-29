# QuoteFlow AI - Project Structure

> **Last Updated:** January 29, 2026
> **Version:** 4.0 (Sidebar Redesign + Comms Hub + RFQ Queue)

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
│   │   ├── dashboard/                     # Dashboard route
│   │   │   └── page.tsx ✓                 # Dashboard page "/dashboard"
│   │   │
│   │   ├── workspace/                     # Workspace route
│   │   │   └── [quotationId]/
│   │   │       └── page.tsx ✓             # Workspace "/workspace/[quotationId]"
│   │   │
│   │   ├── storage/                       # Storage route (NEW)
│   │   │   └── page.tsx                   # Storage page "/storage"
│   │   │
│   │   ├── upload/                        # Upload route (NEW)
│   │   │   └── page.tsx                   # Upload page "/upload"
│   │   │
│   │   ├── settings/                      # Settings route (NEW)
│   │   │   └── page.tsx                   # Settings page "/settings"
│   │   │
│   │   └── pipeline/                      # Pipeline View route (NEW)
│   │       └── page.tsx                   # Pipeline page "/pipeline"
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
│   │   ├── rfq-queue/                     # RFQ Queue API (NEW)
│   │   │   └── route.ts ✓                 # GET/POST /api/rfq-queue
│   │   │
│   │   ├── comms/                         # Communications API (NEW)
│   │   │   └── route.ts ✓                 # GET/POST /api/comms
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
│   │   ├── sidebar.tsx ✓                  # Collapsible sidebar (redesigned v4.0)
│   │   ├── topbar.tsx ✓                   # Fixed topbar with Comms Hub (updated v4.0)
│   │   ├── sidebar-provider.tsx ✓         # SidebarProvider context for collapse state
│   │   │
│   │   ├── rfq-queue/                     # RFQ Queue components (NEW)
│   │   │   ├── index.ts ✓                 # Barrel exports
│   │   │   ├── rfq-queue-list.tsx ✓       # Scrollable RFQ list (top 4 visible)
│   │   │   └── rfq-queue-item.tsx ✓       # Individual RFQ item with status
│   │   │
│   │   ├── comms-hub/                     # Communications Hub components (NEW)
│   │   │   ├── index.ts ✓                 # Barrel exports
│   │   │   ├── comms-hub-trigger.tsx ✓    # Topbar icon with badge
│   │   │   ├── comms-hub-dropdown.tsx ✓   # Dropdown panel (w-360px)
│   │   │   └── channel-item.tsx ✓         # Individual channel card
│   │   │
│   │   ├── dashboard/                     # Dashboard UI components
│   │   │   ├── index.ts ✓                 # Barrel exports
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
│   │   ├── rfq-queue/                     # RFQ Queue services (NEW)
│   │   │   ├── index.ts ✓                 # Barrel exports
│   │   │   └── queue-manager.ts ✓         # Queue CRUD, filtering, mock data
│   │   │
│   │   ├── comms/                         # Communications services (NEW)
│   │   │   ├── index.ts ✓                 # Barrel exports
│   │   │   └── comms-manager.ts ✓         # Channel & message management
│   │   │
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
│   ├── rfq-queue.ts ✓                     # RFQ Queue types (NEW)
│   ├── comms.ts ✓                         # Communications types (NEW)
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
├── Dashboard_factor.md ✓                  # Dashboard design specification
└── README.md
```

## Key Architecture Decisions

### Route Groups

| Route Group | Purpose | Layout |
|-------------|---------|--------|
| `(home)` | Public marketing pages | Minimal (no sidebar) |
| `(app)` | Authenticated app | Shared sidebar + topbar |
| `(auth)` | Authentication | Split-screen |

### Sidebar Structure (v4.0)

The sidebar has been redesigned with the following sections:

| Section | Items | Description |
|---------|-------|-------------|
| **Workspace** | Dashboard, Workboard | Main navigation |
| **RFQ Queue** | Dynamic list | Top 4 visible, scrollable for more |
| **Documents** | Storage, Upload | File management |
| **System** | Settings, Pipeline View | Configuration & visualization |

### Component Organization (v4.0)

**New Components Added:**
- `components/app/rfq-queue/` - RFQ Queue sidebar list
- `components/app/comms-hub/` - Communications Hub dropdown

**New Services Added:**
- `lib/services/rfq-queue/` - Queue management logic
- `lib/services/comms/` - Channel & message management

**New API Routes Added:**
- `app/api/rfq-queue/` - RFQ Queue endpoints
- `app/api/comms/` - Communications endpoints

**New Types Added:**
- `types/rfq-queue.ts` - Queue types & stage configurations
- `types/comms.ts` - Channel & message types

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
| `RFQQueueList` | `components/app/rfq-queue/` | Sidebar |
| `CommsHubTrigger` | `components/app/comms-hub/` | Topbar |
| `CommsHubDropdown` | `components/app/comms-hub/` | Topbar |
| Theme Toggle | `components/app/topbar.tsx`, `components/home/Navbar.tsx` | Dashboard, Homepage |

### URL Mapping

| Route Group | URL | Page |
|-------------|-----|------|
| `(home)` | `/` | Homepage (public landing) |
| `(app)/dashboard` | `/dashboard` | Dashboard overview |
| `(app)/workspace/[id]` | `/workspace/Q-2024-001` | Quotation workspace |
| `(app)/storage` | `/storage` | Document storage |
| `(app)/upload` | `/upload` | File uploads |
| `(app)/settings` | `/settings` | App settings |
| `(app)/pipeline` | `/pipeline` | Pipeline view |
| `(auth)` | `/login`, `/signup` | Auth forms |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rfq-queue` | GET | List queued RFQs with filters |
| `/api/rfq-queue` | POST | Update RFQ status/stage |
| `/api/comms` | GET | List channels, status, messages |
| `/api/comms` | POST | Update channel or mark message read |

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
