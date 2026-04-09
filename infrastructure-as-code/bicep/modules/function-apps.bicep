/**
 * Azure Function Apps Module (Consumption Plan)
 */

@description('Function App name')
@minLength(1)
param functionAppName string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Cosmos DB account name')
param cosmosAccountName string

@description('App Configuration endpoint')
param appConfigEndpoint string = ''

@description('Key Vault name')
param keyVaultName string = ''

@description('Application Insights connection string')
param applicationInsightsConnectionString string = ''

@description('Cosmos DB database ID')
param cosmosDatabaseId string = 'swimlessons'

@description('Optional external transit router GraphQL endpoint')
param transitRouterGraphqlUrl string = ''

@description('Transit router request timeout in milliseconds')
param transitRouterTimeoutMs int = 20000

// Storage account for Function App (required)
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'st${replace(functionAppName, '-', '')}' // Remove hyphens, max 24 chars
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'  // Cheapest option
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// App Service Plan (Consumption/Serverless)
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: 'plan-${functionAppName}'
  location: location
  tags: tags
  sku: {
    name: 'Y1'  // Consumption plan (pay-per-execution)
    tier: 'Dynamic'
  }
  properties: {
    reserved: true  // Linux
  }
}

// Function App
resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22'
      appSettings: concat([
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'COSMOS_CONNECTION_STRING'
          value: listConnectionStrings(resourceId('Microsoft.DocumentDB/databaseAccounts', cosmosAccountName), '2023-04-15').connectionStrings[0].connectionString
        }
        {
          name: 'COSMOS_DATABASE_ID'
          value: cosmosDatabaseId
        }
        {
          name: 'ENVIRONMENT'
          value: tags.environment
        }
        {
          name: 'TRANSIT_ROUTER_GRAPHQL_URL'
          value: transitRouterGraphqlUrl
        }
        {
          name: 'TRANSIT_ROUTER_TIMEOUT_MS'
          value: string(transitRouterTimeoutMs)
        }
      ], empty(applicationInsightsConnectionString) ? [] : [
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: applicationInsightsConnectionString
        }
      ], empty(appConfigEndpoint) ? [] : [
        {
          name: 'APP_CONFIG_ENDPOINT'
          value: appConfigEndpoint
        }
      ], empty(keyVaultName) ? [] : [
        {
          name: 'KEY_VAULT_NAME'
          value: keyVaultName
        }
      ])
    }
  }
}

output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output functionAppName string = functionApp.name
output functionAppResourceId string = functionApp.id
output principalId string = functionApp.identity.principalId
