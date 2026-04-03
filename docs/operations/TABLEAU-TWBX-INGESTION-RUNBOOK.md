# Tableau TWBX Ingestion Runbook (NYC Session Seed)

This runbook documents how to ingest a Tableau packaged workbook (`.twbx`) containing swim database data into the repo's canonical NYC session seed format.

## Why this exists

The NYC MVP runtime seed path expects canonical CSV rows matching `data/sessions-template.csv`, then loads them via:

- `npx tsx scripts/load-sessions.ts <csv-path>`

A Tableau `.twbx` file is a ZIP package; it typically contains one or more CSVs or extracts. This runbook handles the CSV path directly.

## Prerequisites

- Node available in the repo environment
- `unzip` CLI installed (used to read files inside the `.twbx` package)
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
2. choose the first CSV with recognizable facility/program columns,
3. map source columns into canonical seed fields,
4. write `data/sessions-from-tableau.csv`.

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

- facility id: `facility_id`, `permit_id`, `pool_id`, `site_id`
- program name: `program_name`, `class_name`, `lesson_name`, `offering_name`, `name`
- level: `skill_level`, `level`, `program_level`
- age: month and year variants (`min_age_years` → months)
- dates/times: several start/end aliases
- enrollment/pricing: `price`, `cost`, `fee`, `capacity`, `enrolled`

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

The workbook may use a Tableau extract format (`.hyper` / `.tde`) without embedded CSVs. Export underlying data from Tableau as CSV, then run this converter on that CSV path (or extend parser support).

### "None had recognizable facility/program columns"

Open the CSV headers and either:

- rename source columns to align with known aliases, or
- extend alias lists in `scripts/ingest-tableau-twbx.mjs`.

### Windows path notes

Always quote paths with spaces.

## Operational notes

- This script is intentionally deterministic and local-file based.
- It does not call external APIs.
- It only transforms packaged source data into the canonical seed shape.
