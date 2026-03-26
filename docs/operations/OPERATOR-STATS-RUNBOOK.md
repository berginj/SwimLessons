# Operator Stats Runbook

## Purpose

Use this runbook to pull the protected city stats surface without exposing a Function key in the browser.

This is the supported operator workflow for the current NYC MVP.

## What This Uses

- Function endpoint: `GET /api/operator/cities/{cityId}/stats`
- Repo script: `scripts/operator-city-stats.mjs`
- NPM entrypoint: `npm run operator:city-stats -- ...`

The script:
- resolves the Function App from the Azure resource group when possible
- fetches the Function key through Azure CLI
- calls the stats endpoint directly on the Function App
- prints either a readable summary or the raw JSON payload

There is also a local HTML dashboard generator on top of the same protected endpoint:
- Repo script: `scripts/operator-city-dashboard.mjs`
- NPM entrypoint: `npm run operator:city-dashboard -- ...`
- Output: a local HTML report that does not expose the Function key in the public web app

## Prerequisites

- Azure CLI installed
- `az login` completed with access to the target subscription/resource group
- access to the Function App in the target environment

## Common Commands

### Staging, default NYC, last 30 days

```powershell
npm run operator:city-stats -- --environment staging --city nyc
```

### Staging, explicit 7-day window

```powershell
npm run operator:city-stats -- --environment staging --city nyc --days 7
```

### Staging, explicit timestamps, JSON output

```powershell
npm run operator:city-stats -- `
  --environment staging `
  --city nyc `
  --start-date 2026-03-20T00:00:00.000Z `
  --end-date 2026-03-26T23:59:59.999Z `
  --format json
```

### Override the Function App or resource group directly

```powershell
npm run operator:city-stats -- `
  --resource-group swim-lessons-staging-rg `
  --function-app func-swim-stg01c `
  --city nyc
```

### Generate a local dashboard report

```powershell
npm run operator:city-dashboard -- `
  --environment staging `
  --city nyc `
  --output tmp/operator-dashboard-nyc.html `
  --open
```

## How To Read The Output

- `Supply`: current provider/location/session counts and active session count
- `Confidence`: aggregate confidence mix across providers, locations, programs, and sessions
- `Usage`: recent DAU, searches, and signup clicks
- `Search quality`: average result volume, no-results rate, and relaxation success rate
- `Performance`: average and p95 search latency, plus error rate
- `Conversion`: signup clicks divided by searches
- `Last sync`: latest session sync timestamp and how many records were updated in that sync batch

Rates are decimal ratios returned by the API and shown by the script as percentages.

## Operational Notes

- This script is the safe way to consume the protected stats endpoint.
- The dashboard script is also safe because it resolves the Function key locally and writes a local HTML report.
- Do not build a public browser dashboard that embeds the Function key.
- For staging, the default resource group is `swim-lessons-staging-rg`.
- For production, pass explicit overrides until the production environment is actively in use.

## Related Files

- `src/functions/admin-api/city-stats.ts`
- `src/functions/admin-api/city-stats-helpers.ts`
- `src/core/contracts/api-contracts.ts`
- `scripts/operator-city-dashboard.mjs`
- `scripts/operator-city-stats-lib.mjs`
- `docs/architecture/ORCHESTRATION-TRACKER.md`
