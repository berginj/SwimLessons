/**
 * Cosmos DB Module (Serverless Mode for Cost Optimization)
 */

@description('Cosmos DB account name')
param accountName string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Enable serverless mode (pay-per-request, no minimum RU/s)')
param enableServerless bool = true

@description('Telemetry event retention in days')
@minValue(1)
param eventRetentionDays int = 90

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: accountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'  // Balance between consistency and cost
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: enableServerless ? [
      {
        name: 'EnableServerless'
      }
    ] : []
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = {
  parent: cosmosAccount
  name: 'swimlessons'
  properties: {
    resource: {
      id: 'swimlessons'
    }
  }
}

// Container: tenants (City configurations)
resource tenantsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'tenants'
  properties: {
    resource: {
      id: 'tenants'
      partitionKey: {
        paths: ['/id']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          { path: '/*' }
        ]
      }
    }
  }
}

// Container: sessions (Provider, Location, Program, Session documents)
resource sessionsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'sessions'
  properties: {
    resource: {
      id: 'sessions'
      partitionKey: {
        paths: ['/cityId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          { path: '/*' }
        ]
        excludedPaths: [
          { path: '/"_etag"/?' }
        ]
      }
    }
  }
}

// Container: events (Telemetry with TTL)
resource eventsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'events'
  properties: {
    resource: {
      id: 'events'
      partitionKey: {
        paths: ['/cityId']
        kind: 'Hash'
      }
      defaultTtl: eventRetentionDays * 24 * 60 * 60
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          { path: '/cityId/?' }
          { path: '/type/?' }
          { path: '/eventName/?' }
          { path: '/timestamp/?' }
          { path: '/sessionId/?' }
          { path: '/userId/?' }
        ]
        excludedPaths: [
          { path: '/*' }
          { path: '/"_etag"/?' }
        ]
      }
    }
  }
}

output endpoint string = cosmosAccount.properties.documentEndpoint
output accountName string = cosmosAccount.name
