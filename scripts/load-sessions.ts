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

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config({ path: '../.env' });

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

/**
 * Parse CSV file
 */
function parseCSV(filepath: string): SessionCSVRow[] {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.trim());

  const rows: SessionCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || '';
    });

    rows.push(row as SessionCSVRow);
  }

  return rows;
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

  // Get locations to populate geography
  console.log('3️⃣  Fetching location data for geography mapping...');
  const locationMap = new Map<string, any>();

  const { resources: locations } = await container.items
    .query({
      query: 'SELECT * FROM c WHERE c.type = @type AND c.cityId = @cityId',
      parameters: [
        { name: '@type', value: 'LocationDocument' },
        { name: '@cityId', value: 'nyc' },
      ],
    })
    .fetchAll();

  for (const location of locations) {
    const facilityId = location.id.replace('nyc-loc-', '');
    locationMap.set(facilityId, location);
  }

  console.log(`   ✅ Loaded ${locationMap.size} locations`);
  console.log('');

  // Transform and load sessions
  console.log('4️⃣  Loading sessions...');
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const session = csvToSession(row, i);

    // Add geography from location
    const location = locationMap.get(row.facility_id);
    if (location) {
      session.geographyIds = [location.address.geographyId];
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
