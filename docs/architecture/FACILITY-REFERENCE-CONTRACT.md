# Facility Reference Contract

**Last Updated:** 2026-04-03
**Status:** Active
**Primary Persona Supported:** NYC parent/caregiver, via trustworthy facility identity behind lesson search

## Purpose

This contract defines the slow-changing canonical facility layer for NYC pool discovery.

It exists to keep these boundaries explicit:

- facility identity is not the same as lesson/session availability
- the facility layer should be accurate, durable, and crosswalk-friendly
- messy lesson/offering feeds must link back to facilities through deterministic keys, not ad hoc fuzzy guesses

For the NYC MVP:

- facilities are a reference dataset
- sessions remain the fast-changing user-facing seed/feed
- session ingestion must reuse this facility identity layer instead of inventing new location ids

## Current Source Boundary

The validated Tableau workbook:

- `Specific NYC Pool Data.twbx`

is a facility/inspection source, not a lesson schedule source.

Current observed source fields include:

- stable facility id: `ACCELA`
- facility name: `Facility_Name`
- address: `ADDRESS_ No`, `ADDRESS_St`, `BO`, `ZIP`
- geography/civic ids: `Community Board`, `Council District`, `Census tract`, `Boro-Block-Lot`, `BIN`, `NTA`, `NTA Code`
- coordinates: `Lat`, `Long`
- inspection data: `Inspection_Date`, `Inspection_Type`, `# of All Violations`, `# of PHH Violations`, `# of Critical Violations`, `# of General Violations`
- source categorization: `Permit_Type`, `Facility Grouping`, `High Level Category`, `Category`, `Org. Name/Type`

This source does **not** define lesson names, schedules, prices, capacity, or registration URLs.

## Canonical Artifact

The repo-owned facility reference artifact is:

- `data/nyc-facilities-canonical.json`

Optional flattened companion file:

- `data/nyc-facilities-canonical.csv`

Builder script:

- `scripts/build-nyc-facility-reference.py`

Supported builder inputs:

- Tableau packaged workbook: `.twbx`
- Tableau extract: `.hyper`
- flat CSV export with compatible columns

## Canonical Record Contract

Each facility record must contain:

- `canonicalFacilityId`
  - repo-owned stable id, currently `nyc-facility-{sourceFacilityId}`
- `cityId`
  - currently `nyc`
- `locationId`
  - runtime location id, currently `nyc-loc-{sourceFacilityId}`
- `sourceSystem`
  - current value: `nyc-pool-inspection-tableau`
- `sourceFacilityId`
  - stable external id used as the primary crosswalk key
- `officialName`
  - source-facing facility name
- `displayName`
  - cleaned facility label for human review or downstream matching
- `normalizedName`
  - deterministic normalized primary name token
- `alternateNames`
  - raw alias set derived from source names and safe prefix stripping
- `address.street1`
- `address.normalizedStreet1`
- `address.city`
- `address.state`
- `geography.boroughCode`
- `geography.boroughName`
- `geography.geographyId`
- `facilityType`
  - `indoor`, `outdoor`, `both`, or `unknown`
- `crosswalk.normalizedNames`
- `crosswalk.normalizedAddressVariants`
- `crosswalk.stableIds`
- `crosswalk.preferredKeys`

The record should also carry, when present in the source:

- `sourceRecordType`
- `operatorName`
- `address.postalCode`
- `coordinates`
- `coordinateSource`
- `coordinateConfidence`
- `geography.neighborhoodName`
- `geography.neighborhoodCode`
- `geography.communityBoard`
- `geography.councilDistrict`
- `geography.censusTract`
- `geography.boroBlockLot`
- `geography.bin`
- `sourceAttributes.facilityGrouping`
- `sourceAttributes.highLevelCategory`
- `sourceAttributes.category`
- `sourceAttributes.organizationNameType`
- `inspection.latestInspectionDate`
- `inspection.latestInspectionType`
- `inspection.observedInspectionTypes`
- `inspection.latestViolationCounts`

## Grouping And Aggregation Rules

The facility source may contain multiple rows per facility because inspection rows repeat over time.

Canonical grouping rules:

1. Group by `sourceFacilityId`.
2. Keep one canonical facility record per grouped facility id.
3. Choose the primary source row using latest inspection date, then row completeness.
4. Preserve alternate names and observed inspection types across grouped rows.
5. Preserve the latest observed inspection summary from the primary row.
6. Never create multiple canonical facilities for the same stable source id.

## Crosswalk Rules

Crosswalking messy lesson/offering feeds must follow this precedence:

1. Direct stable id match
   - `sourceFacilityId`
   - `locationId`
   - `BIN`
   - `Boro-Block-Lot`
2. Deterministic composite key match
   - normalized name + zip
   - normalized name + borough/geography
   - normalized name + normalized address + zip
3. Manual review when multiple facilities still match or no deterministic key matches

Required rules:

- do not silently accept ambiguous alias-only matches
- do not create a new facility id when a stable existing facility id is available
- do not treat inspection metadata as lesson/session metadata
- do not overwrite a stable id crosswalk with a weaker text-only crosswalk

## Accuracy Rules

Because the facility layer changes slowly, the repo should prefer correctness over convenience.

Required behaviors:

- preserve source coordinates when present
- label coordinate confidence honestly
- preserve civic ids exactly as source strings
- preserve the source facility id exactly
- keep name normalization deterministic
- keep generated crosswalk keys deterministic

When source coordinates are unavailable:

- the canonical facility reference may omit coordinates
- downstream runtime seed/load paths may apply explicit fallback logic
- fallback coordinates must not be mistaken for source-verified facility coordinates inside the canonical artifact

## Relationship To Runtime Search Data

Current runtime lesson search uses `LocationDocument`, `ProgramDocument`, and `SessionDocument`.

Relationship rules:

- `LocationDocument.id` must stay aligned with `FacilityReferenceRecord.locationId`
- session/program ingestion must look up facilities through the canonical reference layer
- facility reference data can be broader than the currently seeded lesson dataset
- parent-facing lesson search should still degrade cleanly when lesson/session feeds are incomplete

## Regeneration Path

Prerequisite for `.twbx` / `.hyper` inputs:

- local Python environment with `tableauhyperapi` available

Build the canonical facility reference from the provided workbook:

```powershell
python scripts/build-nyc-facility-reference.py `
  --input "C:\Users\bergi\Downloads\Specific NYC Pool Data.twbx" `
  --output data/nyc-facilities-canonical.json `
  --csv-output data/nyc-facilities-canonical.csv
```

Validate the current deterministic session seed against the canonical facility layer:

```powershell
npm run validate:seed:nyc
```

## Acceptance Criteria

This contract is satisfied when:

- the canonical facility artifact exists in the repo
- the artifact contains one record per stable facility id
- the artifact preserves stable ids, address, geography, and crosswalk keys
- inspection fields are preserved when present in the source
- the session seed loader reuses `locationId` values from the canonical facility artifact
- deterministic seed validation proves every `data/sessions-template.csv` facility id resolves through the canonical artifact
- tracker/runbook documentation points future agents at this facility-reference boundary
