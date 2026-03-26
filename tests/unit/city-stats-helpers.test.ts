import { describe, expect, it } from 'vitest';
import { buildCityStats, type StoredTelemetryEvent } from '../../src/functions/admin-api/city-stats-helpers';
import type { Location, Program, Provider, Session } from '../../src/core/models/canonical-schema';

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: overrides.id || 'provider-1',
    cityId: 'nyc',
    type: 'ProviderDocument',
    name: 'Provider',
    providerType: 'public',
    verified: true,
    confidence: 'high',
    sourceSystem: 'test',
    createdAt: '2026-03-26T10:00:00.000Z',
    updatedAt: '2026-03-26T10:00:00.000Z',
    ...overrides,
  };
}

function createLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: overrides.id || 'location-1',
    cityId: 'nyc',
    type: 'LocationDocument',
    providerId: 'provider-1',
    name: 'Pool',
    address: {
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      geographyId: 'manhattan',
    },
    coordinates: {
      latitude: 40.75,
      longitude: -73.99,
    },
    facilityType: 'indoor',
    confidence: 'medium',
    sourceSystem: 'test',
    createdAt: '2026-03-26T10:00:00.000Z',
    updatedAt: '2026-03-26T10:00:00.000Z',
    ...overrides,
  };
}

function createProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: overrides.id || 'program-1',
    cityId: 'nyc',
    type: 'ProgramDocument',
    providerId: 'provider-1',
    locationId: 'location-1',
    name: 'Beginner Swim',
    skillLevel: 'beginner',
    sessionLengthMinutes: 45,
    totalSessions: 8,
    cadence: 'weekly',
    confidence: 'low',
    sourceSystem: 'test',
    createdAt: '2026-03-26T10:00:00.000Z',
    updatedAt: '2026-03-26T10:00:00.000Z',
    ...overrides,
  };
}

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: overrides.id || 'session-1',
    cityId: 'nyc',
    type: 'SessionDocument',
    programId: 'program-1',
    providerId: 'provider-1',
    locationId: 'location-1',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    daysOfWeek: [2],
    timeOfDay: {
      start: '17:00',
      end: '17:45',
    },
    registrationOpen: true,
    registrationUrl: 'https://example.test/signup',
    searchTerms: 'swim',
    geographyIds: ['manhattan'],
    confidence: 'unknown',
    sourceSystem: 'test',
    lastSyncedAt: '2026-03-26T12:00:00.000Z',
    createdAt: '2026-03-26T10:00:00.000Z',
    updatedAt: '2026-03-26T12:00:00.000Z',
    ...overrides,
  };
}

function createEvent(
  eventName: string,
  sessionId: string,
  properties: Record<string, unknown> = {},
  overrides: Partial<StoredTelemetryEvent> = {}
): StoredTelemetryEvent {
  return {
    eventName,
    timestamp: '2026-03-26T12:00:00.000Z',
    sessionId,
    cityId: 'nyc',
    platform: 'web',
    properties,
    ...overrides,
  };
}

describe('buildCityStats', () => {
  it('aggregates operator stats from telemetry and content counts', () => {
    const stats = buildCityStats({
      cityUpdatedAt: '2026-03-26T09:00:00.000Z',
      providers: [createProvider()],
      locations: [createLocation()],
      programs: [createProgram()],
      sessions: [
        createSession(),
        createSession({
          id: 'session-2',
          registrationOpen: false,
          confidence: 'high',
          lastSyncedAt: '2026-03-25T12:00:00.000Z',
        }),
      ],
      eventCounts: new Map<string, number>([
        ['SearchStarted', 4],
        ['SignupClicked', 1],
        ['NoResults', 1],
        ['Error', 1],
      ]),
      windowEvents: [
        createEvent('SearchResultsReturned', 'session-a', {
          resultCount: 10,
          executionTimeMs: 100,
          relaxationApplied: false,
        }),
        createEvent('SearchResultsReturned', 'session-b', {
          resultCount: 4,
          executionTimeMs: 200,
          relaxationApplied: true,
        }),
        createEvent('NoResults', 'session-c', {
          relaxationAttempted: true,
          relaxationSucceeded: false,
        }),
      ],
      dailyActiveEvents: [
        createEvent('PageLoaded', 'browser-1'),
        createEvent('SearchStarted', 'browser-2'),
        createEvent('SearchStarted', 'browser-2'),
      ],
    });

    expect(stats.totalProviders).toBe(1);
    expect(stats.totalLocations).toBe(1);
    expect(stats.totalSessions).toBe(2);
    expect(stats.activeSessionsCount).toBe(1);
    expect(stats.dataConfidence).toEqual({
      high: 2,
      medium: 1,
      low: 2,
    });
    expect(stats.dailyActiveUsers).toBe(2);
    expect(stats.totalSearches).toBe(4);
    expect(stats.totalSignupClicks).toBe(1);
    expect(stats.conversionRate).toBe(0.25);
    expect(stats.avgResultsPerSearch).toBe(7);
    expect(stats.noResultsRate).toBe(0.25);
    expect(stats.relaxationSuccessRate).toBe(0.5);
    expect(stats.avgSearchLatencyMs).toBe(150);
    expect(stats.p95SearchLatencyMs).toBe(200);
    expect(stats.errorRate).toBe(0.25);
    expect(stats.lastSyncAt).toBe('2026-03-26T12:00:00.000Z');
    expect(stats.lastSyncStatus).toBe('success');
    expect(stats.lastSyncRecordsUpdated).toBe(1);
  });
});
