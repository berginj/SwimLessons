# Integration Flows & Touchpoints

This document describes how components integrate using the defined contracts. Use it as an integration map for the current NYC MVP.

What is current:
- parent search, session details, telemetry, browser-origin handling, and transit enrichment
- staging deployment, deterministic NYC seeding, and smoke verification

What is not a current MVP workflow:
- city onboarding UI
- generic multi-city scheduled sync orchestration
- admin-portal-driven setup flows

Treat those deferred areas as backlog, not active implementation truth, unless the orchestration tracker explicitly restates them.

## Table of Contents
1. [Search Flow (User Journey)](#search-flow-user-journey)
2. [Current Operator Flow (Staging Seed + Smoke)](#current-operator-flow-staging-seed--smoke)
3. [Deferred Workflow Notes](#deferred-workflow-notes)
4. [Dependency Graph](#dependency-graph)
5. [Contract Enforcement Rules](#contract-enforcement-rules)

---

## Search Flow (User Journey)

### End-to-End: User searches → sees results → clicks signup

```
┌─────────────┐
│   Browser   │
│ (Static Web │
│ App HTML/JS)│
└──────┬──────┘
       │ 1. POST /api/search
       │    SearchRequest {
       │      cityId: "nyc"
       │      filters: { childAge: 60, daysOfWeek: [6,0] }
       │      userContext: { origin: {lat, lng} }
       │    }
       ▼
┌──────────────────────┐
│  Azure Function App  │
│  src/functions/      │
│  search-api/         │
│  search.ts           │
└──────┬───────────────┘
       │ 2. Call ISearchService.search()
       ▼
┌──────────────────────┐
│  SearchService       │
│  implements          │
│  ISearchService      │
└──────┬───────────────┘
       │
       ├─ 3a. Get city config
       │      ICityConfigService.getCityConfig("nyc")
       │      └─> ITenantRepository.getById("nyc")
       │          └─> Cosmos DB "tenants" container
       │
       ├─ 3b. Query sessions
       │      ISessionRepository.querySessions("nyc", filters)
       │      └─> Cosmos DB "sessions" container
       │          SELECT * FROM c
       │          WHERE c.cityId = "nyc"
       │            AND c.type = "SessionDocument"
       │            AND c.startDate >= @startDateMin
       │            AND ...
       │
       ├─ 3c. Calculate travel time (browser origin if granted,
       │      otherwise city default center / Times Square fallback)
       │      ITransitService.batchEstimate(origin, destinations, "walking", "nyc")
       │      └─> Check ICityConfigService for transit provider
       │          └─> If `TRANSIT_ROUTER_GRAPHQL_URL` is configured:
       │              call OTP-style GraphQL router
       │              Else: fallback to deterministic NYC estimate
       │
       ├─ 3d. Filter by age eligibility
       │      sessions.filter(s => childAge >= s.program.ageMin && childAge <= s.program.ageMax)
       │
       ├─ 3e. Score & rank
       │      scoreSession(session, filters, cityConfig.searchProfile)
       │      weights = cityConfig.searchProfile.rankingWeights
       │      score = recency*0.2 + proximity*0.5 + availability*0.2 + quality*0.1
       │
       ├─ 3f. Sort by user preference
       │      sort(sessions, "distance", "asc")
       │
       └─ 3g. Apply pagination
              sessions.slice(skip, skip + take)
       │
       ▼
┌──────────────────────┐
│  SearchService       │
│  returns             │
│  SearchResults       │
└──────┬───────────────┘
       │ 4. Track telemetry
       │    ITelemetryService.trackSearchResults({
       │      eventName: "SearchResultsReturned"
       │      resultCount: 12
       │      executionTimeMs: 324
       │      relaxationApplied: false
       │    })
       │    └─> Application Insights (trackEvent)
       │    └─> IEventRepository.storeEvent() [async]
       │        └─> Cosmos DB "events" container
       │
       ▼
┌──────────────────────┐
│  Function App        │
│  Returns             │
│  ApiResponse<        │
│   SearchResponse>    │
└──────┬───────────────┘
       │ 5. HTTP 200 OK
       │    SearchResponse {
       │      results: [SessionSearchResult, ...]
       │      pagination: { total: 12 }
       │      executionTimeMs: 324
       │    }
       ▼
┌─────────────┐
│   Browser   │
│  Renders    │
│  results    │
└─────────────┘
```

### Key Integration Points

**Frontend → Backend**
- **Contract**: `SearchRequest` / `SearchResponse` (api-contracts.ts)
- **Endpoint**: POST /api/search
- **Validation**: Function App validates request schema, returns `ApiError` if invalid

**SearchService → CityConfigService**
- **Contract**: `ICityConfigService.getCityConfig()`
- **Returns**: `CityConfig` with search profile
- **Caching**: CityConfigService caches in-memory (5 min TTL)

**SearchService → SessionRepository**
- **Contract**: `ISessionRepository.querySessions()`
- **Query**: Cosmos DB with partition key `/cityId` for performance
- **Indexing**: Uses indexed paths: `/startDate`, `/daysOfWeek`, `/geographyIds`

**SearchService → TransitService**
- **Contract**: `ITransitService.batchEstimate()`
- **Current NYC MVP behavior**: top 10 search results receive transit enrichment
- **Fallback**: if live routing is unavailable, SearchService continues with deterministic fallback estimates

**SearchService → TelemetryService**
- **Contract**: `ITelemetryService.trackSearchResults()`
- **Fire-and-forget**: Async, doesn't block response

---

## Current Operator Flow (Staging Seed + Smoke)

### End-to-End: Push to `main` → staging gets a working NYC MVP slice

```
┌──────────────────────┐
│  GitHub Actions      │
│  cd-staging.yml      │
└──────┬───────────────┘
       │ 1. Deploy infra
       │    Bicep + SWA backend link + auth normalization
       ▼
┌──────────────────────┐
│  Azure Resources     │
│  Function App + SWA  │
└──────┬───────────────┘
       │ 2. Deploy Function package + web app
       ▼
┌──────────────────────┐
│  Seed deterministic  │
│  NYC data            │
│  seed-staging-nyc    │
└──────┬───────────────┘
       │ 3. Upsert known provider/location/program/session docs
       │    from data/sessions-template.csv
       ▼
┌──────────────────────┐
│  Restore router      │
│  settings            │
└──────┬───────────────┘
       │ 4. Reapply live transit-router URL and timeout
       │    before smoke
       ▼
┌──────────────────────┐
│  Staging smoke       │
│  run-staging-smoke   │
└──────┬───────────────┘
       │ 5. Verify:
       │    GET  /
       │    GET  /api/cities
       │    POST /api/search
       │    GET  /api/sessions/{id}
       │    POST /api/events
       │    router-backed transit parity
       ▼
┌──────────────────────┐
│  Live staging        │
│  deterministic NYC   │
│  MVP slice           │
└──────────────────────┘
```

### Key Integration Points

**GitHub workflow → Bicep + Azure CLI**
- **Contract**: `DEPLOYMENT-CONTRACT.md`
- **Current truth**: workflow owns SWA backend linking, auth normalization, router restore, seeding, and smoke

**Seed runner → Cosmos-backed repositories**
- **Contract**: deterministic NYC seed data is part of the MVP contract
- **Implementation**: `scripts/seed-staging-nyc.mjs` and `scripts/load-sessions.ts`

**Smoke script → live staging app**
- **Contract**: staging is not healthy unless seeded NYC search and session details actually work
- **Implementation**: `scripts/run-staging-smoke.mjs`

**Router smoke → live OTP router**
- **Contract**: staging smoke must prove router-backed transit, not fallback-only behavior
- **Implementation**: `scripts/smoke-transit-router.mjs`

---

## Deferred Workflow Notes

These flows are still represented in contracts, but they are not active NYC MVP workflows today:

- generic scheduled multi-city sync orchestration
- city onboarding UI and preview/activation workflow
- admin-portal-driven bulk upload flows

Treat them as deferred reference areas only. If work resumes on any of them:
- restate the workflow in `ORCHESTRATION-TRACKER.md`
- update the persona/workflow contract first if the parent journey changes
- avoid treating older diagrams in this file as implementation-ready specs

---

## Dependency Graph

### Service Dependencies (Who depends on whom?)

```
┌────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                      │
│  ┌──────────────┐              ┌────────────────┐          │
│  │ Static Web   │              │ Admin Portal   │          │
│  │ App Frontend │              │ (Deferred UI)  │          │
│  └──────┬───────┘              └───────┬────────┘          │
│         │                               │                   │
│         └───────────────┬───────────────┘                   │
└─────────────────────────┼─────────────────────────────────┘
                          │
                          │ HTTP (API Contracts)
                          │
┌─────────────────────────┼─────────────────────────────────┐
│                         │    API LAYER                     │
│                    ┌────▼─────┐                            │
│                    │ Function │                            │
│                    │   Apps   │                            │
│                    └────┬─────┘                            │
└─────────────────────────┼─────────────────────────────────┘
                          │
                          │ Service Contracts
                          │
┌─────────────────────────┼─────────────────────────────────┐
│                    SERVICE LAYER                           │
│                                                             │
│  ┌─────────────────┐          ┌──────────────────┐        │
│  │ SearchService   │◄─────────┤CityConfigService │        │
│  │ ISearchService  │          │ICityConfigService│        │
│  └────┬────────────┘          └────┬─────────────┘        │
│       │                             │                      │
│       │   ┌─────────────────┐       │                      │
│       ├──►│ TransitService  │       │                      │
│       │   │ ITransitService │       │                      │
│       │   └─────────────────┘       │                      │
│       │                             │                      │
│       │   ┌─────────────────┐       │                      │
│       └──►│TelemetryService │       │                      │
│           │ITelemetryService│       │                      │
│           └────┬────────────┘       │                      │
│                │                    │                      │
│  ┌─────────────┴──────────┐         │                      │
│  │  FeatureFlagService    │◄────────┘                      │
│  │  IFeatureFlagService   │                                │
│  └────────────┬───────────┘                                │
│               │                                             │
│  ┌────────────▼────────────┐                               │
│  │  OnboardingService      │                               │
│  │  IOnboardingService     │                               │
│  └────────────┬────────────┘                               │
│               │                                             │
│  ┌────────────▼────────────┐                               │
│  │   DataSyncService       │                               │
│  │   IDataSyncService      │                               │
│  └────────────┬────────────┘                               │
└───────────────┼─────────────────────────────────────────────┘
                │
                │ Repository Contracts
                │
┌───────────────┼─────────────────────────────────────────────┐
│          DATA ACCESS LAYER                                  │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ TenantRepository │  │SessionRepository │                │
│  │ITenantRepository │  │ISessionRepository│                │
│  └────┬─────────────┘  └────┬─────────────┘                │
│       │                     │                               │
│  ┌────┴─────────────────────┴────┐                         │
│  │     EventRepository            │                         │
│  │     IEventRepository           │                         │
│  └────┬───────────────────────────┘                         │
└───────┼──────────────────────────────────────────────────────┘
        │
        │ Cosmos DB SDK
        │
┌───────▼──────────────────────────────────────────────────────┐
│                      COSMOS DB                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ tenants  │  │ sessions │  │  events  │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└───────────────────────────────────────────────────────────────┘
```

### Adapter Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                  ADAPTER LAYER                               │
│                                                              │
│  ┌────────────────────────────────────────────────┐         │
│  │         ICityDataAdapter (Interface)           │         │
│  └────────────┬───────────────────────────────────┘         │
│               │                                              │
│       ┌───────┴────────┬────────────────┐                   │
│       │                │                │                   │
│  ┌────▼─────┐   ┌──────▼──────┐  ┌─────▼────────┐          │
│  │   NYC    │   │     LA      │  │   CSV        │          │
│  │ Adapter  │   │  Adapter    │  │  Adapter     │          │
│  └────┬─────┘   └──────┬──────┘  └─────┬────────┘          │
│       │                │                │                   │
│       ├────────────────┴────────────────┘                   │
│       │                                                      │
│       │ Uses SessionRepository to persist                   │
│       │                                                      │
│       ▼                                                      │
│  ISessionRepository                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Contract Enforcement Rules

### 1. Services MUST depend on interfaces, NOT concrete implementations

❌ **Wrong:**
```typescript
class SearchService {
  constructor(
    private sessionRepo: SessionRepository  // Concrete class
  ) {}
}
```

✅ **Correct:**
```typescript
class SearchService implements ISearchService {
  constructor(
    private sessionRepo: ISessionRepository  // Interface
  ) {}
}
```

**Why:** Enables testing with mocks, future database migrations, and dependency injection.

---

### 2. API endpoints MUST use API contracts

❌ **Wrong:**
```typescript
// Function App endpoint
export async function search(req: HttpRequest) {
  const filters = req.body; // Untyped!
  const results = await searchService.search(filters);
  return results; // Untyped response!
}
```

✅ **Correct:**
```typescript
export async function search(req: HttpRequest): Promise<ApiResponse<SearchResponse>> {
  const request: SearchRequest = req.body as SearchRequest;

  // Validate request
  if (!request.cityId) {
    return ApiResponseBuilder.error(
      ApiErrorCode.VALIDATION_ERROR,
      "cityId is required"
    );
  }

  const results = await searchService.search(
    request.filters,
    request.sort || { field: 'distance', direction: 'asc' },
    request.pagination || { skip: 0, take: 20 }
  );

  return ApiResponseBuilder.success<SearchResponse>({
    results: results.results,
    pagination: results.pagination,
    appliedFilters: request.filters,
    relaxationApplied: results.relaxationApplied,
    executionTimeMs: results.executionTimeMs
  });
}
```

---

### 3. Repositories MUST NOT know about business logic

❌ **Wrong:**
```typescript
class SessionRepository {
  async querySessions(cityId: string, filters: SearchFilters) {
    // ❌ Repository shouldn't calculate scores!
    const sessions = await this.query(cityId);
    return sessions.map(s => ({
      ...s,
      score: this.calculateScore(s, filters) // Business logic!
    }));
  }
}
```

✅ **Correct:**
```typescript
class SessionRepository implements ISessionRepository {
  async querySessions(cityId: string, filters: SessionQueryFilters) {
    // ✅ Just query and return data
    return await this.cosmosContainer
      .items
      .query({
        query: "SELECT * FROM c WHERE c.cityId = @cityId",
        parameters: [{ name: "@cityId", value: cityId }]
      })
      .fetchAll();
  }
}

// Business logic stays in SearchService
class SearchService implements ISearchService {
  async search(filters: SearchFilters) {
    const sessions = await this.sessionRepo.querySessions(
      filters.cityId,
      this.toQueryFilters(filters)
    );

    // Score in service layer
    return this.scoreAndRank(sessions, filters);
  }
}
```

---

### 4. Adapters MUST transform to canonical schema

❌ **Wrong:**
```typescript
class NYCParksAdapter {
  async getSessions() {
    const data = await this.apiClient.fetchPrograms();
    return data; // ❌ Returning NYC-specific format!
  }
}
```

✅ **Correct:**
```typescript
class NYCParksAdapter implements ICityDataAdapter {
  async getSessions(): Promise<Session[]> {
    const nycPrograms = await this.apiClient.fetchPrograms();

    // ✅ Transform to canonical schema
    return nycPrograms.map(p => this.transformToSession(p));
  }

  private transformToSession(nycProgram: NYCProgram): Session {
    return {
      id: `nyc-session-${nycProgram.id}`,
      cityId: "nyc",
      type: "SessionDocument",
      programId: nycProgram.programId,
      // ... map all fields to canonical schema
    };
  }
}
```

---

### 5. All async operations MUST handle errors

❌ **Wrong:**
```typescript
async search(filters: SearchFilters) {
  const config = await this.cityConfigService.getCityConfig(filters.cityId);
  // ❌ What if config is null?
  return this.scoreAndRank(sessions, config);
}
```

✅ **Correct:**
```typescript
async search(filters: SearchFilters): Promise<SearchResults> {
  const config = await this.cityConfigService.getCityConfig(filters.cityId);

  if (!config) {
    throw new AppError(
      ApiErrorCode.CITY_NOT_FOUND,
      `City ${filters.cityId} not found`
    );
  }

  if (config.status !== 'active') {
    throw new AppError(
      ApiErrorCode.CITY_INACTIVE,
      `City ${filters.cityId} is not active`
    );
  }

  try {
    return await this.scoreAndRank(sessions, config);
  } catch (error) {
    this.telemetryService.trackError({
      eventName: 'Error',
      errorType: 'SearchError',
      errorMessage: error.message,
      operation: 'search'
    });
    throw error;
  }
}
```

---

## Testing with Contracts

### Unit Testing: Mock interfaces

```typescript
// tests/unit/services/search-service.test.ts

describe('SearchService', () => {
  let searchService: ISearchService;
  let mockSessionRepo: jest.Mocked<ISessionRepository>;
  let mockCityConfigService: jest.Mocked<ICityConfigService>;

  beforeEach(() => {
    // Create mocks of interfaces
    mockSessionRepo = {
      querySessions: jest.fn(),
      // ... other methods
    } as jest.Mocked<ISessionRepository>;

    mockCityConfigService = {
      getCityConfig: jest.fn(),
      // ... other methods
    } as jest.Mocked<ICityConfigService>;

    // Inject mocks
    searchService = new SearchService(
      mockSessionRepo,
      mockCityConfigService,
      mockTransitService,
      mockTelemetryService
    );
  });

  it('should return sessions for valid search', async () => {
    // Arrange
    mockCityConfigService.getCityConfig.mockResolvedValue(mockNYCConfig);
    mockSessionRepo.querySessions.mockResolvedValue([mockSession1, mockSession2]);

    // Act
    const result = await searchService.search(
      { cityId: 'nyc', childAge: 60 },
      { field: 'distance', direction: 'asc' },
      { skip: 0, take: 20 }
    );

    // Assert
    expect(result.results).toHaveLength(2);
    expect(mockSessionRepo.querySessions).toHaveBeenCalledWith(
      'nyc',
      expect.objectContaining({ /* filters */ })
    );
  });
});
```

---

## Summary: Why Contracts Matter

✅ **Parallel Development**
- Frontend and backend teams can work simultaneously
- Service and repository teams don't block each other
- Adapters can be built independently

✅ **Type Safety**
- TypeScript enforces contracts at compile time
- No runtime surprises from mismatched types

✅ **Testability**
- Mock interfaces for unit tests
- Test services in isolation

✅ **Maintainability**
- Clear boundaries between layers
- Easy to understand data flow
- Changes to implementation don't break contracts

✅ **Scalability**
- Swap implementations (e.g., Cosmos DB → PostgreSQL)
- Add new cities without changing core code
- Add features without breaking existing endpoints

**Next Steps:**
1. Review this document with your team (Week 1, Day 3)
2. Assign layers to team members (Person A: Adapters, Person B: Services, Person C: API + Frontend)
3. Start implementing using contracts as the integration spec
