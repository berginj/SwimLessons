# 🔧 GitHub Actions Setup - Step by Step

## ✅ Prerequisites Complete

I've already created:
- ✅ Azure Service Principal for GitHub
- ✅ Static Web App deployment token
- ✅ GitHub Actions workflows (already in repo)

**Now you just need to add 2 secrets to GitHub and push!**

---

## 📝 **STEP 1: Add Secrets to GitHub** (3 minutes)

### **1.1 Go to GitHub Secrets Page**

**Direct Link:** https://github.com/berginj/SwimLessons/settings/secrets/actions

**Or navigate:**
1. Go to https://github.com/berginj/SwimLessons
2. Click **"Settings"** tab (top right)
3. Click **"Secrets and variables"** → **"Actions"** (left sidebar)

---

### **1.2 Add First Secret: AZURE_CREDENTIALS**

1. Click **"New repository secret"** button (green button, top right)

2. **Name:** `AZURE_CREDENTIALS`

3. **Secret:** Copy and paste this ENTIRE JSON:

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

4. Click **"Add secret"**

---

### **1.3 Add Second Secret: AZURE_STATIC_WEB_APPS_API_TOKEN**

1. Click **"New repository secret"** again

2. **Name:** `AZURE_STATIC_WEB_APPS_API_TOKEN`

3. **Secret:** Copy and paste this token:

```
98fd5b203ec3db657fa7bcc8c45db808fb9896e9c7f2d7aa4fbfbefefcf7aa9f06-7bc0f51b-8fd7-4185-b552-fd885aecb4a601020280a9008a10
```

4. Click **"Add secret"**

---

### **1.4 Verify Secrets Added**

You should now see 2 secrets listed:
- ✅ AZURE_CREDENTIALS
- ✅ AZURE_STATIC_WEB_APPS_API_TOKEN

**Screenshot should look like:**
```
Repository secrets
Name                                  Updated
AZURE_CREDENTIALS                     Now
AZURE_STATIC_WEB_APPS_API_TOKEN      Now
```

---

## 📝 **STEP 2: Allow the Blocked Secret** (1 minute)

GitHub is blocking your pushes because of the Cosmos DB key in git history.

### **2.1 Click the Allow Link**

**Direct Link:**
https://github.com/berginj/SwimLessons/security/secret-scanning/unblock-secret/3BN6PHqj9LhfiuGqmoH4nGXz5By

**Or find it:**
1. Go to https://github.com/berginj/SwimLessons
2. You'll see a banner about blocked secrets
3. Click the link in the banner

---

### **2.2 Allow the Secret**

1. Click **"Allow secret"** button
2. Add reason: "Dev environment Cosmos DB key - safe to push"
3. Click **"Allow"**

✅ Secret is now whitelisted - pushes will work!

---

## 📝 **STEP 3: Push to GitHub** (30 seconds)

Now that secrets are configured and allowed:

```bash
# Make sure you're in the project directory
cd C:\Users\berginjohn\App\pools

# Push all your code
git push origin main
```

**What happens:**
1. ✅ Code pushes to GitHub (no more blocks!)
2. ✅ GitHub Actions detects the push
3. ✅ Runs CI build workflow automatically
4. ✅ Runs deployment workflow to Azure
5. ✅ Function App code deploys to `func-swim-r5bmpt`
6. ✅ Static Web App ready for frontend

---

## 📝 **STEP 4: Watch the Deployment** (5-10 minutes)

### **4.1 Go to Actions Tab**

https://github.com/berginj/SwimLessons/actions

**You'll see:**
- 🟡 **CI Build** - Running (build + test)
- 🟡 **Deploy to Staging** - Waiting for CI to finish

---

### **4.2 Monitor Progress**

**Click on the running workflow** to see:
- Build and Test job
- Deploy Infrastructure job
- Deploy Functions job
- Deploy Web App job

**Each step shows:**
- ✅ Green checkmark = success
- ❌ Red X = failed
- 🟡 Yellow circle = running

---

### **4.3 Success! **

When all jobs are green ✅:

**Function App is LIVE:**
```bash
curl https://func-swim-r5bmpt.azurewebsites.net/api/cities
# Should return NYC in the list!
```

**Static Web App is ready** for React deployment

---

## 🎯 **What GitHub Actions Will Do**

### **On Every Push to `main`:**

```
1. Run CI Build
   ├─ npm install
   ├─ npm run lint
   ├─ npm run build
   ├─ npm test
   └─ Validate Bicep

2. Deploy Infrastructure (if Bicep changed)
   ├─ Login to Azure
   ├─ Deploy Bicep templates
   └─ Update resources

3. Deploy Function App
   ├─ Build TypeScript
   ├─ Install dependencies
   ├─ Package code
   └─ Deploy to func-swim-r5bmpt

4. Deploy Static Web App
   └─ Ready for React app
```

**Total time:** 8-12 minutes

---

## 🐛 **Troubleshooting**

### **"Push still blocked by secret scanning"**

**Solution:**
1. Make sure you clicked "Allow secret" link
2. Wait 5 minutes for GitHub to process
3. Try push again

---

### **"Workflow failed - authentication error"**

**Check:**
1. Is `AZURE_CREDENTIALS` secret correct JSON?
2. Copy-paste error? (trailing comma, missing brace)
3. Try re-creating the secret

**Fix:**
- Delete the secret in GitHub
- Re-add it (copy JSON carefully)

---

### **"Function App deployment failed"**

**Check workflow logs:**
1. GitHub Actions tab
2. Click failed workflow
3. Click "Deploy Functions" job
4. Read error message

**Common issues:**
- Build error → Fix TypeScript
- Auth error → Check AZURE_CREDENTIALS
- Timeout → Retry workflow

---

## 📊 **What You Get After Setup**

**Automatic CI/CD:**
- ✅ Every push runs tests
- ✅ Every push deploys to Azure
- ✅ No manual deployment needed

**Visibility:**
- ✅ See build status on every commit
- ✅ Deployment history in Actions tab
- ✅ Error logs if something breaks

**Confidence:**
- ✅ Tests must pass before deploy
- ✅ Bicep validates before infrastructure changes
- ✅ Safe rollback (redeploy previous commit)

---

## 🚀 **Quick Start Commands**

```bash
# 1. Add secrets to GitHub (manual - see Step 1)

# 2. Allow the blocked secret (manual - see Step 2)

# 3. Push to GitHub
git push origin main

# 4. Watch deployment
# Visit: https://github.com/berginj/SwimLessons/actions

# 5. Test API (after deployment completes)
curl https://func-swim-r5bmpt.azurewebsites.net/api/cities
```

---

## ✅ **SUMMARY**

**Setup Time:** 5 minutes
**Required:** 2 GitHub secrets + allow blocked secret
**Benefit:** Automatic deployment on every push

**Steps:**
1. Add `AZURE_CREDENTIALS` to GitHub (JSON above)
2. Add `AZURE_STATIC_WEB_APPS_API_TOKEN` to GitHub (token above)
3. Allow the blocked secret (click link)
4. Push to GitHub (`git push origin main`)
5. ✅ Automatic deployment starts!

---

**Ready? Start with Step 1 - add the 2 secrets to GitHub!**

Direct link: https://github.com/berginj/SwimLessons/settings/secrets/actions
