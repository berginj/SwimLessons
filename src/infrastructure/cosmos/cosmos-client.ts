/**
 * Cosmos DB Client Wrapper
 * Centralized Cosmos DB client with connection pooling and error handling
 */

import { CosmosClient, Database, Container } from '@azure/cosmos';
import { DatabaseError } from '@core/errors/app-errors';

/**
 * Cosmos DB configuration
 */
export interface CosmosConfig {
  connectionString: string;
  databaseId: string;
}

/**
 * Container names
 */
export const CONTAINERS = {
  TENANTS: 'tenants',
  SESSIONS: 'sessions',
  EVENTS: 'events',
} as const;

/**
 * CosmosDB client wrapper with connection pooling
 * Singleton pattern - one instance per application
 */
export class CosmosDBClient {
  private static instance: CosmosDBClient;
  private client: CosmosClient;
  private database!: Database;
  private containers: Map<string, Container> = new Map();

  private constructor(private config: CosmosConfig) {
    this.client = new CosmosClient(config.connectionString);
  }

  /**
   * Get singleton instance
   */
  static getInstance(config: CosmosConfig): CosmosDBClient {
    if (!CosmosDBClient.instance) {
      CosmosDBClient.instance = new CosmosDBClient(config);
    }
    return CosmosDBClient.instance;
  }

  /**
   * Initialize database connection
   * Call this once at application startup
   */
  async initialize(): Promise<void> {
    try {
      this.database = this.client.database(this.config.databaseId);

      // Verify connection by reading database properties
      await this.database.read();

      console.log(`Connected to Cosmos DB: ${this.config.databaseId}`);
    } catch (error) {
      throw new DatabaseError('initialize', error as Error);
    }
  }

  /**
   * Get container by name
   * Cached after first access
   */
  getContainer(containerName: string): Container {
    if (!this.database) {
      throw new Error('CosmosDBClient not initialized. Call initialize() first.');
    }

    let container = this.containers.get(containerName);
    if (!container) {
      container = this.database.container(containerName);
      this.containers.set(containerName, container);
    }

    return container;
  }

  /**
   * Get the raw Cosmos client
   * Use sparingly - prefer getContainer()
   */
  getRawClient(): CosmosClient {
    return this.client;
  }

  /**
   * Get database instance
   */
  getDatabase(): Database {
    if (!this.database) {
      throw new Error('CosmosDBClient not initialized. Call initialize() first.');
    }
    return this.database;
  }

  /**
   * Health check - verify connection is alive
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.database.read();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close connections (for graceful shutdown)
   */
  async dispose(): Promise<void> {
    // Cosmos SDK manages connections internally
    // This is mainly for logging
    console.log('Cosmos DB client disposed');
  }
}

/**
 * Helper to create and initialize Cosmos client
 */
export async function createCosmosClient(config: CosmosConfig): Promise<CosmosDBClient> {
  const client = CosmosDBClient.getInstance(config);
  await client.initialize();
  return client;
}
