/**
 * Telemetry API Endpoint - POST /api/events
 *
 * Accepts frontend telemetry events and forwards them to the shared telemetry service.
 * The handler is backward-compatible with the previous flat event payload shape by
 * folding unknown top-level keys into `properties`.
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import {
  ApiErrorCode,
  ApiResponseBuilder,
  TrackEventRequest,
  TrackEventResponse,
  TelemetryEventRequest,
} from '@core/contracts/api-contracts';
import { TelemetryEvent } from '@core/contracts/services';
import { getDependencies } from '../dependency-injection';
import { isAppError } from '@core/errors/app-errors';

const ALLOWED_PLATFORMS = new Set(['web', 'ios', 'android']);

type RawTelemetryEvent = Partial<TelemetryEventRequest> & Record<string, unknown>;

export async function trackEvents(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const startTime = Date.now();
  const requestId = context.invocationId;

  context.log(`[${requestId}] Telemetry request started`);

  try {
    let trackEventRequest: TrackEventRequest;
    try {
      trackEventRequest = (await req.json()) as TrackEventRequest;
    } catch (parseError) {
      context.log(`[${requestId}] Failed to parse telemetry request body`, parseError);
      return {
        status: 400,
        jsonBody: ApiResponseBuilder.error(
          ApiErrorCode.BAD_REQUEST,
          'Invalid request body - must be valid JSON'
        ),
      };
    }

    if (!trackEventRequest || !Array.isArray(trackEventRequest.events)) {
      return {
        status: 400,
        jsonBody: ApiResponseBuilder.error(
          ApiErrorCode.VALIDATION_ERROR,
          'events is required and must be an array'
        ),
      };
    }

    const { telemetryService } = await getDependencies();
    const errors: TrackEventResponse['errors'] = [];
    let accepted = 0;

    for (const [index, rawEvent] of trackEventRequest.events.entries()) {
      const normalized = normalizeTelemetryEvent(rawEvent);
      if (!normalized.valid) {
        errors?.push({
          index,
          message: normalized.message,
        });
        continue;
      }

      try {
        await telemetryService.trackEvent(normalized.event);
        accepted += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown telemetry error';
        context.log(`[${requestId}] Failed to track telemetry event at index ${index}: ${message}`);
        errors?.push({
          index,
          message,
        });
      }
    }

    const response: TrackEventResponse = {
      accepted,
      rejected: errors?.length || 0,
      ...(errors && errors.length > 0 ? { errors } : {}),
    };

    const successResponse = ApiResponseBuilder.success(response, {
      requestId,
      executionTimeMs: Date.now() - startTime,
    });

    return {
      status: 200,
      jsonBody: successResponse,
    };
  } catch (error) {
    if (isAppError(error)) {
      return {
        status: error.statusCode,
        jsonBody: ApiResponseBuilder.error(error.code, error.message, error.details),
      };
    }

    context.log(`[${requestId}] Unexpected telemetry error`, error);
    return {
      status: 500,
      jsonBody: ApiResponseBuilder.error(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'An unexpected error occurred while tracking telemetry events'
      ),
    };
  }
}

function normalizeTelemetryEvent(rawEvent: unknown):
  | { valid: true; event: TelemetryEvent & { properties: Record<string, unknown> } }
  | { valid: false; message: string } {
  if (!isRecord(rawEvent)) {
    return { valid: false, message: 'Each event must be a JSON object' };
  }

  const eventName = rawEvent.eventName;
  const timestamp = rawEvent.timestamp;
  const sessionId = rawEvent.sessionId;
  const cityId = rawEvent.cityId;
  const platformValue = rawEvent.platform ?? 'web';

  if (typeof eventName !== 'string' || !eventName.trim()) {
    return { valid: false, message: 'eventName is required and must be a non-empty string' };
  }

  if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
    return { valid: false, message: 'timestamp is required and must be a valid ISO timestamp' };
  }

  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return { valid: false, message: 'sessionId is required and must be a non-empty string' };
  }

  if (typeof cityId !== 'string' || !cityId.trim()) {
    return { valid: false, message: 'cityId is required and must be a non-empty string' };
  }

  if (typeof platformValue !== 'string' || !ALLOWED_PLATFORMS.has(platformValue)) {
    return { valid: false, message: 'platform must be one of: web, ios, android' };
  }

  const platform = platformValue as 'web' | 'ios' | 'android';

  const explicitProperties = isRecord(rawEvent.properties) ? rawEvent.properties : {};
  const compatibilityProperties = collectCompatibilityProperties(rawEvent);

  return {
    valid: true,
    event: {
      eventName,
      timestamp: new Date(timestamp).toISOString(),
      sessionId,
      cityId,
      ...(typeof rawEvent.userId === 'string' && rawEvent.userId.trim()
        ? { userId: rawEvent.userId }
        : {}),
      platform,
      properties: {
        ...compatibilityProperties,
        ...explicitProperties,
      },
    },
  };
}

function collectCompatibilityProperties(rawEvent: RawTelemetryEvent): Record<string, unknown> {
  const compatibilityProperties: Record<string, unknown> = {};
  const reservedKeys = new Set([
    'eventName',
    'timestamp',
    'sessionId',
    'cityId',
    'userId',
    'platform',
    'properties',
  ]);

  for (const [key, value] of Object.entries(rawEvent)) {
    if (reservedKeys.has(key)) {
      continue;
    }
    compatibilityProperties[key] = value;
  }

  return compatibilityProperties;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

app.http('events', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'events',
  handler: trackEvents,
});
