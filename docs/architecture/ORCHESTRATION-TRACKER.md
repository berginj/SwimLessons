# Orchestration Tracker

**Purpose:** Canonical pullable handoff for agents working on the NYC MVP
**Last Updated:** 2026-03-26
**Status:** Active

---

## How Agents Use This

Read in this order before starting work:
1. `AGENTS.md`
2. `docs/architecture/ORCHESTRATION-TRACKER.md`
3. `docs/architecture/DEPLOYMENT-CONTRACT.md`
4. `docs/architecture/TRANSIT-ROUTER-CONTRACT.md`
5. `docs/architecture/integration-flows.md`
6. Contract files under `src/core/contracts/`

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
- Transit-router contract: `docs/architecture/TRANSIT-ROUTER-CONTRACT.md`
- Latest verified CI run: `23614221377` `CI Build` `success`
- Latest verified staging deploy: `23614221376` `Deploy to Staging` `success`
- Staging site: `https://ambitious-mud-07c32a410.1.azurestaticapps.net/`
- Staging `/api/cities`: `success`, NYC present, `availableSessionCount: 10`
- Staging `POST /api/search`: `success`, `total: 10`
- Staging `GET /api/sessions/{id}?cityId=nyc`: `success` for `nyc-session-40425724-5`
- Staging `POST /api/events`: now part of the required smoke path
- Browser-provided origin override: shipped on `main`; Times Square remains the fallback when permission is denied or unavailable
- Browser-origin regression coverage: Playwright covers origin propagation and telemetry payload shape for the granted-location path
- Current user-visible blocker: none critical in staging; the next quality gaps are denial/fallback browser coverage and a formalized parent persona artifact

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
- browser-origin regression coverage still does not prove denial/reset fallback behavior
- telemetry ingestion is now wired, but dashboards/query paths are still operator follow-up work

---

## C. Dependency Map

| Task Name | Owner Agent | PR-Sized Scope | Dependencies | Contracts Touched | Personas Touched | Blocker Status | Parallelizable |
|-----------|-------------|----------------|--------------|-------------------|------------------|----------------|----------------|
| Keep deterministic NYC seed + smoke path stable | Data/Platform Agent | Maintain repo-owned seed and smoke behavior across staging deploys | None | product/story, repository, staging smoke path, deployment | parent, operator | Not blocked | Yes |
| Extend browser-origin regression coverage | Frontend/QA Agent | Cover denial/fallback and reset-to-Times-Square behavior beyond the granted-location happy path | None | workflow, product/story, API, browser test harness | parent | Not blocked | Yes |
| Add router-backed transit assertions | QA/Backend Agent | Prove live router-backed travel time in smoke or integration coverage without relying only on fallback estimates | seeded dataset; live router | workflow, technical, deployment | parent, operator | Not blocked | No |
| Formalize parent persona artifact | Product/Docs Agent | Capture the implicit NYC parent persona and parent trust requirements in one dedicated doc | None | persona, workflow | parent | Not blocked | Yes |
| Build operator telemetry follow-up surfaces | Full-stack Agent | Add dashboards/query paths for the now-live `/api/events` ingestion path | telemetry ingestion baseline | API, telemetry service, operator workflows | operator | Not blocked | Yes |

---

## D. Prioritized Backlog

Scoring formula:
`(30 * User/Persona Impact) + (25 * Dependency Criticality) + (20 * Drift Risk Reduction) + (15 * Workflow Continuity) + (10 * Cost of Delay)`

| Priority Score | Item | Why It Matters Now | User/Persona Value | Dependency Rationale | Drift Risk | Execution Recommendation |
|----------------|------|--------------------|--------------------|----------------------|------------|--------------------------|
| 430 | Extend browser-origin regression coverage | The granted-location path is covered, but denial/fallback is still unguarded | Keeps the parent-facing geolocation flow trustworthy | Builds directly on the shipped Playwright harness | High | Do next |
| 405 | Add router-backed transit assertions | Transit can still regress silently toward fallback-only behavior | Preserves parent trust in travel times | Depends on the live router that staging already has | High | Do next |
| 360 | Keep deterministic NYC seed + smoke path stable | The seeded data and smoke path are now required deployment behavior | Preserves a working parent journey | Protects staging honesty and repeatability | Medium | Ongoing |
| 315 | Build operator telemetry follow-up surfaces | `/api/events` now ingests data, but operators still lack first-class visibility | Improves operational learning | Follows the newly completed telemetry path | Medium | Follow-up |
| 280 | Formalize parent persona artifact | The parent persona still lives only in thread decisions and code behavior | Reduces future requirement drift | No hard blocker, but important for alignment | Medium | Follow-up |

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

### Open Persona Change Requests

- None

### Backlog Refinements Created

- Formalize a dedicated persona artifact for the parent/caregiver
- Add a transit-router operational contract and runbook
- Transit-router contract now exists in `docs/architecture/TRANSIT-ROUTER-CONTRACT.md`
- Keep the NYC staging seed path repo-owned and workflow-enforced
- Keep staging smoke checks bound to real NYC search/session behavior

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

1. Extend browser-origin regression coverage to denial/reset fallback
   - Why next: the happy path is covered, but the fallback path is still a trust-sensitive blind spot
   - Unblocks: stronger confidence in the parent-facing geolocation flow
   - Risk reduced: silent regression back to confusing origin behavior

2. Add router-backed transit assertions to smoke or integration coverage
   - Why next: staging now has a live router and the contract says router-backed behavior matters
   - Unblocks: stronger proof that transit is not quietly falling back
   - Risk reduced: router drift masked by deterministic fallback

3. Formalize the parent persona artifact
   - Why next: the repo now has stronger technical contracts than persona documentation
   - Unblocks: cleaner requirement reviews and future agent alignment
   - Risk reduced: hidden persona drift

---

## Pickup Notes

- Safe assumption: `main` is the integration branch and staging is the current proving environment
- Do not start production rollout work until the production environment contract is explicitly restated here
- If you touch transit, update both this tracker and the deployment contract
- If you touch workflows, verify they still serve the NYC parent persona before changing technical contracts
