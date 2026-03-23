/**
 * FeatureFlagService - Azure App Configuration flag management
 * Concrete implementation of IFeatureFlagService
 *
 * Responsibilities:
 * - Check if features are enabled (city-specific or global)
 * - Get feature variants for A/B testing
 * - Cache flags for performance (5 min TTL)
 * - Resolve city-specific flag overrides
 *
 * Flag naming convention:
 * - Global: "feature.enabled"
 * - City-specific: "city.{cityId}.feature.enabled"
 * - Variants: "feature.variant" with values like "control", "variant-a", "variant-b"
 */

import { AppConfigurationClient, ConfigurationSetting } from '@azure/app-configuration';
import {
  IFeatureFlagService,
  FeatureFlagContext,
} from '@core/contracts/services';

/**
 * FeatureFlagService implementation with Azure App Configuration
 */
export class FeatureFlagService implements IFeatureFlagService {
  private cache: Map<string, boolean | string> = new Map();
  private cacheTimestamps: Map<string, number> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(private appConfigClient: AppConfigurationClient) {}

  /**
   * Check if a feature is enabled
   * Resolves city-specific overrides and uses caching
   *
   * @param flagKey Flag key (e.g., "city.{cityId}.transitETA.enabled")
   * @param context Context with cityId for resolution
   * @returns True if enabled
   */
  async isEnabled(flagKey: string, context: FeatureFlagContext): Promise<boolean> {
    try {
      // Resolve flag key with city ID if placeholder present
      const resolvedKey = this.resolveFlagKey(flagKey, context);

      // Check cache first
      const cached = this.getFromCache(resolvedKey);
      if (cached !== null && typeof cached === 'boolean') {
        return cached;
      }

      // Fetch from App Configuration
      const value = await this.getFlagValue(resolvedKey);

      // Cache the result
      this.setInCache(resolvedKey, value);

      // Parse boolean value
      return this.parseBoolean(value);
    } catch (error) {
      console.error(`Error checking feature flag ${flagKey}:`, error);
      // Default to false on error for safety
      return false;
    }
  }

  /**
   * Get feature variant (for A/B testing)
   * Supports type-safe variants
   *
   * @param flagKey Flag key
   * @param context Context with cityId
   * @returns Variant value (e.g., "control", "variant-a")
   */
  async getVariant<T = string>(flagKey: string, context: FeatureFlagContext): Promise<T> {
    try {
      // Resolve flag key with city ID if placeholder present
      const resolvedKey = this.resolveFlagKey(flagKey, context);

      // Check cache first
      const cached = this.getFromCache(resolvedKey);
      if (cached !== null && typeof cached !== 'boolean') {
        return cached as T;
      }

      // Fetch from App Configuration
      const value = await this.getFlagValue(resolvedKey);

      // Cache the result
      this.setInCache(resolvedKey, value);

      // Return as requested type (assuming string by default)
      return value as T;
    } catch (error) {
      console.error(`Error getting feature variant ${flagKey}:`, error);
      // Return null/undefined on error
      return null as any;
    }
  }

  /**
   * Get all flags for a city
   * Useful for bulk flag loading
   *
   * @param cityId City ID
   * @returns Map of flag keys to values
   */
  async getAllFlags(cityId: string): Promise<Record<string, boolean | string>> {
    try {
      const flags: Record<string, boolean | string> = {};

      // Fetch all configuration settings for this city
      const settings = await this.appConfigClient.listConfigurationSettings({
        keyFilter: `city.${cityId}.*`,
      });

      for await (const setting of settings) {
        if (setting.key && setting.value) {
          // Extract flag name from key (e.g., "city.nyc.feature.enabled" -> "feature.enabled")
          const flagName = setting.key.substring(`city.${cityId}.`.length);

          // Parse value - try boolean first, otherwise string
          const parsed = this.tryParseBoolean(setting.value);
          flags[flagName] = parsed;
        }
      }

      return flags;
    } catch (error) {
      console.error(`Error getting all flags for city ${cityId}:`, error);
      return {};
    }
  }

  /**
   * Set flag value (admin operation)
   * Updates App Configuration and invalidates local cache
   *
   * @param flagKey Flag key
   * @param value Flag value
   */
  async setFlag(flagKey: string, value: boolean | string): Promise<void> {
    try {
      // Convert to string for storage
      const stringValue = String(value);

      // Update in App Configuration
      await this.appConfigClient.setConfigurationSetting({
        key: flagKey,
        value: stringValue,
        contentType: typeof value === 'boolean' ? 'application/boolean' : 'application/string',
      });

      // Invalidate cache for this flag
      this.cache.delete(flagKey);
      this.cacheTimestamps.delete(flagKey);
    } catch (error) {
      console.error(`Error setting feature flag ${flagKey}:`, error);
      throw error;
    }
  }

  /**
   * Clear all cached flags
   * Useful for testing or forcing refresh
   */
  async clearCache(): Promise<void> {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }

  /**
   * Get cache statistics
   * Useful for monitoring
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Resolve flag key by replacing {cityId} placeholder with actual city ID
   *
   * @param flagKey Flag key potentially with placeholders
   * @param context Context with cityId
   * @returns Resolved flag key
   */
  private resolveFlagKey(flagKey: string, context: FeatureFlagContext): string {
    if (!context.cityId) {
      return flagKey;
    }

    // Replace {cityId} placeholder with actual city ID
    return flagKey.replace('{cityId}', context.cityId);
  }

  /**
   * Fetch flag value from App Configuration
   *
   * @param key Flag key
   * @returns Flag value as string
   */
  private async getFlagValue(key: string): Promise<string> {
    const setting = await this.appConfigClient.getConfigurationSetting({
      key,
    });

    if (!setting || !setting.value) {
      throw new Error(`Feature flag not found: ${key}`);
    }

    return setting.value;
  }

  /**
   * Check if value is in cache and not expired
   *
   * @param key Cache key
   * @returns Cached value or null if not found or expired
   */
  private getFromCache(key: string): boolean | string | null {
    const cached = this.cache.get(key);
    if (cached === undefined) {
      return null;
    }

    const timestamp = this.cacheTimestamps.get(key);
    if (!timestamp || Date.now() - timestamp > this.cacheTTL) {
      // Expired - remove from cache
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Store value in cache with timestamp
   *
   * @param key Cache key
   * @param value Value to cache
   */
  private setInCache(key: string, value: boolean | string): void {
    this.cache.set(key, value);
    this.cacheTimestamps.set(key, Date.now());
  }

  /**
   * Parse string value to boolean
   * Handles common boolean representations
   *
   * @param value String value to parse
   * @returns Boolean value
   */
  private parseBoolean(value: string): boolean {
    return ['true', '1', 'yes', 'enabled', 'on'].includes(value.toLowerCase());
  }

  /**
   * Try to parse value as boolean, return as string if not a boolean representation
   *
   * @param value String value
   * @returns Parsed value (boolean or string)
   */
  private tryParseBoolean(value: string): boolean | string {
    const lowerValue = value.toLowerCase();

    // Check if it looks like a boolean
    if (
      ['true', 'false', '1', '0', 'yes', 'no', 'enabled', 'disabled', 'on', 'off'].includes(
        lowerValue
      )
    ) {
      return this.parseBoolean(value);
    }

    // Return as string
    return value;
  }
}
