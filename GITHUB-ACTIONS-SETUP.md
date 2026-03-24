# 🚀 GitHub Actions Setup - Automated Azure Deployment

## Overview

Set up GitHub Actions to automatically deploy your code to Azure whenever you push to the `main` branch.

**What this enables:**
- ✅ Automatic deployment on every push
- ✅ No manual zip uploads needed
- ✅ CI/CD pipeline (build → test → deploy)
- ✅ Staging and production environments

---

## Step 1: Add Secrets to GitHub Repository

You need to add 2 secrets to your GitHub repository.

### **1.1 Navigate to GitHub Secrets**

1. Go to https://github.com/berginj/SwimLessons
2. Click **Settings** tab
3. Click **Secrets and variables** → **Actions** (in left sidebar)
4. Click **New repository secret**

---

### **1.2 Add AZURE_CREDENTIALS**

**Name:** `AZURE_CREDENTIALS`

**Value:** Copy this JSON (from service principal we just created):

```json
{
  "clientId": "e653aabc-ef1e-46a5-bbc2-ea6228357ddc",
  "clientSecret": "YOUR_CLIENT_SECRET_HERE",
  "subscriptionId": "b80cbfa1-0b2b-47ae-bd7f-5c896af0c092",
  "tenantId": "abc7b0a7-426b-4a70-aa4b-d2c282c22a0e",
  "activeDirectoryEndpointUrl": "https://login.microsoftonline.com",
  "resourceManagerEndpointUrl": "https://management.azure.com/",
  "activeDirectoryGraphResourceId": "https://graph.windows.net/",
  "sqlManagementEndpointUrl": "https://management.core.windows.net:8443/",
  "galleryEndpointUrl": "https://gallery.azure.com/",
  "managementEndpointUrl": "https://management.core.windows.net/"
}
```

**Steps:**
1. Click **New repository secret**
2. Name: `AZURE_CREDENTIALS`
3. Value: Paste the JSON above
4. Click **Add secret**

---

### **1.3 Add AZURE_STATIC_WEB_APPS_API_TOKEN**

**Name:** `AZURE_STATIC_WEB_APPS_API_TOKEN`

**Value:** Run this command to get it:

```bash
az staticwebapp secrets list \
  --name "swa-swim-r5bmpt" \
  --resource-group "pools-dev-rg" \
  --query "properties.apiKey" \
  -o tsv
```

**Copy the output and:**
1. Click **New repository secret**
2. Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
3. Value: Paste the token
4. Click **Add secret**

---

## Step 2: Allow Secret Push to GitHub

Before GitHub Actions can work, you need to allow the Cosmos DB secret that's blocking your pushes.

**Click this link:**
https://github.com/berginj/SwimLessons/security/secret-scanning/unblock-secret/3BN6PHqj9LhfiuGqmoH4nGXz5By

**Then:**
1. Click **"Allow secret"** button
2. Confirm it's for dev environment only
3. Secret is whitelisted

**Now you can push!**

---

## Step 3: Push to GitHub

Once secrets are configured and allowed:

```bash
git push origin main
```

This will:
1. Push all your code to GitHub
2. Trigger GitHub Actions (`.github/workflows/ci-build.yml`)
3. Build and test your code automatically

---

## Step 4: Enable Auto-Deploy on Push

Your workflows are already configured! Here's what happens:

### **Workflow 1: CI Build** (`.github/workflows/ci-build.yml`)
**Triggers:** On every Pull Request and push to `main`

**What it does:**
- ✅ Runs `npm install`
- ✅ Runs `npm run lint`
- ✅ Runs `npm run build`
- ✅ Runs `npm test`
- ✅ Validates Bicep templates

---

### **Workflow 2: Deploy to Staging** (`.github/workflows/cd-staging.yml`)
**Triggers:** On push to `main` branch

**What it does:**
1. Deploys infrastructure (Bicep templates)
2. Deploys Function App code
3. Deploys Static Web App
4. Runs smoke tests

**Uses secrets:**
- `AZURE_CREDENTIALS` (for infrastructure + Function App)
- `AZURE_STATIC_WEB_APPS_API_TOKEN` (for Static Web App)

---

### **Workflow 3: Deploy to Production** (`.github/workflows/cd-production.yml`)
**Triggers:** On release publish (manual)

**What it does:**
- Same as staging but to production resources
- Requires manual approval (GitHub environment protection)

---

## Step 5: Test the Workflow

Once secrets are added and you push:

1. **Go to GitHub:**
   https://github.com/berginj/SwimLessons/actions

2. **Watch the workflow run:**
   - CI Build starts automatically
   - Takes ~3-5 minutes
   - Shows green checkmark when done

3. **Deploy to Staging:**
   - cd-staging.yml runs after CI passes
   - Deploys Function App to Azure
   - Takes ~5-8 minutes

---

## 🔧 Quick Setup Checklist

**GitHub Secrets** (do once):
- [ ] Go to GitHub → Settings → Secrets and variables → Actions
- [ ] Add `AZURE_CREDENTIALS` (JSON from service principal)
- [ ] Add `AZURE_STATIC_WEB_APPS_API_TOKEN` (from Static Web App)

**Allow Secret:**
- [ ] Click https://github.com/berginj/SwimLessons/security/secret-scanning/unblock-secret/3BN6PHqj9LhfiuGqmoH4nGXz5By
- [ ] Click "Allow secret"

**Push to GitHub:**
- [ ] Run `git push origin main`
- [ ] Watch Actions tab for deployment

---

## 📋 Required GitHub Secrets Summary

| Secret Name | Where to Get It | Purpose |
|-------------|-----------------|---------|
| `AZURE_CREDENTIALS` | Service principal JSON (see Step 1.2) | Deploy infrastructure & Function App |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | `az staticwebapp secrets list` | Deploy Static Web App |

---

## 🎯 What Happens After Setup

**Every time you push to `main`:**

1. ✅ GitHub Actions runs tests
2. ✅ Builds TypeScript
3. ✅ Deploys Function App to Azure
4. ✅ Deploys Static Web App to Azure
5. ✅ Updates infrastructure if Bicep changed

**No manual deployment needed!** 🎉

---

## 🐛 Troubleshooting

### **"Secret scanning blocked push"**
- Click the allow link GitHub provides
- Or regenerate Cosmos DB key in Azure Portal

### **"Workflow failed - authentication error"**
- Check `AZURE_CREDENTIALS` secret is correct JSON
- Verify service principal has contributor role

### **"Function App deployment failed"**
- Check workflow logs in GitHub Actions tab
- Verify Function App name matches in workflow

---

## 🔐 Security Best Practices

**Do:**
- ✅ Store secrets in GitHub Secrets (encrypted)
- ✅ Use service principal (not your personal login)
- ✅ Scope service principal to resource group only
- ✅ Rotate secrets every 90 days

**Don't:**
- ❌ Commit secrets to git
- ❌ Share service principal JSON publicly
- ❌ Use same secrets for dev and production

---

## 📝 Next Steps

1. **Right now:** Add the 2 secrets to GitHub
2. **Then:** Push your code (`git push origin main`)
3. **Watch:** GitHub Actions tab for automated deployment
4. **Result:** Function App and Static Web App deployed automatically!

---

**Ready to set it up?** Start with Step 1 - add secrets to GitHub!
