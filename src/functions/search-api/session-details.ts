/**
 * Session Details API Endpoint - GET /api/sessions/:sessionId
 *
 * Get detailed information about a specific session
 * Includes related sessions and computed travel time information
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import {
  SessionDetailsResponse,
  ApiResponse,
  ApiResponseBuilder,
  ApiErrorCode,
} from '@core/contracts/api-contracts';
import { Coordinates } from '@core/contracts/city-config';
import { getDependencies } from '../dependency-injection';
import { AppError, isAppError, SessionNotFoundError } from '@core/errors/app-errors';
import {
  estimatePreferredTransitTime,
  getRoutingOrigin,
  getSessionDepartureTime,
} from './transit-helpers';

/**
 * Session details endpoint handler
 * GET /api/sessions/{sessionId}
 *
 * Query parameters:
 * - sessionId (required): Session ID
 * - cityId (required): City ID
 * - origin (optional): User coordinates for travel time calculation {latitude, longitude}
 *
 * Response: ApiResponse<SessionDetailsResponse>
 */
export async function sessionDetails(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const startTime = Date.now();
  const requestId = context.invocationId;

  context.log(`[${requestId}] Session details request started`);

  try {
    // Extract route parameters and query parameters
    const sessionId = req.params.sessionId;
    const cityId = req.query.get('cityId');
    const originQuery = req.query.get('origin');

    // Validate required parameters
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      context.log(`[${requestId}] Missing or invalid sessionId`);
      const errorResponse = ApiResponseBuilder.error(
        ApiErrorCode.VALIDATION_ERROR,
        'sessionId is required and must be a non-empty string'
      );
      return {
        status: 400,
        jsonBody: errorResponse,
      };
    }

    if (!cityId || typeof cityId !== 'string' || !cityId.trim()) {
      context.log(`[${requestId}] Missing or invalid cityId`);
      const errorResponse = ApiResponseBuilder.error(
        ApiErrorCode.VALIDATION_ERROR,
        'cityId is required and must be a non-empty string'
      );
      return {
        status: 400,
        jsonBody: errorResponse,
      };
    }

    // Parse optional origin parameter
    let origin: Coordinates | undefined;
    if (originQuery) {
      try {
        const originObj = JSON.parse(originQuery);
        if (
          typeof originObj.latitude === 'number' &&
          typeof originObj.longitude === 'number'
        ) {
          origin = originObj;
        } else {
          context.log(`[${requestId}] Invalid origin format`);
          const errorResponse = ApiResponseBuilder.error(
            ApiErrorCode.VALIDATION_ERROR,
            'origin must be a valid Coordinates object with latitude and longitude'
          );
          return {
            status: 400,
            jsonBody: errorResponse,
          };
        }
      } catch (parseError) {
        context.log(`[${requestId}] Failed to parse origin parameter`, parseError);
        const errorResponse = ApiResponseBuilder.error(
          ApiErrorCode.VALIDATION_ERROR,
          'origin must be a valid JSON object'
        );
        return {
          status: 400,
          jsonBody: errorResponse,
        };
      }
    }

    context.log(
      `[${requestId}] Fetching session details: sessionId=${sessionId}, cityId=${cityId}`
    );

    // Get dependencies
    const { searchService, sessionRepository, cityConfigService, transitService } =
      await getDependencies();
    const cityConfig = await cityConfigService.getCityConfig(cityId);
    if (!cityConfig) {
      const errorResponse = ApiResponseBuilder.error(
        ApiErrorCode.CITY_NOT_FOUND,
        `City '${cityId}' not found`
      );
      return {
        status: 404,
        jsonBody: errorResponse,
      };
    }

    // Fetch session
    const session = await searchService.getSessionById(sessionId, cityId);
    if (!session) {
      context.log(`[${requestId}] Session not found: ${sessionId} in city ${cityId}`);
      const errorResponse = ApiResponseBuilder.error(
        ApiErrorCode.SESSION_NOT_FOUND,
        `Session '${sessionId}' not found in city '${cityId}'`
      );
      return {
        status: 404,
        jsonBody: errorResponse,
      };
    }

    // Fetch related entities
    const provider = await sessionRepository.getProviderById(session.providerId, cityId);
    const location = await sessionRepository.getLocationById(session.locationId, cityId);
    const program = await sessionRepository.getProgramById(session.programId, cityId);

    // Handle missing related entities
    if (!provider) {
      context.log(
        `[${requestId}] Provider not found: ${session.providerId} in city ${cityId}`
      );
      const errorResponse = ApiResponseBuilder.error(
        ApiErrorCode.PROVIDER_NOT_FOUND,
        `Provider for session '${sessionId}' not found`
      );
      return {
        status: 404,
        jsonBody: errorResponse,
      };
    }

    if (!location) {
      context.log(
        `[${requestId}] Location not found: ${session.locationId} in city ${cityId}`
      );
      const errorResponse = ApiResponseBuilder.error(
        ApiErrorCode.NOT_FOUND,
        `Location for session '${sessionId}' not found`
      );
      return {
        status: 404,
        jsonBody: errorResponse,
      };
    }

    if (!program) {
      context.log(`[${requestId}] Program not found: ${session.programId} in city ${cityId}`);
      const errorResponse = ApiResponseBuilder.error(
        ApiErrorCode.NOT_FOUND,
        `Program for session '${sessionId}' not found`
      );
      return {
        status: 404,
        jsonBody: errorResponse,
      };
    }

    // Fetch related sessions (same provider/location)
    const relatedSessions = await sessionRepository.querySessions(
      cityId,
      {
        providerIds: [session.providerId],
        registrationOpen: true,
      },
      50
    );

    // Filter to exclude current session and only show future sessions
    const now = new Date().toISOString();
    const filteredRelated = relatedSessions
      .filter((s) => s.id !== sessionId && s.startDate >= now)
      .slice(0, 5);

    // Build response
    const routingOrigin = getRoutingOrigin(origin, cityConfig.defaultCenter);
    const travelEstimate = await estimatePreferredTransitTime(
      transitService,
      cityId,
      routingOrigin,
      location.coordinates,
      getSessionDepartureTime(session)
    );

    const response: SessionDetailsResponse = {
      session,
      provider,
      location,
      program,
      relatedSessions: filteredRelated,
      travelTime: travelEstimate
        ? {
            minutes: travelEstimate.durationMinutes,
            mode: travelEstimate.mode,
            distance: travelEstimate.distance,
            confidence: travelEstimate.confidence,
          }
        : undefined,
    };

    const executionTimeMs = Date.now() - startTime;

    context.log(
      `[${requestId}] Session details retrieved successfully. Execution time: ${executionTimeMs}ms`
    );

    const successResponse = ApiResponseBuilder.success(response, {
      requestId,
      executionTimeMs,
    });

    return {
      status: 200,
      jsonBody: successResponse,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    if (isAppError(error)) {
      context.log(
        `[${requestId}] Application error: ${error.code} - ${error.message}`,
        error.details
      );
      const errorResponse = ApiResponseBuilder.error(error.code, error.message, error.details);
      return {
        status: error.statusCode,
        jsonBody: errorResponse,
      };
    }

    // Unexpected error
    context.log(`[${requestId}] Unexpected error:`, error);
    const errorResponse = ApiResponseBuilder.error(
      ApiErrorCode.INTERNAL_SERVER_ERROR,
      'An unexpected error occurred while fetching session details'
    );
    return {
      status: 500,
      jsonBody: errorResponse,
    };
  }
}

/**
 * Register the session details endpoint with Azure Functions
 */
app.http('sessionDetails', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}',
  handler: sessionDetails,
});
