import { expect, test } from '@playwright/test';

const browserOrigin = {
  latitude: 40.7128,
  longitude: -74.006,
};

const searchResults = [
  {
    session: {
      id: 'nyc-session-geo-1',
      cityId: 'nyc',
      providerId: 'provider-1',
      locationId: 'location-1',
      programId: 'program-1',
      startDate: '2026-06-22',
      endDate: '2026-08-17',
      daysOfWeek: [1, 3, 5],
      timeOfDay: { start: '08:00', end: '09:00' },
      availableSpots: 15,
      registrationUrl: 'https://example.com/signup',
      price: { amount: 70, currency: 'USD' },
    },
    provider: {
      id: 'provider-1',
      name: 'NYC Department of Education',
      verified: true,
    },
    distance: 4.1,
    travelTime: {
      minutes: 17,
      mode: 'subway',
      confidence: 'estimated',
    },
    location: {
      id: 'location-1',
      name: 'George Washington H.S.',
      address: '549 Audubon Ave, New York, NY 10040',
      coordinates: { latitude: 40.7831, longitude: -73.9712 },
      facilityType: 'indoor',
    },
    program: {
      id: 'program-1',
      name: 'Morning Beginner',
      description: 'Early morning beginner session.',
      skillLevel: 'beginner',
    },
  },
];

const sessionDetails = {
  session: searchResults[0].session,
  provider: searchResults[0].provider,
  location: {
    id: 'location-1',
    name: 'George Washington H.S.',
    address: {
      street: '549 Audubon Ave',
      city: 'New York',
      state: 'NY',
      zipCode: '10040',
    },
    coordinates: { latitude: 40.7831, longitude: -73.9712 },
    facilityType: 'indoor',
  },
  program: searchResults[0].program,
  relatedSessions: [],
  travelTime: {
    minutes: 17,
    mode: 'subway',
    distance: 4.1,
    confidence: 'estimated',
  },
};

async function registerApiMocks(page, capturedSearchBodies, capturedSessionDetailOrigins, capturedTelemetryRequests) {
  await page.route('**/api/cities?includePreview=true', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          cities: [
            {
              cityId: 'nyc',
              displayName: 'New York City',
              status: 'active',
              availableSessionCount: 10,
              defaultCenter: { latitude: 40.758, longitude: -73.9855 },
            },
          ],
        },
      }),
    });
  });

  await page.route('**/api/search', async (route) => {
    const requestBody = route.request().postDataJSON();
    capturedSearchBodies.push(requestBody);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          results: searchResults,
          pagination: {
            skip: 0,
            take: 20,
            total: searchResults.length,
            hasMore: false,
          },
        },
      }),
    });
  });

  await page.route('**/api/sessions/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const origin = requestUrl.searchParams.get('origin');
    if (origin) {
      capturedSessionDetailOrigins.push(origin);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: sessionDetails,
      }),
    });
  });

  await page.route('**/api/events', async (route) => {
    const requestBody = route.request().postDataJSON();
    capturedTelemetryRequests.push(requestBody);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          accepted: Array.isArray(requestBody?.events) ? requestBody.events.length : 0,
          rejected: 0,
        },
      }),
    });
  });
}

function getTelemetryEvents(capturedTelemetryRequests) {
  return capturedTelemetryRequests.flatMap((request) =>
    Array.isArray(request?.events) ? request.events : []
  );
}

test.describe('browser location transit regression', () => {
  test.describe('granted location', () => {
    test.use({
      permissions: ['geolocation'],
      geolocation: browserOrigin,
    });

    test('uses browser geolocation for search and session details', async ({ page }) => {
      const capturedSearchBodies: any[] = [];
      const capturedSessionDetailOrigins: string[] = [];
      const capturedTelemetryRequests: any[] = [];

      await registerApiMocks(
        page,
        capturedSearchBodies,
        capturedSessionDetailOrigins,
        capturedTelemetryRequests
      );

      await page.goto('/');

      await expect(page.getByText(/Using Times Square as the travel-time starting point/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Use browser location' })).toBeVisible();

      await page.getByRole('button', { name: 'Use browser location' }).click();

      await expect(
        page.getByText(/Using your current location for travel times/i)
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Use Times Square instead' })).toBeVisible();

      await expect
        .poll(() => capturedSearchBodies.length)
        .toBeGreaterThan(1);

      const latestSearchBody = capturedSearchBodies.at(-1);
      expect(latestSearchBody?.userContext?.origin).toEqual(browserOrigin);

      await page.getByRole('button', { name: 'View details' }).click();

      await expect(
        page.getByText(
          'Schedule-based estimate: 17 min by subway from your current location for about 4.1 miles.'
        )
      ).toBeVisible();
      await expect(
        page.getByText('~17 min by subway · 4.1 mi · schedule-based')
      ).toBeVisible();

      await expect
        .poll(() => getTelemetryEvents(capturedTelemetryRequests).length)
        .toBeGreaterThan(0);

      const telemetryEvents = getTelemetryEvents(capturedTelemetryRequests);

      const geolocationGrantedEvent = telemetryEvents.find(
        (event) => event.eventName === 'GeolocationGranted'
      );
      expect(geolocationGrantedEvent).toMatchObject({
        cityId: 'nyc',
        platform: 'web',
        properties: {},
      });

      const latestSearchStartedEvent = [...telemetryEvents]
        .reverse()
        .find((event) => event.eventName === 'SearchStarted');
      expect(latestSearchStartedEvent?.properties?.hasLocation).toBe(true);
      expect(latestSearchStartedEvent?.properties?.filters?.origin).toEqual(browserOrigin);

      await expect
        .poll(() => capturedSessionDetailOrigins.length)
        .toBeGreaterThan(0);

      const latestOrigin = JSON.parse(capturedSessionDetailOrigins.at(-1) || '{}');
      expect(latestOrigin).toEqual(browserOrigin);

      await page.getByRole('button', { name: 'Close' }).click();

      const searchCountBeforeReset = capturedSearchBodies.length;
      await page.getByRole('button', { name: 'Use Times Square instead' }).click();

      await expect(page.getByText(/Using Times Square as the travel-time starting point/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Use Times Square instead' })).toBeHidden();

      await expect
        .poll(() => capturedSearchBodies.length)
        .toBeGreaterThan(searchCountBeforeReset);

      const resetSearchBody = capturedSearchBodies.at(-1);
      expect(resetSearchBody?.userContext).toBeUndefined();

      const latestResetSearchStartedEvent = [...getTelemetryEvents(capturedTelemetryRequests)]
        .reverse()
        .find((event) => event.eventName === 'SearchStarted');
      expect(latestResetSearchStartedEvent?.properties?.hasLocation).toBe(false);
      expect(latestResetSearchStartedEvent?.properties?.filters?.origin).toBeUndefined();
      expect(latestResetSearchStartedEvent?.properties?.filters?.originSource).toBe('default');
    });
  });

  test('keeps Times Square fallback when browser location is denied', async ({ page }) => {
    const capturedSearchBodies: any[] = [];
    const capturedSessionDetailOrigins: string[] = [];
    const capturedTelemetryRequests: any[] = [];

    await registerApiMocks(
      page,
      capturedSearchBodies,
      capturedSessionDetailOrigins,
      capturedTelemetryRequests
    );

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_success, error) => {
            error({
              code: 1,
              message: 'Permission denied',
            });
          },
          watchPosition: () => 0,
          clearWatch: () => {},
        },
      });
    });

    await page.goto('/');

    await expect(page.getByText(/Using Times Square as the travel-time starting point/i)).toBeVisible();
    expect(capturedSearchBodies).toHaveLength(1);
    expect(capturedSearchBodies[0]?.userContext).toBeUndefined();

    await page.getByRole('button', { name: 'Use browser location' }).click();

    await expect(
      page.getByText(/Location permission was denied, so travel times are using Times Square/i)
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use Times Square instead' })).toBeHidden();
    expect(capturedSearchBodies).toHaveLength(1);
    expect(capturedSessionDetailOrigins).toHaveLength(0);

    await expect
      .poll(() => getTelemetryEvents(capturedTelemetryRequests).length)
      .toBeGreaterThan(0);

    const telemetryEvents = getTelemetryEvents(capturedTelemetryRequests);
    const deniedEvent = telemetryEvents.find((event) => event.eventName === 'GeolocationDenied');
    expect(deniedEvent).toMatchObject({
      cityId: 'nyc',
      platform: 'web',
      properties: {
        browserReason: 'permission_denied',
      },
    });

    const latestSearchStartedEvent = [...telemetryEvents]
      .reverse()
      .find((event) => event.eventName === 'SearchStarted');
    expect(latestSearchStartedEvent?.properties?.hasLocation).toBe(false);
    expect(latestSearchStartedEvent?.properties?.filters?.origin).toBeUndefined();
    expect(latestSearchStartedEvent?.properties?.filters?.originSource).toBe('default');
  });
});
