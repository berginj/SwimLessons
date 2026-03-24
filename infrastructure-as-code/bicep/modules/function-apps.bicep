/**
 * Azure Function Apps Module (Consumption Plan)
 */

@description('Function App name')
param functionAppName string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Cosmos DB connection string')
@secure()
param cosmosConnectionString string

@description('App Configuration endpoint')
param appConfigEndpoint string

@description('Key Vault name')
param keyVaultName string

@description('Cosmos DB database ID')
param cosmosDatabaseId string = 'swimlessons'

var managedAppSettings = {
  AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
  FUNCTIONS_EXTENSION_VERSION: '~4'
  FUNCTIONS_WORKER_RUNTIME: 'node'
  APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
  COSMOS_CONNECTION_STRING: cosmosConnectionString
  COSMOS_DATABASE_ID: cosmosDatabaseId
  APP_CONFIG_ENDPOINT: appConfigEndpoint
  KEY_VAULT_NAME: keyVaultName
  ENVIRONMENT: tags.environment
}

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

// Application Insights for monitoring
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${functionAppName}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    SamplingPercentage: 20  // Cost optimization
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
    }
  }
}

// Keep platform-managed deployment settings like WEBSITE_RUN_FROM_PACKAGE intact on infra redeploys.
resource functionAppSettings 'Microsoft.Web/sites/config@2023-01-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: union(
    list('${functionApp.id}/config/appsettings', '2023-01-01').properties,
    managedAppSettings
  )
}

output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output functionAppName string = functionApp.name
output functionAppResourceId string = functionApp.id
output principalId string = functionApp.identity.principalId
