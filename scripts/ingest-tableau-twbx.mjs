#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
  facility_id: ['facility_id', 'facilityid', 'permit_id', 'pool_id', 'site_id', 'id', 'accela'],
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

const SESSION_SIGNAL_FIELDS = [
  'program_name',
  'start_date',
  'end_date',
  'days_of_week',
  'time_start',
  'time_end',
  'price',
  'capacity',
  'enrolled',
  'registration_url',
];

let cachedArchiveTool = null;
const extractedArchives = new Map();

function usage() {
  console.log(`Usage:
  node scripts/ingest-tableau-twbx.mjs --input <path-to-file.twbx> [--output data/sessions-tableau.csv]

What it does:
  1) Lists CSV files packaged inside a Tableau .twbx.
  2) Picks the first CSV with enough session columns to map safely.
  3) Converts it to this repo's canonical session seed format.

What it will not do:
  - invent lesson/session rows from facility-only inspection data
  - silently accept a Tableau extract that lacks schedule/program fields

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

function buildHeaderMap(headers) {
  return new Map(headers.map((header) => [normalizeName(header), header]));
}

function findMappedColumn(headerMap, aliasKey) {
  const aliases = COLUMN_ALIASES[aliasKey] || [];
  for (const alias of aliases) {
    if (headerMap.has(alias)) return headerMap.get(alias);
  }
  return null;
}

function analyzeHeaderMap(headerMap) {
  const facilityColumn = findMappedColumn(headerMap, 'facility_id');
  const matchedSignals = SESSION_SIGNAL_FIELDS.map((key) => ({
    key,
    columnName: findMappedColumn(headerMap, key),
  })).filter((match) => match.columnName);

  return {
    facilityColumn,
    matchedSignals,
    isSessionLike: Boolean(facilityColumn && matchedSignals.length > 0),
  };
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

  const codes = [
    ...new Set(
      tokens
        .map((token) => {
          if (/^[0-6]$/.test(token)) {
            return Number.parseInt(token, 10);
          }

          return dayMap.get(token);
        })
        .filter((v) => Number.isInteger(v))
    ),
  ];
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

function commandExists(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'ignore',
    shell: false,
  });
  return !result.error;
}

function getArchiveTool() {
  if (cachedArchiveTool) {
    return cachedArchiveTool;
  }

  if (commandExists('unzip', ['-v'])) {
    cachedArchiveTool = 'unzip';
    return cachedArchiveTool;
  }

  if (commandExists('tar', ['--version'])) {
    cachedArchiveTool = 'tar';
    return cachedArchiveTool;
  }

  throw new Error(
    'Neither `unzip` nor `tar` is available on PATH. Install one of them to inspect Tableau .twbx packages.'
  );
}

function listArchiveEntries(inputPath) {
  const tool = getArchiveTool();
  const args = tool === 'unzip' ? ['-Z1', inputPath] : ['-tf', inputPath];
  const stdout = execFileSync(tool, args, { encoding: 'utf-8' });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractArchive(inputPath) {
  if (extractedArchives.has(inputPath)) {
    return extractedArchives.get(inputPath);
  }

  const tool = getArchiveTool();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tableau-twbx-'));
  const args = tool === 'unzip' ? ['-q', inputPath, '-d', tempDir] : ['-xf', inputPath, '-C', tempDir];

  execFileSync(tool, args, {
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 100,
  });

  extractedArchives.set(inputPath, tempDir);
  return tempDir;
}

function readArchiveEntry(inputPath, entryName) {
  const tool = getArchiveTool();

  if (tool === 'unzip') {
    return execFileSync('unzip', ['-p', inputPath, entryName], {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 100,
    });
  }

  const extractedRoot = extractArchive(inputPath);
  const entryPath = path.join(extractedRoot, ...entryName.split('/'));
  return fs.readFileSync(entryPath, 'utf-8');
}

function parseWorkbookMetadata(xmlContent) {
  const relationMatch = xmlContent.match(/<relation\b[^>]*name=(['"])(.*?)\1[^>]*table=(['"])(.*?)\3/);
  const sourceMatch = xmlContent.match(/<repository-location\b[^>]*derived-from=(['"])(.*?)\1/);

  const columns = [];
  const seen = new Set();
  const columnPattern = /<column\b[^>]*\bname=(['"])(.*?)\1/g;

  for (const match of xmlContent.matchAll(columnPattern)) {
    const columnName = cleanWorkbookColumnName(match[2]);
    if (!seen.has(columnName)) {
      seen.add(columnName);
      columns.push(columnName);
    }
  }

  return {
    relationName: relationMatch?.[2] || '',
    relationTable: relationMatch?.[4] || '',
    derivedFrom: sourceMatch?.[2] || '',
    columns,
  };
}

function cleanWorkbookColumnName(columnName) {
  if (/^\[.*\]$/.test(columnName)) {
    return columnName.slice(1, -1);
  }

  return columnName;
}

function inspectWorkbookMetadata(inputPath, entries) {
  const workbookEntry = entries.find((entry) => entry.toLowerCase().endsWith('.twb'));
  if (!workbookEntry) {
    return null;
  }

  const xmlContent = readArchiveEntry(inputPath, workbookEntry);
  return {
    entry: workbookEntry,
    ...parseWorkbookMetadata(xmlContent),
  };
}

function formatHeaderAnalysis(headers, analysis) {
  const headerPreview = headers.slice(0, 12).join(', ');
  const signalPreview = analysis.matchedSignals.map((match) => `${match.key} -> ${match.columnName}`).join(', ');

  return [
    `headers: ${headerPreview}${headers.length > 12 ? ', ...' : ''}`,
    `facility id column: ${analysis.facilityColumn || 'none'}`,
    `session signals: ${signalPreview || 'none'}`,
  ].join(' | ');
}

function buildWorkbookValidationError(metadata) {
  const headerMap = buildHeaderMap(metadata.columns);
  const analysis = analyzeHeaderMap(headerMap);
  const columnsPreview = metadata.columns.slice(0, 16).join(', ');
  const sourceBits = [];

  if (metadata.entry) {
    sourceBits.push(`workbook entry: ${metadata.entry}`);
  }
  if (metadata.relationName) {
    sourceBits.push(`relation: ${metadata.relationName}`);
  }
  if (metadata.relationTable) {
    sourceBits.push(`table: ${metadata.relationTable}`);
  }
  if (metadata.derivedFrom) {
    sourceBits.push(`source: ${metadata.derivedFrom}`);
  }

  if (analysis.isSessionLike) {
    return new Error(
      `This .twbx uses a Tableau extract (.hyper) rather than embedded CSVs. The workbook metadata suggests session-shaped columns, but this script does not read Hyper row data directly. Export the underlying Tableau data as CSV first. ${sourceBits.join(' | ')}`
    );
  }

  return new Error(
    `This .twbx package contains a Tableau extract, but the workbook metadata is not session-shaped enough for safe canonical session ingestion. ${sourceBits.join(' | ')} | recognized facility id column: ${
      analysis.facilityColumn || 'none'
    } | session signals: ${
      analysis.matchedSignals.map((match) => match.columnName).join(', ') || 'none'
    } | columns: ${columnsPreview}${
      metadata.columns.length > 16 ? ', ...' : ''
    }. This looks like facility/inspection data, not lesson session data. Provide a CSV export that includes facility id plus schedule/program fields such as program name, dates, days, or times.`
  );
}

function detectCandidateCsv(inputPath) {
  const entries = listArchiveEntries(inputPath);
  const csvEntries = entries.filter((entry) => entry.toLowerCase().endsWith('.csv'));
  const failedAnalyses = [];

  for (const entry of csvEntries) {
    const content = readArchiveEntry(inputPath, entry);
    const { headers, rows } = parseCsv(content);
    if (headers.length === 0 || rows.length === 0) {
      continue;
    }

    const headerMap = buildHeaderMap(headers);
    const analysis = analyzeHeaderMap(headerMap);

    if (analysis.isSessionLike) {
      return { entry, headers, rows, headerMap };
    }

    failedAnalyses.push({ entry, headers, analysis });
  }

  if (csvEntries.length === 0) {
    const metadata = inspectWorkbookMetadata(inputPath, entries);
    if (metadata) {
      throw buildWorkbookValidationError(metadata);
    }

    throw new Error('No CSV files found inside the .twbx package.');
  }

  const analysisSummary = failedAnalyses
    .map(({ entry, headers, analysis }) => `${entry}: ${formatHeaderAnalysis(headers, analysis)}`)
    .join('\n  - ');

  throw new Error(
    `Found CSV files (${csvEntries.join(', ')}) but none had enough session columns for safe conversion.\n  - ${analysisSummary}`
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

function cleanupExtractedArchives() {
  for (const tempDir of extractedArchives.values()) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  extractedArchives.clear();
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
  } finally {
    cleanupExtractedArchives();
  }
}

main();
