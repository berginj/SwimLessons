import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const errors = [];

const environments = [
  {
    name: 'staging',
    workflowPath: '.github/workflows/cd-staging.yml',
    resourceGroupLocation: 'eastus',
    parameterFilePath: 'infrastructure-as-code/bicep/parameters/staging.parameters.json',
    expectedDeploymentLocation: 'centralus',
  },
  {
    name: 'production',
    workflowPath: '.github/workflows/cd-production.yml',
    resourceGroupLocation: 'eastus',
    parameterFilePath: 'infrastructure-as-code/bicep/parameters/production.parameters.json',
    expectedDeploymentLocation: 'eastus',
  },
];

async function main() {
  await validateCiWorkflow();

  for (const env of environments) {
    await validateWorkflow(env);
    await validateParameterFile(env);
  }

  await validateStaticWebAppModule();
  await validateCosmosModule();
  await validateMainBicep();
  await validateDeployScript();

  if (errors.length > 0) {
    console.error('Deployment contract validation failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Deployment contract validation passed.');
}

async function validateCiWorkflow() {
  const workflow = await readRepoText('.github/workflows/ci-build.yml');

  assertContains(
    workflow,
    'uses: actions/checkout@v5',
    '.github/workflows/ci-build.yml must use actions/checkout@v5'
  );

  assertContains(
    workflow,
    'uses: actions/setup-node@v5',
    '.github/workflows/ci-build.yml must use actions/setup-node@v5'
  );

  assertContains(
    workflow,
    'uses: codecov/codecov-action@v5.5.3',
    '.github/workflows/ci-build.yml must use codecov/codecov-action@v5.5.3'
  );

  assertContains(
    workflow,
    'use_oidc: true',
    '.github/workflows/ci-build.yml must use OIDC for Codecov uploads'
  );

  assertContains(
    workflow,
    "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'",
    '.github/workflows/ci-build.yml must opt JavaScript actions into Node 24'
  );

  assertContains(
    workflow,
    "- name: Upload test coverage\n        uses: codecov/codecov-action@v5.5.3\n        if: always()\n        env:\n          FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'",
    '.github/workflows/ci-build.yml must force the Codecov step onto Node 24'
  );
}

async function validateWorkflow(env) {
  const workflow = await readRepoText(env.workflowPath);

  assertContains(
    workflow,
    'uses: actions/checkout@v5',
    `${env.workflowPath} must use actions/checkout@v5`
  );

  assertContains(
    workflow,
    'uses: actions/setup-node@v5',
    `${env.workflowPath} must use actions/setup-node@v5 where Node is configured`
  );

  assertContains(
    workflow,
    "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'",
    `${env.workflowPath} must opt JavaScript actions into Node 24`
  );

  assertContains(
    workflow,
    `RESOURCE_GROUP_LOCATION: ${env.resourceGroupLocation}`,
    `${env.workflowPath} must pin RESOURCE_GROUP_LOCATION to ${env.resourceGroupLocation}`
  );

  assertContains(
    workflow,
    `PARAMETERS_FILE: ${env.parameterFilePath}`,
    `${env.workflowPath} must pin PARAMETERS_FILE to ${env.parameterFilePath}`
  );

  assertDoesNotContain(
    workflow,
    '\n  LOCATION:',
    `${env.workflowPath} must not use a shared LOCATION env var for resource-group creation`
  );

  assertContains(
    workflow,
    '- name: Ensure Resource Group Exists',
    `${env.workflowPath} must explicitly ensure the resource group exists`
  );

  assertContains(
    workflow,
    '--parameters ${{ env.PARAMETERS_FILE }}',
    `${env.workflowPath} must deploy Bicep with PARAMETERS_FILE`
  );

  assertContains(
    workflow,
    '- name: Link Function App Backend',
    `${env.workflowPath} must link the SWA backend after infra deploy`
  );

  assertContains(
    workflow,
    'az staticwebapp backends link',
    `${env.workflowPath} must use az staticwebapp backends link`
  );

  assertContains(
    workflow,
    '- name: Normalize Function App Auth',
    `${env.workflowPath} must normalize authsettingsV2 after backend linking`
  );

  assertContains(
    workflow,
    'authsettingsV2',
    `${env.workflowPath} must update authsettingsV2`
  );

  if (env.name === 'staging') {
    assertContains(
      workflow,
      'cosmosDbAccountName',
      `${env.workflowPath} must capture cosmosDbAccountName from the Bicep deployment outputs`
    );

    assertContains(
      workflow,
      'Seed NYC Staging Data',
      `${env.workflowPath} must seed deterministic NYC staging data before smoke tests`
    );

    assertContains(
      workflow,
      'npm run seed:staging:nyc',
      `${env.workflowPath} must run npm run seed:staging:nyc`
    );

    assertContains(
      workflow,
      'npm run smoke:staging --',
      `${env.workflowPath} must run the staged end-to-end smoke script`
    );
  } else {
    assertContains(
      workflow,
      '/api/cities',
      `${env.workflowPath} must smoke test /api/cities`
    );
  }
}

async function validateParameterFile(env) {
  const parameterFile = await readRepoJson(env.parameterFilePath);
  const environmentValue = parameterFile?.parameters?.environment?.value;
  const locationValue = parameterFile?.parameters?.location?.value;

  if (environmentValue !== env.name) {
    errors.push(
      `${env.parameterFilePath} must set parameters.environment.value to "${env.name}", found "${environmentValue}"`
    );
  }

  if (locationValue !== env.expectedDeploymentLocation) {
    errors.push(
      `${env.parameterFilePath} must set parameters.location.value to "${env.expectedDeploymentLocation}", found "${locationValue}"`
    );
  }
}

async function validateStaticWebAppModule() {
  const moduleText = await readRepoText('infrastructure-as-code/bicep/modules/static-web-app.bicep');

  assertDoesNotContain(
    moduleText,
    'linkedBackends',
    'static-web-app.bicep must not manage linkedBackends directly'
  );

  assertDoesNotContain(
    moduleText,
    'functionsApiBackendResourceId',
    'static-web-app.bicep must not accept a backend resource ID parameter'
  );

  assertContains(
    moduleText,
    'output staticWebAppName string = staticWebApp.name',
    'static-web-app.bicep must output staticWebAppName for the workflow link step'
  );

  assertDoesNotContain(
    moduleText,
    'listSecrets(',
    'static-web-app.bicep must not emit deployment secrets via outputs'
  );
}

async function validateMainBicep() {
  const mainBicep = await readRepoText('infrastructure-as-code/bicep/main.bicep');

  assertContains(
    mainBicep,
    "output staticWebAppName string = staticWebApp.outputs.staticWebAppName",
    'main.bicep must output staticWebAppName for workflow backend linking'
  );

  assertContains(
    mainBicep,
    "output cosmosDbAccountName string = cosmosDb.outputs.accountName",
    'main.bicep must output cosmosDbAccountName for manual secret retrieval'
  );

  assertDoesNotContain(
    mainBicep,
    'cosmosDbConnectionString',
    'main.bicep must not emit Cosmos DB connection strings via outputs'
  );

  assertContains(
    mainBicep,
    "name: '${deployment().name}-cosmosDb'",
    'main.bicep must make nested Cosmos DB deployment names unique per top-level deployment'
  );

  assertContains(
    mainBicep,
    "name: '${deployment().name}-staticWebApp'",
    'main.bicep must make nested Static Web App deployment names unique per top-level deployment'
  );
}

async function validateCosmosModule() {
  const cosmosModule = await readRepoText('infrastructure-as-code/bicep/modules/cosmos-db.bicep');

  assertDoesNotContain(
    cosmosModule,
    'listConnectionStrings(',
    'cosmos-db.bicep must not emit connection strings via outputs'
  );

  assertContains(
    cosmosModule,
    'output accountName string = cosmosAccount.name',
    'cosmos-db.bicep must output accountName for manual secret retrieval'
  );
}

async function validateDeployScript() {
  const deployScript = await readRepoText('infrastructure-as-code/scripts/deploy.sh');

  assertContains(
    deployScript,
    'RESOURCE_GROUP_LOCATION=${3:-eastus}',
    'deploy.sh must keep resource-group location separate from workload location'
  );

  assertContains(
    deployScript,
    'PARAMETERS_FILE="${BICEP_ROOT}/parameters/${ENVIRONMENT}.parameters.json"',
    'deploy.sh must use an explicit parameter file path'
  );

  assertContains(
    deployScript,
    'Using existing resource group',
    'deploy.sh must reuse existing resource groups instead of recreating them in a new location'
  );

  assertContains(
    deployScript,
    'az staticwebapp backends link',
    'deploy.sh must link the Function App backend after the Bicep deployment'
  );

  assertContains(
    deployScript,
    'authsettingsV2',
    'deploy.sh must normalize authsettingsV2 after backend linking'
  );

  assertContains(
    deployScript,
    'Redeploy Function App code so WEBSITE_RUN_FROM_PACKAGE is refreshed',
    'deploy.sh must warn that infra-only deploy does not replace a full Functions package deploy'
  );
}

function assertContains(text, expected, message) {
  if (!text.includes(expected)) {
    errors.push(message);
  }
}

function assertDoesNotContain(text, expected, message) {
  if (text.includes(expected)) {
    errors.push(message);
  }
}

async function readRepoText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function readRepoJson(relativePath) {
  return JSON.parse(await readRepoText(relativePath));
}

await main();
