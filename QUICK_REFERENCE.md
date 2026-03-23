# Quick Reference: Implemented Services

## Files Created

### Services (4 implementations)

| Service | File | Lines | Purpose |
|---------|------|-------|---------|
| TelemetryService | `src/services/telemetry/telemetry-service.ts` | 316 | Application Insights + Cosmos DB event tracking |
| FeatureFlagService | `src/services/feature-flags/feature-flag-service.ts` | 283 | Azure App Configuration flag management |
| TransitService | `src/services/transit/transit-service.ts` | 161 | Distance-based transit time estimates |
| EventRepository | `src/infrastructure/cosmos/repositories/event-repository.ts` | 243 | Cosmos DB event storage and querying |

### Index Files (3 created)
- `src/services/telemetry/index.ts`
- `src/services/feature-flags/index.ts`
- `src/services/transit/index.ts`

### Updated Files (1 modified)
- `src/infrastructure/cosmos/repositories/index.ts` - Now exports EventRepository

---

## Contract Implementations

### 1. ITelemetryService
**Location:** `src/core/contracts/services.ts` (lines 252-314)

**Methods Implemented:**
- ✅ `trackEvent(event: TelemetryEvent): Promise<void>`
- ✅ `trackSearchStarted(event: SearchStartedEvent): Promise<void>`
- ✅ `trackSearchResults(event: SearchResultsEvent): Promise<void>`
- ✅ `trackSessionViewed(event: SessionViewedEvent): Promise<void>`
- ✅ `trackSignupClicked(event: SignupClickedEvent): Promise<void>`
- ✅ `trackNoResults(event: NoResultsEvent): Promise<void>`
- ✅ `trackError(error: ErrorEvent): Promise<void>`
- ✅ `trackMetric(metricName: string, value: number, properties?: Record<string, string>): Promise<void>`

### 2. IFeatureFlagService
**Location:** `src/core/contracts/services.ts` (lines 194-229)

**Methods Implemented:**
- ✅ `isEnabled(flagKey: string, context: FeatureFlagContext): Promise<boolean>`
- ✅ `getVariant<T = string>(flagKey: string, context: FeatureFlagContext): Promise<T>`
- ✅ `getAllFlags(cityId: string): Promise<Record<string, boolean | string>>`
- ✅ `setFlag(flagKey: string, value: boolean | string): Promise<void>`

**Bonus Methods:**
- `clearCache(): Promise<void>`
- `getCacheStats()`

### 3. ITransitService
**Location:** `src/core/contracts/services.ts` (lines 388-421)

**Methods Implemented:**
- ✅ `estimateTransitTime(origin: Coordinates, destination: Coordinates, mode: TransitMode, cityId: string): Promise<TransitEstimate | null>`
- ✅ `batchEstimate(origin: Coordinates, destinations: Array<{ id: string; coordinates: Coordinates }>, mode: TransitMode, cityId: string): Promise<Map<string, TransitEstimate>>`

### 4. IEventRepository
**Location:** `src/core/contracts/repositories.ts` (lines 358-402)

**Methods Implemented:**
- ✅ `storeEvent(event: TelemetryEvent): Promise<void>`
- ✅ `batchStoreEvents(events: TelemetryEvent[]): Promise<number>`
- ✅ `queryEvents(cityId: string, filters: EventQueryFilters, limit?: number): Promise<TelemetryEvent[]>`
- ✅ `getEventCounts(cityId: string, startDate: string, endDate: string): Promise<Map<string, number>>`

---

## Integration Checklist

- [ ] Create DI container registrations for all services
- [ ] Wire TelemetryService into all Function App endpoints
- [ ] Configure Application Insights connection string
- [ ] Configure Azure App Configuration connection string
- [ ] Create Cosmos DB "events" container with:
  - Container name: `events`
  - Partition key: `/cityId`
  - TTL enabled: 90 days
- [ ] Create Feature Flag entries in App Configuration:
  - Examples: `city.nyc.transitETA.enabled`, `search.ranking.variant`
- [ ] Test all services with mocks before integration
- [ ] Add unit tests for each service

---

## Code Examples

### TelemetryService Usage
```typescript
const telemetry = new TelemetryService(appInsightsClient, eventRepository);

// Track search results
await telemetry.trackSearchResults({
  eventName: 'SearchResultsReturned',
  timestamp: new Date().toISOString(),
  sessionId: 'session-123',
  cityId: 'nyc',
  userId: 'user-456',
  platform: 'web',
  resultCount: 15,
  executionTimeMs: 243,
  relaxationApplied: false,
  filters: searchFilters,
});

// Fire-and-forget: Cosmos DB write happens async, doesn't block
```

### FeatureFlagService Usage
```typescript
const flags = new FeatureFlagService(appConfigClient);

// Check if transit ETA is enabled for NYC
const enabled = await flags.isEnabled('city.{cityId}.transitETA.enabled', {
  cityId: 'nyc'
});

// Get A/B test variant
const variant = await flags.getVariant('search.ranking.variant', { cityId: 'nyc' });

// Admin: Update flag
await flags.setFlag('city.nyc.transitETA.enabled', 'true');
```

### TransitService Usage
```typescript
const transit = new TransitService();

// Estimate transit time
const estimate = await transit.estimateTransitTime(
  { latitude: 40.7128, longitude: -74.0060 },  // User location
  { latitude: 40.7580, longitude: -73.9855 },  // Destination
  { mode: 'subway', displayName: 'Subway', maxReasonableMinutes: 30 },
  'nyc'
);
// Returns: { durationMinutes: 12, distance: 3.4, mode: 'subway', confidence: 'fallback', ... }

// Batch estimate (more efficient)
const estimates = await transit.batchEstimate(
  { latitude: 40.7128, longitude: -74.0060 },
  [
    { id: 'loc-1', coordinates: { ... } },
    { id: 'loc-2', coordinates: { ... } },
  ],
  { mode: 'walking', displayName: 'Walking', maxReasonableMinutes: 30 },
  'nyc'
);
```

### EventRepository Usage
```typescript
const eventRepo = new EventRepository(cosmosContainer);

// Store single event
await eventRepo.storeEvent(telemetryEvent);

// Batch store
const count = await eventRepo.batchStoreEvents([...events]);

// Query events
const results = await eventRepo.queryEvents('nyc', {
  eventNames: ['SearchStarted'],
  startDate: '2026-03-20T00:00:00Z',
  endDate: '2026-03-23T23:59:59Z',
}, 1000);

// Get counts for dashboard
const counts = await eventRepo.getEventCounts(
  'nyc',
  '2026-03-20T00:00:00Z',
  '2026-03-23T23:59:59Z'
);
```

---

## Key Design Decisions

1. **Fire-and-Forget Telemetry**
   - Application Insights: Synchronous (blocking)
   - Cosmos DB: Asynchronous (non-blocking)
   - Ensures user requests not delayed by telemetry

2. **Caching Strategy**
   - FeatureFlagService: 5-minute TTL
   - EventRepository: No caching (Cosmos DB handles caching)
   - TelemetryService: No caching (events are temporal)

3. **Error Handling**
   - TelemetryService: Silent failures (never blocks user requests)
   - FeatureFlagService: Defaults to false on errors (safe failure)
   - TransitService: Returns null on errors (caller handles)
   - EventRepository: Throws errors (caller decides action)

4. **Transit Time Estimation**
   - Distance-based fallback only (no external API calls)
   - Ready for city-specific adapter pattern
   - Marked as "fallback" confidence level for filtering

---

## Dependencies Required

### NPM Packages
```json
{
  "applicationinsights": "^2.x.x",
  "@azure/app-configuration": "^1.x.x",
  "@azure/cosmos": "^3.x.x"
}
```

### Cosmos DB Container Setup
```javascript
{
  "id": "events",
  "partitionKey": {
    "paths": ["/cityId"]
  },
  "defaultTtl": 7776000,  // 90 days in seconds
  "indexingPolicy": {
    "includedPaths": [
      { "path": "/cityId/*" },
      { "path": "/eventName/*" },
      { "path": "/timestamp/*" },
      { "path": "/sessionId/*" },
      { "path": "/userId/*" }
    ]
  }
}
```

---

## Performance Characteristics

| Service | Operation | Latency | Blocking |
|---------|-----------|---------|----------|
| TelemetryService | trackEvent (AI) | ~5-10ms | Yes |
| TelemetryService | trackEvent (CosmosDB) | Async | No |
| FeatureFlagService | isEnabled (cached) | <1ms | Yes |
| FeatureFlagService | isEnabled (fresh) | ~50-100ms | Yes |
| TransitService | estimateTransitTime | <1ms | Yes |
| TransitService | batchEstimate | <10ms | Yes |
| EventRepository | storeEvent | ~10-20ms | Yes |
| EventRepository | queryEvents | Variable | Yes |

---

## Monitoring Recommendations

1. **Application Insights**
   - Set alerts on error rate > 1%
   - Set alerts on execution time p95 > 1s

2. **Azure App Configuration**
   - Monitor flag resolution latency
   - Alert on failed configuration retrievals

3. **Cosmos DB**
   - Monitor event write latency
   - Monitor RU consumption for event storage
   - Alert on TTL cleanup failures

4. **Custom Metrics**
   - Track cache hit rates (FeatureFlagService)
   - Track batch operation partial failures
   - Track transit estimate distribution by mode

---

## Testing Strategy

### Unit Tests (Recommended)
- TelemetryService: Mock AppInsights + EventRepository
- FeatureFlagService: Mock AppConfigClient
- TransitService: Test distance calculations + batch operations
- EventRepository: Mock Cosmos Container

### Integration Tests
- Test full telemetry flow (AI + CosmosDB)
- Test feature flag resolution with real App Configuration
- Test event queries with real Cosmos DB data

### Load Tests
- Test EventRepository batch operations with 1000+ events
- Test FeatureFlagService cache under concurrent access
- Test TelemetryService fire-and-forget under high load

---

## Troubleshooting

### TelemetryService Not Recording Events
- Check Application Insights connection string
- Verify Cosmos DB credentials in EventRepository
- Check network connectivity to both services
- Review console logs for error details

### Feature Flags Always Return False
- Verify AppConfigClient credentials
- Check flag key naming: `city.{cityId}.flagName`
- Verify flag exists in Azure App Configuration
- Check cache expiration (5 minutes)

### Transit Estimates Seem Wrong
- Verify coordinates are in correct format (decimal degrees)
- Check transit mode speed estimates
- Confirm Haversine calculation with known distances
- Remember: Fallback is distance-based, not route-based

### Cosmos DB Event Queries Slow
- Check partition key usage in queries
- Verify indexes are created for filter fields
- Monitor RU consumption per query
- Consider batch operations for high volume

---

## Next Steps

1. Create unit test suites for all services
2. Set up DI container registrations
3. Integrate TelemetryService into all Function App endpoints
4. Configure Azure App Configuration with initial flags
5. Set up Cosmos DB monitoring and alerts
6. Deploy to dev environment for testing
7. Configure production connections strings
8. Set up monitoring dashboards

---

## Support & Questions

All implementations follow established patterns from:
- `SearchService` (search/search-service.ts)
- `CityConfigService` (control-plane/city-config-service.ts)
- `SessionRepository` (infrastructure/cosmos/repositories/session-repository.ts)

For questions about patterns or integration, refer to these implementations as examples.
