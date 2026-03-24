/**
 * Main Bicep Orchestration
 *
 * Deploys all Azure resources for the Swim Lessons platform
 * Target: Budget <$200/month with aggressive cost optimization
 */

@description('Environment name (dev, staging, production)')
param environment string = 'dev'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param resourceSuffix string = substring(uniqueString(resourceGroup().id), 0, 6)

@description('Tags to apply to all resources')
param tags object = {
  environment: environment
  project: 'swim-lessons'
  managedBy: 'bicep'
}

// === Cosmos DB (Serverless Mode) ===
module cosmosDb 'modules/cosmos-db.bicep' = {
  name: 'cosmosDb-deployment'
  params: {
    accountName: 'cosmos-swim-${resourceSuffix}'
    location: location
    tags: tags
    enableServerless: true
  }
}

// === Azure App Configuration (Free Tier) ===
module appConfiguration 'modules/app-configuration.bicep' = {
  name: 'appConfig-deployment'
  params: {
    configStoreName: 'appconfig-swim-${resourceSuffix}'
    location: location
    tags: tags
    sku: 'free'
  }
}

// === Azure Key Vault (Standard Tier) ===
module keyVault 'modules/key-vault.bicep' = {
  name: 'keyVault-deployment'
  params: {
    vaultName: 'kv-swim-${resourceSuffix}'
    location: location
    tags: tags
    sku: 'standard'
  }
}

// === Function Apps (Consumption Plan) ===
module functionApps 'modules/function-apps.bicep' = {
  name: 'functionApps-deployment'
  params: {
    functionAppName: 'func-swim-${resourceSuffix}'
    location: location
    tags: tags
    cosmosConnectionString: cosmosDb.outputs.connectionString
    appConfigEndpoint: appConfiguration.outputs.endpoint
    keyVaultName: keyVault.outputs.vaultName
  }
}

// === Application Insights (Basic Tier, 5GB free) ===
module appInsights 'modules/application-insights.bicep' = {
  name: 'appInsights-deployment'
  params: {
    appInsightsName: 'appi-swim-${resourceSuffix}'
    location: location
    tags: tags
    samplingPercentage: 20  // Cost optimization: sample 20% of requests
  }
}

// === Azure Static Web App (Free Tier) ===
module staticWebApp 'modules/static-web-app.bicep' = {
  name: 'staticWebApp-deployment'
  params: {
    staticWebAppName: 'swa-swim-${resourceSuffix}'
    location: location
    tags: tags
    sku: 'Free'
    functionsApiBackend: functionApps.outputs.functionAppUrl
  }
}

// === Outputs ===
output cosmosDbEndpoint string = cosmosDb.outputs.endpoint
output cosmosDbConnectionString string = cosmosDb.outputs.connectionString
output appConfigEndpoint string = appConfiguration.outputs.endpoint
output keyVaultName string = keyVault.outputs.vaultName
output functionAppUrl string = functionApps.outputs.functionAppUrl
output appInsightsInstrumentationKey string = appInsights.outputs.instrumentationKey
output staticWebAppUrl string = staticWebApp.outputs.url
output staticWebAppDefaultHostname string = staticWebApp.outputs.defaultHostname
