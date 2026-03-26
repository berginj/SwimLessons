import { spawnSync } from 'node:child_process';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;
const DEFAULT_CITY_ID = 'nyc';
const DEFAULT_FUNCTION_NAME = 'operator-city-stats';
const ENVIRONMENT_DEFAULTS = {
  staging: {
    resourceGroup: 'swim-lessons-staging-rg',
  },
  production: {
    resourceGroup: 'swim-lessons-production-rg',
  },
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dateWindow = resolveDateWindow(options);
  const resourceGroup = options.resourceGroup || getEnvironmentDefault(options.environment).resourceGroup;
  const functionAppName = options.functionAppName || resolveFunctionAppName(resourceGroup);
  const functionKey = resolveFunctionKey(resourceGroup, functionAppName, options.functionName);
  const payload = await fetchCityStats({
    functionAppName,
    functionKey,
    cityId: options.cityId,
    startDate: dateWindow.startDate,
    endDate: dateWindow.endDate,
  });

  if (options.format === 'json') {
    console.log(
      JSON.stringify(
        {
          functionAppName,
          resourceGroup,
          window: {
            startDate: dateWindow.startDate.toISOString(),
            endDate: dateWindow.endDate.toISOString(),
          },
          payload,
        },
        null,
        2
      )
    );
    return;
  }

  printSummary({
    cityId: options.cityId,
    resourceGroup,
    functionAppName,
    startDate: dateWindow.startDate,
    endDate: dateWindow.endDate,
    stats: payload.stats,
  });
}

function parseArgs(argv) {
  const options = {
    environment: process.env.ENVIRONMENT || 'staging',
    resourceGroup: process.env.AZURE_RESOURCE_GROUP || '',
    functionAppName: process.env.FUNCTION_APP_NAME || '',
    functionName: DEFAULT_FUNCTION_NAME,
    cityId: DEFAULT_CITY_ID,
    days: DEFAULT_DAYS,
    startDate: '',
    endDate: '',
    format: 'summary',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--environment':
        options.environment = readRequiredValue(argv, ++index, '--environment');
        break;
      case '--resource-group':
        options.resourceGroup = readRequiredValue(argv, ++index, '--resource-group');
        break;
      case '--function-app':
        options.functionAppName = readRequiredValue(argv, ++index, '--function-app');
        break;
      case '--function-name':
        options.functionName = readRequiredValue(argv, ++index, '--function-name');
        break;
      case '--city':
        options.cityId = readRequiredValue(argv, ++index, '--city');
        break;
      case '--days':
        options.days = Number.parseInt(readRequiredValue(argv, ++index, '--days'), 10);
        break;
      case '--start-date':
        options.startDate = readRequiredValue(argv, ++index, '--start-date');
        break;
      case '--end-date':
        options.endDate = readRequiredValue(argv, ++index, '--end-date');
        break;
      case '--format':
        options.format = readRequiredValue(argv, ++index, '--format');
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.days) || options.days <= 0) {
    throw new Error('--days must be a positive integer');
  }

  if (options.format !== 'summary' && options.format !== 'json') {
    throw new Error('--format must be "summary" or "json"');
  }

  return options;
}

function readRequiredValue(argv, index, flagName) {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flagName} requires a value`);
  }
  return value;
}

function resolveDateWindow(options) {
  const endDate = options.endDate ? parseIsoDate(options.endDate, '--end-date') : new Date();
  const startDate = options.startDate
    ? parseIsoDate(options.startDate, '--start-date')
    : new Date(endDate.getTime() - options.days * DAY_MS);

  if (startDate > endDate) {
    throw new Error('start date must be before or equal to end date');
  }

  return { startDate, endDate };
}

function parseIsoDate(value, flagName) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${flagName} must be a valid ISO timestamp`);
  }
  return parsed;
}

function getEnvironmentDefault(environment) {
  const envConfig = ENVIRONMENT_DEFAULTS[environment];
  if (!envConfig) {
    throw new Error(
      `Unsupported environment "${environment}". Pass --resource-group and --function-app explicitly.`
    );
  }
  return envConfig;
}

function resolveFunctionAppName(resourceGroup) {
  const functionAppsJson = runAz([
    'functionapp',
    'list',
    '--resource-group',
    resourceGroup,
    '--output',
    'json',
  ]);
  const functionApps = JSON.parse(functionAppsJson);
  const functionAppName = functionApps.find(
    (app) => typeof app?.name === 'string' && app.name.startsWith('func-swim-')
  )?.name;

  if (!functionAppName) {
    throw new Error(`Could not resolve a function app in resource group ${resourceGroup}`);
  }

  return functionAppName.trim();
}

function resolveFunctionKey(resourceGroup, functionAppName, functionName) {
  const directFunctionKey = runAzMaybe([
    'functionapp',
    'function',
    'keys',
    'list',
    '--resource-group',
    resourceGroup,
    '--name',
    functionAppName,
    '--function-name',
    functionName,
    '--query',
    'default',
    '--output',
    'tsv',
  ]);

  if (directFunctionKey && directFunctionKey !== 'null') {
    return directFunctionKey.trim();
  }

  const hostKey = runAzMaybe([
    'functionapp',
    'keys',
    'list',
    '--resource-group',
    resourceGroup,
    '--name',
    functionAppName,
    '--query',
    'functionKeys.default',
    '--output',
    'tsv',
  ]);

  if (hostKey && hostKey !== 'null') {
    return hostKey.trim();
  }

  throw new Error(
    `Could not resolve a Function key for ${functionAppName}/${functionName}. Confirm Azure login and access.`
  );
}

async function fetchCityStats({ functionAppName, functionKey, cityId, startDate, endDate }) {
  const url = new URL(`https://${functionAppName}.azurewebsites.net/api/operator/cities/${encodeURIComponent(cityId)}/stats`);
  url.searchParams.set('startDate', startDate.toISOString());
  url.searchParams.set('endDate', endDate.toISOString());

  const response = await fetch(url, {
    headers: {
      'x-functions-key': functionKey,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`City stats request failed: ${response.status} ${response.statusText}\n${text}`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`City stats request returned invalid JSON\n${text}`);
  }

  if (!payload?.success || !payload?.data?.stats) {
    throw new Error(`City stats response did not include stats payload\n${text}`);
  }

  return payload.data;
}

function printSummary({ cityId, resourceGroup, functionAppName, startDate, endDate, stats }) {
  const lines = [
    `Operator city stats for ${cityId}`,
    `Function App: ${functionAppName}`,
    `Resource Group: ${resourceGroup}`,
    `Window: ${startDate.toISOString()} -> ${endDate.toISOString()}`,
    '',
    `Supply: ${stats.activeSessionsCount} active / ${stats.totalSessions} total sessions, ${stats.totalProviders} providers, ${stats.totalLocations} locations`,
    `Confidence: high ${stats.dataConfidence.high}, medium ${stats.dataConfidence.medium}, low ${stats.dataConfidence.low}`,
    `Usage: ${stats.dailyActiveUsers} daily active users, ${stats.totalSearches} searches, ${stats.totalSignupClicks} signup clicks`,
    `Search quality: avg results ${formatNumber(stats.avgResultsPerSearch)}, no-results ${formatPercent(stats.noResultsRate)}, relaxation success ${formatPercent(stats.relaxationSuccessRate)}`,
    `Performance: avg latency ${formatNumber(stats.avgSearchLatencyMs)} ms, p95 latency ${formatNumber(stats.p95SearchLatencyMs)} ms, error rate ${formatPercent(stats.errorRate)}`,
    `Conversion: ${formatPercent(stats.conversionRate)}`,
    `Last sync: ${stats.lastSyncAt} (${stats.lastSyncStatus}, ${stats.lastSyncRecordsUpdated} records updated)`,
  ];

  console.log(lines.join('\n'));
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatNumber(value) {
  return Number(value || 0).toFixed(Number.isInteger(value) ? 0 : 2);
}

function runAz(args) {
  const result =
    process.platform === 'win32'
      ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'az', ...args], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawnSync('az', args, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });

  if (result.status !== 0) {
    throw new Error(`Azure CLI command failed: az ${args.join(' ')}\n${(result.stderr || result.stdout || '').trim()}`);
  }

  return (result.stdout || '').trim();
}

function runAzMaybe(args) {
  try {
    return runAz(args);
  } catch {
    return '';
  }
}

function printUsage() {
  console.log(`Usage: npm run operator:city-stats -- [options]

Options:
  --environment <staging|production>  Environment shortcut for default resource group
  --resource-group <name>             Azure resource group override
  --function-app <name>               Function App name override
  --function-name <name>              Function name for key lookup (default: ${DEFAULT_FUNCTION_NAME})
  --city <cityId>                     City to query (default: ${DEFAULT_CITY_ID})
  --days <number>                     Rolling window when start/end not provided (default: ${DEFAULT_DAYS})
  --start-date <iso>                  Explicit start timestamp
  --end-date <iso>                    Explicit end timestamp
  --format <summary|json>             Output format (default: summary)
  --help                              Show this help
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
