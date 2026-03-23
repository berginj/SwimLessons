/**
 * Adapter Factory
 * Creates appropriate adapter instance based on city configuration
 */

import { ICityDataAdapter } from '@core/contracts/city-adapter';
import { CityConfig } from '@core/contracts/city-config';
import { AdapterError } from '@core/errors/app-errors';

/**
 * Adapter registry - maps adapter type to constructor
 */
type AdapterConstructor = new (cityId: string, config: CityConfig) => ICityDataAdapter;

const adapterRegistry = new Map<string, AdapterConstructor>();

/**
 * Register an adapter type
 *
 * @example
 * registerAdapter('nyc-parks-api', NYCParksAdapter);
 * registerAdapter('csv-import', CSVAdapter);
 */
export function registerAdapter(type: string, constructor: AdapterConstructor): void {
  adapterRegistry.set(type, constructor);
}

/**
 * Get adapter instance for a city
 *
 * @param cityConfig City configuration containing adapter type
 * @returns Adapter instance
 * @throws AdapterError if adapter type not found
 */
export function getAdapter(cityConfig: CityConfig): ICityDataAdapter {
  const adapterType = cityConfig.adapterConfig.type;

  const AdapterClass = adapterRegistry.get(adapterType);
  if (!AdapterClass) {
    throw new AdapterError(
      cityConfig.cityId,
      'getAdapter',
      new Error(`Unknown adapter type: ${adapterType}. Available types: ${Array.from(adapterRegistry.keys()).join(', ')}`)
    );
  }

  try {
    return new AdapterClass(cityConfig.cityId, cityConfig);
  } catch (error) {
    throw new AdapterError(
      cityConfig.cityId,
      'instantiate',
      error as Error
    );
  }
}

/**
 * Check if an adapter type is registered
 */
export function isAdapterRegistered(type: string): boolean {
  return adapterRegistry.has(type);
}

/**
 * Get all registered adapter types
 */
export function getRegisteredAdapterTypes(): string[] {
  return Array.from(adapterRegistry.keys());
}

/**
 * Clear adapter registry (useful for testing)
 */
export function clearAdapterRegistry(): void {
  adapterRegistry.clear();
}
