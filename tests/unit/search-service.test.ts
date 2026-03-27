import { describe, expect, it, vi } from 'vitest';
import { SearchService } from '../../src/services/search/search-service';
import type { CityConfig, SearchFilters } from '../../src/core/contracts/city-config';
import type { Program, Provider, Session, Location } from '../../src/core/models/canonical-schema';

function createCityConfig(): CityConfig {
  return {
    cityId: 'nyc',
    displayName: 'New York City',
    timezone: 'America/New_York',
    locale: 'en-US',
    geographies: [],
    defaultCenter: {
      latitude: 40.758,
      longitude: -73.9855,
    },
    defaultZoomLevel: 11,
    transitModes: [],
    adapterConfig: {
      type: 'test',
      syncSchedule: '0 0 * * *',
      confidence: 'medium',
    },
    registrationPatterns: [],
    searchProfile: {
      defaultSort: 'distance',
      rankingWeights: {
        recency: 0.25,
        proximity: 0.25,
        availability: 0.25,
        quality: 0.25,
      },
      noResultsFallback: {
        expandRadiusMiles: [2, 5, 10],
        relaxDayConstraints: true,
        relaxTimeConstraints: true,
      },
    },
    features: {
      transitETA: true,
      providerSelfServe: false,
    },
    status: 'active',
    onboardedAt: '2026-03-26T00:00:00.000Z',
    updatedAt: '2026-03-26T00:00:00.000Z',
  };
}

function createSession(overrides: Partial<Session>): Session {
  return {
    id: overrides.id || 'session-1',
    cityId: 'nyc',
    type: 'SessionDocument',
    programId: overrides.programId || 'program-1',
    providerId: overrides.providerId || 'provider-1',
    locationId: overrides.locationId || 'location-1',
    startDate: overrides.startDate || '2026-06-15',
    endDate: overrides.endDate || '2026-08-10',
    daysOfWeek: overrides.daysOfWeek || [1, 3, 5],
    timeOfDay: overrides.timeOfDay || { start: '17:00', end: '18:00' },
    capacity: overrides.capacity,
    enrolled: overrides.enrolled,
    availableSpots: overrides.availableSpots ?? 8,
    registrationOpen: overrides.registrationOpen ?? true,
    registrationUrl: overrides.registrationUrl || 'https://example.test/signup',
    price: overrides.price || { amount: 75, currency: 'USD' },
    searchTerms: overrides.searchTerms || 'swim',
    geographyIds: overrides.geographyIds || ['manhattan'],
    confidence: overrides.confidence || 'medium',
    sourceSystem: overrides.sourceSystem || 'test',
    lastSyncedAt: overrides.lastSyncedAt || '2026-03-26T00:00:00.000Z',
    createdAt: overrides.createdAt || '2026-03-26T00:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-03-26T00:00:00.000Z',
  };
}

function createProgram(overrides: Partial<Program>): Program {
  return {
    id: overrides.id || 'program-1',
    cityId: 'nyc',
    type: 'ProgramDocument',
    providerId: overrides.providerId || 'provider-1',
    locationId: overrides.locationId || 'location-1',
    name: overrides.name || 'Program',
    description: overrides.description,
    ageMin: overrides.ageMin,
    ageMax: overrides.ageMax,
    skillLevel: overrides.skillLevel || 'beginner',
    prerequisites: overrides.prerequisites,
    sessionLengthMinutes: overrides.sessionLengthMinutes || 60,
    totalSessions: overrides.totalSessions || 8,
    cadence: overrides.cadence || 'weekly',
    priceRange: overrides.priceRange,
    confidence: overrides.confidence || 'medium',
    sourceSystem: overrides.sourceSystem || 'test',
    createdAt: overrides.createdAt || '2026-03-26T00:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-03-26T00:00:00.000Z',
  };
}

function createProvider(overrides: Partial<Provider>): Provider {
  return {
    id: overrides.id || 'provider-1',
    cityId: 'nyc',
    type: 'ProviderDocument',
    name: overrides.name || 'Provider',
    description: overrides.description,
    logoUrl: overrides.logoUrl,
    website: overrides.website,
    phone: overrides.phone,
    email: overrides.email,
    providerType: overrides.providerType || 'public',
    verified: overrides.verified ?? true,
    confidence: overrides.confidence || 'medium',
    sourceSystem: overrides.sourceSystem || 'test',
    createdAt: overrides.createdAt || '2026-03-26T00:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-03-26T00:00:00.000Z',
  };
}

function createLocation(overrides: Partial<Location>): Location {
  return {
    id: overrides.id || 'location-1',
    cityId: 'nyc',
    type: 'LocationDocument',
    providerId: overrides.providerId || 'provider-1',
    name: overrides.name || 'Pool',
    address: overrides.address || {
      street: '123 Test St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      geographyId: 'manhattan',
    },
    coordinates: overrides.coordinates || {
      latitude: 40.758,
      longitude: -73.9855,
    },
    facilityType: overrides.facilityType || 'indoor',
    confidence: overrides.confidence || 'medium',
    sourceSystem: overrides.sourceSystem || 'test',
    createdAt: overrides.createdAt || '2026-03-26T00:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-03-26T00:00:00.000Z',
  };
}

function createSessionRepository({
  sessions,
  programs,
  providers,
  locations,
}: {
  sessions: Session[];
  programs: Map<string, Program>;
  providers: Map<string, Provider>;
  locations: Map<string, Location>;
}) {
  return {
    getSessionById: vi.fn(),
    querySessions: vi.fn().mockResolvedValue(sessions),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
    batchUpsertSessions: vi.fn(),
    getProviderById: vi
      .fn()
      .mockImplementation(async (providerId: string) => providers.get(providerId) || null),
    listProviders: vi.fn(),
    createProvider: vi.fn(),
    updateProvider: vi.fn(),
    deleteProvider: vi.fn(),
    getLocationById: vi
      .fn()
      .mockImplementation(async (locationId: string) => locations.get(locationId) || null),
    listLocations: vi.fn(),
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    deleteLocation: vi.fn(),
    getProgramById: vi
      .fn()
      .mockImplementation(async (programId: string) => programs.get(programId) || null),
    listPrograms: vi.fn(),
    createProgram: vi.fn(),
    updateProgram: vi.fn(),
    deleteProgram: vi.fn(),
  } as any;
}

describe('SearchService', () => {
  it('filters sessions by real program age eligibility', async () => {
    const cityConfig = createCityConfig();
    const sessions = [
      createSession({ id: 'session-beginner', programId: 'program-beginner' }),
      createSession({
        id: 'session-teen',
        programId: 'program-teen',
        startDate: '2026-06-16',
      }),
    ];
    const sessionRepository = createSessionRepository({
      sessions,
      programs: new Map<string, Program>([
        ['program-beginner', createProgram({ id: 'program-beginner', ageMin: 48, ageMax: 84 })],
        ['program-teen', createProgram({ id: 'program-teen', ageMin: 108, ageMax: 168 })],
      ]),
      providers: new Map<string, Provider>([
        ['provider-1', createProvider({ id: 'provider-1', verified: true })],
      ]),
      locations: new Map<string, Location>([
        ['location-1', createLocation({ id: 'location-1' })],
      ]),
    });
    const cityConfigService = {
      getCityConfig: vi.fn().mockResolvedValue(cityConfig),
    } as any;
    const service = new SearchService(sessionRepository, cityConfigService);

    const results = await service.search(
      { cityId: 'nyc', childAge: 60 },
      { field: 'distance', direction: 'asc' },
      { skip: 0, take: 20 }
    );

    expect(results.results.map((session) => session.id)).toEqual(['session-beginner']);
  });

  it('ranks higher-quality sessions above weaker provider/program combinations', async () => {
    const cityConfig = createCityConfig();
    const sessions = [
      createSession({
        id: 'session-verified',
        programId: 'program-verified',
        providerId: 'provider-verified',
        locationId: 'location-verified',
      }),
      createSession({
        id: 'session-unverified',
        programId: 'program-unverified',
        providerId: 'provider-unverified',
        locationId: 'location-unverified',
      }),
    ];
    const sessionRepository = createSessionRepository({
      sessions,
      programs: new Map<string, Program>([
        [
          'program-verified',
          createProgram({
            id: 'program-verified',
            providerId: 'provider-verified',
            locationId: 'location-verified',
            confidence: 'high',
          }),
        ],
        [
          'program-unverified',
          createProgram({
            id: 'program-unverified',
            providerId: 'provider-unverified',
            locationId: 'location-unverified',
            confidence: 'low',
          }),
        ],
      ]),
      providers: new Map<string, Provider>([
        [
          'provider-verified',
          createProvider({ id: 'provider-verified', verified: true, confidence: 'high' }),
        ],
        [
          'provider-unverified',
          createProvider({ id: 'provider-unverified', verified: false, confidence: 'low' }),
        ],
      ]),
      locations: new Map<string, Location>([
        ['location-verified', createLocation({ id: 'location-verified' })],
        ['location-unverified', createLocation({ id: 'location-unverified' })],
      ]),
    });
    const cityConfigService = {
      getCityConfig: vi.fn().mockResolvedValue(cityConfig),
    } as any;
    const service = new SearchService(sessionRepository, cityConfigService);

    const scored = await service.scoreAndRank(
      sessions,
      { cityId: 'nyc' } as SearchFilters,
      cityConfig
    );

    expect(scored.map((item) => item.session.id)).toEqual([
      'session-verified',
      'session-unverified',
    ]);
    expect(scored[0]?.score).toBeGreaterThan(scored[1]?.score || 0);
  });
});
