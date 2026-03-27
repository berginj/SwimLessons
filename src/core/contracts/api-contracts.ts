/**
 * API Contracts (HTTP Request/Response Types)
 *
 * These types define the contract between frontend and backend.
 * Frontend and backend teams can work independently using these shared types.
 *
 * ALL API endpoints must use these types for type safety.
 */

import {
  SearchFilters,
  SortField,
  Coordinates,
  CityConfig,
  CityStatus,
} from './city-config';
import {
  Session,
  Provider,
  Location,
  Program,
  SyncResult,
  ValidationResult,
} from '../models/canonical-schema';

// ============================================================================
// COMMON API TYPES
// ============================================================================

/**
 * Standard API response wrapper
 * All endpoints return this structure
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: ResponseMetadata;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  stack?: string; // Only in dev environment
}

export interface ResponseMetadata {
  requestId: string;
  timestamp: string;
  executionTimeMs: number;
  version: string;
}

/**
 * Pagination for list endpoints
 */
export interface PaginationRequest {
  skip?: number;
  take?: number;
}

export interface PaginationResponse {
  skip: number;
  take: number;
  total: number;
  hasMore: boolean;
}

// ============================================================================
// SEARCH API (Public)
// ============================================================================

/**
 * POST /api/search
 * Main search endpoint for finding swim sessions
 */
export interface SearchRequest {
  cityId: string;
  filters: SearchFiltersRequest;
  sort?: SortRequest;
  pagination?: PaginationRequest;

  // User context for personalization
  userContext?: {
    sessionId?: string; // Optional request correlation, not required by the current web app
    origin?: Coordinates; // User location (optional, never stored)
  };
}

export interface SearchFiltersRequest {
  childAge?: number; // Months
  startDateMin?: string; // ISO date
  startDateMax?: string;
  daysOfWeek?: number[]; // [0=Sun, 1=Mon, ..., 6=Sat]
  timeWindow?: {
    earliest: string; // "06:00"
    latest: string; // "19:00"
  };
  geographyIds?: string[]; // ["manhattan", "brooklyn"]
  maxTravelMinutes?: number; // Most relevant when an origin is available
  priceMax?: number;
  skillLevel?: ('beginner' | 'intermediate' | 'advanced' | 'all')[];
  facilityType?: ('outdoor' | 'indoor' | 'both')[];
}

export interface SortRequest {
  field: SortField;
  direction: 'asc' | 'desc';
}

export interface SearchResponse {
  results: SessionSearchResult[];
  pagination: PaginationResponse;
  appliedFilters: SearchFiltersRequest;
  relaxationApplied: boolean;
  relaxationMessage?: string;
  executionTimeMs: number;
}

export interface SessionSearchResult {
  // Core session data
  session: Session;

  // Computed fields
  distance?: number; // Miles from user origin
  travelTime?: {
    minutes: number;
    mode: string;
    confidence: 'realtime' | 'estimated' | 'fallback';
  };

  // Denormalized for display
  provider: {
    id: string;
    name: string;
    logoUrl?: string;
    verified: boolean;
  };
  location: {
    id: string;
    name: string;
    address: string;
    coordinates: Coordinates;
    facilityType: string;
  };
  program: {
    id: string;
    name: string;
    description?: string;
    skillLevel: string;
    ageMin?: number;
    ageMax?: number;
  };

  // Search metadata
  searchScore?: number; // For debugging
}

/**
 * GET /api/sessions/:sessionId
 * Get detailed information about a specific session
 */
export interface SessionDetailsRequest {
  sessionId: string;
  cityId: string;
  userOrigin?: Coordinates; // For calculating travel time
}

export interface SessionDetailsResponse {
  session: Session;
  provider: Provider;
  location: Location;
  program: Program;

  // Related sessions (same provider/location)
  relatedSessions?: Session[];

  // Computed
  travelTime?: {
    minutes: number;
    mode: string;
    distance: number;
    confidence: 'realtime' | 'estimated' | 'fallback';
  };
}

/**
 * GET /api/cities
 * List all available cities
 */
export interface ListCitiesRequest {
  includePreview?: boolean;
}

export interface ListCitiesResponse {
  cities: CityListItem[];
}

export interface CityListItem {
  cityId: string;
  displayName: string;
  status: CityStatus;
  availableSessionCount: number;
  lastUpdated: string;
  defaultCenter: Coordinates;
}

// ============================================================================
// ADMIN API (Protected)
// ============================================================================

/**
 * POST /admin/providers
 * Create a new provider
 */
export interface CreateProviderRequest {
  cityId: string;
  name: string;
  providerType: 'public' | 'private' | 'nonprofit' | 'ymca';
  website?: string;
  phone?: string;
  email?: string;
  description?: string;
}

export interface CreateProviderResponse {
  provider: Provider;
}

/**
 * PUT /admin/providers/:providerId
 * Update provider
 */
export interface UpdateProviderRequest {
  name?: string;
  website?: string;
  phone?: string;
  email?: string;
  description?: string;
  verified?: boolean;
}

export interface UpdateProviderResponse {
  provider: Provider;
}

/**
 * POST /admin/sessions/bulk-upload
 * Bulk upload sessions via CSV
 */
export interface BulkUploadRequest {
  cityId: string;
  format: 'csv' | 'json';
  data: string | object; // CSV string or JSON array
  validate?: boolean; // Dry-run mode
}

export interface BulkUploadResponse {
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: BulkUploadError[];
  preview?: Session[]; // If validate=true
}

export interface BulkUploadError {
  row: number;
  field?: string;
  message: string;
  data?: unknown;
}

/**
 * POST /admin/sessions
 * Create individual session
 */
export interface CreateSessionRequest {
  cityId: string;
  programId: string;
  providerId: string;
  locationId: string;
  startDate: string;
  endDate: string;
  daysOfWeek: number[];
  timeOfDay: {
    start: string;
    end: string;
  };
  capacity?: number;
  enrolled?: number;
  registrationUrl: string;
  price?: {
    amount: number;
    currency: 'USD';
  };
}

export interface CreateSessionResponse {
  session: Session;
}

/**
 * PUT /admin/sessions/:sessionId
 * Update session
 */
export interface UpdateSessionRequest {
  startDate?: string;
  endDate?: string;
  daysOfWeek?: number[];
  timeOfDay?: {
    start: string;
    end: string;
  };
  capacity?: number;
  enrolled?: number;
  registrationOpen?: boolean;
  registrationUrl?: string;
  price?: {
    amount: number;
    currency: 'USD';
  };
}

export interface UpdateSessionResponse {
  session: Session;
}

/**
 * POST /admin/cities/onboard
 * Start city onboarding workflow
 */
export interface OnboardCityRequest {
  cityName: string;
  timezone: string;
  geographies: Array<{
    id: string;
    displayName: string;
    type: 'borough' | 'neighborhood' | 'zipcode';
  }>;
  adapterType: string;
  adapterConfig: {
    apiEndpoint?: string;
    apiKey?: string;
    csvData?: string;
  };
  searchProfile?: {
    defaultSort: SortField;
    rankingWeights: {
      recency: number;
      proximity: number;
      availability: number;
      quality: number;
    };
  };
}

export interface OnboardCityResponse {
  onboardingSessionId: string;
  cityId: string;
  status: string;
  nextSteps: string[];
}

/**
 * GET /admin/cities/:cityId/onboarding/:sessionId
 * Get onboarding status
 */
export interface OnboardingStatusRequest {
  cityId: string;
  sessionId: string;
}

export interface OnboardingStatusResponse {
  sessionId: string;
  status: 'started' | 'adapter-validated' | 'initial-sync-complete' | 'activated' | 'failed';
  currentStep: number;
  totalSteps: number;
  errors: string[];
  syncResult?: SyncResult;
  validationResult?: ValidationResult;
  completedAt?: string;
}

/**
 * POST /admin/cities/:cityId/sync
 * Manually trigger data sync
 */
export interface TriggerSyncRequest {
  cityId: string;
}

export interface TriggerSyncResponse {
  syncResult: SyncResult;
}

/**
 * GET /operator/cities/:cityId/stats
 * Get city statistics for dashboard
 */
export interface CityStatsRequest {
  cityId: string;
  startDate?: string;
  endDate?: string;
}

export interface CityStatsResponse {
  cityId: string;
  stats: {
    // Data quality
    totalProviders: number;
    totalLocations: number;
    totalSessions: number;
    activeSessionsCount: number;
    dataConfidence: {
      high: number;
      medium: number;
      low: number;
    };

    // Usage metrics
    dailyActiveUsers: number;
    totalSearches: number;
    totalSignupClicks: number;
    conversionRate: number; // searches -> clicks

    // Search quality
    avgResultsPerSearch: number;
    noResultsRate: number;
    relaxationSuccessRate: number;

    // Performance
    avgSearchLatencyMs: number;
    p95SearchLatencyMs: number;
    errorRate: number;

    // Last sync
    lastSyncAt: string;
    lastSyncStatus: 'success' | 'failed';
    lastSyncRecordsUpdated: number;
  };
}

// ============================================================================
// TELEMETRY API (Internal)
// ============================================================================

/**
 * POST /api/events
 * Track frontend events (called by telemetry client)
 */
export interface TrackEventRequest {
  events: TelemetryEventRequest[];
}

export interface TelemetryEventRequest {
  eventName: string;
  timestamp: string;
  sessionId: string;
  cityId: string;
  userId?: string;
  platform: 'web' | 'ios' | 'android';
  properties: Record<string, unknown>;
}

export interface TrackEventResponse {
  accepted: number;
  rejected: number;
  errors?: Array<{
    index: number;
    message: string;
  }>;
}

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Standard error codes used across all APIs
 */
export enum ApiErrorCode {
  // Client errors (400s)
  BAD_REQUEST = 'BAD_REQUEST',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Server errors (500s)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  COSMOS_DB_ERROR = 'COSMOS_DB_ERROR',
  ADAPTER_ERROR = 'ADAPTER_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Business logic errors
  CITY_NOT_FOUND = 'CITY_NOT_FOUND',
  CITY_INACTIVE = 'CITY_INACTIVE',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND',
  INVALID_FILTERS = 'INVALID_FILTERS',
  NO_RESULTS = 'NO_RESULTS',
  ONBOARDING_FAILED = 'ONBOARDING_FAILED',
  SYNC_FAILED = 'SYNC_FAILED',
}

// ============================================================================
// HTTP STATUS HELPERS
// ============================================================================

/**
 * Helper to create standardized API responses
 */
export class ApiResponseBuilder {
  static success<T>(data: T, metadata?: Partial<ResponseMetadata>): ApiResponse<T> {
    return {
      success: true,
      data,
      metadata: {
        requestId: metadata?.requestId || '',
        timestamp: new Date().toISOString(),
        executionTimeMs: metadata?.executionTimeMs || 0,
        version: '1.0',
      },
    };
  }

  static error(
    code: ApiErrorCode,
    message: string,
    details?: unknown
  ): ApiResponse<never> {
    return {
      success: false,
      error: {
        code,
        message,
        details,
      },
    };
  }
}
