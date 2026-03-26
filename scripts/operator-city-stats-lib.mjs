import { spawnSync } from 'node:child_process';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_DAYS = 30;
export const DEFAULT_CITY_ID = 'nyc';
export const DEFAULT_FUNCTION_NAME = 'operator-city-stats';
export const ENVIRONMENT_DEFAULTS = {
  staging: {
    resourceGroup: 'swim-lessons-staging-rg',
  },
  production: {
    resourceGroup: 'swim-lessons-production-rg',
  },
};

export function parseIsoDate(value, flagName) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${flagName} must be a valid ISO timestamp`);
  }
  return parsed;
}

export function getEnvironmentDefault(environment) {
  const envConfig = ENVIRONMENT_DEFAULTS[environment];
  if (!envConfig) {
    throw new Error(
      `Unsupported environment "${environment}". Pass --resource-group and --function-app explicitly.`
    );
  }
  return envConfig;
}

export function resolveFunctionAppName(resourceGroup) {
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

export function resolveFunctionKey(resourceGroup, functionAppName, functionName) {
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

export function resolveOperatorContext({
  environment,
  resourceGroup,
  functionAppName,
  functionName,
}) {
  const resolvedResourceGroup =
    resourceGroup || getEnvironmentDefault(environment).resourceGroup;
  const resolvedFunctionAppName =
    functionAppName || resolveFunctionAppName(resolvedResourceGroup);
  const functionKey = resolveFunctionKey(
    resolvedResourceGroup,
    resolvedFunctionAppName,
    functionName
  );

  return {
    resourceGroup: resolvedResourceGroup,
    functionAppName: resolvedFunctionAppName,
    functionKey,
  };
}

export async function fetchCityStats({
  functionAppName,
  functionKey,
  cityId,
  startDate,
  endDate,
}) {
  const url = new URL(
    `https://${functionAppName}.azurewebsites.net/api/operator/cities/${encodeURIComponent(cityId)}/stats`
  );
  url.searchParams.set('startDate', startDate.toISOString());
  url.searchParams.set('endDate', endDate.toISOString());

  const response = await fetch(url, {
    headers: {
      'x-functions-key': functionKey,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `City stats request failed: ${response.status} ${response.statusText}\n${text}`
    );
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

export function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function formatNumber(value) {
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
    throw new Error(
      `Azure CLI command failed: az ${args.join(' ')}\n${(result.stderr || result.stdout || '').trim()}`
    );
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
