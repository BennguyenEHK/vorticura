# QuoteFlow AI - Next.js Architecture Refactoring Guide

**Date:** 2026-01-11
**Current Structure:** Express SSE Server (make_sales_sse_sever)
**Target Structure:** Next.js 16 App Router with TypeScript
**Framework:** Next.js 16 + TypeScript + Drizzle ORM + NextAuth
**Total Files to Migrate:** ~66 files (~9,943 lines of code)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Why Not Use the Old Monorepo Structure](#why-not-use-the-old-monorepo-structure)
3. [Next.js Architecture Principles](#nextjs-architecture-principles)
4. [Complete File Mapping](#complete-file-mapping)
5. [Detailed Layer-by-Layer Migration](#detailed-layer-by-layer-migration)
6. [Migration Strategy](#migration-strategy)
7. [Benefits of Next.js Structure](#benefits-of-nextjs-structure)

---

## Executive Summary

### Current Architecture (Express)
- **Type:** Monolithic SSE Server with mixed concerns
- **Backend:** Node.js/Express (`sse_server.js` - 2,092 lines)
- **Frontend:** Vanilla JavaScript with feature components
- **Database:** PostgreSQL
- **Issues:** Routes + Controllers + Services in single file

### Target Architecture (Next.js)
- **Type:** Next.js 16 App Router with clean separation of concerns
- **Full-Stack:** Unified frontend + backend in single framework
- **Database:** PostgreSQL via Drizzle ORM
- **Benefits:** File-based routing, built-in API routes, TypeScript, server components

---

## Why Not Use the Old Monorepo Structure

### ❌ Old Structure (ARCHITECTURE_REFACTOR.md) is for Express

```
apps/
├── web/              # Separate frontend app
└── admin-ui/

services/
├── api/              # Separate Express backend
│   └── app/
│       ├── routes/   # Manual route definitions
│       ├── controllers/
│       └── services/
└── worker/
```

**Problems with this for Next.js:**
1. ❌ Next.js doesn't need separate `apps/web/` - it's already a full-stack app
2. ❌ Next.js doesn't need `services/api/app/routes/` - file-based routing is automatic
3. ❌ Next.js doesn't need separate controller files - route handlers ARE controllers
4. ❌ Monorepo tooling (Nx/Turborepo) is overkill for single app

### ✅ Next.js Structure Follows Framework Conventions

```
quoteflow_ai/                # Single Next.js app (not monorepo)
├── app/                     # Next.js App Router (routes + API)
├── components/              # React components
├── lib/                     # Services, utils, db
└── types/                   # TypeScript types
```

---

## Next.js Architecture Principles

### Layer Mapping: Express → Next.js

| Layer | Express Location | Next.js Location | Why Different |
|-------|-----------------|------------------|---------------|
| **Routes** | `services/api/app/routes/*.routes.js` | `app/api/*/route.ts` | Next.js uses file-based routing |
| **Controllers** | `services/api/app/controllers/*.controller.js` | `app/api/*/route.ts` | Route handlers ARE controllers |
| **Services** | `services/api/app/services/` | `lib/services/` | ✅ Same concept |
| **Utils** | `services/api/app/utils/` | `lib/utils/` | ✅ Same concept |
| **Middleware** | `services/api/app/middleware/` | `middleware.ts` + `lib/middleware/` | Next.js has global + custom middleware |
| **Models** | `services/api/app/models/` | `types/` + `lib/db/schema.ts` | TypeScript types + Drizzle schema |
| **Frontend** | `apps/web/src/` | `app/` + `components/` | Next.js unified structure |

---

## Complete File Mapping

### 📂 Target Next.js Structure

```
quoteflow_ai/
├── app/                                    # Next.js App Router
│   ├── (auth)/                            # Route group: Authentication
│   │   ├── login/
│   │   │   └── page.tsx                   # Login page
│   │   └── signup/
│   │       └── page.tsx                   # Signup page
│   │
│   ├── (dashboard)/                       # Route group: Protected routes
│   │   ├── layout.tsx                     # Dashboard layout
│   │   ├── page.tsx                       # Dashboard home
│   │   ├── quotations/
│   │   │   ├── page.tsx                   # Quotations list page
│   │   │   └── [id]/
│   │   │       └── page.tsx               # Single quotation page
│   │   ├── workflow/
│   │   │   └── page.tsx                   # Workflow tracker page
│   │   ├── files/
│   │   │   └── page.tsx                   # File manager page
│   │   └── chat/
│   │       └── page.tsx                   # Chat page
│   │
│   ├── api/                               # API Routes (Controllers)
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts               # NextAuth handler
│   │   │
│   │   ├── webhooks/
│   │   │   ├── module-update/
│   │   │   │   └── route.ts               # POST /api/webhooks/module-update
│   │   │   ├── workflow-complete/
│   │   │   │   └── route.ts               # POST /api/webhooks/workflow-complete
│   │   │   └── make/
│   │   │       └── data-processing/
│   │   │           └── route.ts           # POST /api/webhooks/make/data-processing
│   │   │
│   │   ├── quotations/
│   │   │   ├── route.ts                   # GET/POST /api/quotations
│   │   │   ├── [id]/
│   │   │   │   └── route.ts               # GET/PUT/DELETE /api/quotations/:id
│   │   │   ├── save/
│   │   │   │   └── route.ts               # POST /api/quotations/save
│   │   │   └── pricing-variables/
│   │   │       └── route.ts               # POST /api/quotations/pricing-variables
│   │   │
│   │   ├── database/
│   │   │   ├── insert/
│   │   │   │   └── route.ts               # POST /api/database/insert
│   │   │   ├── select/
│   │   │   │   └── route.ts               # POST /api/database/select
│   │   │   ├── update/
│   │   │   │   └── route.ts               # POST /api/database/update
│   │   │   ├── delete/
│   │   │   │   └── route.ts               # DELETE /api/database/delete
│   │   │   └── stats/
│   │   │       └── route.ts               # GET /api/database/stats
│   │   │
│   │   ├── sessions/
│   │   │   ├── route.ts                   # GET /api/sessions
│   │   │   └── [sessionId]/
│   │   │       └── route.ts               # GET /api/sessions/:sessionId
│   │   │
│   │   ├── files/
│   │   │   └── [fileId]/
│   │   │       └── image/
│   │   │           └── route.ts           # GET /api/files/:fileId/image
│   │   │
│   │   ├── health/
│   │   │   ├── route.ts                   # GET /api/health
│   │   │   └── database/
│   │   │       └── route.ts               # GET /api/health/database
│   │   │
│   │   ├── events/
│   │   │   └── route.ts                   # GET /api/events (SSE endpoint)
│   │   │
│   │   └── stats/
│   │       └── route.ts                   # GET /api/stats
│   │
│   ├── layout.tsx                         # Root layout
│   ├── page.tsx                           # Home page
│   └── globals.css                        # Global styles
│
├── components/                            # React Components
│   ├── quotation/                         # Feature: Quotation
│   │   ├── FormulaInputPanel.tsx
│   │   ├── ResultPreviewPanel.tsx
│   │   └── modules/
│   │       ├── FormattingUtils.tsx
│   │       ├── CurrencyManager.tsx
│   │       ├── TestDataProvider.tsx
│   │       ├── VariableManager.tsx
│   │       ├── SearchFilter.tsx
│   │       ├── ProfitTableManager.tsx
│   │       ├── UIGenerator.tsx
│   │       ├── EventHandlers.tsx
│   │       ├── BulkUpdateManager.tsx
│   │       ├── FormulaCalculator.tsx
│   │       ├── DataLoader.tsx
│   │       ├── DisplayManager.tsx
│   │       ├── EditController.tsx
│   │       ├── DownloadController.tsx
│   │       ├── QuotationLoader.tsx
│   │       ├── SearchManager.tsx
│   │       ├── HtmlExtractor.tsx
│   │       ├── DocumentDeleter.tsx
│   │       └── ReportRenderer.tsx
│   │
│   ├── workflow/                          # Feature: Workflow
│   │   └── WorkflowTrackerPanel.tsx
│   │
│   ├── files/                             # Feature: Files
│   │   └── FileManagerPanel.tsx
│   │
│   ├── chat/                              # Feature: Chat
│   │   └── ChatInputPanel.tsx
│   │
│   ├── auth/                              # Feature: Authentication
│   │   ├── LoginForm.tsx
│   │   └── SignupForm.tsx
│   │
│   └── ui/                                # Reusable UI Components
│       ├── button.tsx
│       ├── input.tsx
│       ├── dialog.tsx
│       ├── card.tsx
│       └── table.tsx
│
├── lib/                                   # Business Logic & Utilities
│   ├── services/                          # Business Logic Layer
│   │   ├── quotation/
│   │   │   ├── data-processing-api.ts     # Unified data processing orchestrator
│   │   │   ├── quotation-processor.ts     # Quotation generation/update/calculate
│   │   │   ├── email-processor.ts         # Email generation/update
│   │   │   ├── rfq-processor.ts           # RFQ analysis processing
│   │   │   ├── suppliers-processor.ts     # Supplier search processing
│   │   │   ├── merge.ts                   # Intelligent data merging logic
│   │   │   ├── pricing-processor.ts       # Pricing variable extraction/processing
│   │   │   ├── document-generator.ts      # HTML/PDF document generation
│   │   │   ├── session-loader.ts          # Multi-table session data reconstruction
│   │   │   └── database-handler.ts        # Database CRUD orchestration
│   │   │
│   │   ├── pricing/
│   │   │   └── calculations.ts            # Pricing calculation engine (60+ formulas)
│   │   │
│   │   ├── session/
│   │   │   ├── session-manager.ts         # Named session lifecycle management
│   │   │   └── session-handler.ts         # Session storage orchestration
│   │   │
│   │   ├── sse/
│   │   │   ├── sse-broadcaster.ts         # SSE broadcasting logic
│   │   │   ├── sse-connection-manager.ts  # Client connection management
│   │   │   └── sse-database-service.ts    # SSE connection persistence
│   │   │
│   │   └── auth/
│   │       ├── jwt-service.ts             # JWT generation/validation
│   │       └── workspace-service.ts       # Workspace isolation logic
│   │
│   ├── utils/                             # Helper Functions (Pure, No Business Logic)
│   │   ├── formatting/
│   │   │   ├── currency.ts                # Currency formatting
│   │   │   ├── date.ts                    # Date formatting
│   │   │   ├── mime-types.ts              # Image MIME type mapping
│   │   │   ├── sanitize.ts                # Field sanitization
│   │   │   └── uptime.ts                  # Uptime formatting
│   │   │
│   │   ├── validation/
│   │   │   ├── quotation-validator.ts     # Quotation input validation
│   │   │   ├── email-validator.ts         # Email input validation
│   │   │   ├── input-validator.ts         # Generic field validation
│   │   │   └── schemas.ts                 # Zod validation schemas
│   │   │
│   │   ├── generators/
│   │   │   ├── id-generator.ts            # Generate unique IDs
│   │   │   └── token-generator.ts         # Generate tokens
│   │   │
│   │   └── config/
│   │       └── config-loader.ts           # Load configuration files
│   │
│   ├── db/                                # Database Layer
│   │   ├── client.ts                      # Drizzle client instance
│   │   ├── schema.ts                      # Drizzle schema definitions
│   │   ├── queries.ts                     # Reusable database queries
│   │   ├── workspace-helper.ts            # Workspace-aware database wrapper
│   │   └── migrations/
│   │       └── migrate.ts                 # Migration runner
│   │
│   ├── middleware/                        # Custom Middleware Helpers
│   │   ├── workspace-context.ts           # Workspace context creation
│   │   └── auth-helpers.ts                # Authentication helper functions
│   │
│   └── auth.ts                            # NextAuth configuration
│
├── types/                                 # TypeScript Type Definitions
│   ├── quotation.ts                       # Quotation DTOs and types
│   ├── email.ts                           # Email DTOs and types
│   ├── rfq.ts                             # RFQ analysis types
│   ├── suppliers.ts                       # Suppliers search types
│   ├── session.ts                         # Session types
│   ├── user.ts                            # User types
│   ├── workspace.ts                       # Workspace types
│   ├── api.ts                             # API request/response types
│   └── database.ts                        # Database schema types
│
├── public/                                # Static Assets
│   ├── templates/
│   │   ├── quotation-template.html        # Quotation HTML template
│   │   └── email-template.html            # Email HTML template
│   ├── assets/
│   │   ├── logos/                         # Company logos
│   │   ├── signatures/                    # Digital signatures
│   │   └── generated/                     # Generated quotation files
│   └── favicon.ico
│
├── drizzle/                               # Drizzle ORM
│   ├── migrations/                        # Database migrations
│   └── schema/                            # Schema backups
│
├── scripts/                               # Utility Scripts
│   ├── session-manager.ts                 # Session lifecycle CLI
│   ├── port-manager.ts                    # Port conflict resolution
│   ├── generate-token.ts                  # Token generation utility
│   └── show-config.ts                     # Display configuration
│
├── tests/                                 # Tests
│   ├── unit/                              # Unit tests
│   │   ├── services/
│   │   └── utils/
│   ├── integration/                       # Integration tests
│   │   ├── api/
│   │   └── quotation/
│   └── fixtures/                          # Test data
│       ├── quotations/
│       └── data-modifier.ts
│
├── config/                                # Configuration Files
│   ├── environments.json                  # Multi-environment settings
│   ├── demo-users.json                    # Demo user data
│   └── workspace.config.ts                # Workspace isolation settings
│
├── .env.example                           # Environment variables template
├── .eslintrc.json                         # ESLint config
├── .prettierrc                            # Prettier config
├── drizzle.config.ts                      # Drizzle configuration
├── middleware.ts                          # Global Next.js middleware
├── next.config.ts                         # Next.js configuration
├── package.json                           # Dependencies
├── tailwind.config.ts                     # Tailwind CSS config
├── tsconfig.json                          # TypeScript config
└── README.md                              # Documentation
```

---

## Detailed Layer-by-Layer Migration

### 1️⃣ API Routes (Controllers + Routers Combined)

In Next.js, **API routes ARE the controllers**. There are no separate router files.

#### 📋 File Mapping: Express → Next.js

| Current File (Express) | Lines | Type | Target File (Next.js) | Notes |
|------------------------|-------|------|----------------------|-------|
| `sse_server.js::handleModuleUpdate()` | 855-955 | Controller | `app/api/webhooks/module-update/route.ts` | Webhook handler |
| `sse_server.js::handleWorkflowComplete()` | 961-1054 | Controller | `app/api/webhooks/workflow-complete/route.ts` | Webhook handler |
| `sse_server.js::handleMakeWebhook()` | 1115-1128 | Controller | `app/api/webhooks/make/data-processing/route.ts` | Make.com webhook |
| `sse_server.js::handleDataProcessing()` | 1097-1109 | Controller | `app/api/quotations/route.ts` | POST handler |
| `sse_server.js::handleSaveQuotation()` | 1133-1179 | Controller | `app/api/quotations/save/route.ts` | Save quotation |
| `sse_server.js::handleUpdatePricingVariables()` | 1184-1238 | Controller | `app/api/quotations/pricing-variables/route.ts` | Update pricing |
| `api/auth/login.js` | Full | Controller | `app/api/auth/[...nextauth]/route.ts` | Use NextAuth |
| `api/auth/signup.js` | Full | Controller | `app/api/auth/[...nextauth]/route.ts` | Use NextAuth |
| `sse_server.js::handleGetSession()` | 1250-1291 | Controller | `app/api/sessions/[sessionId]/route.ts` | Get session by ID |
| `sse_server.js::handleGetSessions()` | 1296-1326 | Controller | `app/api/sessions/route.ts` | List sessions |
| `utils/database/front_db.js::handleGenericInsert()` | ~100 | Controller | `app/api/database/insert/route.ts` | Generic insert |
| `utils/database/front_db.js::handleGenericSelect()` | ~80 | Controller | `app/api/database/select/route.ts` | Generic select |
| `utils/database/front_db.js::handleGenericUpdate()` | ~80 | Controller | `app/api/database/update/route.ts` | Generic update |
| `utils/database/front_db.js::handleGenericDelete()` | ~80 | Controller | `app/api/database/delete/route.ts` | Generic delete |
| `utils/database/front_db.js::handleServeImageBinary()` | ~50 | Controller | `app/api/files/[fileId]/image/route.ts` | Serve images |
| `sse_server.js::handleHealthCheck()` | 1335-1374 | Controller | `app/api/health/route.ts` | Health check |
| `sse_server.js::handleDatabaseHealth()` | 1379-1406 | Controller | `app/api/health/database/route.ts` | Database health |
| `sse_server.js::handleDatabaseStats()` | 1411-1463 | Controller | `app/api/database/stats/route.ts` | Database stats |
| `sse_server.js::handleSystemStats()` | 1468-1508 | Controller | `app/api/stats/route.ts` | System stats |
| `sse_server.js::initializeSSE()` + `/events handler` | 703-810 | Controller | `app/api/events/route.ts` | SSE endpoint |

**Total API Routes:** 19 route files

---

### 2️⃣ Services (Business Logic Layer)

Services remain similar to the old structure, moved to `lib/services/`.

#### 📋 File Mapping: Express → Next.js

| Current File | Lines | Type | Target File | Purpose |
|--------------|-------|------|-------------|---------|
| `api/data-processing.js::DataProcessingAPI` | 600+ | Service | `lib/services/quotation/data-processing-api.ts` | Unified data processing orchestrator |
| `api/processor/quotation-processor.js` | Full | Service | `lib/services/quotation/quotation-processor.ts` | Quotation workflow orchestration |
| `api/processor/email-processor.js` | Full | Service | `lib/services/quotation/email-processor.ts` | Email workflow orchestration |
| `api/processor/RFQanalysis-processor.js` | Full | Service | `lib/services/quotation/rfq-processor.ts` | RFQ analysis processing |
| `api/processor/suppliers-processor.js` | Full | Service | `lib/services/quotation/suppliers-processor.ts` | Supplier search processing |
| `api/quotation/merge.js` | 304 | Service | `lib/services/quotation/merge.ts` | Data merging logic |
| `api/quotation/pricing-processor.js` | 446 | Service | `lib/services/quotation/pricing-processor.ts` | Pricing variable processing |
| `api/quotation/document-generator.js` | 505 | Service | `lib/services/quotation/document-generator.ts` | HTML/PDF generation |
| `api/quotation/session-loader.js` | 456 | Service | `lib/services/quotation/session-loader.ts` | Session data reconstruction |
| `api/quotation/database-handler.js` | 283 | Service | `lib/services/quotation/database-handler.ts` | Database CRUD orchestration |
| `utils/quotation_price_calculations.js` | 60+ methods | Service | `lib/services/pricing/calculations.ts` | Pricing calculation engine |
| `utils/session-manager.js` | Full | Service | `lib/services/session/session-manager.ts` | Session lifecycle management |
| `api/quotation/session-handler.js` | 100 | Service | `lib/services/session/session-handler.ts` | Session storage logic |
| `sse_server.js::broadcastToAllClients()` | 1582-1606 | Service | `lib/services/sse/sse-broadcaster.ts` | SSE broadcasting |
| `sse_server.js::sendSSEMessage()` | 1570-1577 | Service | `lib/services/sse/sse-broadcaster.ts` | Send SSE message |
| `sse_server.js::registerSSEConnectionDB()` | 1676-1743 | Service | `lib/services/sse/sse-database-service.ts` | Register SSE connection |
| `sse_server.js::updateSSEConnectionStatusDB()` | 1750-1801 | Service | `lib/services/sse/sse-database-service.ts` | Update SSE status |
| `sse_server.js::cleanupClient()` | 1806-1827 | Service | `lib/services/sse/sse-connection-manager.ts` | Client cleanup |
| `utils/database/database.js::DatabaseManager` | 569 | Service | `lib/db/client.ts` | Database connection pool |
| `utils/database/database-helper.js::WorkspaceDatabaseHelper` | 228 | Service | `lib/db/workspace-helper.ts` | Workspace-aware DB wrapper |
| `utils/database/front_db.js` (non-controller) | ~900 | Service | `lib/db/queries.ts` | Database query functions |
| `utils/auth_account/auth-middleware.js` (non-middleware) | ~150 | Service | `lib/services/auth/jwt-service.ts` | JWT generation/validation |
| `utils/auth_account/workspace-context.js` | 153 | Service | `lib/services/auth/workspace-service.ts` | Workspace context logic |

**Total Services:** 23 service files

---

### 3️⃣ Utils (Helper Functions)

Pure helper functions with no business logic.

#### 📋 File Mapping: Express → Next.js

| Current File | Lines | Type | Target File | Purpose |
|--------------|-------|------|-------------|---------|
| `api/quotation/utils.js::formatters` | ~100 | Util | `lib/utils/formatting/mime-types.ts` | Image MIME types |
| `api/quotation/utils.js::formatters` | ~100 | Util | `lib/utils/formatting/sanitize.ts` | Field sanitization |
| `api/quotation/validator.js` | ~400 | Util | `lib/utils/validation/quotation-validator.ts` | Quotation validation |
| `utils/input-validator.js` | Full | Util | `lib/utils/validation/input-validator.ts` | Field validation |
| `sse_server.js::generateClientId()` | 1611-1613 | Util | `lib/utils/generators/id-generator.ts` | Generate client ID |
| `sse_server.js::generateSessionId()` | 1618-1620 | Util | `lib/utils/generators/id-generator.ts` | Generate session ID |
| `sse_server.js::getModuleIcon()` | 1632-1648 | Util | `lib/utils/formatting/icons.ts` | Map module to emoji |
| `sse_server.js::formatUptime()` | 1653-1663 | Util | `lib/utils/formatting/uptime.ts` | Format uptime |
| `utils/config-loader.js` | Full | Util | `lib/utils/config/config-loader.ts` | Load config files |
| `database/migrate.js` | 476 | Util | `lib/db/migrations/migrate.ts` | Migration runner |

**Total Utils:** 10 utility files

---

### 4️⃣ Middleware

#### 📋 File Mapping: Express → Next.js

| Current File | Lines | Type | Target File | Purpose |
|--------------|-------|------|-------------|---------|
| `sse_server.js::initializeMiddleware()` | 193-345 | Middleware | `middleware.ts` | Global middleware (CORS, auth redirect) |
| `sse_server.js` (login-redirect) | 235-330 | Middleware | `middleware.ts` | Auth check + redirect |
| `utils/auth_account/auth-middleware.js::authenticateAndAttachContext` | ~80 | Middleware | `lib/middleware/auth-helpers.ts` | JWT verification |
| `utils/auth_account/auth-middleware.js::checkAuthOrRedirect` | ~50 | Middleware | `middleware.ts` | Auth check with redirect |

**Total Middleware:** 1 global + 1 helper file

---

### 5️⃣ Frontend Components

#### 📋 File Mapping: Express → Next.js

| Current File | Lines | Type | Target File | Purpose |
|--------------|-------|------|-------------|---------|
| `frontend/formula-input.js` | 286 | Component | `components/quotation/FormulaInputPanel.tsx` | Pricing variable orchestrator |
| `frontend/result-preview.js` | 393 | Component | `components/quotation/ResultPreviewPanel.tsx` | Quotation display |
| `frontend/workflow-tracker.js` | 311 | Component | `components/workflow/WorkflowTrackerPanel.tsx` | Workflow status display |
| `frontend/file-manager.js` | 645 | Component | `components/files/FileManagerPanel.tsx` | File upload manager |
| `frontend/chat-input.js` | 458 | Component | `components/chat/ChatInputPanel.tsx` | Chat/messaging interface |
| `frontend/components/source/formula-input/*.js` (11 files) | ~800 | Module | `components/quotation/modules/*.tsx` | Formula input modules |
| `frontend/components/source/result-preview/*.js` (8 files) | ~600 | Module | `components/quotation/modules/*.tsx` | Result preview modules |
| `frontend/components/source/state-manager.js` | ~150 | State | `lib/hooks/useAppState.ts` | Convert to React Context/Zustand |
| `frontend/components/source/session-manager.js` | ~100 | State | `lib/hooks/useSession.ts` | Session persistence hook |
| `frontend/components/source/url-state-manager.js` | ~80 | State | `lib/hooks/useUrlState.ts` | Browser navigation hook |

**Total Frontend Files:** ~30 component/module files

---

### 6️⃣ Pages (Views)

#### 📋 File Mapping: Express → Next.js

| Current File | Type | Target File | Purpose |
|--------------|------|-------------|---------|
| `frontend/index.html` | View | `app/(dashboard)/page.tsx` | Main dashboard |
| `frontend/login.html` | View | `app/(auth)/login/page.tsx` | Login page |
| `frontend/signup.html` | View | `app/(auth)/signup/page.tsx` | Signup page |

---

### 7️⃣ Styles

#### 📋 File Mapping: Express → Next.js

| Current File | Type | Target File | Notes |
|--------------|------|-------------|-------|
| `frontend/main.css` | Style | `app/globals.css` | Global styles (convert to Tailwind) |
| `frontend/login.css` | Style | Inline in component | Use Tailwind utility classes |
| `frontend/signup.css` | Style | Inline in component | Use Tailwind utility classes |
| `frontend/formula-input.css` | Style | Inline in component | Use Tailwind utility classes |
| `frontend/result-preview.css` | Style | Inline in component | Use Tailwind utility classes |
| `frontend/file-manager.css` | Style | Inline in component | Use Tailwind utility classes |
| `frontend/chat-input.css` | Style | Inline in component | Use Tailwind utility classes |
| `frontend/workflow-tracker.css` | Style | Inline in component | Use Tailwind utility classes |

**Note:** Convert CSS to Tailwind CSS utility classes

---

### 8️⃣ Static Assets

#### 📋 File Mapping: Express → Next.js

| Current File | Type | Target File |
|--------------|------|-------------|
| `assets/template/default-template.html` | Template | `public/templates/quotation-template.html` |
| `assets/template/report-template.html` | Template | `public/templates/email-template.html` |
| `assets/logo/*.png` | Asset | `public/assets/logos/*.png` |
| `assets/signature/*.png` | Asset | `public/assets/signatures/*.png` |
| `assets/generated/*.html` | Generated | `public/assets/generated/*.html` |

---

### 9️⃣ Database

#### 📋 File Mapping: Express → Next.js

| Current File | Type | Target File | Notes |
|--------------|------|-------------|-------|
| `database/quoteflow_database_schema.sql` | Schema | `lib/db/schema.ts` | Convert to Drizzle schema |
| `database/backup/*.sql` | Backup | `drizzle/schema/*.sql` | Keep as reference |
| `database/migrations/*.sql` | Migration | `drizzle/migrations/*.sql` | Convert to Drizzle migrations |

---

### 🔟 Configuration & Scripts

#### 📋 File Mapping: Express → Next.js

| Current File | Type | Target File |
|--------------|------|-------------|
| `config/app-config.json` | Config | `config/environments.json` |
| `config/user_info.json` | Config | `config/demo-users.json` |
| `config/workspace-config.js` | Config | `config/workspace.config.ts` |
| `.env.example` | Config | `.env.example` |
| `scripts/manage-sessions.js` | Script | `scripts/session-manager.ts` |
| `scripts/show-config.js` | Script | `scripts/show-config.ts` |
| `scripts/port-cleanup.js` | Script | `scripts/port-manager.ts` |
| `scripts/generate-make-token.js` | Script | `scripts/generate-token.ts` |

---

### 1️⃣1️⃣ Tests

#### 📋 File Mapping: Express → Next.js

| Current File | Type | Target File |
|--------------|------|-------------|
| `test-auto-database.js` | Test | `tests/integration/database/auto-database.test.ts` |
| `test-quotation-update.json` | Fixture | `tests/fixtures/quotations/update-sample.json` |
| `test_quotation_input*.json` | Fixture | `tests/fixtures/quotations/input-samples.json` |
| `data_modify.js` | Fixture | `tests/fixtures/data-modifier.ts` |

---

## Migration Strategy

### Phase 1: Setup Next.js Project (Week 1)

#### ✅ Tasks:
1. Initialize Next.js 16 with TypeScript
2. Install dependencies (Drizzle, NextAuth, Tailwind)
3. Setup folder structure
4. Configure build tools

#### 📝 Commands:
```bash
# Already done - you have Next.js 16 setup
cd quoteflow_ai

# Install additional dependencies if needed
npm install @neondatabase/serverless drizzle-orm next-auth zod
npm install -D drizzle-kit
```

---

### Phase 2: Database Layer Migration (Week 2)

#### ✅ Tasks:
1. Convert PostgreSQL schema to Drizzle schema
2. Setup database client
3. Create migration runner
4. Migrate database helper functions

#### 📁 Files to create:
- `lib/db/client.ts`
- `lib/db/schema.ts`
- `lib/db/queries.ts`
- `lib/db/workspace-helper.ts`
- `lib/db/migrations/migrate.ts`

---

### Phase 3: Services Layer Migration (Week 3-4)

#### ✅ Tasks:
1. Migrate quotation services
2. Migrate pricing services
3. Migrate session services
4. Migrate SSE services
5. Migrate auth services

#### 📁 Files to create:
- `lib/services/quotation/*.ts` (10 files)
- `lib/services/pricing/calculations.ts`
- `lib/services/session/*.ts` (2 files)
- `lib/services/sse/*.ts` (3 files)
- `lib/services/auth/*.ts` (2 files)

---

### Phase 4: Utils Layer Migration (Week 5)

#### ✅ Tasks:
1. Migrate formatting utils
2. Migrate validation utils
3. Migrate generator utils
4. Migrate config utils

#### 📁 Files to create:
- `lib/utils/formatting/*.ts` (5 files)
- `lib/utils/validation/*.ts` (3 files)
- `lib/utils/generators/*.ts` (2 files)
- `lib/utils/config/config-loader.ts`

---

### Phase 5: API Routes Migration (Week 6-7)

#### ✅ Tasks:
1. Create webhook API routes
2. Create quotation API routes
3. Create database API routes
4. Create session API routes
5. Create health API routes
6. Create SSE API route
7. Setup NextAuth

#### 📁 Files to create:
- `app/api/webhooks/*/route.ts` (3 files)
- `app/api/quotations/*/route.ts` (3 files)
- `app/api/database/*/route.ts` (5 files)
- `app/api/sessions/*/route.ts` (2 files)
- `app/api/health/*/route.ts` (2 files)
- `app/api/events/route.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `app/api/files/[fileId]/image/route.ts`
- `app/api/stats/route.ts`

---

### Phase 6: Frontend Migration (Week 8-9)

#### ✅ Tasks:
1. Convert HTML pages to React components
2. Migrate feature components (quotation, workflow, files, chat)
3. Convert vanilla JS to React hooks
4. Setup state management (Context API or Zustand)
5. Convert CSS to Tailwind

#### 📁 Files to create:
- `app/(auth)/login/page.tsx`
- `app/(auth)/signup/page.tsx`
- `app/(dashboard)/page.tsx`
- `components/quotation/*.tsx` (20+ files)
- `components/workflow/WorkflowTrackerPanel.tsx`
- `components/files/FileManagerPanel.tsx`
- `components/chat/ChatInputPanel.tsx`
- `lib/hooks/*.ts` (state management hooks)

---

### Phase 7: Middleware & Auth (Week 10)

#### ✅ Tasks:
1. Setup NextAuth configuration
2. Create global middleware
3. Create auth helper middleware
4. Setup workspace context

#### 📁 Files to create:
- `lib/auth.ts`
- `middleware.ts`
- `lib/middleware/auth-helpers.ts`
- `lib/middleware/workspace-context.ts`

---

### Phase 8: Testing & Validation (Week 11-12)

#### ✅ Tasks:
1. Write unit tests for services
2. Write integration tests for API routes
3. Write E2E tests for workflows
4. Performance testing
5. Bug fixing

#### 📁 Files to create:
- `tests/unit/services/*.test.ts`
- `tests/integration/api/*.test.ts`
- `tests/e2e/*.spec.ts`

---

## Benefits of Next.js Structure

### ✅ Advantages Over Express Structure

| Benefit | Express Structure | Next.js Structure | Impact |
|---------|------------------|-------------------|--------|
| **File-based Routing** | Manual route definitions | Automatic routing | 50% less boilerplate |
| **Full-Stack Framework** | Separate frontend + backend | Unified application | Easier development |
| **TypeScript Native** | Requires manual setup | Built-in support | Type safety by default |
| **API Routes** | Separate controllers + routers | Route handlers (2-in-1) | Cleaner code |
| **Server Components** | N/A | React Server Components | Better performance |
| **Static Assets** | Express static middleware | public/ folder | Simplified serving |
| **Middleware** | Custom Express middleware | Next.js middleware | Better DX |
| **Database ORM** | Manual PostgreSQL | Drizzle ORM | Type-safe queries |
| **Authentication** | Manual JWT | NextAuth (built-in) | Faster implementation |
| **Build & Deploy** | Custom scripts | Next.js build | Production-ready |

---

### ✅ Code Reduction

| Category | Express LOC | Next.js LOC | Reduction |
|----------|------------|-------------|-----------|
| Route definitions | ~330 | 0 (automatic) | 100% |
| Middleware setup | ~200 | ~50 | 75% |
| Static file serving | ~100 | 0 (built-in) | 100% |
| Auth boilerplate | ~200 | ~50 | 75% |
| **Total Savings** | **~830 lines** | **~100 lines** | **88%** |

---

### ✅ Developer Experience Improvements

1. **Hot Module Replacement (HMR)** - Instant feedback during development
2. **TypeScript** - Catch errors at compile time
3. **File-based Routing** - No manual route configuration
4. **Built-in Optimizations** - Image optimization, code splitting, etc.
5. **Unified Codebase** - Frontend + backend in one repo
6. **Better Debugging** - Source maps, error overlay
7. **Vercel Deployment** - One-click deployment

---

## Comparison: Old vs New Structure

### ❌ Old Structure (Express)

```
make_sales_sse_sever/
├── sse_server.js               # 2,092 lines (routes + controllers + services)
├── api/
│   ├── data-processing.js      # Service (in api/ folder - confusing)
│   ├── processor/              # Services
│   └── quotation/              # Mixed controllers + services + utils
├── utils/                      # Mixed services + utils
├── frontend/                   # Vanilla JS + HTML + CSS
└── database/                   # SQL files

Issues:
❌ Routes + controllers + services in single 2,092-line file
❌ Unclear separation between api/ and utils/
❌ Hard to test (tight coupling)
❌ Manual route configuration
❌ No TypeScript
❌ Separate frontend/backend
```

---

### ✅ New Structure (Next.js)

```
quoteflow_ai/
├── app/
│   ├── (auth)/                 # Auth pages (login, signup)
│   ├── (dashboard)/            # Protected pages
│   └── api/                    # API routes (19 files, max 150 lines each)
│
├── components/                 # React components (feature-based)
│   ├── quotation/
│   ├── workflow/
│   ├── files/
│   └── chat/
│
├── lib/
│   ├── services/               # Business logic (23 files)
│   ├── utils/                  # Helpers (10 files)
│   ├── db/                     # Database layer (Drizzle ORM)
│   └── middleware/             # Custom middleware
│
├── types/                      # TypeScript types
├── public/                     # Static assets
└── drizzle/                    # Database migrations

Benefits:
✅ Clear separation: API routes → Services → Utils → DB
✅ File-based routing (automatic)
✅ TypeScript for type safety
✅ Max 300 lines per file
✅ Easy to test (services isolated)
✅ Unified frontend + backend
✅ Production-ready framework
```

---

## File Count Summary

| Category | Express Files | Next.js Files | Change |
|----------|--------------|--------------|--------|
| **Routes** | 1 (embedded in sse_server.js) | 19 (separate route.ts files) | +18 |
| **Controllers** | 4 | 0 (merged into routes) | -4 |
| **Services** | 16 | 23 | +7 |
| **Utils** | 6 | 10 | +4 |
| **Middleware** | 4 | 2 | -2 |
| **Components** | 28 | 30 | +2 |
| **Pages** | 3 HTML | 3 TSX | 0 |
| **Config** | 6 | 6 | 0 |
| **Total** | **68 files** | **93 files** | **+25** |

**Note:** More files but better organized. Each file has clear responsibility and <300 lines.

---

## Key Differences from ARCHITECTURE_REFACTOR.md

| Aspect | ARCHITECTURE_REFACTOR.md (Express) | This Document (Next.js) |
|--------|-----------------------------------|------------------------|
| **Framework** | Express.js | Next.js 16 |
| **Routing** | Manual route files | File-based routing |
| **Controllers** | Separate controller files | Merged into route.ts files |
| **Structure** | Monorepo (apps/ + services/) | Single app structure |
| **Frontend** | Vanilla JS | React + TypeScript |
| **Database** | Raw PostgreSQL | Drizzle ORM |
| **Auth** | Manual JWT | NextAuth |
| **Deployment** | Custom | Vercel/Node.js |
| **Complexity** | High (monorepo tooling) | Medium (framework conventions) |

---

## Conclusion

This refactoring guide provides a **complete, file-by-file migration plan** from the Express-based SSE server to a modern Next.js 16 application.

### ✅ Key Takeaways:

1. **Don't copy the Express structure** - Next.js has better conventions
2. **API routes ARE controllers** - No need for separate files
3. **Services remain similar** - Move to `lib/services/`
4. **Utils remain similar** - Move to `lib/utils/`
5. **TypeScript everywhere** - Type safety by default
6. **Feature-based components** - Better organization
7. **12-week migration timeline** - Incremental, low-risk approach

### 📊 Expected Outcomes:

- **88% reduction** in boilerplate code
- **100% TypeScript** coverage
- **File-based routing** (no manual configuration)
- **Better developer experience** (HMR, error overlay, etc.)
- **Production-ready** architecture
- **Easier testing** (isolated services)
- **Faster development** (unified codebase)

---

**Document Version:** 2.0
**Framework:** Next.js 16 + TypeScript
**Last Updated:** 2026-01-11
**Status:** Ready for Implementation
**Author:** Architecture Migration System
