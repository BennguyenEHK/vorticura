# QuoteFlow AI - Project Structure

> **Last Updated:** March 30, 2026
> **Version:** 7.1 (OAuth Webhooks, IMAP removed, DB handler aligned)

## Overview

QuoteFlow AI uses Next.js 15 App Router with a professional route group architecture:
- `(home)` - Public marketing pages
- `(app)` - Authenticated app with shared sidebar/topbar
- `(auth)` - Authentication pages

```
quoteflow_ai/
├── app/                                    # Next.js App Router
│   ├── (home)/                            # Route group: Public marketing pages
│   │   ├── layout.tsx                     # Marketing layout (minimal)
│   │   └── page.tsx                       # Homepage "/"
│   │
│   ├── (app)/                             # Route group: Authenticated app
│   │   ├── layout.tsx                     # App layout (sidebar + topbar + providers)
│   │   ├── dashboard/
│   │   │   └── page.tsx                   # Dashboard page "/dashboard"
│   │   └── workspace/
│   │       └── [quotationId]/
│   │           └── page.tsx               # Workspace "/workspace/[quotationId]"
│   │
│   ├── (auth)/                            # Route group: Authentication
│   │   ├── layout.tsx                     # Auth layout (split-screen)
│   │   ├── login/
│   │   │   └── page.tsx                   # Login page "/login"
│   │   └── signup/
│   │       └── page.tsx                   # Signup page "/signup"
│   │
│   ├── api/                               # API Routes (Controllers)
│   │   ├── auth/
│   │   │   ├── signup/route.ts            # POST /api/auth/signup
│   │   │   ├── login/route.ts             # POST /api/auth/login
│   │   │   ├── logout/route.ts            # POST /api/auth/logout
│   │   │   ├── me/route.ts               # GET /api/auth/me
│   │   │   ├── verify/route.ts            # GET /api/auth/verify
│   │   │   └── callback/                  # OAuth callbacks
│   │   │       ├── google/route.ts        # GET /api/auth/callback/google
│   │   │       └── microsoft/route.ts     # GET /api/auth/callback/microsoft
│   │   │
│   │   ├── comms/
│   │   │   └── route.ts                   # GET/POST /api/comms
│   │   │
│   │   ├── webhooks/
│   │   │   ├── gmail/route.ts             # POST /api/webhooks/gmail (Pub/Sub push)
│   │   │   ├── microsoft/route.ts         # POST /api/webhooks/microsoft (Graph push)
│   │   │   ├── make/data-processing/      # Make.com webhook (placeholder)
│   │   │   ├── module-update/             # Module update webhook (placeholder)
│   │   │   └── workflow-complete/         # Workflow complete webhook (placeholder)
│   │   │
│   │   ├── cron/
│   │   │   └── refresh-tokens/route.ts    # GET /api/cron/refresh-tokens (every 45 min)
│   │   │
│   │   └── preview-stream/
│   │       └── route.ts                   # GET /api/preview-stream (SSE)
│   │
│   ├── providers.tsx                      # Global providers (ThemeProvider)
│   ├── layout.tsx                         # Root layout (html, body, providers)
│   └── globals.css                        # Global styles & design tokens
│
├── components/                            # React Components
│   ├── app/                               # App-level components (authenticated section)
│   │   ├── index.ts                       # Barrel exports
│   │   ├── sidebar.tsx                    # Collapsible sidebar
│   │   ├── topbar.tsx                     # Fixed topbar with Comms Hub
│   │   ├── sidebar-provider.tsx           # SidebarProvider context
│   │   │
│   │   ├── ai-chat/                       # AI Chat FAB components
│   │   │   ├── index.ts
│   │   │   ├── ai-chat-provider.tsx       # Context: state, position, docked status
│   │   │   ├── ai-chat-fab.tsx            # Floating circular icon + badge
│   │   │   ├── ai-chat-popover.tsx        # Small side chatbox
│   │   │   └── ai-chat-panel.tsx          # Full panel (docked to Workboard)
│   │   │
│   │   ├── workboard/                     # Workboard panel system
│   │   │   ├── index.ts
│   │   │   ├── workboard-provider.tsx     # Context: layout state, panel configs
│   │   │   ├── workboard-grid.tsx         # react-grid-layout with auto-fill
│   │   │   ├── workboard-panel.tsx        # Generic draggable/resizable panel
│   │   │   ├── workboard-drop-zone.tsx    # Drop target for AI Chat FAB
│   │   │   ├── panel-header.tsx           # Drag handle + controls
│   │   │   ├── utils/
│   │   │   │   └── grid-layout.ts         # Grid utilities: auto-fill, height calc, swap
│   │   │   │
│   │   │   └── panels/                    # Panel content components
│   │   │       ├── index.ts
│   │   │       ├── workflow-panel-content.tsx
│   │   │       ├── pricing-panel-content.tsx
│   │   │       ├── preview-panel-content.tsx
│   │   │       │
│   │   │       ├── preview/               # Preview panel sub-components
│   │   │       │   ├── index.ts
│   │   │       │   ├── blank-document.tsx
│   │   │       │   ├── document-toolbar.tsx
│   │   │       │   ├── email-document.tsx
│   │   │       │   ├── quotation-document.tsx
│   │   │       │   ├── rfq-analysis-document.tsx
│   │   │       │   ├── supplier-search-document.tsx
│   │   │       │   └── workboard-history.tsx
│   │   │       │
│   │   │       └── pricing/               # Pricing panel sub-components
│   │   │           ├── index.ts
│   │   │           ├── pricing-panel-provider.tsx
│   │   │           ├── currency-selector.tsx
│   │   │           ├── item-search.tsx
│   │   │           ├── pricing-item-list.tsx
│   │   │           ├── pricing-item-card.tsx
│   │   │           ├── profit-summary-table.tsx
│   │   │           ├── bulk-update-popover.tsx
│   │   │           └── pricing-actions.tsx
│   │   │
│   │   ├── rfq-queue/                     # RFQ Queue components
│   │   │   ├── index.ts
│   │   │   ├── rfq-queue-list.tsx
│   │   │   └── rfq-queue-item.tsx
│   │   │
│   │   ├── comms-hub/                     # Communications Hub components
│   │   │   ├── index.ts
│   │   │   ├── comms-hub-trigger.tsx
│   │   │   ├── comms-hub-dropdown.tsx
│   │   │   └── channel-item.tsx
│   │   │
│   │   └── dashboard/                     # Dashboard components
│   │       ├── index.ts
│   │       ├── stats-card.tsx
│   │       ├── recent-quotations-card.tsx
│   │       └── quick-actions-card.tsx
│   │
│   ├── home/                              # Homepage (marketing) components
│   │   ├── index.ts
│   │   ├── Navbar.tsx
│   │   ├── HeroSection.tsx
│   │   ├── FeaturesSection.tsx
│   │   ├── HowItWorksSection.tsx
│   │   ├── PricingSection.tsx
│   │   ├── TestimonialsSection.tsx
│   │   ├── CTASection.tsx
│   │   └── Footer.tsx
│   │
│   ├── auth/
│   │   └── AuthForm.tsx                   # Reusable auth form (+ OAuth buttons)
│   │
│   ├── settings/
│   │   └── EmailConnectionPanel.tsx       # Email connection management UI
│   │
│   └── ui/                                # Reusable UI components (Shadcn)
│       ├── logo.tsx
│       ├── button.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── form.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       └── table.tsx
│
├── lib/                                   # Business Logic & Utilities
│   ├── actions/                           # Server Actions ('use server')
│   │   ├── analysis-actions.ts            # RFQ analysis: email -> AI -> analysis JSON
│   │   ├── email-actions.ts               # Email drafting & sending
│   │   ├── email-connection-actions.ts    # Email connection CRUD (OAuth)
│   │   ├── supplier-search-actions.ts     # Supplier search via AI
│   │   ├── quotation-actions.ts           # Quotation generate/update
│   │   ├── snapshot-actions.ts            # Workboard snapshot CRUD
│   │   └── pricing-actions.ts             # Price calculation & storage
│   │
│   ├── utils/                             # Helper Functions
│   │   ├── databaseHandler.ts             # Unified DB handler (payload builders + modifyDatabase)
│   │   ├── validator.ts                   # Multi-data-type input validation
│   │   └── validation/
│   │       └── schemas.ts                 # Zod schemas: login, signup, field validators
│   │
│   ├── services/                          # Business Logic Layer
│   │   ├── email/                         # Email Integration (OAuth + Webhooks)
│   │   │   ├── email-pipeline.ts          # Provider-agnostic processing pipeline
│   │   │   ├── oauth-helper.ts            # OAuth URL builders, token exchange, AES-256-GCM
│   │   │   ├── gmail-client.ts            # Gmail API wrapper (watch, history, messages)
│   │   │   └── outlook-client.ts          # Microsoft Graph wrapper (subscriptions, messages)
│   │   │
│   │   ├── comms/                         # Communications services
│   │   │   ├── index.ts                   # Barrel exports
│   │   │   └── comms-manager.ts           # Channel & message management
│   │   │
│   │   ├── rfq-queue/                     # RFQ Queue services
│   │   │   ├── index.ts
│   │   │   └── queue-manager.ts           # Queue CRUD, filtering, stage updates
│   │   │
│   │   ├── pricing/                       # Pricing services
│   │   │   ├── index.ts
│   │   │   ├── pricing-calculator.ts      # Core calculation engine
│   │   │   ├── pricing-manager.ts         # CRUD operations
│   │   │   ├── currency-service.ts        # Exchange rates & conversion
│   │   │   └── validation.ts              # Input validation
│   │   │
│   │   ├── auth/                          # Auth services (placeholder)
│   │   ├── quotation/                     # Quotation services (placeholder)
│   │   ├── session/                       # Session services (placeholder)
│   │   ├── sse/                           # SSE services (placeholder)
│   │   ├── rfq-analysis/                  # RFQ Analysis services (placeholder)
│   │   └── supplier-search/               # Supplier Search services (placeholder)
│   │
│   ├── ai-agent/                          # AI Agent Layer
│   │   ├── local-model.ts                 # Local model inference (@xenova/transformers)
│   │   └── ai-model/                      # Model storage (placeholder)
│   │
│   ├── db/                                # Database Layer
│   │   ├── client.ts                      # Drizzle ORM client (PostgreSQL/Neon)
│   │   ├── schema.ts                      # 16 table definitions (Drizzle schema)
│   │   ├── queries.ts                     # Generic CRUD with workspace isolation
│   │   └── migrations/
│   │       └── migrate.ts                 # Migration runner
│   │
│   ├── middleware/                         # Middleware Helpers
│   │   ├── workspace-context.ts           # WorkspaceContext class (tenant isolation)
│   │   ├── get-workspace.ts               # Workspace helper
│   │   └── auth-helpers.ts                # JWT verification helpers
│   │
│   ├── data-processor.ts                  # Main server action entry point (handleHTTPRequest)
│   ├── data-loader.ts                     # Data loading for pipeline chaining
│   ├── event-bus.ts                       # In-process pub/sub for SSE events
│   └── utils.ts                           # General utilities (cn, etc.)
│
├── hooks/                                 # Custom React Hooks
│   ├── preview-context.tsx                # Preview state context
│   ├── use-preview-reducer.ts             # Preview state reducer
│   └── use-preview-sse.ts                 # SSE connection for preview updates
│
├── types/                                 # TypeScript Types
│   ├── ai-agent.ts                        # AI agent types
│   ├── ai-chat.ts                         # AI Chat types
│   ├── workboard.ts                       # Workboard types
│   ├── workflow.ts                        # Workflow step types
│   ├── pricing.ts                         # Pricing types
│   ├── rfq-queue.ts                       # RFQ Queue types
│   ├── comms.ts                           # Communications types
│   ├── preview.ts                         # Preview panel types
│   ├── workspace.ts                       # Workspace types
│   └── database.ts                        # Database types
│
├── config/                                # Configuration
│   └── workspace.config.ts                # Workspace config
│
├── Documents/                             # Project Documentation
│   ├── google_console_setup.md            # Google Cloud OAuth setup
│   ├── microsoft_setup.md                 # Microsoft Azure OAuth setup
│   ├── watcher-service.md                 # Email watcher v2 migration plan
│   ├── EMAIL_WATCHER.md                   # Original email watcher spec
│   ├── architecture-redis-pubsub.md       # Redis/Pub/Sub architecture
│   ├── auth_FLOW.md                       # Authentication flow
│   ├── Deployment.md                      # Deployment instructions
│   ├── Current-context.md                 # System context and status
│   ├── Dashboard_factor.md                # Dashboard design spec
│   ├── Preview.md                         # Preview panel spec
│   ├── Commit.md                          # Commit conventions
│   └── DISCUSSION_2026-02-27.md           # Architecture discussion
│
├── drizzle/                               # Drizzle ORM Output
│   ├── migrations/                        # Generated SQL migrations
│   └── schema/                            # Generated schema snapshots
│
├── public/                                # Static Assets
│   ├── assets/
│   │   ├── generated/                     # Generated files
│   │   ├── logos/                          # Logo assets
│   │   └── signatures/                    # Signature assets
│   └── templates/                         # Document templates
│
├── tests/                                 # Tests
│   ├── unit/
│   │   ├── services/
│   │   └── utils/
│   ├── integration/
│   │   ├── api/
│   │   └── quotation/
│   └── fixtures/
│       └── quotations/
│
├── scripts/                               # Utility Scripts (placeholder)
│
├── .env.local                             # Environment configuration
├── drizzle.config.ts                      # Drizzle Kit config
├── instrumentation.ts                     # Next.js instrumentation hook
├── middleware.ts                           # Next.js middleware (auth + workspace)
├── next.config.ts                         # Next.js config
├── vercel.json                            # Vercel cron configuration
├── package.json                           # Dependencies & scripts
├── tsconfig.json                          # TypeScript config
├── postcss.config.mjs                     # PostCSS config
├── eslint.config.mjs                      # ESLint config
├── .eslintrc.json                         # ESLint legacy config
├── .prettierrc                            # Prettier config
├── Monorepo-structure.md                  # This file
└── README.md                              # Project readme
```

## Key Architecture Decisions

### Route Groups

| Route Group | Purpose | Layout |
|-------------|---------|--------|
| `(home)` | Public marketing pages | Minimal (no sidebar) |
| `(app)` | Authenticated app | Shared sidebar + topbar |
| `(auth)` | Authentication | Split-screen |

### Email Processing Architecture (v7.1)

IMAP-based email watcher has been fully removed. Email processing uses OAuth webhooks:

```
Gmail inbox -> Google Pub/Sub -> POST /api/webhooks/gmail -> email-pipeline.ts
Outlook inbox -> Microsoft Graph -> POST /api/webhooks/microsoft -> email-pipeline.ts

Pipeline: extractContent -> checkDuplicate -> classifyType -> buildPayload -> handleHTTPRequest
```

### Database Schema (16 tables)

| Table | Purpose |
|-------|---------|
| `client_company` | Tenant companies |
| `client_info` | User accounts (password + OAuth) |
| `rfq_analysis` | RFQ analysis records (root entity) |
| `quotations` | Generated quotations (FK to rfq_analysis) |
| `customers` | Customer info (FK to rfq_analysis) |
| `email_table` | Email records (FK to rfq_analysis + quotations) |
| `file_metadata` | File attachments (FK to rfq_analysis + quotations) |
| `quotation_items` | Line items per quotation |
| `quotation_pricing` | Pricing per item |
| `supplier_search` | Supplier search results |
| `supplier_item_status` | Per-item supplier availability tracking |
| `sessions` | Processing sessions |
| `sse_connections` | SSE connection tracking |
| `user_sessions` | User session state (composite PK) |
| `workboard_snapshots` | Workboard version history |
| `email_connections` | OAuth token storage (AES-256-GCM encrypted) |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/signup` | POST | User registration |
| `/api/auth/login` | POST | User login |
| `/api/auth/logout` | POST | User logout |
| `/api/auth/me` | GET | Current user info |
| `/api/auth/verify` | GET | Token verification |
| `/api/auth/callback/google` | GET | Google OAuth callback |
| `/api/auth/callback/microsoft` | GET | Microsoft OAuth callback |
| `/api/comms` | GET/POST | Communications hub |
| `/api/webhooks/gmail` | POST | Gmail Pub/Sub push notifications |
| `/api/webhooks/microsoft` | POST | Microsoft Graph change notifications |
| `/api/cron/refresh-tokens` | GET | Token refresh cron (every 45 min) |
| `/api/preview-stream` | GET | SSE preview streaming |

### Provider Hierarchy

```
app/layout.tsx (Root)
└── Providers (ThemeProvider)
    ├── (home)/* - Theme works here
    ├── (auth)/* - Theme works here
    └── (app)/layout.tsx
        └── SidebarProvider
            └── AIChatProvider
                └── WorkboardProvider
                    └── DndContext
                        ├── dashboard/*
                        └── workspace/*
```

### Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `next dev` | Development server |
| `build` | `next build` | Production build |
| `start` | `next start` | Production server |
| `lint` | `eslint` | Linting |
| `test` | `start /B next dev && ngrok http 3000` | Dev server + ngrok tunnel |
