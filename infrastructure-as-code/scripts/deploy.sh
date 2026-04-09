#!/bin/bash
set -e

# Deploy Azure Infrastructure with Bicep
# Usage: ./deploy.sh <environment> [resourceGroupName] [resourceGroupLocation]
# Example: ./deploy.sh staging swim-lessons-staging-rg eastus
# Example: ./deploy.sh evaluation swim-lessons-evaluation-rg eastus

ENVIRONMENT=${1:-dev}
RESOURCE_GROUP=${2:-"swim-lessons-${ENVIRONMENT}-rg"}
RESOURCE_GROUP_LOCATION=${3:-eastus}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BICEP_ROOT=$(cd "${SCRIPT_DIR}/../bicep" && pwd)
PARAMETERS_FILE="${BICEP_ROOT}/parameters/${ENVIRONMENT}.parameters.json"
MAIN_TEMPLATE="${BICEP_ROOT}/main.bicep"

if [ "${ENVIRONMENT}" = "evaluation" ]; then
    PARAMETERS_FILE="${BICEP_ROOT}/parameters/evaluation.parameters.json"
fi

echo "🚀 Deploying Swim Lessons Platform to Azure"
echo "   Environment: ${ENVIRONMENT}"
echo "   Resource Group: ${RESOURCE_GROUP}"
echo "   Resource Group Location: ${RESOURCE_GROUP_LOCATION}"
echo "   Parameters File: ${PARAMETERS_FILE}"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed. Please install it first."
    echo "   https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in
echo "🔐 Checking Azure CLI login status..."
if ! az account show &> /dev/null; then
    echo "❌ Not logged into Azure CLI. Running 'az login'..."
    az login
fi

# Create resource group if it doesn't exist
echo "📦 Ensuring resource group exists..."
CURRENT_RG_LOCATION=$(az group show \
    --name "${RESOURCE_GROUP}" \
    --query location \
    --output tsv 2>/dev/null || true)

if [ -z "${CURRENT_RG_LOCATION}" ]; then
    az group create \
        --name "${RESOURCE_GROUP}" \
        --location "${RESOURCE_GROUP_LOCATION}" \
        --output none
    echo "✅ Resource group created in ${RESOURCE_GROUP_LOCATION}"
else
    echo "✅ Using existing resource group in ${CURRENT_RG_LOCATION}"
fi

echo ""

# Deploy Bicep template
echo "🔧 Deploying Bicep template..."
DEPLOYMENT_NAME="swim-lessons-$(date +%Y%m%d-%H%M%S)"

az deployment group create \
    --name "${DEPLOYMENT_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --template-file "${MAIN_TEMPLATE}" \
    --parameters "${PARAMETERS_FILE}" \
    --output table

FUNCTION_APP_NAME=$(az deployment group show \
    --name "${DEPLOYMENT_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --query properties.outputs.functionAppName.value \
    --output tsv)

STATIC_WEB_APP_NAME=$(az deployment group show \
    --name "${DEPLOYMENT_NAME}" \
    --resource-group "${RESOURCE_GROUP}" \
    --query properties.outputs.staticWebAppName.value \
    --output tsv)

if [ -n "${FUNCTION_APP_NAME}" ] && [ -n "${STATIC_WEB_APP_NAME}" ]; then
    echo ""
    echo "🔗 Linking Function App backend to Static Web App..."
    FUNCTION_APP_ID=$(az functionapp show \
        --name "${FUNCTION_APP_NAME}" \
        --resource-group "${RESOURCE_GROUP}" \
        --query id \
        --output tsv)
    FUNCTION_APP_LOCATION=$(az functionapp show \
        --name "${FUNCTION_APP_NAME}" \
        --resource-group "${RESOURCE_GROUP}" \
        --query location \
        --output tsv)
    EXISTING_BACKEND_ID=$(az staticwebapp backends show \
        --name "${STATIC_WEB_APP_NAME}" \
        --resource-group "${RESOURCE_GROUP}" \
        --query "[0].backendResourceId" \
        --output tsv 2>/dev/null || true)

    if [ -n "${EXISTING_BACKEND_ID}" ] && [ "${EXISTING_BACKEND_ID}" != "${FUNCTION_APP_ID}" ]; then
        az staticwebapp backends unlink \
            --name "${STATIC_WEB_APP_NAME}" \
            --resource-group "${RESOURCE_GROUP}" \
            --output none
    fi

    if [ "${EXISTING_BACKEND_ID}" != "${FUNCTION_APP_ID}" ]; then
        az staticwebapp backends link \
            --name "${STATIC_WEB_APP_NAME}" \
            --resource-group "${RESOURCE_GROUP}" \
            --backend-resource-id "${FUNCTION_APP_ID}" \
            --backend-region "${FUNCTION_APP_LOCATION}" \
            --output none
    fi
fi

if [ -n "${FUNCTION_APP_NAME}" ]; then
    echo ""
    echo "🔓 Normalizing Function App auth settings for anonymous API endpoints..."
    az resource update \
        --ids "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Web/sites/${FUNCTION_APP_NAME}/config/authsettingsV2" \
        --set properties.globalValidation.requireAuthentication=false \
              properties.globalValidation.unauthenticatedClientAction=AllowAnonymous \
        --output none || true
fi

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
echo "  2. Redeploy Function App code so WEBSITE_RUN_FROM_PACKAGE is refreshed"
echo "  3. Deploy Static Web App code if needed"
