/**
 * Data Enrichment Pipeline - Load NYC Data into Cosmos DB
 *
 * Complete pipeline:
 * 1. Reads geocoded CSV
 * 2. Creates NYC DOE adapter
 * 3. Transforms to canonical schema
 * 4. Loads into Cosmos DB
 * 5. Verifies data integrity
 *
 * Usage: npx tsx scripts/load-nyc-data.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: '../.env' });

import { CosmosClient } from '@azure/cosmos';
import { NYCDOEAdapter } from '../dist/adapters/nyc/nyc-doe-adapter.js';
import { CityConfig } from '../dist/core/contracts/city-config.js';

const connectionString = process.env.COSMOS_CONNECTION_STRING;
const databaseId = process.env.COSMOS_DATABASE_ID || 'swimlessons';

if (!connectionString) {
  console.error('❌ COSMOS_CONNECTION_STRING not set in .env');
  process.exit(1);
}

/**
 * Mock city config for adapter
 */
const nycConfig: Partial<CityConfig> = {
  cityId: 'nyc',
  adapterConfig: {
    type: 'nyc-doe',
    syncSchedule: '0 2 * * *',
    apiEndpoint: path.join(__dirname, '../data/nyc-pools-geocoded.csv'),
    confidence: 'high',
  },
} as CityConfig;

/**
 * Main data loading pipeline
 */
async function loadNYCData() {
  console.log('🏊 NYC Data Enrichment Pipeline');
  console.log('═'.repeat(80));
  console.log('');

  // Step 1: Connect to Cosmos DB
  console.log('1️⃣  Connecting to Cosmos DB...');
  const client = new CosmosClient(connectionString!);
  const database = client.database(databaseId);
  const sessionsContainer = database.container('sessions');
  console.log('   ✅ Connected');
  console.log('');

  // Step 2: Initialize NYC DOE Adapter
  console.log('2️⃣  Initializing NYC DOE Adapter...');
  const adapter = new NYCDOEAdapter('nyc', nycConfig as CityConfig);
  console.log('   ✅ Adapter ready');
  console.log('');

  // Step 3: Validate adapter configuration
  console.log('3️⃣  Validating adapter configuration...');
  const validation = await adapter.validateConfig();

  if (!validation.valid) {
    console.error('   ❌ Validation failed:');
    validation.errors.forEach((err) => console.error(`      - ${err}`));
    process.exit(1);
  }

  if (validation.warnings.length > 0) {
    console.warn('   ⚠️  Warnings:');
    validation.warnings.forEach((warn) => console.warn(`      - ${warn}`));
  }

  console.log('   ✅ Validation passed');
  console.log('');

  // Step 4: Load Providers
  console.log('4️⃣  Loading providers...');
  const providers = await adapter.getProviders();
  console.log(`   Found ${providers.length} provider(s)`);

  for (const provider of providers) {
    await sessionsContainer.items.upsert(provider);
    console.log(`   ✅ Upserted: ${provider.name}`);
  }
  console.log('');

  // Step 5: Load Locations
  console.log('5️⃣  Loading locations...');
  const locations = await adapter.getLocations();
  console.log(`   Found ${locations.length} location(s)`);

  let locationCount = 0;
  let geocodedCount = 0;
  let fallbackCount = 0;

  for (const location of locations) {
    await sessionsContainer.items.upsert(location);
    locationCount++;

    if (location.coordinates.latitude !== 0 && location.coordinates.longitude !== 0) {
      if (location.confidence === 'high') {
        geocodedCount++;
      } else {
        fallbackCount++;
      }
    }

    if (locationCount % 5 === 0) {
      console.log(`   Processed ${locationCount}/${locations.length}...`);
    }
  }

  console.log(`   ✅ Loaded ${locationCount} locations`);
  console.log(`      - ${geocodedCount} with accurate coordinates`);
  console.log(`      - ${fallbackCount} with approximate coordinates`);
  console.log(`      - ${locationCount - geocodedCount - fallbackCount} missing coordinates`);
  console.log('');

  // Step 6: Load Programs (placeholders)
  console.log('6️⃣  Loading programs...');
  const programs = await adapter.getPrograms();
  console.log(`   Found ${programs.length} program(s) (placeholders)`);

  for (const program of programs) {
    await sessionsContainer.items.upsert(program);
  }

  console.log(`   ✅ Loaded ${programs.length} placeholder programs`);
  console.log('   ⚠️  Program data is placeholder - add real schedules manually');
  console.log('');

  // Step 7: Summary
  console.log('📊 Data Load Summary');
  console.log('─'.repeat(80));
  console.log(`Total documents inserted: ${providers.length + locations.length + programs.length}`);
  console.log(`  - Providers: ${providers.length}`);
  console.log(`  - Locations: ${locations.length}`);
  console.log(`  - Programs: ${programs.length} (placeholders)`);
  console.log(`  - Sessions: 0 (not in source data)`);
  console.log('');

  console.log('✅ NYC DOE data loaded successfully!');
  console.log('');

  // Step 8: Verification
  console.log('8️⃣  Verifying data in Cosmos DB...');

  const { resources: providerDocs } = await sessionsContainer.items
    .query({
      query: 'SELECT * FROM c WHERE c.type = @type AND c.cityId = @cityId',
      parameters: [
        { name: '@type', value: 'ProviderDocument' },
        { name: '@cityId', value: 'nyc' },
      ],
    })
    .fetchAll();

  const { resources: locationDocs } = await sessionsContainer.items
    .query({
      query: 'SELECT * FROM c WHERE c.type = @type AND c.cityId = @cityId',
      parameters: [
        { name: '@type', value: 'LocationDocument' },
        { name: '@cityId', value: 'nyc' },
      ],
    })
    .fetchAll();

  const { resources: programDocs } = await sessionsContainer.items
    .query({
      query: 'SELECT * FROM c WHERE c.type = @type AND c.cityId = @cityId',
      parameters: [
        { name: '@type', value: 'ProgramDocument' },
        { name: '@cityId', value: 'nyc' },
      ],
    })
    .fetchAll();

  console.log('   Documents in Cosmos DB:');
  console.log(`   - Providers: ${providerDocs.length}`);
  console.log(`   - Locations: ${locationDocs.length}`);
  console.log(`   - Programs: ${programDocs.length}`);
  console.log('');

  if (locationDocs.length !== locations.length) {
    console.warn('   ⚠️  Location count mismatch - some may not have been inserted');
  } else {
    console.log('   ✅ Verification passed');
  }

  console.log('');
  console.log('🎯 Next Steps');
  console.log('─'.repeat(80));
  console.log('1. Review locations in Azure Portal → Cosmos DB → Data Explorer');
  console.log('2. Add real program and session data for top 10 facilities');
  console.log('3. Test search API with real NYC locations');
  console.log('4. Deploy frontend and verify distance calculations work');
  console.log('');
  console.log('📝 To add session data:');
  console.log('   - Use admin portal CSV upload (when built)');
  console.log('   - Or manually create Session documents');
  console.log('   - Or find NYC Parks API for automated sync');
  console.log('');
}

/**
 * Run pipeline
 */
loadNYCData().catch((error) => {
  console.error('❌ Pipeline failed:', error);
  process.exit(1);
});
