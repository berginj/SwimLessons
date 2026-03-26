import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const resourceGroup = process.env.AZURE_RESOURCE_GROUP || 'swim-lessons-staging-rg';
const cosmosAccountName = process.env.COSMOS_ACCOUNT_NAME || 'cosmos-swim-stg01c';
const databaseId = process.env.COSMOS_DATABASE_ID || 'swimlessons';
const csvPath = process.env.SESSIONS_CSV_PATH || path.join(repoRoot, 'data', 'sessions-template.csv');

function run(command, args, options = {}) {
  const spawnOptions = {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.captureOutput ? 'pipe' : 'inherit',
    env: options.env || process.env,
  };

  const result =
    process.platform === 'win32'
      ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', buildCommandLine(command, args)], spawnOptions)
      : spawnSync(command, args, spawnOptions);

  if (result.status !== 0) {
    const detail = options.captureOutput && result.stderr ? `\n${result.stderr}` : '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}${detail}`);
  }

  return options.captureOutput ? result.stdout.trim() : '';
}

function getNpmCommand() {
  return 'npm';
}

function buildCommandLine(command, args) {
  return [quoteWindowsArg(command), ...args.map((arg) => quoteWindowsArg(arg))].join(' ');
}

function quoteWindowsArg(value) {
  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function main() {
  console.log('Reseeding deterministic NYC staging sessions...');
  console.log(`Resource group: ${resourceGroup}`);
  console.log(`Cosmos account: ${cosmosAccountName}`);
  console.log(`CSV: ${csvPath}`);

  const connectionString = run(
    'az',
    [
      'cosmosdb',
      'keys',
      'list',
      '--name',
      cosmosAccountName,
      '--resource-group',
      resourceGroup,
      '--type',
      'connection-strings',
      '--query',
      'connectionStrings[0].connectionString',
      '--output',
      'tsv',
    ],
    { captureOutput: true }
  );

  if (!connectionString) {
    throw new Error('Azure CLI returned an empty Cosmos DB connection string');
  }

  run(
    getNpmCommand(),
    ['exec', '--', 'tsx', 'scripts/load-sessions.ts', csvPath],
    {
      env: {
        ...process.env,
        COSMOS_CONNECTION_STRING: connectionString,
        COSMOS_DATABASE_ID: databaseId,
      },
    }
  );

  console.log('NYC staging seed complete.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
