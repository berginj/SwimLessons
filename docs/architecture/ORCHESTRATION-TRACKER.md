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
- Latest verified CI run: `23616011824` `CI Build` `success`
- Latest verified staging deploy: `23616011817` `Deploy to Staging` `success`
- Staging site: `https://ambitious-mud-07c32a410.1.azurestaticapps.net/`
- Staging `/api/cities`: `success`, NYC present, `availableSessionCount: 10`
- Staging `POST /api/search`: `success`, `total: 10`
- Staging `GET /api/sessions/{id}?cityId=nyc`: `success` for `nyc-session-40425724-5`
- Staging `POST /api/events`: now part of the required smoke path
- Operator telemetry query surface: `GET /api/operator/cities/{cityId}/stats` is implemented as a Function-key-protected endpoint
- Operator stats runbook: `npm run operator:city-stats -- --environment staging --city nyc` resolves the Function key and calls the protected city stats endpoint directly
- Browser-provided origin override: shipped on `main`; Times Square remains the fallback when permission is denied or unavailable
- Browser-origin regression coverage: Playwright covers granted-location propagation, denial fallback, reset-to-Times-Square behavior, and telemetry payload shape
- Router-backed transit assertion: now part of the staging smoke contract and workflow path, with router settings restored from the live staging container before smoke
- Current user-visible blocker: none critical in staging; the next quality gaps are future-state workflow cleanup and keeping browser-origin coverage aligned with UI changes

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
- `docs/architecture/integration-flows.md` still contains lower-confidence future-state sections outside the current NYC MVP
- the operator runbook exists, but there is still no first-class dashboard surface if operators eventually need a richer UI

---

## C. Dependency Map

| Task Name | Owner Agent | PR-Sized Scope | Dependencies | Contracts Touched | Personas Touched | Blocker Status | Parallelizable |
|-----------|-------------|----------------|--------------|-------------------|------------------|----------------|----------------|
| Keep deterministic NYC seed + smoke path stable | Data/Platform Agent | Maintain repo-owned seed and smoke behavior across staging deploys | None | product/story, repository, staging smoke path, deployment | parent, operator | Not blocked | Yes |
| Extend browser-origin regression coverage as UI evolves | Frontend/QA Agent | Keep granted, denied, and reset browser-origin paths covered as the search UI changes | None | workflow, product/story, API, browser test harness | parent | Not blocked | Yes |
| Build operator dashboard on top of city stats | Full-stack Agent | Turn the protected city stats query surface into a richer operator-facing surface if the CLI/runbook stops being enough | protected city stats endpoint, operator runbook | API, telemetry service, operator workflows | operator | Not blocked | Yes |
| Trim lower-confidence future-state workflow docs | Docs/Architecture Agent | Reconcile older architecture narratives to the now-explicit persona and current NYC MVP | parent persona doc | persona, workflow, docs | parent, operator | Not blocked | Yes |

---

## D. Prioritized Backlog

Scoring formula:
`(30 * User/Persona Impact) + (25 * Dependency Criticality) + (20 * Drift Risk Reduction) + (15 * Workflow Continuity) + (10 * Cost of Delay)`

| Priority Score | Item | Why It Matters Now | User/Persona Value | Dependency Rationale | Drift Risk | Execution Recommendation |
|----------------|------|--------------------|--------------------|----------------------|------------|--------------------------|
| 360 | Keep deterministic NYC seed + smoke path stable | The seeded data and smoke path are now required deployment behavior | Preserves a working parent journey | Protects staging honesty and repeatability | Medium | Ongoing |
| 345 | Keep browser-origin regression coverage current | The current flow is covered, but UI changes can easily break origin behavior again | Keeps the parent-facing geolocation flow trustworthy | Builds directly on the shipped Playwright harness | Medium | Ongoing |
| 300 | Decide whether the operator stats runbook needs a richer dashboard | The protected stats endpoint now has a supported CLI/runbook path | Improves operational learning if the CLI becomes insufficient | Follows the new operator runbook | Medium | Follow-up |
| 290 | Trim lower-confidence future-state workflow docs | Some older architecture docs still overstate future or generic behavior | Keeps agents aligned to the real NYC MVP | Follows the new persona contract | Medium | Follow-up |

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

1. Trim lower-confidence future-state workflow docs
   - Why next: the persona contract is now explicit, but some architecture docs still describe broader or older behavior
   - Unblocks: cleaner agent pickup and less workflow drift
   - Risk reduced: stale documentation pulling implementation in the wrong direction

2. Trim lower-confidence future-state workflow docs
   - Why next: the persona and deployment contracts are stronger than some older architecture narratives
   - Unblocks: cleaner agent pickup and less stale workflow guidance
   - Risk reduced: old docs pulling implementation away from the current NYC MVP
3. Keep browser-origin regression coverage aligned with future UI changes
   - Why next: the denial/reset path is now covered and should stay covered
   - Unblocks: safer UI iteration on search and location controls
   - Risk reduced: regression of parent trust around geolocation behavior

---

## Pickup Notes

- Safe assumption: `main` is the integration branch and staging is the current proving environment
- Do not start production rollout work until the production environment contract is explicitly restated here
- If you touch transit, update both this tracker and the deployment contract
- If you touch workflows, verify they still serve the NYC parent persona before changing technical contracts
