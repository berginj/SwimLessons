# Contract Summary - Quick Reference Guide

**Last Updated:** 2026-03-26
**Team Size:** 2-4 people
**Purpose:** Quick contract reference for the current NYC MVP and supporting parallel work

---

## 📋 Overview

This platform uses **contract-driven development** to enable your 2-4 person team to work in parallel without conflicts. Every integration point has a defined TypeScript interface.

Current-reality note:
- the live frontend is plain `src/web` HTML/CSS/JS, not React
- the active operator surface is the protected `GET /api/operator/cities/{cityId}/stats` endpoint plus the CLI/runbook
- staging is already a seeded NYC MVP environment, not a planning-only shell
- the older staffing and onboarding examples below are still useful reference material, but they are not the active workboard

## 🎯 Core Principle

> **Services depend on interfaces, not implementations.**

This means:
- ✅ You can mock dependencies for testing
- ✅ Team members can work independently
- ✅ Implementation changes don't break contracts
- ✅ TypeScript enforces compatibility at compile time

---

## 📁 Contract Files (5 Files)

| File | Purpose | Who Uses It |
|------|---------|-------------|
| `src/core/contracts/city-config.ts` | City configuration types | Everyone |
| `src/core/contracts/city-adapter.ts` | City data adapter interface | Adapter implementers |
| `src/core/contracts/services.ts` | Service layer interfaces | Backend developers |
| `src/core/contracts/repositories.ts` | Data access interfaces | Repository implementers |
| `src/core/contracts/api-contracts.ts` | HTTP request/response types | Frontend + Backend |

---

## 🚢 Deployment Contract

Deployment behavior is also contract-driven now.

- [DEPLOYMENT-CONTRACT.md](./DEPLOYMENT-CONTRACT.md) defines the repo's deployment invariants.
- CI enforces the deployment contract with `npm run validate:deployment-contract`.
- Changes to GitHub workflows, Bicep deployment ownership, or SWA backend linking must satisfy that contract before merge.

## 👪 Persona Contract

The top-level user contract is now explicit.

- [PARENT-PERSONA.md](./PARENT-PERSONA.md) defines the current NYC parent/caregiver persona, trust requirements, and approved defaults.
- Workflow or product changes that materially alter the parent journey should be evaluated against that persona contract before lower-order technical changes.

## 🚇 Transit Router Contract

NYC transit behavior is now explicitly contract-driven too.

- [TRANSIT-ROUTER-CONTRACT.md](./TRANSIT-ROUTER-CONTRACT.md) defines the schedule-based transit routing boundary for NYC.
- The current MVP contract targets an external OpenTripPlanner-style GraphQL endpoint set through `TRANSIT_ROUTER_GRAPHQL_URL`.
- Router-backed behavior currently applies to NYC walking and subway-oriented routing, with explicit fallback rules when the router is unavailable.

## 🧭 Active Work Tracking

Use [ORCHESTRATION-TRACKER.md](./ORCHESTRATION-TRACKER.md) as the canonical pickup document for:
- current operational state
- active backlog and priorities
- dependency-aware next steps
- contract drift and blockers

Do not treat older root-level status docs as the live workboard unless the orchestration tracker points to them.

---

## ✅ Current MVP Surface

Parent-facing endpoints:
- `GET /api/cities`
- `POST /api/search`
- `GET /api/sessions/{id}`
- `POST /api/events`

Operator-facing surface:
- `GET /api/operator/cities/{cityId}/stats`
- `npm run operator:city-stats -- --environment staging --city nyc`

Operational baseline:
- staging is deterministic and seeded with NYC session data
- browser geolocation is opt-in and Times Square is the fallback
- NYC transit uses the external router when configured and deterministic fallback otherwise

---

## 🔗 Integration Map (Who Calls Who?)

```
Frontend (Static Web App HTML/CSS/JS)
    ↓ API Contracts (SearchRequest/SearchResponse)
Function Apps
    ↓ Service Contracts (ISearchService)
Services
    ↓ Repository Contracts (ISessionRepository)
Repositories
    ↓ Cosmos DB SDK
Cosmos DB
```

---

## 📐 Key Contracts by Layer

### 1. API Layer (Frontend ↔ Backend)

**Contract:** `api-contracts.ts`

**Key Types:**
- `SearchRequest` / `SearchResponse`
- `SessionDetailsRequest` / `SessionDetailsResponse`
- `BulkUploadRequest` / `BulkUploadResponse`
- `ApiResponse<T>` (standard wrapper)
- `ApiError` (standard error format)

**Usage:**
```typescript
// Frontend
const response = await fetch('/api/search', {
  method: 'POST',
  body: JSON.stringify(request as SearchRequest)
});
const result: ApiResponse<SearchResponse> = await response.json();

// Backend (Function App)
export async function search(req: HttpRequest): Promise<HttpResponseInit> {
  const body = await req.json() as SearchRequest;
  // ... process
  return {
    jsonBody: ApiResponseBuilder.success<SearchResponse>(response)
  };
}
```

---

### 2. Service Layer (Business Logic)

**Contract:** `services.ts`

**Key Interfaces:**
- `ISearchService` - Search logic, scoring, ranking
- `ICityConfigService` - Manage city configs
- `IFeatureFlagService` - Feature toggles
- `ITelemetryService` - Event tracking
- `ITransitService` - Travel time estimates
- `IOnboardingService` - City onboarding workflow
- `IDataSyncService` - Scheduled data sync

**Usage:**
```typescript
// Implement service
class SearchService implements ISearchService {
  constructor(
    private sessionRepo: ISessionRepository,  // Depend on interface!
    private cityConfigService: ICityConfigService
  ) {}

  async search(filters, sort, pagination): Promise<SearchResults> {
    // Implementation
  }
}

// Use service
const results = await searchService.search(filters, sort, pagination);
```

**Critical:** Services must depend on `I*Repository` interfaces, **not** concrete classes.

---

### 3. Repository Layer (Data Access)

**Contract:** `repositories.ts`

**Key Interfaces:**
- `ITenantRepository` - City configs (CRUD)
- `ISessionRepository` - Sessions, providers, locations, programs (CRUD + queries)
- `IEventRepository` - Telemetry events

**Usage:**
```typescript
// Implement repository
class SessionRepository implements ISessionRepository {
  constructor(private cosmosClient: CosmosClient) {}

  async querySessions(cityId, filters): Promise<Session[]> {
    // Cosmos DB query logic
  }
}

// Use repository
const sessions = await sessionRepo.querySessions("nyc", { startDateMin: "2026-06-01" });
```

**Critical:** Repositories should **not** contain business logic (no scoring, no filtering beyond DB queries).

---

### 4. Adapter Layer (City Data Sources)

**Contract:** `city-adapter.ts`

**Key Interface:** `ICityDataAdapter`

**Methods:**
- `getLocations()` - Fetch pools/facilities
- `getPrograms()` - Fetch program offerings
- `getSessions()` - Fetch enrollable sessions
- `syncData()` - Update Cosmos DB from source
- `validateConfig()` - Check adapter is configured correctly
- `getProviderSignupUrl()` - Generate signup link
- `getTransitEstimate()` - Calculate travel time (optional)

**Usage:**
```typescript
// Implement adapter
class NYCParksAdapter extends BaseAdapter implements ICityDataAdapter {
  async getSessions(): Promise<Session[]> {
    const nycData = await this.fetchFromNYCAPI();
    return nycData.map(d => this.transformToCanonical(d));  // Must transform!
  }
}

// Use adapter
const adapter = adapterFactory.getAdapter("nyc");
const sessions = await adapter.getSessions();
```

**Critical:** Adapters **must** transform city-specific data to canonical schema.

---

## 🔄 Common Integration Patterns

### Pattern 1: Search Flow

```typescript
// 1. Function App receives HTTP request
const request: SearchRequest = await req.json();

// 2. Call service
const results = await searchService.search(
  request.filters,
  request.sort,
  request.pagination
);

// 3. Service queries repository
const sessions = await sessionRepo.querySessions(cityId, filters);

// 4. Service scores & ranks
const scored = this.scoreAndRank(sessions, cityConfig);

// 5. Return response
return ApiResponseBuilder.success<SearchResponse>({ results: scored });
```

### Pattern 2: Current Staging Operator Flow

```typescript
await deployInfrastructure();
await deployFunctions();
await deployStaticWebApp();
await seedStagingNyc();
await restoreTransitRouterSettings();
await runStagingSmoke();
```

### Pattern 3: Deferred Onboarding Flow

```typescript
// This remains contract space, not active NYC MVP workflow today.
// 1. Admin posts request
const request: OnboardCityRequest = { cityName: "LA", ... };

// 2. Service creates city config
const config = await cityConfigService.createCity(buildConfig(request));

// 3. Service validates adapter
const adapter = adapterFactory.getAdapter(config.cityId);
const validation = await adapter.validateConfig();

// 4. Run initial sync
const syncResult = await adapter.syncData();

// 5. Set to preview status
await featureFlagService.setFlag(`city.${cityId}.status`, "preview");
```

---

## ⚠️ Common Pitfalls to Avoid

### ❌ Pitfall 1: Depending on Concrete Classes

```typescript
// WRONG
class SearchService {
  constructor(
    private sessionRepo: SessionRepository  // ❌ Concrete class!
  ) {}
}
```

```typescript
// CORRECT
class SearchService implements ISearchService {
  constructor(
    private sessionRepo: ISessionRepository  // ✅ Interface!
  ) {}
}
```

**Why:** Can't mock for testing, tightly coupled.

---

### ❌ Pitfall 2: Business Logic in Repositories

```typescript
// WRONG
class SessionRepository {
  async querySessions(filters) {
    const sessions = await this.query();
    // ❌ Repository shouldn't score!
    return sessions.map(s => ({ ...s, score: this.calculateScore(s) }));
  }
}
```

```typescript
// CORRECT
class SessionRepository implements ISessionRepository {
  async querySessions(filters): Promise<Session[]> {
    // ✅ Just query and return
    return await this.cosmosContainer.items.query(...).fetchAll();
  }
}

// Business logic in service
class SearchService {
  async search(filters) {
    const sessions = await this.sessionRepo.querySessions(filters);
    return this.scoreAndRank(sessions, filters);  // ✅ Score here!
  }
}
```

**Why:** Repositories should be dumb data access, services have business logic.

---

### ❌ Pitfall 3: Not Using API Contracts

```typescript
// WRONG
export async function search(req: HttpRequest) {
  const body = await req.json();  // ❌ Untyped!
  return { results: await searchService.search(body) };  // ❌ Untyped response!
}
```

```typescript
// CORRECT
export async function search(req: HttpRequest): Promise<HttpResponseInit> {
  const request: SearchRequest = await req.json();  // ✅ Typed!

  const results = await searchService.search(request.filters, ...);

  return {
    jsonBody: ApiResponseBuilder.success<SearchResponse>({  // ✅ Typed!
      results,
      // ... other fields
    })
  };
}
```

**Why:** Frontend expects specific response shape, untyped responses break the app.

---

### ❌ Pitfall 4: Adapters Not Transforming Data

```typescript
// WRONG
class NYCParksAdapter {
  async getSessions() {
    const nycData = await this.fetchAPI();
    return nycData;  // ❌ Returning NYC-specific format!
  }
}
```

```typescript
// CORRECT
class NYCParksAdapter implements ICityDataAdapter {
  async getSessions(): Promise<Session[]> {
    const nycData = await this.fetchAPI();

    // ✅ Transform to canonical schema
    return nycData.map(item => ({
      id: `nyc-session-${item.id}`,
      cityId: "nyc",
      type: "SessionDocument",
      startDate: this.parseNYCDate(item.start),
      // ... map all fields
    }));
  }
}
```

**Why:** SearchService expects `Session[]` in canonical schema, not city-specific formats.

---

## 🧪 Testing with Contracts

### Unit Test Pattern

```typescript
describe('SearchService', () => {
  let searchService: ISearchService;
  let mockSessionRepo: jest.Mocked<ISessionRepository>;
  let mockCityConfigService: jest.Mocked<ICityConfigService>;

  beforeEach(() => {
    // Create mocks from interfaces
    mockSessionRepo = {
      querySessions: jest.fn(),
      // ... other methods
    } as any;

    mockCityConfigService = {
      getCityConfig: jest.fn(),
      // ... other methods
    } as any;

    // Inject mocks
    searchService = new SearchService(
      mockSessionRepo,
      mockCityConfigService,
      // ... other mocks
    );
  });

  it('should return sessions for valid search', async () => {
    // Arrange
    mockCityConfigService.getCityConfig.mockResolvedValue(mockConfig);
    mockSessionRepo.querySessions.mockResolvedValue([mockSession]);

    // Act
    const result = await searchService.search(filters, sort, pagination);

    // Assert
    expect(result.results).toHaveLength(1);
    expect(mockSessionRepo.querySessions).toHaveBeenCalledWith('nyc', expect.any(Object));
  });
});
```

**Key:** Mock **interfaces**, not concrete classes. This is why we depend on interfaces!

---

## 📊 Team Assignment Recommendations

### Person A: Adapters + Data Sync
**Owns:**
- `src/adapters/` (implement `ICityDataAdapter` for NYC)
- `src/services/data-sync/` (implement `IDataSyncService`)
- `src/functions/jobs/data-sync.ts` (timer-triggered Function)

Note:
- this is historical parallel-work guidance, not a statement that scheduled multi-city sync is active MVP scope today

**Dependencies:**
- Uses: `ISessionRepository` (Person C provides)
- Uses: `ICityConfigService` (Person B provides)

---

### Person B: Services + City Config
**Owns:**
- `src/services/search/` (implement `ISearchService`)
- `src/services/control-plane/` (implement `ICityConfigService`)
- `src/services/feature-flags/` (implement `IFeatureFlagService`)
- `src/services/telemetry/` (implement `ITelemetryService`)

**Dependencies:**
- Uses: `ISessionRepository`, `ITenantRepository` (Person C provides)
- Uses: `ICityDataAdapter` (Person A provides)

---

### Person C: Infrastructure + API
**Owns:**
- `src/infrastructure/cosmos/repositories/` (implement `ITenantRepository`, `ISessionRepository`)
- `src/functions/search-api/` (implement Function App endpoints)
- `src/functions/admin-api/`

**Dependencies:**
- Uses: `ISearchService`, `ICityConfigService` (Person B provides)
- Uses: Cosmos DB SDK directly

---

## ✅ Contract Checklist

Before starting implementation:
- [ ] **Read** all contract files in `src/core/contracts/`
- [ ] **Understand** `integration-flows.md` (data flow diagrams)
- [ ] **Review** `example-implementations.md` (reference code)
- [ ] **Identify** which interfaces you need to implement
- [ ] **Identify** which interfaces you depend on (from other team members)

During implementation:
- [ ] **Implement** interface with `implements IServiceName`
- [ ] **Depend** on interfaces in constructor (not concrete classes)
- [ ] **Validate** inputs (throw typed errors)
- [ ] **Handle** errors with try/catch
- [ ] **Write** unit tests with mocked dependencies
- [ ] **Run** `npm run build` to check TypeScript errors

Before integration:
- [ ] **Verify** your implementation satisfies the contract (all methods implemented)
- [ ] **Verify** you're using correct types (Request/Response types match)
- [ ] **Run** integration tests with real dependencies (dev environment)
- [ ] **Document** any deviations from contract (update contracts if needed)

---

## 📞 When to Update Contracts

Contracts should be **stable**, but if you discover a missing field or method:

1. **Discuss with team** first (don't break others' work)
2. **Update contract file** (e.g., add optional field to `SearchRequest`)
3. **Update example implementations** to show new usage
4. **Notify team** in standup
5. **Update tests** that depend on changed contracts

**Rule:** Never remove required fields or methods without team agreement.

---

## 🎯 Success Metrics

You know contracts are working when:
- ✅ Team members can merge PRs without conflicts
- ✅ `npm run build` passes with no TypeScript errors
- ✅ Unit tests run with mocked dependencies
- ✅ Integration tests pass when components come together
- ✅ Frontend and backend integrate smoothly (no "undefined" errors)

---

## 📚 Additional Resources

- **Full Plan:** `.claude/plans/clever-munching-pascal.md`
- **Integration Flows:** `docs/architecture/integration-flows.md`
- **Example Code:** `docs/architecture/example-implementations.md`
- **Data Models:** `src/core/models/canonical-schema.ts`

---

**Questions?** Start with `AGENTS.md`, then the orchestration tracker and persona contract before treating older examples here as active scope.
