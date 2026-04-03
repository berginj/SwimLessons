# Orchestration Tracker

**Purpose:** Canonical pullable handoff for agents working on the NYC MVP
**Last Updated:** 2026-03-27
**Status:** Active

---

## How Agents Use This

Read in this order before starting work:
1. `AGENTS.md`
2. `docs/architecture/PARENT-PERSONA.md`
3. `docs/architecture/ORCHESTRATION-TRACKER.md`
4. `docs/architecture/DEPLOYMENT-CONTRACT.md`
5. `docs/architecture/TRANSIT-ROUTER-CONTRACT.md`
6. `docs/architecture/integration-flows.md`
7. Contract files under `src/core/contracts/`

Update this file when you:
- finish a PR-sized task
- change a technical contract
- discover a blocker or drift risk
- change the recommended next tasks

Do not treat older root-level status docs as the active source of truth unless this file points to them explicitly.

---

## Current Snapshot

- Branch baseline: `main`
- Repo agent guidance: `AGENTS.md`
- Parent persona contract: `docs/architecture/PARENT-PERSONA.md`
- Transit-router contract: `docs/architecture/TRANSIT-ROUTER-CONTRACT.md`
- Latest verified CI run: `23624500711` `CI Build` `success`
- Latest verified staging deploy: `23624500695` `Deploy to Staging` `success`
- Staging site: `https://ambitious-mud-07c32a410.1.azurestaticapps.net/`
- Staging `/api/cities`: `success`, NYC present, `availableSessionCount: 10`
- Staging `POST /api/search`: `success`, `total: 10`
- Staging `GET /api/sessions/{id}?cityId=nyc`: `success` for `nyc-session-40425724-5`
- Staging `POST /api/events`: now part of the required smoke path
- Operator telemetry query surface: `GET /api/operator/cities/{cityId}/stats` is implemented as a Function-key-protected endpoint
- Operator stats runbook: `npm run operator:city-stats -- --environment staging --city nyc` resolves the Function key and calls the protected city stats endpoint directly
- Operator dashboard report: `npm run operator:city-dashboard -- --environment staging --city nyc --output tmp/operator-dashboard.html` generates a local HTML report from the same protected endpoint without exposing the Function key in the web app
- Browser-provided origin override: shipped on `main`; Times Square remains the fallback when permission is denied or unavailable
- Browser-origin regression coverage: Playwright covers granted-location propagation, denial fallback, reset-to-Times-Square behavior, child-age filter wiring, and telemetry payload shape
- Router-backed transit assertion: now part of the staging smoke contract and workflow path, with router settings restored from the live staging container before smoke
- Parent-facing travel copy now distinguishes live route, schedule-based estimate, and fallback estimate so transit confidence is explicit in both search results and session details
- Real age eligibility filtering now uses program age bounds instead of a placeholder
- Search results and session details now surface program age range and age-fit context when provider age bounds are available
- Search quality scoring now uses provider/program/session signals instead of session confidence alone
- `SearchRequest.userContext.sessionId` is now optional and aligned with the current browser request shape
- Current user-visible blocker: none critical in staging; the next meaningful gaps are richer parent-facing session clarity beyond age fit and keeping browser-origin coverage aligned with UI changes

---

## A. Persona Reference

- Relevant persona(s): `NYC parent/caregiver searching for swim lessons`, supported by `platform operator`
- Persona goals:
  - find a viable lesson quickly
  - understand travel time at lesson time
  - avoid dead-end or misleading search results
- Likely next need:
  - keep non-zero NYC search results stable in staging
  - believable transit estimates from a concrete origin
  - trustworthy instrumentation and regression coverage around browser-provided origin and transit estimates
- Confidence level: `High`

Note:
- The primary parent persona is now documented in `docs/architecture/PARENT-PERSONA.md`.

---

## B. Contract Reference

- Persona contracts touched:
  - NYC-first deterministic parent search experience
  - trustworthy travel-time presentation
- Workflow contracts touched:
  - search journey in `docs/architecture/integration-flows.md`
  - staging deploy and smoke path in `docs/architecture/DEPLOYMENT-CONTRACT.md`
  - NYC transit provider boundary in `docs/architecture/TRANSIT-ROUTER-CONTRACT.md`
- Product/story contracts touched:
  - NYC is the deterministic first path
  - default transit origin is Times Square, with optional browser-provided override
  - transit enrichment applies to top 10 search results
- Technical contracts touched:
  - `src/core/contracts/services.ts`
  - `src/core/contracts/api-contracts.ts`
  - `src/core/utils/env.ts`
- Deployment/operational contracts touched:
  - `docs/architecture/DEPLOYMENT-CONTRACT.md`
  - `docs/architecture/TRANSIT-ROUTER-CONTRACT.md`
  - GitHub Actions staging workflow
  - Function App app settings for transit router

Current gaps:
- no critical parent-visible blocker in the current NYC MVP slice; the next likely improvement is richer session/provider clarity once age fit and transit trust are in place
- the remaining architecture summary docs still need periodic spot-checks so they do not drift back toward planning-era assumptions

---

## C. Dependency Map

| Task Name | Owner Agent | PR-Sized Scope | Dependencies | Contracts Touched | Personas Touched | Blocker Status | Parallelizable |
|-----------|-------------|----------------|--------------|-------------------|------------------|----------------|----------------|
| Improve parent-facing session richness | Full-stack Agent | Add clearer provider, facility, and session context once age fit and transit trust are already visible | age-fit UI and honest transit copy now shipped | product/story, search UI, session details UI | parent | Not blocked | Yes |
| Keep deterministic NYC seed + smoke path stable | Data/Platform Agent | Maintain repo-owned seed and smoke behavior across staging deploys | None | product/story, repository, staging smoke path, deployment | parent, operator | Not blocked | Yes |
| Extend browser-origin regression coverage as UI evolves | Frontend/QA Agent | Keep granted, denied, and reset browser-origin paths covered as the search UI changes | None | workflow, product/story, API, browser test harness | parent | Not blocked | Yes |

---

## D. Prioritized Backlog

Scoring formula:
`(30 * User/Persona Impact) + (25 * Dependency Criticality) + (20 * Drift Risk Reduction) + (15 * Workflow Continuity) + (10 * Cost of Delay)`

| Priority Score | Item | Why It Matters Now | User/Persona Value | Dependency Rationale | Drift Risk | Execution Recommendation |
|----------------|------|--------------------|--------------------|----------------------|------------|--------------------------|
| 340 | Improve parent-facing session richness | Age fit and transit confidence are now visible, so the next improvement is richer session/provider/facility context for decision-making | Improves trust and reduces clicks into dead-end provider pages | Builds on the stabilized search, session-details, and age-fit UI | Medium | Next |
| 360 | Keep deterministic NYC seed + smoke path stable | The seeded data and smoke path are now required deployment behavior | Preserves a working parent journey | Protects staging honesty and repeatability | Medium | Ongoing |
| 345 | Keep browser-origin regression coverage current | The current flow is covered, but UI changes can easily break origin behavior again | Keeps the parent-facing geolocation flow trustworthy | Builds directly on the shipped Playwright harness | Medium | Ongoing |

---

## E. Change Log

### Newly Proposed Technical Contract Changes

- `ITransitService` accepts optional `departureTime`
- Function App env contract includes:
  - `TRANSIT_ROUTER_GRAPHQL_URL`
  - `TRANSIT_ROUTER_TIMEOUT_MS`
- Search transit enrichment is limited to top 10 results
- NYC default transit origin is the city default center, currently Times Square, with optional browser override in the web app
- `POST /api/events` is now part of the active Function surface and staging smoke path
- Frontend telemetry events use a contract-compliant `properties` envelope, with backend compatibility for older flat payloads
- `GET /api/operator/cities/{cityId}/stats` is the first operator-facing read-only telemetry summary surface and uses Function auth
- Session details travel-time payload now includes confidence, and the UI must keep transit confidence explicit instead of implying live precision
- Search age filtering now depends on real program age bounds, not a placeholder
- Search quality scoring now uses provider/program/session quality signals instead of session confidence alone
- `SearchRequest.userContext.sessionId` is optional and no longer treated as required browser input
- Search results now denormalize `program.ageMin` and `program.ageMax` so the web UI can show age-fit context without an extra fetch

### Open Persona Change Requests

- None

### Backlog Refinements Created

- Add a transit-router operational contract and runbook
- Transit-router contract now exists in `docs/architecture/TRANSIT-ROUTER-CONTRACT.md`
- Keep the NYC staging seed path repo-owned and workflow-enforced
- Keep staging smoke checks bound to real NYC search/session behavior
- Keep staging smoke checks bound to the live transit router, not fallback-only behavior
- Parent/caregiver persona is now formalized in `docs/architecture/PARENT-PERSONA.md`
- The operator telemetry follow-up now has a query surface instead of only raw event ingestion
- The operator telemetry query surface now also has a repo-owned CLI/runbook consumer
- The operator telemetry query surface now also has a repo-owned local HTML dashboard generator
- Operator tooling is now considered sufficient for MVP; do not treat a hosted dashboard as an active backlog item without new user direction
- Parent-facing travel copy now distinguishes live route, schedule-based estimate, and fallback estimate so transit confidence is explicit in both search results and session details
- `integration-flows.md`, `CONTRACT-SUMMARY.md`, and `README.md` were trimmed to stop presenting deferred onboarding/data-sync flows as live NYC MVP truth
- Added a Tableau TWBX-to-canonical session CSV ingestion path and runbook so external NYC pool datasets can be transformed into the existing deterministic loader format without changing endpoint contracts

### Workflow/Code Areas Requiring Re-Review

- `docs/architecture/DEPLOYMENT-CONTRACT.md`
- `src/functions/README.md`
- `src/functions/search-api/search.ts`
- `src/functions/search-api/session-details.ts`
- `src/services/transit/transit-service.ts`
- `src/functions/telemetry-api/events.ts`
- `src/web/telemetry.js`
- `scripts/ingest-tableau-twbx.mjs`

---

## F. Next Recommended Tasks

1. Improve parent-facing session richness
   - Why next: age fit and transit trust are now explicit, so the next quality gain is richer provider/facility/session context on the card and detail views
   - Unblocks: better comparison without extra clicks and less ambiguity before leaving to provider signup
   - Risk reduced: parents bouncing because results still feel thin even when technically correct

2. Keep deterministic NYC seed + smoke behavior stable as staging evolves
   - Why next: the current MVP promise depends on seeded data and router-backed smoke remaining intact
   - Unblocks: safer future feature work on search, telemetry, and operator surfaces
   - Risk reduced: green deploys that drift away from usable staging

3. Keep browser-origin regression coverage current as the search UI changes
   - Why next: the browser-origin and child-age flows are now both critical parent-facing behavior
   - Unblocks: safer iteration on search cards, filters, and session details
   - Risk reduced: silent UI drift that breaks trusted routing or age-fit behavior

---

## Pickup Notes

- Safe assumption: `main` is the integration branch and staging is the current proving environment
- Do not start production rollout work until the production environment contract is explicitly restated here
- If you touch transit, update both this tracker and the deployment contract
- If you touch workflows, verify they still serve the NYC parent persona before changing technical contracts
