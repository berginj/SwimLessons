const API_BASE = window.SWIM_API_BASE_URL || '/api';

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
      distanceLabel: 'LES',
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
      distanceLabel: 'Park Slope',
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
      distanceLabel: 'Upper West Side',
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
      distanceLabel: 'Upper East Side',
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
      distanceLabel: 'Astoria',
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
};

const elements = {
  apiStatus: document.getElementById('api-status'),
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
  elements.form.addEventListener('submit', handleSearch);
  await detectApiMode();
  await handleSearch();
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
  elements.summary.textContent = 'Searching...';
  elements.results.innerHTML = '<div class="loading-note">Looking for sessions.</div>';

  try {
    const results = state.mode === 'live' ? await searchLiveApi() : searchDemoData();
    state.results = results;
    renderResults(results);
  } catch (error) {
    console.warn('Search failed, switching to demo mode:', error);
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

  return {
    cityId: elements.cityId.value || 'nyc',
    filters,
    pagination: {
      skip: 0,
      take: 20,
    },
  };
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

      if (Number.isFinite(childAge) && childAge > 0) {
        if (session.skillLevel === 'advanced' && childAge < 84) {
          return false;
        }
      }

      return true;
    })
    .map(createDemoSearchResult);
}

function createDemoSearchResult(session) {
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
    location: {
      id: session.locationId,
      name: session.locationName,
      address: session.locationAddress,
      coordinates: { latitude: 40.75, longitude: -73.98 },
      facilityType: 'indoor',
    },
    program: {
      id: session.programId,
      name: session.programName,
      description: session.programDescription,
      skillLevel: session.skillLevel,
    },
  };
}

function renderResults(results) {
  if (results.length === 0) {
    renderEmptyState('No sessions matched those filters. Try broadening the schedule or borough.');
    return;
  }

  elements.summary.textContent = `${results.length} session${results.length === 1 ? '' : 's'} found`;
  elements.results.innerHTML = '';

  for (const result of results) {
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
      <div class="result-meta">
        <span>${formatDays(result.session?.daysOfWeek || [])}</span>
        <span>${formatTimeRange(result.session?.timeOfDay)}</span>
        <span>${formatDateRange(result.session?.startDate, result.session?.endDate)}</span>
      </div>
      <div class="result-footer">
        <span class="availability-badge">${formatAvailability(result.session?.availableSpots)}</span>
        <button class="secondary-button" type="button">View details</button>
      </div>
    `;

    card.querySelector('button').addEventListener('click', () => openSessionDetails(result));
    elements.results.appendChild(card);
  }
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
  const payload = await fetchApi(`/sessions/${sessionId}?cityId=${encodeURIComponent(cityId)}`);
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
      coordinates: { latitude: 40.75, longitude: -73.98 },
      facilityType: 'indoor',
    },
    program: {
      id: session.programId,
      name: session.programName,
      description: session.programDescription,
      skillLevel: session.skillLevel,
    },
    relatedSessions,
  };
}

function renderDialog(details) {
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

  elements.dialogContent.innerHTML = `
    <div class="detail-grid">
      <div class="detail-block">
        <h2>${escapeHtml(details.program?.name || 'Session details')}</h2>
        <p>${escapeHtml(details.program?.description || 'Detailed session information is available through the linked provider.')}</p>
      </div>
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
      <div class="detail-block">
        <h3>Related sessions</h3>
        ${related}
      </div>
      <div class="detail-actions">
        <a class="primary-button" href="${escapeAttribute(registrationUrl)}" target="_blank" rel="noreferrer">Go to provider signup</a>
      </div>
    </div>
  `;

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
