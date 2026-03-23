/**
 * City Data Adapter Contract
 *
 * Standard interface that all city implementations must satisfy.
 * Adapters transform city-specific data sources into canonical schemas.
 */

import {
  Provider,
  Location,
  Program,
  Session,
  SyncResult,
  ValidationResult,
  TransitEstimate,
} from '../models/canonical-schema';
import { Coordinates, TransitMode } from './city-config';

/**
 * ICityDataAdapter - Contract for city-specific data adapters
 *
 * Each city implements this interface to provide data from local sources
 * (APIs, CSV files, scraped data) transformed into canonical schemas.
 */
export interface ICityDataAdapter {
  /**
   * City identifier (e.g., "nyc", "la", "chicago")
   */
  readonly cityId: string;

  /**
   * Fetch all swim locations (pools/facilities) for the city
   * @returns Array of Location objects in canonical schema
   */
  getLocations(): Promise<Location[]>;

  /**
   * Fetch all programs (recurring swim lesson offerings)
   * @returns Array of Program objects in canonical schema
   */
  getPrograms(): Promise<Program[]>;

  /**
   * Fetch sessions (specific enrollable instances)
   * @param filters Optional filters to reduce dataset size
   * @returns Array of Session objects in canonical schema
   */
  getSessions(filters?: SessionFilters): Promise<Session[]>;

  /**
   * Get provider signup/registration URL for a specific session
   * @param session The session to sign up for
   * @returns Deep link to provider booking page
   */
  getProviderSignupUrl(session: Session): string;

  /**
   * Estimate transit time from origin to location
   * Returns null if transit capability not available for this city
   *
   * @param origin User's current location
   * @param destination Pool/facility location
   * @param mode Transit mode (subway, bus, walking, etc.)
   * @returns Transit estimate or null if not supported
   */
  getTransitEstimate(
    origin: Coordinates,
    destination: Coordinates,
    mode: TransitMode
  ): Promise<TransitEstimate | null>;

  /**
   * Sync latest data from city sources to Cosmos DB
   * Called by scheduled Function App job (typically daily)
   *
   * @returns Sync result with stats and errors
   */
  syncData(): Promise<SyncResult>;

  /**
   * Validate adapter configuration
   * Called during city onboarding to ensure adapter is correctly configured
   *
   * @returns Validation result with errors and warnings
   */
  validateConfig(): Promise<ValidationResult>;
}

/**
 * Session Filters (for getSessions)
 */
export interface SessionFilters {
  startDate?: string;                // ISO date
  endDate?: string;
  geographyIds?: string[];
  providerIds?: string[];
}

/**
 * Abstract base adapter class with common functionality
 */
export abstract class BaseAdapter implements ICityDataAdapter {
  constructor(public readonly cityId: string) {}

  abstract getLocations(): Promise<Location[]>;
  abstract getPrograms(): Promise<Program[]>;
  abstract getSessions(filters?: SessionFilters): Promise<Session[]>;
  abstract getProviderSignupUrl(session: Session): string;
  abstract getTransitEstimate(
    origin: Coordinates,
    destination: Coordinates,
    mode: TransitMode
  ): Promise<TransitEstimate | null>;
  abstract syncData(): Promise<SyncResult>;
  abstract validateConfig(): Promise<ValidationResult>;

  /**
   * Helper: Calculate haversine distance between two coordinates
   * @returns Distance in miles
   */
  protected calculateDistance(
    coord1: Coordinates,
    coord2: Coordinates
  ): number {
    const R = 3959; // Earth radius in miles
    const dLat = this.toRadians(coord2.latitude - coord1.latitude);
    const dLon = this.toRadians(coord2.longitude - coord1.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(coord1.latitude)) *
        Math.cos(this.toRadians(coord2.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Helper: Estimate walking time based on distance
   * Assumes average walking speed of 3 mph
   * @returns Duration in minutes
   */
  protected estimateWalkingTime(distanceMiles: number): number {
    const walkingSpeedMph = 3;
    return Math.ceil((distanceMiles / walkingSpeedMph) * 60);
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
