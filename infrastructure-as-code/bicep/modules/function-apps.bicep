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
      linuxFxVersion: 'NODE|18'
      appSettings: [
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
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'COSMOS_CONNECTION_STRING'
          value: cosmosConnectionString
        }
        {
          name: 'APP_CONFIG_ENDPOINT'
          value: appConfigEndpoint
        }
        {
          name: 'KEY_VAULT_NAME'
          value: keyVaultName
        }
        {
          name: 'ENVIRONMENT'
          value: tags.environment
        }
      ]
    }
  }
}

output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output functionAppName string = functionApp.name
output principalId string = functionApp.identity.principalId
