import {
  DAY_MS,
  DEFAULT_CITY_ID,
  DEFAULT_DAYS,
  DEFAULT_FUNCTION_NAME,
  fetchCityStats,
  formatNumber,
  formatPercent,
  parseIsoDate,
  resolveOperatorContext,
} from './operator-city-stats-lib.mjs';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dateWindow = resolveDateWindow(options);
  const { resourceGroup, functionAppName, functionKey } = resolveOperatorContext({
    environment: options.environment,
    resourceGroup: options.resourceGroup,
    functionAppName: options.functionAppName,
    functionName: options.functionName,
  });
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
