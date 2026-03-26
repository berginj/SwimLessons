/**
 * Amilia Adapter
 *
 * Integrates with Amilia (SmartRec) API to fetch YMCA/JCC swim programs
 *
 * Data Source: Amilia V3 REST API
 * Coverage: YMCAs, JCCs, community centers using Amilia
 * Cost: FREE (included with Amilia subscription)
 */

import { BaseAdapter } from '@core/contracts/city-adapter';
import {
  Location,
  Provider,
  Program,
  Session,
  SyncResult,
  ValidationResult,
  TransitEstimate,
} from '@core/models/canonical-schema';
import { Coordinates, TransitMode, CityConfig } from '@core/contracts/city-config';
import { getEnvOptional } from '@core/utils/env';
import { AmiliaClient } from './amilia-client';

/**
 * Amilia Adapter - Transforms Amilia data to canonical schema
 */
export class AmiliaAdapter extends BaseAdapter {
  private client: AmiliaClient | null = null;
  private organizationIds: number[]; // YMCA/JCC org IDs to sync

  constructor(cityId: string, config: CityConfig) {
    super(cityId);

    // Get organization IDs from config
    // Format: "12345,67890,11111" (comma-separated YMCA org IDs)
    const orgIdString = config.adapterConfig.apiEndpoint || '';
    this.organizationIds = orgIdString
      .split(',')
      .map((id) => parseInt(id.trim()))
      .filter((id) => !isNaN(id));

    if (this.organizationIds.length === 0) {
      console.warn('No Amilia organization IDs configured. Add to city config adapterConfig.apiEndpoint');
    }
  }

  /**
   * Get locations from Amilia organizations
   */
  async getLocations(): Promise<Location[]> {
    const locations: Location[] = [];
    const locationMap = new Map<string, Location>(); // Dedupe by address
    const client = this.getClient();

    for (const orgId of this.organizationIds) {
      const activities = await client.getActivities({ organizationId: orgId });

      for (const activity of activities) {
        if (!activity.Location) continue;

        const locationKey = `${activity.Location.Address}-${activity.Location.ZipCode}`;

        if (!locationMap.has(locationKey)) {
          const location: Location = {
            id: `nyc-loc-amilia-${orgId}-${locations.length + 1}`,
            cityId: this.cityId,
            type: 'LocationDocument',
            providerId: `nyc-provider-amilia-${orgId}`,
            name: activity.Location.Name || 'Location',
            address: {
              street: activity.Location.Address || '',
              city: activity.Location.City || 'New York',
              state: activity.Location.State || 'NY',
              zipCode: activity.Location.ZipCode || '',
              geographyId: this.inferGeographyFromZip(activity.Location.ZipCode),
            },
            coordinates: {
              latitude: 0, // TODO: Geocode
              longitude: 0,
            },
            facilityType: 'indoor', // Assume indoor (most YMCAs)
            confidence: 'high',
            sourceSystem: 'amilia-api',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          locationMap.set(locationKey, location);
          locations.push(location);
        }
      }
    }

    return locations;
  }

  /**
   * Get providers (YMCA/JCC organizations)
   */
  async getProviders(): Promise<Provider[]> {
    const providers: Provider[] = [];
    const client = this.getClient();

    for (const orgId of this.organizationIds) {
      const org = await client.getOrganization(orgId);

      if (org) {
        providers.push({
          id: `nyc-provider-amilia-${orgId}`,
          cityId: this.cityId,
          type: 'ProviderDocument',
          name: org.Name,
          description: `Programs powered by Amilia`,
          website: org.Website,
          phone: org.Phone,
          email: org.Email,
          providerType: 'nonprofit', // YMCAs/JCCs are nonprofit
          verified: true,
          confidence: 'high',
          sourceSystem: 'amilia-api',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return providers;
  }

  /**
   * Get programs from Amilia activities
   */
  async getPrograms(): Promise<Program[]> {
    const programs: Program[] = [];
    const client = this.getClient();

    for (const orgId of this.organizationIds) {
      const activities = await client.getActivities({ organizationId: orgId });

      for (const activity of activities) {
        // Only include swim-related activities
        if (!this.isSwimActivity(activity.Name, activity.Description)) {
          continue;
        }

        programs.push({
          id: `nyc-prog-amilia-${activity.Id}`,
          cityId: this.cityId,
          type: 'ProgramDocument',
          providerId: `nyc-provider-amilia-${orgId}`,
          locationId: `nyc-loc-amilia-${orgId}-1`, // TODO: Match to actual location
          name: activity.Name,
          description: activity.Description,
          ageMin: activity.MinAge ? activity.MinAge * 12 : undefined, // years to months
          ageMax: activity.MaxAge ? activity.MaxAge * 12 : undefined,
          skillLevel: this.inferSkillLevel(activity.Name),
          sessionLengthMinutes: 60, // Default, could parse from description
          totalSessions: 8, // Default, could parse
          cadence: 'weekly',
          priceRange: activity.Price
            ? {
                min: activity.Price,
                max: activity.Price,
                currency: 'USD',
                unit: 'program',
              }
            : undefined,
          confidence: 'high',
          sourceSystem: 'amilia-api',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return programs;
  }

  /**
   * Get sessions from Amilia activities
   */
  async getSessions(filters?: { startDate?: string; endDate?: string }): Promise<Session[]> {
    const sessions: Session[] = [];
    const client = this.getClient();

    const activityFilters: any = {};
    if (filters?.startDate) activityFilters.startDate = filters.startDate;
    if (filters?.endDate) activityFilters.endDate = filters.endDate;

    for (const orgId of this.organizationIds) {
      const activities = await client.getActivities({
        organizationId: orgId,
        ...activityFilters,
      });

      for (const activity of activities) {
        // Only swim activities
        if (!this.isSwimActivity(activity.Name, activity.Description)) {
          continue;
        }

        const session: Session = {
          id: `nyc-session-amilia-${activity.Id}`,
          cityId: this.cityId,
          type: 'SessionDocument',
          programId: `nyc-prog-amilia-${activity.Id}`,
          providerId: `nyc-provider-amilia-${orgId}`,
          locationId: `nyc-loc-amilia-${orgId}-1`, // TODO: Match to location
          startDate: activity.StartDate || '',
          endDate: activity.EndDate || '',
          daysOfWeek: activity.Schedule?.DaysOfWeek || [],
          timeOfDay: {
            start: activity.Schedule?.StartTime || '00:00',
            end: activity.Schedule?.EndTime || '00:00',
          },
          capacity: activity.MaxCapacity,
          enrolled: activity.CurrentEnrollment,
          availableSpots: activity.MaxCapacity && activity.CurrentEnrollment
            ? activity.MaxCapacity - activity.CurrentEnrollment
            : undefined,
          registrationOpen: true, // Assume open if in API
          registrationUrl: activity.RegistrationUrl || '',
          price: activity.Price
            ? {
                amount: activity.Price,
                currency: 'USD',
              }
            : undefined,
          searchTerms: `${activity.Name} ${activity.Description || ''} amilia ymca jcc`.toLowerCase(),
          geographyIds: [this.inferGeographyFromZip(activity.Location?.ZipCode)],
          confidence: 'high',
          sourceSystem: 'amilia-api',
          lastSyncedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Get provider signup URL
   */
  getProviderSignupUrl(session: Session): string {
    return session.registrationUrl || 'https://www.amilia.com/';
  }

  /**
   * Get transit estimate (use base class fallback)
   */
  async getTransitEstimate(
    origin: Coordinates,
    destination: Coordinates,
    mode: TransitMode
  ): Promise<TransitEstimate | null> {
    const distance = this.calculateDistance(origin, destination);
    const minutes = this.estimateWalkingTime(distance);

    return {
      durationMinutes: minutes,
      distance,
      mode: mode.mode,
      confidence: 'fallback',
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Sync data from Amilia API
   */
  async syncData(): Promise<SyncResult> {
    const errors: any[] = [];
    const client = this.getClient();

    try {
      await client.authenticate();

      const providers = await this.getProviders();
      const locations = await this.getLocations();
      const programs = await this.getPrograms();
      const sessions = await this.getSessions();

      const totalRecords = providers.length + locations.length + programs.length + sessions.length;

      console.log('Amilia Sync Summary:');
      console.log(`  Organizations: ${this.organizationIds.length}`);
      console.log(`  Providers: ${providers.length}`);
      console.log(`  Locations: ${locations.length}`);
      console.log(`  Programs: ${programs.length}`);
      console.log(`  Sessions: ${sessions.length}`);
      console.log(`  Total: ${totalRecords} records`);

      return {
        success: true,
        recordsProcessed: totalRecords,
        recordsCreated: totalRecords,
        recordsUpdated: 0,
        errors: [],
        syncedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      errors.push({ message: error.message });

      return {
        success: false,
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        errors,
        syncedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Validate adapter configuration
   */
  async validateConfig(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check API credentials
    const apiKey = getEnvOptional('AMILIA_API_KEY', '').trim();
    const apiSecret = getEnvOptional('AMILIA_API_SECRET', '').trim();
    if (!apiKey || !apiSecret) {
      errors.push('Amilia API credentials not configured (AMILIA_API_KEY, AMILIA_API_SECRET)');
    }

    // Check organization IDs
    if (this.organizationIds.length === 0) {
      errors.push('No Amilia organization IDs configured in city config');
      warnings.push('Add YMCA/JCC organization IDs to adapterConfig.apiEndpoint');
    }

    // Try to authenticate
    if (errors.length === 0) {
      try {
        await this.getClient().authenticate();
        console.log('✅ Amilia authentication successful');
      } catch (error: any) {
        errors.push(`Authentication failed: ${error.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ========== PRIVATE HELPERS ==========

  private getClient(): AmiliaClient {
    if (!this.client) {
      this.client = new AmiliaClient();
    }

    return this.client;
  }

  /**
   * Check if activity is swim-related
   */
  private isSwimActivity(name: string, description?: string): boolean {
    const text = `${name} ${description || ''}`.toLowerCase();
    const swimKeywords = ['swim', 'aquatic', 'pool', 'water safety', 'lifeguard'];

    return swimKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Infer skill level from activity name
   */
  private inferSkillLevel(name: string): 'beginner' | 'intermediate' | 'advanced' | 'all' {
    const nameLower = name.toLowerCase();

    if (nameLower.includes('beginner') || nameLower.includes('intro') || nameLower.includes('learn to swim')) {
      return 'beginner';
    }
    if (nameLower.includes('intermediate') || nameLower.includes('stroke')) {
      return 'intermediate';
    }
    if (nameLower.includes('advanced') || nameLower.includes('competitive') || nameLower.includes('team')) {
      return 'advanced';
    }

    return 'all';
  }

  /**
   * Infer borough from ZIP code
   */
  private inferGeographyFromZip(zipCode?: string): string {
    if (!zipCode) return 'unknown';

    const zip = parseInt(zipCode);

    // NYC ZIP code ranges (approximate)
    if (zip >= 10001 && zip <= 10282) return 'manhattan';
    if (zip >= 10301 && zip <= 10314) return 'staten-island';
    if (zip >= 10451 && zip <= 10475) return 'bronx';
    if (zip >= 11201 && zip <= 11256) return 'brooklyn';
    if (zip >= 11351 && zip <= 11697) return 'queens';

    return 'unknown';
  }
}
