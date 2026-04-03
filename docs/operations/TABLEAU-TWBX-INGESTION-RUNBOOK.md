# Tableau TWBX Ingestion Runbook (NYC Session Seed)

This runbook documents how to ingest a Tableau packaged workbook (`.twbx`) containing swim database data into the repo's canonical NYC session seed format.

## Why this exists

The NYC MVP runtime seed path expects canonical CSV rows matching `data/sessions-template.csv`, then loads them via:

- `npx tsx scripts/load-sessions.ts <csv-path>`

A Tableau `.twbx` file is a ZIP package; it typically contains one or more CSVs or extracts. This runbook handles the CSV path directly and validates extract-backed workbooks before accepting them.

## Data Boundary

For this repo, facility data and session data are different sources with different change rates:

- facility data is a slow-changing reference layer
- session data is a separate, rapid-changing feed
- session rows must crosswalk back to facility records through a stable facility identifier such as `ACCELA`, permit id, or site id

That means:

- a facility workbook is valid as a facility inventory or crosswalk source
- a facility workbook is not valid session seed input unless it also carries real schedule/program fields
- session ingestion should be designed to refresh much more frequently than facility ingestion
- missing session fields must not be fabricated from facility metadata defaults

## Prerequisites

- Node available in the repo environment
- Either `unzip` or `tar` available on `PATH` to inspect the `.twbx` archive
- A local Tableau workbook file (example user path on Windows):
  - `C:\Users\bergi\Downloads\Specific NYC Pool Data.twbx`

## Command

```bash
node scripts/ingest-tableau-twbx.mjs \
  --input "<path-to-file.twbx>" \
  --output data/sessions-from-tableau.csv
```

Example (PowerShell):

```powershell
node scripts/ingest-tableau-twbx.mjs `
  --input "C:\Users\bergi\Downloads\Specific NYC Pool Data.twbx" `
  --output data/sessions-from-tableau.csv
```

The script will:

1. list CSV entries inside the `.twbx` ZIP package,
2. choose the first CSV with enough session columns to map safely,
3. map source columns into canonical seed fields,
4. write `data/sessions-from-tableau.csv`.

If the workbook contains only Tableau extracts (`.hyper`) and no session-ready CSV, the script inspects workbook metadata and fails with a specific validation error instead of silently inventing session rows.

## Canonical output schema

Generated file columns are exactly:

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

This matches the loader contract in `scripts/load-sessions.ts`.

## Column mapping behavior

The converter recognizes aliases (case-insensitive, punctuation-insensitive), including:

- facility id: `facility_id`, `permit_id`, `pool_id`, `site_id`, `accela`
- program name: `program_name`, `class_name`, `lesson_name`, `offering_name`, `name`
- level: `skill_level`, `level`, `program_level`
- age: month and year variants (`min_age_years` → months)
- dates/times: several start/end aliases
- enrollment/pricing: `price`, `cost`, `fee`, `capacity`, `enrolled`

Minimum safe acceptance rule:

- the source must expose a recognizable facility identifier, and
- it must also expose at least one session-defining field such as program name, dates, days, times, price, capacity, enrollment, or registration URL

This prevents facility-only inspection/location datasets from being converted into fake lesson sessions via defaults.

### Default values applied when missing

- `skill_level`: `beginner`
- `age_min_months`: `48`
- `age_max_months`: `180`
- `days_of_week`: `1,3,5`
- `time_start`: `17:00`
- `time_end`: `18:00`
- `price`: `0`
- `capacity`: `20`
- `enrolled`: `0`
- `notes`: `Imported from Tableau TWBX`

## Load into Cosmos after conversion

```bash
npx tsx scripts/load-sessions.ts data/sessions-from-tableau.csv
```

For staging-contract seeding, continue to use the deterministic seeded path as documented in `AGENTS.md` and orchestration/deployment contracts.

## Troubleshooting

### "No CSV files found inside the .twbx package"

The workbook may use a Tableau extract format (`.hyper` / `.tde`) without embedded CSVs. The converter now inspects the packaged `.twb` workbook metadata before failing.

If the error says the workbook is not session-shaped enough for safe canonical session ingestion, that means the package does not contain lesson schedule/program fields. Export the underlying Tableau data as CSV from the session-level sheet first, then run this converter on that CSV path.

### "None had enough session columns for safe conversion"

Open the CSV headers and either:

- rename source columns to align with known aliases, or
- extend alias lists in `scripts/ingest-tableau-twbx.mjs`.

Do not work around this by letting the script default program names, dates, or times for a facility inventory. That would change the parent-visible search experience with invented sessions.

## Validation Result For The Provided Workbook

Local validation on `2026-04-02` against:

- `C:\Users\bergi\Downloads\Specific NYC Pool Data.twbx`

showed:

- archive entries:
  - `Specific NYC Pool Data.twb`
  - `Data/Extracts/federated_1nqj5xj1u1irod1glola20.hyper`
- workbook relation:
  - `NYC_Pool_Insp_7-2025 Workin (2)`
- representative columns:
  - `ACCELA`
  - `Facility_Name`
  - `High Level Category`
  - `Category`
  - `ADDRESS_ No`
  - `ADDRESS_St`
  - `BO`
  - `ZIP`
  - `Inspection_Date`
  - violation counters

What that means:

- the package is facility/inspection-oriented, not session/program-oriented
- `ACCELA` values do overlap the current repo sample facility IDs, so the workbook is useful as a facility inventory and crosswalk source
- the package does not contain lesson program names, schedules, days, times, prices, or signup URLs
- it is therefore not valid input for direct canonical session seed conversion

To ingest this source into the current NYC MVP session path, you still need a schedule-level export that includes at least:

- facility identifier (`ACCELA` / permit id / site id)
- program or lesson name
- start/end dates or equivalent schedule boundaries
- meeting days and/or start/end times
- optional price, capacity, enrollment, and signup URL

### Windows path notes

Always quote paths with spaces.

## Operational notes

- This script is intentionally deterministic and local-file based.
- It does not call external APIs.
- It only transforms packaged source data into the canonical seed shape when the workbook is already session-shaped enough to do so honestly.
