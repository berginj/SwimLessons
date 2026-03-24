# Azure Deployment Guide

Quick guide to deploy the Swim Lessons platform infrastructure to Azure.

## Prerequisites

- Azure CLI installed ([Install Guide](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli))
- Azure subscription with Owner/Contributor access
- Git Bash or PowerShell (Windows) or Terminal (Mac/Linux)

## Step-by-Step Deployment

### 1. Login to Azure

```bash
# Login to Azure (opens browser)
az login

# List your subscriptions
az account list --output table

# Set the subscription you want to use
az account set --subscription "YOUR_SUBSCRIPTION_NAME_OR_ID"

# Verify current subscription
az account show --output table
```

### 2. Set Variables

```bash
# Environment configuration
ENVIRONMENT="dev"
LOCATION="eastus"
RESOURCE_GROUP="swim-lessons-${ENVIRONMENT}-rg"

# Verify variables
echo "Environment: $ENVIRONMENT"
echo "Location: $LOCATION"
echo "Resource Group: $RESOURCE_GROUP"
```

### 3. Create Resource Group

```bash
# Create resource group
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --tags environment="$ENVIRONMENT" project="swim-lessons"

# Verify resource group created
az group show --name "$RESOURCE_GROUP" --output table
```

### 4. Deploy Infrastructure (Bicep)

```bash
# Navigate to infrastructure folder
cd infrastructure-as-code

# Deploy using Bicep template
DEPLOYMENT_NAME="swim-lessons-$(date +%Y%m%d-%H%M%S)"

az deployment group create \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --template-file bicep/main.bicep \
  --parameters bicep/parameters/${ENVIRONMENT}.parameters.json \
  --verbose

# This will take 5-10 minutes to complete
```

### 5. Get Deployment Outputs

```bash
# Get all outputs as JSON
az deployment group show \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.outputs \
  --output json > deployment-outputs.json

# Display outputs in table format
az deployment group show \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.outputs \
  --output table

# Get specific outputs
COSMOS_ENDPOINT=$(az deployment group show \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.outputs.cosmosDbEndpoint.value \
  --output tsv)

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

echo "Deployment Complete!"
echo "---"
echo "Cosmos DB Endpoint: $COSMOS_ENDPOINT"
echo "App Config Endpoint: $APP_CONFIG_ENDPOINT"
echo "Key Vault Name: $KEY_VAULT_NAME"
echo "Function App URL: $FUNCTION_APP_URL"
echo "Static Web App URL: $STATIC_WEB_APP_URL"
```

### 6. Create .env File

```bash
# Navigate back to project root
cd ..

# Create .env file with deployment outputs
cat > .env <<EOF
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
EOF

echo ".env file created!"
cat .env
```

### 7. Verify Resources Created

```bash
# List all resources in the resource group
az resource list \
  --resource-group "$RESOURCE_GROUP" \
  --output table

# Check Cosmos DB
az cosmosdb show \
  --name $(az cosmosdb list -g "$RESOURCE_GROUP" --query [0].name -o tsv) \
  --resource-group "$RESOURCE_GROUP" \
  --output table

# Check Function App
az functionapp list \
  --resource-group "$RESOURCE_GROUP" \
  --output table

# Check Static Web App
az staticwebapp list \
  --resource-group "$RESOURCE_GROUP" \
  --output table

# Check App Configuration
az appconfig list \
  --resource-group "$RESOURCE_GROUP" \
  --output table

# Check Key Vault
az keyvault list \
  --resource-group "$RESOURCE_GROUP" \
  --output table
```

### 8. Grant Yourself Access to Key Vault (if needed)

```bash
# Get your user principal ID
USER_PRINCIPAL_ID=$(az ad signed-in-user show --query id --output tsv)

# Grant yourself Key Vault Secrets Officer role
az role assignment create \
  --role "Key Vault Secrets Officer" \
  --assignee "$USER_PRINCIPAL_ID" \
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.KeyVault/vaults/$KEY_VAULT_NAME"

echo "Key Vault access granted!"
```

---

## Quick Deployment (One Command)

If you trust the script, run this:

```bash
# Make script executable
chmod +x infrastructure-as-code/scripts/deploy.sh

# Run deployment script
./infrastructure-as-code/scripts/deploy.sh dev swim-lessons-dev-rg eastus
```

---

## Cost Monitoring

### Set Up Cost Alerts

```bash
# Create budget alert at $100
az consumption budget create \
  --budget-name "swim-lessons-dev-budget" \
  --amount 100 \
  --time-grain Monthly \
  --start-date "2026-03-01" \
  --end-date "2027-03-01" \
  --resource-group "$RESOURCE_GROUP"
```

### Check Current Costs

```bash
# View current month costs
az consumption usage list \
  --start-date "2026-03-01" \
  --end-date "2026-03-31" \
  --query "[?contains(instanceName, 'swim')].{Resource:instanceName, Cost:pretaxCost, Currency:currency}" \
  --output table
```

---

## Troubleshooting

### Deployment Failed?

```bash
# Get deployment errors
az deployment group show \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.error

# Get deployment operations
az deployment operation group list \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[?properties.provisioningState=='Failed']"
```

### Resource Already Exists?

```bash
# Delete resource group and start over
az group delete --name "$RESOURCE_GROUP" --yes --no-wait

# Wait for deletion to complete (5-10 minutes)
az group wait --name "$RESOURCE_GROUP" --deleted

# Then re-run deployment from Step 3
```

### Can't Access Cosmos DB?

```bash
# Check firewall rules
az cosmosdb show \
  --name $(az cosmosdb list -g "$RESOURCE_GROUP" --query [0].name -o tsv) \
  --resource-group "$RESOURCE_GROUP" \
  --query "ipRules"

# Allow your IP
MY_IP=$(curl -s https://ifconfig.me)
az cosmosdb update \
  --name $(az cosmosdb list -g "$RESOURCE_GROUP" --query [0].name -o tsv) \
  --resource-group "$RESOURCE_GROUP" \
  --ip-range-filter "$MY_IP"
```

---

## Next Steps After Deployment

1. **Verify .env file created** - Check that connection strings are correct
   Connection strings are fetched directly from Azure, not from Bicep outputs.
2. **Test Cosmos DB connection** - Run a simple query
3. **Seed NYC city config** - Use script to create initial tenant
4. **Deploy Function App code** - Build and deploy API endpoints
5. **Deploy Static Web App** - Build and deploy React frontend

---

## Clean Up (Delete Everything)

⚠️ **Warning:** This deletes ALL resources and data!

```bash
# Delete resource group (removes all resources)
az group delete \
  --name "$RESOURCE_GROUP" \
  --yes \
  --no-wait

# Verify deletion started
az group list --query "[?name=='$RESOURCE_GROUP']" --output table

# Check deletion status
az group wait --name "$RESOURCE_GROUP" --deleted
```

---

## Estimated Costs

**Development Environment (with minimal usage):**
- Cosmos DB (Serverless): $5-25/month
- Function Apps (Consumption): $0-10/month
- Static Web App (Free tier): $0/month
- App Configuration (Free tier): $0/month
- Key Vault: $3/month
- Application Insights: $5-15/month

**Total: $13-53/month** (well under $200 budget)

**Note:** Costs scale with usage. Monitor via Azure Cost Management.

---

## Support

- **Azure CLI Issues:** https://github.com/Azure/azure-cli/issues
- **Bicep Issues:** Check `infrastructure-as-code/bicep/` files
- **Project Issues:** GitHub Issues on this repo
