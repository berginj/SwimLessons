/**
 * Demo Script - Test Search Flow End-to-End
 * Demonstrates the complete integration without deploying to Azure
 *
 * Usage: tsx scripts/demo-search.ts
 */

import { CosmosDBClient, CONTAINERS } from '../src/infrastructure/cosmos/cosmos-client';
import { TenantRepository } from '../src/infrastructure/cosmos/repositories/tenant-repository';
import { SessionRepository } from '../src/infrastructure/cosmos/repositories/session-repository';
import { CityConfigService } from '../src/services/control-plane/city-config-service';
import { SearchService } from '../src/services/search/search-service';
import { getAdapter } from '../src/adapters';
import { SearchFilters } from '../src/core/contracts/city-config';

// Load environment
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.COSMOS_CONNECTION_STRING;
const databaseId = process.env.COSMOS_DATABASE_ID || 'swimlessons';

if (!connectionString) {
  console.error('❌ COSMOS_CONNECTION_STRING not set');
  console.error('   Run: ./deploy-azure.ps1 to deploy infrastructure first');
  process.exit(1);
}

/**
 * Demo search flow
 */
async function runDemo() {
  console.log('🏊 Swim Lessons Platform - Search Demo');
  console.log('======================================');
  console.log('');

  // Initialize Cosmos DB
  console.log('1️⃣  Connecting to Cosmos DB...');
  const cosmosClient = CosmosDBClient.getInstance({
    connectionString: connectionString!,
    databaseId,
  });
  await cosmosClient.initialize();
  console.log('   ✓ Connected');

  // Initialize repositories
  console.log('');
  console.log('2️⃣  Initializing repositories...');
  const tenantsContainer = cosmosClient.getContainer(CONTAINERS.TENANTS);
  const sessionsContainer = cosmosClient.getContainer(CONTAINERS.SESSIONS);

  const tenantRepo = new TenantRepository(tenantsContainer);
  const sessionRepo = new SessionRepository(sessionsContainer);
  console.log('   ✓ Repositories ready');

  // Initialize services
  console.log('');
  console.log('3️⃣  Initializing services...');
  const cityConfigService = new CityConfigService(tenantRepo);
  const searchService = new SearchService(sessionRepo, cityConfigService);
  console.log('   ✓ Services ready');

  // Get NYC config
  console.log('');
  console.log('4️⃣  Loading NYC configuration...');
  const nycConfig = await cityConfigService.getCityConfig('nyc');
  if (!nycConfig) {
    console.error('   ❌ NYC config not found');
    console.error('   Run: tsx scripts/seed-nyc-config.ts');
    process.exit(1);
  }
  console.log(`   ✓ ${nycConfig.displayName} loaded`);
  console.log(`     Geographies: ${nycConfig.geographies.map((g) => g.displayName).join(', ')}`);

  // Sync mock data
  console.log('');
  console.log('5️⃣  Syncing mock data from adapter...');
  const adapter = getAdapter(nycConfig);
  const syncResult = await adapter.syncData();

  if (!syncResult.success) {
    console.error('   ❌ Sync failed:', syncResult.errors);
    process.exit(1);
  }

  console.log(`   ✓ Synced ${syncResult.recordsUpdated} records`);

  // Get mock sessions and insert
  const sessions = await adapter.getSessions();
  if (sessions.length > 0) {
    console.log(`   ✓ Retrieved ${sessions.length} sessions from adapter`);
    console.log('   ↳ Inserting into Cosmos DB...');
    const insertCount = await sessionRepo.batchUpsertSessions(sessions);
    console.log(`   ✓ Inserted ${insertCount} sessions`);
  }

  // Run sample searches
  console.log('');
  console.log('6️⃣  Running sample searches...');
  console.log('');

  // Search 1: Beginner swim lessons for 5-year-old, weekends, Brooklyn
  console.log('📍 Search 1: Beginner lessons, 5-year-old, weekends, Brooklyn');
  const filters1: SearchFilters = {
    cityId: 'nyc',
    childAge: 60, // 5 years = 60 months
    daysOfWeek: [0, 6], // Saturday, Sunday
    geographyIds: ['brooklyn'],
  };

  const results1 = await searchService.search(
    filters1,
    { field: 'distance', direction: 'asc' },
    { skip: 0, take: 5 }
  );

  console.log(`   Found: ${results1.total} sessions`);
  if (results1.results.length > 0) {
    console.log('   Top Results:');
    results1.results.slice(0, 3).forEach((session, idx) => {
      console.log(
        `     ${idx + 1}. ${session.id} - ${session.startDate} ${session.timeOfDay.start}`
      );
    });
  }

  // Search 2: Any lessons in Manhattan, weekday afternoons
  console.log('');
  console.log('📍 Search 2: Manhattan, weekday afternoons (3pm-6pm)');
  const filters2: SearchFilters = {
    cityId: 'nyc',
    geographyIds: ['manhattan'],
    daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
    timeWindow: {
      earliest: '15:00',
      latest: '18:00',
    },
  };

  const results2 = await searchService.search(
    filters2,
    { field: 'startDate', direction: 'asc' },
    { skip: 0, take: 5 }
  );

  console.log(`   Found: ${results2.total} sessions`);
  if (results2.results.length > 0) {
    console.log('   Top Results:');
    results2.results.slice(0, 3).forEach((session, idx) => {
      console.log(
        `     ${idx + 1}. ${session.id} - ${session.timeOfDay.start}-${session.timeOfDay.end}`
      );
    });
  }

  // Search 3: Advanced lessons, any location
  console.log('');
  console.log('📍 Search 3: Advanced skill level, any location');
  const filters3: SearchFilters = {
    cityId: 'nyc',
    skillLevel: ['advanced'],
  };

  const results3 = await searchService.search(
    filters3,
    { field: 'price', direction: 'asc' },
    { skip: 0, take: 5 }
  );

  console.log(`   Found: ${results3.total} sessions`);

  // Get session details
  if (results1.results.length > 0) {
    console.log('');
    console.log('7️⃣  Fetching session details...');
    const firstSession = results1.results[0];
    const details = await searchService.getSessionById(firstSession.id, 'nyc');

    if (details) {
      console.log(`   Session: ${details.id}`);
      console.log(`   Start Date: ${details.startDate}`);
      console.log(`   Days: ${details.daysOfWeek.join(', ')}`);
      console.log(`   Time: ${details.timeOfDay.start} - ${details.timeOfDay.end}`);
      console.log(`   Price: $${details.price?.amount || 'Contact for price'}`);
      console.log(`   Registration: ${details.registrationOpen ? 'Open' : 'Closed'}`);
      console.log(`   Available Spots: ${details.availableSpots || 'Unknown'}`);
    }
  }

  // Summary
  console.log('');
  console.log('✅ Demo Complete!');
  console.log('');
  console.log('Summary:');
  console.log(`  Total Sessions in DB: ${sessions.length}`);
  console.log(`  Search 1 Results: ${results1.total}`);
  console.log(`  Search 2 Results: ${results2.total}`);
  console.log(`  Search 3 Results: ${results3.total}`);
  console.log('');
  console.log('Next steps:');
  console.log('  - Deploy Function Apps: npm run deploy:functions');
  console.log('  - Deploy Static Web App: npm run deploy:web');
  console.log('  - Test API: curl -X POST $FUNCTION_APP_URL/api/search');
  console.log('');
}

// Run demo
runDemo().catch((error) => {
  console.error('❌ Demo failed:', error);
  process.exit(1);
});
