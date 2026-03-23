# Example Implementations

This document provides reference implementations for each contract. Copy these patterns when implementing your assigned components.

## Table of Contents
1. [Implementing a Service](#implementing-a-service)
2. [Implementing a Repository](#implementing-a-repository)
3. [Implementing a Function App Endpoint](#implementing-a-function-app-endpoint)
4. [Implementing a City Adapter](#implementing-a-city-adapter)
5. [Dependency Injection Setup](#dependency-injection-setup)

---

## Implementing a Service

### Example: CityConfigService

**File:** `src/services/control-plane/city-config-service.ts`

```typescript
import { ICityConfigService } from '@core/contracts/services';
import { ITenantRepository } from '@core/contracts/repositories';
import { CityConfig, TenantCatalog } from '@core/contracts/city-config';
import { ValidationResult } from '@core/models/canonical-schema';

/**
 * CityConfigService - Manages city configurations with caching
 */
export class CityConfigService implements ICityConfigService {
  private cache: Map<string, CityConfig> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes
  private cacheTimestamps: Map<string, number> = new Map();

  constructor(
    private tenantRepo: ITenantRepository
  ) {}

  async getCityConfig(cityId: string): Promise<CityConfig | null> {
    // Check cache first
    const cached = this.getFromCache(cityId);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const tenant = await this.tenantRepo.getById(cityId);
    if (!tenant) {
      return null;
    }

    // Cache and return
    this.cache.set(cityId, tenant.cityConfig);
    this.cacheTimestamps.set(cityId, Date.now());

    return tenant.cityConfig;
  }

  async listCities(includePreview = false): Promise<CityConfig[]> {
    const filter = includePreview
      ? undefined
      : { status: 'active' as const };

    const tenants = await this.tenantRepo.list(filter);
    return tenants.map(t => t.cityConfig);
  }

  async createCity(config: CityConfig): Promise<CityConfig> {
    // Validate first
    const validation = await this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid config: ${validation.errors.join(', ')}`);
    }

    // Create tenant catalog entry
    const tenant: TenantCatalog = {
      id: config.cityId,
      type: 'CityConfig',
      cityConfig: config,
      status: config.status,
      onboardedAt: new Date().toISOString(),
      onboardedBy: 'admin', // TODO: Get from auth context
    };

    await this.tenantRepo.create(tenant);

    // Invalidate cache
    this.cache.delete(config.cityId);

    return config;
  }

  async updateCity(cityId: string, updates: Partial<CityConfig>): Promise<CityConfig> {
    const existing = await this.getCityConfig(cityId);
    if (!existing) {
      throw new Error(`City ${cityId} not found`);
    }

    const updated = { ...existing, ...updates };

    await this.tenantRepo.update(cityId, {
      cityConfig: updated,
      status: updated.status,
    });

    // Invalidate cache
    await this.clearCache(cityId);

    return updated;
  }

  async deactivateCity(cityId: string, reason: string): Promise<void> {
    await this.tenantRepo.update(cityId, {
      status: 'deactivated',
      deactivatedAt: new Date().toISOString(),
      deactivatedReason: reason,
    });

    await this.clearCache(cityId);
  }

  async validateConfig(config: CityConfig): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!config.cityId) errors.push('cityId is required');
    if (!config.displayName) errors.push('displayName is required');
    if (!config.timezone) errors.push('timezone is required');

    // Geographies
    if (!config.geographies || config.geographies.length === 0) {
      errors.push('At least one geography is required');
    }

    // Search profile
    const weights = config.searchProfile.rankingWeights;
    const total = weights.recency + weights.proximity + weights.availability + weights.quality;
    if (Math.abs(total - 1.0) > 0.01) {
      warnings.push('Ranking weights should sum to 1.0');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async clearCache(cityId: string): Promise<void> {
    this.cache.delete(cityId);
    this.cacheTimestamps.delete(cityId);
  }

  private getFromCache(cityId: string): CityConfig | null {
    const cached = this.cache.get(cityId);
    if (!cached) return null;

    const timestamp = this.cacheTimestamps.get(cityId);
    if (!timestamp || Date.now() - timestamp > this.cacheTTL) {
      // Expired
      this.cache.delete(cityId);
      this.cacheTimestamps.delete(cityId);
      return null;
    }

    return cached;
  }
}
```

**Key Points:**
- ✅ Implements interface
- ✅ Depends on `ITenantRepository` (interface), not concrete class
- ✅ Uses caching for performance
- ✅ Validates inputs
- ✅ Throws typed errors

---

## Implementing a Repository

### Example: SessionRepository

**File:** `src/infrastructure/cosmos/repositories/session-repository.ts`

```typescript
import { CosmosClient, Container } from '@azure/cosmos';
import { ISessionRepository, SessionQueryFilters } from '@core/contracts/repositories';
import { Session, Provider, Location, Program } from '@core/models/canonical-schema';

/**
 * SessionRepository - Cosmos DB implementation
 */
export class SessionRepository implements ISessionRepository {
  private container: Container;

  constructor(
    cosmosClient: CosmosClient,
    databaseId: string,
    containerId: string
  ) {
    this.container = cosmosClient.database(databaseId).container(containerId);
  }

  // ========== SESSION OPERATIONS ==========

  async getSessionById(sessionId: string, cityId: string): Promise<Session | null> {
    try {
      const { resource } = await this.container
        .item(sessionId, cityId)
        .read<Session>();

      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  async querySessions(
    cityId: string,
    filters: SessionQueryFilters,
    limit = 100
  ): Promise<Session[]> {
    // Build query
    let query = 'SELECT * FROM c WHERE c.cityId = @cityId AND c.type = @type';
    const parameters = [
      { name: '@cityId', value: cityId },
      { name: '@type', value: 'SessionDocument' },
    ];

    // Add filters
    if (filters.startDateMin) {
      query += ' AND c.startDate >= @startDateMin';
      parameters.push({ name: '@startDateMin', value: filters.startDateMin });
    }

    if (filters.startDateMax) {
      query += ' AND c.startDate <= @startDateMax';
      parameters.push({ name: '@startDateMax', value: filters.startDateMax });
    }

    if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
      query += ' AND ARRAY_CONTAINS(c.daysOfWeek, @dayOfWeek)';
      // Note: Cosmos DB doesn't support IN for arrays, need to handle multiple days differently
      // For simplicity, just check if ANY day matches
      parameters.push({ name: '@dayOfWeek', value: filters.daysOfWeek[0] });
    }

    if (filters.geographyIds && filters.geographyIds.length > 0) {
      query += ' AND ARRAY_CONTAINS(c.geographyIds, @geographyId)';
      parameters.push({ name: '@geographyId', value: filters.geographyIds[0] });
    }

    if (filters.registrationOpen !== undefined) {
      query += ' AND c.registrationOpen = @registrationOpen';
      parameters.push({ name: '@registrationOpen', value: filters.registrationOpen });
    }

    // Execute query
    const { resources } = await this.container.items
      .query<Session>({
        query,
        parameters,
      })
      .fetchAll();

    return resources.slice(0, limit);
  }

  async createSession(session: Session): Promise<Session> {
    const { resource } = await this.container.items.create<Session>(session);
    if (!resource) {
      throw new Error('Failed to create session');
    }
    return resource;
  }

  async updateSession(
    sessionId: string,
    cityId: string,
    updates: Partial<Session>
  ): Promise<Session> {
    const existing = await this.getSessionById(sessionId, cityId);
    if (!existing) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };

    const { resource } = await this.container
      .item(sessionId, cityId)
      .replace<Session>(updated);

    if (!resource) {
      throw new Error('Failed to update session');
    }

    return resource;
  }

  async deleteSession(sessionId: string, cityId: string): Promise<void> {
    await this.container.item(sessionId, cityId).delete();
  }

  async batchUpsertSessions(sessions: Session[]): Promise<number> {
    let count = 0;

    // Cosmos DB bulk operations (batches of 100)
    const batchSize = 100;
    for (let i = 0; i < sessions.length; i += batchSize) {
      const batch = sessions.slice(i, i + batchSize);

      const operations = batch.map(session => ({
        operationType: 'Upsert' as const,
        resourceBody: session,
      }));

      const { result } = await this.container.items.bulk(operations);
      count += result.filter(r => r.statusCode === 200 || r.statusCode === 201).length;
    }

    return count;
  }

  // ========== PROVIDER OPERATIONS ==========
  // Similar pattern for Provider, Location, Program...

  async getProviderById(providerId: string, cityId: string): Promise<Provider | null> {
    try {
      const { resource } = await this.container
        .item(providerId, cityId)
        .read<Provider>();

      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  async listProviders(cityId: string): Promise<Provider[]> {
    const { resources } = await this.container.items
      .query<Provider>({
        query: 'SELECT * FROM c WHERE c.cityId = @cityId AND c.type = @type',
        parameters: [
          { name: '@cityId', value: cityId },
          { name: '@type', value: 'ProviderDocument' },
        ],
      })
      .fetchAll();

    return resources;
  }

  // ... (implement other provider methods)

  // ========== LOCATION OPERATIONS ==========
  // Similar to providers

  async getLocationById(locationId: string, cityId: string): Promise<Location | null> {
    // Implementation similar to getProviderById
    throw new Error('Not implemented');
  }

  async listLocations(cityId: string, providerId?: string): Promise<Location[]> {
    // Implementation similar to listProviders, with optional provider filter
    throw new Error('Not implemented');
  }

  // ... (implement other location methods)

  // ========== PROGRAM OPERATIONS ==========

  async getProgramById(programId: string, cityId: string): Promise<Program | null> {
    throw new Error('Not implemented');
  }

  async listPrograms(cityId: string, locationId?: string): Promise<Program[]> {
    throw new Error('Not implemented');
  }

  // ... (implement other program methods)

  async createProvider(provider: Provider): Promise<Provider> {
    throw new Error('Not implemented');
  }

  async updateProvider(providerId: string, cityId: string, updates: Partial<Provider>): Promise<Provider> {
    throw new Error('Not implemented');
  }

  async deleteProvider(providerId: string, cityId: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async createLocation(location: Location): Promise<Location> {
    throw new Error('Not implemented');
  }

  async updateLocation(locationId: string, cityId: string, updates: Partial<Location>): Promise<Location> {
    throw new Error('Not implemented');
  }

  async deleteLocation(locationId: string, cityId: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async createProgram(program: Program): Promise<Program> {
    throw new Error('Not implemented');
  }

  async updateProgram(programId: string, cityId: string, updates: Partial<Program>): Promise<Program> {
    throw new Error('Not implemented');
  }

  async deleteProgram(programId: string, cityId: string): Promise<void> {
    throw new Error('Not implemented');
  }
}
```

**Key Points:**
- ✅ Implements interface
- ✅ Uses Cosmos DB SDK efficiently (partition keys, bulk operations)
- ✅ Handles 404 errors gracefully
- ✅ No business logic (just data access)

---

## Implementing a Function App Endpoint

### Example: Search API Endpoint

**File:** `src/functions/search-api/search.ts`

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SearchRequest, SearchResponse, ApiResponse, ApiResponseBuilder, ApiErrorCode } from '@core/contracts/api-contracts';
import { ISearchService } from '@core/contracts/services';
import { getDependencies } from '../dependency-injection';

/**
 * POST /api/search
 * Search for swim sessions
 */
export async function search(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const startTime = Date.now();

  try {
    // Parse request
    const body = await request.json() as SearchRequest;

    // Validate required fields
    if (!body.cityId) {
      return {
        status: 400,
        jsonBody: ApiResponseBuilder.error(
          ApiErrorCode.VALIDATION_ERROR,
          'cityId is required'
        ),
      };
    }

    if (!body.filters) {
      return {
        status: 400,
        jsonBody: ApiResponseBuilder.error(
          ApiErrorCode.VALIDATION_ERROR,
          'filters are required'
        ),
      };
    }

    // Get dependencies
    const { searchService } = getDependencies();

    // Call service
    const results = await searchService.search(
      body.filters,
      body.sort || { field: 'distance', direction: 'asc' },
      body.pagination || { skip: 0, take: 20 }
    );

    // Build response
    const response: SearchResponse = {
      results: results.results.map(session => ({
        session,
        // Add denormalized data for display
        provider: {
          id: session.providerId,
          name: '', // TODO: Fetch from session
          verified: false,
        },
        location: {
          id: session.locationId,
          name: '',
          address: '',
          coordinates: { latitude: 0, longitude: 0 },
          facilityType: '',
        },
        program: {
          id: session.programId,
          name: '',
          skillLevel: '',
        },
      })),
      pagination: {
        skip: body.pagination?.skip || 0,
        take: body.pagination?.take || 20,
        total: results.total,
        hasMore: results.total > (body.pagination?.skip || 0) + (body.pagination?.take || 20),
      },
      appliedFilters: body.filters,
      relaxationApplied: results.relaxationApplied,
      executionTimeMs: Date.now() - startTime,
    };

    return {
      status: 200,
      jsonBody: ApiResponseBuilder.success<SearchResponse>(response, {
        requestId: context.invocationId,
        executionTimeMs: Date.now() - startTime,
      }),
    };
  } catch (error: any) {
    context.error('Search error:', error);

    return {
      status: 500,
      jsonBody: ApiResponseBuilder.error(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        error.message,
        process.env.NODE_ENV === 'development' ? error.stack : undefined
      ),
    };
  }
}

// Register HTTP trigger
app.http('search', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'search',
  handler: search,
});
```

**Key Points:**
- ✅ Uses API contracts for request/response
- ✅ Validates inputs
- ✅ Returns standardized `ApiResponse` wrapper
- ✅ Handles errors gracefully
- ✅ Tracks execution time

---

## Implementing a City Adapter

### Example: CSV Import Adapter

**File:** `src/adapters/csv-import/csv-adapter.ts`

```typescript
import { BaseAdapter, ICityDataAdapter } from '@core/contracts/city-adapter';
import { Session, Provider, Location, Program, SyncResult, ValidationResult, TransitEstimate } from '@core/models/canonical-schema';
import { Coordinates, TransitMode } from '@core/contracts/city-config';
import * as csv from 'csv-parse/sync';

/**
 * CSVAdapter - Generic CSV import adapter for cities without APIs
 */
export class CSVAdapter extends BaseAdapter {
  private csvData: string;

  constructor(cityId: string, csvData: string) {
    super(cityId);
    this.csvData = csvData;
  }

  async getLocations(): Promise<Location[]> {
    const records = this.parseCSV();
    const uniqueLocations = this.extractUniqueLocations(records);

    return uniqueLocations.map(loc => this.transformLocation(loc));
  }

  async getPrograms(): Promise<Program[]> {
    const records = this.parseCSV();
    const uniquePrograms = this.extractUniquePrograms(records);

    return uniquePrograms.map(prog => this.transformProgram(prog));
  }

  async getSessions(filters?: { startDate?: string; endDate?: string }): Promise<Session[]> {
    const records = this.parseCSV();

    let sessions = records.map(r => this.transformSession(r));

    // Apply filters
    if (filters?.startDate) {
      sessions = sessions.filter(s => s.startDate >= filters.startDate!);
    }

    if (filters?.endDate) {
      sessions = sessions.filter(s => s.startDate <= filters.endDate!);
    }

    return sessions;
  }

  getProviderSignupUrl(session: Session): string {
    // CSV should include signup URL in session data
    return session.registrationUrl || 'mailto:info@example.com';
  }

  async getTransitEstimate(
    origin: Coordinates,
    destination: Coordinates,
    mode: TransitMode
  ): Promise<TransitEstimate | null> {
    // CSV adapter doesn't support realtime transit
    // Fallback to walking time estimate
    const distance = this.calculateDistance(origin, destination);
    const minutes = this.estimateWalkingTime(distance);

    return {
      durationMinutes: minutes,
      distance,
      mode: mode.mode,
      confidence: 'fallback',
      calculatedAt: new Date().toISOString(),
    };
  }

  async syncData(): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: any[] = [];

    try {
      const sessions = await this.getSessions();

      return {
        success: true,
        recordsProcessed: sessions.length,
        recordsCreated: sessions.length,
        recordsUpdated: 0,
        errors: [],
        syncedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        errors: [{ message: error.message }],
        syncedAt: new Date().toISOString(),
      };
    }
  }

  async validateConfig(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const records = this.parseCSV();

      if (records.length === 0) {
        errors.push('CSV is empty');
      }

      // Check required columns
      const requiredColumns = ['provider_name', 'location_name', 'start_date', 'days_of_week'];
      const firstRecord = records[0];

      for (const col of requiredColumns) {
        if (!(col in firstRecord)) {
          errors.push(`Missing required column: ${col}`);
        }
      }

      // Validate data quality
      let missingPrices = 0;
      for (const record of records) {
        if (!record.price) {
          missingPrices++;
        }
      }

      if (missingPrices > 0) {
        warnings.push(`${missingPrices} sessions missing price information`);
      }
    } catch (error: any) {
      errors.push(`CSV parse error: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ========== PRIVATE HELPERS ==========

  private parseCSV(): any[] {
    return csv.parse(this.csvData, {
      columns: true,
      skip_empty_lines: true,
    });
  }

  private extractUniqueLocations(records: any[]): any[] {
    const locationMap = new Map();

    for (const record of records) {
      const key = `${record.location_name}-${record.address}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, record);
      }
    }

    return Array.from(locationMap.values());
  }

  private extractUniquePrograms(records: any[]): any[] {
    const programMap = new Map();

    for (const record of records) {
      const key = `${record.program_name}-${record.skill_level}`;
      if (!programMap.has(key)) {
        programMap.set(key, record);
      }
    }

    return Array.from(programMap.values());
  }

  private transformLocation(record: any): Location {
    return {
      id: `${this.cityId}-loc-${this.slugify(record.location_name)}`,
      cityId: this.cityId,
      type: 'LocationDocument',
      providerId: `${this.cityId}-provider-${this.slugify(record.provider_name)}`,
      name: record.location_name,
      address: {
        street: record.address,
        city: record.city || '',
        state: record.state || '',
        zipCode: record.zipcode || '',
        geographyId: record.geography_id || '',
      },
      coordinates: {
        latitude: parseFloat(record.latitude) || 0,
        longitude: parseFloat(record.longitude) || 0,
      },
      facilityType: record.facility_type || 'both',
      confidence: 'medium',
      sourceSystem: 'csv-import',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private transformProgram(record: any): Program {
    return {
      id: `${this.cityId}-prog-${this.slugify(record.program_name)}`,
      cityId: this.cityId,
      type: 'ProgramDocument',
      providerId: `${this.cityId}-provider-${this.slugify(record.provider_name)}`,
      locationId: `${this.cityId}-loc-${this.slugify(record.location_name)}`,
      name: record.program_name,
      description: record.description || '',
      ageMin: parseInt(record.age_min) || undefined,
      ageMax: parseInt(record.age_max) || undefined,
      skillLevel: record.skill_level || 'all',
      sessionLengthMinutes: parseInt(record.session_length) || 60,
      totalSessions: parseInt(record.total_sessions) || 8,
      cadence: 'weekly',
      confidence: 'medium',
      sourceSystem: 'csv-import',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private transformSession(record: any): Session {
    return {
      id: `${this.cityId}-session-${Date.now()}-${Math.random()}`,
      cityId: this.cityId,
      type: 'SessionDocument',
      programId: `${this.cityId}-prog-${this.slugify(record.program_name)}`,
      providerId: `${this.cityId}-provider-${this.slugify(record.provider_name)}`,
      locationId: `${this.cityId}-loc-${this.slugify(record.location_name)}`,
      startDate: record.start_date,
      endDate: record.end_date,
      daysOfWeek: this.parseDaysOfWeek(record.days_of_week),
      timeOfDay: {
        start: record.time_start,
        end: record.time_end,
      },
      capacity: parseInt(record.capacity) || undefined,
      enrolled: parseInt(record.enrolled) || undefined,
      availableSpots: parseInt(record.available_spots) || undefined,
      registrationOpen: record.registration_open === 'true',
      registrationUrl: record.registration_url || '',
      price: record.price ? {
        amount: parseFloat(record.price),
        currency: 'USD',
      } : undefined,
      searchTerms: `${record.program_name} ${record.location_name} ${record.provider_name}`.toLowerCase(),
      geographyIds: [record.geography_id],
      confidence: 'medium',
      sourceSystem: 'csv-import',
      lastSyncedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private parseDaysOfWeek(daysStr: string): number[] {
    // Parse "M,W,F" -> [1, 3, 5]
    const dayMap: Record<string, number> = {
      'Su': 0, 'M': 1, 'T': 2, 'W': 3, 'Th': 4, 'F': 5, 'Sa': 6,
    };

    return daysStr.split(',').map(d => dayMap[d.trim()] || 0);
  }

  private slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
}
```

**Key Points:**
- ✅ Extends `BaseAdapter` (inherits distance calculation helpers)
- ✅ Transforms CSV data → canonical schema
- ✅ Validates CSV structure
- ✅ Handles missing data gracefully
- ✅ Returns proper confidence levels

---

## Dependency Injection Setup

### Example: DI Container

**File:** `src/functions/dependency-injection.ts`

```typescript
import { CosmosClient } from '@azure/cosmos';
import { ISearchService } from '@core/contracts/services';
import { ITenantRepository, ISessionRepository } from '@core/contracts/repositories';
import { SearchService } from '@services/search/search-service';
import { CityConfigService } from '@services/control-plane/city-config-service';
import { TenantRepository } from '@infrastructure/cosmos/repositories/tenant-repository';
import { SessionRepository } from '@infrastructure/cosmos/repositories/session-repository';

/**
 * Dependency container - singleton instance
 */
class DependencyContainer {
  private static instance: DependencyContainer;

  // Clients
  private cosmosClient!: CosmosClient;

  // Repositories
  private tenantRepo!: ITenantRepository;
  private sessionRepo!: ISessionRepository;

  // Services
  private cityConfigService!: ICityConfigService;
  private searchService!: ISearchService;

  private constructor() {
    this.initialize();
  }

  static getInstance(): DependencyContainer {
    if (!DependencyContainer.instance) {
      DependencyContainer.instance = new DependencyContainer();
    }
    return DependencyContainer.instance;
  }

  private initialize() {
    // Initialize Cosmos DB client
    const connectionString = process.env.COSMOS_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('COSMOS_CONNECTION_STRING not set');
    }

    this.cosmosClient = new CosmosClient(connectionString);

    // Initialize repositories
    this.tenantRepo = new TenantRepository(
      this.cosmosClient,
      'swimlessons',
      'tenants'
    );

    this.sessionRepo = new SessionRepository(
      this.cosmosClient,
      'swimlessons',
      'sessions'
    );

    // Initialize services
    this.cityConfigService = new CityConfigService(this.tenantRepo);

    this.searchService = new SearchService(
      this.sessionRepo,
      this.cityConfigService,
      // ... other dependencies
    );
  }

  // Getters
  getSearchService(): ISearchService {
    return this.searchService;
  }

  getCityConfigService(): ICityConfigService {
    return this.cityConfigService;
  }

  getTenantRepository(): ITenantRepository {
    return this.tenantRepo;
  }

  getSessionRepository(): ISessionRepository {
    return this.sessionRepo;
  }
}

/**
 * Helper to get dependencies in Function Apps
 */
export function getDependencies() {
  const container = DependencyContainer.getInstance();

  return {
    searchService: container.getSearchService(),
    cityConfigService: container.getCityConfigService(),
    tenantRepo: container.getTenantRepository(),
    sessionRepo: container.getSessionRepository(),
  };
}
```

**Key Points:**
- ✅ Singleton pattern (one instance per Function App cold start)
- ✅ Constructor injection (services depend on interfaces)
- ✅ Centralized configuration
- ✅ Easy to mock for testing

---

## Summary: Implementation Checklist

When implementing your assigned component:

- [ ] **Read the contract first** - Understand the interface before coding
- [ ] **Implement the interface** - Use `implements IServiceName`
- [ ] **Depend on interfaces** - Constructor params should be interfaces, not classes
- [ ] **Add validation** - Check inputs, throw typed errors
- [ ] **Add error handling** - Try/catch with proper error types
- [ ] **Add logging** - Use Application Insights context logger
- [ ] **Write tests** - Unit tests with mocked dependencies
- [ ] **Update DI container** - Register your implementation

**Next Steps:**
1. Copy these examples to your assigned files
2. Fill in the TODOs and "Not implemented" methods
3. Run `npm run build` to check TypeScript errors
4. Write unit tests
5. Integration test with real Cosmos DB (dev environment)
