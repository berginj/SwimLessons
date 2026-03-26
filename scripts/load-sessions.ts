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
 * Usage: npx tsx scripts/load-sessions.ts [path-to-csv]
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { CosmosClient } from '@azure/cosmos';

const connectionString = process.env.COSMOS_CONNECTION_STRING;
const databaseId = process.env.COSMOS_DATABASE_ID || 'swimlessons';

if (!connectionString) {
  console.error('❌ COSMOS_CONNECTION_STRING not set in .env');
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

interface FacilityCSVRow {
  Permit_ID: string;
  Facility_Name: string;
  ADDRESS_No: string;
  ADDRESS_St: string;
  BO: string;
  ZIP: string;
  Indoor: string;
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

function loadFacilityMetadata(filepath: string): Map<string, FacilityCSVRow> {
  const facilityMap = new Map<string, FacilityCSVRow>();

  if (!fs.existsSync(filepath)) {
    return facilityMap;
  }

  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || '';
    });

    const facility = row as unknown as FacilityCSVRow;
    if (facility.Permit_ID) {
      facilityMap.set(facility.Permit_ID, facility);
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
function csvToSession(row: SessionCSVRow, index: number): any {
  const timestamp = new Date().toISOString();
  const facilityId = row.facility_id;
  const programId = `nyc-prog-${facilityId}-${row.skill_level}`;
  const locationId = `nyc-loc-${facilityId}`;

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
    searchTerms: `${row.program_name} ${row.skill_level} nyc doe`.toLowerCase(),
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

function buildLocationDocument(facility: FacilityCSVRow, timestamp: string) {
  const geographyId = mapBoroughCode(facility.BO);
  const coordinates = getFallbackCoordinates(geographyId);

  return {
    id: `nyc-loc-${facility.Permit_ID}`,
    cityId: 'nyc',
    type: 'LocationDocument',
    providerId: 'nyc-provider-doe',
    name: facility.Facility_Name || `Facility ${facility.Permit_ID}`,
    address: {
      street: `${facility.ADDRESS_No} ${facility.ADDRESS_St}`.trim(),
      city: 'New York',
      state: 'NY',
      zipCode: facility.ZIP,
      geographyId,
    },
    coordinates,
    facilityType: facility.Indoor === 'Indoor' ? 'indoor' : 'outdoor',
    confidence: 'medium',
    sourceSystem: 'csv-import',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildProgramDocument(
  row: SessionCSVRow,
  facility: FacilityCSVRow,
  timestamp: string
) {
  return {
    id: `nyc-prog-${row.facility_id}-${row.skill_level}`,
    cityId: 'nyc',
    type: 'ProgramDocument',
    providerId: 'nyc-provider-doe',
    locationId: `nyc-loc-${facility.Permit_ID}`,
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
  const facilityMap = loadFacilityMetadata(path.join(__dirname, '../data/nyc-pools-sample.csv'));
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
    const session = csvToSession(row, i);

    const facility = facilityMap.get(row.facility_id);
    if (facility) {
      session.geographyIds = [mapBoroughCode(facility.BO)];
    }

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
  console.log('   1. Test search API with real sessions');
  console.log('   2. Deploy frontend to see sessions in UI');
  console.log('   3. Launch pilot with real users!');
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
