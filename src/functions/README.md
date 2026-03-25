# Azure Functions - Search API Layer

This directory contains all Azure Function HTTP endpoints for the swim lessons discovery platform.

## Project Structure

```
src/functions/
├── search-api/
│   ├── search.ts           # Main search endpoint (POST /api/search)
│   ├── session-details.ts  # Session details endpoint (GET /api/sessions/:sessionId)
│   └── cities.ts           # Cities list endpoint (GET /api/cities)
├── dependency-injection.ts # DI container and service factory
├── index.ts                # Entry point that registers all endpoints
├── package.json            # Functions-specific dependencies
└── README.md               # This file
```

## Endpoints

### POST /api/search
Main search endpoint for finding swim sessions.

**Request:**
```json
{
  "cityId": "nyc",
  "filters": {
    "childAge": 24,
    "startDateMin": "2024-03-23T00:00:00Z",
    "startDateMax": "2024-04-23T00:00:00Z",
    "daysOfWeek": [1, 3, 5],
    "timeWindow": {
      "earliest": "09:00",
      "latest": "17:00"
    },
    "geographyIds": ["manhattan", "brooklyn"],
    "maxTravelMinutes": 30,
    "priceMax": 100,
    "skillLevel": ["beginner"],
    "facilityType": ["indoor"]
  },
  "sort": {
    "field": "startDate",
    "direction": "asc"
  },
  "pagination": {
    "skip": 0,
    "take": 20
  },
  "userContext": {
    "sessionId": "user-session-123",
    "origin": {
      "latitude": 40.7128,
      "longitude": -74.0060
    }
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "session": { ... },
        "provider": { ... },
        "location": { ... },
        "program": { ... },
        "distance": 2.5,
        "travelTime": { ... }
      }
    ],
    "pagination": {
      "skip": 0,
      "take": 20,
      "total": 45,
      "hasMore": true
    },
    "appliedFilters": { ... },
    "relaxationApplied": false,
    "executionTimeMs": 234
  },
  "metadata": {
    "requestId": "...",
    "timestamp": "2024-03-23T12:34:56Z",
    "executionTimeMs": 245,
    "version": "1.0"
  }
}
```

**Error Responses:**
- 400 Bad Request: Invalid request format or validation failure
- 403 Forbidden: City is not available
- 404 Not Found: City not found
- 500 Internal Server Error: Unexpected error

### GET /api/sessions/{sessionId}
Get detailed information about a specific session.

**Query Parameters:**
- `sessionId` (required): Session ID
- `cityId` (required): City ID
- `origin` (optional): User coordinates as JSON `{"latitude": X, "longitude": Y}`

**Example:**
```
GET /api/sessions/session-123?cityId=nyc&origin={"latitude":40.7128,"longitude":-74.0060}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "session": { ... },
    "provider": { ... },
    "location": { ... },
    "program": { ... },
    "relatedSessions": [ ... ],
    "travelTime": {
      "minutes": 15,
      "mode": "transit",
      "distance": 1.5
    }
  },
  "metadata": { ... }
}
```

**Error Responses:**
- 400 Bad Request: Missing or invalid parameters
- 404 Not Found: Session, city, or related entity not found
- 500 Internal Server Error: Unexpected error

### GET /api/cities
List all available cities with session counts.

**Query Parameters:**
- `includePreview` (optional): Include cities in preview status (default: false)

**Example:**
```
GET /api/cities?includePreview=true
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "cities": [
      {
        "cityId": "nyc",
        "displayName": "New York City",
        "status": "active",
        "availableSessionCount": 342,
        "lastUpdated": "2024-03-23T12:00:00Z",
        "defaultCenter": {
          "latitude": 40.7128,
          "longitude": -74.0060
        }
      }
    ]
  },
  "metadata": { ... }
}
```

**Error Responses:**
- 500 Internal Server Error: Unexpected error

## Dependency Injection

The `dependency-injection.ts` file provides a singleton DI container that:
- Initializes Cosmos DB client on first use
- Creates all repositories and services
- Provides lazy initialization for expensive resources
- Allows testing via container reset

### Usage in Functions

```typescript
import { getDependencies } from '../dependency-injection';

const { searchService, cityConfigService } = await getDependencies();
const results = await searchService.search(filters, sort, pagination);
```

## Error Handling

All endpoints follow a consistent error handling pattern:

1. **Validation Errors (400):** Invalid input data
2. **Not Found (404):** Resource doesn't exist
3. **Business Logic Errors (403):** e.g., city is inactive
4. **Server Errors (500):** Unexpected exceptions

All errors return standardized `ApiResponse` format with error details.

## Execution Time Tracking

All endpoints track execution time and include it in the response metadata:
- Request handling time
- Service execution time
- Total roundtrip time

## Environment Variables Required

- `COSMOS_CONNECTION_STRING`: Cosmos DB connection string
- `COSMOS_DATABASE_ID`: Cosmos DB database ID (default: swim-lessons-db)
- `APP_CONFIG_ENDPOINT`: Azure App Configuration endpoint
- `KEY_VAULT_NAME`: Azure Key Vault name
- `APPLICATIONINSIGHTS_CONNECTION_STRING`: (optional) Application Insights connection
- `TRANSIT_ROUTER_GRAPHQL_URL`: (optional) OpenTripPlanner GraphQL endpoint for NYC schedule-based routing
- `TRANSIT_ROUTER_TIMEOUT_MS`: (optional) timeout for transit router requests in milliseconds

## Development

### Local Testing

Use Azure Functions Core Tools:
```bash
func start
```

### Request IDs

Every request gets a unique `requestId` from Azure Functions context. This is:
- Logged with all operations
- Returned in response metadata
- Useful for tracing issues in logs

### Logging

All endpoints use `context.log()` for structured logging:
```typescript
context.log(`[${requestId}] Search completed successfully. Results: ${response.results.length}`);
```

## Performance Considerations

1. **Cosmos DB Optimization:** Queries use indexed paths for efficient filtering
2. **Pagination:** Results are paginated to reduce payload size
3. **Caching:** City configs cached for 5 minutes
4. **Connection Pooling:** Cosmos client uses connection pooling
5. **Lazy Initialization:** Services created on first use

## Security

- All endpoints use `authLevel: 'anonymous'` (unauthenticated)
- Production deployment should add authentication/authorization middleware
- No sensitive data logged
- Stack traces only shown in development environment
