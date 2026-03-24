/**
 * Telemetry Client for Frontend
 * Tracks user behavior and abandonment patterns
 *
 * CRITICAL: This tracks WHERE users abandon the flow so we can optimize
 */

const TELEMETRY_ENDPOINT = '/api/events';

// Session management
let sessionId = null;
let searchStartTime = null;
let sessionsViewedInCurrentSearch = 0;

/**
 * Get or create session ID
 */
function getSessionId() {
  if (!sessionId) {
    sessionId = sessionStorage.getItem('telemetry_session_id');
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      sessionStorage.setItem('telemetry_session_id', sessionId);
    }
  }
  return sessionId;
}

/**
 * Base event structure
 */
function createBaseEvent(eventName) {
  return {
    eventName,
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    cityId: 'nyc', // TODO: Get from current city selection
    userId: null, // Anonymous for MVP
    platform: 'web',
    userAgent: navigator.userAgent,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}

/**
 * Send event to backend (fire-and-forget)
 */
function sendEvent(event) {
  // Don't block user experience if telemetry fails
  fetch(TELEMETRY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [event] }),
    keepalive: true, // Send even if page is closing
  }).catch((err) => {
    // Silent fail - telemetry shouldn't break UX
    console.debug('Telemetry failed:', err);
  });
}

// ============================================================================
// CRITICAL EVENTS - Track User Journey and Abandonment
// ============================================================================

/**
 * Track page load
 * ABANDONMENT POINT: User lands but doesn't search
 */
export function trackPageLoaded(mode) {
  const event = {
    ...createBaseEvent('PageLoaded'),
    mode, // 'live' or 'demo'
    referrer: document.referrer || 'direct',
  };
  sendEvent(event);
}

/**
 * Track search started
 * CRITICAL: This is entry point to funnel
 */
export function trackSearchStarted(filters) {
  searchStartTime = Date.now();
  sessionsViewedInCurrentSearch = 0;

  const event = {
    ...createBaseEvent('SearchStarted'),
    filters,
    hasLocation: filters.origin ? true : false,
    filterCount: Object.keys(filters).filter((k) => filters[k] !== undefined && filters[k] !== null).length,
  };
  sendEvent(event);
}

/**
 * Track search results returned
 * ABANDONMENT POINT: User gets results but doesn't view any
 */
export function trackSearchResultsReturned(resultCount, executionTimeMs, relaxationApplied) {
  const event = {
    ...createBaseEvent('SearchResultsReturned'),
    resultCount,
    executionTimeMs,
    relaxationApplied,
    searchDurationMs: searchStartTime ? Date.now() - searchStartTime : null,
  };
  sendEvent(event);
}

/**
 * Track no results
 * CRITICAL ABANDONMENT POINT: User gets zero results (high abandonment risk!)
 */
export function trackNoResults(filters, relaxationAttempted, relaxationSucceeded) {
  const event = {
    ...createBaseEvent('NoResults'),
    filters,
    relaxationAttempted,
    relaxationSucceeded,
    // Help identify coverage gaps
    requestedGeographyIds: filters.geographyIds,
    requestedDays: filters.daysOfWeek,
    requestedAge: filters.childAge,
  };
  sendEvent(event);
}

/**
 * Track session viewed
 * CRITICAL: Track position (if user scrolls deep, ranking is poor)
 */
export function trackSessionViewed(session, position, distance) {
  sessionsViewedInCurrentSearch++;

  const event = {
    ...createBaseEvent('SessionViewed'),
    sessionId: session.id,
    position, // 1-based rank in results
    distance,
    price: session.price,
    availableSpots: session.availableSpots,
    skillLevel: session.skillLevel,
    // Context for abandonment analysis
    sessionsViewedSoFar: sessionsViewedInCurrentSearch,
    timeFromSearchMs: searchStartTime ? Date.now() - searchStartTime : null,
  };
  sendEvent(event);
}

/**
 * Track signup clicked (CONVERSION!)
 * SUCCESS: User completed the journey
 */
export function trackSignupClicked(session, position) {
  const event = {
    ...createBaseEvent('SignupClicked'),
    sessionId: session.id,
    destinationUrl: session.registrationUrl,
    position,
    price: session.price,
    // Funnel metrics
    searchToClickDurationMs: searchStartTime ? Date.now() - searchStartTime : null,
    sessionsViewedBefore: sessionsViewedInCurrentSearch,
  };
  sendEvent(event);

  // Reset search tracking
  searchStartTime = null;
  sessionsViewedInCurrentSearch = 0;
}

/**
 * Track filter changed
 * Helps understand search refinement behavior
 */
export function trackFilterChanged(filterName, oldValue, newValue, resultCountBefore, resultCountAfter) {
  const event = {
    ...createBaseEvent('FilterChanged'),
    filterName,
    oldValue,
    newValue,
    resultCountBefore,
    resultCountAfter,
    resultImprovement: resultCountAfter - resultCountBefore,
  };
  sendEvent(event);
}

/**
 * Track geolocation permission
 * ABANDONMENT POINT: User denies location (might limit results)
 */
export function trackGeolocationDenied(reason) {
  const event = {
    ...createBaseEvent('GeolocationDenied'),
    browserReason: reason,
  };
  sendEvent(event);
}

/**
 * Track geolocation granted
 * POSITIVE: User trusts us with location
 */
export function trackGeolocationGranted() {
  const event = {
    ...createBaseEvent('GeolocationGranted'),
  };
  sendEvent(event);
}

/**
 * Track page abandonment
 * CRITICAL: User leaves without converting (track when/why)
 */
export function trackPageAbandonment() {
  // Track if user had searched but didn't click signup
  if (searchStartTime && sessionsViewedInCurrentSearch > 0) {
    const event = {
      ...createBaseEvent('PageAbandoned'),
      timeOnPageMs: Date.now() - searchStartTime,
      sessionsViewed: sessionsViewedInCurrentSearch,
      abandonmentStage: 'AfterViewing', // Saw sessions but didn't click
    };
    sendEvent(event);
  } else if (searchStartTime) {
    const event = {
      ...createBaseEvent('PageAbandoned'),
      timeOnPageMs: Date.now() - searchStartTime,
      abandonmentStage: 'AfterSearch', // Searched but didn't view
    };
    sendEvent(event);
  }
}

/**
 * Track error
 * ABANDONMENT POINT: Errors likely cause abandonment
 */
export function trackError(errorType, errorMessage, operation) {
  const event = {
    ...createBaseEvent('Error'),
    errorType,
    errorMessage,
    operation,
    stackTrace: new Error().stack,
  };
  sendEvent(event);
}

/**
 * Track modal opened/closed
 * Helps understand engagement with session details
 */
export function trackModalOpened(sessionId) {
  const event = {
    ...createBaseEvent('ModalOpened'),
    sessionId,
  };
  sendEvent(event);
}

export function trackModalClosed(sessionId, durationMs) {
  const event = {
    ...createBaseEvent('ModalClosed'),
    sessionId,
    viewDurationMs: durationMs,
  };
  sendEvent(event);
}

// ============================================================================
// AUTO-TRACKING - Set up automatic abandonment detection
// ============================================================================

/**
 * Detect page unload (user leaving)
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    trackPageAbandonment();
  });

  // Track visibility change (user switches tabs)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // User switched away - potential abandonment signal
      const event = {
        ...createBaseEvent('PageHidden'),
        timeOnPageMs: searchStartTime ? Date.now() - searchStartTime : null,
      };
      sendEvent(event);
    }
  });
}

// Export all tracking functions
export default {
  trackPageLoaded,
  trackSearchStarted,
  trackSearchResultsReturned,
  trackNoResults,
  trackSessionViewed,
  trackSignupClicked,
  trackFilterChanged,
  trackGeolocationDenied,
  trackGeolocationGranted,
  trackPageAbandonment,
  trackError,
  trackModalOpened,
  trackModalClosed,
};
