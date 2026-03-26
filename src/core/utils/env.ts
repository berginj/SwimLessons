/**
 * Environment variable utilities
 * Centralized environment configuration with validation
 */

/**
 * Get required environment variable
 * Throws if not set
 */
export function getEnvRequired(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable '${key}' is not set`);
  }
  return value;
}

/**
 * Get optional environment variable with default
 */
export function getEnvOptional(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Get environment variable as number
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable '${key}' must be a number, got: ${value}`);
  }
  return parsed;
}

/**
 * Get environment variable as boolean
 */
export function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Environment configuration
 */
export interface EnvironmentConfig {
  environment: 'development' | 'staging' | 'production';
  cosmosConnectionString: string;
  cosmosDatabaseId: string;
  appConfigEndpoint: string;
  keyVaultName: string;
  applicationInsightsConnectionString?: string;
  transitRouterGraphqlUrl?: string;
  transitRouterTimeoutMs: number;
}

/**
 * Load and validate environment configuration
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  const env = getEnvOptional('ENVIRONMENT', 'development');

  if (env !== 'development' && env !== 'staging' && env !== 'production') {
    throw new Error(`Invalid ENVIRONMENT: ${env}. Must be development, staging, or production`);
  }

  return {
    environment: env,
    cosmosConnectionString: getEnvRequired('COSMOS_CONNECTION_STRING'),
    cosmosDatabaseId: getEnvOptional('COSMOS_DATABASE_ID', 'swimlessons'),
    appConfigEndpoint: getEnvRequired('APP_CONFIG_ENDPOINT'),
    keyVaultName: getEnvRequired('KEY_VAULT_NAME'),
    applicationInsightsConnectionString: getEnvOptional('APPLICATIONINSIGHTS_CONNECTION_STRING', ''),
    transitRouterGraphqlUrl: getEnvOptional('TRANSIT_ROUTER_GRAPHQL_URL', ''),
    transitRouterTimeoutMs: getEnvNumber('TRANSIT_ROUTER_TIMEOUT_MS', 20000),
  };
}

/**
 * Get environment configuration (alias for loadEnvironmentConfig)
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  return loadEnvironmentConfig();
}
