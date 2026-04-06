/**
 * Azure Key Vault Module (Standard Tier)
 */

@description('Key Vault name')
param vaultName string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('SKU (standard or premium)')
@allowed(['standard', 'premium'])
param sku string = 'standard'

@description('Tenant ID for access policies')
param tenantId string = subscription().tenantId

resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: vaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: sku
    }
    tenantId: tenantId
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForTemplateDeployment: true
    enabledForDiskEncryption: false
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
    }
  }
}

output vaultName string = keyVault.name
output vaultUri string = keyVault.properties.vaultUri
