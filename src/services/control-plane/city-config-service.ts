/**
 * CityConfigService - Manages city configurations
 * Concrete implementation of ICityConfigService
 */

import { ICityConfigService } from '@core/contracts/services';
import { ITenantRepository } from '@core/contracts/repositories';
import { CityConfig, TenantCatalog } from '@core/contracts/city-config';
import { ValidationResult } from '@core/models/canonical-schema';
import { CityNotFoundError, ValidationError } from '@core/errors/app-errors';

function createDefaultNycCityConfig(): CityConfig {
  const timestamp = new Date().toISOString();

  return {
    cityId: 'nyc',
    displayName: 'New York City',
    timezone: 'America/New_York',
    locale: 'en-US',
    geographies: [
      { id: 'manhattan', displayName: 'Manhattan', type: 'borough' },
      { id: 'brooklyn', displayName: 'Brooklyn', type: 'borough' },
      { id: 'queens', displayName: 'Queens', type: 'borough' },
      { id: 'bronx', displayName: 'Bronx', type: 'borough' },
      { id: 'staten-island', displayName: 'Staten Island', type: 'borough' },
    ],
    defaultCenter: {
      latitude: 40.758,
      longitude: -73.9855,
    },
    defaultZoomLevel: 11,
    transitModes: [
      { mode: 'subway', displayName: 'Subway', maxReasonableMinutes: 60 },
      { mode: 'bus', displayName: 'Bus', maxReasonableMinutes: 60 },
      { mode: 'walking', displayName: 'Walking', maxReasonableMinutes: 25 },
    ],
    transitProvider: 'mta',
    registrationPatterns: [
      {
        name: 'NYC Parks Online',
        urlPattern: 'https://www.nycgovparks.org/programs/swimming',
        requiresResidency: false,
      },
    ],
    typicalSeasonStart: { month: 6, day: 1 },
    typicalSeasonEnd: { month: 8, day: 31 },
    adapterConfig: {
      type: 'manual',
      syncSchedule: '0 2 * * *',
      confidence: 'low',
    },
    searchProfile: {
      defaultSort: 'startDate',
      rankingWeights: {
        recency: 0.35,
        proximity: 0.3,
        availability: 0.2,
        quality: 0.15,
      },
      noResultsFallback: {
        expandRadiusMiles: [2, 5, 10],
        relaxDayConstraints: true,
        relaxTimeConstraints: true,
      },
    },
    features: {
      transitETA: true,
      providerSelfServe: false,
    },
    status: 'active',
    onboardedAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * City configuration service with caching
 */
export class CityConfigService implements ICityConfigService {
  private cache: Map<string, CityConfig> = new Map();
  private cacheTimestamps: Map<string, number> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(private tenantRepo: ITenantRepository) {}

  async getCityConfig(cityId: string): Promise<CityConfig | null> {
    // Check cache first
    const cached = this.getFromCache(cityId);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const tenant = await this.tenantRepo.getById(cityId);
    if (!tenant) {
      const fallbackConfig = this.getDefaultCityConfig(cityId);
      if (!fallbackConfig) {
        return null;
      }

      this.cache.set(cityId, fallbackConfig);
      this.cacheTimestamps.set(cityId, Date.now());
      return fallbackConfig;
    }

    // Cache and return
    this.cache.set(cityId, tenant.cityConfig);
    this.cacheTimestamps.set(cityId, Date.now());

    return tenant.cityConfig;
  }

  async listCities(includePreview = false): Promise<CityConfig[]> {
    const filter = includePreview ? undefined : { status: 'active' as const };

    const tenants = await this.tenantRepo.list(filter);
    if (tenants.length > 0) {
      return tenants.map((t) => t.cityConfig);
    }

    const fallbackConfig = this.getDefaultCityConfig('nyc');
    if (!fallbackConfig) {
      return [];
    }

    if (!includePreview && fallbackConfig.status !== 'active') {
      return [];
    }

    return [fallbackConfig];
  }

  async createCity(config: CityConfig): Promise<CityConfig> {
    // Validate first
    const validation = await this.validateConfig(config);
    if (!validation.valid) {
      throw new ValidationError(
        `Invalid city config: ${validation.errors.join(', ')}`,
        { errors: validation.errors, warnings: validation.warnings }
      );
    }

    // Create tenant catalog entry
    const now = new Date().toISOString();
    const tenant: TenantCatalog = {
      id: config.cityId,
      type: 'CityConfig',
      cityConfig: {
        ...config,
        onboardedAt: config.onboardedAt || now,
        updatedAt: now,
      },
      status: config.status,
      onboardedAt: now,
      onboardedBy: 'system', // TODO: Get from auth context
    };

    await this.tenantRepo.create(tenant);

    // Invalidate cache
    this.cache.delete(config.cityId);

    return tenant.cityConfig;
  }

  async updateCity(cityId: string, updates: Partial<CityConfig>): Promise<CityConfig> {
    const existing = await this.getCityConfig(cityId);
    if (!existing) {
      throw new CityNotFoundError(cityId);
    }

    const updated: CityConfig = {
      ...existing,
      ...updates,
      cityId, // Ensure cityId doesn't change
      updatedAt: new Date().toISOString(),
    };

    // Validate updated config
    const validation = await this.validateConfig(updated);
    if (!validation.valid) {
      throw new ValidationError(
        `Invalid city config updates: ${validation.errors.join(', ')}`,
        { errors: validation.errors }
      );
    }

    await this.tenantRepo.update(cityId, {
      cityConfig: updated,
      status: updated.status,
    });

    // Invalidate cache
    await this.clearCache(cityId);

    return updated;
  }

  async deactivateCity(cityId: string, reason: string): Promise<void> {
    const config = await this.getCityConfig(cityId);
    if (!config) {
      throw new CityNotFoundError(cityId);
    }

    await this.tenantRepo.update(cityId, {
      status: 'deactivated',
      deactivatedAt: new Date().toISOString(),
      deactivatedReason: reason,
    });

    await this.clearCache(cityId);
  }

  async validateConfig(config: CityConfig): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!config.cityId) {
      errors.push('cityId is required');
    } else if (!/^[a-z0-9-]+$/.test(config.cityId)) {
      errors.push('cityId must contain only lowercase letters, numbers, and hyphens');
    }

    if (!config.displayName) {
      errors.push('displayName is required');
    }

    if (!config.timezone) {
      errors.push('timezone is required');
    }

    // Geographies
    if (!config.geographies || config.geographies.length === 0) {
      errors.push('At least one geography is required');
    } else {
      // Validate geography IDs are unique
      const geographyIds = config.geographies.map((g) => g.id);
      const uniqueIds = new Set(geographyIds);
      if (geographyIds.length !== uniqueIds.size) {
        errors.push('Geography IDs must be unique');
      }
    }

    // Search profile validation
    if (config.searchProfile) {
      const weights = config.searchProfile.rankingWeights;
      const total = weights.recency + weights.proximity + weights.availability + weights.quality;

      if (Math.abs(total - 1.0) > 0.01) {
        warnings.push(
          `Ranking weights should sum to 1.0 (currently ${total.toFixed(2)})`
        );
      }

      // Individual weights should be 0-1
      if (
        weights.recency < 0 ||
        weights.recency > 1 ||
        weights.proximity < 0 ||
        weights.proximity > 1 ||
        weights.availability < 0 ||
        weights.availability > 1 ||
        weights.quality < 0 ||
        weights.quality > 1
      ) {
        errors.push('All ranking weights must be between 0 and 1');
      }
    }

    // Default center coordinates
    if (config.defaultCenter) {
      if (
        config.defaultCenter.latitude < -90 ||
        config.defaultCenter.latitude > 90
      ) {
        errors.push('Latitude must be between -90 and 90');
      }
      if (
        config.defaultCenter.longitude < -180 ||
        config.defaultCenter.longitude > 180
      ) {
        errors.push('Longitude must be between -180 and 180');
      }
    }

    // Adapter config validation
    if (!config.adapterConfig) {
      errors.push('adapterConfig is required');
    } else {
      if (!config.adapterConfig.type) {
        errors.push('adapterConfig.type is required');
      }
      if (!config.adapterConfig.syncSchedule) {
        warnings.push('adapterConfig.syncSchedule not specified');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async clearCache(cityId: string): Promise<void> {
    this.cache.delete(cityId);
    this.cacheTimestamps.delete(cityId);
  }

  /**
   * Clear all cache (useful for testing or full refresh)
   */
  async clearAllCache(): Promise<void> {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }

  /**
   * Get cache statistics (useful for monitoring)
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  private getFromCache(cityId: string): CityConfig | null {
    const cached = this.cache.get(cityId);
    if (!cached) {
      return null;
    }

    const timestamp = this.cacheTimestamps.get(cityId);
    if (!timestamp || Date.now() - timestamp > this.cacheTTL) {
      // Expired
      this.cache.delete(cityId);
      this.cacheTimestamps.delete(cityId);
      return null;
    }

    return cached;
  }

  private getDefaultCityConfig(cityId: string): CityConfig | null {
    if (cityId !== 'nyc') {
      return null;
    }

    return createDefaultNycCityConfig();
  }
}
