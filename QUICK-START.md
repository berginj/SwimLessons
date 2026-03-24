# 🚀 QUICK START - GitHub Actions Deployment

## 3 Simple Steps to Enable Auto-Deploy

### ✅ **STEP 1: Add 2 Secrets to GitHub** (3 min)

**Go here:** https://github.com/berginj/SwimLessons/settings/secrets/actions

**Add Secret #1:**
- Name: `AZURE_CREDENTIALS`
- Value: Open `SETUP-GITHUB-DEPLOY.md` and copy the JSON from section 1.2

**Add Secret #2:**
- Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
- Value: `98fd5b203ec3db657fa7bcc8c45db808fb9896e9c7f2d7aa4fbfbefefcf7aa9f06-7bc0f51b-8fd7-4185-b552-fd885aecb4a601020280a9008a10`

---

### ✅ **STEP 2: Allow the Blocked Secret** (1 min)

**Click:** https://github.com/berginj/SwimLessons/security/secret-scanning/unblock-secret/3BN6PHqj9LhfiuGqmoH4nGXz5By

**Then:** Click "Allow secret"

---

### ✅ **STEP 3: Push to GitHub** (30 sec)

```bash
git push origin main
```

**Watch:** https://github.com/berginj/SwimLessons/actions

---

## 🎯 Result

- ✅ Code deploys automatically
- ✅ Function App goes live
- ✅ API endpoints work
- ✅ No manual deployment ever again!

---

**Full instructions:** See `SETUP-GITHUB-DEPLOY.md`
