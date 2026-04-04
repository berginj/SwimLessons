# Swim Lessons NYC MVP

This repo is the active NYC MVP for swim lesson discovery.

Current product contract:

- the parent-facing web app is in `src/web`
- the frontend stack is plain HTML/CSS/JS, not React
- public endpoints in use are `GET /api/cities`, `POST /api/search`, `GET /api/sessions/{id}`, and `POST /api/events`
- the first operator endpoint in use is `GET /api/operator/cities/{cityId}/stats`
- staging must keep deterministic, non-empty NYC search results
- browser geolocation is optional and falls back to Times Square
- transit uses an OTP-style router when configured and a deterministic fallback otherwise

Start with these files before making non-trivial changes:

1. `AGENTS.md`
2. `docs/architecture/PARENT-PERSONA.md`
3. `docs/architecture/ORCHESTRATION-TRACKER.md`
4. `docs/architecture/DEPLOYMENT-CONTRACT.md`
5. `docs/architecture/TRANSIT-ROUTER-CONTRACT.md`
6. `docs/architecture/FACILITY-REFERENCE-CONTRACT.md`

Do not treat older root-level rollout/status docs as the live workboard unless the tracker points to them.

## Current Repo Shape

- `src/web/`: parent-facing NYC MVP web app
- `src/functions/`: Azure Functions endpoints and DI wiring
- `src/core/contracts/`: API, service, repository, city, and facility-reference contracts
- `data/sessions-template.csv`: deterministic NYC seed data
- `data/nyc-facilities-canonical.json`: canonical NYC facility reference artifact
- `scripts/load-sessions.ts`: local/staging seed loader
- `scripts/seed-staging-nyc.mjs`: staging reseed entrypoint
- `scripts/run-staging-smoke.mjs`: live staging smoke checks
- `tests/e2e/browser-location.spec.ts`: browser-origin regression coverage

## Local Validation

Install dependencies:

```powershell
npm install
```

Run the standard repo checks:

```powershell
npm run validate:deployment-contract
npm run validate:seed:nyc
npm run build
npm run build:functions:deploy
npm test
npm run test:e2e -- tests/e2e/browser-location.spec.ts
```

## Deterministic NYC Seed

The deterministic NYC session seed is intentionally tied to the canonical facility layer.

- session rows live in `data/sessions-template.csv`
- facility identity lives in `data/nyc-facilities-canonical.json`
- `npm run validate:seed:nyc` checks that the seed template still matches the canonical facility artifact and current baseline counts before any shared-environment reseed

Local load:

```powershell
npm run seed:nyc
```

Staging reseed, once Azure is writable again:

```powershell
npm run seed:staging:nyc
```

## Browser-Origin and Transit

- the landing view loads 5 latest available pool options by default before a manual search
- search defaults to Times Square when no browser origin is available
- the Times Square fallback explanation now lives behind the info hover next to `Use browser location`
- geolocation is opt-in and should never auto-prompt on page load
- search results and session details must degrade cleanly if router-backed transit is unavailable
- top-10 search results receive transit enrichment; session details also compute travel time

The browser-origin regression suite is:

```powershell
npm run test:e2e -- tests/e2e/browser-location.spec.ts
```

## Deployment Notes

Deployment behavior is contract-driven.

- Bicep owns infra resources
- the workflow owns SWA backend linking and Function auth normalization
- staging must reseed deterministic NYC data before smoke
- staging smoke must hit `/`, `/api/cities`, `POST /api/search`, `GET /api/sessions/{id}`, and `POST /api/events`

Read:

- `docs/architecture/DEPLOYMENT-CONTRACT.md`
- `docs/architecture/ORCHESTRATION-TRACKER.md`
- `EXECUTION_LOG.md`

Do not assume a repo push will go live immediately. Use the execution log for the current repo-hardening status and the first post-reset deploy/reseed sequence.
