# Execution Log

**Date:** 2026-04-03
**Mode:** Repo hardening / prep-for-release

## Triage

### Blocked until Azure reset / staging restored

- live staging reseed
- live staging smoke validation
- live operator validation against staging
- any claim that staging is healthy again

### Completed safely in-repo today

- aligned the root `README.md` to the active NYC MVP contract
- finished the facility-reference slice wiring across contract, loader, guide, runbook, and tracker
- added `npm run validate:seed:nyc` plus CI enforcement for deterministic NYC seed drift
- hardened `scripts/load-sessions.ts` so seed rows must resolve through the canonical facility artifact and session `locationId` values stay aligned
- improved parent-facing session richness in `src/web/app.js` / `src/web/styles.css` using already-available provider, location, program, and pricing context
- tightened browser regression expectations so the richer card/detail UI stays covered

### Needs validation tomorrow after Azure is writable again

- `npm run seed:staging:nyc`
- `npm run smoke:staging -- https://ambitious-mud-07c32a410.1.azurestaticapps.net`
- operator stats/dashboard against staging
- any live confirmation that the router-backed transit path is healthy again

## What Changed Today

- `README.md` now describes the current NYC MVP, plain HTML/CSS/JS frontend, active endpoints, deterministic seed contract, and current validation commands instead of planning-era React/week-by-week roadmap language.
- `SESSION-DATA-GUIDE.md` was rewritten around the current deterministic seed contract and canonical facility crosswalk.
- `scripts/load-sessions.ts` now:
  - fails fast when a session row references a facility id missing from `data/nyc-facilities-canonical.json`
  - uses canonical `locationId` values for seeded session docs
  - points follow-up steps at repo validation instead of launch-era next steps
- `scripts/validate-nyc-seed-data.mjs` was added and exposed as `npm run validate:seed:nyc`.
- `.github/workflows/ci-build.yml` now runs `npm run validate:seed:nyc`.
- `docs/architecture/FACILITY-REFERENCE-CONTRACT.md`, `docs/architecture/README.md`, `docs/operations/TABLEAU-TWBX-INGESTION-RUNBOOK.md`, and `docs/architecture/ORCHESTRATION-TRACKER.md` were updated so the facility-reference story and deterministic-seed guardrails are documented consistently.
- `src/web/app.js`, `src/web/styles.css`, and `tests/e2e/browser-location.spec.ts` were updated so search cards and session details show more provider/facility/session context and the browser-origin regression suite keeps that UI covered.

## Still Blocked

Staging remains blocked for live reseed/revalidation today.

Exact blocker carried in the tracker:

- Azure subscription is read-only: `ReadOnlyDisabledSubscription`
- staging Function App `func-swim-stg01c` reports `state: AdminDisabled`
- tracked staging URL returns `404`

Source:

- `docs/architecture/ORCHESTRATION-TRACKER.md`

Per today’s operating constraint, no repeated Azure write retries were attempted once the work was triaged into repo-only prep.

## Local Validation Completed Today

Passed:

- `npm run validate:seed:nyc`
- `npm run validate:deployment-contract`
- `npm test`
- `npm run build`
- `npm run build:functions:deploy`
- `npm run test:e2e -- tests/e2e/browser-location.spec.ts`

Not completed locally:

- Python syntax/runtime check for `scripts/build-nyc-facility-reference.py`

Reason:

- the local environment only exposed the Windows Store `python.exe` shim, and `py` was not installed on `PATH`

## First Actions Tomorrow Morning

1. Confirm Azure is writable again.
2. Re-run the repo-side checks that gate reseed safety.
3. Reseed staging once.
4. Run live smoke validation once.
5. Run operator verification against staging.
6. If any Azure step still fails, stop and capture the exact Azure-side error before retrying.

## Recommended Command Sequence Tomorrow

```powershell
npm run validate:deployment-contract
npm run validate:seed:nyc
npm run build
npm run build:functions:deploy
npm run seed:staging:nyc
npm run smoke:staging -- https://ambitious-mud-07c32a410.1.azurestaticapps.net
npm run operator:city-stats -- --environment staging --city nyc
npm run operator:city-dashboard -- --environment staging --city nyc --output tmp/operator-dashboard.html
```

If transit/router behavior is suspect after smoke:

```powershell
npm run smoke:transit:staging -- <router-url>
```

## Live Validation Checklist Tomorrow

- `GET /` succeeds
- `GET /api/cities` includes NYC with `availableSessionCount > 0`
- `POST /api/search` returns non-zero results
- child-age-filtered `POST /api/search` still returns age-eligible results
- `GET /api/sessions/{id}?cityId=nyc` succeeds for a searched session
- `POST /api/events` accepts a valid browser telemetry payload
- operator stats/dashboard commands succeed against staging
- if router is configured, router-backed transit stays within the expected tolerance

## Risk Review

### Session richness gaps

- the web UI now surfaces provider trust, facility type, address, description, price, and availability more clearly
- remaining risk is mostly copy/priority tuning, not missing data plumbing

### Deterministic seed / smoke risk

- biggest risk remains Azure-side writability, not repo-side seed drift
- repo-side drift is reduced by `npm run validate:seed:nyc` and loader failure on unknown facility ids

### Browser-origin regression risk

- browser-origin coverage still exists and now covers the richer UI as well
- risk remains medium because small UI changes can still break state propagation or telemetry expectations

### Facility-reference drift risk

- the canonical contract, builder path, loader, and runbooks are now tied together
- remaining risk is local Python availability for rebuilding the artifact and any future unchecked edits to the large canonical JSON artifact
