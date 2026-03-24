/**
 * Azure Static Web App Module (Free Tier)
 */

@description('Static Web App name')
param staticWebAppName string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('SKU (Free or Standard)')
@allowed(['Free', 'Standard'])
param sku string = 'Free'

@description('Backend Function App resource ID (for linked API routing)')
param functionsApiBackendResourceId string = ''

resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: location
  tags: tags
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    buildProperties: {
      appLocation: 'src/web'
      apiLocation: ''
      outputLocation: ''
    }
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    provider: 'GitHub'
    enterpriseGradeCdnStatus: 'Disabled'
  }
}

resource linkedBackend 'Microsoft.Web/staticSites/linkedBackends@2023-01-01' = if (!empty(functionsApiBackendResourceId)) {
  parent: staticWebApp
  name: 'functions'
  properties: {
    backendResourceId: functionsApiBackendResourceId
    region: location
  }
}

output url string = 'https://${staticWebApp.properties.defaultHostname}'
output defaultHostname string = staticWebApp.properties.defaultHostname
output staticWebAppId string = staticWebApp.id
output deploymentToken string = staticWebApp.listSecrets().properties.apiKey
