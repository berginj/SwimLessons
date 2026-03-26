# Architecture Documentation

**Project:** Swim Lessons Discovery Platform
**Architecture:** City-as-Tenant Multi-Tenant SaaS
**Team:** 2-4 developers
**Status:** NYC MVP active; this file also preserves older contract-planning reference material

---

## 📚 Documentation Index

### 🚀 Start Here
**👉 [CONTRACT-SUMMARY.md](./CONTRACT-SUMMARY.md)** - Quick reference guide for all contracts
**👉 [PARENT-PERSONA.md](./PARENT-PERSONA.md)** - Canonical parent/caregiver persona and trust requirements
**👉 [ORCHESTRATION-TRACKER.md](./ORCHESTRATION-TRACKER.md)** - Canonical handoff, backlog, and next-task tracker for agents
**👉 [DEPLOYMENT-CONTRACT.md](./DEPLOYMENT-CONTRACT.md)** - Deployment ownership, sequence, and anti-drift rules
**👉 [TRANSIT-ROUTER-CONTRACT.md](./TRANSIT-ROUTER-CONTRACT.md)** - NYC schedule-based transit routing boundary and fallback rules
**👉 [../operations/OPERATOR-STATS-RUNBOOK.md](../operations/OPERATOR-STATS-RUNBOOK.md)** - Safe operator workflow for the protected city stats endpoint

### 📖 Deep Dives
1. **[integration-flows.md](./integration-flows.md)** - Data flow diagrams, dependency graphs
2. **[example-implementations.md](./example-implementations.md)** - Reference code for each layer

### 📝 Design Decisions
- **[adr/](./adr/)** - Architecture Decision Records (coming soon)

---

## Current-Reality Note

Use this file as architectural reference, not the live workboard.

For current repo truth, start with:
1. `AGENTS.md`
2. `docs/architecture/PARENT-PERSONA.md`
3. `docs/architecture/ORCHESTRATION-TRACKER.md`
4. `docs/architecture/DEPLOYMENT-CONTRACT.md`

Some later examples in this file still reflect the original contract-planning phase.
They are helpful for understanding boundaries, but they should not override the current NYC MVP workflow described in the tracker and deployment contract.

---

## 🎯 Contract Overview

We've created **5 core contract files** that define **all** integration points:

| Contract File | Lines | Purpose |
|---------------|-------|---------|
| `city-config.ts` | 250 | City configuration types, search profiles |
| `city-adapter.ts` | 180 | City data adapter interface |
| `services.ts` | 570 | Service layer interfaces (8 services) |
| `repositories.ts` | 450 | Data access layer (3 repositories) |
| `api-contracts.ts` | 490 | HTTP request/response types (15 endpoints) |
| **Total** | **1,940 lines** | **Complete integration specification** |

---

## 🔗 How Contracts Enable Parallel Development

### Without Contracts ❌
```
Person A: "What format should getSessions() return?"
Person B: "I don't know, let's discuss..."
Person C: "Wait, we need to refactor..."
→ Blocked, waiting, conflicts
```

### With Contracts ✅
```
Person A: Implements ICityDataAdapter → returns Session[]
Person B: Implements ISearchService → expects Session[] (from contract)
Person C: Implements ISessionRepository → stores Session (from contract)
→ All work in parallel, integrate smoothly
```

---

## 📐 Architecture Layers (Contracts-First)

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION (Static Web App HTML/CSS/JS)                   │
│  Contract: api-contracts.ts (SearchRequest/SearchResponse)  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│  API (Azure Function Apps)                                   │
│  Contract: api-contracts.ts                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│  SERVICES (Business Logic)                                   │
│  Contract: services.ts (ISearchService, ICityConfigService)  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│  REPOSITORIES (Data Access)                                  │
│  Contract: repositories.ts (ISessionRepository)              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│  ADAPTERS (City Data Sources)                                │
│  Contract: city-adapter.ts (ICityDataAdapter)                │
└──────────────────────────┴──────────────────────────────────┘
```

---

## 🛠️ Contract Files in Detail

### 1. City Configuration (`city-config.ts`)

**Exports:**
- `CityConfig` - Complete city configuration
- `SearchFilters` - User search criteria
- `CitySearchProfile` - City-specific ranking weights
- `TenantCatalog` - Control plane entry

**Used By:** Everyone (core data types)

**Key Concepts:**
- Each city is a tenant with config-driven behavior
- Search profiles enable NYC (transit-heavy) vs LA (car-centric) differences
- Feature flags stored per city

---

### 2. City Adapter (`city-adapter.ts`)

**Exports:**
- `ICityDataAdapter` - Interface for city data sources
- `BaseAdapter` - Helper methods (distance calculation)

**Implements:** NYC Adapter, LA Adapter, CSV Adapter

**Key Methods:**
- `getSessions()` → `Promise<Session[]>` - Fetch and transform to canonical schema
- `syncData()` → `Promise<SyncResult>` - Update Cosmos DB from source
- `validateConfig()` → Check adapter configuration

**Used By:** DataSyncService, OnboardingService

---

### 3. Service Contracts (`services.ts`)

**Exports 8 Interfaces:**
1. `ISearchService` - Search, score, rank sessions
2. `ICityConfigService` - Manage city configurations
3. `IFeatureFlagService` - Feature toggles (Azure App Config)
4. `ITelemetryService` - Event tracking (Application Insights)
5. `ITransitService` - Travel time estimates
6. `IOnboardingService` - City onboarding workflow
7. `IDataSyncService` - Scheduled data sync

**Pattern:** Services depend on repository interfaces, not concrete classes

**Example:**
```typescript
class SearchService implements ISearchService {
  constructor(
    private sessionRepo: ISessionRepository,  // Interface!
    private cityConfigService: ICityConfigService
  ) {}
}
```

---

### 4. Repository Contracts (`repositories.ts`)

**Exports 3 Interfaces:**
1. `ITenantRepository` - City configs (Cosmos DB "tenants" container)
2. `ISessionRepository` - Sessions, providers, locations, programs (Cosmos DB "sessions")
3. `IEventRepository` - Telemetry events (Cosmos DB "events", 90-day TTL)

**Pattern:** Repositories are dumb data access (no business logic)

**Example:**
```typescript
class SessionRepository implements ISessionRepository {
  async querySessions(cityId, filters): Promise<Session[]> {
    // Just query and return, no scoring/filtering
    return await this.cosmosContainer.items.query(...).fetchAll();
  }
}
```

---

### 5. API Contracts (`api-contracts.ts`)

**Exports 15+ Request/Response Types:**

**Public API:**
- `SearchRequest` / `SearchResponse`
- `SessionDetailsRequest` / `SessionDetailsResponse`
- `ListCitiesRequest` / `ListCitiesResponse`

**Admin API:**
- `CreateProviderRequest` / `CreateProviderResponse`
- `BulkUploadRequest` / `BulkUploadResponse`
- `OnboardCityRequest` / `OnboardCityResponse`

**Standard Wrapper:**
- `ApiResponse<T>` - All endpoints return this
- `ApiError` - Standard error format
- `ApiErrorCode` - Enum of error codes

**Example:**
```typescript
// Frontend
const request: SearchRequest = {
  cityId: "nyc",
  filters: { childAge: 60 }
};
const response: ApiResponse<SearchResponse> = await api.search(request);

// Backend
return ApiResponseBuilder.success<SearchResponse>({ results });
```

---

## 📊 Team Assignments (Based on Contracts)

### Person A: Adapters + Sync
**Files:**
- `src/adapters/nyc/nyc-adapter.ts` (implements `ICityDataAdapter`)
- `src/services/data-sync/data-sync-service.ts` (implements `IDataSyncService`)
- `src/functions/jobs/data-sync.ts` (calls service)

**Depends On:**
- `ISessionRepository` (from Person C)
- `ICityConfigService` (from Person B)

---

### Person B: Services
**Files:**
- `src/services/search/search-service.ts` (implements `ISearchService`)
- `src/services/control-plane/city-config-service.ts` (implements `ICityConfigService`)
- `src/services/feature-flags/feature-flag-service.ts` (implements `IFeatureFlagService`)
- `src/services/telemetry/telemetry-service.ts` (implements `ITelemetryService`)

**Depends On:**
- `ISessionRepository`, `ITenantRepository` (from Person C)
- `ICityDataAdapter` (from Person A)

---

### Person C: Infrastructure + API
**Files:**
- `src/infrastructure/cosmos/repositories/session-repository.ts` (implements `ISessionRepository`)
- `src/infrastructure/cosmos/repositories/tenant-repository.ts` (implements `ITenantRepository`)
- `src/functions/search-api/search.ts` (HTTP endpoint, calls service)
- `src/functions/admin-api/bulk-upload.ts` (HTTP endpoint)

**Depends On:**
- `ISearchService`, `ICityConfigService` (from Person B)
- Cosmos DB SDK

---

## 🧪 Testing Strategy

### Unit Tests (Mock Interfaces)
```typescript
// Person B tests SearchService
const mockSessionRepo = createMock<ISessionRepository>();
const mockCityConfig = createMock<ICityConfigService>();
const searchService = new SearchService(mockSessionRepo, mockCityConfig);

// Mock behavior
mockSessionRepo.querySessions.mockResolvedValue([mockSession]);

// Test
const result = await searchService.search(filters, sort, pagination);
expect(result.results).toHaveLength(1);
```

### Integration Tests (Real Dependencies)
```typescript
// Test SearchService → SessionRepository → Cosmos DB
const cosmosClient = new CosmosClient(connectionString);
const sessionRepo = new SessionRepository(cosmosClient, 'swimlessons', 'sessions');
const searchService = new SearchService(sessionRepo, cityConfigService);

// Real query to Cosmos DB
const result = await searchService.search({ cityId: 'nyc' }, sort, pagination);
expect(result.results.length).toBeGreaterThan(0);
```

---

## ✅ Contract Validation Checklist

Before merging your code:

- [ ] **Implements contract** - `class Foo implements IFoo`
- [ ] **All methods implemented** - No "Not implemented" errors
- [ ] **Depends on interfaces** - Constructor params are `I*`, not concrete classes
- [ ] **Uses API contracts** - Function Apps use `SearchRequest`/`SearchResponse`
- [ ] **Handles errors** - Try/catch with typed errors
- [ ] **TypeScript compiles** - `npm run build` passes
- [ ] **Tests pass** - `npm test` passes with mocked dependencies
- [ ] **Linter passes** - `npm run lint` has no errors

---

## 📞 Getting Help

### Contract Questions
1. **Read:** Contract file comments (TSDoc)
2. **Review:** `example-implementations.md` for reference code
3. **Check:** `integration-flows.md` for data flow diagrams
4. **Ask:** Weekly standup (Mondays 10am)

### Implementation Questions
1. **Read:** `example-implementations.md` (copy-paste patterns)
2. **Debug:** `integration-flows.md` (which service calls which?)
3. **Test:** Write unit test with mocked dependencies
4. **Ask:** Slack channel or standup

---

## 🎯 Success Metrics

Contracts are successful when:
- ✅ No merge conflicts between team members
- ✅ `npm run build` always passes (TypeScript enforces contracts)
- ✅ Integration works first try (frontend + backend)
- ✅ Tests are easy to write (mock interfaces)
- ✅ New team members onboard quickly (clear contracts)

---

## 📖 Next Steps

1. **Week 1, Day 3:** Team reviews contracts together (30 min meeting)
2. **Week 2-3:** Implement contracts in parallel (Person A/B/C work independently)
3. **Week 4:** Integration test (bring components together)
4. **Week 5+:** Build on top of contracts (services, API, frontend)

---

**Contracts Complete! Ready for parallel development. 🚀**
