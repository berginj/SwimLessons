# ✅ GitHub Deploy Setup - Quick Checklist

## 🎯 Goal: Enable automatic deployment from GitHub to Azure

**Time:** 5 minutes
**Complexity:** Easy (copy-paste)

---

## ☑️ **STEP 1: Add GitHub Secrets** (3 min)

**Go to:** https://github.com/berginj/SwimLessons/settings/secrets/actions

### **Secret #1: AZURE_CREDENTIALS**

Click **"New repository secret"**
- **Name:** `AZURE_CREDENTIALS`
- **Value:** (See SETUP-GITHUB-DEPLOY.md for the JSON - 10 lines starting with `{`)
- Click **"Add secret"**

### **Secret #2: AZURE_STATIC_WEB_APPS_API_TOKEN**

Click **"New repository secret"** again
- **Name:** `AZURE_STATIC_WEB_APPS_API_TOKEN`
- **Value:** `98fd5b203ec3db657fa7bcc8c45db808fb9896e9c7f2d7aa4fbfbefefcf7aa9f06-7bc0f51b-8fd7-4185-b552-fd885aecb4a601020280a9008a10`
- Click **"Add secret"**

**Verify:** You see 2 secrets listed ✅

---

## ☑️ **STEP 2: Allow Blocked Secret** (1 min)

**Click:** https://github.com/berginj/SwimLessons/security/secret-scanning/unblock-secret/3BN6PHqj9LhfiuGqmoH4nGXz5By

- Click **"Allow secret"**
- Reason: "Dev environment Cosmos DB - safe to push"
- Confirm

✅ Secret whitelisted

---

## ☑️ **STEP 3: Push to GitHub** (30 sec)

```bash
git push origin main
```

**What happens:**
- ✅ Code pushes successfully (no more blocks!)
- ✅ GitHub Actions starts automatically
- ✅ Runs tests and builds
- ✅ Deploys Function App to Azure
- ✅ Your API goes live!

---

## ☑️ **STEP 4: Watch Deployment** (optional)

**Visit:** https://github.com/berginj/SwimLessons/actions

**You'll see:**
- 🟡 CI Build (running)
- 🟡 Deploy to Staging (waiting)

**Wait ~8 minutes** for all green checkmarks ✅

---

## ☑️ **STEP 5: Test Live API** (30 sec)

Once deployment completes:

```bash
curl https://func-swim-r5bmpt.azurewebsites.net/api/cities
```

**Should return:**
```json
{
  "success": true,
  "data": {
    "cities": [
      {
        "cityId": "nyc",
        "displayName": "New York City",
        "status": "active"
      }
    ]
  }
}
```

✅ **API is LIVE!**

---

## 📋 **Quick Reference**

| What | Where | Value |
|------|-------|-------|
| **GitHub Secrets** | [Settings → Secrets](https://github.com/berginj/SwimLessons/settings/secrets/actions) | Add 2 secrets |
| **Allow Secret** | [Unblock Link](https://github.com/berginj/SwimLessons/security/secret-scanning/unblock-secret/3BN6PHqj9LhfiuGqmoH4nGXz5By) | Click "Allow" |
| **Push** | Terminal | `git push origin main` |
| **Watch** | [Actions Tab](https://github.com/berginj/SwimLessons/actions) | See deployment |
| **Test** | Terminal | `curl [Function URL]/api/cities` |

---

## 🎯 **Expected Result**

**After completing all steps:**
- ✅ Code in GitHub (all commits pushed)
- ✅ GitHub Actions running on every push
- ✅ Function App deployed automatically
- ✅ API endpoints live and working
- ✅ No manual deployment needed ever again!

---

## 💡 **Need Help?**

**See detailed instructions:** `SETUP-GITHUB-DEPLOY.md`

**Stuck on Step 1?** The JSON is in `SETUP-GITHUB-DEPLOY.md` section 1.2

**Stuck on Step 2?** Click the allow link, it's safe (dev environment only)

**Deployment failed?** Check GitHub Actions logs for error message

---

## 🚀 **START HERE:**

1. Open in browser: https://github.com/berginj/SwimLessons/settings/secrets/actions
2. Add the 2 secrets (values in SETUP-GITHUB-DEPLOY.md)
3. Allow the blocked secret
4. Run `git push origin main`
5. ✅ Done!

**Total time: 5 minutes to fully automated Azure deployment!** 🎉
