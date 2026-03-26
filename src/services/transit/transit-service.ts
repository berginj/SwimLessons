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
import { getEnvNumber, getEnvOptional } from '@core/utils/env';
import { GoogleMapsTransitService } from './google-maps-transit';

interface OtpPlanResponse {
  data?: {
    planConnection?: {
      edges?: Array<{
        node?: {
          duration?: number;
          legs?: Array<{
            mode?: string;
          }>;
        };
      }>;
    };
  };
  errors?: Array<{
    message?: string;
  }>;
}

/**
 * TransitService implementation with distance-based fallback
 */
export class TransitService implements ITransitService {
  private readonly transitRouterGraphqlUrl = getEnvOptional('TRANSIT_ROUTER_GRAPHQL_URL', '').trim();
  private readonly transitRouterTimeoutMs = getEnvNumber('TRANSIT_ROUTER_TIMEOUT_MS', 2500);
  private readonly googleMapsService: GoogleMapsTransitService | null;

  constructor() {
    const googleMapsApiKey = getEnvOptional('GOOGLE_MAPS_API_KEY', '').trim();
    this.googleMapsService = googleMapsApiKey ? new GoogleMapsTransitService(googleMapsApiKey) : null;
  }

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
    cityId: string,
    departureTime?: string
  ): Promise<TransitEstimate | null> {
    try {
      const distanceMiles = this.calculateHaversineDistance(origin, destination);

      // Try Google Maps first (if available)
      if (this.googleMapsService && cityId === 'nyc') {
        const googleEstimate = await this.googleMapsEstimate(
          origin,
          destination,
          mode,
          departureTime
        );
        if (googleEstimate) {
          return googleEstimate;
        }
      }

      if (cityId === 'nyc') {
        const routedEstimate = await this.estimateNycTransitTimeFromRouter(
          origin,
          destination,
          distanceMiles,
          mode.mode,
          departureTime
        );
        if (routedEstimate) {
          return routedEstimate;
        }

        return this.estimateNycTransitTimeFallback(distanceMiles, mode.mode, departureTime);
      }

      const speedMph = TransitService.SPEED_ESTIMATES[mode.mode] || 15;
      const timeMinutes = Math.round((distanceMiles / speedMph) * 60);

      return this.buildEstimate(distanceMiles, timeMinutes, mode.mode, 'fallback');
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
    cityId: string,
    departureTime?: string
  ): Promise<Map<string, TransitEstimate>> {
    const estimates = new Map<string, TransitEstimate>();

    try {
      for (const dest of destinations) {
        const estimate = await this.estimateTransitTime(
          origin,
          dest.coordinates,
          mode,
          cityId,
          departureTime
        );
        if (estimate) {
          estimates.set(dest.id, estimate);
        }
      }
    } catch (error) {
      console.error(`Error batch estimating transit times for city ${cityId}:`, error);
    }

    return estimates;
  }

  private async googleMapsEstimate(
    origin: Coordinates,
    destination: Coordinates,
    mode: TransitMode,
    departureTime?: string
  ): Promise<TransitEstimate | null> {
    if (!this.googleMapsService) {
      return null;
    }

    try {
      const googleMode = this.mapToGoogleMode(mode.mode);
      const departureDate = departureTime ? new Date(departureTime) : undefined;

      return await this.googleMapsService.getTransitDirections(
        origin,
        destination,
        googleMode,
        departureDate
      );
    } catch (error) {
      console.warn('Google Maps API failed, falling back to router/heuristic estimate:', error);
      return null;
    }
  }

  private async estimateNycTransitTimeFromRouter(
    origin: Coordinates,
    destination: Coordinates,
    distanceMiles: number,
    mode: string,
    departureTime?: string
  ): Promise<TransitEstimate | null> {
    if (!this.transitRouterGraphqlUrl || (mode !== 'walking' && mode !== 'subway')) {
      return null;
    }

    const variables =
      mode === 'walking'
        ? this.buildWalkingPlanVariables(origin, destination, departureTime)
        : this.buildTransitPlanVariables(origin, destination, departureTime);

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.transitRouterTimeoutMs);

    try {
      const response = await fetch(this.transitRouterGraphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: OTP_PLAN_CONNECTION_QUERY,
          variables,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(
          `Transit router request failed with status ${response.status} ${response.statusText}`
        );
        return null;
      }

      const payload = (await response.json()) as OtpPlanResponse;
      if (payload.errors && payload.errors.length > 0) {
        console.warn(
          'Transit router returned GraphQL errors:',
          payload.errors.map((error) => error.message).join('; ')
        );
        return null;
      }

      const itinerary = payload.data?.planConnection?.edges?.[0]?.node;
      if (!itinerary) {
        return null;
      }

      const rawDuration = itinerary.duration;
      const durationMinutes = Number.isFinite(rawDuration)
        ? Math.max(1, Math.round((rawDuration as number) / 60))
        : null;

      if (!durationMinutes) {
        return null;
      }

      return {
        durationMinutes,
        distance: Math.round(distanceMiles * 10) / 10,
        mode: this.derivePrimaryMode(mode, itinerary.legs),
        confidence: 'estimated',
        calculatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.warn('Transit router request failed, falling back to heuristic estimate:', error);
      return null;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private estimateNycTransitTimeFallback(
    distanceMiles: number,
    mode: string,
    departureTime?: string
  ): TransitEstimate {
    const profile = this.getNycTimeProfile(departureTime);

    switch (mode) {
      case 'walking':
        return this.buildEstimate(
          distanceMiles,
          (distanceMiles / 3.1) * 60,
          'walking',
          'estimated'
        );

      case 'bus': {
        const accessMinutes = Math.min(10, Math.max(3, distanceMiles * 2.2));
        const egressMinutes = Math.min(8, Math.max(2, distanceMiles * 1.1));
        const transferMinutes = distanceMiles > 4 ? 4 : 0;
        const inVehicleMinutes = (distanceMiles / profile.busSpeedMph) * 60;
        const totalMinutes =
          accessMinutes +
          profile.busWaitMinutes +
          inVehicleMinutes +
          transferMinutes +
          egressMinutes;

        return this.buildEstimate(distanceMiles, totalMinutes, 'bus', 'estimated');
      }

      case 'rail':
      case 'subway': {
        const accessMinutes = Math.min(14, Math.max(5, 4 + distanceMiles * 0.7));
        const egressMinutes = Math.min(10, Math.max(4, 3 + distanceMiles * 0.5));
        const transferMinutes = distanceMiles > 5 ? 5 : distanceMiles > 2.5 ? 3 : 0;
        const inVehicleMinutes = (distanceMiles / profile.subwaySpeedMph) * 60;
        const totalMinutes =
          accessMinutes +
          profile.subwayWaitMinutes +
          inVehicleMinutes +
          transferMinutes +
          egressMinutes;

        return this.buildEstimate(distanceMiles, totalMinutes, 'subway', 'estimated');
      }

      default: {
        const speedMph = TransitService.SPEED_ESTIMATES[mode] || 15;
        return this.buildEstimate(
          distanceMiles,
          (distanceMiles / speedMph) * 60,
          mode,
          'fallback'
        );
      }
    }
  }

  private buildEstimate(
    distanceMiles: number,
    timeMinutes: number,
    mode: string,
    confidence: TransitEstimate['confidence']
  ): TransitEstimate {
    return {
      durationMinutes: Math.max(1, Math.round(timeMinutes)),
      distance: Math.round(distanceMiles * 10) / 10,
      mode,
      confidence,
      calculatedAt: new Date().toISOString(),
    };
  }

  private getNycTimeProfile(departureTime?: string): {
    subwaySpeedMph: number;
    subwayWaitMinutes: number;
    busSpeedMph: number;
    busWaitMinutes: number;
  } {
    const hour = this.extractHour(departureTime);
    const dayOfWeek = this.extractDayOfWeek(departureTime);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekend) {
      return {
        subwaySpeedMph: 16,
        subwayWaitMinutes: 7,
        busSpeedMph: 7.5,
        busWaitMinutes: 10,
      };
    }

    if ((hour >= 7 && hour < 10) || (hour >= 16 && hour < 19)) {
      return {
        subwaySpeedMph: 16.5,
        subwayWaitMinutes: 4.5,
        busSpeedMph: 7.5,
        busWaitMinutes: 6.5,
      };
    }

    if (hour >= 22 || hour < 6) {
      return {
        subwaySpeedMph: 15,
        subwayWaitMinutes: 8,
        busSpeedMph: 7,
        busWaitMinutes: 11,
      };
    }

    if (hour >= 19) {
      return {
        subwaySpeedMph: 17,
        subwayWaitMinutes: 6.5,
        busSpeedMph: 8,
        busWaitMinutes: 8,
      };
    }

    return {
      subwaySpeedMph: 18,
      subwayWaitMinutes: 5.5,
      busSpeedMph: 8.5,
      busWaitMinutes: 7.5,
    };
  }

  private extractHour(departureTime?: string): number {
    if (!departureTime) {
      return 12;
    }

    const timePartMatch = departureTime.match(/T(\d{2}):(\d{2})/);
    if (!timePartMatch) {
      return 12;
    }

    return Number.parseInt(timePartMatch[1] || '12', 10);
  }

  private extractDayOfWeek(departureTime?: string): number {
    if (!departureTime) {
      return 2;
    }

    const datePart = departureTime.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return 2;
    }

    return new Date(`${datePart}T12:00:00Z`).getUTCDay();
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

  private mapToGoogleMode(
    mode: string
  ): 'transit' | 'walking' | 'bicycling' | 'driving' {
    const modeMap: Record<string, 'transit' | 'walking' | 'bicycling' | 'driving'> = {
      subway: 'transit',
      bus: 'transit',
      rail: 'transit',
      walking: 'walking',
      biking: 'bicycling',
      driving: 'driving',
    };

    return modeMap[mode] || 'transit';
  }

  private buildWalkingPlanVariables(
    origin: Coordinates,
    destination: Coordinates,
    departureTime?: string
  ) {
    const dateTime = this.getOtpDateTime(departureTime);

    return {
      origin: this.toOtpLocation(origin, 'Origin'),
      destination: this.toOtpLocation(destination, 'Destination'),
      dateTime: {
        earliestDeparture: dateTime,
      },
      first: 1,
      modes: {
        directOnly: true,
        direct: ['WALK'],
      },
    };
  }

  private buildTransitPlanVariables(
    origin: Coordinates,
    destination: Coordinates,
    departureTime?: string
  ) {
    const dateTime = this.getOtpDateTime(departureTime);

    return {
      origin: this.toOtpLocation(origin, 'Origin'),
      destination: this.toOtpLocation(destination, 'Destination'),
      dateTime: {
        earliestDeparture: dateTime,
      },
      first: 1,
      modes: {
        transitOnly: true,
        transit: {
          access: ['WALK'],
          egress: ['WALK'],
          transfer: ['WALK'],
          transit: [
            {
              mode: 'SUBWAY',
            },
          ],
        },
      },
    };
  }

  private getOtpDateTime(departureTime?: string): string {
    const timePart = this.extractOtpTimePart(departureTime) || '17:00:00';

    if (!departureTime) {
      const fallbackDate = this.getNextNewYorkDateForWeekday(3);
      return `${fallbackDate}T${timePart}${this.getNewYorkOffsetForDate(fallbackDate)}`;
    }

    const datePart = departureTime.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      const fallbackDate = this.getNextNewYorkDateForWeekday(3);
      return `${fallbackDate}T${timePart}${this.getNewYorkOffsetForDate(fallbackDate)}`;
    }

    const targetDate = this.isWithinCurrentServiceWindow(datePart)
      ? datePart
      : this.getNextNewYorkDateForWeekday(this.extractDayOfWeek(departureTime));

    if (departureTime.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(departureTime)) {
      return `${targetDate}T${timePart}${this.getNewYorkOffsetForDate(targetDate)}`;
    }

    return `${targetDate}T${timePart}${this.getNewYorkOffsetForDate(targetDate)}`;
  }

  private extractOtpTimePart(departureTime?: string): string | null {
    if (!departureTime) {
      return null;
    }

    const match = departureTime.match(/T(\d{2}:\d{2})(?::(\d{2}))?/);
    if (!match) {
      return null;
    }

    return `${match[1]}:${match[2] || '00'}`;
  }

  private isWithinCurrentServiceWindow(datePart: string): boolean {
    const targetDate = new Date(`${datePart}T12:00:00Z`);
    const todayDate = new Date(`${this.getCurrentNewYorkDate()}T12:00:00Z`);
    const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);
    return diffDays >= 0 && diffDays <= 14;
  }

  private getNextNewYorkDateForWeekday(targetWeekday: number): string {
    const baseDate = new Date(`${this.getCurrentNewYorkDate()}T12:00:00Z`);

    for (let offset = 0; offset < 14; offset += 1) {
      const candidate = new Date(baseDate);
      candidate.setUTCDate(baseDate.getUTCDate() + offset);

      if (candidate.getUTCDay() === targetWeekday) {
        return this.formatIsoDate(candidate);
      }
    }

    return this.formatIsoDate(baseDate);
  }

  private getCurrentNewYorkDate(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value || '2026';
    const month = parts.find((part) => part.type === 'month')?.value || '03';
    const day = parts.find((part) => part.type === 'day')?.value || '26';

    return `${year}-${month}-${day}`;
  }

  private formatIsoDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getNewYorkOffsetForDate(datePart: string): string {
    const [year, month, day] = datePart.split('-').map((value) => Number.parseInt(value, 10));
    const noonUtc = new Date(Date.UTC(year || 2026, (month || 1) - 1, day || 1, 12, 0, 0));
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
      hour: '2-digit',
    });
    const timeZoneName =
      formatter.formatToParts(noonUtc).find((part) => part.type === 'timeZoneName')?.value ||
      'GMT-4';
    const match = timeZoneName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);

    if (!match) {
      return '-04:00';
    }

    const signAndHours = match[1] || '-4';
    const sign = signAndHours.startsWith('-') ? '-' : '+';
    const hours = signAndHours.replace(/^[+-]/, '').padStart(2, '0');
    const minutes = (match[2] || '00').padStart(2, '0');
    return `${sign}${hours}:${minutes}`;
  }

  private toOtpLocation(
    coordinates: Coordinates,
    label: string
  ): { label: string; location: { coordinate: { latitude: number; longitude: number } } } {
    return {
      label,
      location: {
        coordinate: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
      },
    };
  }

  private derivePrimaryMode(
    requestedMode: string,
    legs: Array<{ mode?: string }> | undefined
  ): string {
    if (!legs || legs.length === 0) {
      return requestedMode === 'subway' ? 'subway' : requestedMode;
    }

    const transitModes = legs
      .map((leg) => (leg.mode || '').toUpperCase())
      .filter((mode) => mode && mode !== 'WALK');

    if (transitModes.includes('SUBWAY')) {
      return 'subway';
    }
    if (transitModes.includes('RAIL')) {
      return 'rail';
    }
    if (transitModes.includes('BUS')) {
      return 'bus';
    }
    if (transitModes.length === 0) {
      return 'walking';
    }

    return transitModes[0]?.toLowerCase() || requestedMode;
  }
}

const OTP_PLAN_CONNECTION_QUERY = `
  query PlanConnection(
    $origin: PlanLabeledLocationInput!
    $destination: PlanLabeledLocationInput!
    $dateTime: PlanDateTimeInput!
    $modes: PlanModesInput!
    $first: Int!
  ) {
    planConnection(
      origin: $origin
      destination: $destination
      dateTime: $dateTime
      modes: $modes
      first: $first
    ) {
      edges {
        node {
          duration
          legs {
            mode
          }
        }
      }
    }
  }
`;
