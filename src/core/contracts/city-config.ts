/**
 * City Configuration Contracts
 *
 * Defines the CityConfig interface that drives multi-tenant behavior.
 * Each city is a tenant with its own config, data sources, and search profile.
 */

export interface CityConfig {
  // Identity
  cityId: string;                    // "nyc" (partition key in Cosmos DB)
  displayName: string;               // "New York City"
  timezone: string;                  // "America/New_York"
  locale: string;                    // "en-US"

  // Geography
  geographies: Geography[];
  defaultCenter: Coordinates;
  defaultZoomLevel: number;

  // Transit capabilities
  transitModes: TransitMode[];
  transitProvider?: TransitProvider;

  // Business rules
  registrationPatterns: RegistrationPattern[];
  typicalSeasonStart?: MonthDay;
  typicalSeasonEnd?: MonthDay;

  // Data adapter configuration
  adapterConfig: AdapterConfig;

  // Search profile (city-specific ranking)
  searchProfile: CitySearchProfile;

  // Feature flags (overrides global defaults)
  features: CityFeatures;

  // Admin metadata
  status: CityStatus;
  onboardedAt: string;               // ISO 8601
  updatedAt: string;
}

export interface Geography {
  id: string;                        // "manhattan", "brooklyn"
  displayName: string;
  type: GeographyType;
  boundary?: GeoJSONPolygon;         // Optional boundary for map filtering
  parentGeographyId?: string;
}

export type GeographyType = "borough" | "neighborhood" | "zipcode" | "region";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];         // GeoJSON polygon coordinates
}

export interface TransitMode {
  mode: TransitModeType;
  displayName: string;
  maxReasonableMinutes: number;      // Don't show results >X minutes away
}

export type TransitModeType = "subway" | "bus" | "rail" | "walking" | "driving" | "biking";

export type TransitProvider = "google" | "mta" | "citymapper" | null;

export interface RegistrationPattern {
  name: string;                      // "NYC Parks Online"
  urlPattern: string;                // Template with {programId} or {sessionId}
  requiresResidency: boolean;
}

export interface MonthDay {
  month: number;                     // 1-12
  day: number;                       // 1-31
}

export interface AdapterConfig {
  type: string;                      // "nyc-parks-api" | "csv-import" | "manual"
  syncSchedule: string;              // Cron expression: "0 2 * * *" (2am daily)
  apiEndpoint?: string;
  apiKey?: string;                   // Key Vault reference
  confidence: DataConfidenceLevel;
}

export type DataConfidenceLevel = "high" | "medium" | "low" | "unknown";

export interface CitySearchProfile {
  defaultSort: SortField;
  defaultFilters?: Partial<SearchFilters>;
  rankingWeights: RankingWeights;
  noResultsFallback: NoResultsFallbackConfig;
}

export type SortField = "distance" | "startDate" | "price" | "availability" | "createdAt";

export interface SearchFilters {
  cityId: string;
  childAge?: number;                 // Months
  startDateMin?: string;             // ISO date
  startDateMax?: string;
  daysOfWeek?: number[];             // [0=Sun, 1=Mon, ..., 6=Sat]
  timeWindow?: TimeWindow;
  geographyIds?: string[];
  maxTravelMinutes?: number;
  priceMax?: number;
  skillLevel?: SkillLevel[];
  facilityType?: FacilityType[];
  onlyAvailable?: boolean;
  origin?: Coordinates;              // User location (never stored)
}

export interface TimeWindow {
  earliest: string;                  // "06:00"
  latest: string;                    // "19:00"
}

export type SkillLevel = "beginner" | "intermediate" | "advanced" | "all";
export type FacilityType = "outdoor" | "indoor" | "both";

export interface RankingWeights {
  recency: number;                   // 0-1, how much to boost sessions starting soon
  proximity: number;                 // 0-1, distance vs other factors
  availability: number;              // 0-1, boost sessions with open spots
  quality: number;                   // 0-1, boost verified providers
}

export interface NoResultsFallbackConfig {
  expandRadiusMiles: number[];       // [2, 5, 10] progressive expansion
  relaxDayConstraints: boolean;      // Show adjacent days if no exact match
  relaxTimeConstraints: boolean;     // Expand time window +/- 1 hour
}

export interface CityFeatures {
  transitETA: boolean;
  providerSelfServe: boolean;
}

export type CityStatus = "active" | "preview" | "deactivated";

/**
 * Tenant Catalog Entry (stored in Cosmos DB "tenants" container)
 */
export interface TenantCatalog {
  id: string;                        // cityId (partition key)
  type: "CityConfig";
  cityConfig: CityConfig;
  status: CityStatus;

  // Lifecycle metadata
  onboardedAt: string;
  onboardedBy: string;               // Admin user email
  deactivatedAt?: string;
  deactivatedReason?: string;

  // Deployment allocation (for multi-stamp future)
  stampId?: string;
}
