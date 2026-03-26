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

@description('Optional external transit router GraphQL endpoint')
param transitRouterGraphqlUrl string = ''

@description('Transit router request timeout in milliseconds')
param transitRouterTimeoutMs int = 20000

// === Cosmos DB (Serverless Mode) ===
module cosmosDb 'modules/cosmos-db.bicep' = {
  name: '${deployment().name}-cosmosDb'
  params: {
    accountName: 'cosmos-swim-${resourceSuffix}'
    location: location
    tags: tags
    enableServerless: true
  }
}

// === Azure App Configuration (Free Tier) ===
module appConfiguration 'modules/app-configuration.bicep' = {
  name: '${deployment().name}-appConfig'
  params: {
    configStoreName: 'appconfig-swim-${resourceSuffix}'
    location: location
    tags: tags
    sku: 'free'
  }
}

// === Azure Key Vault (Standard Tier) ===
module keyVault 'modules/key-vault.bicep' = {
  name: '${deployment().name}-keyVault'
  params: {
    vaultName: 'kv-swim-${resourceSuffix}'
    location: location
    tags: tags
    sku: 'standard'
  }
}

// === Function Apps (Consumption Plan) ===
module functionApps 'modules/function-apps.bicep' = {
  name: '${deployment().name}-functionApps'
  params: {
    functionAppName: 'func-swim-${resourceSuffix}'
    location: location
    tags: tags
    cosmosAccountName: cosmosDb.outputs.accountName
    cosmosDatabaseId: 'swimlessons'
    appConfigEndpoint: appConfiguration.outputs.endpoint
    keyVaultName: keyVault.outputs.vaultName
    transitRouterGraphqlUrl: transitRouterGraphqlUrl
    transitRouterTimeoutMs: transitRouterTimeoutMs
  }
}

// === Application Insights (Basic Tier, 5GB free) ===
module appInsights 'modules/application-insights.bicep' = {
  name: '${deployment().name}-appInsights'
  params: {
    appInsightsName: 'appi-swim-${resourceSuffix}'
    location: location
    tags: tags
    samplingPercentage: 20  // Cost optimization: sample 20% of requests
  }
}

// === Azure Static Web App (Standard tier required for linked backend) ===
module staticWebApp 'modules/static-web-app.bicep' = {
  name: '${deployment().name}-staticWebApp'
  params: {
    staticWebAppName: 'swa-swim-${resourceSuffix}'
    location: location
    tags: tags
    sku: 'Standard'
  }
}

// === Outputs ===
output cosmosDbAccountName string = cosmosDb.outputs.accountName
output cosmosDbEndpoint string = cosmosDb.outputs.endpoint
output appConfigEndpoint string = appConfiguration.outputs.endpoint
output keyVaultName string = keyVault.outputs.vaultName
output functionAppName string = functionApps.outputs.functionAppName
output functionAppUrl string = functionApps.outputs.functionAppUrl
output appInsightsInstrumentationKey string = appInsights.outputs.instrumentationKey
output staticWebAppName string = staticWebApp.outputs.staticWebAppName
output staticWebAppUrl string = staticWebApp.outputs.url
output staticWebAppDefaultHostname string = staticWebApp.outputs.defaultHostname
