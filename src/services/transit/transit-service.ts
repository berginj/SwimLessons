/**
 * TransitService - Travel time estimates
 * Concrete implementation of ITransitService
 *
 * For mock/demo implementation: Uses distance-based fallback only
 * Estimates based on transit mode (walking, biking, driving, subway)
 *
 * Speed assumptions (mph):
 * - Walking: 3 mph
 * - Biking: 12 mph
 * - Driving: 25 mph (average accounting for traffic)
 * - Subway: 20 mph (accounting for stops and transfers)
 *
 * Future: City-specific providers can override with real transit APIs
 * (Google Maps, MTA, Citymapper, etc.)
 */

import { Coordinates, TransitMode } from '@core/contracts/city-config';
import { TransitEstimate } from '@core/models/canonical-schema';
import { ITransitService } from '@core/contracts/services';

/**
 * TransitService implementation with distance-based fallback
 */
export class TransitService implements ITransitService {
  /**
   * Speed estimates by transit mode type (mph)
   */
  private static readonly SPEED_ESTIMATES: Record<string, number> = {
    walking: 3,
    biking: 12,
    driving: 25,
    subway: 20,
    bus: 12,
    rail: 25,
  };

  /**
   * Estimate travel time from origin to destination
   * Uses distance-based fallback calculation
   *
   * @param origin User's location
   * @param destination Pool/facility location
   * @param mode Transit mode (subway, bus, walking, etc.)
   * @param cityId City ID (for city-specific routing, not used in demo)
   * @returns Transit estimate with fallback confidence
   */
  async estimateTransitTime(
    origin: Coordinates,
    destination: Coordinates,
    mode: TransitMode,
    cityId: string
  ): Promise<TransitEstimate | null> {
    try {
      // Calculate haversine distance
      const distanceMiles = this.calculateHaversineDistance(origin, destination);

      // Get speed for transit mode
      const speedMph = TransitService.SPEED_ESTIMATES[mode.mode] || 15;

      // Calculate time in minutes (distance / speed * 60)
      const timeMinutes = Math.round((distanceMiles / speedMph) * 60);

      return {
        durationMinutes: timeMinutes,
        distance: Math.round(distanceMiles * 10) / 10, // Round to 1 decimal place
        mode: mode.mode,
        confidence: 'fallback', // Indicate this is distance-based estimate
        calculatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        `Error estimating transit time from ${JSON.stringify(origin)} to ${JSON.stringify(
          destination
        )}:`,
        error
      );
      return null;
    }
  }

  /**
   * Batch estimate for multiple destinations
   * More efficient than individual calls
   *
   * @param origin User's location
   * @param destinations Array of destinations with IDs
   * @param mode Transit mode
   * @param cityId City ID
   * @returns Map of destination ID to estimate
   */
  async batchEstimate(
    origin: Coordinates,
    destinations: Array<{ id: string; coordinates: Coordinates }>,
    mode: TransitMode,
    cityId: string
  ): Promise<Map<string, TransitEstimate>> {
    const estimates = new Map<string, TransitEstimate>();

    try {
      // Get speed for transit mode
      const speedMph = TransitService.SPEED_ESTIMATES[mode.mode] || 15;

      // Calculate estimates for all destinations
      for (const dest of destinations) {
        const distanceMiles = this.calculateHaversineDistance(origin, dest.coordinates);
        const timeMinutes = Math.round((distanceMiles / speedMph) * 60);

        estimates.set(dest.id, {
          durationMinutes: timeMinutes,
          distance: Math.round(distanceMiles * 10) / 10,
          mode: mode.mode,
          confidence: 'fallback',
          calculatedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(`Error batch estimating transit times for city ${cityId}:`, error);
    }

    return estimates;
  }

  /**
   * Calculate haversine distance between two coordinates
   * Used for fallback transit time estimation
   *
   * Formula: a = sin²(Δφ/2) + cos φ1 ⋅ cos φ2 ⋅ sin²(Δλ/2)
   *          c = 2 ⋅ atan2( √a, √(1−a) )
   *          d = R ⋅ c (where R is earth's radius in miles)
   *
   * @param origin User's location
   * @param destination Target location
   * @returns Distance in miles
   */
  private calculateHaversineDistance(
    origin: Coordinates,
    destination: Coordinates
  ): number {
    const EARTH_RADIUS_MILES = 3959;

    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

    const lat1 = toRadians(origin.latitude);
    const lat2 = toRadians(destination.latitude);
    const deltaLat = toRadians(destination.latitude - origin.latitude);
    const deltaLon = toRadians(destination.longitude - origin.longitude);

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = EARTH_RADIUS_MILES * c;

    return distance;
  }
}
