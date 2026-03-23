/**
 * Cities API Endpoint - GET /api/cities
 *
 * List all available cities with their status and session counts
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import {
  ListCitiesResponse,
  CityListItem,
  ApiResponse,
  ApiResponseBuilder,
  ApiErrorCode,
} from '@core/contracts/api-contracts';
import { getDependencies } from '../dependency-injection';
import { isAppError } from '@core/errors/app-errors';

/**
 * Cities endpoint handler
 * GET /api/cities
 *
 * Query parameters:
 * - includePreview (optional): Include cities in preview status (default: false)
 *
 * Response: ApiResponse<ListCitiesResponse>
 */
export async function cities(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const startTime = Date.now();
  const requestId = context.invocationId;

  context.log(`[${requestId}] Cities list request started`);

  try {
    // Parse query parameters
    const includePreviewQuery = req.query.get('includePreview');
    const includePreview = includePreviewQuery === 'true' || includePreviewQuery === '1';

    context.log(`[${requestId}] Fetching cities list. includePreview=${includePreview}`);

    // Get dependencies
    const { cityConfigService, sessionRepository } = await getDependencies();

    // Fetch all cities
    const cityConfigs = await cityConfigService.listCities(includePreview);

    context.log(`[${requestId}] Found ${cityConfigs.length} cities`);

    // Build city list items with session counts
    const cityListItems: CityListItem[] = await Promise.all(
      cityConfigs.map(async (cityConfig): Promise<CityListItem> => {
        try {
          // Count available sessions for this city
          const sessions = await sessionRepository.querySessions(
            cityConfig.cityId,
            {
              registrationOpen: true,
              startDateMin: new Date().toISOString(),
            },
            1000
          );

          return {
            cityId: cityConfig.cityId,
            displayName: cityConfig.displayName,
            status: cityConfig.status,
            availableSessionCount: sessions.length,
            lastUpdated: cityConfig.updatedAt || cityConfig.onboardedAt,
            defaultCenter: cityConfig.defaultCenter,
          };
        } catch (error) {
          context.log(`[${requestId}] Error counting sessions for city ${cityConfig.cityId}:`, error);
          // Return city with 0 sessions on error rather than failing entire request
          return {
            cityId: cityConfig.cityId,
            displayName: cityConfig.displayName,
            status: cityConfig.status,
            availableSessionCount: 0,
            lastUpdated: cityConfig.updatedAt || cityConfig.onboardedAt,
            defaultCenter: cityConfig.defaultCenter,
          };
        }
      })
    );

    // Sort by display name
    cityListItems.sort((a, b) => a.displayName.localeCompare(b.displayName));

    const response: ListCitiesResponse = {
      cities: cityListItems,
    };

    const executionTimeMs = Date.now() - startTime;

    context.log(
      `[${requestId}] Cities list retrieved successfully. ` +
        `Count: ${cityListItems.length}, Execution time: ${executionTimeMs}ms`
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
      'An unexpected error occurred while fetching cities'
    );
    return {
      status: 500,
      jsonBody: errorResponse,
    };
  }
}

/**
 * Register the cities endpoint with Azure Functions
 */
app.http('cities', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cities',
  handler: cities,
});
