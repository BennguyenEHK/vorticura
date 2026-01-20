quoteflow_ai/
├── app/                                    # Next.js App Router
│   ├── (auth)/                            # Route group: Authentication
│   │   ├── layout.tsx ✓                   # Auth layout (split-screen)
│   │   ├── login/
│   │   │   └── page.tsx ✓                 # Login page
│   │   └── signup/
│   │       └── page.tsx ✓                 # Signup page
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
│   │   │   ├── signup/
│   │   │   │   └── route.ts ✓             # POST /api/auth/signup
│   │   │   ├── login/
│   │   │   │   └── route.ts ✓             # POST /api/auth/login
│   │   │   ├── logout/
│   │   │   │   └── route.ts ✓             # POST /api/auth/logout
│   │   │   ├── me/
│   │   │   │   └── route.ts ✓             # GET /api/auth/me
│   │   │   └── verify/
│   │   │       └── route.ts ✓             # GET /api/auth/verify
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
│   │   └── AuthForm.tsx ✓                 # Reusable auth form (login/signup)
│   │
│   └── ui/                                # Reusable UI Components
│       ├── button.tsx ✓                   # Button component
│       ├── input.tsx ✓                    # Input component
│       ├── label.tsx ✓                    # Label component
│       ├── form.tsx ✓                     # Form components (React Hook Form)
│       ├── card.tsx ✓                     # Card component
│       ├── dialog.tsx                     # Dialog component
│       └── table.tsx                      # Table component
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
│   │       └── workspace-service.ts ✓       # Workspace isolation logic
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
│   │   │   └── schemas.ts ✓               # Zod validation schemas (auth)
│   │   │
│   │   ├── generators/
│   │   │   ├── id-generator.ts            # Generate unique IDs
│   │   │   └── token-generator.ts         # Generate tokens
│   │   │
│   │   ├── config/
│   │   │   └── config-loader.ts           # Load configuration files
│   │   │
│   │   └── api/
│   │       └── get-workspace.ts  ✓          # Extract workspace from API request
│   │
│   ├── db/                                # Database Layer
│   │   ├── client.ts ✓                    # Drizzle client instance
│   │   ├── schema.ts ✓                    # Drizzle schema definitions
│   │   ├── queries.ts ✓                   # Reusable database queries
│   │   ├── workspace-helper.ts ✓          # Workspace-aware database wrapper
│   │   └── migrations/
│   │       └── migrate.ts ✓               # Migration runner
│   │
│   └── middleware/                        # Custom Middleware Helpers
│       ├── workspace-context.ts ✓         # Workspace context creation
│       └── auth-helpers.ts ✓              # Authentication helper functions (JWT + cookies)
│
├── types/                                 # TypeScript Type Definitions
│   ├── quotation.ts                       # Quotation DTOs and types
│   ├── email.ts                           # Email DTOs and types
│   ├── rfq.ts                             # RFQ analysis types
│   ├── suppliers.ts                       # Suppliers search types
│   ├── session.ts                         # Session types
│   ├── user.ts                            # User types
│   ├── workspace.ts ✓                     # Workspace types
│   ├── api.ts                             # API request/response types
│   └── database.ts ✓                      # Database schema types
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
│   └── workspace.config.ts ✓              # Workspace isolation settings
│
├── .env.example                           # Environment variables template
├── .eslintrc.json                         # ESLint config
├── .prettierrc                            # Prettier config
├── drizzle.config.ts ✓                    # Drizzle configuration
├── middleware.ts  ✓                         # Global Next.js middleware
├── next.config.ts                         # Next.js configuration
├── package.json                           # Dependencies
├── tailwind.config.ts                     # Tailwind CSS config
├── tsconfig.json                          # TypeScript config
└── README.md                              # Documentation