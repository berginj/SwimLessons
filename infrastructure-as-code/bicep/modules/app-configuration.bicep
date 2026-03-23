/**
 * Azure App Configuration Module (Free Tier)
 */

@description('App Configuration store name')
param configStoreName string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('SKU (free or standard)')
@allowed(['free', 'standard'])
param sku string = 'free'

resource appConfigStore 'Microsoft.AppConfiguration/configurationStores@2023-03-01' = {
  name: configStoreName
  location: location
  tags: tags
  sku: {
    name: sku
  }
  properties: {
    enablePurgeProtection: false
    publicNetworkAccess: 'Enabled'
  }
}

output endpoint string = appConfigStore.properties.endpoint
output name string = appConfigStore.name
