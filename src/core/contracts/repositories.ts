/**
 * Repository Contracts (Data Access Layer)
 *
 * These interfaces abstract Cosmos DB operations.
 * Services depend on these contracts, not concrete implementations.
 * This enables testing with mocks and future database migrations.
 */

import {
  Provider,
  Location,
  Program,
  Session,
  SyncResult,
} from '../models/canonical-schema';
import {
  CityConfig,
  TenantCatalog,
  SearchFilters,
  SortField,
} from './city-config';
import { TelemetryEvent } from './services';

// ============================================================================
// TENANT REPOSITORY
// ============================================================================

/**
 * ITenantRepository - City configuration storage
 *
 * Container: "tenants"
 * Partition Key: /id (cityId)
 *
 * Responsibilities:
 * - CRUD operations on city configs
 * - Query cities by status
 *
 * Used by: ICityConfigService, IOnboardingService
 */
export interface ITenantRepository {
  /**
   * Get city configuration by ID
   *
   * @param cityId City identifier
   * @returns Tenant catalog entry or null
   */
  getById(cityId: string): Promise<TenantCatalog | null>;

  /**
   * List all cities
   *
   * @param filter Optional filter criteria
   * @returns Array of tenant catalogs
   */
  list(filter?: TenantFilter): Promise<TenantCatalog[]>;

  /**
   * Create new city configuration
   *
   * @param tenant Tenant catalog entry
   * @returns Created tenant
   */
  create(tenant: TenantCatalog): Promise<TenantCatalog>;

  /**
   * Update city configuration
   *
   * @param cityId City ID
   * @param updates Partial updates
   * @returns Updated tenant
   */
  update(cityId: string, updates: Partial<TenantCatalog>): Promise<TenantCatalog>;

  /**
   * Delete city configuration (use sparingly, prefer deactivation)
   *
   * @param cityId City ID
   */
  delete(cityId: string): Promise<void>;

  /**
   * Check if city exists
   *
   * @param cityId City ID
   * @returns True if exists
   */
  exists(cityId: string): Promise<boolean>;
}

export interface TenantFilter {
  status?: 'active' | 'preview' | 'deactivated';
  stampId?: string;
}

// ============================================================================
// SESSION REPOSITORY
// ============================================================================

/**
 * ISessionRepository - Session storage and querying
 *
 * Container: "sessions"
 * Partition Key: /cityId
 * Documents: Provider, Location, Program, Session (discriminated by "type")
 *
 * Responsibilities:
 * - Query sessions with filters
 * - CRUD operations on all session-related entities
 * - Batch operations for data sync
 *
 * Used by: ISearchService, IDataSyncService, AdminAPI
 */
export interface ISessionRepository {
  // ========== SESSION OPERATIONS ==========

  /**
   * Get session by ID
   *
   * @param sessionId Session ID
   * @param cityId City ID (partition key)
   * @returns Session or null
   */
  getSessionById(sessionId: string, cityId: string): Promise<Session | null>;

  /**
   * Query sessions with filters
   * This is the core search query method
   *
   * @param cityId City ID (partition key)
   * @param filters Search filters
   * @param limit Max results to return
   * @returns Array of sessions
   */
  querySessions(
    cityId: string,
    filters: SessionQueryFilters,
    limit?: number
  ): Promise<Session[]>;

  /**
   * Create session
   *
   * @param session Session to create
   * @returns Created session
   */
  createSession(session: Session): Promise<Session>;

  /**
   * Update session
   *
   * @param sessionId Session ID
   * @param cityId City ID (partition key)
   * @param updates Partial updates
   * @returns Updated session
   */
  updateSession(
    sessionId: string,
    cityId: string,
    updates: Partial<Session>
  ): Promise<Session>;

  /**
   * Delete session
   *
   * @param sessionId Session ID
   * @param cityId City ID (partition key)
   */
  deleteSession(sessionId: string, cityId: string): Promise<void>;

  /**
   * Batch upsert sessions (for data sync)
   * Efficiently handles large syncs
   *
   * @param sessions Sessions to upsert
   * @returns Number of sessions upserted
   */
  batchUpsertSessions(sessions: Session[]): Promise<number>;

  // ========== PROVIDER OPERATIONS ==========

  /**
   * Get provider by ID
   *
   * @param providerId Provider ID
   * @param cityId City ID (partition key)
   * @returns Provider or null
   */
  getProviderById(providerId: string, cityId: string): Promise<Provider | null>;

  /**
   * List providers for a city
   *
   * @param cityId City ID
   * @returns Array of providers
   */
  listProviders(cityId: string): Promise<Provider[]>;

  /**
   * Create provider
   *
   * @param provider Provider to create
   * @returns Created provider
   */
  createProvider(provider: Provider): Promise<Provider>;

  /**
   * Update provider
   *
   * @param providerId Provider ID
   * @param cityId City ID (partition key)
   * @param updates Partial updates
   * @returns Updated provider
   */
  updateProvider(
    providerId: string,
    cityId: string,
    updates: Partial<Provider>
  ): Promise<Provider>;

  /**
   * Delete provider
   *
   * @param providerId Provider ID
   * @param cityId City ID (partition key)
   */
  deleteProvider(providerId: string, cityId: string): Promise<void>;

  // ========== LOCATION OPERATIONS ==========

  /**
   * Get location by ID
   *
   * @param locationId Location ID
   * @param cityId City ID (partition key)
   * @returns Location or null
   */
  getLocationById(locationId: string, cityId: string): Promise<Location | null>;

  /**
   * List locations for a city
   *
   * @param cityId City ID
   * @param providerId Optional provider filter
   * @returns Array of locations
   */
  listLocations(cityId: string, providerId?: string): Promise<Location[]>;

  /**
   * Create location
   *
   * @param location Location to create
   * @returns Created location
   */
  createLocation(location: Location): Promise<Location>;

  /**
   * Update location
   *
   * @param locationId Location ID
   * @param cityId City ID (partition key)
   * @param updates Partial updates
   * @returns Updated location
   */
  updateLocation(
    locationId: string,
    cityId: string,
    updates: Partial<Location>
  ): Promise<Location>;

  /**
   * Delete location
   *
   * @param locationId Location ID
   * @param cityId City ID (partition key)
   */
  deleteLocation(locationId: string, cityId: string): Promise<void>;

  // ========== PROGRAM OPERATIONS ==========

  /**
   * Get program by ID
   *
   * @param programId Program ID
   * @param cityId City ID (partition key)
   * @returns Program or null
   */
  getProgramById(programId: string, cityId: string): Promise<Program | null>;

  /**
   * List programs for a location
   *
   * @param cityId City ID
   * @param locationId Location ID
   * @returns Array of programs
   */
  listPrograms(cityId: string, locationId?: string): Promise<Program[]>;

  /**
   * Create program
   *
   * @param program Program to create
   * @returns Created program
   */
  createProgram(program: Program): Promise<Program>;

  /**
   * Update program
   *
   * @param programId Program ID
   * @param cityId City ID (partition key)
   * @param updates Partial updates
   * @returns Updated program
   */
  updateProgram(
    programId: string,
    cityId: string,
    updates: Partial<Program>
  ): Promise<Program>;

  /**
   * Delete program
   *
   * @param programId Program ID
   * @param cityId City ID (partition key)
   */
  deleteProgram(programId: string, cityId: string): Promise<void>;
}

/**
 * Session query filters (subset of SearchFilters optimized for Cosmos DB)
 */
export interface SessionQueryFilters {
  startDateMin?: string;
  startDateMax?: string;
  daysOfWeek?: number[];
  geographyIds?: string[];
  providerIds?: string[];
  registrationOpen?: boolean;
}

// ============================================================================
// EVENT REPOSITORY
// ============================================================================

/**
 * IEventRepository - Telemetry event storage
 *
 * Container: "events"
 * Partition Key: /cityId
 * TTL: 90 days (auto-delete)
 *
 * Responsibilities:
 * - Store high-value telemetry events for analysis
 * - Query events for dashboards and ML training
 *
 * Used by: ITelemetryService
 */
export interface IEventRepository {
  /**
   * Store telemetry event
   *
   * @param event Event to store
   */
  storeEvent(event: TelemetryEvent): Promise<void>;

  /**
   * Batch store events (for performance)
   *
   * @param events Events to store
   * @returns Number of events stored
   */
  batchStoreEvents(events: TelemetryEvent[]): Promise<number>;

  /**
   * Query events for analysis
   *
   * @param cityId City ID
   * @param filters Event filters
   * @param limit Max results
   * @returns Array of events
   */
  queryEvents(
    cityId: string,
    filters: EventQueryFilters,
    limit?: number
  ): Promise<TelemetryEvent[]>;

  /**
   * Get event counts by type
   * Used for dashboards
   *
   * @param cityId City ID
   * @param startDate Start date (ISO)
   * @param endDate End date (ISO)
   * @returns Map of event name to count
   */
  getEventCounts(
    cityId: string,
    startDate: string,
    endDate: string
  ): Promise<Map<string, number>>;
}

export interface EventQueryFilters {
  eventNames?: string[];
  startDate?: string;
  endDate?: string;
  sessionId?: string;
  userId?: string;
}

// ============================================================================
// BASE REPOSITORY (Common functionality)
// ============================================================================

/**
 * IBaseRepository - Common repository methods
 * All repositories extend this for consistency
 */
export interface IBaseRepository<T> {
  /**
   * Get entity by ID
   */
  getById(id: string, partitionKey: string): Promise<T | null>;

  /**
   * Create entity
   */
  create(entity: T): Promise<T>;

  /**
   * Update entity
   */
  update(id: string, partitionKey: string, updates: Partial<T>): Promise<T>;

  /**
   * Delete entity
   */
  delete(id: string, partitionKey: string): Promise<void>;

  /**
   * Check if entity exists
   */
  exists(id: string, partitionKey: string): Promise<boolean>;
}

// ============================================================================
// TRANSACTION SUPPORT (Future enhancement)
// ============================================================================

/**
 * IUnitOfWork - Transaction boundary for multi-entity operations
 * Not needed for MVP but documents future pattern
 */
export interface IUnitOfWork {
  tenants: ITenantRepository;
  sessions: ISessionRepository;
  events: IEventRepository;

  /**
   * Begin transaction
   */
  begin(): Promise<void>;

  /**
   * Commit transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback transaction
   */
  rollback(): Promise<void>;
}
