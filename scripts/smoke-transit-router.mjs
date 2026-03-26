const routerGraphqlUrl = process.argv[2] || process.env.TRANSIT_ROUTER_GRAPHQL_URL;

if (!routerGraphqlUrl) {
  console.error('Usage: npm run smoke:transit:staging -- <router-graphql-url>');
  process.exit(1);
}

const query = `
  query Routes {
    routes {
      gtfsId
      shortName
      mode
    }
  }
`;

const itineraryQuery = `
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

function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextWeekdayDeparture() {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));

  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = new Date(base);
    candidate.setUTCDate(base.getUTCDate() + offset);
    const weekday = candidate.getUTCDay();

    if (weekday >= 1 && weekday <= 5) {
      return `${formatDate(candidate)}T17:00:00-04:00`;
    }
  }

  return `${formatDate(base)}T17:00:00-04:00`;
}

async function main() {
  console.log(`Smoke testing transit router at ${routerGraphqlUrl}`);

  const response = await fetch(routerGraphqlUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      operationName: 'Routes',
      query,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}\n${text}`);
  }

  const payload = JSON.parse(text);
  if (payload.errors?.length) {
    throw new Error(`GraphQL errors: ${payload.errors.map((error) => error.message).join('; ')}`);
  }

  const routes = payload.data?.routes;
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new Error('Expected transit router to return at least one route');
  }

  const subwayRoutes = routes.filter((route) => route.mode === 'SUBWAY');
  console.log(`✓ router returned ${routes.length} routes`);
  console.log(`✓ subway routes present: ${subwayRoutes.length}`);

  const itineraryResponse = await fetch(routerGraphqlUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      operationName: 'PlanConnection',
      query: itineraryQuery,
      variables: {
        origin: {
          label: 'Times Square',
          location: {
            coordinate: {
              latitude: 40.758,
              longitude: -73.9855,
            },
          },
        },
        destination: {
          label: 'Yankee Stadium',
          location: {
            coordinate: {
              latitude: 40.8296,
              longitude: -73.9262,
            },
          },
        },
        dateTime: {
          earliestDeparture: getNextWeekdayDeparture(),
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

  const itineraryText = await itineraryResponse.text();
  if (!itineraryResponse.ok) {
    throw new Error(`${itineraryResponse.status} ${itineraryResponse.statusText}\n${itineraryText}`);
  }

  const itineraryPayload = JSON.parse(itineraryText);
  if (itineraryPayload.errors?.length) {
    throw new Error(
      `GraphQL itinerary errors: ${itineraryPayload.errors.map((error) => error.message).join('; ')}`
    );
  }

  const itinerary = itineraryPayload.data?.planConnection?.edges?.[0]?.node;
  if (!itinerary) {
    throw new Error('Expected transit router to return a subway itinerary from Times Square to Yankee Stadium');
  }

  const itineraryModes = Array.isArray(itinerary.legs) ? itinerary.legs.map((leg) => leg.mode) : [];
  if (!itineraryModes.includes('SUBWAY')) {
    throw new Error(`Expected itinerary to include SUBWAY leg, got: ${itineraryModes.join(', ') || 'none'}`);
  }

  console.log(`✓ itinerary returned ${Math.round((itinerary.duration || 0) / 60)} min with modes: ${itineraryModes.join(', ')}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
