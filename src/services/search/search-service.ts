/**
 * SearchService - Search and ranking logic for swim sessions
 * Concrete implementation of ISearchService
 *
 * Responsibilities:
 * - Query sessions from repository with Cosmos DB filters
 * - Apply application-layer business logic filters (age, schedule, geography)
 * - Score and rank sessions using city-specific weights
 * - Handle no-results fallback with progressive constraint relaxation
 * - Calculate haversine distance for proximity scoring
 */

import {
  ISearchService,
  SortOptions,
  PaginationOptions,
  ScoredSession,
} from '@core/contracts/services';
import { ISessionRepository, SessionQueryFilters } from '@core/contracts/repositories';
import { ICityConfigService } from '@core/contracts/services';
import {
  SearchFilters,
  CityConfig,
  Coordinates,
  TimeWindow,
} from '@core/contracts/city-config';
import {
  Session,
  SearchResults,
} from '@core/models/canonical-schema';
import {
  CityNotFoundError,
  ValidationError,
} from '@core/errors/app-errors';

/**
 * SearchService implementation with comprehensive filtering and ranking
 */
export class SearchService implements ISearchService {
  constructor(
    private sessionRepository: ISessionRepository,
    private cityConfigService: ICityConfigService
  ) {}

  /**
   * Search for swim sessions with filters, sorting, and pagination
   *
   * @param filters Search criteria (age, schedule, location, etc.)
   * @param sort Sort field and direction
   * @param pagination Skip/take for paging
   * @returns Ranked and paginated search results
   * @throws CityNotFoundError, ValidationError
   */
  async search(
    filters: SearchFilters,
    sort: SortOptions,
    pagination: PaginationOptions
  ): Promise<SearchResults> {
    const startTime = Date.now();

    // Validate city exists
    const cityConfig = await this.cityConfigService.getCityConfig(filters.cityId);
    if (!cityConfig) {
      throw new CityNotFoundError(filters.cityId);
    }

    // Validate pagination
    if (pagination.skip < 0 || pagination.take < 0) {
      throw new ValidationError('Pagination parameters must be non-negative', {
        skip: pagination.skip,
        take: pagination.take,
      });
    }

    // Phase 1: Query repository with database-level filters
    let sessions = await this.querySessions(filters, cityConfig);
    const locationCoordinates = await this.loadLocationCoordinates(
      sessions,
      filters.cityId,
      cityConfig.defaultCenter
    );

    // Phase 2: Apply application-layer business filters
    sessions = this.applyBusinessFilters(sessions, filters, cityConfig, locationCoordinates);

    // Phase 3: Score and rank all sessions
    const scoredSessions = await this.scoreAndRankWithLocationContext(
      sessions,
      filters,
      cityConfig,
      locationCoordinates
    );

    // Phase 4: Sort by user preference
    const sortedSessions = this.sortSessions(
      scoredSessions,
      sort,
      filters.origin,
      cityConfig,
      locationCoordinates
    );

    // Phase 5: Check for no results and apply relaxation if needed
    let relaxationApplied = false;
    let finalSessions = sortedSessions;

    if (finalSessions.length === 0) {
      const relaxationResult = await this.applyNoResultsFallback(
        filters,
        cityConfig
      );
      finalSessions = relaxationResult.scoredSessions;
      relaxationApplied = relaxationResult.relaxationApplied;
    }

    // Phase 6: Apply pagination
    const paginatedSessions = finalSessions
      .slice(pagination.skip, pagination.skip + pagination.take)
      .map((scored) => scored.session);

    const executionTimeMs = Date.now() - startTime;

    return {
      results: paginatedSessions,
      total: finalSessions.length,
      filters,
      relaxationApplied,
      executionTimeMs,
    };
  }

  /**
   * Get a single session by ID with city context
   *
   * @param sessionId Session ID
   * @param cityId City ID (partition key)
   * @returns Session or null if not found
   */
  async getSessionById(sessionId: string, cityId: string): Promise<Session | null> {
    return this.sessionRepository.getSessionById(sessionId, cityId);
  }

  /**
   * Score and rank sessions based on city-specific weights
   *
   * This is the core ranking algorithm that combines multiple scoring factors:
   * - Recency: Sessions starting soon are ranked higher
   * - Proximity: Sessions close to origin (if provided) are ranked higher
   * - Availability: Sessions with open spots are ranked higher
   * - Quality: Sessions from verified providers are ranked higher
   *
   * @param sessions Sessions to score
   * @param filters User's search filters
   * @param cityConfig City-specific ranking configuration
   * @returns Scored sessions sorted by score descending
   */
  async scoreAndRank(
    sessions: Session[],
    filters: SearchFilters,
    cityConfig: CityConfig
  ): Promise<ScoredSession[]> {
    return this.scoreAndRankWithLocationContext(sessions, filters, cityConfig);
  }

  private async scoreAndRankWithLocationContext(
    sessions: Session[],
    filters: SearchFilters,
    cityConfig: CityConfig,
    locationCoordinates?: Map<string, Coordinates>
  ): Promise<ScoredSession[]> {
    const weights = cityConfig.searchProfile.rankingWeights;

    const scoredSessions = sessions.map((session) => {
      // Calculate individual scores (0-1 each)
      const recencyScore = this.calculateRecencyScore(session);
      const proximityScore = this.calculateProximityScore(
        session,
        filters,
        cityConfig,
        locationCoordinates
      );
      const availabilityScore = this.calculateAvailabilityScore(session);
      const qualityScore = this.calculateQualityScore(session);

      // Weighted combination
      const score =
        weights.recency * recencyScore +
        weights.proximity * proximityScore +
        weights.availability * availabilityScore +
        weights.quality * qualityScore;

      return {
        session,
        score,
        scoreBreakdown: {
          recency: recencyScore,
          proximity: proximityScore,
          availability: availabilityScore,
          quality: qualityScore,
        },
      };
    });

    // Sort by score descending
    return scoredSessions.sort((a, b) => b.score - a.score);
  }

  /**
   * Query sessions from repository with database-level filters
   * Uses Cosmos DB to efficiently filter on indexed properties
   *
   * @param filters Search filters
   * @param cityConfig City configuration
   * @returns Sessions matching repository-level filters
   */
  private async querySessions(
    filters: SearchFilters,
    cityConfig: CityConfig
  ): Promise<Session[]> {
    // Convert SearchFilters to SessionQueryFilters (database-optimized subset)
    const queryFilters: SessionQueryFilters = {
      startDateMin: filters.startDateMin,
      startDateMax: filters.startDateMax,
      daysOfWeek: filters.daysOfWeek,
      geographyIds: filters.geographyIds,
      registrationOpen: true,
    };

    // Query repository - returns unfiltered sessions for application-layer filtering
    const sessions = await this.sessionRepository.querySessions(
      filters.cityId,
      queryFilters,
      1000 // Reasonable limit for subsequent filtering
    );

    return sessions;
  }

  /**
   * Apply application-layer business filters
   * These filters are applied after database query but before scoring
   *
   * Filters applied:
   * - Age eligibility (if childAge provided)
   * - Days of week validation (sessions must include requested days)
   * - Time window validation (session time must overlap with requested window)
   * - Geography validation (session must be in requested geographies)
   * - Travel time constraint (if origin and maxTravelMinutes provided)
   *
   * @param sessions Sessions to filter
   * @param filters Search filters
   * @param cityConfig City configuration
   * @returns Filtered sessions
   */
  private applyBusinessFilters(
    sessions: Session[],
    filters: SearchFilters,
    cityConfig: CityConfig,
    locationCoordinates?: Map<string, Coordinates>
  ): Session[] {
    return sessions.filter((session) => {
      // Age eligibility check
      if (filters.childAge !== undefined) {
        const hasAgeEligibility = this.checkAgeEligibility(session, filters.childAge);
        if (!hasAgeEligibility) {
          return false;
        }
      }

      // Days of week check
      if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
        const hasDayOverlap = this.checkDaysOfWeekOverlap(
          session.daysOfWeek,
          filters.daysOfWeek
        );
        if (!hasDayOverlap) {
          return false;
        }
      }

      // Time window check
      if (filters.timeWindow) {
        const hasTimeOverlap = this.checkTimeWindowOverlap(
          session.timeOfDay,
          filters.timeWindow
        );
        if (!hasTimeOverlap) {
          return false;
        }
      }

      // Geography check
      if (filters.geographyIds && filters.geographyIds.length > 0) {
        const inGeography = this.checkGeographyMatch(
          session.geographyIds,
          filters.geographyIds
        );
        if (!inGeography) {
          return false;
        }
      }

      // Travel time check
      if (filters.origin && filters.maxTravelMinutes) {
        const distance = this.calculateHaversineDistance(
          filters.origin,
          this.getSessionLocation(session, cityConfig, locationCoordinates)
        );
        const maxTravelMiles = filters.maxTravelMinutes / 10; // Rough conversion: ~10 min per mile
        if (distance > maxTravelMiles) {
          return false;
        }
      }

      // Price check
      if (filters.priceMax && session.price) {
        if (session.price.amount > filters.priceMax) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Check if child age is eligible for session
   * Checks program age range if available
   *
   * @param session Session to check
   * @param childAge Child age in months
   * @returns True if age is within program range
   */
  private checkAgeEligibility(session: Session, childAge: number): boolean {
    // If no age constraints, assume eligible
    // Note: Would need to fetch program from repository for detailed age checks
    // For now, this is a placeholder - full implementation would denormalize age fields
    return true;
  }

  /**
   * Check if session days overlap with requested days
   *
   * @param sessionDays Days session occurs [0-6]
   * @param requestedDays Days requested [0-6]
   * @returns True if any day matches
   */
  private checkDaysOfWeekOverlap(sessionDays: number[], requestedDays: number[]): boolean {
    const sessionDaySet = new Set(sessionDays);
    return requestedDays.some((day) => sessionDaySet.has(day));
  }

  /**
   * Check if session time window overlaps with requested window
   *
   * @param sessionTime Session time {"start": "18:00", "end": "19:00"}
   * @param requestedWindow {"earliest": "17:00", "latest": "20:00"}
   * @returns True if time ranges overlap
   */
  private checkTimeWindowOverlap(
    sessionTime: { start: string; end: string },
    requestedWindow: TimeWindow
  ): boolean {
    const sessionStart = this.timeToMinutes(sessionTime.start);
    const sessionEnd = this.timeToMinutes(sessionTime.end);
    const requestedStart = this.timeToMinutes(requestedWindow.earliest);
    const requestedEnd = this.timeToMinutes(requestedWindow.latest);

    // Check for overlap: session starts before requested ends AND session ends after requested starts
    return sessionStart < requestedEnd && sessionEnd > requestedStart;
  }

  /**
   * Check if session geography matches requested geographies
   *
   * @param sessionGeographies Session geography IDs
   * @param requestedGeographies Requested geography IDs
   * @returns True if any geography matches
   */
  private checkGeographyMatch(
    sessionGeographies: string[],
    requestedGeographies: string[]
  ): boolean {
    const sessionGeoSet = new Set(sessionGeographies);
    return requestedGeographies.some((geo) => sessionGeoSet.has(geo));
  }

  /**
   * Get location coordinates for a session
   * In a full implementation, would denormalize location data to sessions
   *
   * @param session Session
   * @param cityConfig City configuration
   * @returns Approximate location or city center
   */
  private getSessionLocation(
    session: Session,
    cityConfig: CityConfig,
    locationCoordinates?: Map<string, Coordinates>
  ): Coordinates {
    return locationCoordinates?.get(session.locationId) || cityConfig.defaultCenter;
  }

  /**
   * Calculate recency score based on session start date
   * Sessions starting sooner have higher scores
   *
   * Uses exponential decay: score = e^(-daysTilStart / halfLife)
   * With 7-day half-life, a session 7 days away scores 0.5
   *
   * @param session Session to score
   * @returns Score 0-1
   */
  private calculateRecencyScore(session: Session): number {
    const startDate = new Date(session.startDate);
    const today = new Date();
    const daysUntilStart = Math.max(
      0,
      (startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Exponential decay with 7-day half-life
    const HALF_LIFE_DAYS = 7;
    const score = Math.exp(-daysUntilStart / HALF_LIFE_DAYS);

    return Math.min(1, score);
  }

  /**
   * Calculate proximity score based on distance to user
   * Closer sessions have higher scores
   *
   * Uses inverse distance: score = 1 / (1 + distance)
   * Normalized so 0 miles = 1.0, 10 miles = 0.5, etc.
   *
   * @param session Session to score
   * @param filters Search filters (contains origin)
   * @returns Score 0-1, or 0 if no origin provided
   */
  private calculateProximityScore(
    session: Session,
    filters: SearchFilters,
    cityConfig: CityConfig,
    locationCoordinates?: Map<string, Coordinates>
  ): number {
    if (!filters.origin) {
      return 0.5; // Neutral score if no location provided
    }

    const distance = this.calculateHaversineDistance(
      filters.origin,
      this.getSessionLocation(session, cityConfig, locationCoordinates)
    );

    // Inverse distance function
    const score = 1 / (1 + distance);
    return Math.min(1, score);
  }

  /**
   * Calculate availability score based on open spots
   * Sessions with more spots available score higher
   *
   * Uses sigmoid function to normalize: score = 1 / (1 + e^(-spots))
   *
   * @param session Session to score
   * @returns Score 0-1
   */
  private calculateAvailabilityScore(session: Session): number {
    // No availability data means neutral score
    if (session.availableSpots === undefined) {
      return 0.5;
    }

    // Sigmoid function: higher for more spots, lower for fewer
    const openSpots = session.availableSpots;
    const score = 1 / (1 + Math.exp(-openSpots / 5));

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Calculate quality score based on provider verification
   * Verified providers with good data quality score higher
   *
   * @param session Session to score
   * @returns Score 0-1
   */
  private calculateQualityScore(session: Session): number {
    let score = 0.5; // Base score

    // Would need to fetch provider to check verification status
    // For now, use confidence level as proxy
    if (session.confidence === 'high') {
      score = 0.9;
    } else if (session.confidence === 'medium') {
      score = 0.7;
    } else if (session.confidence === 'low') {
      score = 0.4;
    }

    return score;
  }

  /**
   * Calculate haversine distance between two coordinates
   * Used for proximity filtering and scoring
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

  /**
   * Sort sessions by user preference
   *
   * @param sessions Scored sessions
   * @param sort Sort field and direction
   * @returns Sorted sessions
   */
  private sortSessions(
    sessions: ScoredSession[],
    sort: SortOptions,
    origin: Coordinates | undefined,
    cityConfig: CityConfig,
    locationCoordinates?: Map<string, Coordinates>
  ): ScoredSession[] {
    const sorted = [...sessions];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (sort.field) {
        case 'distance': {
          if (!origin) {
            comparison = b.score - a.score;
            break;
          }

          const distanceA = this.calculateHaversineDistance(
            origin,
            this.getSessionLocation(a.session, cityConfig, locationCoordinates)
          );
          const distanceB = this.calculateHaversineDistance(
            origin,
            this.getSessionLocation(b.session, cityConfig, locationCoordinates)
          );
          comparison = distanceA - distanceB;
          break;
        }

        case 'startDate':
          const dateA = new Date(a.session.startDate).getTime();
          const dateB = new Date(b.session.startDate).getTime();
          comparison = dateA - dateB;
          break;

        case 'price':
          const priceA = a.session.price?.amount ?? 0;
          const priceB = b.session.price?.amount ?? 0;
          comparison = priceA - priceB;
          break;

        case 'availability':
          const availA = a.session.availableSpots ?? 0;
          const availB = b.session.availableSpots ?? 0;
          comparison = availB - availA; // Higher availability first
          break;

        default:
          // Default: rely on score from ranking
          comparison = b.score - a.score;
      }

      // Apply sort direction
      return sort.direction === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }

  /**
   * Apply no-results fallback with progressive constraint relaxation
   *
   * When search returns no results, progressively relax constraints:
   * 1. Expand search radius (2mi → 5mi → 10mi)
   * 2. Relax day constraints (show adjacent days if requested specific days)
   * 3. Relax time constraints (expand requested window +/- 1 hour)
   *
   * Retries search after each relaxation until results found
   *
   * @param filters Original search filters
   * @param cityConfig City configuration
   * @returns Scored sessions and flag indicating if relaxation was applied
   */
  private async applyNoResultsFallback(
    filters: SearchFilters,
    cityConfig: CityConfig
  ): Promise<{ scoredSessions: ScoredSession[]; relaxationApplied: boolean }> {
    const fallbackConfig = cityConfig.searchProfile.noResultsFallback;
    const radiusExpansions = fallbackConfig.expandRadiusMiles || [2, 5, 10];

    // Try progressive relaxation strategies
    // Strategy 1: Expand radius (if geography filter was applied)
    if (filters.origin && filters.maxTravelMinutes) {
      for (const expandedRadius of radiusExpansions) {
        const relaxedFilters: SearchFilters = {
          ...filters,
          maxTravelMinutes: Math.ceil(expandedRadius * 10), // Convert miles to minutes (rough)
        };

        const sessions = await this.querySessions(relaxedFilters, cityConfig);
        const locationCoordinates = await this.loadLocationCoordinates(
          sessions,
          filters.cityId,
          cityConfig.defaultCenter
        );
        const filtered = this.applyBusinessFilters(
          sessions,
          relaxedFilters,
          cityConfig,
          locationCoordinates
        );

        if (filtered.length > 0) {
          const scored = await this.scoreAndRankWithLocationContext(
            filtered,
            filters,
            cityConfig,
            locationCoordinates
          );
          return { scoredSessions: scored, relaxationApplied: true };
        }
      }
    }

    // Strategy 2: Relax day constraints
    if (fallbackConfig.relaxDayConstraints && filters.daysOfWeek && filters.daysOfWeek.length > 0) {
      const relaxedDays = this.expandDayConstraints(filters.daysOfWeek);
      const relaxedFilters: SearchFilters = {
        ...filters,
        daysOfWeek: relaxedDays,
      };

      const sessions = await this.querySessions(relaxedFilters, cityConfig);
      const locationCoordinates = await this.loadLocationCoordinates(
        sessions,
        filters.cityId,
        cityConfig.defaultCenter
      );
      const filtered = this.applyBusinessFilters(
        sessions,
        relaxedFilters,
        cityConfig,
        locationCoordinates
      );

      if (filtered.length > 0) {
        const scored = await this.scoreAndRankWithLocationContext(
          filtered,
          filters,
          cityConfig,
          locationCoordinates
        );
        return { scoredSessions: scored, relaxationApplied: true };
      }
    }

    // Strategy 3: Relax time constraints
    if (fallbackConfig.relaxTimeConstraints && filters.timeWindow) {
      const relaxedWindow = this.expandTimeWindow(filters.timeWindow);
      const relaxedFilters: SearchFilters = {
        ...filters,
        timeWindow: relaxedWindow,
      };

      const sessions = await this.querySessions(relaxedFilters, cityConfig);
      const locationCoordinates = await this.loadLocationCoordinates(
        sessions,
        filters.cityId,
        cityConfig.defaultCenter
      );
      const filtered = this.applyBusinessFilters(
        sessions,
        relaxedFilters,
        cityConfig,
        locationCoordinates
      );

      if (filtered.length > 0) {
        const scored = await this.scoreAndRankWithLocationContext(
          filtered,
          filters,
          cityConfig,
          locationCoordinates
        );
        return { scoredSessions: scored, relaxationApplied: true };
      }
    }

    // No results even after relaxation
    return { scoredSessions: [], relaxationApplied: false };
  }

  /**
   * Expand day constraints to include adjacent days
   * For example, if user requested Monday/Wednesday, also include Sunday/Tuesday/Thursday
   *
   * @param daysOfWeek Original days [0-6]
   * @returns Expanded days including adjacent days
   */
  private expandDayConstraints(daysOfWeek: number[]): number[] {
    const expanded = new Set(daysOfWeek);

    daysOfWeek.forEach((day) => {
      // Add day before
      expanded.add((day - 1 + 7) % 7);
      // Add day after
      expanded.add((day + 1) % 7);
    });

    return Array.from(expanded).sort();
  }

  /**
   * Expand time window by +/- 1 hour
   *
   * @param window Original time window
   * @returns Expanded time window
   */
  private expandTimeWindow(window: TimeWindow): TimeWindow {
    const earliestMinutes = Math.max(0, this.timeToMinutes(window.earliest) - 60);
    const latestMinutes = Math.min(24 * 60 - 1, this.timeToMinutes(window.latest) + 60);

    return {
      earliest: this.minutesToTime(earliestMinutes),
      latest: this.minutesToTime(latestMinutes),
    };
  }

  /**
   * Convert time string "HH:MM" to minutes since midnight
   *
   * @param time Time string "HH:MM"
   * @returns Minutes since midnight
   */
  private timeToMinutes(time: string): number {
    const parts = time.split(':').map(Number);
    const hours = parts[0] ?? 0;
    const minutes = parts[1] ?? 0;
    return hours * 60 + minutes;
  }

  /**
   * Convert minutes since midnight to time string "HH:MM"
   *
   * @param minutes Minutes since midnight
   * @returns Time string "HH:MM"
   */
  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  private async loadLocationCoordinates(
    sessions: Session[],
    cityId: string,
    defaultCenter: Coordinates
  ): Promise<Map<string, Coordinates>> {
    const locationCoordinates = new Map<string, Coordinates>();
    const uniqueLocationIds = Array.from(new Set(sessions.map((session) => session.locationId)));

    const locations = await Promise.all(
      uniqueLocationIds.map((locationId) =>
        this.sessionRepository.getLocationById(locationId, cityId)
      )
    );

    locations.forEach((location, index) => {
      const locationId = uniqueLocationIds[index];
      if (!locationId) {
        return;
      }

      locationCoordinates.set(locationId, location?.coordinates || defaultCenter);
    });

    return locationCoordinates;
  }
}
