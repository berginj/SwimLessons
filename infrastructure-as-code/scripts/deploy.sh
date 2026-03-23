#!/bin/bash
set -e

# Deploy Azure Infrastructure with Bicep
# Usage: ./deploy.sh <environment> [resourceGroupName]
# Example: ./deploy.sh dev swim-lessons-dev-rg

ENVIRONMENT=${1:-dev}
RESOURCE_GROUP=${2:-"swim-lessons-${ENVIRONMENT}-rg"}
LOCATION=${3:-eastus}

echo "🚀 Deploying Swim Lessons Platform to Azure"
echo "   Environment: ${ENVIRONMENT}"
echo "   Resource Group: ${RESOURCE_GROUP}"
echo "   Location: ${LOCATION}"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed. Please install it first."
    echo "   https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in
echo "🔐 Checking Azure CLI login status..."
az account show &> /dev/null || {
    echo "❌ Not logged into Azure CLI. Running 'az login'..."
    az login
}

# Create resource group if it doesn't exist
echo "📦 Ensuring resource group exists..."
az group create \
    --name "${RESOURCE_GROUP}" \
    --location "${LOCATION}" \
    --output none

echo "✅ Resource group ready"
echo ""

# Deploy Bicep template
echo "🔧 Deploying Bicep template..."
DEPLOYMENT_NAME="swim-lessons-$(date +%Y%m%d-%H%M%S)"

az deployment group create \
    --name "${DEPLOYMENT_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --template-file ../bicep/main.bicep \
    --parameters ../bicep/parameters/${ENVIRONMENT}.parameters.json \
    --output table

echo ""
echo "✅ Deployment complete!"
echo ""

# Get outputs
echo "📊 Deployment Outputs:"
az deployment group show \
    --name "${DEPLOYMENT_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --query properties.outputs \
    --output table

echo ""
echo "🎉 Infrastructure deployed successfully!"
echo ""
echo "Next steps:"
echo "  1. Review the outputs above"
echo "  2. Update .env files with connection strings"
echo "  3. Deploy Function App code: npm run deploy:functions"
echo "  4. Deploy Static Web App: npm run deploy:web"
