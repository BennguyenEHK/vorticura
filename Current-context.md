 Complete Dataflow: Two Users Login → Workspace Isolation

  Scenario Setup

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  Company: ABC Corp (company_id = 100)                                       │
  │  ├── User A: Alice (client_id = 10, role = 'manager')                       │
  │  └── User B: Bob   (client_id = 20, role = 'user')                          │
  │                                                                             │
  │  Both users login at the exact same time → Each gets isolated workspace     │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 1: LOGIN REQUEST (Simultaneous)

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 1: HTTP POST Request                                                  │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  User A (Alice):                         User B (Bob):                      │
  │  POST /api/auth/login                    POST /api/auth/login               │
  │  {                                       {                                  │
  │    "username": "alice",                    "username": "bob",               │
  │    "password": "alice123"                  "password": "bob456"             │
  │  }                                       }                                  │
  │                                                                             │
  │  📁 File: app/api/auth/login/route.ts (PLANNED - from AUTHENTICATION_REFACTOR.md)
  │  📍 Lines: 635-637 (Extract credentials from request body)                  │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 2: DATABASE LOOKUP (Check User Exists)

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 2: Query client_info Table                                            │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  📁 File: app/api/auth/login/route.ts (PLANNED)                             │
  │  📍 Lines: 648-660                                                          │
  │                                                                             │
  │  const users = await db                                                     │
  │    .select({                                                                │
  │      clientId: clientInfo.clientId,      ← Returns unique user ID          │
  │      companyId: clientInfo.companyId,    ← Returns shared company ID       │
  │      username: clientInfo.username,                                         │
  │      passwordHash: clientInfo.passwordHash,                                 │
  │      role: clientInfo.clientRole,                                           │
  │      status: clientInfo.clientStatus,                                       │
  │    })                                                                       │
  │    .from(clientInfo)                                                        │
  │    .where(eq(clientInfo.username, username))                                │
  │    .limit(1);                                                               │
  │                                                                             │
  │  📁 File: lib/db/schema.ts                                                  │
  │  📍 Lines: 46-71 (clientInfo table definition)                              │
  │                                                                             │
  │  ┌─────────────────────────────┐     ┌─────────────────────────────┐       │
  │  │ User A Query Result:        │     │ User B Query Result:        │       │
  │  │ {                           │     │ {                           │       │
  │  │   clientId: 10,       ←UNIQUE     │   clientId: 20,       ←UNIQUE      │
  │  │   companyId: 100,     ←SHARED     │   companyId: 100,     ←SHARED      │
  │  │   username: 'alice',        │     │   username: 'bob',          │       │
  │  │   passwordHash: '$2a$...',  │     │   passwordHash: '$2b$...',  │       │
  │  │   role: 'manager',          │     │   role: 'user',             │       │
  │  │   status: 'active'          │     │   status: 'active'          │       │
  │  │ }                           │     │ }                           │       │
  │  └─────────────────────────────┘     └─────────────────────────────┘       │
  │                                                                             │
  │  🔑 KEY POINT: Both users share company_id=100, but have DIFFERENT client_id│
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 3: PASSWORD VERIFICATION

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 3: Verify Password with bcrypt                                        │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  📁 File: app/api/auth/login/route.ts (PLANNED)                             │
  │  📍 Lines: 679-687                                                          │
  │                                                                             │
  │  // Verify password (corresponds to login.js:69)                            │
  │  const isValidPassword = await compare(password, user.passwordHash);        │
  │                                                                             │
  │  User A: compare('alice123', '$2a$10$...') → ✅ true                        │
  │  User B: compare('bob456', '$2b$10$...')   → ✅ true                        │
  │                                                                             │
  │  If password invalid → Return 401 Unauthorized                              │
  │  If account inactive → Return 403 Forbidden                                 │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 4: JWT TOKEN GENERATION (CRITICAL SEPARATION POINT)

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 4: Generate Unique JWT Token for Each User                            │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  📁 File: lib/middleware/auth-helpers.ts (EXISTS)                           │
  │  📍 Lines: 66-75                                                            │
  │                                                                             │
  │  export async function generateJWT(user: JWTPayload, expiresIn: string = '7d'): Promise<string> {
  │    const token = await new SignJWT({ ...user })                             │
  │      .setProtectedHeader({ alg: 'HS256' })                                  │
  │      .setExpirationTime(expiresIn)                                          │
  │      .setIssuedAt()                                                         │
  │      .sign(JWT_SECRET);                                                     │
  │    return token;                                                            │
  │  }                                                                          │
  │                                                                             │
  │  📁 File: app/api/auth/login/route.ts (PLANNED)                             │
  │  📍 Lines: 708-713                                                          │
  │                                                                             │
  │  const token = await generateJWT({                                          │
  │    client_id: user.clientId,      ← UNIQUE per user                        │
  │    company_id: user.companyId,    ← Shared within company                  │
  │    username: user.username,                                                 │
  │    role: user.role,                                                         │
  │  });                                                                        │
  │                                                                             │
  │  ┌──────────────────────────────────────────────────────────────────────┐  │
  │  │           THIS IS WHERE USER SEPARATION BEGINS                       │  │
  │  └──────────────────────────────────────────────────────────────────────┘  │
  │                                                                             │
  │  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
  │  │ JWT_A (Alice's Token):          │  │ JWT_B (Bob's Token):            │  │
  │  │ {                               │  │ {                               │  │
  │  │   "client_id": 10,      ←UNIQUE │  │   "client_id": 20,      ←UNIQUE │  │
  │  │   "company_id": 100,            │  │   "company_id": 100,            │  │
  │  │   "username": "alice",          │  │   "username": "bob",            │  │
  │  │   "role": "manager",            │  │   "role": "user",               │  │
  │  │   "iat": 1705320000,            │  │   "iat": 1705320000,            │  │
  │  │   "exp": 1705924800             │  │   "exp": 1705924800             │  │
  │  │ }                               │  │ }                               │  │
  │  │ Encoded: eyJhbGciOiJIUzI1Ni... │  │ Encoded: eyJhbGciOiJIUzI1Ni... │  │
  │  └─────────────────────────────────┘  └─────────────────────────────────┘  │
  │                                                                             │
  │  🔑 Each JWT contains UNIQUE client_id → This is the isolation key         │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 5: SET HTTP-ONLY COOKIE

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 5: Store JWT in Secure Cookie                                         │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  📁 File: app/api/auth/login/route.ts (PLANNED)                             │
  │  📍 Lines: 736-742                                                          │
  │                                                                             │
  │  response.cookies.set('auth_token', token, {                                │
  │    httpOnly: true,        ← Cannot be accessed by JavaScript (XSS protection)
  │    secure: true,          ← Only sent over HTTPS                            │
  │    sameSite: 'strict',    ← CSRF protection                                 │
  │    maxAge: 7 * 24 * 60 * 60,  ← 7 days                                      │
  │    path: '/',                                                               │
  │  });                                                                        │
  │                                                                             │
  │  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
  │  │ Alice's Browser:                │  │ Bob's Browser:                  │  │
  │  │ Cookie: auth_token=JWT_A        │  │ Cookie: auth_token=JWT_B        │  │
  │  │ (Stored locally in HER browser) │  │ (Stored locally in HIS browser) │  │
  │  └─────────────────────────────────┘  └─────────────────────────────────┘  │
  │                                                                             │
  │  🔑 Each browser stores its OWN unique JWT → Physical separation            │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 6: SUBSEQUENT API REQUEST (Both Users Active)

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 6: User Makes API Request (e.g., GET /api/quotations)                 │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  Alice's Browser:                      Bob's Browser:                       │
  │  GET /api/quotations                   GET /api/quotations                  │
  │  Cookie: auth_token=JWT_A              Cookie: auth_token=JWT_B             │
  │                                                                             │
  │  🔑 Each request carries its OWN unique JWT automatically                   │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 7: MIDDLEWARE INTERCEPTS REQUEST

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 7: Global Middleware Extracts & Verifies Token                        │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  📁 File: middleware.ts (PLANNED - root level)                              │
  │  📍 Lines: 124-207                                                          │
  │                                                                             │
  │  export async function middleware(request: NextRequest) {                   │
  │    // Line 166-168: Extract token from cookie                               │
  │    const token =                                                            │
  │      request.cookies.get('auth_token')?.value ||                            │
  │      request.headers.get('Authorization')?.replace('Bearer ', '');          │
  │                                                                             │
  │    // Line 183: Verify token                                                │
  │    const payload = await verifyToken(token);                                │
  │                                                                             │
  │    // Lines 200-203: Inject workspace context into headers                  │
  │    response.headers.set('x-client-id', String(payload.client_id));          │
  │    response.headers.set('x-company-id', String(payload.company_id));        │
  │    response.headers.set('x-username', payload.username);                    │
  │    response.headers.set('x-user-role', payload.role);                       │
  │  }                                                                          │
  │                                                                             │
  │  📁 File: lib/middleware/auth-helpers.ts (EXISTS)                           │
  │  📍 Lines: 38-58 (verifyJWT function)                                       │
  │                                                                             │
  │  export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  │    const { payload } = await jwtVerify(token, JWT_SECRET);                  │
  │    // Validate required fields (lines 44-48)                                │
  │    if (                                                                     │
  │      typeof payload.client_id === 'number' &&                               │
  │      typeof payload.company_id === 'number' &&                              │
  │      typeof payload.username === 'string' &&                                │
  │      typeof payload.role === 'string'                                       │
  │    ) {                                                                      │
  │      return payload as JWTPayload;                                          │
  │    }                                                                        │
  │  }                                                                          │
  │                                                                             │
  │  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
  │  │ Alice's Request Headers:        │  │ Bob's Request Headers:          │  │
  │  │ x-client-id: "10"       ←UNIQUE │  │ x-client-id: "20"       ←UNIQUE │  │
  │  │ x-company-id: "100"             │  │ x-company-id: "100"             │  │
  │  │ x-username: "alice"             │  │ x-username: "bob"               │  │
  │  │ x-user-role: "manager"          │  │ x-user-role: "user"             │  │
  │  └─────────────────────────────────┘  └─────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 8: WORKSPACE CONTEXT CREATION (ISOLATION ENFORCED)

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 8: Create WorkspaceContext Instance                                   │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  📁 File: lib/middleware/auth-helpers.ts (EXISTS)                           │
  │  📍 Lines: 82-99                                                            │
  │                                                                             │
  │  export async function getWorkspaceFromToken(token: string): Promise<WorkspaceContext | null> {
  │    const payload = await verifyJWT(token);                                  │
  │    if (!payload) return null;                                               │
  │                                                                             │
  │    // Line 89-94: Create workspace context from JWT payload                 │
  │    return new WorkspaceContext({                                            │
  │      client_id: payload.client_id,    ← FROM JWT (unique per user)         │
  │      company_id: payload.company_id,  ← FROM JWT (shared in company)       │
  │      username: payload.username,                                            │
  │      role: payload.role,                                                    │
  │    });                                                                      │
  │  }                                                                          │
  │                                                                             │
  │  📁 File: lib/middleware/workspace-context.ts (EXISTS)                      │
  │  📍 Lines: 25-41 (Constructor)                                              │
  │                                                                             │
  │  constructor(user: {                                                        │
  │    client_id: number;                                                       │
  │    company_id: number;                                                      │
  │    username?: string;                                                       │
  │    role?: string;                                                           │
  │  }) {                                                                       │
  │    // Lines 31-34: Validate required IDs                                    │
  │    if (user.client_id == null || user.company_id == null) {                 │
  │      throw new Error('WorkspaceContext requires client_id and company_id'); │
  │    }                                                                        │
  │                                                                             │
  │    // Lines 36-40: Store immutable values                                   │
  │    this.client_id = user.client_id;   ← FROZEN (cannot be changed)         │
  │    this.company_id = user.company_id; ← FROZEN (cannot be changed)         │
  │    this.username = user.username || 'Unknown';                              │
  │    this.role = user.role || 'user';                                         │
  │    this.created_at = new Date();                                            │
  │  }                                                                          │
  │                                                                             │
  │  ┌────────────────────────────────────────────────────────────────────────┐│
  │  │                    TWO SEPARATE INSTANCES CREATED                      ││
  │  └────────────────────────────────────────────────────────────────────────┘│
  │                                                                             │
  │  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
  │  │ workspaceA (Alice's Instance):  │  │ workspaceB (Bob's Instance):    │  │
  │  │ {                               │  │ {                               │  │
  │  │   client_id: 10,        ←UNIQUE │  │   client_id: 20,        ←UNIQUE │  │
  │  │   company_id: 100,              │  │   company_id: 100,              │  │
  │  │   username: "alice",            │  │   username: "bob",              │  │
  │  │   role: "manager",              │  │   role: "user",                 │  │
  │  │   created_at: <timestamp>       │  │   created_at: <timestamp>       │  │
  │  │ }                               │  │ }                               │  │
  │  └─────────────────────────────────┘  └─────────────────────────────────┘  │
  │                                                                             │
  │  🔑 Each request creates a NEW WorkspaceContext instance in MEMORY          │
  │  🔑 Instances are ISOLATED - they don't share state                         │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 9: DATABASE FILTER GENERATION

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 9: Generate Database Filter Based on Workspace Mode                   │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  📁 File: lib/middleware/workspace-context.ts (EXISTS)                      │
  │  📍 Lines: 49-60 (getDatabaseFilter method)                                 │
  │                                                                             │
  │  getDatabaseFilter(): { company_id: number; client_id?: number } {          │
  │    const filter: { company_id: number; client_id?: number } = {             │
  │      company_id: this.company_id,    ← Always included                     │
  │    };                                                                       │
  │                                                                             │
  │    // Line 55-57: Add client_id when isolation is enabled (Phase 2)         │
  │    if (workspaceConfig.isClientIsolationEnabled()) {                        │
  │      filter.client_id = this.client_id;   ← Added in Phase 2               │
  │    }                                                                        │
  │                                                                             │
  │    return filter;                                                           │
  │  }                                                                          │
  │                                                                             │
  │  📁 File: config/workspace.config.ts (EXISTS)                               │
  │  📍 Lines: 47-49 (isClientIsolationEnabled method)                          │
  │                                                                             │
  │  ╔═══════════════════════════════════════════════════════════════════════╗ │
  │  ║  PHASE 1 (CURRENT): WORKSPACE_MODE='shared', ISOLATION=false          ║ │
  │  ╚═══════════════════════════════════════════════════════════════════════╝ │
  │                                                                             │
  │  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
  │  │ Alice's Filter (Phase 1):       │  │ Bob's Filter (Phase 1):         │  │
  │  │ { company_id: 100 }             │  │ { company_id: 100 }             │  │
  │  │                                 │  │                                 │  │
  │  │ → Both see SAME company data    │  │ → Both see SAME company data    │  │
  │  │ → Shared workspace within ABC   │  │ → Shared workspace within ABC   │  │
  │  └─────────────────────────────────┘  └─────────────────────────────────┘  │
  │                                                                             │
  │  ╔═══════════════════════════════════════════════════════════════════════╗ │
  │  ║  PHASE 2 (FUTURE): WORKSPACE_MODE='individual', ISOLATION=true        ║ │
  │  ╚═══════════════════════════════════════════════════════════════════════╝ │
  │                                                                             │
  │  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
  │  │ Alice's Filter (Phase 2):       │  │ Bob's Filter (Phase 2):         │  │
  │  │ {                               │  │ {                               │  │
  │  │   company_id: 100,              │  │   company_id: 100,              │  │
  │  │   client_id: 10         ←UNIQUE │  │   client_id: 20         ←UNIQUE │  │
  │  │ }                               │  │ }                               │  │
  │  │                                 │  │                                 │  │
  │  │ → Alice sees ONLY her data      │  │ → Bob sees ONLY his data        │  │
  │  └─────────────────────────────────┘  └─────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 10: WORKSPACE DATABASE HELPER INITIALIZATION

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 10: Create WorkspaceDatabaseHelper with Filters                       │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  📁 File: lib/db/workspace-helper.ts (EXISTS)                               │
  │  📍 Lines: 41-57 (Constructor)                                              │
  │                                                                             │
  │  constructor(workspaceContext: WorkspaceContext | null) {                   │
  │    // Lines 51-53: Validate workspace context                               │
  │    if (!workspaceContext || !(workspaceContext instanceof WorkspaceContext)) {
  │      throw new Error('WorkspaceDatabaseHelper requires a valid WorkspaceContext instance');
  │    }                                                                        │
  │                                                                             │
  │    this.workspace = workspaceContext;                                       │
  │                                                                             │
  │    // Line 56: Get workspace filter (company_id + optional client_id)       │
  │    this.baseFilter = workspaceContext.getDatabaseFilter();                  │
  │  }                                                                          │
  │                                                                             │
  │  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
  │  │ helperA (Alice's Helper):       │  │ helperB (Bob's Helper):         │  │
  │  │ {                               │  │ {                               │  │
  │  │   workspace: workspaceA,        │  │   workspace: workspaceB,        │  │
  │  │   baseFilter: {company_id:100}  │  │   baseFilter: {company_id:100}  │  │
  │  │   // Phase 2: +client_id:10     │  │   // Phase 2: +client_id:20     │  │
  │  │ }                               │  │ }                               │  │
  │  └─────────────────────────────────┘  └─────────────────────────────────┘  │
  │                                                                             │
  │  🔑 Each helper instance is BOUND to its workspace context                  │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 11: BUILD WHERE CLAUSE (SECURITY ENFORCEMENT)

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 11: Build WHERE Clause with Forced Workspace Filters                  │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  📁 File: lib/db/workspace-helper.ts (EXISTS)                               │
  │  📍 Lines: 79-102 (buildWhereClause method)                                 │
  │                                                                             │
  │  buildWhereClause<T extends PgTable>(                                       │
  │    table: T,                                                                │
  │    additionalFilters?: SQL[]                                                │
  │  ): SQL | undefined {                                                       │
  │    const filters: SQL[] = [];                                               │
  │                                                                             │
  │    // Lines 86-88: ALWAYS add company_id filter (CANNOT be bypassed)        │
  │    if ('company_id' in table) {                                             │
  │      filters.push(eq(table.company_id, this.baseFilter.company_id));        │
  │    }                                                                        │
  │                                                                             │
  │    // Lines 91-93: Add client_id filter if isolation enabled                │
  │    if (this.baseFilter.client_id !== undefined && 'client_id' in table) {   │
  │      filters.push(eq(table.client_id, this.baseFilter.client_id));          │
  │    }                                                                        │
  │                                                                             │
  │    // Lines 96-98: Add user-provided filters (e.g., quotation_id = 1)       │
  │    if (additionalFilters && additionalFilters.length > 0) {                 │
  │      filters.push(...additionalFilters);                                    │
  │    }                                                                        │
  │                                                                             │
  │    // Line 101: Combine all filters with AND logic                          │
  │    return filters.length > 0 ? and(...filters) : undefined;                 │
  │  }                                                                          │
  │                                                                             │
  │  ╔═══════════════════════════════════════════════════════════════════════╗ │
  │  ║  SECURITY: Workspace filters are ALWAYS applied FIRST                 ║ │
  │  ║  User cannot override company_id or client_id through request body    ║ │
  │  ╚═══════════════════════════════════════════════════════════════════════╝ │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 12: EXECUTE DATABASE QUERY

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 12: Execute Query with Workspace-Filtered WHERE Clause                │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  📁 File: lib/db/queries.ts (EXISTS)                                        │
  │  📍 Lines: 194-265 (getData function)                                       │
  │                                                                             │
  │  export async function getData(                                             │
  │    tableNames: string | string[],                                           │
  │    columns: Record<string, unknown>,                                        │
  │    workspace: WorkspaceContext        ← Workspace passed from API route    │
  │  ): Promise<any[]> {                                                        │
  │    // Line 201: Initialize workspace database helper                        │
  │    const helper = new WorkspaceDatabaseHelper(workspace);                   │
  │                                                                             │
  │    // Lines 210-211: Build WHERE conditions with workspace filters          │
  │    const whereConditions = multipleCol(primaryTable, columns);              │
  │    const whereClause = helper.buildWhereClause(primaryTable, whereConditions);
  │                                                                             │
  │    // Lines 215-220: Execute SELECT with forced workspace filtering         │
  │    const results = await db                                                 │
  │      .select()                                                              │
  │      .from(primaryTable)                                                    │
  │      .where(whereClause);  ← WORKSPACE FILTERS APPLIED HERE                │
  │                                                                             │
  │    return results;                                                          │
  │  }                                                                          │
  │                                                                             │
  │  ┌────────────────────────────────────────────────────────────────────────┐│
  │  │  EXAMPLE: Both users query quotation_id = 1                            ││
  │  └────────────────────────────────────────────────────────────────────────┘│
  │                                                                             │
  │  Alice requests: { quotation_id: 1 }   Bob requests: { quotation_id: 1 }   │
  │                                                                             │
  │  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
  │  │ Alice's ACTUAL SQL Query:       │  │ Bob's ACTUAL SQL Query:         │  │
  │  │                                 │  │                                 │  │
  │  │ SELECT * FROM quotations        │  │ SELECT * FROM quotations        │  │
  │  │ WHERE quotation_id = 1          │  │ WHERE quotation_id = 1          │  │
  │  │   AND company_id = 100 ←FORCED  │  │   AND company_id = 100 ←FORCED  │  │
  │  │                                 │  │                                 │  │
  │  │ Phase 2 would add:              │  │ Phase 2 would add:              │  │
  │  │   AND client_id = 10    ←FORCED │  │   AND client_id = 20    ←FORCED │  │
  │  └─────────────────────────────────┘  └─────────────────────────────────┘  │
  │                                                                             │
  │  🔑 Workspace filters are INJECTED by the system, NOT from user request     │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  PHASE 13: DATA RETURNED TO EACH USER

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  STEP 13: Return Isolated Results                                           │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  ╔═══════════════════════════════════════════════════════════════════════╗ │
  │  ║  PHASE 1 (Shared Mode): Both users see company's quotations           ║ │
  │  ╚═══════════════════════════════════════════════════════════════════════╝ │
  │                                                                             │
  │  Database contains:                                                         │
  │  ┌───────────────────────────────────────────────────────────────────────┐ │
  │  │ quotation_id │ company_id │ client_id │ quotation_name                │ │
  │  ├──────────────┼────────────┼───────────┼───────────────────────────────┤ │
  │  │ 1            │ 100        │ 10        │ "Alice's Quotation"           │ │
  │  │ 2            │ 100        │ 20        │ "Bob's Quotation"             │ │
  │  │ 3            │ 200        │ 30        │ "Other Company's Quotation"   │ │
  │  └───────────────────────────────────────────────────────────────────────┘ │
  │                                                                             │
  │  Alice's Query Result (Phase 1):    Bob's Query Result (Phase 1):          │
  │  [                                  [                                       │
  │    { quotation_id: 1, ... },          { quotation_id: 1, ... },            │
  │    { quotation_id: 2, ... }           { quotation_id: 2, ... }             │
  │  ]                                  ]                                       │
  │  → Both see quotations 1 & 2        → Both see quotations 1 & 2            │
  │  → Neither sees quotation 3         → Neither sees quotation 3             │
  │                                                                             │
  │  ╔═══════════════════════════════════════════════════════════════════════╗ │
  │  ║  PHASE 2 (Individual Mode): Each user sees ONLY their own data        ║ │
  │  ╚═══════════════════════════════════════════════════════════════════════╝ │
  │                                                                             │
  │  Alice's Query Result (Phase 2):    Bob's Query Result (Phase 2):          │
  │  [                                  [                                       │
  │    { quotation_id: 1, ... }           { quotation_id: 2, ... }             │
  │  ]                                  ]                                       │
  │  → Alice sees ONLY quotation 1      → Bob sees ONLY quotation 2            │
  │  → client_id=10 filter applied      → client_id=20 filter applied          │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  SECURITY ATTACK SCENARIO: Bob Tries to Access Alice's Data

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  ATTACK ATTEMPT: Bob tries to access quotation_id=1 (owned by Alice)        │
  │  ═══════════════════════════════════════════════════════════════════════════│
  │                                                                             │
  │  Bob's Malicious Request:                                                   │
  │  POST /api/database/select                                                  │
  │  Cookie: auth_token=JWT_B (contains client_id=20)                           │
  │  Body: { "table": "quotations", "where": { "quotation_id": 1 } }           │
  │                                                                             │
  │  📁 File: lib/db/workspace-helper.ts                                        │
  │  📍 Lines: 79-102 (buildWhereClause - SECURITY ENFORCED)                    │
  │                                                                             │
  │  Processing:                                                                │
  │  ┌─────────────────────────────────────────────────────────────────────┐   │
  │  │ 1. Bob's JWT decoded → client_id=20, company_id=100                 │   │
  │  │ 2. WorkspaceContext created with client_id=20                       │   │
  │  │ 3. Bob's requested filter: { quotation_id: 1 }                      │   │
  │  │ 4. Workspace filter (Phase 2): { company_id: 100, client_id: 20 }   │   │
  │  │ 5. MERGED filter: { quotation_id: 1, company_id: 100, client_id: 20 }│  │
  │  └─────────────────────────────────────────────────────────────────────┘   │
  │                                                                             │
  │  Actual SQL Query:                                                          │
  │  SELECT * FROM quotations                                                   │
  │  WHERE quotation_id = 1                                                     │
  │    AND company_id = 100                                                     │
  │    AND client_id = 20      ← FROM JWT, NOT FROM REQUEST                    │
  │                                                                             │
  │  Result: EMPTY SET ✅                                                       │
  │  (quotation_id=1 has client_id=10, not client_id=20)                        │
  │                                                                             │
  │  ╔═══════════════════════════════════════════════════════════════════════╗ │
  │  ║  DATA LEAK PREVENTED: Bob cannot access Alice's data                  ║ │
  │  ║  The client_id filter comes from JWT, which Bob cannot forge          ║ │
  │  ╚═══════════════════════════════════════════════════════════════════════╝ │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  SUMMARY: 4 Layers of Isolation

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                         ISOLATION ARCHITECTURE                              │
  ├──────────┬──────────────────────────────────────┬───────────────────────────┤
  │  LAYER   │  FILE & LINES                        │  WHAT IT DOES             │
  ├──────────┼──────────────────────────────────────┼───────────────────────────┤
  │  1. JWT  │ lib/middleware/auth-helpers.ts:66-75 │ Embeds client_id in token │
  │  ENCODE  │ (generateJWT function)               │ during login              │
  ├──────────┼──────────────────────────────────────┼───────────────────────────┤
  │  2. JWT  │ middleware.ts:166-203 (PLANNED)      │ Extracts client_id from   │
  │  DECODE  │ lib/middleware/auth-helpers.ts:38-58 │ token on every request    │
  ├──────────┼──────────────────────────────────────┼───────────────────────────┤
  │  3. WORK │ lib/middleware/workspace-context.ts  │ Creates immutable context │
  │  SPACE   │ :25-41 (constructor)                 │ with frozen client_id     │
  │  CONTEXT │ :49-60 (getDatabaseFilter)           │ Generates filter object   │
  ├──────────┼──────────────────────────────────────┼───────────────────────────┤
  │  4. DB   │ lib/db/workspace-helper.ts:79-102    │ Forces workspace filter   │
  │  HELPER  │ (buildWhereClause method)            │ on ALL database queries   │
  │          │ lib/db/queries.ts:194-265            │ Uses helper for getData   │
  └──────────┴──────────────────────────────────────┴───────────────────────────┘

  ---
  Visual Flow Diagram

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                    COMPLETE REQUEST LIFECYCLE                               │
  └─────────────────────────────────────────────────────────────────────────────┘

       ALICE (client_id=10)                    BOB (client_id=20)
              │                                       │
              ▼                                       ▼
      ┌───────────────┐                      ┌───────────────┐
      │ POST /login   │                      │ POST /login   │
      │ user: alice   │                      │ user: bob     │
      └───────┬───────┘                      └───────┬───────┘
              │                                       │
              ▼                                       ▼
      ┌───────────────────────────────────────────────────────┐
      │            app/api/auth/login/route.ts                │
      │  1. Query client_info table                           │
      │  2. Verify password                                   │
      │  3. Generate JWT with {client_id, company_id}         │
      │  4. Set HTTP-only cookie                              │
      └───────────────────────────────────────────────────────┘
              │                                       │
              ▼                                       ▼
      ┌───────────────┐                      ┌───────────────┐
      │ Cookie:       │                      │ Cookie:       │
      │ JWT_A         │                      │ JWT_B         │
      │ {client_id:10}│                      │ {client_id:20}│
      └───────┬───────┘                      └───────┬───────┘
              │                                       │
              ▼                                       ▼
      ┌───────────────┐                      ┌───────────────┐
      │ GET /api/     │                      │ GET /api/     │
      │ quotations    │                      │ quotations    │
      └───────┬───────┘                      └───────┬───────┘
              │                                       │
              └───────────────┬───────────────────────┘
                              ▼
      ┌───────────────────────────────────────────────────────┐
      │              middleware.ts (PLANNED)                  │
      │  1. Extract JWT from cookie                           │
      │  2. Verify JWT signature                              │
      │  3. Inject x-client-id header                         │
      └───────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      ┌───────────────┐              ┌───────────────┐
      │ x-client-id:10│              │ x-client-id:20│
      └───────┬───────┘              └───────┬───────┘
              │                               │
              ▼                               ▼
      ┌───────────────────────────────────────────────────────┐
      │     lib/middleware/workspace-context.ts:25-41         │
      │     Create WorkspaceContext instance                  │
      └───────────────────────────────────────────────────────┘
              │                               │
              ▼                               ▼
      ┌───────────────┐              ┌───────────────┐
      │ workspaceA:   │              │ workspaceB:   │
      │ client_id=10  │              │ client_id=20  │
      │ company_id=100│              │ company_id=100│
      └───────┬───────┘              └───────┬───────┘
              │                               │
              ▼                               ▼
      ┌───────────────────────────────────────────────────────┐
      │       lib/db/workspace-helper.ts:79-102               │
      │       buildWhereClause() - FORCE workspace filter     │
      └───────────────────────────────────────────────────────┘
              │                               │
              ▼                               ▼
      ┌─────────────────────┐        ┌─────────────────────┐
      │ WHERE company_id=100│        │ WHERE company_id=100│
      │   AND client_id=10  │        │   AND client_id=20  │
      └─────────┬───────────┘        └─────────┬───────────┘
                │                               │
                ▼                               ▼
      ┌─────────────────────┐        ┌─────────────────────┐
      │ Alice's Data Only   │        │ Bob's Data Only     │
      │ (quotation_id=1)    │        │ (quotation_id=2)    │
      └─────────────────────┘        └─────────────────────┘

  This is the complete dataflow showing how two users from the same company are isolated through JWT tokens, workspace contexts, and enforced database    
  filters.
