# QuoteFlow AI - Project Structure

> **Last Updated:** January 31, 2026
> **Version:** 5.7 (Grid Height Constraint & Panel Swap Size Exchange)

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
│   │   ├── layout.tsx ✓                   # App layout (sidebar + topbar + providers)
│   │   │                                  # Includes: SidebarProvider, AIChatProvider,
│   │   │                                  # WorkboardProvider, DndContext
│   │   │
│   │   ├── dashboard/                     # Dashboard route
│   │   │   └── page.tsx ✓                 # Dashboard page "/dashboard"
│   │   │
│   │   ├── workspace/                     # Workspace route
│   │   │   └── [quotationId]/
│   │   │       └── page.tsx ✓             # Workspace "/workspace/[quotationId]"
│   │   │                                  # Uses WorkboardGrid for dynamic panels
│   │   │
│   │   ├── storage/                       # Storage route
│   │   │   └── page.tsx                   # Storage page "/storage"
│   │   │
│   │   ├── upload/                        # Upload route
│   │   │   └── page.tsx                   # Upload page "/upload"
│   │   │
│   │   ├── settings/                      # Settings route
│   │   │   └── page.tsx                   # Settings page "/settings"
│   │   │
│   │   └── pipeline/                      # Pipeline View route
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
│   │   ├── rfq-queue/                     # RFQ Queue API
│   │   │   └── route.ts ✓                 # GET/POST /api/rfq-queue
│   │   │
│   │   ├── comms/                         # Communications API
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
│   │   ├── ai-chat/                       # AI Chat FAB components (NEW v5.0)
│   │   │   ├── index.ts ✓                 # Barrel exports
│   │   │   ├── ai-chat-provider.tsx ✓     # Context: state, position, docked status
│   │   │   ├── ai-chat-fab.tsx ✓          # Floating circular icon + badge (Bot icon)
│   │   │   ├── ai-chat-popover.tsx ✓      # Small side chatbox (click to open)
│   │   │   └── ai-chat-panel.tsx ✓        # Full panel (when docked to Workboard)
│   │   │
│   │   ├── workboard/                     # Workboard panel system (v5.3)
│   │   │   ├── index.ts ✓                 # Barrel exports
│   │   │   ├── workboard-provider.tsx ✓   # Context: layout state, panel configs
│   │   │   ├── workboard-grid.tsx ✓       # react-grid-layout with custom auto-fill
│   │   │   ├── workboard-panel.tsx ✓      # Generic draggable/resizable panel
│   │   │   ├── workboard-drop-zone.tsx ✓  # Drop target for AI Chat FAB
│   │   │   ├── panel-header.tsx ✓         # Drag handle + controls (minimize, close/hide v5.6)
│   │   │   ├── use-workboard-layout.ts ✓  # Hook: load/save layout to localStorage
│   │   │   │
│   │   │   └── panels/                    # Panel content components
│   │   │       ├── index.ts ✓             # Barrel exports
│   │   │       ├── workflow-panel-content.tsx ✓  # Workflow tracker content
│   │   │       ├── pricing-panel-content.tsx ✓   # Pricing editor content
│   │   │       └── preview-panel-content.tsx ✓   # Quotation preview + approval workflow (v5.5)
│   │   │
│   │   ├── rfq-queue/                     # RFQ Queue components
│   │   │   ├── index.ts ✓                 # Barrel exports
│   │   │   ├── rfq-queue-list.tsx ✓       # Scrollable RFQ list (top 3 visible)
│   │   │   └── rfq-queue-item.tsx ✓       # Individual RFQ item with status
│   │   │
│   │   ├── comms-hub/                     # Communications Hub components
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
│   │   ├── horizontal-scroll-container.tsx ✓ # Horizontal scroll with nav buttons (NEW v5.2)
│   │   │
│   │   └── workspace/                     # Workspace panel components (legacy)
│   │       ├── index.ts ✓                 # Barrel exports (backward compat)
│   │       ├── chat-panel.tsx ✓           # AI Chat panel placeholder
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
│   │   ├── rfq-queue/                     # RFQ Queue services
│   │   │   ├── index.ts ✓                 # Barrel exports
│   │   │   └── queue-manager.ts ✓         # Queue CRUD, filtering, mock data
│   │   │
│   │   ├── comms/                         # Communications services
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
│   │   ├── grid-layout.ts ✓               # Grid utilities: auto-fill, height calc, swap detection (v5.7)
│   │   │
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
│   ├── ai-chat.ts ✓                       # AI Chat types (NEW v5.0)
│   ├── workboard.ts ✓                     # Workboard types (NEW v5.0)
│   ├── rfq-queue.ts ✓                     # RFQ Queue types
│   ├── comms.ts ✓                         # Communications types
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
├── Chatbox_design.md ✓                    # AI Chat FAB design specification
├── Workboard_factoring.md ✓               # Workboard panel system specification
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
| **RFQ Queue** | Dynamic list | Top 3 visible, scrollable for more |
| **Documents** | Storage, Upload | File management |
| **System** | Settings, Pipeline View | Configuration & visualization |

### Workboard Panel System (v5.7)

The workspace now uses a dynamic panel system powered by `react-grid-layout` with custom auto-fill:

| Feature | Description |
|---------|-------------|
| **Resize** | Drag panel edges (se, e, s handles) to resize |
| **Reposition** | Drag panel headers to swap positions |
| **Custom Auto-Fill** | Panels expand to fill horizontal gaps (lib/utils/grid-layout.ts) |
| **Persistence** | Layout saved to localStorage with versioning |
| **Lock/Unlock** | Toggle layout editing (static mode) |
| **React-Native** | Native React component - no sync issues |
| **Drop Zone** | AI Chat FAB can be dropped to create docked panel |
| **Panel Toggle** | Circular buttons to hide/show individual panels (v5.4) |
| **Grid Height Constraint** | Fixed grid height prevents unlimited vertical expansion (NEW v5.7) |
| **Swap Size Exchange** | When panels swap positions, their sizes are also exchanged (NEW v5.7) |

#### Grid Height Constraint (v5.7)

The grid container now has a fixed height calculated from the panel layout:

| Aspect | Behavior |
|--------|----------|
| **Calculation** | `height = maxRows × rowHeight + (maxRows - 1) × marginY` |
| **Purpose** | Prevents panels from being pushed below grid boundary |
| **Effect** | When dragging panels, they swap horizontally instead of stacking vertically |
| **CSS Class** | `.workboard-grid-constrained` with `overflow: hidden` |

#### Panel Swap with Size Exchange (v5.7)

When panels swap positions during drag operations:

| Step | Action |
|------|--------|
| 1. **Pre-drag Snapshot** | Layout captured before drag starts |
| 2. **Swap Detection** | On drag stop, detect if Panel A now occupies Panel B's old position (and vice versa) |
| 3. **Size Exchange** | Panel A gets Panel B's original size, Panel B gets Panel A's original size |
| 4. **Constraints** | `minW`, `minH`, `maxW`, `maxH` are also exchanged |

**Example:**
- Preview (6×7) dragged to Workflow's position
- Preview becomes 6×2 (Workflow's original size)
- Workflow becomes 6×7 (Preview's original size)

#### Panel Toggle Buttons (v5.4)

Three circular toggle buttons in the workspace header allow users to hide/show individual panels:

| Button | Icon | Panel | Behavior |
|--------|------|-------|----------|
| Workflow | `GitBranch` | Workflow tracker | Hide/show with position preserved |
| Pricing | `DollarSign` | Pricing editor | Hide/show with position preserved |
| Preview | `FileText` | Quotation preview | Hide/show with position preserved |

**States:**
- **Active (visible)**: `bg-primary text-primary-foreground` - Panel is showing
- **Inactive (hidden)**: `bg-muted text-muted-foreground` - Panel is hidden

**Position Preservation:** When a panel is hidden, its layout position and size are saved. When shown again, the panel restores to its exact previous position.

#### Panel Close Buttons (v5.6)

All panels now have a close button (X) in their header. The behavior differs based on panel type:

| Panel | Close Button | Behavior | Restore Method |
|-------|--------------|----------|----------------|
| Workflow | "Hide panel" | Hides panel, preserves position | Click toggle icon in header |
| Pricing | "Hide panel" | Hides panel, preserves position | Click toggle icon in header |
| Preview | "Hide panel" | Hides panel, preserves position | Click toggle icon in header |
| Chat | "Close panel" | Undocks to FAB mode | Drag FAB back to workboard |

**Close Button Styling:**
- Normal: `ghost` variant, `h-6 w-6`
- Hover: `hover:bg-destructive/10 hover:text-destructive`
- Icon: `X` from lucide-react, `w-3 h-3`

**User Flow:**
1. Click close (X) on Workflow/Pricing/Preview → Panel hides → Toggle icon turns gray
2. Click gray toggle icon in workspace header → Panel restores at saved position
3. Click close (X) on Chat → Panel removed → Returns to floating FAB mode

#### Preview Panel Approval Workflow (v5.5)

The Preview panel now includes a complete approval workflow for AI-generated content:

| Section | Features |
|---------|----------|
| **Header** | Edit button, Revert button (↺), Download button, Version badge |
| **Content** | Selectable text with floating "Add Note" tooltip |
| **Footer** | Collapsible feedback section, Regenerate button, Approve button |

**Inline Feedback Flow:**
1. User selects text in preview → "Add Note" button appears above selection
2. Click → popover opens with textarea for feedback
3. Save → note stored with selected text reference
4. Notes displayed in collapsible feedback section

**Smart Tooltip Positioning:**
- Tooltip appears **above** selection if enough space, otherwise **below**
- Horizontal position clamped within container bounds
- Only triggers for selections **inside** the content area

**Action Buttons:**
- **Regenerate** (outline): Only enabled when feedback exists, sends all notes to AI
- **Approve** (success/green): Finalizes the content using `bg-success` token

> **Note:** Migrated back from Gridstack.js due to race conditions with React's rendering model (see Grid.md for analysis).

### AI Chat FAB System (v5.0)

Floating AI Chat button with drag & drop integration:

| Feature | Description |
|---------|-------------|
| **Click** | Opens side popover chatbox |
| **Drag** | Can be dragged to workboard |
| **Drop** | Creates docked chat panel in grid |
| **Undock** | Close button returns to FAB mode |

### Component Organization (v5.0)

**New Components Added:**
- `components/app/ai-chat/` - AI Chat FAB and popover system
- `components/app/workboard/` - Dynamic panel grid system
- `components/app/workboard/panels/` - Panel content components

**New Types Added:**
- `types/ai-chat.ts` - Message, Position, ChatState types
- `types/workboard.ts` - Layout, PanelConfig, GridConfig, HiddenPanelInfo, SwapResult types

**Dependencies Used:**
- `react-grid-layout` (v2.2+) - Panel resize/reposition with custom auto-fill
- `@dnd-kit/core` - Drag & drop for FAB
- `@dnd-kit/utilities` - DnD utilities

**Removed Dependencies:**
- `gridstack` - Removed due to React sync issues (see Grid.md)

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
                        ├── dashboard/* - All providers work here
                        └── workspace/* - All providers work here
```

### Shared Components

| Component | Location | Used By |
|-----------|----------|---------|
| `Logo` | `components/ui/logo.tsx` | Navbar, Topbar, Auth |
| `SidebarProvider` | `components/app/sidebar-provider.tsx` | App layout, Sidebar |
| `AIChatProvider` | `components/app/ai-chat/` | App layout, FAB, Popover, Panel |
| `WorkboardProvider` | `components/app/workboard/` | App layout, WorkboardGrid |
| `RFQQueueList` | `components/app/rfq-queue/` | Sidebar |
| `CommsHubTrigger` | `components/app/comms-hub/` | Topbar |
| Theme Toggle | `components/app/topbar.tsx` | Dashboard, Homepage |

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

## Design Token System (v5.7 Standardized)

All styling uses design tokens from `app/globals.css`. **v5.2 standardizes all components to use tokens instead of hardcoded Tailwind values.**

### Grid Layout Classes (v5.7)

| Class | Purpose |
|-------|---------|
| `.workboard-grid` | Base grid styling |
| `.workboard-grid-constrained` | Fixed height grid with overflow hidden |
| `.react-grid-placeholder` | Placeholder styling during drag |

### Color Tokens (Complete List)

| Category | Tokens | Usage |
|----------|--------|-------|
| **Backgrounds** | `bg-background`, `bg-card`, `bg-muted`, `bg-sidebar`, `bg-secondary`, `bg-accent`, `bg-popover` | Page, card, section backgrounds |
| **Text** | `text-foreground`, `text-body`, `text-muted-foreground`, `text-label`, `text-placeholder`, `text-on-dark` | Typography hierarchy |
| **Primary** | `bg-primary`, `text-primary-foreground`, `bg-primary-hover` | Buttons, CTAs |
| **Brand** | `bg-brand`, `text-brand`, `bg-brand-hover`, `bg-brand-muted`, `text-brand-light`, `text-brand-dark` | Brand accent color (sky palette) |
| **Status** | `bg-status-draft`, `bg-status-pending`, `bg-status-complete` + foreground variants | Status badges |
| **Success** | `bg-success`, `text-success-foreground`, `bg-success-hover`, `bg-success-muted` | Approve buttons (emerald palette) |
| **Destructive** | `bg-destructive`, `text-error`, `bg-error-bg`, `border-error-border` | Error states |
| **Borders** | `border-border`, `ring-ring` | Input borders, focus rings |
| **Glass** | `bg-glass`, `bg-glass-heavy` | Navbar overlays, modals |
| **Hero** | `bg-hero-orb-1`, `bg-hero-orb-2`, `bg-gradient-line`, `bg-gradient-subtle` | Decorative gradients |
| **Avatar** | `bg-avatar`, `text-avatar-foreground` | User avatars |
| **Chart** | `bg-chart-1` to `bg-chart-5` | Data visualization |
| **Sidebar** | `bg-sidebar`, `text-sidebar-foreground`, `border-sidebar-border` | Dashboard sidebar |

### Border Radius Tokens
- `rounded-sm` → `rounded-4xl` (from `--radius` base: 0.625rem)

### Token Mapping (Hardcoded → Token)

| Old Value | New Token |
|-----------|-----------|
| `slate-900` | `primary` or `foreground` |
| `slate-800` | `primary-hover` |
| `slate-700` | `label` |
| `slate-600` | `body` |
| `slate-500` | `muted-foreground` |
| `slate-400` | `placeholder` |
| `slate-200` | `border` |
| `slate-100` | `secondary` or `accent` |
| `slate-50` | `muted` |
| `sky-500` | `brand` |
| `sky-600` | `brand-hover` |
| `sky-400` | `brand-light` |
| `red-500` | `destructive` or `error` |
| `emerald-500` | `success` |
| `emerald-600` | `success-hover` |
| `emerald-50` | `success-muted` |

## Legend

- ✓ = File exists and is implemented
- Empty = Placeholder or to be implemented
