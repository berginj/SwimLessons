# Orchestration Tracker

**Purpose:** Canonical pullable handoff for agents working on the NYC MVP
**Last Updated:** 2026-03-25
**Status:** Active

---

## How Agents Use This

Read in this order before starting work:
1. `docs/architecture/ORCHESTRATION-TRACKER.md`
2. `docs/architecture/DEPLOYMENT-CONTRACT.md`
3. `docs/architecture/integration-flows.md`
4. Contract files under `src/core/contracts/`

Update this file when you:
- finish a PR-sized task
- change a technical contract
- discover a blocker or drift risk
- change the recommended next tasks

Do not treat older root-level status docs as the active source of truth unless this file points to them explicitly.

---

## Current Snapshot

- Branch baseline: `main`
- Latest transit feature commit: `8682e9c` `feat: add nyc transit routing estimates`
- Latest verified CI run: `23539330890` `CI Build` `success`
- Latest verified staging deploy: `23539330879` `Deploy to Staging` `success`
- Staging site: `https://ambitious-mud-07c32a410.1.azurestaticapps.net/`
- Staging `/api/cities`: `success`, NYC present, `availableSessionCount: 0`
- Staging `/api/search`: `success`, zero results
- Current user-visible blocker: deployment is healthy, but the NYC parent journey is still incomplete because staging has no seeded sessions

---

## A. Persona Reference

- Relevant persona(s): `NYC parent/caregiver searching for swim lessons`, supported by `platform operator`
- Persona goals:
  - find a viable lesson quickly
  - understand travel time at lesson time
  - avoid dead-end or misleading search results
- Likely next need:
  - non-zero NYC search results in staging
  - believable transit estimates from a concrete origin
  - eventual parent-provided origin instead of default-only routing
- Confidence level: `Moderate`

Note:
- The parent persona is currently implicit in product behavior and thread decisions, not formalized in a dedicated persona document.

---

## B. Contract Reference

- Persona contracts touched:
  - NYC-first deterministic parent search experience
  - trustworthy travel-time presentation
- Workflow contracts touched:
  - search journey in `docs/architecture/integration-flows.md`
  - staging deploy and smoke path in `docs/architecture/DEPLOYMENT-CONTRACT.md`
- Product/story contracts touched:
  - NYC is the deterministic first path
  - default transit origin is Times Square until parent location input exists
  - transit enrichment applies to top 10 search results
- Technical contracts touched:
  - `src/core/contracts/services.ts`
  - `src/core/contracts/api-contracts.ts`
  - `src/core/utils/env.ts`
- Deployment/operational contracts touched:
  - `docs/architecture/DEPLOYMENT-CONTRACT.md`
  - GitHub Actions staging workflow
  - Function App app settings for transit router

Current gaps:
- `docs/architecture/integration-flows.md` is stale relative to current transit behavior
- deployment contract does not yet document the external transit-router dependency
- no canonical seeded-data contract exists for staging NYC sessions

---

## C. Dependency Map

| Task Name | Owner Agent | PR-Sized Scope | Dependencies | Contracts Touched | Personas Touched | Blocker Status | Parallelizable |
|-----------|-------------|----------------|--------------|-------------------|------------------|----------------|----------------|
| Seed deterministic NYC dataset | Data Agent | Load stable NYC session/location/program data into staging and document the supported seed path | None | product/story, repository, staging smoke path | parent, operator | Not blocked | Yes |
| Define transit-router operational contract | Platform Agent | Document OTP endpoint shape, hosting, timeout, graph build cadence, feed inputs, and required env vars | None | technical, deployment | parent, operator | Not blocked | Yes |
| Deploy schedule-based NYC transit router | Platform Agent | Provision router service and set `TRANSIT_ROUTER_GRAPHQL_URL` for staging | transit-router operational contract | deployment, env, transit service | parent, operator | Blocked by missing router service | No |
| Add transit smoke and integration coverage | QA/Backend Agent | Cover top-10 enrichment, session-details travel time, fallback path, and staging smoke behavior | seeded dataset; router for live-path assertions | workflow, technical, deployment | parent, operator | Partially blocked | No |
| Reconcile workflow/docs to current transit behavior | Docs Agent | Update architecture docs to match Times Square default origin, top-10 enrichment, and router fallback | None | workflow, deployment, technical | parent, operator | Not blocked | Yes |
| Close telemetry loop | Full-stack Agent | Implement `/api/events` and wire frontend telemetry end to end | None | API, telemetry service | operator | Not blocked | Yes |
| Add parent-supplied location input | Frontend Agent | Allow parent location override and use it as routing origin | seeded data preferred | workflow, product/story, API | parent | Not blocked | Yes |

---

## D. Prioritized Backlog

Scoring formula:
`(30 * User/Persona Impact) + (25 * Dependency Criticality) + (20 * Drift Risk Reduction) + (15 * Workflow Continuity) + (10 * Cost of Delay)`

| Priority Score | Item | Why It Matters Now | User/Persona Value | Dependency Rationale | Drift Risk | Execution Recommendation |
|----------------|------|--------------------|--------------------|----------------------|------------|--------------------------|
| 470 | Seed deterministic NYC dataset | Current staging flow is empty despite successful deploys | Parents can finally see real options | Unblocks search validation, session details, and transit visibility | High | Do next |
| 445 | Define and deploy schedule-based OTP router | Current transit path is still heuristic fallback in live environments | Improves trust in travel times | Required before live router-backed estimates exist | High | Start contract now, then deploy |
| 420 | Add transit smoke/integration coverage | Transit behavior can regress silently | Preserves parent trust | Depends on data, extends cleanly after router | High | Start after dataset exists |
| 340 | Reconcile workflow and deployment docs | Current docs underdescribe actual system behavior | Keeps future agents aligned | Prevents follow-on work from targeting stale assumptions | High | Run in parallel now |
| 280 | Close telemetry loop | Search and transit behavior are not measurable end to end | Improves operator visibility | Not on critical path for parent MVP | Medium | Follow-up |
| 400 | Add parent-supplied location input | Likely next parent need after default-origin MVP | Makes routing personal instead of generic | Better once data and router exist | Medium | Queue after data and router |

---

## E. Change Log

### Newly Proposed Technical Contract Changes

- `ITransitService` accepts optional `departureTime`
- Function App env contract includes:
  - `TRANSIT_ROUTER_GRAPHQL_URL`
  - `TRANSIT_ROUTER_TIMEOUT_MS`
- Search transit enrichment is limited to top 10 results
- NYC default transit origin is the city default center, currently Times Square

### Open Persona Change Requests

- None

### Backlog Refinements Created

- Formalize a dedicated persona artifact for the parent/caregiver
- Add a transit-router operational contract and runbook
- Add a supported NYC staging seed runbook
- Add transit smoke checks to deployment verification

### Workflow/Code Areas Requiring Re-Review

- `docs/architecture/integration-flows.md`
- `docs/architecture/DEPLOYMENT-CONTRACT.md`
- `src/functions/README.md`
- `src/functions/search-api/search.ts`
- `src/functions/search-api/session-details.ts`
- `src/services/transit/transit-service.ts`

---

## F. Next Recommended Tasks

1. Seed the deterministic NYC staging dataset
   - Why next: staging is deployed but still unusable for parents
   - Unblocks: search validation, session-details checks, transit UI review
   - Risk reduced: false confidence from green deploys with empty data

2. Define and deploy the NYC transit-router contract and staging endpoint
   - Why next: transit code is shipped, but live routing is still fallback-based
   - Unblocks: real schedule-based transit estimates and router-backed smoke tests
   - Risk reduced: backend/platform drift around router assumptions

3. Update workflow and deployment docs to reflect actual transit behavior
   - Why next: current docs are already stale
   - Unblocks: clean parallel work by other agents
   - Risk reduced: hidden contract drift

---

## Pickup Notes

- Safe assumption: `main` is the integration branch and staging is the current proving environment
- Do not start production rollout work until the production environment contract is explicitly restated here
- If you touch transit, update both this tracker and the deployment contract
- If you touch workflows, verify they still serve the NYC parent persona before changing technical contracts
