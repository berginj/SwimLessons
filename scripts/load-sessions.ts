/**
 * Load Session Data from CSV Template
 *
 * Reads sessions-template.csv (or your custom CSV) and loads into Cosmos DB
 *
 * CSV Format:
 * facility_id,program_name,skill_level,age_min_months,age_max_months,
 * start_date,end_date,days_of_week,time_start,time_end,price,capacity,
 * enrolled,registration_url,notes
 *
 * Usage:
 *   npm run seed:nyc
 *   npx tsx scripts/load-sessions.ts [path-to-csv]
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import type {
  FacilityReferenceDataset,
  FacilityReferenceRecord,
} from '../src/core/contracts/facility-reference';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { CosmosClient } from '@azure/cosmos';

const connectionString = process.env.COSMOS_CONNECTION_STRING;
const databaseId = process.env.COSMOS_DATABASE_ID || 'swimlessons';

if (!connectionString) {
  console.error('❌ COSMOS_CONNECTION_STRING environment variable is not set');
  process.exit(1);
}

interface SessionCSVRow {
  facility_id: string;
  program_name: string;
  skill_level: string;
  age_min_months: string;
  age_max_months: string;
  start_date: string;
  end_date: string;
  days_of_week: string; // "1,3,5" = Mon/Wed/Fri
  time_start: string;
  time_end: string;
  price: string;
  capacity: string;
  enrolled: string;
  registration_url: string;
  notes: string;
}

/**
 * Parse CSV file
 */
function parseCSV(filepath: string): SessionCSVRow[] {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());

  const rows: SessionCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || '';
    });

    rows.push(row as SessionCSVRow);
  }

  return rows;
}

function loadFacilityMetadata(filepath: string): Map<string, FacilityReferenceRecord> {
  if (!fs.existsSync(filepath)) {
    throw new Error(`Canonical facility reference not found: ${filepath}`);
  }

  const dataset = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as FacilityReferenceDataset;
  const facilityMap = new Map<string, FacilityReferenceRecord>();

  for (const facility of dataset.facilities || []) {
    if (facility.sourceFacilityId) {
      facilityMap.set(facility.sourceFacilityId, facility);
    }
  }

  return facilityMap;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

/**
 * Transform CSV row to Session document
 */
function csvToSession(
  row: SessionCSVRow,
  index: number,
  facility: FacilityReferenceRecord
): any {
  const timestamp = new Date().toISOString();
  const facilityId = row.facility_id;
  const programId = `nyc-prog-${facilityId}-${row.skill_level}`;
  const locationId = facility.locationId;

  // Parse days of week ("1,3,5" → [1, 3, 5])
  const daysOfWeek = row.days_of_week.split(',').map((d) => parseInt(d.trim()));

  // Calculate available spots
  const capacity = parseInt(row.capacity) || 0;
  const enrolled = parseInt(row.enrolled) || 0;
  const availableSpots = capacity - enrolled;

  return {
    id: `nyc-session-${facilityId}-${index + 1}`,
    cityId: 'nyc',
    type: 'SessionDocument',
    programId,
    providerId: 'nyc-provider-doe',
    locationId,
    startDate: row.start_date,
    endDate: row.end_date,
    daysOfWeek,
    timeOfDay: {
      start: row.time_start,
      end: row.time_end,
    },
    capacity,
    enrolled,
    availableSpots,
    registrationOpen: availableSpots > 0,
    registrationUrl: row.registration_url,
    price: {
      amount: parseFloat(row.price) || 0,
      currency: 'USD',
    },
    searchTerms: `${row.program_name} ${row.skill_level} ${facility.displayName} nyc doe`.toLowerCase(),
    geographyIds: [], // Will be populated from location
    confidence: 'medium',
    sourceSystem: 'csv-import',
    lastSyncedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function mapBoroughCode(code: string): string {
  const boroughMap: Record<string, string> = {
    BK: 'brooklyn',
    BX: 'bronx',
    MA: 'manhattan',
    QU: 'queens',
    SI: 'staten-island',
  };

  return boroughMap[code] || 'manhattan';
}

function getFallbackCoordinates(geographyId: string) {
  const centers: Record<string, { latitude: number; longitude: number }> = {
    brooklyn: { latitude: 40.6782, longitude: -73.9442 },
    bronx: { latitude: 40.8448, longitude: -73.8648 },
    manhattan: { latitude: 40.7831, longitude: -73.9712 },
    queens: { latitude: 40.7282, longitude: -73.7949 },
    'staten-island': { latitude: 40.5795, longitude: -74.1502 },
  };

  return centers[geographyId] || centers.manhattan;
}

function buildProviderDocument(timestamp: string) {
  return {
    id: 'nyc-provider-doe',
    cityId: 'nyc',
    type: 'ProviderDocument',
    name: 'NYC Department of Education',
    description: 'Public school pools operated by NYC DOE',
    providerType: 'public',
    website: 'https://www.schools.nyc.gov/',
    verified: true,
    confidence: 'medium',
    sourceSystem: 'csv-import',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildLocationDocument(facility: FacilityReferenceRecord, timestamp: string) {
  const geographyId =
    facility.geography.geographyId ||
    mapBoroughCode(facility.geography.boroughCode || '');
  const coordinates = facility.coordinates || getFallbackCoordinates(geographyId);

  return {
    id: facility.locationId,
    cityId: 'nyc',
    type: 'LocationDocument',
    providerId: 'nyc-provider-doe',
    name: facility.officialName || facility.displayName || `Facility ${facility.sourceFacilityId}`,
    address: {
      street: facility.address.street1,
      city: 'New York',
      state: 'NY',
      zipCode: facility.address.postalCode || '',
      geographyId,
    },
    coordinates,
    facilityType:
      facility.facilityType === 'indoor' || facility.facilityType === 'outdoor'
        ? facility.facilityType
        : 'both',
    confidence: 'medium',
    sourceSystem: facility.sourceSystem || 'facility-reference',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildProgramDocument(
  row: SessionCSVRow,
  facility: FacilityReferenceRecord,
  timestamp: string
) {
  return {
    id: `nyc-prog-${row.facility_id}-${row.skill_level}`,
    cityId: 'nyc',
    type: 'ProgramDocument',
    providerId: 'nyc-provider-doe',
    locationId: facility.locationId,
    name: row.program_name,
    description: row.notes,
    ageMin: parseInt(row.age_min_months) || undefined,
    ageMax: parseInt(row.age_max_months) || undefined,
    skillLevel: row.skill_level,
    sessionLengthMinutes: 60,
    totalSessions: 8,
    cadence: 'weekly',
    priceRange: {
      min: parseFloat(row.price) || 0,
      max: parseFloat(row.price) || 0,
      currency: 'USD',
      unit: 'program',
    },
    confidence: 'medium',
    sourceSystem: 'csv-import',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function validateSessionRows(
  rows: SessionCSVRow[],
  facilityMap: Map<string, FacilityReferenceRecord>
) {
  const missingFacilityIds = new Set<string>();

  for (const row of rows) {
    if (!row.facility_id || !facilityMap.has(row.facility_id)) {
      missingFacilityIds.add(row.facility_id || '<blank>');
    }
  }

  if (missingFacilityIds.size > 0) {
    throw new Error(
      `Session seed rows reference facility ids missing from data/nyc-facilities-canonical.json: ${Array.from(
        missingFacilityIds
      ).join(', ')}`
    );
  }
}

/**
 * Load sessions from CSV into Cosmos DB
 */
async function loadSessions(csvPath: string) {
  console.log('🏊 Session Data Loading Pipeline');
  console.log('═'.repeat(80));
  console.log('');

  // Connect to Cosmos DB
  console.log('1️⃣  Connecting to Cosmos DB...');
  const client = new CosmosClient(connectionString!);
  const database = client.database(databaseId);
  const container = database.container('sessions');
  console.log('   ✅ Connected');
  console.log('');

  // Read CSV
  console.log('2️⃣  Reading session data...');
  console.log(`   File: ${csvPath}`);

  if (!fs.existsSync(csvPath)) {
    console.error(`   ❌ File not found: ${csvPath}`);
    process.exit(1);
  }

  const rows = parseCSV(csvPath);
  console.log(`   ✅ Found ${rows.length} sessions`);
  console.log('');

  console.log('3️⃣  Loading supporting provider/location/program data...');
  const facilityMap = loadFacilityMetadata(
    path.join(__dirname, '../data/nyc-facilities-canonical.json')
  );
  validateSessionRows(rows, facilityMap);
  const timestamp = new Date().toISOString();
  const createdLocations = new Set<string>();
  const createdPrograms = new Set<string>();

  await container.items.upsert(buildProviderDocument(timestamp));

  for (const row of rows) {
    const facility = facilityMap.get(row.facility_id);
    if (!facility) {
      continue;
    }

    if (!createdLocations.has(row.facility_id)) {
      await container.items.upsert(buildLocationDocument(facility, timestamp));
      createdLocations.add(row.facility_id);
    }

    const programId = `nyc-prog-${row.facility_id}-${row.skill_level}`;
    if (!createdPrograms.has(programId)) {
      await container.items.upsert(buildProgramDocument(row, facility, timestamp));
      createdPrograms.add(programId);
    }
  }

  console.log(`   ✅ Loaded provider + ${createdLocations.size} locations + ${createdPrograms.size} programs`);
  console.log('');

  // Transform and load sessions
  console.log('4️⃣  Loading sessions...');
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const facility = facilityMap.get(row.facility_id);
    if (!facility) {
      throw new Error(`Facility metadata missing for ${row.facility_id}`);
    }

    const session = csvToSession(row, i, facility);
    const geographyId =
      facility.geography.geographyId ||
      mapBoroughCode(facility.geography.boroughCode || '');
    session.geographyIds = geographyId ? [geographyId] : [];

    try {
      await container.items.upsert(session);
      successCount++;
      console.log(
        `   [${i + 1}/${rows.length}] ✅ ${row.program_name} at facility ${row.facility_id}`
      );
    } catch (error: any) {
      errorCount++;
      console.error(`   [${i + 1}/${rows.length}] ❌ Failed: ${error.message}`);
    }
  }

  console.log('');
  console.log('📊 Load Summary');
  console.log('─'.repeat(80));
  console.log(`Total sessions processed: ${rows.length}`);
  console.log(`Successfully loaded:      ${successCount}`);
  console.log(`Errors:                   ${errorCount}`);
  console.log('');

  // Verify
  console.log('5️⃣  Verifying sessions in Cosmos DB...');
  const { resources: sessions } = await container.items
    .query({
      query: 'SELECT * FROM c WHERE c.type = @type AND c.cityId = @cityId',
      parameters: [
        { name: '@type', value: 'SessionDocument' },
        { name: '@cityId', value: 'nyc' },
      ],
    })
    .fetchAll();

  console.log(`   ✅ Total sessions in DB: ${sessions.length}`);
  console.log('');

  // Summary by skill level
  const bySkill = sessions.reduce((acc: any, s: any) => {
    const skill = s.programId?.includes('beginner')
      ? 'beginner'
      : s.programId?.includes('intermediate')
      ? 'intermediate'
      : s.programId?.includes('advanced')
      ? 'advanced'
      : 'unknown';
    acc[skill] = (acc[skill] || 0) + 1;
    return acc;
  }, {});

  console.log('   By skill level:');
  Object.entries(bySkill).forEach(([skill, count]) => {
    console.log(`     - ${skill}: ${count}`);
  });

  console.log('');
  console.log('✅ Session loading complete!');
  console.log('');
  console.log('🎯 Next steps:');
  console.log('   1. Run npm run validate:seed:nyc before reseeding shared environments');
  console.log('   2. Run npm run build and npm test to verify repo state');
  console.log('   3. For staging, wait for Azure to be writable, then run npm run seed:staging:nyc');
  console.log('');
}

/**
 * Main execution
 */
async function main() {
  const csvPath =
    process.argv[2] || path.join(__dirname, '../data/sessions-template.csv');

  await loadSessions(csvPath);
}

main().catch((error) => {
  console.error('❌ Session loading failed:', error);
  process.exit(1);
});
