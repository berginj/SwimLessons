/**
 * Search API Endpoint - POST /api/search
 *
 * Main search endpoint for finding swim sessions
 * Handles request validation, service coordination, and response formatting
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import {
  SearchRequest,
  SearchResponse,
  SessionSearchResult,
  ApiResponse,
  ApiResponseBuilder,
  ApiErrorCode,
} from '@core/contracts/api-contracts';
import { SearchFilters } from '@core/contracts/city-config';
import { getDependencies } from '../dependency-injection';
import { AppError, isAppError, ValidationError } from '@core/errors/app-errors';

/**
 * Search endpoint handler
 * POST /api/search
 *
 * Request body: SearchRequest
 * Response: ApiResponse<SearchResponse>
 *
 * Required fields in request:
 * - cityId: string
 * - filters: SearchFiltersRequest
 *
 * Optional fields:
 * - sort: SortRequest
 * - pagination: PaginationRequest
 * - userContext: { sessionId, origin }
 */
export async function search(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const startTime = Date.now();
  const requestId = context.invocationId;

  context.log(`[${requestId}] Search request started`);

  try {
    // Parse request body
    let searchRequest: SearchRequest;
    try {
      searchRequest = (await req.json()) as SearchRequest;
    } catch (parseError) {
      context.log(`[${requestId}] Failed to parse request body`, parseError);
      const errorResponse = ApiResponseBuilder.error(
        ApiErrorCode.BAD_REQUEST,
        'Invalid request body - must be valid JSON'
      );
      return {
        status: 400,
        jsonBody: errorResponse,
      };
    }

    // Validate required fields
    const validation = validateSearchRequest(searchRequest);
    if (!validation.valid) {
      context.log(`[${requestId}] Request validation failed: ${validation.errors.join(', ')}`);
      const errorResponse = ApiResponseBuilder.error(
        ApiErrorCode.VALIDATION_ERROR,
        `Invalid search request: ${validation.errors.join(', ')}`,
        { errors: validation.errors }
      );
      return {
        status: 400,
        jsonBody: errorResponse,
      };
    }

    // Get dependencies
    const { searchService, cityConfigService } = await getDependencies();

    // Verify city is active
    const cityConfig = await cityConfigService.getCityConfig(searchRequest.cityId);
    if (!cityConfig) {
      context.log(`[${requestId}] City not found: ${searchRequest.cityId}`);
      const errorResponse = ApiResponseBuilder.error(
        ApiErrorCode.CITY_NOT_FOUND,
        `City '${searchRequest.cityId}' not found`
      );
      return {
        status: 404,
        jsonBody: errorResponse,
      };
    }

    if (cityConfig.status !== 'active' && cityConfig.status !== 'preview') {
      context.log(
        `[${requestId}] City inactive: ${searchRequest.cityId} (status: ${cityConfig.status})`
      );
      const errorResponse = ApiResponseBuilder.error(
        ApiErrorCode.CITY_INACTIVE,
        `City '${searchRequest.cityId}' is not available (status: ${cityConfig.status})`
      );
      return {
        status: 403,
        jsonBody: errorResponse,
      };
    }

    // Convert API request to search filters
    const searchFilters: SearchFilters = {
      cityId: searchRequest.cityId,
      childAge: searchRequest.filters.childAge,
      startDateMin: searchRequest.filters.startDateMin,
      startDateMax: searchRequest.filters.startDateMax,
      daysOfWeek: searchRequest.filters.daysOfWeek,
      timeWindow: searchRequest.filters.timeWindow,
      geographyIds: searchRequest.filters.geographyIds,
      maxTravelMinutes: searchRequest.filters.maxTravelMinutes,
      priceMax: searchRequest.filters.priceMax,
      origin: searchRequest.userContext?.origin,
    };

    // Prepare sort options
    const sortOptions = searchRequest.sort || {
      field: cityConfig.searchProfile.defaultSort,
      direction: 'desc' as const,
    };

    // Prepare pagination options
    const paginationOptions = {
      skip: searchRequest.pagination?.skip ?? 0,
      take: searchRequest.pagination?.take ?? 20,
    };

    context.log(
      `[${requestId}] Searching for sessions in city: ${searchRequest.cityId}, ` +
        `skip: ${paginationOptions.skip}, take: ${paginationOptions.take}`
    );

    // Call search service
    const searchResults = await searchService.search(searchFilters, sortOptions, paginationOptions);

    // Build response with denormalized data
    const response: SearchResponse = {
      results: searchResults.results.map((session): SessionSearchResult => {
        // In a full implementation, would fetch provider and location from repository
        // For now, using denormalized data that should be in the session document
        return {
          session,
          provider: {
            id: session.providerId,
            name: 'Provider Name', // Would be denormalized from session
            logoUrl: undefined,
            verified: true, // Would fetch from provider document
          },
          location: {
            id: session.locationId,
            name: 'Location Name',
            address: 'Location Address',
            coordinates: cityConfig.defaultCenter, // Would be denormalized from session
            facilityType: 'indoor', // Would be denormalized
          },
          program: {
            id: session.programId,
            name: 'Program Name',
            description: undefined,
            skillLevel: 'beginner', // Would be denormalized
          },
        };
      }),
      pagination: {
        skip: paginationOptions.skip,
        take: paginationOptions.take,
        total: searchResults.total,
        hasMore: paginationOptions.skip + paginationOptions.take < searchResults.total,
      },
      appliedFilters: searchRequest.filters,
      relaxationApplied: searchResults.relaxationApplied,
      relaxationMessage: searchResults.relaxationApplied
        ? 'Search criteria were relaxed to find results'
        : undefined,
      executionTimeMs: searchResults.executionTimeMs || (Date.now() - startTime),
    };

    const executionTimeMs = Date.now() - startTime;

    context.log(
      `[${requestId}] Search completed successfully. Results: ${response.results.length}, ` +
        `Total execution time: ${executionTimeMs}ms`
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
      'An unexpected error occurred during search'
    );
    return {
      status: 500,
      jsonBody: errorResponse,
    };
  }
}

/**
 * Validate search request structure
 */
function validateSearchRequest(req: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!req || typeof req !== 'object') {
    errors.push('Request body must be a JSON object');
    return { valid: false, errors };
  }

  // Check required fields
  if (!req.cityId || typeof req.cityId !== 'string') {
    errors.push('cityId is required and must be a string');
  }

  if (!req.filters || typeof req.filters !== 'object') {
    errors.push('filters is required and must be an object');
  }

  // Validate pagination if provided
  if (req.pagination) {
    if (typeof req.pagination.skip === 'number' && req.pagination.skip < 0) {
      errors.push('pagination.skip must be non-negative');
    }
    if (typeof req.pagination.take === 'number' && req.pagination.take <= 0) {
      errors.push('pagination.take must be greater than 0');
    }
  }

  // Validate sort if provided
  if (req.sort) {
    const validFields = ['distance', 'startDate', 'price', 'availability', 'relevance'];
    if (!validFields.includes(req.sort.field)) {
      errors.push(`sort.field must be one of: ${validFields.join(', ')}`);
    }
    if (req.sort.direction && !['asc', 'desc'].includes(req.sort.direction)) {
      errors.push('sort.direction must be "asc" or "desc"');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Register the search endpoint with Azure Functions
 */
app.http('search', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'search',
  handler: search,
});
