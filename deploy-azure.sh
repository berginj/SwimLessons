#!/bin/bash
set -e

echo "🚀 Swim Lessons Platform - Azure Deployment"
echo "==========================================="
echo ""

# Variables
ENVIRONMENT="${1:-dev}"
RESOURCE_GROUP="${2:-swim-lessons-${ENVIRONMENT}-rg}"
LOCATION="${3:-eastus}"

echo "Configuration:"
echo "  Environment: $ENVIRONMENT"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Location: $LOCATION"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed"
    echo "   Install from: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

echo "✓ Azure CLI installed"

# Check if logged in
if ! az account show &> /dev/null; then
    echo "🔐 Not logged into Azure. Running 'az login'..."
    az login
fi

echo "✓ Logged into Azure"

# Display current subscription
SUBSCRIPTION=$(az account show --query name -o tsv)
echo "✓ Using subscription: $SUBSCRIPTION"
echo ""

read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

# Create resource group
echo ""
echo "📦 Creating resource group..."
az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --tags environment="$ENVIRONMENT" project="swim-lessons" \
    --output none

echo "✓ Resource group created: $RESOURCE_GROUP"

# Deploy Bicep template
echo ""
echo "🔧 Deploying infrastructure (this takes 5-10 minutes)..."
DEPLOYMENT_NAME="swim-lessons-$(date +%Y%m%d-%H%M%S)"

az deployment group create \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --template-file infrastructure-as-code/bicep/main.bicep \
    --parameters "infrastructure-as-code/bicep/parameters/${ENVIRONMENT}.parameters.json" \
    --output table

echo "✓ Deployment complete!"
echo ""

# Get outputs
echo "📊 Deployment Outputs:"
echo ""

COSMOS_ACCOUNT_NAME=$(az deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.outputs.cosmosDbAccountName.value \
    --output tsv)

COSMOS_CONNECTION_STRING=$(az cosmosdb keys list \
    --name "$COSMOS_ACCOUNT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --type connection-strings \
    --query "connectionStrings[0].connectionString" \
    --output tsv)

APP_CONFIG_ENDPOINT=$(az deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.outputs.appConfigEndpoint.value \
    --output tsv)

KEY_VAULT_NAME=$(az deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.outputs.keyVaultName.value \
    --output tsv)

FUNCTION_APP_URL=$(az deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.outputs.functionAppUrl.value \
    --output tsv)

STATIC_WEB_APP_URL=$(az deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.outputs.staticWebAppUrl.value \
    --output tsv)

APP_INSIGHTS_KEY=$(az deployment group show \
    --name "$DEPLOYMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.outputs.appInsightsInstrumentationKey.value \
    --output tsv)

echo "App Config Endpoint: $APP_CONFIG_ENDPOINT"
echo "Key Vault Name: $KEY_VAULT_NAME"
echo "Function App URL: $FUNCTION_APP_URL"
echo "Static Web App URL: $STATIC_WEB_APP_URL"
echo ""

# Create .env file
echo "💾 Creating .env file..."
cat > .env <<EOL
# Environment
ENVIRONMENT=$ENVIRONMENT

# Cosmos DB
COSMOS_CONNECTION_STRING=$COSMOS_CONNECTION_STRING

# Azure App Configuration
APP_CONFIG_ENDPOINT=$APP_CONFIG_ENDPOINT

# Key Vault
KEY_VAULT_NAME=$KEY_VAULT_NAME

# Application Insights
APPLICATIONINSIGHTS_CONNECTION_STRING=$APP_INSIGHTS_KEY

# Deployment Info
RESOURCE_GROUP=$RESOURCE_GROUP
LOCATION=$LOCATION
FUNCTION_APP_URL=$FUNCTION_APP_URL
STATIC_WEB_APP_URL=$STATIC_WEB_APP_URL
EOL

echo "✓ .env file created"
echo ""

# List all resources
echo "📋 Deployed Resources:"
az resource list \
    --resource-group "$RESOURCE_GROUP" \
    --output table

echo ""
echo "🎉 Deployment Complete!"
echo ""
echo "Next steps:"
echo "  1. Review .env file for connection strings"
echo "     Connection strings are fetched directly from Azure, not from Bicep outputs"
echo "  2. Run 'npm run build' to compile TypeScript"
echo "  3. Deploy Function App code: npm run deploy:functions"
echo "  4. Deploy Static Web App: npm run deploy:web"
echo ""
echo "Total estimated cost: \$15-50/month"
echo "Monitor costs: https://portal.azure.com/#view/Microsoft_Azure_CostManagement"
