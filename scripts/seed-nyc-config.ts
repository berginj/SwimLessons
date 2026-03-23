/**
 * Seed NYC City Configuration to Cosmos DB
 * Run this after deploying Azure infrastructure to initialize NYC tenant
 *
 * Usage: tsx scripts/seed-nyc-config.ts
 */

import { CosmosClient } from '@azure/cosmos';
import { CityConfig, TenantCatalog } from '../src/core/contracts/city-config';

// Load environment
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.COSMOS_CONNECTION_STRING;
const databaseId = process.env.COSMOS_DATABASE_ID || 'swimlessons';

if (!connectionString) {
  console.error('❌ COSMOS_CONNECTION_STRING not set in .env file');
  process.exit(1);
}

/**
 * NYC City Configuration
 */
const nycConfig: CityConfig = {
  cityId: 'nyc',
  displayName: 'New York City',
  timezone: 'America/New_York',
  locale: 'en-US',

  // NYC Geographies (5 boroughs)
  geographies: [
    { id: 'manhattan', displayName: 'Manhattan', type: 'borough' },
    { id: 'brooklyn', displayName: 'Brooklyn', type: 'borough' },
    { id: 'queens', displayName: 'Queens', type: 'borough' },
    { id: 'bronx', displayName: 'The Bronx', type: 'borough' },
    { id: 'staten-island', displayName: 'Staten Island', type: 'borough' },
  ],

  // Map default center (Manhattan)
  defaultCenter: {
    latitude: 40.7580,
    longitude: -73.9855,
  },
  defaultZoomLevel: 11,

  // Transit modes (NYC is transit-heavy)
  transitModes: [
    { mode: 'subway', displayName: 'Subway', maxReasonableMinutes: 45 },
    { mode: 'bus', displayName: 'Bus', maxReasonableMinutes: 60 },
    { mode: 'walking', displayName: 'Walking', maxReasonableMinutes: 30 },
  ],
  transitProvider: null, // Mock adapter doesn't use real transit API

  // Registration patterns
  registrationPatterns: [
    {
      name: 'NYC Parks Online',
      urlPattern: 'https://www.nycgovparks.org/programs/{programId}',
      requiresResidency: false,
    },
  ],

  // Typical swim season (June - August)
  typicalSeasonStart: { month: 6, day: 1 },
  typicalSeasonEnd: { month: 8, day: 31 },

  // Adapter configuration (using mock adapter for demo)
  adapterConfig: {
    type: 'nyc-mock',
    syncSchedule: '0 2 * * *', // 2am daily
    confidence: 'medium',
  },

  // Search profile (transit city - proximity matters!)
  searchProfile: {
    defaultSort: 'distance',
    defaultFilters: {
      maxTravelMinutes: 30,
      facilityType: ['indoor', 'outdoor'],
    },
    rankingWeights: {
      recency: 0.2,
      proximity: 0.5, // Very important in NYC
      availability: 0.2,
      quality: 0.1,
    },
    noResultsFallback: {
      expandRadiusMiles: [2, 5, 10],
      relaxDayConstraints: true,
      relaxTimeConstraints: true,
    },
  },

  // Feature flags
  features: {
    transitETA: false, // Disabled for MVP (no real MTA API)
    providerSelfServe: false, // V1 feature
  },

  // Status
  status: 'active',
  onboardedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Main seeding function
 */
async function seedNYCConfig() {
  console.log('🌱 Seeding NYC City Configuration...');
  console.log('');

  const client = new CosmosClient(connectionString!);
  const database = client.database(databaseId);
  const container = database.container('tenants');

  // Create tenant catalog entry
  const tenant: TenantCatalog = {
    id: 'nyc',
    type: 'CityConfig',
    cityConfig: nycConfig,
    status: 'active',
    onboardedAt: new Date().toISOString(),
    onboardedBy: 'seed-script',
  };

  try {
    // Check if already exists
    try {
      const { resource } = await container.item('nyc', 'nyc').read();
      if (resource) {
        console.log('⚠️  NYC config already exists. Updating...');
        await container.item('nyc', 'nyc').replace(tenant);
        console.log('✅ NYC config updated successfully');
        return;
      }
    } catch (error: any) {
      if (error.code !== 404) {
        throw error;
      }
      // Doesn't exist, continue to create
    }

    // Create new
    await container.items.create(tenant);
    console.log('✅ NYC config created successfully');
    console.log('');
    console.log('NYC City Details:');
    console.log(`  City ID: ${nycConfig.cityId}`);
    console.log(`  Display Name: ${nycConfig.displayName}`);
    console.log(`  Timezone: ${nycConfig.timezone}`);
    console.log(`  Geographies: ${nycConfig.geographies.map((g) => g.displayName).join(', ')}`);
    console.log(`  Transit Modes: ${nycConfig.transitModes.map((t) => t.displayName).join(', ')}`);
    console.log(`  Adapter Type: ${nycConfig.adapterConfig.type}`);
    console.log(`  Status: ${nycConfig.status}`);
    console.log('');
    console.log('🎉 Seeding complete!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Run data sync to populate sessions');
    console.log('  2. Test search API: POST /api/search');
    console.log('  3. Deploy Function Apps and Static Web App');
  } catch (error) {
    console.error('❌ Failed to seed NYC config:', error);
    process.exit(1);
  }
}

// Run seeding
seedNYCConfig().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
