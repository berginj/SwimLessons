#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_HEADERS = [
  'facility_id',
  'program_name',
  'skill_level',
  'age_min_months',
  'age_max_months',
  'start_date',
  'end_date',
  'days_of_week',
  'time_start',
  'time_end',
  'price',
  'capacity',
  'enrolled',
  'registration_url',
  'notes',
];

const COLUMN_ALIASES = {
  facility_id: ['facility_id', 'facilityid', 'permit_id', 'pool_id', 'site_id', 'id'],
  program_name: ['program_name', 'program', 'class_name', 'lesson_name', 'offering_name', 'name'],
  skill_level: ['skill_level', 'level', 'program_level', 'ability_level'],
  age_min_months: ['age_min_months', 'min_age_months', 'minimum_age_months'],
  age_max_months: ['age_max_months', 'max_age_months', 'maximum_age_months'],
  min_age_years: ['min_age_years', 'minimum_age_years', 'age_min_years'],
  max_age_years: ['max_age_years', 'maximum_age_years', 'age_max_years'],
  start_date: ['start_date', 'session_start', 'start', 'starts_on'],
  end_date: ['end_date', 'session_end', 'end', 'ends_on'],
  days_of_week: ['days_of_week', 'days', 'meeting_days', 'day_pattern'],
  time_start: ['time_start', 'start_time', 'class_start', 'session_start_time'],
  time_end: ['time_end', 'end_time', 'class_end', 'session_end_time'],
  price: ['price', 'cost', 'fee', 'tuition'],
  capacity: ['capacity', 'max_capacity', 'spots_total', 'seats_total'],
  enrolled: ['enrolled', 'enrollment', 'spots_filled', 'seats_filled'],
  registration_url: ['registration_url', 'signup_url', 'enrollment_url', 'url'],
  notes: ['notes', 'description', 'comments'],
};

function usage() {
  console.log(`Usage:
  node scripts/ingest-tableau-twbx.mjs --input <path-to-file.twbx> [--output data/sessions-tableau.csv]

What it does:
  1) Lists CSV files packaged inside a Tableau .twbx.
  2) Picks the first CSV with mappable session columns.
  3) Converts it to this repo's canonical session seed format.

Default output: data/sessions-from-tableau.csv`);
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function normalizeName(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = (values[idx] || '').trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

function findMappedColumn(headerMap, aliasKey) {
  const aliases = COLUMN_ALIASES[aliasKey] || [];
  for (const alias of aliases) {
    if (headerMap.has(alias)) return headerMap.get(alias);
  }
  return null;
}

function toIsoDate(value) {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return '';
}

function to24h(value) {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
  if (match) {
    let hours = Number.parseInt(match[1], 10);
    const mins = Number.parseInt(match[2] || '00', 10);
    const ampm = match[3].toLowerCase();

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  return '';
}

function parseDaysToCodes(value) {
  if (!value) return '1,3,5';

  const dayMap = new Map([
    ['sun', 0],
    ['sunday', 0],
    ['mon', 1],
    ['monday', 1],
    ['tue', 2],
    ['tues', 2],
    ['tuesday', 2],
    ['wed', 3],
    ['wednesday', 3],
    ['thu', 4],
    ['thur', 4],
    ['thurs', 4],
    ['thursday', 4],
    ['fri', 5],
    ['friday', 5],
    ['sat', 6],
    ['saturday', 6],
  ]);

  const tokens = value
    .split(/[\s,;/|-]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const codes = [...new Set(tokens.map((token) => dayMap.get(token)).filter((v) => Number.isInteger(v)))];
  if (codes.length === 0) return '1,3,5';

  return codes.sort((a, b) => a - b).join(',');
}

function escapeCsv(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function listZipEntries(inputPath) {
  const stdout = execFileSync('unzip', ['-Z1', inputPath], { encoding: 'utf-8' });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readZipEntry(inputPath, entryName) {
  return execFileSync('unzip', ['-p', inputPath, entryName], {
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 100,
  });
}

function detectCandidateCsv(inputPath) {
  const entries = listZipEntries(inputPath).filter((entry) => entry.toLowerCase().endsWith('.csv'));

  if (entries.length === 0) {
    throw new Error('No CSV files found inside the .twbx package.');
  }

  for (const entry of entries) {
    const content = readZipEntry(inputPath, entry);
    const { headers, rows } = parseCsv(content);
    if (headers.length === 0 || rows.length === 0) continue;

    const headerMap = new Map(headers.map((h) => [normalizeName(h), h]));
    const facilityColumn = findMappedColumn(headerMap, 'facility_id');
    const programColumn = findMappedColumn(headerMap, 'program_name');

    if (facilityColumn || programColumn) {
      return { entry, headers, rows, headerMap };
    }
  }

  throw new Error(
    `Found CSV files (${entries.join(', ')}) but none had recognizable facility/program columns.`
  );
}

function pickValue(row, headerMap, aliasKey) {
  const columnName = findMappedColumn(headerMap, aliasKey);
  if (!columnName) return '';
  return (row[columnName] || '').trim();
}

function transformRows(rows, headerMap) {
  return rows
    .map((row, idx) => {
      const facilityId = pickValue(row, headerMap, 'facility_id');
      if (!facilityId) return null;

      const minMonthsRaw = pickValue(row, headerMap, 'age_min_months');
      const maxMonthsRaw = pickValue(row, headerMap, 'age_max_months');
      const minYearsRaw = pickValue(row, headerMap, 'min_age_years');
      const maxYearsRaw = pickValue(row, headerMap, 'max_age_years');

      const minMonths = minMonthsRaw || (minYearsRaw ? String(Number(minYearsRaw) * 12) : '48');
      const maxMonths = maxMonthsRaw || (maxYearsRaw ? String(Number(maxYearsRaw) * 12) : '180');

      const output = {
        facility_id: facilityId,
        program_name: pickValue(row, headerMap, 'program_name') || `Program ${idx + 1}`,
        skill_level: (pickValue(row, headerMap, 'skill_level') || 'beginner').toLowerCase(),
        age_min_months: minMonths,
        age_max_months: maxMonths,
        start_date: toIsoDate(pickValue(row, headerMap, 'start_date')),
        end_date: toIsoDate(pickValue(row, headerMap, 'end_date')),
        days_of_week: parseDaysToCodes(pickValue(row, headerMap, 'days_of_week')),
        time_start: to24h(pickValue(row, headerMap, 'time_start')) || '17:00',
        time_end: to24h(pickValue(row, headerMap, 'time_end')) || '18:00',
        price: pickValue(row, headerMap, 'price') || '0',
        capacity: pickValue(row, headerMap, 'capacity') || '20',
        enrolled: pickValue(row, headerMap, 'enrolled') || '0',
        registration_url: pickValue(row, headerMap, 'registration_url'),
        notes: pickValue(row, headerMap, 'notes') || 'Imported from Tableau TWBX',
      };

      return output;
    })
    .filter(Boolean);
}

function writeOutput(rows, outputPath) {
  const lines = [OUTPUT_HEADERS.join(',')];

  for (const row of rows) {
    lines.push(OUTPUT_HEADERS.map((header) => escapeCsv(row[header] || '')).join(','));
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf-8');
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    process.exit(0);
  }

  const input = getArg('--input');
  const output = getArg('--output') || 'data/sessions-from-tableau.csv';

  if (!input) {
    usage();
    process.exit(1);
  }

  if (!fs.existsSync(input)) {
    console.error(`❌ Input file not found: ${input}`);
    process.exit(1);
  }

  try {
    const { entry, headers, rows, headerMap } = detectCandidateCsv(input);
    const transformed = transformRows(rows, headerMap);

    if (transformed.length === 0) {
      throw new Error('No rows with recognizable facility IDs were produced.');
    }

    writeOutput(transformed, output);

    console.log('✅ TWBX ingestion completed');
    console.log(`   Source workbook: ${input}`);
    console.log(`   Selected CSV entry: ${entry}`);
    console.log(`   Source columns (${headers.length}): ${headers.join(', ')}`);
    console.log(`   Rows imported: ${transformed.length}`);
    console.log(`   Output CSV: ${output}`);
    console.log('');
    console.log('Next step:');
    console.log(`  npx tsx scripts/load-sessions.ts ${output}`);
  } catch (error) {
    console.error('❌ Failed to ingest .twbx file.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
