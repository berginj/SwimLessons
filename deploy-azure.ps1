# Azure Deployment Script (PowerShell)
# Usage: .\deploy-azure.ps1 -Environment dev -Location eastus

param(
    [string]$Environment = "dev",
    [string]$ResourceGroup = "swim-lessons-$Environment-rg",
    [string]$Location = "eastus"
)

Write-Host "🚀 Swim Lessons Platform - Azure Deployment" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Environment: $Environment"
Write-Host "  Resource Group: $ResourceGroup"
Write-Host "  Location: $Location"
Write-Host ""

# Check if Azure CLI is installed
try {
    az version | Out-Null
    Write-Host "✓ Azure CLI installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Azure CLI is not installed" -ForegroundColor Red
    Write-Host "   Install from: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Yellow
    exit 1
}

# Check if logged in
try {
    az account show | Out-Null
    Write-Host "✓ Logged into Azure" -ForegroundColor Green
} catch {
    Write-Host "🔐 Not logged into Azure. Running 'az login'..." -ForegroundColor Yellow
    az login
}

# Display current subscription
$Subscription = az account show --query name -o tsv
Write-Host "✓ Using subscription: $Subscription" -ForegroundColor Green
Write-Host ""

$Continue = Read-Host "Continue with deployment? (y/n)"
if ($Continue -ne "y" -and $Continue -ne "Y") {
    Write-Host "Deployment cancelled" -ForegroundColor Yellow
    exit 0
}

# Create resource group
Write-Host ""
Write-Host "📦 Creating resource group..." -ForegroundColor Cyan
az group create `
    --name $ResourceGroup `
    --location $Location `
    --tags environment=$Environment project=swim-lessons `
    --output none

Write-Host "✓ Resource group created: $ResourceGroup" -ForegroundColor Green

# Deploy Bicep template
Write-Host ""
Write-Host "🔧 Deploying infrastructure (this takes 5-10 minutes)..." -ForegroundColor Cyan
$DeploymentName = "swim-lessons-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

az deployment group create `
    --name $DeploymentName `
    --resource-group $ResourceGroup `
    --template-file infrastructure-as-code/bicep/main.bicep `
    --parameters "infrastructure-as-code/bicep/parameters/$Environment.parameters.json" `
    --output table

Write-Host "✓ Deployment complete!" -ForegroundColor Green
Write-Host ""

# Get outputs
Write-Host "📊 Deployment Outputs:" -ForegroundColor Cyan
Write-Host ""

$CosmosAccountName = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroup `
    --query properties.outputs.cosmosDbAccountName.value `
    --output tsv

$CosmosConnectionString = az cosmosdb keys list `
    --name $CosmosAccountName `
    --resource-group $ResourceGroup `
    --type connection-strings `
    --query "connectionStrings[0].connectionString" `
    --output tsv

$AppConfigEndpoint = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroup `
    --query properties.outputs.appConfigEndpoint.value `
    --output tsv

$KeyVaultName = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroup `
    --query properties.outputs.keyVaultName.value `
    --output tsv

$FunctionAppUrl = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroup `
    --query properties.outputs.functionAppUrl.value `
    --output tsv

$StaticWebAppUrl = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroup `
    --query properties.outputs.staticWebAppUrl.value `
    --output tsv

$AppInsightsKey = az deployment group show `
    --name $DeploymentName `
    --resource-group $ResourceGroup `
    --query properties.outputs.appInsightsInstrumentationKey.value `
    --output tsv

Write-Host "App Config Endpoint: $AppConfigEndpoint"
Write-Host "Key Vault Name: $KeyVaultName"
Write-Host "Function App URL: $FunctionAppUrl"
Write-Host "Static Web App URL: $StaticWebAppUrl"
Write-Host ""

# Create .env file
Write-Host "💾 Creating .env file..." -ForegroundColor Cyan
$EnvContent = @"
# Environment
ENVIRONMENT=$Environment

# Cosmos DB
COSMOS_CONNECTION_STRING=$CosmosConnectionString

# Azure App Configuration
APP_CONFIG_ENDPOINT=$AppConfigEndpoint

# Key Vault
KEY_VAULT_NAME=$KeyVaultName

# Application Insights
APPLICATIONINSIGHTS_CONNECTION_STRING=$AppInsightsKey

# Deployment Info
RESOURCE_GROUP=$ResourceGroup
LOCATION=$Location
FUNCTION_APP_URL=$FunctionAppUrl
STATIC_WEB_APP_URL=$StaticWebAppUrl
"@

$EnvContent | Out-File -FilePath ".env" -Encoding utf8
Write-Host "✓ .env file created" -ForegroundColor Green
Write-Host ""

# List all resources
Write-Host "📋 Deployed Resources:" -ForegroundColor Cyan
az resource list --resource-group $ResourceGroup --output table

Write-Host ""
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Review .env file for connection strings"
Write-Host "     Connection strings are fetched directly from Azure, not from Bicep outputs"
Write-Host "  2. Run 'npm run build' to compile TypeScript"
Write-Host "  3. Deploy Function App code: npm run deploy:functions"
Write-Host "  4. Deploy Static Web App: npm run deploy:web"
Write-Host ""
Write-Host "Total estimated cost: `$15-50/month" -ForegroundColor Yellow
Write-Host "Monitor costs: https://portal.azure.com/#view/Microsoft_Azure_CostManagement"
