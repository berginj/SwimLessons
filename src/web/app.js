import telemetry from './telemetry.js';

const API_BASE = window.SWIM_API_BASE_URL || '/api';
const DEFAULT_TRANSIT_ORIGIN_LABEL = 'Times Square';
const DEFAULT_TRANSIT_ORIGIN = { latitude: 40.758, longitude: -73.9855 };
const BROWSER_TRANSIT_ORIGIN_LABEL = 'your current location';

const DAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const TIME_WINDOWS = {
  morning: { earliest: '06:00', latest: '12:00' },
  afternoon: { earliest: '12:00', latest: '17:00' },
  evening: { earliest: '17:00', latest: '21:00' },
};

const demoStore = {
  cities: [
    {
      cityId: 'nyc',
      displayName: 'New York City',
      status: 'active',
      availableSessionCount: 5,
      defaultCenter: { latitude: 40.758, longitude: -73.9855 },
    },
  ],
  sessions: [
    {
      id: 'nyc-session-1',
      cityId: 'nyc',
      programName: 'Beginner Swim Lessons',
      providerName: 'NYC Parks & Recreation',
      locationName: 'Hamilton Fish Pool',
      locationAddress: '128 Pitt St, New York, NY 10002',
      geographyIds: ['manhattan'],
      startDate: '2026-06-15',
      endDate: '2026-08-10',
      daysOfWeek: [1, 3, 5],
      timeOfDay: { start: '17:30', end: '18:30' },
      price: 180,
      availableSpots: 8,
      registrationUrl: 'https://www.nycgovparks.org/programs/swimming',
      programDescription: 'A low-friction beginner class for kids who are getting comfortable in the water.',
      skillLevel: 'beginner',
      programAgeMin: 48,
      programAgeMax: 96,
      distanceLabel: 'LES',
      coordinates: { latitude: 40.718, longitude: -73.9839 },
      providerId: 'nyc-provider-nycparks',
      locationId: 'nyc-location-hamilton-fish',
      programId: 'nyc-program-beginner',
    },
    {
      id: 'nyc-session-2',
      cityId: 'nyc',
      programName: 'Weekend Preschool Swim',
      providerName: 'YMCA Brooklyn',
      locationName: 'Prospect Park YMCA',
      locationAddress: '357 9th St, Brooklyn, NY 11215',
      geographyIds: ['brooklyn'],
      startDate: '2026-06-20',
      endDate: '2026-08-15',
      daysOfWeek: [6],
      timeOfDay: { start: '09:00', end: '10:00' },
      price: 240,
      availableSpots: 3,
      registrationUrl: 'https://ymcanyc.org/',
      programDescription: 'Weekend preschool sessions designed for parents who need a consistent Saturday slot.',
      skillLevel: 'beginner',
      programAgeMin: 36,
      programAgeMax: 60,
      distanceLabel: 'Park Slope',
      coordinates: { latitude: 40.6687, longitude: -73.9804 },
      providerId: 'nyc-provider-ymca',
      locationId: 'nyc-location-prospect-park-ymca',
      programId: 'nyc-program-weekend-preschool',
    },
    {
      id: 'nyc-session-3',
      cityId: 'nyc',
      programName: 'Intermediate School Age',
      providerName: 'JCC Manhattan',
      locationName: 'JCC Manhattan Pool',
      locationAddress: '334 Amsterdam Ave, New York, NY 10023',
      geographyIds: ['manhattan'],
      startDate: '2026-06-18',
      endDate: '2026-08-06',
      daysOfWeek: [2, 4],
      timeOfDay: { start: '16:00', end: '17:00' },
      price: 320,
      availableSpots: 5,
      registrationUrl: 'https://mmjccm.org/',
      programDescription: 'A stronger stroke-development track for kids ready to move beyond basics.',
      skillLevel: 'intermediate',
      programAgeMin: 72,
      programAgeMax: 120,
      distanceLabel: 'Upper West Side',
      coordinates: { latitude: 40.7817, longitude: -73.9818 },
      providerId: 'nyc-provider-jcc',
      locationId: 'nyc-location-jcc',
      programId: 'nyc-program-intermediate',
    },
    {
      id: 'nyc-session-4',
      cityId: 'nyc',
      programName: 'Evening Advanced Track',
      providerName: 'Asphalt Green',
      locationName: 'Asphalt Green Aquatics',
      locationAddress: '555 E 90th St, New York, NY 10128',
      geographyIds: ['manhattan'],
      startDate: '2026-07-06',
      endDate: '2026-08-31',
      daysOfWeek: [1, 2, 3, 4, 5],
      timeOfDay: { start: '18:30', end: '20:00' },
      price: 400,
      availableSpots: 2,
      registrationUrl: 'https://www.asphaltgreen.org/',
      programDescription: 'Evening lane work for older kids building stamina and technique.',
      skillLevel: 'advanced',
      programAgeMin: 96,
      programAgeMax: 144,
      distanceLabel: 'Upper East Side',
      coordinates: { latitude: 40.7796, longitude: -73.9448 },
      providerId: 'nyc-provider-asphalt-green',
      locationId: 'nyc-location-asphalt-green',
      programId: 'nyc-program-advanced',
    },
    {
      id: 'nyc-session-5',
      cityId: 'nyc',
      programName: 'Queens Family Swim Starter',
      providerName: 'Elite Swim Academy',
      locationName: 'Astoria Swim Lab',
      locationAddress: '34-11 31st Ave, Astoria, NY 11106',
      geographyIds: ['queens'],
      startDate: '2026-06-21',
      endDate: '2026-08-16',
      daysOfWeek: [0],
      timeOfDay: { start: '11:00', end: '12:00' },
      price: 275,
      availableSpots: 6,
      registrationUrl: 'https://example.com/elite-swim',
      programDescription: 'A family-friendly starter class with smaller groups and gentler pacing.',
      skillLevel: 'beginner',
      programAgeMin: 36,
      programAgeMax: 72,
      distanceLabel: 'Astoria',
      coordinates: { latitude: 40.7644, longitude: -73.9169 },
      providerId: 'nyc-provider-elite',
      locationId: 'nyc-location-astoria-lab',
      programId: 'nyc-program-family-starter',
    },
  ],
};

const state = {
  mode: 'checking',
  selectedDays: new Set(),
  cities: [],
  results: [],
  activeChildAgeMonths: null,
  routingOrigin: DEFAULT_TRANSIT_ORIGIN,
  routingOriginLabel: DEFAULT_TRANSIT_ORIGIN_LABEL,
  routingOriginSource: 'default',
  locationRequestPending: false,
  locationError: '',
};

const elements = {
  apiStatus: document.getElementById('api-status'),
  travelNote: document.getElementById('travel-note'),
  originStatus: document.getElementById('origin-status'),
  useBrowserLocation: document.getElementById('use-browser-location'),
  resetOrigin: document.getElementById('reset-origin'),
  cityId: document.getElementById('city-id'),
  childAge: document.getElementById('child-age'),
  dayChips: document.getElementById('day-chips'),
  geography: document.getElementById('geography'),
  timeWindow: document.getElementById('time-window'),
  priceMax: document.getElementById('price-max'),
  form: document.getElementById('search-form'),
  results: document.getElementById('results'),
  summary: document.getElementById('results-summary'),
  dialog: document.getElementById('session-dialog'),
  dialogContent: document.getElementById('dialog-content'),
};

init().catch((error) => {
  console.error('Failed to initialize app:', error);
  setMode('demo', 'Demo data');
  state.cities = demoStore.cities;
  renderCityOptions();
  renderEmptyState('The API could not be reached. Demo mode is active.');
});

async function init() {
  renderDayChips();
  setupOriginControls();
  elements.form.addEventListener('submit', handleSearch);
  await detectApiMode();

  // TRACK: Page loaded
  telemetry.trackPageLoaded(state.mode);

  await handleSearch();
}

function setupOriginControls() {
  if (elements.useBrowserLocation) {
    elements.useBrowserLocation.addEventListener('click', handleUseBrowserLocation);
  }

  if (elements.resetOrigin) {
    elements.resetOrigin.addEventListener('click', handleResetOrigin);
  }

  renderOriginControls();
}

function browserLocationSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

function hasBrowserRoutingOrigin() {
  return state.routingOriginSource === 'browser';
}

function getRoutingOrigin() {
  return state.routingOrigin || DEFAULT_TRANSIT_ORIGIN;
}

function getRoutingOriginLabel() {
  return state.routingOriginLabel || DEFAULT_TRANSIT_ORIGIN_LABEL;
}

function renderOriginControls() {
  const geolocationSupported = browserLocationSupported();
  const usingBrowserLocation = hasBrowserRoutingOrigin();

  if (elements.travelNote) {
    elements.travelNote.textContent = usingBrowserLocation
      ? 'Travel times are using your browser-provided location for this session.'
      : 'Travel times default to Times Square until you ask the browser for your current location.';
  }

  if (elements.useBrowserLocation) {
    elements.useBrowserLocation.disabled = !geolocationSupported || state.locationRequestPending;
    elements.useBrowserLocation.textContent = state.locationRequestPending
      ? 'Requesting location...'
      : usingBrowserLocation
        ? 'Refresh browser location'
        : 'Use browser location';
  }

  if (elements.resetOrigin) {
    elements.resetOrigin.hidden = !usingBrowserLocation;
    elements.resetOrigin.disabled = state.locationRequestPending;
  }

  if (!elements.originStatus) {
    return;
  }

  if (!geolocationSupported) {
    elements.originStatus.className = 'origin-status origin-status-error';
    elements.originStatus.textContent =
      'Browser location is unavailable here, so travel times will keep using Times Square.';
    return;
  }

  if (state.locationRequestPending) {
    elements.originStatus.className = 'origin-status origin-status-default';
    elements.originStatus.textContent =
      'Waiting for the browser to confirm your location permission.';
    return;
  }

  if (usingBrowserLocation) {
    elements.originStatus.className = 'origin-status origin-status-browser';
    elements.originStatus.textContent =
      'Using your current location for travel times. This only affects this browser session.';
    return;
  }

  if (state.locationError) {
    elements.originStatus.className = 'origin-status origin-status-error';
    elements.originStatus.textContent = state.locationError;
    return;
  }

  elements.originStatus.className = 'origin-status origin-status-default';
  elements.originStatus.textContent =
    'Using Times Square as the travel-time starting point until you choose browser location.';
}

async function handleUseBrowserLocation() {
  if (!browserLocationSupported()) {
    state.locationError =
      'Browser location is unavailable here, so travel times will keep using Times Square.';
    renderOriginControls();
    return;
  }

  const hadBrowserOrigin = hasBrowserRoutingOrigin();
  state.locationRequestPending = true;
  state.locationError = '';
  renderOriginControls();

  try {
    const position = await requestBrowserLocation();
    state.routingOrigin = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    state.routingOriginLabel = BROWSER_TRANSIT_ORIGIN_LABEL;
    state.routingOriginSource = 'browser';
    telemetry.trackGeolocationGranted();
    renderOriginControls();
    await handleSearch();
  } catch (error) {
    const reason = getGeolocationErrorReason(error);
    state.routingOrigin = DEFAULT_TRANSIT_ORIGIN;
    state.routingOriginLabel = DEFAULT_TRANSIT_ORIGIN_LABEL;
    state.routingOriginSource = 'default';
    state.locationError = getGeolocationErrorMessage(reason);
    telemetry.trackGeolocationDenied(reason);
    renderOriginControls();
    if (hadBrowserOrigin) {
      await handleSearch();
    }
  } finally {
    state.locationRequestPending = false;
    renderOriginControls();
  }
}

async function handleResetOrigin() {
  state.routingOrigin = DEFAULT_TRANSIT_ORIGIN;
  state.routingOriginLabel = DEFAULT_TRANSIT_ORIGIN_LABEL;
  state.routingOriginSource = 'default';
  state.locationError = '';
  renderOriginControls();
  await handleSearch();
}

function requestBrowserLocation() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000,
    });
  });
}

function getGeolocationErrorReason(error) {
  if (!error || typeof error !== 'object') {
    return 'unknown';
  }

  if (error.code === 1) {
    return 'permission_denied';
  }
  if (error.code === 2) {
    return 'position_unavailable';
  }
  if (error.code === 3) {
    return 'timeout';
  }

  return 'unknown';
}

function getGeolocationErrorMessage(reason) {
  switch (reason) {
    case 'permission_denied':
      return 'Location permission was denied, so travel times are using Times Square.';
    case 'position_unavailable':
      return 'The browser could not determine a location, so travel times are using Times Square.';
    case 'timeout':
      return 'Location lookup timed out, so travel times are using Times Square.';
    default:
      return 'The browser could not provide a location, so travel times are using Times Square.';
  }
}

async function detectApiMode() {
  try {
    const payload = await fetchApi('/cities?includePreview=true');
    const cities = payload?.data?.cities;
    if (!Array.isArray(cities) || cities.length === 0) {
      throw new Error('No cities returned from API');
    }

    state.cities = cities;
    renderCityOptions();
    setMode('live', 'Live API');
    return;
  } catch (error) {
    console.warn('Falling back to demo mode:', error);
    state.cities = demoStore.cities;
    renderCityOptions();
    setMode('demo', 'Demo data');
  }
}

function setMode(mode, label) {
  state.mode = mode;
  elements.apiStatus.textContent = label;
  elements.apiStatus.className = `status-pill ${mode === 'live' ? 'status-live' : mode === 'demo' ? 'status-demo' : 'status-pending'}`;
}

function renderCityOptions() {
  elements.cityId.innerHTML = state.cities
    .map((city) => `<option value="${city.cityId}">${escapeHtml(city.displayName)}</option>`)
    .join('');

  const preferredCityId = state.cities.some((city) => city.cityId === 'nyc')
    ? 'nyc'
    : (state.cities[0]?.cityId || '');

  elements.cityId.value = preferredCityId;
}

function renderDayChips() {
  elements.dayChips.innerHTML = '';
  for (const day of DAY_OPTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = day.label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      if (state.selectedDays.has(day.value)) {
        state.selectedDays.delete(day.value);
        button.setAttribute('aria-pressed', 'false');
      } else {
        state.selectedDays.add(day.value);
        button.setAttribute('aria-pressed', 'true');
      }
    });
    elements.dayChips.appendChild(button);
  }
}

async function handleSearch(event) {
  event?.preventDefault();
  const searchStartTime = performance.now();

  elements.summary.textContent = 'Searching...';
  elements.results.innerHTML = '<div class="loading-note">Looking for sessions.</div>';

  // Build filters for tracking
  const requestBody = buildSearchRequest();
  state.activeChildAgeMonths = requestBody.filters.childAge ?? null;

  // TRACK: Search started
  telemetry.trackSearchStarted({
    ...requestBody.filters,
    origin: requestBody.userContext?.origin,
    originSource: state.routingOriginSource,
  });

  try {
    const results = state.mode === 'live' ? await searchLiveApi() : searchDemoData();
    state.results = results;

    const executionTime = performance.now() - searchStartTime;

    // TRACK: Results returned
    telemetry.trackSearchResultsReturned(results.length, executionTime, false, requestBody.filters);

    // TRACK: No results (critical abandonment point!)
    if (results.length === 0) {
      telemetry.trackNoResults(requestBody.filters, false, false);
    }

    renderResults(results);
  } catch (error) {
    console.warn('Search failed, switching to demo mode:', error);

    // TRACK: Error occurred
    telemetry.trackError('SearchAPIError', error.message, 'search');

    setMode('demo', 'Demo fallback');
    state.results = searchDemoData();
    renderResults(state.results);
  }
}

async function searchLiveApi() {
  const requestBody = buildSearchRequest();
  const payload = await fetchApi('/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const results = payload?.data?.results;
  if (!Array.isArray(results)) {
    throw new Error('Search response did not include results');
  }

  return results;
}

function buildSearchRequest() {
  const filters = {};
  const childAge = Number(elements.childAge.value);
  const priceMax = Number(elements.priceMax.value);
  const geography = elements.geography.value;
  const selectedTimeWindow = TIME_WINDOWS[elements.timeWindow.value];

  if (Number.isFinite(childAge) && childAge > 0) {
    filters.childAge = childAge;
  }

  if (state.selectedDays.size > 0) {
    filters.daysOfWeek = Array.from(state.selectedDays);
  }

  if (geography) {
    filters.geographyIds = [geography];
  }

  if (selectedTimeWindow) {
    filters.timeWindow = selectedTimeWindow;
  }

  if (Number.isFinite(priceMax) && priceMax > 0) {
    filters.priceMax = priceMax;
  }

  const requestBody = {
    cityId: elements.cityId.value || 'nyc',
    filters,
    pagination: {
      skip: 0,
      take: 20,
    },
  };

  if (hasBrowserRoutingOrigin()) {
    requestBody.userContext = {
      origin: getRoutingOrigin(),
    };
  }

  return requestBody;
}

function searchDemoData() {
  const request = buildSearchRequest();
  const childAge = request.filters.childAge;
  const geographyIds = request.filters.geographyIds || [];
  const daysOfWeek = request.filters.daysOfWeek || [];
  const timeWindow = request.filters.timeWindow;
  const priceMax = request.filters.priceMax;

  return demoStore.sessions
    .filter((session) => session.cityId === request.cityId)
    .filter((session) => {
      if (geographyIds.length > 0 && !session.geographyIds.some((value) => geographyIds.includes(value))) {
        return false;
      }

      if (daysOfWeek.length > 0 && !session.daysOfWeek.some((value) => daysOfWeek.includes(value))) {
        return false;
      }

      if (timeWindow) {
        const sessionStart = toMinutes(session.timeOfDay.start);
        const earliest = toMinutes(timeWindow.earliest);
        const latest = toMinutes(timeWindow.latest);
        if (sessionStart < earliest || sessionStart >= latest) {
          return false;
        }
      }

      if (Number.isFinite(priceMax) && session.price > priceMax) {
        return false;
      }

      if (Number.isFinite(childAge) && childAge > 0 && !isAgeEligibleForSession(session, childAge)) {
        return false;
      }

      return true;
    })
    .map(createDemoSearchResult);
}

function createDemoSearchResult(session) {
  const travelEstimate = estimateDemoTransit(session);

  return {
    session: {
      id: session.id,
      cityId: session.cityId,
      providerId: session.providerId,
      locationId: session.locationId,
      programId: session.programId,
      startDate: session.startDate,
      endDate: session.endDate,
      daysOfWeek: session.daysOfWeek,
      timeOfDay: session.timeOfDay,
      availableSpots: session.availableSpots,
      registrationUrl: session.registrationUrl,
      price: { amount: session.price, currency: 'USD' },
    },
    provider: {
      id: session.providerId,
      name: session.providerName,
      verified: true,
    },
    distance: travelEstimate.distance,
    travelTime: travelEstimate.travelTime,
    location: {
      id: session.locationId,
      name: session.locationName,
      address: session.locationAddress,
      coordinates: session.coordinates,
      facilityType: 'indoor',
    },
    program: {
      id: session.programId,
      name: session.programName,
      description: session.programDescription,
      skillLevel: session.skillLevel,
      ageMin: session.programAgeMin,
      ageMax: session.programAgeMax,
    },
  };
}

function renderResults(results) {
  if (results.length === 0) {
    renderEmptyState('No sessions matched those filters. Try broadening the schedule or borough.');
    return;
  }

  const ageContext = formatChildAgeContext(state.activeChildAgeMonths);
  elements.summary.textContent = `${results.length} session${results.length === 1 ? '' : 's'} found${
    ageContext ? ` for ${ageContext}` : ''
  }`;
  elements.results.innerHTML = '';

  results.forEach((result, index) => {
    const travelSummary = result.travelTime
      ? `<span class="travel-badge">${escapeHtml(formatTravelSummary(result.travelTime, result.distance))}</span>`
      : '';
    const ageRange = formatAgeRange(result.program);
    const ageFit = formatAgeFitSummary(result.program, state.activeChildAgeMonths);
    const ageSummary = ageRange
      ? `<div class="result-age">
          <span class="age-badge">${escapeHtml(ageRange)}</span>
          <span class="age-fit-note">${escapeHtml(ageFit)}</span>
        </div>`
      : '';
    const trustSignals = [
      formatProviderTrust(result.provider),
      formatSkillLevel(result.program?.skillLevel),
      formatFacilityType(result.location?.facilityType),
    ].filter(Boolean);
    const trustSummary = trustSignals.length > 0
      ? `<div class="result-signals">${trustSignals
          .map((signal, signalIndex) =>
            `<span class="${signalIndex === 0 ? 'trust-badge' : 'signal-badge'}">${escapeHtml(signal)}</span>`
          )
          .join('')}</div>`
      : '';
    const description = result.program?.description
      ? `<p class="result-description">${escapeHtml(result.program.description)}</p>`
      : '';
    const addressLine = result.location?.address
      ? `<p class="result-address">${escapeHtml(result.location.address)}</p>`
      : '';

    const card = document.createElement('article');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-top">
        <div>
          <h3 class="result-title">${escapeHtml(result.program?.name || 'Swim session')}</h3>
          <div class="result-meta">
            <span>${escapeHtml(result.provider?.name || 'Provider')}</span>
            <span>${escapeHtml(result.location?.name || 'Location')}</span>
          </div>
        </div>
        <span class="price-badge">${formatPrice(result.session?.price?.amount)}</span>
      </div>
      ${trustSummary}
      ${addressLine}
      ${description}
      <div class="result-meta">
        <span>${formatDays(result.session?.daysOfWeek || [])}</span>
        <span>${formatTimeRange(result.session?.timeOfDay)}</span>
        <span>${formatDateRange(result.session?.startDate, result.session?.endDate)}</span>
        ${travelSummary}
      </div>
      ${ageSummary}
      <div class="result-footer">
        <span class="availability-badge">${formatAvailability(result.session?.availableSpots)}</span>
        <button class="secondary-button" type="button">View details</button>
      </div>
    `;

    card.querySelector('button').addEventListener('click', () => {
      // TRACK: Session viewed (user clicked to see details)
      telemetry.trackSessionViewed(result.session, index + 1, result.distance);
      openSessionDetails(result);
    });
    elements.results.appendChild(card);
  });
}

function renderEmptyState(message) {
  elements.summary.textContent = 'No results';
  elements.results.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

async function openSessionDetails(result) {
  const cityId = elements.cityId.value || result.session?.cityId || 'nyc';

  try {
    const details = state.mode === 'live'
      ? await fetchSessionDetails(result.session.id, cityId)
      : createDemoSessionDetails(result.session.id);
    renderDialog(details);
  } catch (error) {
    console.warn('Falling back to demo session details:', error);
    renderDialog(createDemoSessionDetails(result.session.id));
  }
}

async function fetchSessionDetails(sessionId, cityId) {
  const params = new URLSearchParams({
    cityId,
  });

  if (hasBrowserRoutingOrigin()) {
    params.set('origin', JSON.stringify(getRoutingOrigin()));
  }

  const payload = await fetchApi(`/sessions/${encodeURIComponent(sessionId)}?${params.toString()}`);
  if (!payload?.data?.session) {
    throw new Error('Session details were not returned');
  }
  return payload.data;
}

function createDemoSessionDetails(sessionId) {
  const session = demoStore.sessions.find((item) => item.id === sessionId);
  if (!session) {
    throw new Error(`Unknown demo session: ${sessionId}`);
  }
  const travelEstimate = estimateDemoTransit(session);

  const relatedSessions = demoStore.sessions
    .filter((item) => item.id !== sessionId && item.providerId === session.providerId)
    .map((item) => ({
      id: item.id,
      startDate: item.startDate,
      daysOfWeek: item.daysOfWeek,
      timeOfDay: item.timeOfDay,
    }));

  return {
    session: createDemoSearchResult(session).session,
    provider: {
      id: session.providerId,
      name: session.providerName,
      verified: true,
    },
    location: {
      id: session.locationId,
      name: session.locationName,
      address: {
        street: session.locationAddress,
      },
      coordinates: session.coordinates,
      facilityType: 'indoor',
    },
    program: {
      id: session.programId,
      name: session.programName,
      description: session.programDescription,
      skillLevel: session.skillLevel,
      ageMin: session.programAgeMin,
      ageMax: session.programAgeMax,
    },
    relatedSessions,
    travelTime: {
      ...travelEstimate.travelTime,
      distance: travelEstimate.distance,
    },
  };
}

function renderDialog(details) {
  const modalOpenTime = Date.now();

  // TRACK: Modal opened
  telemetry.trackModalOpened(details.session?.id);

  const addressText = formatAddress(details.location?.address);
  const related = Array.isArray(details.relatedSessions) && details.relatedSessions.length > 0
    ? `<ul>${details.relatedSessions
        .map(
          (session) =>
            `<li>${formatDate(session.startDate)} · ${formatDays(session.daysOfWeek || [])} · ${formatTimeRange(session.timeOfDay)}</li>`
        )
        .join('')}</ul>`
    : '<p>No related upcoming sessions.</p>';

  const registrationUrl = details.session?.registrationUrl || 'https://example.com/';
  const ageRange = formatAgeRange(details.program);
  const ageFit = formatAgeFitSummary(details.program, state.activeChildAgeMonths);
  const sessionSnapshotItems = [
    formatProviderTrust(details.provider),
    formatSkillLevel(details.program?.skillLevel),
    formatFacilityType(details.location?.facilityType),
    formatAvailability(details.session?.availableSpots),
    formatPriceDetail(details.session?.price?.amount),
  ].filter(Boolean);
  const travelBlock = details.travelTime
    ? `<div class="detail-block">
        <h3>Travel</h3>
        <p>${escapeHtml(formatTravelDetail(details.travelTime))}</p>
      </div>`
    : '';
  const ageBlock = ageRange
    ? `<div class="detail-block">
        <h3>Age fit</h3>
        <p class="detail-age-range">${escapeHtml(ageRange)}</p>
        <p class="detail-age-fit">${escapeHtml(ageFit)}</p>
      </div>`
    : '';
  const sessionSnapshot = sessionSnapshotItems.length > 0
    ? `<div class="detail-block">
        <h3>Session snapshot</h3>
        <ul class="detail-pill-list">
          ${sessionSnapshotItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>`
    : '';

  elements.dialogContent.innerHTML = `
    <div class="detail-grid">
      <div class="detail-block">
        <h2>${escapeHtml(details.program?.name || 'Session details')}</h2>
        <p>${escapeHtml(details.program?.description || 'Detailed session information is available through the linked provider.')}</p>
      </div>
      ${ageBlock}
      ${sessionSnapshot}
      <div class="detail-block">
        <h3>Provider</h3>
        <p>${escapeHtml(details.provider?.name || 'Unknown provider')}</p>
      </div>
      <div class="detail-block">
        <h3>Location</h3>
        <p>${escapeHtml(details.location?.name || 'Unknown location')}</p>
        <p>${escapeHtml(addressText)}</p>
      </div>
      <div class="detail-block">
        <h3>Schedule</h3>
        <p>${formatDateRange(details.session?.startDate, details.session?.endDate)}</p>
        <p>${formatDays(details.session?.daysOfWeek || [])} · ${formatTimeRange(details.session?.timeOfDay)}</p>
      </div>
      ${travelBlock}
      <div class="detail-block">
        <h3>Related sessions</h3>
        ${related}
      </div>
      <div class="detail-actions">
        <a class="primary-button signup-link" href="${escapeAttribute(registrationUrl)}" target="_blank" rel="noreferrer">Go to provider signup</a>
      </div>
    </div>
  `;

  // Add click tracking to signup link
  setTimeout(() => {
    const signupLink = elements.dialogContent.querySelector('.signup-link');
    if (signupLink) {
      signupLink.addEventListener('click', () => {
        // TRACK: Signup clicked (CONVERSION!)
        const position = state.results.findIndex(r => r.session?.id === details.session?.id) + 1;
        telemetry.trackSignupClicked(details.session, position);
      });
    }
  }, 0);

  // Track modal close
  const closeHandler = () => {
    const viewDuration = Date.now() - modalOpenTime;
    telemetry.trackModalClosed(details.session?.id, viewDuration);
    elements.dialog.removeEventListener('close', closeHandler);
  };
  elements.dialog.addEventListener('close', closeHandler, { once: true });

  if (typeof elements.dialog.showModal === 'function') {
    elements.dialog.showModal();
  } else {
    alert('Session details are available, but this browser does not support dialog modals.');
  }
}

async function fetchApi(path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}

function estimateDemoTransit(session) {
  const distance = calculateHaversineDistance(getRoutingOrigin(), session.coordinates);
  const departureHour = Number((session.timeOfDay?.start || '12:00').split(':')[0] || '12');
  const isWeekend = (session.daysOfWeek || []).every((day) => day === 0 || day === 6);

  const candidates = [
    {
      mode: 'walking',
      minutes: (distance / 3.1) * 60,
    },
    {
      mode: 'bus',
      minutes:
        Math.min(10, Math.max(3, distance * 2.2)) +
        getDemoBusWaitMinutes(departureHour, isWeekend) +
        (distance / getDemoBusSpeed(departureHour, isWeekend)) * 60 +
        Math.min(8, Math.max(2, distance * 1.1)) +
        (distance > 4 ? 4 : 0),
    },
    {
      mode: 'subway',
      minutes:
        Math.min(14, Math.max(5, 4 + distance * 0.7)) +
        getDemoSubwayWaitMinutes(departureHour, isWeekend) +
        (distance / getDemoSubwaySpeed(departureHour, isWeekend)) * 60 +
        Math.min(10, Math.max(4, 3 + distance * 0.5)) +
        (distance > 5 ? 5 : distance > 2.5 ? 3 : 0),
    },
  ];

  const best = candidates.reduce((currentBest, candidate) =>
    candidate.minutes < currentBest.minutes ? candidate : currentBest
  );

  return {
    distance: Math.round(distance * 10) / 10,
    travelTime: {
      minutes: Math.max(1, Math.round(best.minutes)),
      mode: best.mode,
      confidence: 'estimated',
    },
  };
}

function isAgeEligibleForSession(session, childAgeMonths) {
  const min = Number(session?.programAgeMin);
  const max = Number(session?.programAgeMax);

  if (!Number.isFinite(min) && !Number.isFinite(max)) {
    return true;
  }

  if (Number.isFinite(min) && childAgeMonths < min) {
    return false;
  }

  if (Number.isFinite(max) && childAgeMonths > max) {
    return false;
  }

  return true;
}

function getDemoSubwaySpeed(hour, isWeekend) {
  if (isWeekend) {
    return 16;
  }
  if ((hour >= 7 && hour < 10) || (hour >= 16 && hour < 19)) {
    return 16.5;
  }
  if (hour >= 22 || hour < 6) {
    return 15;
  }
  if (hour >= 19) {
    return 17;
  }
  return 18;
}

function getDemoBusSpeed(hour, isWeekend) {
  if (isWeekend) {
    return 7.5;
  }
  if ((hour >= 7 && hour < 10) || (hour >= 16 && hour < 19)) {
    return 7.5;
  }
  if (hour >= 22 || hour < 6) {
    return 7;
  }
  if (hour >= 19) {
    return 8;
  }
  return 8.5;
}

function getDemoSubwayWaitMinutes(hour, isWeekend) {
  if (isWeekend) {
    return 7;
  }
  if ((hour >= 7 && hour < 10) || (hour >= 16 && hour < 19)) {
    return 4.5;
  }
  if (hour >= 22 || hour < 6) {
    return 8;
  }
  if (hour >= 19) {
    return 6.5;
  }
  return 5.5;
}

function getDemoBusWaitMinutes(hour, isWeekend) {
  if (isWeekend) {
    return 10;
  }
  if ((hour >= 7 && hour < 10) || (hour >= 16 && hour < 19)) {
    return 6.5;
  }
  if (hour >= 22 || hour < 6) {
    return 11;
  }
  if (hour >= 19) {
    return 8;
  }
  return 7.5;
}

function calculateHaversineDistance(origin, destination) {
  const EARTH_RADIUS_MILES = 3959;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);
  const deltaLat = toRadians(destination.latitude - origin.latitude);
  const deltaLon = toRadians(destination.longitude - origin.longitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatTravelSummary(travelTime, distance) {
  const distanceSuffix = Number.isFinite(distance) ? ` · ${distance.toFixed(1)} mi` : '';
  return `~${travelTime.minutes} min by ${formatTransitMode(travelTime.mode)}${distanceSuffix} · ${formatTravelConfidenceLabel(
    travelTime.confidence
  )}`;
}

function formatTravelDetail(travelTime) {
  const distanceSuffix = Number.isFinite(travelTime.distance)
    ? ` for about ${travelTime.distance.toFixed(1)} miles`
    : '';
  return `${formatTravelConfidenceSentence(travelTime.confidence)} ${travelTime.minutes} min by ${formatTransitMode(
    travelTime.mode
  )} from ${getRoutingOriginLabel()}${distanceSuffix}.`;
}

function formatTransitMode(mode) {
  if (mode === 'subway') {
    return 'subway';
  }
  if (mode === 'bus') {
    return 'bus';
  }
  if (mode === 'walking') {
    return 'walking';
  }
  return mode || 'transit';
}

function formatTravelConfidenceLabel(confidence) {
  if (confidence === 'realtime') {
    return 'live route';
  }
  if (confidence === 'estimated') {
    return 'schedule-based';
  }
  return 'fallback estimate';
}

function formatTravelConfidenceSentence(confidence) {
  if (confidence === 'realtime') {
    return 'Live route:';
  }
  if (confidence === 'estimated') {
    return 'Schedule-based estimate:';
  }
  return 'Fallback estimate:';
}

function formatProviderTrust(provider) {
  if (!provider) {
    return '';
  }

  return provider.verified ? 'Verified provider' : 'Provider details unverified';
}

function formatSkillLevel(skillLevel) {
  if (!skillLevel || skillLevel === 'all') {
    return 'Mixed levels';
  }

  return `${skillLevel.charAt(0).toUpperCase()}${skillLevel.slice(1)} level`;
}

function formatFacilityType(facilityType) {
  switch (facilityType) {
    case 'indoor':
      return 'Indoor pool';
    case 'outdoor':
      return 'Outdoor pool';
    case 'both':
      return 'Indoor/outdoor access';
    default:
      return 'Pool type not listed';
  }
}

function formatPriceDetail(amount) {
  if (!Number.isFinite(amount)) {
    return 'Price TBD';
  }

  return `${formatPrice(amount)} total program price`;
}

function formatAgeRange(program) {
  const min = Number(program?.ageMin);
  const max = Number(program?.ageMax);

  if (Number.isFinite(min) && Number.isFinite(max)) {
    return `Ages ${formatAgeSpan(min)} to ${formatAgeSpan(max)}`;
  }

  if (Number.isFinite(min)) {
    return `Ages ${formatAgeSpan(min)}+`;
  }

  if (Number.isFinite(max)) {
    return `Up to ${formatAgeSpan(max)}`;
  }

  return '';
}

function formatAgeFitSummary(program, childAgeMonths) {
  const ageRange = formatAgeRange(program);
  if (!ageRange) {
    return 'Age range not listed by provider';
  }

  if (!Number.isFinite(childAgeMonths) || childAgeMonths <= 0) {
    return 'Select a child age to see fit guidance';
  }

  const min = Number(program?.ageMin);
  const max = Number(program?.ageMax);

  if (Number.isFinite(min) && childAgeMonths < min) {
    return `Usually starts at ${formatAgeSpan(min)}`;
  }

  if (Number.isFinite(max) && childAgeMonths > max) {
    return `Usually tops out at ${formatAgeSpan(max)}`;
  }

  return `Good fit for ${formatAgeGroup(childAgeMonths)}`;
}

function formatChildAgeContext(childAgeMonths) {
  if (!Number.isFinite(childAgeMonths) || childAgeMonths <= 0) {
    return '';
  }

  return formatAgeGroup(childAgeMonths);
}

function formatAgeSpan(months) {
  if (!Number.isFinite(months) || months <= 0) {
    return '';
  }

  if (months < 12) {
    return `${months} month${months === 1 ? '' : 's'}`;
  }

  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} year${years === 1 ? '' : 's'}`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return `${years} year${years === 1 ? '' : 's'} ${remainingMonths} month${remainingMonths === 1 ? '' : 's'}`;
}

function formatAgeGroup(months) {
  if (!Number.isFinite(months) || months <= 0) {
    return '';
  }

  if (months < 12) {
    return `${months}-month-olds`;
  }

  if (months % 12 === 0) {
    const years = months / 12;
    return `${years}-year-olds`;
  }

  return `${formatAgeSpan(months)} old`;
}

function formatDays(days) {
  if (!Array.isArray(days) || days.length === 0) {
    return 'Flexible schedule';
  }
  return days
    .map((day) => DAY_OPTIONS.find((option) => option.value === day)?.label || '?')
    .join(', ');
}

function formatTimeRange(timeOfDay) {
  if (!timeOfDay?.start || !timeOfDay?.end) {
    return 'Time TBD';
  }
  return `${formatTime(timeOfDay.start)} to ${formatTime(timeOfDay.end)}`;
}

function formatTime(raw) {
  const [hourRaw = '0', minute = '00'] = raw.split(':');
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function formatDateRange(startDate, endDate) {
  if (!startDate) {
    return 'Date TBD';
  }
  return `${formatDate(startDate)}${endDate ? ` to ${formatDate(endDate)}` : ''}`;
}

function formatDate(rawDate) {
  return new Date(rawDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPrice(amount) {
  if (!Number.isFinite(amount)) {
    return 'Price TBD';
  }
  return `$${amount}`;
}

function formatAvailability(availableSpots) {
  if (!Number.isFinite(availableSpots)) {
    return 'Availability unknown';
  }
  if (availableSpots <= 0) {
    return 'Waitlist';
  }
  if (availableSpots === 1) {
    return '1 spot left';
  }
  return `${availableSpots} spots left`;
}

function formatAddress(address) {
  if (!address) {
    return 'Address unavailable';
  }
  if (typeof address === 'string') {
    return address;
  }

  return [address.street, address.city, address.state, address.zipCode].filter(Boolean).join(', ');
}

function toMinutes(value) {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
