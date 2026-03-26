import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const resourceGroup = process.env.AZURE_RESOURCE_GROUP || 'swim-lessons-staging-rg';
const location = process.env.AZURE_LOCATION || 'centralus';
const storageAccount = process.env.TRANSIT_ROUTER_STORAGE_ACCOUNT || 'stfuncswimstg01c';
const fileShare = process.env.TRANSIT_ROUTER_FILE_SHARE || 'otpdata';
const functionAppName = process.env.FUNCTION_APP_NAME || 'func-swim-stg01c';
const builderContainerName = process.env.TRANSIT_ROUTER_BUILDER_NAME || 'cg-otp-build-stg01c';
const serviceContainerName = process.env.TRANSIT_ROUTER_CONTAINER_NAME || 'cg-otp-stg01c';
const registryName = process.env.TRANSIT_ROUTER_REGISTRY || 'acrswimstg01cotp';
const upstreamOtpImage = process.env.TRANSIT_ROUTER_UPSTREAM_IMAGE || 'docker.io/opentripplanner/opentripplanner:latest';
const importedOtpImage = process.env.TRANSIT_ROUTER_IMPORTED_IMAGE || 'opentripplanner:latest';
const gtfsUrl = process.env.TRANSIT_GTFS_URL || 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip';
const osmUrl =
  process.env.TRANSIT_OSM_URL || 'https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf';
const builderCpu = process.env.TRANSIT_ROUTER_BUILDER_CPU || '4';
const builderMemory = process.env.TRANSIT_ROUTER_BUILDER_MEMORY_GB || '14';
const serviceCpu = process.env.TRANSIT_ROUTER_SERVICE_CPU || '2';
const serviceMemory = process.env.TRANSIT_ROUTER_SERVICE_MEMORY_GB || '8';
const javaBuildOptions = process.env.TRANSIT_ROUTER_JAVA_BUILD_OPTIONS || '-Xmx12g';
const javaServeOptions = process.env.TRANSIT_ROUTER_JAVA_SERVE_OPTIONS || '-Xmx6g';
const forceRebuild = process.env.TRANSIT_ROUTER_FORCE_REBUILD === '1';
const tmpDir = path.join(os.tmpdir(), 'swim-lessons-otp');

const otpConfigContent = JSON.stringify(
  {
    otpFeatures: {
      ActuatorAPI: true,
    },
  },
  null,
  2
);

function log(message) {
  console.log(`[transit-router] ${message}`);
}

function run(command, args, options = {}) {
  const spawnOptions = {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.captureOutput ? 'pipe' : 'inherit',
    env: options.env || process.env,
  };

  const result =
    process.platform === 'win32'
      ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command, ...args], spawnOptions)
      : spawnSync(command, args, spawnOptions);

  if (result.status !== 0) {
    const detail =
      options.captureOutput && (result.stderr || result.stdout)
        ? `\n${result.stderr || result.stdout}`
        : '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}${detail}`);
  }

  return options.captureOutput ? result.stdout.trim() : '';
}

function runMaybe(command, args, options = {}) {
  try {
    return run(command, args, options);
  } catch {
    return options.captureOutput ? '' : undefined;
  }
}

async function downloadFile(url, destinationPath) {
  if (existsSync(destinationPath)) {
    log(`Using cached download ${path.basename(destinationPath)}`);
    return;
  }

  log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await pipeline(response.body, createWriteStream(destinationPath));
}

function getSubscriptionId() {
  return run('az', ['account', 'show', '--query', 'id', '--output', 'tsv'], {
    captureOutput: true,
  });
}

function ensureResourceProviderRegistered(namespace) {
  const state = run(
    'az',
    ['provider', 'show', '--namespace', namespace, '--query', 'registrationState', '--output', 'tsv'],
    { captureOutput: true }
  );

  if (state === 'Registered') {
    return;
  }

  log(`Registering Azure resource provider ${namespace}`);
  run('az', ['provider', 'register', '--namespace', namespace, '--wait']);
}

function ensureContainerRegistry() {
  const existing = runMaybe(
    'az',
    ['acr', 'show', '--resource-group', resourceGroup, '--name', registryName, '--query', 'name', '--output', 'tsv'],
    { captureOutput: true }
  );

  if (existing) {
    return;
  }

  log(`Creating Azure Container Registry ${registryName}`);
  run('az', [
    'acr',
    'create',
    '--resource-group',
    resourceGroup,
    '--name',
    registryName,
    '--sku',
    'Basic',
    '--location',
    location,
    '--admin-enabled',
    'true',
  ]);
}

function getRegistryLoginServer() {
  return run('az', ['acr', 'show', '--name', registryName, '--query', 'loginServer', '--output', 'tsv'], {
    captureOutput: true,
  });
}

function importOtpImage() {
  const tags = runMaybe(
    'az',
    ['acr', 'repository', 'show-tags', '--name', registryName, '--repository', 'opentripplanner', '--output', 'tsv'],
    { captureOutput: true }
  );

  if (tags.split(/\r?\n/u).includes('latest')) {
    log(`Using cached OTP image in ${registryName}`);
    return;
  }

  log(`Importing ${upstreamOtpImage} into ${registryName}`);
  run('az', [
    'acr',
    'import',
    '--name',
    registryName,
    '--source',
    upstreamOtpImage,
    '--image',
    importedOtpImage,
    '--force',
  ]);
}

function getRegistryCredentials() {
  const username = run(
    'az',
    ['acr', 'credential', 'show', '--name', registryName, '--query', 'username', '--output', 'tsv'],
    { captureOutput: true }
  );
  const password = run(
    'az',
    [
      'acr',
      'credential',
      'show',
      '--name',
      registryName,
      '--query',
      'passwords[0].value',
      '--output',
      'tsv',
    ],
    { captureOutput: true }
  );

  return { username, password };
}

function getStorageAccountKey() {
  return run(
    'az',
    [
      'storage',
      'account',
      'keys',
      'list',
      '--resource-group',
      resourceGroup,
      '--account-name',
      storageAccount,
      '--query',
      '[0].value',
      '--output',
      'tsv',
    ],
    { captureOutput: true }
  );
}

function ensureFileShare(accountKey) {
  run('az', [
    'storage',
    'share-rm',
    'create',
    '--resource-group',
    resourceGroup,
    '--storage-account',
    storageAccount,
    '--name',
    fileShare,
    '--quota',
    '50',
  ]);
}

function uploadFile(localPath, remoteName, accountKey) {
  log(`Uploading ${remoteName} to Azure Files share ${fileShare}`);
  run('az', [
    'storage',
    'file',
    'upload',
    '--account-name',
    storageAccount,
    '--account-key',
    accountKey,
    '--share-name',
    fileShare,
    '--source',
    localPath,
    '--path',
    remoteName,
  ]);
}

function fileExists(remoteName, accountKey) {
  const exists = run(
    'az',
    [
      'storage',
      'file',
      'exists',
      '--account-name',
      storageAccount,
      '--account-key',
      accountKey,
      '--share-name',
      fileShare,
      '--path',
      remoteName,
      '--query',
      'exists',
      '--output',
      'tsv',
    ],
    { captureOutput: true }
  );

  return exists.trim() === 'true';
}

function deleteContainerGroupIfExists(name) {
  const current = runMaybe(
    'az',
    ['container', 'show', '--resource-group', resourceGroup, '--name', name, '--query', 'name', '--output', 'tsv'],
    { captureOutput: true }
  );

  if (!current) {
    return;
  }

  log(`Deleting existing container group ${name}`);
  run('az', ['container', 'delete', '--resource-group', resourceGroup, '--name', name, '--yes']);
  waitForContainerDeletion(name);
}

function waitForContainerDeletion(name) {
  const timeoutAt = Date.now() + 5 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    const exists = runMaybe(
      'az',
      ['container', 'show', '--resource-group', resourceGroup, '--name', name, '--query', 'name', '--output', 'tsv'],
      { captureOutput: true }
    );

    if (!exists) {
      return;
    }

    sleep(5000);
  }

  throw new Error(`Timed out waiting for container group ${name} to delete`);
}

function waitForContainerCompletion(name) {
  const timeoutAt = Date.now() + 45 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    const state = run(
      'az',
      [
        'container',
        'show',
        '--resource-group',
        resourceGroup,
        '--name',
        name,
        '--query',
        'instanceView.state',
        '--output',
        'tsv',
      ],
      { captureOutput: true }
    );

    if (state === 'Succeeded') {
      return;
    }

    if (state === 'Failed') {
      const logs = run(
        'az',
        ['container', 'logs', '--resource-group', resourceGroup, '--name', name],
        { captureOutput: true }
      );
      throw new Error(`Container group ${name} failed.\n${logs}`);
    }

    log(`Waiting for ${name} to complete. Current state: ${state || 'unknown'}`);
    sleep(15000);
  }

  throw new Error(`Timed out waiting for container group ${name} to finish graph build`);
}

function waitForRouterHealth(routerBaseUrl) {
  const timeoutAt = Date.now() + 15 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    try {
      const response = run(
        'curl',
        ['--fail', '--silent', '--show-error', `${routerBaseUrl}/otp/actuators/health`],
        { captureOutput: true }
      );

      if (response.includes('UP')) {
        return;
      }
    } catch {}

    log(`Waiting for router health at ${routerBaseUrl}/otp/actuators/health`);
    sleep(10000);
  }

  throw new Error('Timed out waiting for the transit router to become healthy');
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function buildDnsLabel(subscriptionId) {
  const suffix = subscriptionId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase();
  return `swim-otp-stg01c-${suffix}`;
}

function createBuilderContainer(accountKey, imageName, registryCredentials, registryLoginServer) {
  log(`Creating graph builder container group ${builderContainerName}`);
  run('az', [
    'container',
    'create',
    '--resource-group',
    resourceGroup,
    '--name',
    builderContainerName,
    '--image',
    imageName,
    '--location',
    location,
    '--os-type',
    'Linux',
    '--restart-policy',
    'Never',
    '--cpu',
    builderCpu,
    '--memory',
    builderMemory,
    '--environment-variables',
    `JAVA_TOOL_OPTIONS=${javaBuildOptions}`,
    '--registry-login-server',
    registryLoginServer,
    '--registry-username',
    registryCredentials.username,
    '--registry-password',
    registryCredentials.password,
    '--azure-file-volume-account-name',
    storageAccount,
    '--azure-file-volume-account-key',
    accountKey,
    '--azure-file-volume-share-name',
    fileShare,
    '--azure-file-volume-mount-path',
    '/var/opentripplanner',
    '--command-line',
    '/docker-entrypoint.sh --build --save',
  ]);
}

function createServiceContainer(accountKey, dnsLabel, imageName, registryCredentials, registryLoginServer) {
  log(`Creating router service container group ${serviceContainerName}`);
  run('az', [
    'container',
    'create',
    '--resource-group',
    resourceGroup,
    '--name',
    serviceContainerName,
    '--image',
    imageName,
    '--location',
    location,
    '--os-type',
    'Linux',
    '--restart-policy',
    'Always',
    '--cpu',
    serviceCpu,
    '--memory',
    serviceMemory,
    '--ip-address',
    'Public',
    '--dns-name-label',
    dnsLabel,
    '--ports',
    '8080',
    '--environment-variables',
    `JAVA_TOOL_OPTIONS=${javaServeOptions}`,
    '--registry-login-server',
    registryLoginServer,
    '--registry-username',
    registryCredentials.username,
    '--registry-password',
    registryCredentials.password,
    '--azure-file-volume-account-name',
    storageAccount,
    '--azure-file-volume-account-key',
    accountKey,
    '--azure-file-volume-share-name',
    fileShare,
    '--azure-file-volume-mount-path',
    '/var/opentripplanner',
    '--command-line',
    '/docker-entrypoint.sh --load --serve',
  ]);
}

function getRouterBaseUrl() {
  const fqdn = run(
    'az',
    [
      'container',
      'show',
      '--resource-group',
      resourceGroup,
      '--name',
      serviceContainerName,
      '--query',
      'ipAddress.fqdn',
      '--output',
      'tsv',
    ],
    { captureOutput: true }
  );

  if (!fqdn) {
    throw new Error('Router container group did not return a public FQDN');
  }

  return `http://${fqdn}:8080`;
}

function setFunctionAppTransitRouter(routerGraphqlUrl) {
  log(`Setting TRANSIT_ROUTER_GRAPHQL_URL on ${functionAppName}`);
  run('az', [
    'functionapp',
    'config',
    'appsettings',
    'set',
    '--resource-group',
    resourceGroup,
    '--name',
    functionAppName,
    '--settings',
    `TRANSIT_ROUTER_GRAPHQL_URL=${routerGraphqlUrl}`,
    'TRANSIT_ROUTER_TIMEOUT_MS=20000',
  ]);
}

async function main() {
  await mkdir(tmpDir, { recursive: true });
  const subscriptionId = getSubscriptionId();
  const accountKey = getStorageAccountKey();
  const dnsLabel = process.env.TRANSIT_ROUTER_DNS_LABEL || buildDnsLabel(subscriptionId);
  const osmPath = path.join(tmpDir, 'nyc.osm.pbf');
  const gtfsPath = path.join(tmpDir, 'nyc-subway-gtfs.zip');
  const otpConfigPath = path.join(tmpDir, 'otp-config.json');

  log(`Resource group: ${resourceGroup}`);
  log(`Location: ${location}`);
  log(`Storage account: ${storageAccount}`);
  log(`File share: ${fileShare}`);
  log(`Router DNS label: ${dnsLabel}`);

  ensureResourceProviderRegistered('Microsoft.ContainerInstance');
  ensureResourceProviderRegistered('Microsoft.ContainerRegistry');
  ensureContainerRegistry();
  importOtpImage();
  const registryLoginServer = getRegistryLoginServer();
  const registryCredentials = getRegistryCredentials();
  const otpImage = `${registryLoginServer}/${importedOtpImage}`;
  ensureFileShare(accountKey);

  await downloadFile(osmUrl, osmPath);
  await downloadFile(gtfsUrl, gtfsPath);
  await writeFile(otpConfigPath, otpConfigContent, 'utf8');

  uploadFile(osmPath, 'nyc.osm.pbf', accountKey);
  uploadFile(gtfsPath, 'nyc-subway-gtfs.zip', accountKey);
  uploadFile(otpConfigPath, 'otp-config.json', accountKey);

  if (forceRebuild || !fileExists('graph.obj', accountKey)) {
    deleteContainerGroupIfExists(builderContainerName);
    createBuilderContainer(accountKey, otpImage, registryCredentials, registryLoginServer);
    waitForContainerCompletion(builderContainerName);
    log('Graph build completed successfully');
  } else {
    log('Existing graph.obj found in Azure Files share; skipping rebuild');
  }

  deleteContainerGroupIfExists(serviceContainerName);
  createServiceContainer(accountKey, dnsLabel, otpImage, registryCredentials, registryLoginServer);

  const routerBaseUrl = getRouterBaseUrl();
  waitForRouterHealth(routerBaseUrl);

  const routerGraphqlUrl = `${routerBaseUrl}/otp/gtfs/v1`;
  setFunctionAppTransitRouter(routerGraphqlUrl);

  log(`Transit router deployed successfully: ${routerGraphqlUrl}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
