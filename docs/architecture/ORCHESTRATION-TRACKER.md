# Orchestration Tracker

**Purpose:** Canonical pullable handoff for agents working on the NYC MVP
**Last Updated:** 2026-03-26
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
- Latest verified CI run: `23619607396` `CI Build` `success`
- Latest verified staging deploy: `23619607389` `Deploy to Staging` `success`
- Staging site: `https://ambitious-mud-07c32a410.1.azurestaticapps.net/`
- Staging `/api/cities`: `success`, NYC present, `availableSessionCount: 10`
- Staging `POST /api/search`: `success`, `total: 10`
- Staging `GET /api/sessions/{id}?cityId=nyc`: `success` for `nyc-session-40425724-5`
- Staging `POST /api/events`: now part of the required smoke path
- Operator telemetry query surface: `GET /api/operator/cities/{cityId}/stats` is implemented as a Function-key-protected endpoint
- Operator stats runbook: `npm run operator:city-stats -- --environment staging --city nyc` resolves the Function key and calls the protected city stats endpoint directly
- Operator dashboard report: `npm run operator:city-dashboard -- --environment staging --city nyc --output tmp/operator-dashboard.html` generates a local HTML report from the same protected endpoint without exposing the Function key in the web app
- Browser-provided origin override: shipped on `main`; Times Square remains the fallback when permission is denied or unavailable
- Browser-origin regression coverage: Playwright covers granted-location propagation, denial fallback, reset-to-Times-Square behavior, and telemetry payload shape
- Router-backed transit assertion: now part of the staging smoke contract and workflow path, with router settings restored from the live staging container before smoke
- Current user-visible blocker: none critical in staging; the next quality gaps are keeping browser-origin coverage aligned with UI changes and deciding whether operators eventually need a hosted dashboard beyond the local runbook and report

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
- the operator runbook now includes a local HTML dashboard report, but there is still no hosted operator UI if product learning eventually needs a shared dashboard
- the remaining architecture summary docs still need periodic spot-checks so they do not drift back toward planning-era assumptions

---

## C. Dependency Map

| Task Name | Owner Agent | PR-Sized Scope | Dependencies | Contracts Touched | Personas Touched | Blocker Status | Parallelizable |
|-----------|-------------|----------------|--------------|-------------------|------------------|----------------|----------------|
| Keep deterministic NYC seed + smoke path stable | Data/Platform Agent | Maintain repo-owned seed and smoke behavior across staging deploys | None | product/story, repository, staging smoke path, deployment | parent, operator | Not blocked | Yes |
| Extend browser-origin regression coverage as UI evolves | Frontend/QA Agent | Keep granted, denied, and reset browser-origin paths covered as the search UI changes | None | workflow, product/story, API, browser test harness | parent | Not blocked | Yes |
| Evaluate hosted operator dashboard need | Full-stack/Product Agent | Decide whether the new local dashboard report is sufficient or whether operators need a shared hosted dashboard | protected city stats endpoint, operator runbook, local dashboard report | API, telemetry service, operator workflows | operator | Not blocked | Yes |

---

## D. Prioritized Backlog

Scoring formula:
`(30 * User/Persona Impact) + (25 * Dependency Criticality) + (20 * Drift Risk Reduction) + (15 * Workflow Continuity) + (10 * Cost of Delay)`

| Priority Score | Item | Why It Matters Now | User/Persona Value | Dependency Rationale | Drift Risk | Execution Recommendation |
|----------------|------|--------------------|--------------------|----------------------|------------|--------------------------|
| 360 | Keep deterministic NYC seed + smoke path stable | The seeded data and smoke path are now required deployment behavior | Preserves a working parent journey | Protects staging honesty and repeatability | Medium | Ongoing |
| 345 | Keep browser-origin regression coverage current | The current flow is covered, but UI changes can easily break origin behavior again | Keeps the parent-facing geolocation flow trustworthy | Builds directly on the shipped Playwright harness | Medium | Ongoing |
| 260 | Decide whether the local operator dashboard should become a hosted shared surface | Operators now have both a CLI/runbook and a richer local HTML report | Improves operational learning if a shared view becomes necessary | Follows the new operator tooling baseline | Medium | Follow-up |

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
- `integration-flows.md`, `CONTRACT-SUMMARY.md`, and `README.md` were trimmed to stop presenting deferred onboarding/data-sync flows as live NYC MVP truth

### Workflow/Code Areas Requiring Re-Review

- `docs/architecture/DEPLOYMENT-CONTRACT.md`
- `src/functions/README.md`
- `src/functions/search-api/search.ts`
- `src/functions/search-api/session-details.ts`
- `src/services/transit/transit-service.ts`
- `src/functions/telemetry-api/events.ts`
- `src/web/telemetry.js`

---

## F. Next Recommended Tasks

1. Decide whether the local operator dashboard should become a hosted shared surface
   - Why next: operators now have both a working CLI/runbook and a local HTML dashboard, so the next question is whether a shared hosted view is actually needed
   - Unblocks: a more explicit operator workflow only if product learning or collaboration pressure grows
   - Risk reduced: overbuilding operator UX before there is a real need

2. Keep browser-origin regression coverage aligned with future UI changes
   - Why next: the denial/reset path is now covered and should stay covered
   - Unblocks: safer UI iteration on search and location controls
   - Risk reduced: regression of parent trust around geolocation behavior

3. Keep deterministic NYC seed + smoke behavior stable as staging evolves
   - Why next: the current MVP promise depends on seeded data and router-backed smoke remaining intact
   - Unblocks: safer future feature work on search, telemetry, and operator surfaces
   - Risk reduced: green deploys that drift away from usable staging

---

## Pickup Notes

- Safe assumption: `main` is the integration branch and staging is the current proving environment
- Do not start production rollout work until the production environment contract is explicitly restated here
- If you touch transit, update both this tracker and the deployment contract
- If you touch workflows, verify they still serve the NYC parent persona before changing technical contracts
