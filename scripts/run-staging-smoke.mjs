const baseUrlArg = process.argv[2];
const routerGraphqlUrl = process.env.TRANSIT_ROUTER_GRAPHQL_URL?.trim() || '';
const DEFAULT_TRANSIT_ORIGIN = {
  latitude: 40.758,
  longitude: -73.9855,
};
const ROUTER_DURATION_TOLERANCE_MINUTES = 5;
const ROUTER_ASSERTION_RETRY_COUNT = 6;
const ROUTER_ASSERTION_RETRY_DELAY_MS = 10000;
const OTP_PLAN_CONNECTION_QUERY = `
  query PlanConnection(
    $origin: PlanLabeledLocationInput!
    $destination: PlanLabeledLocationInput!
    $dateTime: PlanDateTimeInput!
    $modes: PlanModesInput!
    $first: Int!
  ) {
    planConnection(
      origin: $origin
      destination: $destination
      dateTime: $dateTime
      modes: $modes
      first: $first
    ) {
      edges {
        node {
          duration
          legs {
            mode
          }
        }
      }
    }
  }
`;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRouterPlan(origin, destination, departureTime) {
  const response = await fetch(routerGraphqlUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      operationName: 'PlanConnection',
      query: OTP_PLAN_CONNECTION_QUERY,
      variables: {
        origin: toOtpLocation(origin, 'Times Square'),
        destination: toOtpLocation(destination, 'Pool'),
        dateTime: {
          earliestDeparture: getOtpDateTime(departureTime),
        },
        first: 1,
        modes: {
          transitOnly: true,
          transit: {
            access: ['WALK'],
            egress: ['WALK'],
            transfer: ['WALK'],
            transit: [{ mode: 'SUBWAY' }],
          },
        },
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from transit router\n${text}`);
  }

  const payload = JSON.parse(text);
  if (payload.errors?.length) {
    throw new Error(
      `Transit router GraphQL errors: ${payload.errors.map((error) => error.message).join('; ')}`
    );
  }

  const itinerary = payload.data?.planConnection?.edges?.[0]?.node;
  if (!itinerary?.duration) {
    throw new Error('Transit router did not return an itinerary for router-backed smoke assertion');
  }

  return {
    durationMinutes: Math.max(1, Math.round(itinerary.duration / 60)),
    modes: Array.isArray(itinerary.legs) ? itinerary.legs.map((leg) => leg.mode).filter(Boolean) : [],
  };
}

function toOtpLocation(coordinates, label) {
  return {
    label,
    location: {
      coordinate: {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      },
    },
  };
}

function getOtpDateTime(departureTime) {
  const timePart = extractOtpTimePart(departureTime) || '17:00:00';

  if (!departureTime) {
    const fallbackDate = getNextNewYorkDateForWeekday(3);
    return `${fallbackDate}T${timePart}${getNewYorkOffsetForDate(fallbackDate)}`;
  }

  const datePart = departureTime.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const fallbackDate = getNextNewYorkDateForWeekday(3);
    return `${fallbackDate}T${timePart}${getNewYorkOffsetForDate(fallbackDate)}`;
  }

  const targetDate = isWithinCurrentServiceWindow(datePart)
    ? datePart
    : getNextNewYorkDateForWeekday(extractDayOfWeek(departureTime));

  return `${targetDate}T${timePart}${getNewYorkOffsetForDate(targetDate)}`;
}

function extractOtpTimePart(departureTime) {
  if (!departureTime) {
    return null;
  }

  const match = departureTime.match(/T(\d{2}:\d{2})(?::(\d{2}))?/);
  if (!match) {
    return null;
  }

  return `${match[1]}:${match[2] || '00'}`;
}

function extractDayOfWeek(departureTime) {
  if (!departureTime) {
    return 2;
  }

  const datePart = departureTime.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return 2;
  }

  return new Date(`${datePart}T12:00:00Z`).getUTCDay();
}

function isWithinCurrentServiceWindow(datePart) {
  const targetDate = new Date(`${datePart}T12:00:00Z`);
  const todayDate = new Date(`${getCurrentNewYorkDate()}T12:00:00Z`);
  const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);
  return diffDays >= 0 && diffDays <= 14;
}

function getNextNewYorkDateForWeekday(targetWeekday) {
  const baseDate = new Date(`${getCurrentNewYorkDate()}T12:00:00Z`);

  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(baseDate);
    candidate.setUTCDate(baseDate.getUTCDate() + offset);

    if (candidate.getUTCDay() === targetWeekday) {
      return formatIsoDate(candidate);
    }
  }

  return formatIsoDate(baseDate);
}

function getCurrentNewYorkDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value || '2026';
  const month = parts.find((part) => part.type === 'month')?.value || '03';
  const day = parts.find((part) => part.type === 'day')?.value || '26';

  return `${year}-${month}-${day}`;
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNewYorkOffsetForDate(datePart) {
  const [year, month, day] = datePart.split('-').map((value) => Number.parseInt(value, 10));
  const noonUtc = new Date(Date.UTC(year || 2026, (month || 1) - 1, day || 1, 12, 0, 0));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  });
  const timeZoneName =
    formatter.formatToParts(noonUtc).find((part) => part.type === 'timeZoneName')?.value ||
    'GMT-4';
  const match = timeZoneName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);

  if (!match) {
    return '-04:00';
  }

  const signAndHours = match[1] || '-4';
  const sign = signAndHours.startsWith('-') ? '-' : '+';
  const hours = signAndHours.replace(/^[+-]/, '').padStart(2, '0');
  const minutes = (match[2] || '00').padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
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

  const childAgeMonths = 60;
  const ageFilteredPayload = await fetchJson(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      cityId: 'nyc',
      filters: {
        childAge: childAgeMonths,
      },
    }),
  });
  assert(
    ageFilteredPayload.success === true,
    'Expected child-age filtered /api/search to return success=true'
  );
  const ageFilteredResults = ageFilteredPayload.data?.results;
  assert(
    Array.isArray(ageFilteredResults) && ageFilteredResults.length > 0,
    'Expected child-age filtered /api/search to return at least one result'
  );

  for (const result of ageFilteredResults.slice(0, 5)) {
    const candidateSessionId = result?.session?.id;
    assert(candidateSessionId, 'Expected child-age filtered results to include session ids');

    const candidatePayload = await fetchJson(
      `${baseUrl}/api/sessions/${encodeURIComponent(candidateSessionId)}?cityId=nyc`
    );
    const program = candidatePayload.data?.program;
    const ageMin = program?.ageMin;
    const ageMax = program?.ageMax;

    assert(
      typeof ageMin === 'number' || typeof ageMax === 'number',
      `Expected ${candidateSessionId} to include program age bounds`
    );
    assert(
      (typeof ageMin !== 'number' || ageMin <= childAgeMonths) &&
        (typeof ageMax !== 'number' || ageMax >= childAgeMonths),
      `Expected ${candidateSessionId} to match childAge ${childAgeMonths}, got ageMin=${ageMin}, ageMax=${ageMax}`
    );
  }
  console.log(`✓ /api/search childAge filter (${ageFilteredResults.length} results for ${childAgeMonths} months)`);

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

  if (routerGraphqlUrl) {
    const routerCandidate = searchResults.find(
      (result) =>
        result?.travelTime?.mode === 'subway' &&
        typeof result?.travelTime?.minutes === 'number' &&
        result?.location?.coordinates &&
        result?.session?.startDate &&
        result?.session?.timeOfDay?.start
    );

    assert(
      routerCandidate,
      'Expected at least one subway-enriched search result when TRANSIT_ROUTER_GRAPHQL_URL is configured'
    );

    const routerSessionPayload = await fetchJson(
      `${baseUrl}/api/sessions/${encodeURIComponent(routerCandidate.session.id)}?cityId=nyc`
    );
    assert(
      routerSessionPayload.success === true,
      'Expected router-backed session details request to return success=true'
    );

    const routerLocation = routerSessionPayload.data?.location?.coordinates;
    assert(
      routerLocation?.latitude && routerLocation?.longitude,
      'Expected router-backed session details to include location coordinates'
    );

    const departureTime = `${routerSessionPayload.data.session.startDate}T${routerSessionPayload.data.session.timeOfDay.start}`;
    const routerPlan = await fetchRouterPlan(DEFAULT_TRANSIT_ORIGIN, routerLocation, departureTime);
    let latestApiMinutes = routerSessionPayload.data?.travelTime?.minutes;
    let matchedRouterDuration =
      typeof latestApiMinutes === 'number' &&
      Math.abs(latestApiMinutes - routerPlan.durationMinutes) <= ROUTER_DURATION_TOLERANCE_MINUTES;

    for (let attempt = 1; !matchedRouterDuration && attempt <= ROUTER_ASSERTION_RETRY_COUNT; attempt += 1) {
      console.log(
        `• router-backed transit not ready yet (attempt ${attempt}/${ROUTER_ASSERTION_RETRY_COUNT}, API ${latestApiMinutes ?? 'n/a'} min vs router ${routerPlan.durationMinutes} min); waiting ${Math.round(ROUTER_ASSERTION_RETRY_DELAY_MS / 1000)}s`
      );
      await sleep(ROUTER_ASSERTION_RETRY_DELAY_MS);

      const retryPayload = await fetchJson(
        `${baseUrl}/api/sessions/${encodeURIComponent(routerCandidate.session.id)}?cityId=nyc`
      );
      latestApiMinutes = retryPayload.data?.travelTime?.minutes;
      matchedRouterDuration =
        typeof latestApiMinutes === 'number' &&
        Math.abs(latestApiMinutes - routerPlan.durationMinutes) <= ROUTER_DURATION_TOLERANCE_MINUTES;
    }

    assert(
      typeof latestApiMinutes === 'number',
      'Expected router-backed session details to include travelTime.minutes'
    );
    assert(
      matchedRouterDuration,
      `Expected API/router transit durations to be within ${ROUTER_DURATION_TOLERANCE_MINUTES} minutes after retrying, got API=${latestApiMinutes}, router=${routerPlan.durationMinutes}`
    );
    console.log(
      `✓ router-backed transit assertion (${routerCandidate.session.id}: API ${latestApiMinutes} min, router ${routerPlan.durationMinutes} min, modes ${routerPlan.modes.join(', ')})`
    );
  } else {
    console.log('• router-backed transit assertion skipped (TRANSIT_ROUTER_GRAPHQL_URL not set)');
  }

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
