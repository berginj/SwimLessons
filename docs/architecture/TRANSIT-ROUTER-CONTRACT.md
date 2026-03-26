# Transit Router Contract

**Last Updated:** 2026-03-26
**Status:** Drafted for implementation
**Primary Persona:** NYC parent/caregiver searching for swim lessons

## Purpose

This contract defines the schedule-based transit routing boundary for NYC lesson discovery.

It exists to keep backend, platform, and deployment work aligned around one transit source of truth:
- parents should see travel time estimates that reflect lesson-time routing, not generic distance math
- platform work should target one router interface
- fallback behavior should stay explicit when live routing is unavailable

## Scope

This contract currently applies to:
- `cityId = "nyc"`
- Function App transit estimation in search results and session details
- the external GraphQL transit router configured through `TRANSIT_ROUTER_GRAPHQL_URL`

This contract does not currently guarantee:
- nationwide transit support
- production-grade realtime transit updates
- bus-specific or rail-specific route planning guarantees
- parent-provided origin capture in the UI

## Provider Precedence

For the NYC MVP, the contractually supported schedule-based provider is the external transit router referenced by `TRANSIT_ROUTER_GRAPHQL_URL`.

Operational rules:
- Staging and production should treat the external transit router as the intended schedule-based source for NYC.
- If `TRANSIT_ROUTER_GRAPHQL_URL` is not set, NYC travel time falls back to heuristic estimation.
- If the router times out, returns an error, or returns no itinerary, the Function App must fall back to heuristic estimation.
- `GOOGLE_MAPS_API_KEY` is not part of the NYC MVP deployment contract and should not be treated as the required staging baseline.

## Supported Routing Behavior

Current Function App behavior in [transit-service.ts](../../src/services/transit/transit-service.ts):
- router-backed requests are attempted only for `walking` and `subway`
- `walking` is mapped to OTP `WALK`
- `subway` is mapped to OTP `WALK + TRANSIT`
- `bus`, `rail`, `driving`, and `biking` are not router-guaranteed in the current MVP contract

Implication:
- parents may see router-backed estimates for walking and subway-oriented lesson trips
- unsupported or unavailable modes must still return a deterministic fallback estimate instead of failing the request

## Request Contract

The Function App sends a GraphQL `POST` request to the URL in `TRANSIT_ROUTER_GRAPHQL_URL`.

For an OpenTripPlanner GTFS GraphQL deployment, the expected endpoint is typically:
- `https://<router-host>/otp/gtfs/v1`

Required request shape:

```json
{
  "query": "GraphQL plan query",
  "variables": {
    "from": { "lat": 40.758, "lon": -73.9855 },
    "to": { "lat": 40.7831, "lon": -73.9712 },
    "date": "2026-06-15",
    "time": "17:00",
    "transportModes": [
      { "mode": "WALK" },
      { "mode": "TRANSIT" }
    ],
    "numItineraries": 1,
    "walkReluctance": 2.2
  }
}
```

Required variable semantics:
- `from`: origin coordinates
- `to`: destination coordinates
- coordinate fields must use `lat` and `lon`
- `date`: lesson-day date in `YYYY-MM-DD`
- `time`: lesson-time departure in `HH:MM`
- `transportModes`: one itinerary request using either `WALK` alone or `WALK + TRANSIT`
- `numItineraries`: `1`
- `walkReluctance`: `1` for walking-only, `2.2` for transit requests

Current repo compatibility note:
- the Function App currently uses OTP's GTFS GraphQL `plan` query shape with `InputCoordinates` and `transportModes`
- this is compatible with the documented GTFS GraphQL endpoint, but agents should not silently migrate the query shape without updating this contract and validating the live router

## Response Contract

The router must return a GraphQL response containing the first itinerary under `data.plan.itineraries[0]`.

Required response fields:

```json
{
  "data": {
    "plan": {
      "itineraries": [
        {
          "duration": 1260,
          "legs": [
            { "mode": "WALK" },
            { "mode": "SUBWAY" }
          ]
        }
      ]
    }
  }
}
```

Required response semantics:
- `duration` is in seconds
- `legs[].mode` is used to derive the user-facing primary mode
- if there is no first itinerary, the request is treated as unavailable and falls back
- GraphQL `errors` must be treated as a router failure, not a partial success

## Fallback Contract

Fallback behavior is part of the contract, not an implementation accident.

Required fallback cases:
- router URL not configured
- router request timeout
- non-2xx HTTP response
- GraphQL errors
- no itinerary returned
- unsupported transit mode

Required fallback behavior:
- search and session-details responses must still succeed
- travel time must be computed with the deterministic NYC heuristic profile
- the estimate confidence remains non-authoritative (`estimated` or `fallback`), never misrepresented as guaranteed live routing

## Time Contract

The router should be asked for lesson-time travel, not generic “right now” routing.

Callers must pass `departureTime` when they have a lesson/session time.

Current MVP behavior:
- search and session-details should derive `departureTime` from the session start when available
- if `departureTime` is missing, the transit layer uses a deterministic fallback date/time for repeatability

Agents should not build new features that rely on the fallback default date/time as product behavior.

## Environment Contract

Function App settings:
- `TRANSIT_ROUTER_GRAPHQL_URL`
  - empty string disables router-backed NYC routing
  - non-empty value must be a full GraphQL endpoint URL reachable from Azure Functions
- `TRANSIT_ROUTER_TIMEOUT_MS`
  - default: `2500`
  - applies per router request

Staging baseline:
- `TRANSIT_ROUTER_GRAPHQL_URL` may remain unset until the router service is deployed
- once the router is deployed, staging should set this value through Bicep parameters or deployment configuration, not ad hoc portal edits

## Hosting Contract

The expected router implementation for the NYC MVP is OpenTripPlanner backed by:
- OpenStreetMap street graph
- MTA GTFS schedule data

Operational expectations:
- hosted as a separately deployable service, not inside the Function App
- exposes a stable GraphQL endpoint
- supports lesson-time routing for NYC coordinates
- serves one-itinerary plan requests within the configured timeout target under normal load

## Data Refresh Contract

The router graph is expected to be schedule-based for MVP.

Minimum operational expectations:
- refresh GTFS-derived graph on a defined cadence
- document the cadence in the router runbook
- explicitly handle MTA schedule-transition updates before calling the router “live”

Realtime GTFS-RT support is a future enhancement and is not part of the current MVP contract.

## Caching Contract

No shared caching layer is currently required by the code contract.

If caching is added later:
- cache keys must include origin, destination, mode, and departure-time bucket
- cache behavior must not silently return stale results across materially different lesson times
- the cache policy must be documented before rollout

## Acceptance Criteria

This contract is satisfied when:
- the router endpoint is documented and provisioned
- `TRANSIT_ROUTER_GRAPHQL_URL` is set in staging
- NYC walking/subway requests use the router when available
- search and session-details still succeed when the router fails
- smoke or regression coverage proves both router-backed and fallback behavior

## Non-Goals

The following are explicitly out of scope for this contract revision:
- changing the parent persona
- changing the search ranking model
- making Google Maps the required NYC transit provider
- promising realtime transit accuracy
- guaranteeing bus-optimized itineraries in the MVP
