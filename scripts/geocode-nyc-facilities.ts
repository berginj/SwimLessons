/**
 * Geocode NYC Facilities using NYC GeoClient API
 *
 * This script:
 * 1. Reads NYC pool CSV
 * 2. Calls NYC GeoClient API to get lat/lng
 * 3. Enriches CSV with coordinates
 * 4. Saves to new file
 *
 * NYC GeoClient API: https://api.nyc.gov/geo/geoclient/
 * Sign up: https://developer.cityofnewyork.us/
 *
 * Usage: npx tsx scripts/geocode-nyc-facilities.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

// NYC GeoClient API credentials
const GEOCLIENT_APP_ID = process.env.NYC_GEOCLIENT_APP_ID || '';
const GEOCLIENT_APP_KEY = process.env.NYC_GEOCLIENT_APP_KEY || '';

interface NYCPoolRow {
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
  NTA: string;
  NTA_Code: string;
  Indoor: string;
}

interface GeocodedRow extends NYCPoolRow {
  latitude: number;
  longitude: number;
  geocode_quality: 'high' | 'medium' | 'low' | 'failed';
  geocode_source: string;
}

/**
 * Map borough code to full name for API
 */
function getBoroughName(code: string): string {
  const map: Record<string, string> = {
    'BX': 'BRONX',
    'BK': 'BROOKLYN',
    'QU': 'QUEENS',
    'MA': 'MANHATTAN',
    'SI': 'STATEN ISLAND',
  };
  return map[code] || code;
}

/**
 * Call NYC GeoClient API to geocode an address
 */
async function geocodeAddress(
  houseNumber: string,
  street: string,
  borough: string
): Promise<{ latitude: number; longitude: number; quality: string } | null> {
  if (!GEOCLIENT_APP_ID || !GEOCLIENT_APP_KEY) {
    console.warn('NYC GeoClient credentials not configured. Using fallback geocoding.');
    return geocodeFallback(houseNumber, street, borough);
  }

  const url = new URL('https://api.nyc.gov/geo/geoclient/v2/address.json');
  url.searchParams.set('houseNumber', houseNumber);
  url.searchParams.set('street', street);
  url.searchParams.set('borough', borough);
  url.searchParams.set('app_id', GEOCLIENT_APP_ID);
  url.searchParams.set('app_key', GEOCLIENT_APP_KEY);

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      console.warn(`GeoClient API error for ${houseNumber} ${street}: ${response.status}`);
      return geocodeFallback(houseNumber, street, borough);
    }

    const data = await response.json();

    if (data.address?.latitude && data.address?.longitude) {
      return {
        latitude: parseFloat(data.address.latitude),
        longitude: parseFloat(data.address.longitude),
        quality: 'high',
      };
    }

    console.warn(`No coordinates in response for ${houseNumber} ${street}`);
    return geocodeFallback(houseNumber, street, borough);
  } catch (error) {
    console.error(`Geocoding failed for ${houseNumber} ${street}:`, error);
    return geocodeFallback(houseNumber, street, borough);
  }
}

/**
 * Fallback geocoding using approximate borough centers
 * Used when NYC GeoClient API is unavailable
 */
function geocodeFallback(
  houseNumber: string,
  street: string,
  borough: string
): { latitude: number; longitude: number; quality: string } {
  console.warn(`Using fallback geocoding for ${houseNumber} ${street}, ${borough}`);

  // Approximate borough centers
  const boroughCenters: Record<string, { lat: number; lng: number }> = {
    'BRONX': { lat: 40.8448, lng: -73.8648 },
    'BROOKLYN': { lat: 40.6782, lng: -73.9442 },
    'QUEENS': { lat: 40.7282, lng: -73.7949 },
    'MANHATTAN': { lat: 40.7831, lng: -73.9712 },
    'STATEN ISLAND': { lat: 40.5795, lng: -74.1502 },
  };

  const center = boroughCenters[borough] || { lat: 40.7128, lng: -74.0060 };

  // Add small random offset to spread facilities
  const latOffset = (Math.random() - 0.5) * 0.05; // ~2-3 miles
  const lngOffset = (Math.random() - 0.5) * 0.05;

  return {
    latitude: center.lat + latOffset,
    longitude: center.lng + lngOffset,
    quality: 'low', // Mark as low quality fallback
  };
}

/**
 * Parse CSV file
 */
function parseCSV(filepath: string): NYCPoolRow[] {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  const rows: NYCPoolRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row: any = {};

    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() || '';
    });

    rows.push(row as NYCPoolRow);
  }

  return rows;
}

/**
 * Geocode all facilities in CSV
 */
async function geocodeFacilities(inputPath: string, outputPath: string): Promise<void> {
  console.log('🗺️  NYC Facility Geocoding Pipeline');
  console.log('═'.repeat(80));
  console.log('');

  // Read input CSV
  console.log(`📖 Reading: ${inputPath}`);
  const rows = parseCSV(inputPath);
  console.log(`   Found ${rows.length} facilities`);
  console.log('');

  // Geocode each facility
  console.log('🔍 Geocoding facilities...');
  const geocodedRows: GeocodedRow[] = [];
  let successCount = 0;
  let fallbackCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const progress = `[${i + 1}/${rows.length}]`;

    console.log(`${progress} ${row.Facility_Name}`);
    console.log(`   Address: ${row.ADDRESS_No} ${row.ADDRESS_St}, ${row.BO} ${row.ZIP}`);

    const result = await geocodeAddress(
      row.ADDRESS_No,
      row.ADDRESS_St,
      getBoroughName(row.BO)
    );

    if (result) {
      const geocoded: GeocodedRow = {
        ...row,
        latitude: result.latitude,
        longitude: result.longitude,
        geocode_quality: result.quality as any,
        geocode_source: result.quality === 'high' ? 'NYC GeoClient API' : 'Borough Center Fallback',
      };

      geocodedRows.push(geocoded);

      if (result.quality === 'high') {
        successCount++;
        console.log(`   ✅ Geocoded: ${result.latitude}, ${result.longitude}`);
      } else {
        fallbackCount++;
        console.log(`   ⚠️  Fallback: ${result.latitude}, ${result.longitude}`);
      }
    } else {
      console.log(`   ❌ Failed to geocode`);
    }

    console.log('');

    // Rate limit: NYC GeoClient allows 2,500 requests/day
    // Add small delay to be respectful
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Write output CSV
  console.log('💾 Writing geocoded data...');
  const outputHeaders = [
    ...Object.keys(rows[0]),
    'latitude',
    'longitude',
    'geocode_quality',
    'geocode_source',
  ];

  const outputLines = [
    outputHeaders.join(','),
    ...geocodedRows.map((row) =>
      outputHeaders.map((header) => row[header as keyof GeocodedRow] || '').join(',')
    ),
  ];

  fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');
  console.log(`   ✅ Saved to: ${outputPath}`);
  console.log('');

  // Summary
  console.log('📊 Geocoding Summary');
  console.log('─'.repeat(80));
  console.log(`Total facilities:     ${rows.length}`);
  console.log(`Successfully geocoded: ${successCount} (${Math.round((successCount / rows.length) * 100)}%)`);
  console.log(`Fallback geocoding:    ${fallbackCount} (${Math.round((fallbackCount / rows.length) * 100)}%)`);
  console.log(`Failed:                ${rows.length - successCount - fallbackCount}`);
  console.log('');

  if (fallbackCount > 0) {
    console.log('⚠️  Some facilities used fallback geocoding (approximate locations)');
    console.log('   To improve accuracy:');
    console.log('   1. Sign up for NYC GeoClient API: https://developer.cityofnewyork.us/');
    console.log('   2. Add credentials to .env:');
    console.log('      NYC_GEOCLIENT_APP_ID=your_app_id');
    console.log('      NYC_GEOCLIENT_APP_KEY=your_app_key');
    console.log('   3. Re-run this script');
    console.log('');
  }

  console.log('✅ Geocoding complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review: data/nyc-pools-geocoded.csv');
  console.log('  2. Run: npx tsx scripts/load-nyc-data.ts (loads into Cosmos DB)');
  console.log('  3. Deploy and test search with real NYC facilities!');
  console.log('');
}

/**
 * Main execution
 */
async function main() {
  const inputPath = path.join(process.cwd(), '../data/nyc-pools-sample.csv');
  const outputPath = path.join(process.cwd(), '../data/nyc-pools-geocoded.csv');

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    console.error('   Make sure nyc-pools-sample.csv exists in data/ folder');
    process.exit(1);
  }

  await geocodeFacilities(inputPath, outputPath);
}

main().catch((error) => {
  console.error('❌ Geocoding failed:', error);
  process.exit(1);
});
