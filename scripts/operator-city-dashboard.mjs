import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
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

const DEFAULT_COMPARISON_DAYS = 7;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const primaryWindow = resolveDateWindow(options);
  const comparisonWindow = resolveComparisonWindow(options, primaryWindow.endDate);
  const { resourceGroup, functionAppName, functionKey } = resolveOperatorContext({
    environment: options.environment,
    resourceGroup: options.resourceGroup,
    functionAppName: options.functionAppName,
    functionName: options.functionName,
  });

  const [primaryPayload, comparisonPayload] = await Promise.all([
    fetchCityStats({
      functionAppName,
      functionKey,
      cityId: options.cityId,
      startDate: primaryWindow.startDate,
      endDate: primaryWindow.endDate,
    }),
    fetchCityStats({
      functionAppName,
      functionKey,
      cityId: options.cityId,
      startDate: comparisonWindow.startDate,
      endDate: comparisonWindow.endDate,
    }),
  ]);

  const outputPath = resolveOutputPath(options);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    buildDashboardHtml({
      environment: options.environment,
      cityId: options.cityId,
      resourceGroup,
      functionAppName,
      outputPath,
      generatedAt: new Date(),
      primaryWindow,
      comparisonWindow,
      primaryStats: primaryPayload.stats,
      comparisonStats: comparisonPayload.stats,
    }),
    'utf8'
  );

  console.log(`Operator dashboard written to ${outputPath}`);

  if (options.open) {
    openInBrowser(outputPath);
    console.log('Opened dashboard in the default browser');
  }
}

function parseArgs(argv) {
  const options = {
    environment: process.env.ENVIRONMENT || 'staging',
    resourceGroup: process.env.AZURE_RESOURCE_GROUP || '',
    functionAppName: process.env.FUNCTION_APP_NAME || '',
    functionName: DEFAULT_FUNCTION_NAME,
    cityId: DEFAULT_CITY_ID,
    days: DEFAULT_DAYS,
    comparisonDays: DEFAULT_COMPARISON_DAYS,
    startDate: '',
    endDate: '',
    output: '',
    open: false,
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
      case '--comparison-days':
        options.comparisonDays = Number.parseInt(
          readRequiredValue(argv, ++index, '--comparison-days'),
          10
        );
        break;
      case '--start-date':
        options.startDate = readRequiredValue(argv, ++index, '--start-date');
        break;
      case '--end-date':
        options.endDate = readRequiredValue(argv, ++index, '--end-date');
        break;
      case '--output':
        options.output = readRequiredValue(argv, ++index, '--output');
        break;
      case '--open':
        options.open = true;
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

  if (!Number.isInteger(options.comparisonDays) || options.comparisonDays <= 0) {
    throw new Error('--comparison-days must be a positive integer');
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

function resolveComparisonWindow(options, endDate) {
  return {
    startDate: new Date(endDate.getTime() - options.comparisonDays * DAY_MS),
    endDate,
  };
}

function resolveOutputPath(options) {
  if (options.output) {
    return path.resolve(options.output);
  }

  return path.join(
    os.tmpdir(),
    'swim-lessons-operator',
    `operator-dashboard-${options.environment}-${options.cityId}.html`
  );
}

function buildDashboardHtml({
  environment,
  cityId,
  resourceGroup,
  functionAppName,
  outputPath,
  generatedAt,
  primaryWindow,
  comparisonWindow,
  primaryStats,
  comparisonStats,
}) {
  const alerts = buildAlerts(primaryStats);
  const comparisonRows = [
    {
      label: 'Searches / day',
      primary: perDay(primaryStats.totalSearches, primaryWindow),
      comparison: perDay(comparisonStats.totalSearches, comparisonWindow),
      formatter: formatNumber,
    },
    {
      label: 'Signup clicks / day',
      primary: perDay(primaryStats.totalSignupClicks, primaryWindow),
      comparison: perDay(comparisonStats.totalSignupClicks, comparisonWindow),
      formatter: formatNumber,
    },
    {
      label: 'Avg results / search',
      primary: primaryStats.avgResultsPerSearch,
      comparison: comparisonStats.avgResultsPerSearch,
      formatter: formatNumber,
    },
    {
      label: 'No-results rate',
      primary: primaryStats.noResultsRate,
      comparison: comparisonStats.noResultsRate,
      formatter: formatPercent,
    },
    {
      label: 'Avg search latency',
      primary: primaryStats.avgSearchLatencyMs,
      comparison: comparisonStats.avgSearchLatencyMs,
      formatter: (value) => `${formatNumber(value)} ms`,
    },
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Operator Dashboard: ${escapeHtml(cityId)}</title>
  <style>
    :root {
      --bg: #f4efe6;
      --paper: #fffaf2;
      --ink: #1f2a1f;
      --muted: #5d665d;
      --border: #d8ccb9;
      --accent: #0b6e4f;
      --accent-soft: #d8efe7;
      --warn: #b7791f;
      --warn-soft: #f8e8cc;
      --danger: #b42318;
      --danger-soft: #fce7e5;
      --shadow: 0 10px 30px rgba(47, 39, 24, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: linear-gradient(180deg, #efe4d3 0%, var(--bg) 35%, #f8f4ed 100%);
      color: var(--ink);
      font-family: Georgia, "Times New Roman", serif;
    }
    main {
      max-width: 1120px;
      margin: 0 auto;
      padding: 40px 20px 60px;
    }
    .hero {
      background: var(--paper);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 28px;
      box-shadow: var(--shadow);
      margin-bottom: 24px;
    }
    h1, h2, h3, p { margin: 0; }
    h1 {
      font-size: clamp(2rem, 5vw, 3.5rem);
      line-height: 0.95;
      margin-bottom: 12px;
    }
    .subhead {
      color: var(--muted);
      font-size: 1rem;
      line-height: 1.5;
      max-width: 720px;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 20px;
      font-size: 0.95rem;
    }
    .meta-card,
    .card {
      background: rgba(255, 255, 255, 0.75);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 16px;
    }
    .section {
      margin-top: 24px;
    }
    .section-title {
      font-size: 1.2rem;
      margin-bottom: 12px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 14px;
    }
    .metric-label {
      color: var(--muted);
      font-size: 0.9rem;
      margin-bottom: 8px;
    }
    .metric-value {
      font-size: 2rem;
      line-height: 1;
    }
    .metric-note {
      color: var(--muted);
      font-size: 0.95rem;
      margin-top: 8px;
      line-height: 1.4;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--paper);
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    th, td {
      padding: 14px 16px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      font-size: 0.9rem;
      color: var(--muted);
      font-weight: 600;
      background: rgba(255, 255, 255, 0.7);
    }
    tr:last-child td { border-bottom: 0; }
    .alert-list {
      display: grid;
      gap: 12px;
    }
    .alert {
      border-radius: 18px;
      padding: 16px 18px;
      border: 1px solid transparent;
      box-shadow: var(--shadow);
    }
    .alert-critical {
      background: var(--danger-soft);
      border-color: #f0b4ae;
    }
    .alert-warning {
      background: var(--warn-soft);
      border-color: #efc983;
    }
    .alert-ok {
      background: var(--accent-soft);
      border-color: #9bcfbd;
    }
    .pill {
      display: inline-block;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 0.75rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .pill-critical { background: #f5c4bf; color: #7a2018; }
    .pill-warning { background: #f0d59f; color: #7f4f00; }
    .pill-ok { background: #bbe3d5; color: #075a41; }
    code {
      font-family: Consolas, "Courier New", monospace;
      font-size: 0.9rem;
    }
    @media (max-width: 700px) {
      main { padding: 24px 14px 40px; }
      .hero { padding: 22px; border-radius: 20px; }
      .metric-value { font-size: 1.6rem; }
      th, td { padding: 12px; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>Operator Dashboard</h1>
      <p class="subhead">
        Local HTML report generated from the protected city stats endpoint. This avoids exposing a Function key in the public web app while giving operators a richer read on the NYC MVP.
      </p>
      <div class="meta">
        <div class="meta-card"><strong>Environment</strong><br>${escapeHtml(environment)}</div>
        <div class="meta-card"><strong>City</strong><br>${escapeHtml(cityId)}</div>
        <div class="meta-card"><strong>Function App</strong><br>${escapeHtml(functionAppName)}</div>
        <div class="meta-card"><strong>Resource Group</strong><br>${escapeHtml(resourceGroup)}</div>
        <div class="meta-card"><strong>Window</strong><br>${escapeHtml(formatWindow(primaryWindow))}</div>
        <div class="meta-card"><strong>Generated</strong><br>${escapeHtml(generatedAt.toISOString())}</div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Supply and Funnel</h2>
      <div class="grid">
        <article class="card">
          <div class="metric-label">Active sessions</div>
          <div class="metric-value">${escapeHtml(String(primaryStats.activeSessionsCount))}</div>
          <div class="metric-note">${escapeHtml(String(primaryStats.totalSessions))} total sessions across ${escapeHtml(String(primaryStats.totalLocations))} locations</div>
        </article>
        <article class="card">
          <div class="metric-label">Searches</div>
          <div class="metric-value">${escapeHtml(String(primaryStats.totalSearches))}</div>
          <div class="metric-note">${escapeHtml(String(primaryStats.totalSignupClicks))} signup clicks and ${escapeHtml(formatPercent(primaryStats.conversionRate))} conversion</div>
        </article>
        <article class="card">
          <div class="metric-label">Daily active users</div>
          <div class="metric-value">${escapeHtml(String(primaryStats.dailyActiveUsers))}</div>
          <div class="metric-note">Unique recent actors in the last 24 hours</div>
        </article>
        <article class="card">
          <div class="metric-label">Average results</div>
          <div class="metric-value">${escapeHtml(formatNumber(primaryStats.avgResultsPerSearch))}</div>
          <div class="metric-note">${escapeHtml(formatPercent(primaryStats.noResultsRate))} no-results rate</div>
        </article>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Search Quality and Performance</h2>
      <div class="grid">
        <article class="card">
          <div class="metric-label">Relaxation success</div>
          <div class="metric-value">${escapeHtml(formatPercent(primaryStats.relaxationSuccessRate))}</div>
          <div class="metric-note">When fallback filter relaxation was attempted</div>
        </article>
        <article class="card">
          <div class="metric-label">Average latency</div>
          <div class="metric-value">${escapeHtml(formatNumber(primaryStats.avgSearchLatencyMs))} <span style="font-size:1rem">ms</span></div>
          <div class="metric-note">P95 ${escapeHtml(formatNumber(primaryStats.p95SearchLatencyMs))} ms</div>
        </article>
        <article class="card">
          <div class="metric-label">Error rate</div>
          <div class="metric-value">${escapeHtml(formatPercent(primaryStats.errorRate))}</div>
          <div class="metric-note">Search errors over the selected window</div>
        </article>
        <article class="card">
          <div class="metric-label">Last sync</div>
          <div class="metric-value" style="font-size:1.2rem; line-height:1.3">${escapeHtml(primaryStats.lastSyncStatus.toUpperCase())}</div>
          <div class="metric-note">${escapeHtml(primaryStats.lastSyncAt)} with ${escapeHtml(String(primaryStats.lastSyncRecordsUpdated))} records updated</div>
        </article>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Window Comparison</h2>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>${escapeHtml(formatWindow(comparisonWindow))}</th>
            <th>${escapeHtml(formatWindow(primaryWindow))}</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          ${comparisonRows
            .map((row) => {
              const formatter = row.formatter;
              const delta = row.primary - row.comparison;
              const deltaPrefix = delta > 0 ? '+' : '';
              return `<tr>
                <td>${escapeHtml(row.label)}</td>
                <td>${escapeHtml(formatter(row.comparison))}</td>
                <td>${escapeHtml(formatter(row.primary))}</td>
                <td>${escapeHtml(deltaPrefix)}${escapeHtml(formatter(delta))}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2 class="section-title">Operator Alerts</h2>
      <div class="alert-list">
        ${alerts
          .map(
            (alert) => `<article class="alert alert-${escapeHtml(alert.level)}">
              <div class="pill pill-${escapeHtml(alert.level)}">${escapeHtml(alert.level)}</div>
              <h3>${escapeHtml(alert.title)}</h3>
              <p class="metric-note">${escapeHtml(alert.message)}</p>
            </article>`
          )
          .join('')}
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Confidence Mix</h2>
      <div class="grid">
        <article class="card">
          <div class="metric-label">High confidence</div>
          <div class="metric-value">${escapeHtml(String(primaryStats.dataConfidence.high))}</div>
        </article>
        <article class="card">
          <div class="metric-label">Medium confidence</div>
          <div class="metric-value">${escapeHtml(String(primaryStats.dataConfidence.medium))}</div>
        </article>
        <article class="card">
          <div class="metric-label">Low confidence</div>
          <div class="metric-value">${escapeHtml(String(primaryStats.dataConfidence.low))}</div>
        </article>
      </div>
      <p class="metric-note" style="margin-top: 12px;">
        Report file: <code>${escapeHtml(outputPath)}</code>
      </p>
    </section>
  </main>
</body>
</html>`;
}

function buildAlerts(stats) {
  const alerts = [];

  if (stats.activeSessionsCount <= 0) {
    alerts.push({
      level: 'critical',
      title: 'No active sessions',
      message: 'The parent journey is effectively broken because NYC search cannot return bookable lessons.',
    });
  }

  if (stats.lastSyncStatus !== 'success') {
    alerts.push({
      level: 'critical',
      title: 'Latest sync did not succeed',
      message: `Last sync status is ${stats.lastSyncStatus}. Confirm the NYC seed or sync path before trusting search freshness.`,
    });
  }

  if (stats.totalSearches === 0) {
    alerts.push({
      level: 'warning',
      title: 'No recent search traffic',
      message: 'Telemetry shows zero searches in the selected window. Check that /api/events is healthy and that the search UI is still instrumented.',
    });
  }

  if (stats.noResultsRate >= 0.25) {
    alerts.push({
      level: 'warning',
      title: 'No-results rate is elevated',
      message: `No-results rate is ${formatPercent(stats.noResultsRate)}. Review seeded supply, filters, and transit assumptions.`,
    });
  }

  if (stats.errorRate >= 0.05) {
    alerts.push({
      level: 'critical',
      title: 'Search error rate is high',
      message: `Error rate is ${formatPercent(stats.errorRate)}. Treat the parent experience as unstable until search errors come back down.`,
    });
  }

  if (stats.totalSignupClicks === 0 && stats.totalSearches > 0) {
    alerts.push({
      level: 'warning',
      title: 'Searches are not converting',
      message: 'Search traffic exists but no signup clicks were recorded. Review CTA wiring, lesson quality, and telemetry integrity.',
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      level: 'ok',
      title: 'No critical operator alerts',
      message: 'Supply, sync status, and core search health are within the current NYC MVP expectations for this reporting window.',
    });
  }

  return alerts;
}

function perDay(value, window) {
  const totalDays = Math.max(1, Math.round((window.endDate.getTime() - window.startDate.getTime()) / DAY_MS));
  return value / totalDays;
}

function formatWindow(window) {
  return `${window.startDate.toISOString().slice(0, 10)} to ${window.endDate
    .toISOString()
    .slice(0, 10)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function openInBrowser(filePath) {
  const resolved = path.resolve(filePath);
  if (process.platform === 'win32') {
    spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'start', '""', resolved], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    return;
  }

  if (process.platform === 'darwin') {
    spawn('open', [resolved], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  spawn('xdg-open', [resolved], { detached: true, stdio: 'ignore' }).unref();
}

function printUsage() {
  console.log(`Usage: npm run operator:city-dashboard -- [options]

Options:
  --environment <staging|production>  Environment shortcut for default resource group
  --resource-group <name>             Azure resource group override
  --function-app <name>               Function App name override
  --function-name <name>              Function name for key lookup (default: ${DEFAULT_FUNCTION_NAME})
  --city <cityId>                     City to query (default: ${DEFAULT_CITY_ID})
  --days <number>                     Primary reporting window in days (default: ${DEFAULT_DAYS})
  --comparison-days <number>          Comparison window in days (default: ${DEFAULT_COMPARISON_DAYS})
  --start-date <iso>                  Explicit start timestamp for primary window
  --end-date <iso>                    Explicit end timestamp for primary window
  --output <path>                     Write HTML dashboard to this path
  --open                              Open the generated report in the default browser
  --help                              Show this help
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
