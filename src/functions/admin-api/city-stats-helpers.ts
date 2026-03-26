import type { CityStatsResponse } from '../../core/contracts/api-contracts';
import type { DataConfidenceLevel } from '../../core/contracts/city-config';
import type { Location, Program, Provider, Session } from '../../core/models/canonical-schema';
import type { TelemetryEvent } from '../../core/contracts/services';

export type StoredTelemetryEvent = TelemetryEvent &
  Record<string, unknown> & {
    properties?: Record<string, unknown>;
  };

export interface BuildCityStatsInput {
  cityUpdatedAt: string;
  providers: Provider[];
  locations: Location[];
  programs: Program[];
  sessions: Session[];
  windowEvents: StoredTelemetryEvent[];
  dailyActiveEvents: StoredTelemetryEvent[];
  eventCounts: Map<string, number>;
}

export function buildCityStats(input: BuildCityStatsInput): CityStatsResponse['stats'] {
  const searchCount = input.eventCounts.get('SearchStarted') ?? 0;
  const signupClickCount = input.eventCounts.get('SignupClicked') ?? 0;
  const noResultsCount = input.eventCounts.get('NoResults') ?? 0;
  const errorCount = input.eventCounts.get('Error') ?? 0;

  const searchResultEvents = input.windowEvents.filter(
    (event) => event.eventName === 'SearchResultsReturned'
  );
  const executionTimes = searchResultEvents
    .map((event) => readNumberProperty(event, 'executionTimeMs'))
    .filter((value): value is number => value !== null);
  const resultCounts = searchResultEvents
    .map((event) => readNumberProperty(event, 'resultCount'))
    .filter((value): value is number => value !== null);
  const relaxationAppliedCount = searchResultEvents.filter((event) =>
    readBooleanProperty(event, 'relaxationApplied')
  ).length;
  const attemptedRelaxationsFromNoResults = input.windowEvents.filter(
    (event) =>
      event.eventName === 'NoResults' && readBooleanProperty(event, 'relaxationAttempted')
  ).length;
  const succeededRelaxationsFromNoResults = input.windowEvents.filter(
    (event) =>
      event.eventName === 'NoResults' && readBooleanProperty(event, 'relaxationSucceeded')
  ).length;
  const relaxationAttemptCount = attemptedRelaxationsFromNoResults + relaxationAppliedCount;
  const relaxationSuccessCount = succeededRelaxationsFromNoResults + relaxationAppliedCount;

  const allConfidenceValues = [
    ...input.providers.map((provider) => provider.confidence),
    ...input.locations.map((location) => location.confidence),
    ...input.programs.map((program) => program.confidence),
    ...input.sessions.map((session) => session.confidence),
  ];

  const latestSyncAt = input.sessions.reduce((latest, session) => {
    if (!session.lastSyncedAt) {
      return latest;
    }

    return !latest || session.lastSyncedAt > latest ? session.lastSyncedAt : latest;
  }, '');

  const todayIsoDate = new Date().toISOString().slice(0, 10);
  const activeSessionsCount = input.sessions.filter(
    (session) => session.registrationOpen && session.endDate >= todayIsoDate
  ).length;
  const dailyActiveUsers = countUniqueActors(input.dailyActiveEvents);
  const avgResultsPerSearch = average(resultCounts);
  const avgSearchLatencyMs = average(executionTimes);
  const p95SearchLatencyMs = percentile(executionTimes, 0.95);

  return {
    totalProviders: input.providers.length,
    totalLocations: input.locations.length,
    totalSessions: input.sessions.length,
    activeSessionsCount,
    dataConfidence: {
      high: countConfidence(allConfidenceValues, 'high'),
      medium: countConfidence(allConfidenceValues, 'medium'),
      low: countLowConfidence(allConfidenceValues),
    },
    dailyActiveUsers,
    totalSearches: searchCount,
    totalSignupClicks: signupClickCount,
    conversionRate: ratio(signupClickCount, searchCount),
    avgResultsPerSearch,
    noResultsRate: ratio(noResultsCount, searchCount),
    relaxationSuccessRate: ratio(relaxationSuccessCount, relaxationAttemptCount),
    avgSearchLatencyMs,
    p95SearchLatencyMs,
    errorRate: ratio(errorCount, searchCount),
    lastSyncAt: latestSyncAt || input.cityUpdatedAt,
    lastSyncStatus: input.sessions.length > 0 ? 'success' : 'failed',
    lastSyncRecordsUpdated: latestSyncAt
      ? input.sessions.filter((session) => session.lastSyncedAt === latestSyncAt).length
      : 0,
  };
}

function countUniqueActors(events: StoredTelemetryEvent[]): number {
  const uniqueActors = new Set<string>();

  for (const event of events) {
    const actorId = nonEmptyString(event.userId) || nonEmptyString(event.sessionId);
    if (actorId) {
      uniqueActors.add(actorId);
    }
  }

  return uniqueActors.size;
}

function countConfidence(
  confidenceValues: Array<DataConfidenceLevel | undefined>,
  target: Extract<DataConfidenceLevel, 'high' | 'medium'>
): number {
  return confidenceValues.filter((value) => value === target).length;
}

function countLowConfidence(confidenceValues: Array<DataConfidenceLevel | undefined>): number {
  return confidenceValues.filter((value) => value === 'low' || value === 'unknown').length;
}

function readNumberProperty(event: StoredTelemetryEvent, key: string): number | null {
  const rawValue = readEventProperty(event, key);

  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string' && rawValue.trim()) {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readBooleanProperty(event: StoredTelemetryEvent, key: string): boolean {
  const rawValue = readEventProperty(event, key);

  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    return rawValue.toLowerCase() === 'true';
  }

  return false;
}

function readEventProperty(event: StoredTelemetryEvent, key: string): unknown {
  const properties = isRecord(event.properties) ? event.properties : null;
  if (properties && key in properties) {
    return properties[key];
  }

  return event[key];
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return roundToTwo(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values: number[], targetPercentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * targetPercentile) - 1);
  return roundToTwo(sorted[index] || 0);
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return roundToTwo(numerator / denominator);
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
