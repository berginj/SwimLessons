import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CONFIG = {
  parkingMode: {
    enabled: false,
    eyebrow: 'NYC MVP',
    title: "Find kids' swim lessons without digging through five provider sites.",
    heroCopy:
      'This MVP uses the deployed Azure Functions API when available and falls back to local demo data when it is not.',
    statusLabel: 'Parking mode',
    message:
      'Search and live transit lookups are paused right now. This page is staying online so families can still see that the service exists and check back later.',
    details:
      'Live search, session details, and telemetry collection will resume when the backend is turned back on.',
    resumeHint: 'Check back soon for the full NYC lesson search experience.',
  },
};

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const value = argv[index + 1];

    if (value === undefined || value.startsWith('--')) {
      options[key] = 'true';
      continue;
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));
const mode = options.mode || 'resume';
const outputPath = options.output
  ? path.resolve(options.output)
  : path.resolve('src/web/runtime-config.json');

if (!['park', 'resume'].includes(mode)) {
  throw new Error(`Unsupported mode "${mode}". Expected "park" or "resume".`);
}

const runtimeConfig = {
  parkingMode: {
    ...DEFAULT_CONFIG.parkingMode,
    enabled: mode === 'park',
    eyebrow:
      options.eyebrow
      || (mode === 'park' ? 'NYC parking mode' : DEFAULT_CONFIG.parkingMode.eyebrow),
    title: options.title || DEFAULT_CONFIG.parkingMode.title,
    heroCopy: options['hero-copy'] || DEFAULT_CONFIG.parkingMode.heroCopy,
    statusLabel: options['status-label'] || DEFAULT_CONFIG.parkingMode.statusLabel,
    message: options.message || DEFAULT_CONFIG.parkingMode.message,
    details: options.details || DEFAULT_CONFIG.parkingMode.details,
    resumeHint: options['resume-hint'] || DEFAULT_CONFIG.parkingMode.resumeHint,
  },
  generatedAt: new Date().toISOString(),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(runtimeConfig, null, 2)}\n`, 'utf8');

console.log(`Wrote runtime config to ${outputPath}`);
