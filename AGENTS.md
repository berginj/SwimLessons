# AGENTS.md

## Purpose

This file is the repo-level operating contract for coding agents working in this app.

Use it to stay aligned with the actual NYC MVP, current deployment behavior, and the contract hierarchy already in place. This repo has a lot of historical status docs; this file tells you what is current and what is not.

## Product Mission

Build a trustworthy NYC-first swim lesson discovery experience for parents and caregivers.

Current parent-facing promise:
- parents can discover real NYC lesson options
- search should not dead-end because staging data is empty
- travel time should reflect lesson-time routing as well as the current system allows
- browser geolocation is optional and should improve routing when granted
- when location or live routing is unavailable, the app must degrade cleanly and honestly

Supporting operator-facing promise:
- staging must stay deterministic and reproducible
- deployment behavior must be contract-driven and smoke-tested
- transit and seed-data behavior must not drift silently

## Source Of Truth

Read in this order before making non-trivial changes:
1. `AGENTS.md`
2. `docs/architecture/PARENT-PERSONA.md`
3. `docs/architecture/ORCHESTRATION-TRACKER.md`
4. `docs/architecture/DEPLOYMENT-CONTRACT.md`
5. `docs/architecture/TRANSIT-ROUTER-CONTRACT.md`
6. `docs/architecture/integration-flows.md`
7. `src/core/contracts/*`
8. The relevant area README or runbook for the code you are touching

Treat most root-level status docs as historical unless the orchestration tracker explicitly points to them. In particular, do not treat files like `BUILD-STATUS.md`, `ACTUAL-STATUS.md`, or older rollout summaries as the live workboard.

## Contract Hierarchy

When contracts conflict, use this order:
1. user direction in the active thread
2. persona-driven workflow intent
3. product/story behavior contracts
4. technical contracts in `src/core/contracts/*`
5. deployment and operational contracts

Rules:
- Do not silently reinterpret persona or workflow requirements.
- Do not make a lower-order technical shortcut that changes the parent experience.
- If a contract is missing or ambiguous, stop, narrow the ambiguity, and update the contract or ask for approval.
- If a change would materially alter the parent journey, get human approval first.

## Current MVP Reality

As of 2026-03-26, the repo is not in “foundation only” mode anymore. The live NYC MVP baseline is:
- web app is in `src/web` and is plain HTML/CSS/JS, not React
- public Function endpoints currently in use are:
  - `GET /api/cities`
  - `POST /api/search`
  - `GET /api/sessions/{id}`
  - `POST /api/events`
- protected operator Function endpoint currently in use is:
  - `GET /api/operator/cities/{cityId}/stats`
- staging uses a deterministic NYC dataset and must keep non-zero search results
- browser geolocation is opt-in and falls back to Times Square when denied or unavailable
- transit estimates use an external OTP-style GraphQL router when configured and a deterministic fallback otherwise
- top-10 search results receive transit enrichment; session details also compute travel time
- `/api/events` is the ingestion path and `/api/operator/cities/{cityId}/stats` is the first read-only operator query surface

Do not regress the app back toward:
- empty NYC staging data
- Times Square being the only supported origin path
- transit estimates that fail hard when routing is unavailable
- deployment steps that rely on manual portal edits

## Working Agreements

### Preserve User Value

- The primary persona is the NYC parent/caregiver searching for children’s swim lessons.
- Read `docs/architecture/PARENT-PERSONA.md` before making parent-visible workflow changes.
- The parent’s likely next need is trustworthy results plus trustworthy travel time, not platform purity for its own sake.
- Changes that reduce deployment friction but damage parent-visible behavior are not acceptable.

### Preserve Contract Integrity

- If you touch search, session details, transit, data seeding, or workflows, review the tracker and relevant contracts first.
- If you change a technical boundary, update the contract in the same PR when practical.
- If you finish a PR-sized task or discover a blocker, update `docs/architecture/ORCHESTRATION-TRACKER.md`.

### Prefer Controlled Change

- Keep changes PR-sized.
- Do not broaden scope because adjacent work looks tempting.
- Do not add a new provider or routing model without stating its precedence and fallback behavior.

## Repo Landmarks

### Parent Journey

- Web app: `src/web/`
- Search endpoint: `src/functions/search-api/search.ts`
- Session details endpoint: `src/functions/search-api/session-details.ts`
- Cities endpoint: `src/functions/search-api/cities.ts`
- Dependency wiring: `src/functions/dependency-injection.ts`

### Core Contracts

- API contracts: `src/core/contracts/api-contracts.ts`
- Service contracts: `src/core/contracts/services.ts`
- Repository contracts: `src/core/contracts/repositories.ts`
- City adapter contracts: `src/core/contracts/city-adapter.ts`

### Deployment And Operations

- CI: `.github/workflows/ci-build.yml`
- Staging deploy: `.github/workflows/cd-staging.yml`
- Production deploy: `.github/workflows/cd-production.yml`
- Bicep entrypoint: `infrastructure-as-code/bicep/main.bicep`
- Deployment contract validator: `scripts/validate-deployment-contract.mjs`

### Seed Data And Smoke

- NYC session template: `data/sessions-template.csv`
- Session loader: `scripts/load-sessions.ts`
- Staging seed runner: `scripts/seed-staging-nyc.mjs`
- Staging smoke: `scripts/run-staging-smoke.mjs`
- Session data guide: `SESSION-DATA-GUIDE.md`

### Operator Workflow

- Operator stats script: `scripts/operator-city-stats.mjs`
- Operator dashboard script: `scripts/operator-city-dashboard.mjs`
- Operator stats runbook: `docs/operations/OPERATOR-STATS-RUNBOOK.md`

### Transit

- Transit service: `src/services/transit/transit-service.ts`
- Transit router contract: `docs/architecture/TRANSIT-ROUTER-CONTRACT.md`
- Transit router deploy: `scripts/deploy-staging-transit-router.mjs`
- Transit router smoke: `scripts/smoke-transit-router.mjs`

### Browser-Origin Regression

- Browser geolocation UI: `src/web/app.js`
- Browser E2E test: `tests/e2e/browser-location.spec.ts`
- Playwright config: `playwright.config.ts`
- Local web server for E2E: `scripts/serve-web-e2e.mjs`

## Deployment Invariants

Read `docs/architecture/DEPLOYMENT-CONTRACT.md` before touching workflows or Bicep.

The non-negotiable rules are:
- resource group location and workload location are separate concerns
- Bicep owns infra resources, not the SWA linked backend
- the workflow owns SWA backend linking
- the workflow owns Function App auth normalization after backend linking
- infra-only deployment is not a full application deployment
- staging must reseed NYC data before smoke tests
- Bicep outputs must not contain secrets
- GitHub JavaScript actions must run on Node 24

For staging specifically:
- resource group is `swim-lessons-staging-rg`
- resource group location is `eastus`
- workload location comes from `infrastructure-as-code/bicep/parameters/staging.parameters.json`
- after deployment, staging must prove:
  - `/`
  - `/api/cities`
  - `POST /api/search`
  - `GET /api/sessions/{id}`
  - `POST /api/events`

Do not reintroduce any of these failure modes:
- hardcoded shared `LOCATION` env vars in workflows
- SWA linked backend management in Bicep
- required auth on public search endpoints
- green staging deploys with zero NYC results

## Transit Rules

Read `docs/architecture/TRANSIT-ROUTER-CONTRACT.md` before changing transit behavior.

Current transit rules:
- NYC is the only transit-routed city with an active contract
- browser geolocation is opt-in; do not auto-prompt on page load
- Times Square remains the deterministic fallback origin
- router-backed behavior is the intended source for NYC lesson-time estimates when configured
- fallback behavior is required, not optional
- unsupported or unavailable routing must not break search or session details

Do not silently:
- replace the OTP-style router with Google Maps as the staging baseline
- change the supported mode set without updating the contract
- remove the lesson-time routing behavior
- expand transit enrichment to all search results without a latency decision

## Data Rules

The NYC deterministic dataset is part of the MVP contract.

Rules:
- keep staging data reproducible
- prefer idempotent seed paths
- if you change the seeded data shape, keep search and session-details smoke tests aligned
- do not call staging healthy if NYC has zero searchable sessions

If you touch session seeding, also review:
- `SESSION-DATA-GUIDE.md`
- `scripts/load-sessions.ts`
- `scripts/seed-staging-nyc.mjs`
- `scripts/run-staging-smoke.mjs`

## Testing And Verification

Choose verification based on the surface you changed.

### Standard Build Checks

- `npm run build`
- `npm run build:functions:deploy`

### Contract / Deployment Checks

Run when touching workflows, Bicep, deployment scripts, or deploy-time env wiring:
- `npm run validate:deployment-contract`

### Unit / Integration Checks

- `npm test`
- `npm run test:integration`

Note:
- Vitest currently passes with `--passWithNoTests`
- Playwright specs are intentionally isolated from Vitest via `vitest.config.ts`

### Browser Regression Checks

Run when touching `src/web`, browser geolocation behavior, request propagation, or session-details rendering:
- `npm run test:e2e -- tests/e2e/browser-location.spec.ts`

### Staging Operational Checks

Run when touching staging seed, smoke behavior, or live deployment wiring:
- `npm run seed:staging:nyc`
- `npm run smoke:staging -- https://ambitious-mud-07c32a410.1.azurestaticapps.net`

### Operator Checks

Run when touching telemetry aggregation or operator-facing query surfaces:
- `npm run operator:city-stats -- --environment staging --city nyc`
- `npm run operator:city-dashboard -- --environment staging --city nyc --output tmp/operator-dashboard.html`

### Transit Operational Checks

Run when touching router integration or transit deployment:
- `npm run deploy:transit:staging`
- `npm run smoke:transit:staging -- <router-url>`

## Editing Guidelines

- Prefer existing contracts over inventing new shapes in-place.
- Keep frontend behavior honest; if something is approximate, the UI should not imply it is authoritative live data.
- Preserve the browser geolocation fallback path.
- Preserve the seeded NYC experience in staging.
- Preserve the current endpoint surface unless the contract is updated.

If you touch any of these, read the code carefully before editing:
- `src/services/transit/transit-service.ts`
- `src/functions/search-api/search.ts`
- `src/functions/search-api/session-details.ts`
- `.github/workflows/cd-staging.yml`
- `infrastructure-as-code/bicep/main.bicep`

## Documentation Expectations

Update docs in the same change when you alter repo reality.

At minimum:
- update `docs/architecture/ORCHESTRATION-TRACKER.md` for backlog/state changes
- update `docs/architecture/DEPLOYMENT-CONTRACT.md` for workflow or deployment invariant changes
- update `docs/architecture/TRANSIT-ROUTER-CONTRACT.md` for transit provider, request, fallback, or hosting changes
- update `src/functions/README.md` when endpoint behavior or required env vars change

## Stale Assumptions To Avoid

These assumptions are currently wrong:
- the frontend is React
- the project is only in planning/foundation mode
- MTA integration docs are the primary transit source of truth
- production rollout is the current default target
- a successful deploy with empty NYC data is acceptable

## Good First Moves For Any Agent

1. Read the tracker and the deployment contract.
2. Identify which parent-visible behavior your change affects.
3. Identify which contract governs that behavior.
4. Make the smallest coherent change.
5. Run the checks that match the changed surface.
6. Update the tracker if the repo state, backlog, or contract reality changed.

## If You Hit Ambiguity

Stop and write down:
- what contract is unclear
- what assumption would be risky
- what code or workflow depends on that assumption
- the narrowest contract update needed

Do not “just make it work” by silently inventing a new product direction.
