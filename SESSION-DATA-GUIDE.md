# Session Data Guide

This guide covers the deterministic NYC lesson seed used by the current MVP.

## Current Seed Contract

The NYC seed path is intentionally split into two layers:

- `data/nyc-facilities-canonical.json`: slow-changing canonical facility identity
- `data/sessions-template.csv`: fast-changing lesson/session rows that crosswalk back to canonical facilities through `facility_id`

The loader:

- reads `data/sessions-template.csv`
- requires every `facility_id` to exist in `data/nyc-facilities-canonical.json`
- reuses canonical `locationId` values instead of inventing new location ids at load time
- upserts the provider, location, program, and session documents needed by search and session details

## Deterministic Baseline

The checked-in deterministic template currently represents:

- 144 session rows
- 24 seeded facility ids
- 6 sessions per seeded facility

Validate that baseline before local or shared-environment loads:

```powershell
npm run validate:seed:nyc
```

That command checks:

- the canonical facility artifact exists and has unique `sourceFacilityId` and `locationId` values
- every seeded `facility_id` resolves through the canonical artifact
- the current template still matches the expected 144 / 24 / 6 deterministic baseline

## Local Load

Load the checked-in NYC template into Cosmos:

```powershell
npm run seed:nyc
```

Or load a different CSV:

```powershell
npx tsx scripts/load-sessions.ts data/my-sessions.csv
```

Any custom CSV still has to use stable facility ids that exist in the canonical facility artifact.

## Staging Load

Once Azure is writable again:

```powershell
npm run validate:seed:nyc
npm run seed:staging:nyc
```

Follow that with live smoke validation:

```powershell
npm run smoke:staging -- https://ambitious-mud-07c32a410.1.azurestaticapps.net
```

See `EXECUTION_LOG.md` for the current blocked status and the exact first post-reset sequence.

## Editing the Session Template

`data/sessions-template.csv` columns:

- `facility_id`
- `program_name`
- `skill_level`
- `age_min_months`
- `age_max_months`
- `start_date`
- `end_date`
- `days_of_week`
- `time_start`
- `time_end`
- `price`
- `capacity`
- `enrolled`
- `registration_url`
- `notes`

Rules:

- `facility_id` must match a canonical `sourceFacilityId`
- keep dates in `YYYY-MM-DD`
- keep times in `HH:MM` 24-hour format
- keep `days_of_week` as comma-separated day codes (`0` = Sunday through `6` = Saturday)
- treat `notes` as parent-facing descriptive context, not internal-only comments

If you intentionally change the deterministic baseline, update:

- `data/sessions-template.csv`
- `scripts/validate-nyc-seed-data.mjs`
- `docs/architecture/ORCHESTRATION-TRACKER.md`
- any smoke or runbook text that depends on the current baseline

## Facility Reference Refresh

The provided Tableau workbook is a facility/inspection source, not a lesson schedule source.

Use the facility-reference builder when refreshing the canonical artifact:

```powershell
python scripts/build-nyc-facility-reference.py `
  --input "C:\Users\bergi\Downloads\Specific NYC Pool Data.twbx" `
  --output data/nyc-facilities-canonical.json `
  --csv-output data/nyc-facilities-canonical.csv
```

Then re-run:

```powershell
npm run validate:seed:nyc
```

Related docs:

- `docs/architecture/FACILITY-REFERENCE-CONTRACT.md`
- `docs/operations/TABLEAU-TWBX-INGESTION-RUNBOOK.md`

## Tomorrow-Morning Checklist

After Azure billing resets and the subscription is writable again:

1. `npm run validate:deployment-contract`
2. `npm run validate:seed:nyc`
3. `npm run build`
4. `npm run build:functions:deploy`
5. `npm run seed:staging:nyc`
6. `npm run smoke:staging -- https://ambitious-mud-07c32a410.1.azurestaticapps.net`

If staging still fails before smoke, stop and capture the Azure-side error rather than repeatedly retrying writes.
