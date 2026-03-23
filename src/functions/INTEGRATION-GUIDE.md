# Integration Guide for Function App Endpoints

## Quick Start

### 1. Environment Setup

Create `.env` or configure in Azure Function App settings:

```bash
ENVIRONMENT=development
COSMOS_CONNECTION_STRING=AccountEndpoint=https://....documents.azure.com:443/;AccountKey=...;
COSMOS_DATABASE_ID=swim-lessons-db
APP_CONFIG_ENDPOINT=https://your-app-config.azureconfig.io
KEY_VAULT_NAME=your-keyvault-name
```

### 2. Local Testing

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start Functions locally
func start

# Functions available at:
# POST http://localhost:7071/api/search
# GET  http://localhost:7071/api/sessions/{sessionId}
# GET  http://localhost:7071/api/cities
```

### 3. Test API Calls

#### Search for Sessions
```bash
curl -X POST http://localhost:7071/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "cityId": "nyc",
    "filters": {
      "startDateMin": "2024-03-23T00:00:00Z",
      "startDateMax": "2024-04-23T00:00:00Z"
    },
    "pagination": { "skip": 0, "take": 10 }
  }'
```

#### Get Session Details
```bash
curl "http://localhost:7071/api/sessions/session-123?cityId=nyc"
```

#### List Cities
```bash
curl "http://localhost:7071/api/cities"
```

---

## Integration Points

### 1. From Frontend Application

```typescript
// Example: React/TypeScript frontend
import { SearchRequest, SearchResponse } from '@core/contracts/api-contracts';

async function searchSessions(request: SearchRequest) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });

  return response.json() as Promise<ApiResponse<SearchResponse>>;
}

// Usage
const results = await searchSessions({
  cityId: 'nyc',
  filters: {
    childAge: 24,
    daysOfWeek: [1, 3, 5]
  },
  pagination: { skip: 0, take: 20 }
});

if (results.success) {
  console.log(`Found ${results.data.results.length} sessions`);
} else {
  console.error(`Error: ${results.error?.message}`);
}
```

### 2. From Node.js Backend

```typescript
// Example: BFF (Backend-for-Frontend) middleware
import fetch from 'node-fetch';

async function getSearchResults(request: SearchRequest) {
  const functionUrl = process.env.FUNCTION_APP_URL || 'https://...';

  const response = await fetch(`${functionUrl}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    timeout: 30000
  });

  if (!response.ok) {
    throw new Error(`Function error: ${response.status}`);
  }

  return response.json();
}
```

### 3. Testing Integration

```typescript
// Example: Unit tests with mocked dependencies
import { test, expect, beforeAll, afterAll } from 'vitest';
import {
  getContainerForTesting,
  resetDependencies
} from '../dependency-injection';

test('search endpoint returns results', async () => {
  // Get actual DI container
  const container = getContainerForTesting();

  if (!container) {
    // Initialize if needed
    const { getDependencies } = await import('../dependency-injection');
    await getDependencies();
  }

  // Verify services are available
  expect(container?.searchService).toBeDefined();
});

afterAll(async () => {
  await resetDependencies();
});
```

---

## Common Patterns

### Pattern 1: Searching with User Location

```typescript
const request: SearchRequest = {
  cityId: 'nyc',
  filters: {
    startDateMin: new Date().toISOString(),
    startDateMax: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
    daysOfWeek: [1, 2, 3, 4, 5], // Weekdays
    timeWindow: {
      earliest: '09:00',
      latest: '17:00'
    },
    maxTravelMinutes: 30, // Only within 30-minute commute
    childAge: 24 // 2 years old
  },
  sort: {
    field: 'distance',
    direction: 'asc'
  },
  pagination: {
    skip: 0,
    take: 20
  },
  userContext: {
    sessionId: 'user-123-session-456',
    origin: {
      latitude: 40.7128,
      longitude: -74.0060
    }
  }
};

const response = await fetch('/api/search', {
  method: 'POST',
  body: JSON.stringify(request)
});
```

### Pattern 2: Load More Results (Pagination)

```typescript
let skip = 0;
const pageSize = 20;

async function loadMore() {
  const request: SearchRequest = {
    cityId: 'nyc',
    filters: { /* ... */ },
    pagination: { skip, take: pageSize }
  };

  const response = await searchSessions(request);
  skip += pageSize;

  return response.data.results;
}

// Usage
let allResults = [];
while (true) {
  const batch = await loadMore();
  allResults.push(...batch);

  const { pagination } = response.data;
  if (!pagination.hasMore) break;
}
```

### Pattern 3: Get Session and Show Details

```typescript
async function viewSessionDetails(sessionId: string, cityId: string) {
  const response = await fetch(
    `/api/sessions/${sessionId}?cityId=${cityId}&origin=${JSON.stringify({
      latitude: userLocation.lat,
      longitude: userLocation.lng
    })}`
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('Session not found:', data.error);
    return null;
  }

  const { session, provider, location, program, relatedSessions } = data.data;

  // Display session details UI
  renderSessionCard({
    title: program.name,
    provider: provider.name,
    location: location.name,
    address: location.address,
    startDate: session.startDate,
    travelTime: data.data.travelTime?.minutes,
    relatedSessions: relatedSessions
  });
}
```

### Pattern 4: Build Dynamic City Selector

```typescript
async function initializeCitySelector() {
  // Get all active cities
  const response = await fetch('/api/cities');
  const data = await response.json();

  if (!response.ok) {
    console.error('Failed to load cities');
    return;
  }

  const cities = data.data.cities;

  // Build dropdown
  const select = document.getElementById('city-select');
  for (const city of cities) {
    const option = document.createElement('option');
    option.value = city.cityId;
    option.textContent = `${city.displayName} (${city.availableSessionCount} sessions)`;
    select.appendChild(option);
  }
}
```

---

## Error Handling Patterns

### Pattern 1: Handle All Error Types

```typescript
async function handleSearchError(response: ApiResponse<SearchResponse>) {
  if (response.success) {
    return response.data;
  }

  const error = response.error;

  switch (error.code) {
    case 'VALIDATION_ERROR':
      // Show form validation errors
      console.error('Invalid search criteria:', error.details);
      showValidationUI(error.details);
      break;

    case 'CITY_NOT_FOUND':
      // Redirect to city selector
      console.error('City not found');
      showCitySelector();
      break;

    case 'CITY_INACTIVE':
      // Explain why city is unavailable
      console.error('City is currently unavailable');
      showUnavailableMessage('City is temporarily unavailable');
      break;

    case 'SESSION_NOT_FOUND':
      // Session may have been deleted
      console.error('Session no longer available');
      goBack();
      break;

    case 'INTERNAL_SERVER_ERROR':
      // Show generic error
      console.error('Server error, please try again');
      showErrorMessage('Something went wrong. Please try again later.');
      break;

    default:
      console.error('Unknown error:', error);
  }
}
```

### Pattern 2: Retry with Backoff

```typescript
async function searchWithRetry(
  request: SearchRequest,
  maxRetries = 3
): Promise<ApiResponse<SearchResponse>> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        body: JSON.stringify(request)
      });

      const data = await response.json();

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        return data;
      }

      // Retry on server errors (5xx)
      if (response.status >= 500) {
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      return data;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}
```

---

## Performance Optimization

### 1. Request Caching

```typescript
// Cache search results for 5 minutes
const searchCache = new Map<string, CacheEntry>();

async function searchWithCache(
  request: SearchRequest
): Promise<ApiResponse<SearchResponse>> {
  const cacheKey = JSON.stringify(request);
  const cached = searchCache.get(cacheKey);

  // Return cached if fresh
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.data;
  }

  // Fetch fresh data
  const response = await fetch('/api/search', {
    method: 'POST',
    body: JSON.stringify(request)
  });

  const data = await response.json();

  // Cache result
  searchCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });

  return data;
}
```

### 2. Lazy Load Cities

```typescript
// Load cities only when needed, cache result
let citiesCache: CityListItem[] | null = null;

async function getCities(): Promise<CityListItem[]> {
  if (citiesCache) {
    return citiesCache;
  }

  const response = await fetch('/api/cities');
  const data = await response.json();

  if (response.ok) {
    citiesCache = data.data.cities;
    return citiesCache;
  }

  throw new Error('Failed to load cities');
}
```

### 3. Batch Session Details Requests

```typescript
// Load multiple session details in parallel
async function loadSessionDetails(sessionIds: string[], cityId: string) {
  const requests = sessionIds.map(id =>
    fetch(`/api/sessions/${id}?cityId=${cityId}`).then(r => r.json())
  );

  const responses = await Promise.all(requests);
  return responses
    .filter(r => r.success)
    .map(r => r.data);
}
```

---

## Monitoring and Observability

### 1. Log Request IDs

```typescript
// Capture request ID from response metadata
async function trackSearch(request: SearchRequest) {
  const response = await fetch('/api/search', {
    method: 'POST',
    body: JSON.stringify(request)
  });

  const data = await response.json();
  const requestId = data.metadata?.requestId;

  // Send to analytics
  analytics.trackEvent('SearchCompleted', {
    requestId,
    executionTime: data.metadata?.executionTimeMs,
    resultCount: data.data?.results?.length,
    success: data.success
  });

  return data;
}
```

### 2. Monitor Performance

```typescript
// Track function execution times
async function monitorFunctionPerformance() {
  const startTime = performance.now();

  const response = await fetch('/api/search', {
    method: 'POST',
    body: JSON.stringify(request)
  });

  const data = await response.json();
  const roundTripTime = performance.now() - startTime;
  const serverTime = data.metadata?.executionTimeMs;
  const networkTime = roundTripTime - serverTime;

  console.log({
    roundTripTime,
    serverTime,
    networkTime,
    resultCount: data.data?.results?.length
  });
}
```

---

## Deployment Considerations

### 1. Azure Function App Settings

```json
{
  "COSMOS_CONNECTION_STRING": "AccountEndpoint=...;AccountKey=...",
  "COSMOS_DATABASE_ID": "swim-lessons-db",
  "APP_CONFIG_ENDPOINT": "https://...",
  "KEY_VAULT_NAME": "...",
  "ENVIRONMENT": "production",
  "APPLICATIONINSIGHTS_CONNECTION_STRING": "InstrumentationKey=..."
}
```

### 2. Add Authentication

```typescript
// Example: Add API Key validation
async function validateApiKey(req: HttpRequest): Promise<boolean> {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return false;

  // Validate against stored keys (in Key Vault)
  const validKeys = await getValidApiKeys();
  return validKeys.includes(apiKey);
}

// In search endpoint:
if (!await validateApiKey(req)) {
  return { status: 401, body: 'Unauthorized' };
}
```

### 3. CORS Configuration

Add to Azure Function App settings or middleware:
```json
{
  "CORS": {
    "allowedOrigins": [
      "https://yourdomain.com",
      "https://app.yourdomain.com"
    ]
  }
}
```

---

## Troubleshooting

### Issue: "CosmosDBClient not initialized"

**Cause:** getDependencies() not called before using services

**Solution:** Ensure getDependencies() is called and awaited:
```typescript
const { searchService } = await getDependencies();
```

### Issue: "Required environment variable missing"

**Cause:** Environment variable not set

**Solution:** Add to `.env` or Azure Function App settings

### Issue: "Session not found" for valid sessionId

**Cause:** sessionId is scoped to a city (partition key)

**Solution:** Include cityId in query parameters:
```
GET /api/sessions/{sessionId}?cityId={cityId}
```

### Issue: Slow search responses

**Cause:** Large result set, missing pagination

**Solution:** Add pagination to limit results:
```json
{
  "pagination": { "skip": 0, "take": 20 }
}
```

---

## Additional Resources

- **API Contracts:** `/src/core/contracts/api-contracts.ts`
- **Service Interfaces:** `/src/core/contracts/services.ts`
- **Repository Interfaces:** `/src/core/contracts/repositories.ts`
- **Error Types:** `/src/core/errors/app-errors.ts`
- **Function Documentation:** `/src/functions/README.md`

