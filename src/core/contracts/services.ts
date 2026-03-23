/**
 * Service Layer Contracts
 *
 * These interfaces define how all services interact with each other.
 * Team members can implement these independently and they'll integrate correctly.
 */

import {
  SearchFilters,
  SortField,
  CityConfig,
  Coordinates,
  TransitMode,
} from './city-config';
import {
  Session,
  Provider,
  Location,
  Program,
  SearchResults,
  TransitEstimate,
  SyncResult,
  ValidationResult,
} from '../models/canonical-schema';

// ============================================================================
// SEARCH SERVICE
// ============================================================================

/**
 * ISearchService - Core search logic
 *
 * Responsibilities:
 * - Query sessions from repository
 * - Apply filters (age, schedule, location)
 * - Score and rank results using city-specific weights
 * - Handle no-results fallback (relaxation)
 *
 * Used by: Function Apps (search API endpoint)
 * Uses: ISessionRepository, ICityConfigService, ITransitService
 */
export interface ISearchService {
  /**
   * Search for swim sessions with filters
   *
   * @param filters Search criteria
   * @param sort Sort field and direction
   * @param pagination Skip/take for paging
   * @returns Ranked and paginated search results
   */
  search(
    filters: SearchFilters,
    sort: SortOptions,
    pagination: PaginationOptions
  ): Promise<SearchResults>;

  /**
   * Get a single session by ID
   *
   * @param sessionId Session ID
   * @param cityId City ID (for partition key)
   * @returns Session with denormalized provider/location data
   */
  getSessionById(sessionId: string, cityId: string): Promise<Session | null>;

  /**
   * Score and rank sessions based on city-specific weights
   * Internal method exposed for testing
   *
   * @param sessions Sessions to score
   * @param filters User's search filters
   * @param cityConfig City-specific ranking config
   * @returns Scored sessions sorted by score descending
   */
  scoreAndRank(
    sessions: Session[],
    filters: SearchFilters,
    cityConfig: CityConfig
  ): Promise<ScoredSession[]>;
}

export interface SortOptions {
  field: SortField;
  direction: 'asc' | 'desc';
}

export interface PaginationOptions {
  skip: number;
  take: number;
}

export interface ScoredSession {
  session: Session;
  score: number;
  scoreBreakdown?: {
    recency: number;
    proximity: number;
    availability: number;
    quality: number;
  };
}

// ============================================================================
// CITY CONFIG SERVICE
// ============================================================================

/**
 * ICityConfigService - Manage city configurations (tenant catalog)
 *
 * Responsibilities:
 * - CRUD operations on city configs
 * - Validate city configs
 * - Cache configs for performance
 *
 * Used by: SearchService, OnboardingService, AdminAPI
 * Uses: ITenantRepository, IFeatureFlagService
 */
export interface ICityConfigService {
  /**
   * Get city configuration by ID
   * Returns cached version if available
   *
   * @param cityId City identifier (e.g., "nyc")
   * @returns City configuration or null if not found
   */
  getCityConfig(cityId: string): Promise<CityConfig | null>;

  /**
   * List all active cities
   *
   * @param includePreview Include cities in preview status
   * @returns Array of city configs
   */
  listCities(includePreview?: boolean): Promise<CityConfig[]>;

  /**
   * Create new city configuration
   * Validates config before persisting
   *
   * @param config City configuration
   * @returns Created config with generated IDs
   */
  createCity(config: CityConfig): Promise<CityConfig>;

  /**
   * Update existing city configuration
   *
   * @param cityId City ID to update
   * @param updates Partial config updates
   * @returns Updated config
   */
  updateCity(cityId: string, updates: Partial<CityConfig>): Promise<CityConfig>;

  /**
   * Deactivate a city (soft delete)
   *
   * @param cityId City ID to deactivate
   * @param reason Reason for deactivation
   */
  deactivateCity(cityId: string, reason: string): Promise<void>;

  /**
   * Validate city configuration
   *
   * @param config Config to validate
   * @returns Validation result
   */
  validateConfig(config: CityConfig): Promise<ValidationResult>;

  /**
   * Clear cache for a specific city
   * Call this after updating config
   *
   * @param cityId City ID
   */
  clearCache(cityId: string): Promise<void>;
}

// ============================================================================
// FEATURE FLAG SERVICE
// ============================================================================

/**
 * IFeatureFlagService - Feature flag management via Azure App Configuration
 *
 * Responsibilities:
 * - Check if features are enabled (city-specific or global)
 * - Get feature variants for A/B testing
 * - Cache flags for performance
 *
 * Used by: All services that need runtime configuration
 * Uses: Azure App Configuration SDK
 */
export interface IFeatureFlagService {
  /**
   * Check if a feature is enabled
   * Resolves city-specific overrides
   *
   * @param flagKey Flag key (e.g., "city.{cityId}.transitETA.enabled")
   * @param context Context with cityId for resolution
   * @returns True if enabled
   */
  isEnabled(flagKey: string, context: FeatureFlagContext): Promise<boolean>;

  /**
   * Get feature variant (for A/B testing)
   *
   * @param flagKey Flag key
   * @param context Context with cityId
   * @returns Variant value (e.g., "control", "variant-a")
   */
  getVariant<T = string>(flagKey: string, context: FeatureFlagContext): Promise<T>;

  /**
   * Get all flags for a city
   *
   * @param cityId City ID
   * @returns Map of flag keys to values
   */
  getAllFlags(cityId: string): Promise<Record<string, boolean | string>>;

  /**
   * Set flag value (admin operation)
   *
   * @param flagKey Flag key
   * @param value Flag value
   */
  setFlag(flagKey: string, value: boolean | string): Promise<void>;
}

export interface FeatureFlagContext {
  cityId?: string;
  userId?: string;
  experiments?: Record<string, string>;
}

// ============================================================================
// TELEMETRY SERVICE
// ============================================================================

/**
 * ITelemetryService - Application Insights + Cosmos DB event tracking
 *
 * Responsibilities:
 * - Track user events (searches, clicks, errors)
 * - Send to Application Insights
 * - Persist high-value events to Cosmos DB for analysis
 *
 * Used by: All services and Function Apps
 * Uses: Application Insights SDK, IEventRepository
 */
export interface ITelemetryService {
  /**
   * Track a generic event
   *
   * @param event Event to track
   */
  trackEvent(event: TelemetryEvent): Promise<void>;

  /**
   * Track search started
   *
   * @param event Search event
   */
  trackSearchStarted(event: SearchStartedEvent): Promise<void>;

  /**
   * Track search results returned
   *
   * @param event Results event
   */
  trackSearchResults(event: SearchResultsEvent): Promise<void>;

  /**
   * Track session viewed
   *
   * @param event Session view event
   */
  trackSessionViewed(event: SessionViewedEvent): Promise<void>;

  /**
   * Track signup clicked
   *
   * @param event Signup click event
   */
  trackSignupClicked(event: SignupClickedEvent): Promise<void>;

  /**
   * Track no results
   *
   * @param event No results event
   */
  trackNoResults(event: NoResultsEvent): Promise<void>;

  /**
   * Track error
   *
   * @param error Error event
   */
  trackError(error: ErrorEvent): Promise<void>;

  /**
   * Track custom metric
   *
   * @param metricName Metric name
   * @param value Metric value
   * @param properties Additional properties
   */
  trackMetric(
    metricName: string,
    value: number,
    properties?: Record<string, string>
  ): Promise<void>;
}

// Base event type
export interface TelemetryEvent {
  eventName: string;
  timestamp: string;
  sessionId: string;
  cityId: string;
  userId?: string;
  experiments?: Record<string, string>;
  platform: 'web' | 'ios' | 'android';
}

export interface SearchStartedEvent extends TelemetryEvent {
  eventName: 'SearchStarted';
  hasLocation: boolean;
  filters: SearchFilters;
}

export interface SearchResultsEvent extends TelemetryEvent {
  eventName: 'SearchResultsReturned';
  resultCount: number;
  executionTimeMs: number;
  relaxationApplied: boolean;
  filters: SearchFilters;
}

export interface SessionViewedEvent extends TelemetryEvent {
  eventName: 'SessionViewed';
  sessionId: string;
  position: number;
  distance?: number;
  price?: number;
}

export interface SignupClickedEvent extends TelemetryEvent {
  eventName: 'SignupClicked';
  sessionId: string;
  destinationUrl: string;
  searchToClickDurationMs: number;
  sessionsViewedBefore: number;
}

export interface NoResultsEvent extends TelemetryEvent {
  eventName: 'NoResults';
  filters: SearchFilters;
  relaxationAttempted: boolean;
  relaxationSucceeded: boolean;
  requestedGeographyIds?: string[];
}

export interface ErrorEvent extends TelemetryEvent {
  eventName: 'Error';
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  operation: string;
}

// ============================================================================
// TRANSIT SERVICE
// ============================================================================

/**
 * ITransitService - Calculate travel time estimates
 *
 * Responsibilities:
 * - Calculate transit time using city-specific providers (Google, MTA)
 * - Fallback to distance-based walking estimates
 * - Cache estimates for performance
 *
 * Used by: SearchService
 * Uses: City adapters (for city-specific transit APIs)
 */
export interface ITransitService {
  /**
   * Estimate travel time from origin to destination
   *
   * @param origin User's location
   * @param destination Pool/facility location
   * @param mode Transit mode (subway, bus, walking, etc.)
   * @param cityId City ID (for city-specific routing)
   * @returns Transit estimate or null if unavailable
   */
  estimateTransitTime(
    origin: Coordinates,
    destination: Coordinates,
    mode: TransitMode,
    cityId: string
  ): Promise<TransitEstimate | null>;

  /**
   * Batch estimate for multiple destinations
   * More efficient than individual calls
   *
   * @param origin User's location
   * @param destinations Array of destinations
   * @param mode Transit mode
   * @param cityId City ID
   * @returns Map of destination ID to estimate
   */
  batchEstimate(
    origin: Coordinates,
    destinations: Array<{ id: string; coordinates: Coordinates }>,
    mode: TransitMode,
    cityId: string
  ): Promise<Map<string, TransitEstimate>>;
}

// ============================================================================
// ONBOARDING SERVICE
// ============================================================================

/**
 * IOnboardingService - City onboarding workflow (10-step process)
 *
 * Responsibilities:
 * - Guide admin through city onboarding
 * - Validate adapter configuration
 * - Run initial data sync
 * - Set city to preview/active status
 *
 * Used by: Admin API
 * Uses: ICityConfigService, City Adapters, ISessionRepository
 */
export interface IOnboardingService {
  /**
   * Start onboarding a new city
   *
   * @param request Onboarding request
   * @returns Onboarding session ID
   */
  startOnboarding(request: OnboardingRequest): Promise<OnboardingSession>;

  /**
   * Validate adapter configuration
   * Step 4 of onboarding process
   *
   * @param sessionId Onboarding session ID
   * @returns Validation result
   */
  validateAdapter(sessionId: string): Promise<ValidationResult>;

  /**
   * Run initial data sync
   * Step 6 of onboarding process
   *
   * @param sessionId Onboarding session ID
   * @returns Sync result
   */
  runInitialSync(sessionId: string): Promise<SyncResult>;

  /**
   * Activate city (set to preview or active)
   * Final step of onboarding
   *
   * @param sessionId Onboarding session ID
   * @param status Status to set (preview or active)
   */
  activateCity(sessionId: string, status: 'preview' | 'active'): Promise<void>;

  /**
   * Get onboarding session status
   *
   * @param sessionId Onboarding session ID
   * @returns Current onboarding status
   */
  getOnboardingStatus(sessionId: string): Promise<OnboardingSession>;
}

export interface OnboardingRequest {
  cityName: string;
  timezone: string;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
}

export interface OnboardingSession {
  id: string;
  cityId: string;
  status: OnboardingStatus;
  currentStep: number;
  totalSteps: number;
  errors: string[];
  completedAt?: string;
  createdAt: string;
}

export type OnboardingStatus =
  | 'started'
  | 'adapter-validated'
  | 'initial-sync-complete'
  | 'data-reviewed'
  | 'activated'
  | 'failed';

// ============================================================================
// DATA SYNC SERVICE
// ============================================================================

/**
 * IDataSyncService - Scheduled data synchronization
 *
 * Responsibilities:
 * - Run adapter.syncData() for each active city
 * - Handle sync failures and retries
 * - Send alerts on failures
 *
 * Used by: Timer-triggered Function App (jobs/data-sync.ts)
 * Uses: City Adapters, ISessionRepository, ITelemetryService
 */
export interface IDataSyncService {
  /**
   * Sync data for a specific city
   *
   * @param cityId City ID
   * @returns Sync result
   */
  syncCity(cityId: string): Promise<SyncResult>;

  /**
   * Sync data for all active cities
   *
   * @returns Map of cityId to sync result
   */
  syncAllCities(): Promise<Map<string, SyncResult>>;

  /**
   * Get last sync status for a city
   *
   * @param cityId City ID
   * @returns Last sync result
   */
  getLastSyncStatus(cityId: string): Promise<SyncResult | null>;

  /**
   * Manually trigger sync (admin operation)
   *
   * @param cityId City ID
   * @returns Sync result
   */
  triggerManualSync(cityId: string): Promise<SyncResult>;
}
