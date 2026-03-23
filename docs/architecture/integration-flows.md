# Integration Flows & Touchpoints

This document describes how all components integrate using the defined contracts. Use this as your integration map when implementing services.

## Table of Contents
1. [Search Flow (User Journey)](#search-flow-user-journey)
2. [Data Sync Flow (Scheduled Job)](#data-sync-flow-scheduled-job)
3. [City Onboarding Flow (Admin)](#city-onboarding-flow-admin)
4. [Dependency Graph](#dependency-graph)
5. [Contract Enforcement Rules](#contract-enforcement-rules)

---

## Search Flow (User Journey)

### End-to-End: User searches → sees results → clicks signup

```
┌─────────────┐
│   Browser   │
│  (React PWA)│
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
       ├─ 3c. Calculate travel time (if origin provided)
       │      ITransitService.batchEstimate(origin, destinations, "walking", "nyc")
       │      └─> Check ICityConfigService for transit provider
       │          └─> If "mta": call MTA API
       │              Else: fallback to haversine distance
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
- **Fallback**: Returns null if city doesn't support transit, SearchService continues without travel time

**SearchService → TelemetryService**
- **Contract**: `ITelemetryService.trackSearchResults()`
- **Fire-and-forget**: Async, doesn't block response

---

## Data Sync Flow (Scheduled Job)

### End-to-End: Daily sync updates session data from city sources

```
┌──────────────────────┐
│  Azure Timer Trigger │
│  Cron: "0 2 * * *"   │
│  (2am daily)         │
└──────┬───────────────┘
       │ 1. Trigger data-sync Function
       ▼
┌──────────────────────┐
│  Function App        │
│  src/functions/jobs/ │
│  data-sync.ts        │
└──────┬───────────────┘
       │ 2. Call IDataSyncService.syncAllCities()
       ▼
┌──────────────────────┐
│  DataSyncService     │
│  implements          │
│  IDataSyncService    │
└──────┬───────────────┘
       │
       ├─ 3a. Get all active cities
       │      ICityConfigService.listCities()
       │      └─> ITenantRepository.list({ status: "active" })
       │          └─> Cosmos DB "tenants" container
       │
       └─ 3b. For each city, sync data
              for (city of cities) {
                syncCity(city.cityId)
              }
       │
       ▼
┌──────────────────────┐
│  DataSyncService     │
│  syncCity("nyc")     │
└──────┬───────────────┘
       │
       ├─ 4a. Get city adapter
       │      adapterFactory.getAdapter("nyc")
       │      └─> Returns ICityDataAdapter instance (e.g., NYCParksAdapter)
       │
       ├─ 4b. Run adapter sync
       │      adapter.syncData()
       │      └─> NYCParksAdapter.syncData()
       │          ├─> Fetch from NYC Parks API
       │          ├─> Transform to canonical schema
       │          └─> Returns SyncResult {
       │                success: true
       │                recordsUpdated: 145
       │                errors: []
       │              }
       │
       ├─ 4c. Persist synced data
       │      For each session in syncResult:
       │        ISessionRepository.batchUpsertSessions(sessions)
       │        └─> Cosmos DB bulk operation (efficient)
       │
       ├─ 4d. Track sync result
       │      ITelemetryService.trackEvent({
       │        eventName: "DataSync"
       │        cityId: "nyc"
       │        syncResult: { ... }
       │      })
       │
       └─ 4e. Alert on failure
              if (!syncResult.success) {
                // Send alert (email/Slack)
                // Log to Application Insights as error
              }
       │
       ▼
┌──────────────────────┐
│  Return to Timer     │
│  Trigger (complete)  │
└──────────────────────┘
```

### Key Integration Points

**Timer Trigger → DataSyncService**
- **Contract**: `IDataSyncService.syncAllCities()`
- **Error Handling**: Catches errors, logs to App Insights, doesn't crash

**DataSyncService → City Adapter**
- **Contract**: `ICityDataAdapter.syncData()`
- **Implementation**: Each city (NYC, LA, etc.) implements this
- **Isolation**: Adapter failure doesn't affect other cities

**City Adapter → SessionRepository**
- **Contract**: `ISessionRepository.batchUpsertSessions()`
- **Performance**: Batch operation (100s of sessions at once)
- **Idempotency**: Upsert by ID, safe to re-run

**DataSyncService → TelemetryService**
- **Contract**: `ITelemetryService.trackEvent()`
- **Monitoring**: Track sync success/failure rates

---

## City Onboarding Flow (Admin)

### End-to-End: Admin onboards new city via admin portal

```
┌─────────────┐
│ Admin Portal│
│  (React)    │
└──────┬──────┘
       │ 1. POST /admin/cities/onboard
       │    OnboardCityRequest {
       │      cityName: "Los Angeles"
       │      timezone: "America/Los_Angeles"
       │      adapterType: "csv-import"
       │      adapterConfig: { csvData: "..." }
       │    }
       ▼
┌──────────────────────┐
│  Function App        │
│  src/functions/      │
│  admin-api/          │
│  city-onboarding.ts  │
└──────┬───────────────┘
       │ 2. Call IOnboardingService.startOnboarding()
       ▼
┌──────────────────────┐
│  OnboardingService   │
│  implements          │
│  IOnboardingService  │
└──────┬───────────────┘
       │
       │ STEP 1: Generate cityId
       ├─ 3. cityId = slugify("Los Angeles") = "la"
       │
       │ STEP 2-3: Create city config
       ├─ 4. Build CityConfig object
       │      ICityConfigService.createCity(config)
       │      └─> ITenantRepository.create(tenantCatalog)
       │          └─> Cosmos DB "tenants" container
       │              Status: "preview" (not visible to users yet)
       │
       │ STEP 4: Validate adapter
       ├─ 5. adapterFactory.getAdapter("la")
       │      adapter.validateConfig()
       │      └─> CSVAdapter.validateConfig()
       │          ├─> Parse CSV headers
       │          ├─> Check required fields
       │          └─> Returns ValidationResult {
       │                valid: true
       │                errors: []
       │                warnings: ["Missing price for 5 sessions"]
       │              }
       │
       │ STEP 5: Preview data
       ├─ 6. adapter.getSessions()
       │      └─> Parse CSV, transform to canonical schema
       │          Returns preview of first 10 sessions
       │
       │ STEP 6: Initial sync (if admin approves preview)
       ├─ 7. adapter.syncData()
       │      ISessionRepository.batchUpsertSessions(sessions)
       │      └─> Cosmos DB "sessions" container
       │          Partition key: /cityId = "la"
       │          Creates: 50 providers, 120 locations, 500 sessions
       │
       │ STEP 7-9: Review & activate
       ├─ 8. Admin reviews search results in preview mode
       │      IFeatureFlagService.setFlag("city.la.status", "preview")
       │      Only internal users see it
       │
       │ STEP 10: Activate
       └─ 9. ICityConfigService.updateCity("la", { status: "active" })
              IFeatureFlagService.setFlag("city.la.status", "active")
              └─> City appears in public city list
       │
       ▼
┌──────────────────────┐
│  Return              │
│  OnboardCityResponse │
│  { cityId: "la" }    │
└──────────────────────┘
```

### Key Integration Points

**Admin Portal → OnboardingService**
- **Contract**: `IOnboardingService.startOnboarding()`
- **Validation**: Service validates request before creating city

**OnboardingService → City Adapter**
- **Contract**: `ICityDataAdapter.validateConfig()`, `syncData()`
- **Adapter Factory**: `getAdapter(cityId)` returns correct adapter instance
- **Polymorphism**: Different adapters (CSV, API, scraper) implement same interface

**OnboardingService → FeatureFlagService**
- **Contract**: `IFeatureFlagService.setFlag()`
- **Preview Mode**: `city.{cityId}.status = "preview"` for testing

---

## Dependency Graph

### Service Dependencies (Who depends on whom?)

```
┌────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                      │
│  ┌──────────────┐              ┌────────────────┐          │
│  │ React PWA    │              │ Admin Portal   │          │
│  │ (Frontend)   │              │ (Admin UI)     │          │
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
