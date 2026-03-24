/**
 * Sync mock data from NYC adapter to Cosmos DB
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import { CosmosClient } from '@azure/cosmos';

const connectionString = process.env.COSMOS_CONNECTION_STRING;
if (!connectionString) {
  console.error('❌ COSMOS_CONNECTION_STRING not set');
  process.exit(1);
}

async function syncMockData() {
  console.log('🔄 Syncing NYC mock data to Cosmos DB...');
  console.log('');

  // Since we can't easily import the adapter due to path mapping issues,
  // let's create the mock data directly here
  const client = new CosmosClient(connectionString!);
  const db = client.database('swimlessons');
  const container = db.container('sessions');

  // Sample provider
  const provider = {
    id: 'nyc-provider-nycparks',
    cityId: 'nyc',
    type: 'ProviderDocument',
    name: 'NYC Parks & Recreation',
    providerType: 'public',
    verified: true,
    confidence: 'medium',
    sourceSystem: 'nyc-mock-data',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Sample location
  const location = {
    id: 'nyc-loc-hamilton-fish',
    cityId: 'nyc',
    type: 'LocationDocument',
    providerId: 'nyc-provider-nycparks',
    name: 'Hamilton Fish Pool',
    address: {
      street: '128 Pitt St',
      city: 'New York',
      state: 'NY',
      zipCode: '10002',
      geographyId: 'manhattan',
    },
    coordinates: {
      latitude: 40.7180,
      longitude: -73.9850,
    },
    facilityType: 'indoor',
    confidence: 'medium',
    sourceSystem: 'nyc-mock-data',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Sample program
  const program = {
    id: 'nyc-prog-beginner-swim',
    cityId: 'nyc',
    type: 'ProgramDocument',
    providerId: 'nyc-provider-nycparks',
    locationId: 'nyc-loc-hamilton-fish',
    name: 'Beginner Swim Lessons',
    skillLevel: 'beginner',
    ageMin: 48,
    ageMax: 84,
    sessionLengthMinutes: 60,
    totalSessions: 8,
    cadence: 'weekly',
    confidence: 'medium',
    sourceSystem: 'nyc-mock-data',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Sample sessions (5 examples)
  const sessions = [
    {
      id: 'nyc-session-1',
      cityId: 'nyc',
      type: 'SessionDocument',
      programId: 'nyc-prog-beginner-swim',
      providerId: 'nyc-provider-nycparks',
      locationId: 'nyc-loc-hamilton-fish',
      startDate: '2026-06-15',
      endDate: '2026-08-10',
      daysOfWeek: [1, 3, 5],
      timeOfDay: { start: '17:30', end: '18:30' },
      capacity: 12,
      enrolled: 4,
      availableSpots: 8,
      registrationOpen: true,
      registrationUrl: 'https://www.nycgovparks.org/programs/swimming',
      price: { amount: 180, currency: 'USD' as const },
      searchTerms: 'beginner swim lessons hamilton fish pool manhattan nyc parks',
      geographyIds: ['manhattan'],
      confidence: 'medium' as const,
      sourceSystem: 'nyc-mock-data',
      lastSyncedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'nyc-session-2',
      cityId: 'nyc',
      type: 'SessionDocument',
      programId: 'nyc-prog-beginner-swim',
      providerId: 'nyc-provider-nycparks',
      locationId: 'nyc-loc-hamilton-fish',
      startDate: '2026-06-22',
      endDate: '2026-08-17',
      daysOfWeek: [0, 6],
      timeOfDay: { start: '10:00', end: '11:00' },
      capacity: 10,
      enrolled: 7,
      availableSpots: 3,
      registrationOpen: true,
      registrationUrl: 'https://www.nycgovparks.org/programs/swimming',
      price: { amount: 240, currency: 'USD' as const },
      searchTerms: 'weekend beginner swim brooklyn ymca',
      geographyIds: ['brooklyn'],
      confidence: 'medium' as const,
      sourceSystem: 'nyc-mock-data',
      lastSyncedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  console.log('   Upserting documents...');
  await container.items.upsert(provider);
  await container.items.upsert(location);
  await container.items.upsert(program);

  for (const session of sessions) {
    await container.items.upsert(session);
  }

  console.log(`   ✅ Upserted ${1 + 1 + 1 + sessions.length} documents`);
  console.log('');
  console.log('✅ Mock data synced to Cosmos DB!');
  console.log('');
  console.log('Next: Test the search API');
  console.log('  az resource list --resource-group pools-dev-rg');
}

syncMockData().catch((e) => {
  console.error('❌ Failed:', e.message);
  process.exit(1);
});
