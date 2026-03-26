/**
 * City Stats API Endpoint - GET /api/operator/cities/{cityId}/stats
 *
 * Read-only operator surface for telemetry-backed city health and funnel metrics.
 * This is intentionally protected with Function auth instead of being anonymous.
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import {
  ApiErrorCode,
  ApiResponseBuilder,
  CityStatsResponse,
} from '@core/contracts/api-contracts';
import { getDependencies } from '../dependency-injection';
import { isAppError } from '@core/errors/app-errors';
import { buildCityStats, StoredTelemetryEvent } from './city-stats-helpers';

const DEFAULT_STATS_WINDOW_DAYS = 30;
const DAILY_ACTIVE_WINDOW_HOURS = 24;
const TELEMETRY_QUERY_LIMIT = 5000;

export async function cityStats(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const startTime = Date.now();
  const requestId = context.invocationId;
  const cityId = req.params.cityId;

  context.log(`[${requestId}] City stats request started for cityId=${cityId}`);

  try {
    if (!cityId) {
      return {
        status: 400,
        jsonBody: ApiResponseBuilder.error(
          ApiErrorCode.VALIDATION_ERROR,
          'cityId route parameter is required'
        ),
      };
    }

    const endDate = parseOptionalIsoDate(req.query.get('endDate')) || new Date();
    const startDate =
      parseOptionalIsoDate(req.query.get('startDate')) ||
      new Date(endDate.getTime() - DEFAULT_STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return {
        status: 400,
        jsonBody: ApiResponseBuilder.error(
          ApiErrorCode.VALIDATION_ERROR,
          'startDate and endDate must be valid ISO timestamps'
        ),
      };
    }

    if (startDate > endDate) {
      return {
        status: 400,
        jsonBody: ApiResponseBuilder.error(
          ApiErrorCode.VALIDATION_ERROR,
          'startDate must be before or equal to endDate'
        ),
      };
    }

    const { cityConfigService, sessionRepository, eventRepository } = await getDependencies();
    const cityConfig = await cityConfigService.getCityConfig(cityId);

    if (!cityConfig) {
      return {
        status: 404,
        jsonBody: ApiResponseBuilder.error(
          ApiErrorCode.CITY_NOT_FOUND,
          `City '${cityId}' not found`
        ),
      };
    }

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const dailyActiveStartIso = new Date(
      endDate.getTime() - DAILY_ACTIVE_WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString();

    const [providers, locations, programs, sessions, eventCounts, windowEvents, dailyActiveEvents] =
      await Promise.all([
        sessionRepository.listProviders(cityId),
        sessionRepository.listLocations(cityId),
        sessionRepository.listPrograms(cityId),
        sessionRepository.querySessions(cityId, {}, TELEMETRY_QUERY_LIMIT),
        eventRepository.getEventCounts(cityId, startIso, endIso),
        eventRepository.queryEvents(cityId, { startDate: startIso, endDate: endIso }, TELEMETRY_QUERY_LIMIT),
        eventRepository.queryEvents(
          cityId,
          { startDate: dailyActiveStartIso, endDate: endIso },
          TELEMETRY_QUERY_LIMIT
        ),
      ]);

    const response: CityStatsResponse = {
      cityId,
      stats: buildCityStats({
        cityUpdatedAt: cityConfig.updatedAt || cityConfig.onboardedAt,
        providers,
        locations,
        programs,
        sessions,
        windowEvents: windowEvents as StoredTelemetryEvent[],
        dailyActiveEvents: dailyActiveEvents as StoredTelemetryEvent[],
        eventCounts,
      }),
    };

    const executionTimeMs = Date.now() - startTime;
    context.log(
      `[${requestId}] City stats completed for cityId=${cityId} in ${executionTimeMs}ms`
    );

    return {
      status: 200,
      jsonBody: ApiResponseBuilder.success(response, {
        requestId,
        executionTimeMs,
      }),
    };
  } catch (error) {
    if (isAppError(error)) {
      return {
        status: error.statusCode,
        jsonBody: ApiResponseBuilder.error(error.code, error.message, error.details),
      };
    }

    context.log(`[${requestId}] Unexpected city stats error`, error);
    return {
      status: 500,
      jsonBody: ApiResponseBuilder.error(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'An unexpected error occurred while fetching city stats'
      ),
    };
  }
}

function parseOptionalIsoDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(Number.NaN) : parsed;
}

app.http('operator-city-stats', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'operator/cities/{cityId}/stats',
  handler: cityStats,
});
