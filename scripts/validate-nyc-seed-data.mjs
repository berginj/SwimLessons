import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_SESSIONS_CSV = path.join(repoRoot, 'data', 'sessions-template.csv');
const DEFAULT_FACILITY_ARTIFACT = path.join(repoRoot, 'data', 'nyc-facilities-canonical.json');

const EXPECTED_SESSION_COUNT = 144;
const EXPECTED_FACILITY_COUNT = 24;
const EXPECTED_SESSIONS_PER_FACILITY = 6;

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsv(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length < 2) {
    throw new Error(`Expected at least one data row in ${filepath}`);
  }

  const headers = splitCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push(row);
  }

  return rows;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireFile(filepath) {
  assert(fs.existsSync(filepath), `Required file not found: ${filepath}`);
}

function validateFacilityArtifact(filepath) {
  requireFile(filepath);

  const dataset = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  const facilities = Array.isArray(dataset?.facilities) ? dataset.facilities : [];

  assert(dataset?.cityId === 'nyc', `Expected facility artifact cityId=nyc, got ${dataset?.cityId}`);
  assert(facilities.length > 0, 'Expected facility artifact to contain facilities');

  const bySourceFacilityId = new Map();
  const duplicateSourceFacilityIds = new Set();
  const duplicateLocationIds = new Set();
  const seenLocationIds = new Set();

  for (const facility of facilities) {
    const sourceFacilityId = String(facility?.sourceFacilityId || '').trim();
    const locationId = String(facility?.locationId || '').trim();

    assert(sourceFacilityId, 'Every canonical facility must have sourceFacilityId');
    assert(locationId, `Facility ${sourceFacilityId} is missing locationId`);

    if (bySourceFacilityId.has(sourceFacilityId)) {
      duplicateSourceFacilityIds.add(sourceFacilityId);
    } else {
      bySourceFacilityId.set(sourceFacilityId, facility);
    }

    if (seenLocationIds.has(locationId)) {
      duplicateLocationIds.add(locationId);
    } else {
      seenLocationIds.add(locationId);
    }
  }

  assert(
    duplicateSourceFacilityIds.size === 0,
    `Duplicate sourceFacilityId values in canonical facility artifact: ${[...duplicateSourceFacilityIds].join(', ')}`
  );
  assert(
    duplicateLocationIds.size === 0,
    `Duplicate locationId values in canonical facility artifact: ${[...duplicateLocationIds].join(', ')}`
  );

  return bySourceFacilityId;
}

function validateSessionTemplateRows(rows, facilitiesById) {
  assert(
    rows.length === EXPECTED_SESSION_COUNT,
    `Expected ${EXPECTED_SESSION_COUNT} session rows, found ${rows.length}`
  );

  const facilityCounts = new Map();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const facilityId = String(row.facility_id || '').trim();
    const programName = String(row.program_name || '').trim();
    const startDate = String(row.start_date || '').trim();
    const endDate = String(row.end_date || '').trim();
    const timeStart = String(row.time_start || '').trim();
    const timeEnd = String(row.time_end || '').trim();
    const registrationUrl = String(row.registration_url || '').trim();

    assert(facilityId, `Row ${rowNumber} is missing facility_id`);
    assert(programName, `Row ${rowNumber} is missing program_name`);
    assert(startDate, `Row ${rowNumber} is missing start_date`);
    assert(endDate, `Row ${rowNumber} is missing end_date`);
    assert(timeStart, `Row ${rowNumber} is missing time_start`);
    assert(timeEnd, `Row ${rowNumber} is missing time_end`);
    assert(registrationUrl, `Row ${rowNumber} is missing registration_url`);
    assert(
      facilitiesById.has(facilityId),
      `Row ${rowNumber} references facility_id ${facilityId}, which is missing from data/nyc-facilities-canonical.json`
    );

    facilityCounts.set(facilityId, (facilityCounts.get(facilityId) || 0) + 1);
  }

  assert(
    facilityCounts.size === EXPECTED_FACILITY_COUNT,
    `Expected ${EXPECTED_FACILITY_COUNT} unique facility_ids, found ${facilityCounts.size}`
  );

  const invalidFacilityCounts = [...facilityCounts.entries()]
    .filter(([, count]) => count !== EXPECTED_SESSIONS_PER_FACILITY)
    .map(([facilityId, count]) => `${facilityId} (${count})`);

  assert(
    invalidFacilityCounts.length === 0,
    `Expected exactly ${EXPECTED_SESSIONS_PER_FACILITY} sessions per facility, found mismatches: ${invalidFacilityCounts.join(', ')}`
  );

  return facilityCounts;
}

function main() {
  console.log('Validating deterministic NYC seed data...');

  const facilitiesById = validateFacilityArtifact(DEFAULT_FACILITY_ARTIFACT);
  const rows = parseCsv(DEFAULT_SESSIONS_CSV);
  const facilityCounts = validateSessionTemplateRows(rows, facilitiesById);

  console.log(
    `✓ Canonical facility artifact is valid (${facilitiesById.size} facilities, unique source ids + location ids)`
  );
  console.log(
    `✓ Session template is valid (${rows.length} rows across ${facilityCounts.size} facilities)`
  );
  console.log(
    `✓ Each seeded facility has ${EXPECTED_SESSIONS_PER_FACILITY} deterministic session rows and resolves to a canonical facility`
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
