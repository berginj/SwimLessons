const baseUrlArg = process.argv[2];

if (!baseUrlArg) {
  console.error('Usage: npm run smoke:staging -- <base-url>');
  process.exit(1);
}

const baseUrl = baseUrlArg.replace(/\/+$/, '');

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from ${url}\n${text}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}\n${text}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log(`Smoke testing ${baseUrl}`);

  const rootResponse = await fetch(`${baseUrl}/`);
  assert(rootResponse.ok, `Expected GET / to succeed, received ${rootResponse.status}`);
  console.log('✓ /');

  const citiesPayload = await fetchJson(`${baseUrl}/api/cities?includePreview=true`);
  assert(citiesPayload.success === true, 'Expected /api/cities to return success=true');
  const cities = citiesPayload.data?.cities;
  assert(Array.isArray(cities), 'Expected /api/cities to return a cities array');
  const nycCity = cities.find((city) => city.cityId === 'nyc');
  assert(nycCity, 'Expected /api/cities to include nyc');
  assert(
    Number(nycCity.availableSessionCount) > 0,
    `Expected nyc availableSessionCount > 0, found ${nycCity.availableSessionCount}`
  );
  console.log(`✓ /api/cities (${nycCity.availableSessionCount} NYC sessions)`);

  const searchPayload = await fetchJson(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      cityId: 'nyc',
      filters: {},
    }),
  });

  assert(searchPayload.success === true, 'Expected /api/search to return success=true');
  const searchResults = searchPayload.data?.results;
  const searchTotal = searchPayload.data?.pagination?.total;
  assert(Array.isArray(searchResults), 'Expected /api/search to return a results array');
  assert(Number(searchTotal) > 0, `Expected /api/search total > 0, found ${searchTotal}`);

  const firstResult = searchResults[0];
  const sessionId = firstResult?.session?.id;
  assert(sessionId, 'Expected /api/search to return at least one session id');
  console.log(`✓ /api/search (${searchTotal} results)`);

  const sessionPayload = await fetchJson(
    `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}?cityId=nyc`
  );
  assert(
    sessionPayload.success === true,
    'Expected /api/sessions/{id}?cityId=nyc to return success=true'
  );
  assert(
    sessionPayload.data?.session?.id === sessionId,
    'Expected session-details response to match the searched session id'
  );
  console.log(`✓ /api/sessions/${sessionId}?cityId=nyc`);

  const telemetryPayload = await fetchJson(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      events: [
        {
          eventName: 'SmokeTest',
          timestamp: new Date().toISOString(),
          sessionId: 'staging-smoke',
          cityId: 'nyc',
          platform: 'web',
          properties: {
            source: 'staging-smoke',
          },
        },
      ],
    }),
  });
  assert(telemetryPayload.success === true, 'Expected /api/events to return success=true');
  assert(
    telemetryPayload.data?.accepted === 1,
    `Expected /api/events accepted=1, found ${telemetryPayload.data?.accepted}`
  );
  assert(
    telemetryPayload.data?.rejected === 0,
    `Expected /api/events rejected=0, found ${telemetryPayload.data?.rejected}`
  );
  console.log('✓ /api/events');
  console.log('Staging smoke tests passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
