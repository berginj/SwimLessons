/**
 * Canonical Data Schema
 *
 * Unified data models across all cities. Every city adapter transforms
 * its local data sources into these canonical schemas.
 */

import { DataConfidenceLevel, SkillLevel, FacilityType, Coordinates } from '../contracts/city-config';

/**
 * Base document fields (Cosmos DB metadata)
 */
interface BaseDocument {
  id: string;
  cityId: string;                    // Partition key
  type: string;                      // Discriminator field
  _ts?: number;                      // Cosmos DB timestamp
}

/**
 * Provider - Organization offering swim lessons
 */
export interface Provider extends BaseDocument {
  type: "ProviderDocument";

  name: string;
  description?: string;
  logoUrl?: string;

  // Contact information
  website?: string;
  phone?: string;
  email?: string;

  // Classification
  providerType: ProviderType;
  verified: boolean;                 // Admin-verified data quality

  // Metadata
  confidence: DataConfidenceLevel;
  sourceSystem: string;              // "nyc-parks-api", "manual-entry", "csv-import"
  createdAt: string;                 // ISO 8601
  updatedAt: string;
}

export type ProviderType = "public" | "private" | "nonprofit" | "ymca";

/**
 * Location - Physical facility where lessons occur
 */
export interface Location extends BaseDocument {
  type: "LocationDocument";

  providerId: string;                // Foreign key to Provider
  name: string;
  address: Address;
  coordinates: Coordinates;

  // Facility details
  facilityType: FacilityType;
  poolType?: PoolType;
  accessibility?: string[];          // ["wheelchair", "family-changing"]
  amenities?: string[];              // ["parking", "lockers", "cafe"]

  // Operating hours (if available)
  hours?: OperatingHours[];

  // Metadata
  confidence: DataConfidenceLevel;
  sourceSystem: string;
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  street?: string;
  city: string;
  state: string;
  zipCode: string;
  geographyId: string;               // Links to CityConfig.geographies
}

export type PoolType = "olympic" | "recreational" | "lap" | "training";

export interface OperatingHours {
  dayOfWeek: number;                 // 0=Sunday, 6=Saturday
  open: string;                      // "06:00"
  close: string;                     // "22:00"
  notes?: string;                    // "Summer hours only"
}

/**
 * Program - Recurring offering (e.g., "Beginner Swim Lessons")
 */
export interface Program extends BaseDocument {
  type: "ProgramDocument";

  providerId: string;
  locationId: string;
  name: string;
  description?: string;

  // Eligibility
  ageMin?: number;                   // Months
  ageMax?: number;                   // Months
  skillLevel: SkillLevel;
  prerequisites?: string[];

  // Format
  sessionLengthMinutes: number;      // 45, 60, 90
  totalSessions: number;             // 8 weeks = 8 sessions
  cadence: Cadence;

  // Pricing (if available)
  priceRange?: PriceRange;

  // Metadata
  confidence: DataConfidenceLevel;
  sourceSystem: string;
  createdAt: string;
  updatedAt: string;
}

export type Cadence = "weekly" | "biweekly" | "daily" | "flexible";

export interface PriceRange {
  min: number;
  max: number;
  currency: "USD";
  unit: PriceUnit;
  notes?: string;                    // "Resident discount available"
}

export type PriceUnit = "session" | "program" | "month";

/**
 * Session - Specific enrollable instance of a Program
 * THIS IS WHAT USERS SEARCH FOR AND SIGN UP FOR
 */
export interface Session extends BaseDocument {
  type: "SessionDocument";

  programId: string;
  providerId: string;                // Denormalized for search performance
  locationId: string;                // Denormalized for search performance

  // Schedule
  startDate: string;                 // ISO date "2026-06-01"
  endDate: string;                   // "2026-07-20"
  daysOfWeek: number[];              // [1, 3, 5] = Mon/Wed/Fri
  timeOfDay: TimeOfDay;

  // Enrollment
  capacity?: number;
  enrolled?: number;
  availableSpots?: number;
  registrationOpen: boolean;
  registrationUrl: string;           // Deep link to provider signup page

  // Pricing (session-specific override)
  price?: Price;

  // Search optimization (denormalized)
  searchTerms: string;               // Concatenated: "beginner swim ymca brooklyn"
  geographyIds: string[];            // ["brooklyn"] for filtering

  // Metadata
  confidence: DataConfidenceLevel;
  sourceSystem: string;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeOfDay {
  start: string;                     // "18:00"
  end: string;                       // "19:00"
}

export interface Price {
  amount: number;
  currency: "USD";
  notes?: string;                    // "Non-resident: $150"
}

/**
 * Sync Result - returned by adapter.syncData()
 */
export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsDeleted?: number;
  errors: SyncError[];
  syncedAt: string;                  // ISO 8601
}

export interface SyncError {
  message: string;
  entityId?: string;
  entityType?: string;
  details?: unknown;
}

/**
 * Validation Result - returned by adapter.validateConfig()
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Transit Estimate - returned by adapter.getTransitEstimate()
 */
export interface TransitEstimate {
  durationMinutes: number;
  distance: number;                  // Miles
  mode: string;                      // "subway", "walking", etc.
  confidence: TransitConfidence;
  calculatedAt: string;              // ISO 8601
}

export type TransitConfidence = "realtime" | "estimated" | "fallback";

/**
 * Search Results
 */
export interface SearchResults {
  results: Session[];
  total: number;
  filters: any;                      // Applied filters
  relaxationApplied: boolean;
  executionTimeMs?: number;
}

/**
 * Scored Session (used internally for ranking)
 */
export interface ScoredSession {
  session: Session;
  score: number;
}
