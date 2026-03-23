/**
 * Application Error Classes
 *
 * Custom error types for better error handling and logging.
 * All errors include context for debugging and telemetry.
 */

import { ApiErrorCode } from '../contracts/api-contracts';

/**
 * Base application error class
 * All custom errors should extend this
 */
export class AppError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      statusCode: this.statusCode,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined,
    };
  }
}

/**
 * City not found error
 */
export class CityNotFoundError extends AppError {
  constructor(cityId: string) {
    super(
      ApiErrorCode.CITY_NOT_FOUND,
      `City '${cityId}' not found`,
      { cityId },
      404
    );
  }
}

/**
 * City inactive error (exists but not active)
 */
export class CityInactiveError extends AppError {
  constructor(cityId: string, status: string) {
    super(
      ApiErrorCode.CITY_INACTIVE,
      `City '${cityId}' is not active (status: ${status})`,
      { cityId, status },
      403
    );
  }
}

/**
 * Session not found error
 */
export class SessionNotFoundError extends AppError {
  constructor(sessionId: string, cityId: string) {
    super(
      ApiErrorCode.SESSION_NOT_FOUND,
      `Session '${sessionId}' not found in city '${cityId}'`,
      { sessionId, cityId },
      404
    );
  }
}

/**
 * Provider not found error
 */
export class ProviderNotFoundError extends AppError {
  constructor(providerId: string, cityId: string) {
    super(
      ApiErrorCode.PROVIDER_NOT_FOUND,
      `Provider '${providerId}' not found in city '${cityId}'`,
      { providerId, cityId },
      404
    );
  }
}

/**
 * Validation error (bad request data)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(ApiErrorCode.VALIDATION_ERROR, message, details, 400);
  }
}

/**
 * Cosmos DB error wrapper
 */
export class DatabaseError extends AppError {
  constructor(operation: string, originalError: Error) {
    super(
      ApiErrorCode.COSMOS_DB_ERROR,
      `Database error during ${operation}: ${originalError.message}`,
      { operation, originalError: originalError.message },
      500
    );
  }
}

/**
 * Adapter error (city data source failure)
 */
export class AdapterError extends AppError {
  constructor(cityId: string, operation: string, originalError: Error) {
    super(
      ApiErrorCode.ADAPTER_ERROR,
      `Adapter error for city '${cityId}' during ${operation}: ${originalError.message}`,
      { cityId, operation, originalError: originalError.message },
      500
    );
  }
}

/**
 * Sync failed error
 */
export class SyncFailedError extends AppError {
  constructor(cityId: string, reason: string, details?: Record<string, unknown>) {
    super(
      ApiErrorCode.SYNC_FAILED,
      `Data sync failed for city '${cityId}': ${reason}`,
      details ? { cityId, reason, ...details } : { cityId, reason },
      500
    );
  }
}

/**
 * Onboarding failed error
 */
export class OnboardingFailedError extends AppError {
  constructor(cityId: string, step: string, reason: string) {
    super(
      ApiErrorCode.ONBOARDING_FAILED,
      `Onboarding failed for city '${cityId}' at step '${step}': ${reason}`,
      { cityId, step, reason },
      500
    );
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends AppError {
  constructor(cityId: string, limit: number) {
    super(
      ApiErrorCode.RATE_LIMIT_EXCEEDED,
      `Rate limit exceeded for city '${cityId}'. Limit: ${limit} requests/minute`,
      { cityId, limit },
      429
    );
  }
}

/**
 * Service unavailable error
 */
export class ServiceUnavailableError extends AppError {
  constructor(service: string, reason?: string) {
    super(
      ApiErrorCode.SERVICE_UNAVAILABLE,
      `Service '${service}' is unavailable${reason ? `: ${reason}` : ''}`,
      { service, reason },
      503
    );
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number) {
    super(
      ApiErrorCode.TIMEOUT,
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      { operation, timeoutMs },
      504
    );
  }
}

/**
 * Type guard to check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Error handler utility - converts any error to AppError
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(
      ApiErrorCode.INTERNAL_SERVER_ERROR,
      error.message,
      { originalError: error.name },
      500
    );
  }

  return new AppError(
    ApiErrorCode.INTERNAL_SERVER_ERROR,
    'An unknown error occurred',
    { error: String(error) },
    500
  );
}
