# Deployment Contract

**Last Updated:** 2026-03-25
**Status:** Enforced in CI

## Purpose

This contract defines the deployment rules for Azure infrastructure, Azure Functions, and Azure Static Web Apps in this repo. It exists to prevent the exact drift and outage class we hit in staging on 2026-03-24.

## Deployment Invariants

1. Resource group location and workload location are different concerns.
Resource group location is immutable metadata for the group.
Workload location comes from the Bicep parameter file for the environment.

2. The workflow must treat resource-group creation and resource deployment as separate steps.
`RESOURCE_GROUP_LOCATION` is used only for `az group create`.
`PARAMETERS_FILE` is used only for `az deployment group create`.

3. Bicep owns infrastructure resources.
Bicep creates the Function App and Static Web App resources.
Bicep does not own the Static Web App linked backend.

4. The deploy workflow owns SWA backend linking.
The backend link must be created with `az staticwebapp backends link`.
Do not reintroduce `Microsoft.Web/staticSites/linkedBackends` into Bicep for this repo.

5. The deploy workflow owns Function App auth normalization.
The linked-backend flow creates `authsettingsV2` on the Function App.
The workflow must set:
- `requireAuthentication=false`
- `unauthenticatedClientAction=AllowAnonymous`

6. A full application deploy is not the same as an infra-only deploy.
Infra-only deploys are allowed, but they do not replace a full deployment of the Functions package and Static Web App content.
After infra changes, the safe path is still the full staging workflow.

7. Deployment outputs must not contain secrets.
Bicep outputs may include identifiers, hostnames, and resource names.
Bicep outputs must not include connection strings, access keys, or deployment tokens.
Secrets must be fetched directly from Azure control-plane commands when needed.

## Environment Contract

### Staging

- Resource group: `swim-lessons-staging-rg`
- Resource group location: `eastus`
- Parameter file: `infrastructure-as-code/bicep/parameters/staging.parameters.json`
- Workload location from parameter file: `centralus`

### Production

- Resource group: `swim-lessons-production-rg`
- Resource group location: `eastus`
- Parameter file: `infrastructure-as-code/bicep/parameters/production.parameters.json`
- Workload location from parameter file: `eastus`

## Required Deployment Sequence

1. Ensure the resource group exists.
2. Deploy Bicep with the environment parameter file.
3. Link the Function App backend to the Static Web App with `az staticwebapp backends link`.
4. Normalize Function App auth with `authsettingsV2`.
5. Deploy the Functions package.
6. Deploy the Static Web App content.
7. For staging, seed the deterministic NYC session dataset before smoke tests.
8. Smoke test `/`, `/api/cities`, `POST /api/search`, and `GET /api/sessions/{id}` on staging.

If any of those steps are skipped, the deployment is incomplete.

## Staging MVP Data Contract

- Staging must not treat an empty NYC search experience as healthy.
- The staging workflow must reseed the deterministic NYC dataset before smoke tests.
- Staging smoke tests must assert:
  - NYC appears in `/api/cities`
  - NYC `availableSessionCount > 0`
  - `POST /api/search` returns at least one result
  - `GET /api/sessions/{id}?cityId=nyc` succeeds for a returned session

## Forbidden Changes

- Do not replace `RESOURCE_GROUP_LOCATION` with a shared `LOCATION` env var in the workflows.
- Do not infer the Bicep parameter file from `ENVIRONMENT` when the workflow already has an explicit `PARAMETERS_FILE`.
- Do not manage SWA linked backends from Bicep in this repo.
- Do not require authentication on the public search endpoints unless the HTTP contract is deliberately changed.
- Do not output Cosmos DB connection strings or Static Web App deployment tokens from Bicep.
- Do not downgrade GitHub Actions below the Node 24-capable majors used in this repo.

## Manual Deployment Rule

For manual infrastructure work, use `infrastructure-as-code/scripts/deploy.sh`.

That script must:
- preserve the separation between resource-group location and workload parameter file
- link the SWA backend after Bicep finishes
- normalize Function App auth after linking
- remind the operator that Functions package deployment is still required

## Enforcement

The repo enforces this contract with:

- `npm run validate:deployment-contract`
- CI Build

Any PR or push that violates the deployment contract should fail CI before it reaches staging.
