/**
 * CSV Adapter - Generic CSV import for cities without APIs
 * This is a reference implementation showing how to implement ICityDataAdapter
 */

import { BaseAdapter } from '@core/contracts/city-adapter';
import {
  Session,
  Provider,
  Location,
  Program,
  SyncResult,
  ValidationResult,
  TransitEstimate,
} from '@core/models/canonical-schema';
import { Coordinates, TransitMode, CityConfig } from '@core/contracts/city-config';

/**
 * CSV Adapter for manual data import
 * Useful for cities without APIs or as a fallback
 */
export class CSVAdapter extends BaseAdapter {
  private config: CityConfig;

  constructor(cityId: string, config: CityConfig) {
    super(cityId);
    this.config = config;
  }

  async getLocations(): Promise<Location[]> {
    // TODO: Implement CSV parsing
    // For now, return empty array
    return [];
  }

  async getPrograms(): Promise<Program[]> {
    // TODO: Implement CSV parsing
    return [];
  }

  async getSessions(filters?: { startDate?: string; endDate?: string }): Promise<Session[]> {
    // TODO: Implement CSV parsing
    // This would parse CSV data from config and transform to canonical schema
    return [];
  }

  getProviderSignupUrl(session: Session): string {
    // Return registration URL from session or fallback
    return session.registrationUrl || 'https://example.com/signup';
  }

  async getTransitEstimate(
    origin: Coordinates,
    destination: Coordinates,
    mode: TransitMode
  ): Promise<TransitEstimate | null> {
    // CSV adapter doesn't have realtime transit
    // Fallback to walking distance estimate
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

  async syncData(): Promise<SyncResult> {
    // TODO: Implement actual sync logic
    // This would:
    // 1. Parse CSV from config
    // 2. Transform to canonical schema
    // 3. Return sync result

    return {
      success: true,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      errors: [],
      syncedAt: new Date().toISOString(),
    };
  }

  async validateConfig(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate adapter-specific config
    if (!this.config.adapterConfig.apiEndpoint && !this.config.adapterConfig.apiKey) {
      warnings.push('No CSV data source configured');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
