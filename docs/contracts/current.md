# Current Workflow Notes

**Last Updated:** 2026-04-04
**Status:** Active

## Parent-Facing Search Landing

- the NYC web app loads 5 latest available pool options by default on first load
- this default landing request is intentionally narrower than a full manual search
- manual searches still use the broader result set and existing filter behavior

## Travel-Time Origin Disclosure

- Times Square remains the deterministic fallback origin
- browser geolocation remains opt-in
- the fallback explanation is exposed through the info hover next to `Use browser location`
- the visible origin status line must still state whether travel times are using Times Square or the browser-provided origin

## API Contract Notes

- `POST /api/search` now supports `filters.onlyAvailable`
- `POST /api/search` now supports `sort.field = "createdAt"`
- the landing-page default recommendations rely on those two contract behaviors together

## Persona Outcome

- improves first-load trust for the NYC parent/caregiver by showing a smaller set of fresh, available options instead of an unbounded generic result list
- keeps the travel-time default explicit without crowding the search panel
