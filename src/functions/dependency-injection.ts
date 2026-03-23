/**
 * Dependency Injection Container
 *
 * Centralizes instantiation and management of all service dependencies.
 * Uses singleton pattern to ensure single instance of expensive resources (Cosmos DB client).
 *
 * Factory pattern allows lazy initialization - services are created on first use.
 */

import { ISearchService, ICityConfigService } from '@core/contracts/services';
import { ITenantRepository, ISessionRepository } from '@core/contracts/repositories';
import { SearchService } from '@services/search/search-service';
import { CityConfigService } from '@services/control-plane/city-config-service';
import { CosmosDBClient, CosmosConfig, CONTAINERS, createCosmosClient } from '@infrastructure/cosmos/cosmos-client';
import { TenantRepository } from '@infrastructure/cosmos/repositories/tenant-repository';
import { SessionRepository } from '@infrastructure/cosmos/repositories/session-repository';
import { getEnvironmentConfig } from '@core/utils/env';

/**
 * Dependency container with all service instances
 */
interface DependencyContainer {
  // Infrastructure
  cosmosClient: CosmosDBClient;

  // Repositories
  tenantRepository: ITenantRepository;
  sessionRepository: ISessionRepository;

  // Services
  cityConfigService: ICityConfigService;
  searchService: ISearchService;
}

/**
 * Global container instance (singleton)
 */
let globalContainer: DependencyContainer | null = null;

/**
 * Initialize all dependencies
 * Called once at application startup
 *
 * @returns Dependency container with all initialized services
 */
async function initializeDependencies(): Promise<DependencyContainer> {
  // Prevent multiple initialization
  if (globalContainer) {
    return globalContainer;
  }

  console.log('[DI] Initializing dependency container...');

  // Get configuration from environment
  const config = getEnvironmentConfig();
  const cosmosConfig: CosmosConfig = {
    connectionString: config.cosmosConnectionString,
    databaseId: config.cosmosDatabaseId,
  };

  // Initialize Cosmos DB client
  console.log('[DI] Initializing Cosmos DB client...');
  const cosmosClient = await createCosmosClient(cosmosConfig);

  // Initialize repositories
  console.log('[DI] Initializing repositories...');
  const tenantsContainer = cosmosClient.getContainer(CONTAINERS.TENANTS);
  const sessionsContainer = cosmosClient.getContainer(CONTAINERS.SESSIONS);

  const tenantRepository = new TenantRepository(tenantsContainer);
  const sessionRepository = new SessionRepository(sessionsContainer);

  // Initialize services
  console.log('[DI] Initializing services...');
  const cityConfigService = new CityConfigService(tenantRepository);
  const searchService = new SearchService(sessionRepository, cityConfigService);

  // Create container
  globalContainer = {
    cosmosClient,
    tenantRepository,
    sessionRepository,
    cityConfigService,
    searchService,
  };

  console.log('[DI] Dependency container initialized successfully');

  return globalContainer;
}

/**
 * Get dependencies (lazy initialization)
 *
 * @returns Dependency container
 */
export async function getDependencies(): Promise<DependencyContainer> {
  if (!globalContainer) {
    return initializeDependencies();
  }

  return globalContainer;
}

/**
 * Get specific service from container
 *
 * @param serviceName Service to retrieve
 * @returns Service instance
 */
export async function getService<T extends keyof DependencyContainer>(
  serviceName: T
): Promise<DependencyContainer[T]> {
  const container = await getDependencies();
  return container[serviceName];
}

/**
 * Reset container (useful for testing)
 * WARNING: Only call this in test/development environments
 */
export async function resetDependencies(): Promise<void> {
  if (globalContainer) {
    await globalContainer.cosmosClient.dispose();
    globalContainer = null;
  }
  console.log('[DI] Dependency container reset');
}

/**
 * Get container for testing
 * Allows inspection of initialized services
 *
 * @returns Container or null if not initialized
 */
export function getContainerForTesting(): DependencyContainer | null {
  return globalContainer;
}
