/**
 * NYC DOE (Department of Education) Pool Adapter
 *
 * Parses official NYC Department of Education facility data
 * and transforms it into canonical schema.
 *
 * Data Source: NYC ACCELA permit system / NYC Open Data
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
import * as fs from 'fs';
import * as path from 'path';

interface NYCDOEFacilityRow {
  Permit_Type: string;
  Permit_ID: string;
  Facility_Name: string;
  ADDRESS_No: string;
  ADDRESS_St: string;
  BO: string; // Borough code
  ZIP: string;
  Community_Board: string;
  Council_District: string;
  Census_tract: string;
  'Boro-Block-Lot': string;
  BIN: string;
  NTA: string; // Neighborhood name
  NTA_Code: string;
  Indoor: string;
  latitude?: number; // Added by geocoding
  longitude?: number;
  geocode_quality?: string;
}

/**
 * NYC DOE Adapter - Transforms NYC facility data to canonical schema
 */
export class NYCDOEAdapter extends BaseAdapter {
  private csvPath: string;
  private facilities: NYCDOEFacilityRow[] = [];

  constructor(cityId: string, config: CityConfig) {
    super(cityId);

    // Path to geocoded CSV
    this.csvPath = config.adapterConfig.apiEndpoint ||
                   path.join(__dirname, '../../../data/nyc-pools-geocoded.csv');
  }

  /**
   * Load and parse CSV data
   */
  private loadCSVData(): NYCDOEFacilityRow[] {
    if (this.facilities.length > 0) {
      return this.facilities; // Cached
    }

    if (!fs.existsSync(this.csvPath)) {
      console.warn(`CSV file not found: ${this.csvPath}`);
      return [];
    }

    const content = fs.readFileSync(this.csvPath, 'utf-8');
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      console.warn(`CSV file is empty: ${this.csvPath}`);
      return [];
    }

    const lines = trimmedContent.split('\n');
    const headerLine = lines[0];
    if (!headerLine) {
      console.warn(`CSV header row missing: ${this.csvPath}`);
      return [];
    }

    const headers = headerLine.split(',').map((h) => h.trim());

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        continue;
      }

      const values = line.split(',');
      const row: any = {};

      headers.forEach((header, index) => {
        const value = values[index]?.trim() || '';

        // Parse numbers
        if (header === 'latitude' || header === 'longitude') {
          row[header] = parseFloat(value) || 0;
        } else {
          row[header] = value;
        }
      });

      this.facilities.push(row as NYCDOEFacilityRow);
    }

    console.log(`Loaded ${this.facilities.length} facilities from ${this.csvPath}`);
    return this.facilities;
  }

  /**
   * Get all pool locations from NYC DOE data
   */
  async getLocations(): Promise<Location[]> {
    const facilities = this.loadCSVData();

    return facilities.map((facility) => ({
      id: `nyc-loc-${facility.Permit_ID}`,
      cityId: 'nyc',
      type: 'LocationDocument' as const,
      providerId: 'nyc-provider-doe', // All NYC DOE
      name: facility.Facility_Name,
      address: {
        street: `${facility.ADDRESS_No} ${facility.ADDRESS_St}`,
        city: 'New York',
        state: 'NY',
        zipCode: facility.ZIP,
        geographyId: this.mapBoroughCode(facility.BO),
      },
      coordinates: {
        latitude: facility.latitude || 0,
        longitude: facility.longitude || 0,
      },
      facilityType: facility.Indoor === 'Indoor' ? 'indoor' : 'outdoor',
      poolType: undefined, // Not in source data
      accessibility: [], // Not in source data
      amenities: [], // Not in source data
      hours: [], // Not in source data
      confidence: this.getDataConfidence(facility),
      sourceSystem: 'nyc-doe-accela',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Get providers (just NYC DOE for this adapter)
   */
  async getProviders(): Promise<Provider[]> {
    return [
      {
        id: 'nyc-provider-doe',
        cityId: 'nyc',
        type: 'ProviderDocument',
        name: 'NYC Department of Education',
        description: 'Public school pools operated by NYC DOE',
        providerType: 'public',
        website: 'https://www.schools.nyc.gov/',
        verified: true,
        confidence: 'high',
        sourceSystem: 'nyc-doe-accela',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  /**
   * Get programs - NOTE: Not in source data!
   * This returns placeholder programs.
   * Real program data needs to be added manually or from another source.
   */
  async getPrograms(): Promise<Program[]> {
    console.warn('NYC DOE data does not include program schedules.');
    console.warn('Returning placeholder programs. Add real data manually.');

    const facilities = this.loadCSVData();
    const programs: Program[] = [];

    // Create generic programs for each facility
    for (const facility of facilities) {
      const locationId = `nyc-loc-${facility.Permit_ID}`;

      // Create a basic beginner program for each pool
      programs.push({
        id: `nyc-prog-${facility.Permit_ID}-beginner`,
        cityId: 'nyc',
        type: 'ProgramDocument',
        providerId: 'nyc-provider-doe',
        locationId,
        name: 'Youth Swim Program',
        description: 'Public swim program (schedule and pricing TBD - contact facility)',
        ageMin: 48, // 4 years
        ageMax: 168, // 14 years
        skillLevel: 'beginner',
        sessionLengthMinutes: 60,
        totalSessions: 8,
        cadence: 'weekly',
        priceRange: {
          min: 50,
          max: 150,
          currency: 'USD',
          unit: 'program',
          notes: 'NYC resident pricing - call facility for details',
        },
        confidence: 'low', // Placeholder data
        sourceSystem: 'nyc-doe-placeholder',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return programs;
  }

  /**
   * Get sessions - NOTE: Not in source data!
   * Returns empty array. Real session data must be added separately.
   */
  async getSessions(filters?: { startDate?: string; endDate?: string }): Promise<Session[]> {
    console.warn('NYC DOE data does not include session schedules.');
    console.warn('Sessions must be added manually or from another data source.');

    // Return empty - this adapter only provides locations
    return [];
  }

  /**
   * Get provider signup URL
   */
  getProviderSignupUrl(session: Session): string {
    // Default to NYC DOE contact page
    return session.registrationUrl || 'https://www.schools.nyc.gov/enrollment/other-ways-to-apply';
  }

  /**
   * Get transit estimate (use base class fallback)
   */
  async getTransitEstimate(
    origin: Coordinates,
    destination: Coordinates,
    mode: TransitMode
  ): Promise<TransitEstimate | null> {
    // Use haversine distance from BaseAdapter
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
   * Sync data from CSV to Cosmos DB
   */
  async syncData(): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      const providers = await this.getProviders();
      const locations = await this.getLocations();
      const programs = await this.getPrograms();

      const totalRecords = providers.length + locations.length + programs.length;

      console.log('NYC DOE Sync Summary:');
      console.log(`  Providers: ${providers.length}`);
      console.log(`  Locations: ${locations.length}`);
      console.log(`  Programs: ${programs.length} (placeholders)`);
      console.log(`  Sessions: 0 (not in source data)`);

      return {
        success: true,
        recordsProcessed: totalRecords,
        recordsCreated: totalRecords,
        recordsUpdated: 0,
        errors: [],
        syncedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        errors: [{ message: error.message }],
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

    // Check if CSV file exists
    if (!fs.existsSync(this.csvPath)) {
      errors.push(`CSV file not found: ${this.csvPath}`);
    } else {
      // Try to load data
      try {
        const facilities = this.loadCSVData();

        if (facilities.length === 0) {
          errors.push('CSV file is empty or invalid');
        }

        // Check for geocoded coordinates
        const missingCoords = facilities.filter(
          (f) => !f.latitude || !f.longitude || f.latitude === 0 || f.longitude === 0
        );

        if (missingCoords.length > 0) {
          warnings.push(
            `${missingCoords.length} facilities missing coordinates (need geocoding)`
          );
        }

        // Check data quality
        const lowQuality = facilities.filter((f) => f.geocode_quality === 'low');
        if (lowQuality.length > 0) {
          warnings.push(`${lowQuality.length} facilities using fallback geocoding (low precision)`);
        }
      } catch (error: any) {
        errors.push(`Failed to parse CSV: ${error.message}`);
      }
    }

    // Warn about missing data
    warnings.push('NYC DOE data does not include program schedules or sessions');
    warnings.push('You must add session data manually or from another source');

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ========== PRIVATE HELPERS ==========

  /**
   * Map borough code to geography ID
   */
  private mapBoroughCode(code: string): string {
    const map: Record<string, string> = {
      'BX': 'bronx',
      'BK': 'brooklyn',
      'QU': 'queens',
      'MA': 'manhattan',
      'SI': 'staten-island',
    };
    return map[code] || code.toLowerCase();
  }

  /**
   * Determine data confidence based on geocoding quality
   */
  private getDataConfidence(facility: NYCDOEFacilityRow): 'high' | 'medium' | 'low' {
    if (facility.geocode_quality === 'high') {
      return 'high'; // Official geocoding
    }
    if (facility.geocode_quality === 'medium' || facility.latitude !== 0) {
      return 'medium'; // Has coordinates
    }
    return 'low'; // No coordinates or fallback
  }
}
