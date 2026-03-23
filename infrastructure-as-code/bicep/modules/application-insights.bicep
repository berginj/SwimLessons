/**
 * Application Insights Module
 */

@description('Application Insights name')
param appInsightsName string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Sampling percentage for cost optimization (1-100)')
@minValue(1)
@maxValue(100)
param samplingPercentage int = 20

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    Flow_Type: 'Bluefield'
    Request_Source: 'rest'
    RetentionInDays: 30  // Minimum retention (cost optimization)
    SamplingPercentage: samplingPercentage
    IngestionMode: 'ApplicationInsights'
  }
}

output instrumentationKey string = appInsights.properties.InstrumentationKey
output connectionString string = appInsights.properties.ConnectionString
output appInsightsId string = appInsights.id
