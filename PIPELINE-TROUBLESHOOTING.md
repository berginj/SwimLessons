# 🔧 Pipeline Troubleshooting - Script Hung for 13 Minutes

## ❌ **Problem: load-nyc-data.ts Hung/Stuck**

**Expected time:** 2 minutes
**Actual time:** 13+ minutes (stuck)

---

## 🔍 **Most Likely Causes**

### **1. Missing .env File or Connection String**

**Check:**
```bash
cat .env | grep COSMOS_CONNECTION_STRING
```

**If missing:**
```bash
# You need to create .env with Cosmos DB connection string
# Get it from Azure:
az cosmosdb keys list \
  --name cosmos-swim-r5bmpt \
  --resource-group pools-dev-rg \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" \
  --output tsv
```

**Then create .env:**
```bash
cat > .env <<EOF
COSMOS_CONNECTION_STRING=AccountEndpoint=https://cosmos-swim-r5bmpt.documents.azure.com:443/;AccountKey=...
COSMOS_DATABASE_ID=swimlessons
EOF
```

---

### **2. TypeScript Not Compiled**

**The script imports from `dist/` folder which needs compilation.**

**Fix:**
```bash
# Compile TypeScript first
npm run build

# Or directly:
npx tsc

# Verify dist/ folder exists
ls -la dist/adapters/nyc/
```

---

### **3. Geocoded CSV Doesn't Exist**

**The script expects `data/nyc-pools-geocoded.csv` but you only have the sample.**

**You MUST run Step 1 first:**
```bash
cd scripts
npx tsx geocode-nyc-facilities.ts
```

**This creates the geocoded CSV** that Step 2 needs.

---

### **4. Cosmos DB Connection Timeout**

**The script might be trying to connect but timing out.**

**Check Cosmos DB is accessible:**
```bash
az cosmosdb show \
  --name cosmos-swim-r5bmpt \
  --resource-group pools-dev-rg \
  --query "{Name:name, Status:properties.provisioningState}"
```

**Should show:** `Status: "Succeeded"`

**Check firewall:**
```bash
# Allow your IP
MY_IP=$(curl -s https://ifconfig.me)
az cosmosdb update \
  --name cosmos-swim-r5bmpt \
  --resource-group pools-dev-rg \
  --ip-range-filter "$MY_IP"
```

---

### **5. Script Errors Not Visible**

**The script might have errored but you can't see the output.**

**Solution:**
```bash
# Run with explicit error handling
npx tsx load-nyc-data.ts 2>&1 | tee load-output.log

# Check the log
cat load-output.log
```

---

## ✅ **CORRECT EXECUTION SEQUENCE**

**You MUST run in this order:**

### **Step 0: Prerequisites (FIRST!)**

```bash
# 1. Make sure .env exists with Cosmos DB connection
cat .env | grep COSMOS_CONNECTION_STRING

# 2. Compile TypeScript
npm run build

# 3. Verify dist/ folder exists
ls dist/adapters/nyc/nyc-doe-adapter.js
```

---

### **Step 1: Geocode (REQUIRED FIRST!)**

```bash
cd scripts
npx tsx geocode-nyc-facilities.ts
```

**This creates:** `data/nyc-pools-geocoded.csv`

**Without this, Step 2 will fail!**

---

### **Step 2: Load into Cosmos DB**

```bash
# Now this will work
npx tsx load-nyc-data.ts
```

**Expected time:** 2 minutes
**Output:** Should show progress for each step

---

### **Step 3: Verify**

```bash
# Check data in Cosmos DB
az cosmosdb sql container query \
  --account-name cosmos-swim-r5bmpt \
  --database-name swimlessons \
  --name sessions \
  --resource-group pools-dev-rg \
  --query-text "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'LocationDocument'"
```

**Should return:** 24

---

## 🚨 **What Probably Happened**

**Most likely scenario:**

1. You ran `load-nyc-data.ts`
2. Script tried to import `NYCDOEAdapter` from `dist/` folder
3. **dist/ folder didn't exist** (TypeScript not compiled)
4. Script failed with module import error
5. Process hung or terminal stuck

**Fix:**

```bash
# Kill any stuck processes
# Press Ctrl+C in the terminal

# Start fresh:
cd /c/Users/berginjohn/App/pools

# 1. Build TypeScript
npm run build

# 2. Check .env exists
cat .env | head -3

# 3. Run geocoding FIRST
cd scripts
npx tsx geocode-nyc-facilities.ts

# 4. THEN run loading
npx tsx load-nyc-data.ts
```

---

## 📋 **Quick Diagnostic**

**Run these checks:**

```bash
# Check 1: TypeScript compiled?
ls dist/adapters/nyc/nyc-doe-adapter.js

# Check 2: Geocoded CSV exists?
ls data/nyc-pools-geocoded.csv

# Check 3: .env has Cosmos connection?
grep COSMOS_CONNECTION_STRING .env

# Check 4: Cosmos DB accessible?
az cosmosdb show --name cosmos-swim-r5bmpt --resource-group pools-dev-rg
```

**If ANY of these fail, fix them before running load-nyc-data.ts again.**

---

## ✅ **SOLUTION**

**Start over with correct sequence:**

```bash
# From project root
cd /c/Users/berginjohn/App/pools

# 1. Compile TypeScript (creates dist/)
npm run build

# 2. Go to scripts
cd scripts

# 3. Run geocoding (creates geocoded CSV)
npx tsx geocode-nyc-facilities.ts

# 4. Run loading (loads into Cosmos DB)
npx tsx load-nyc-data.ts

# Should complete in 2-3 minutes total
```

---

## 🎯 **Expected Output (When Working)**

**Geocoding:**
```
🗺️  NYC Facility Geocoding Pipeline
Found 24 facilities
Geocoding facilities...
[1/24] ✅ Geocoded: 40.8572, -73.8945
[2/24] ✅ Geocoded: 40.8456, -73.9012
...
✅ Geocoding complete!
```

**Loading:**
```
🏊 NYC Data Enrichment Pipeline
1️⃣  Connecting to Cosmos DB... ✅
2️⃣  Initializing NYC DOE Adapter... ✅
3️⃣  Validating... ✅
4️⃣  Loading providers... ✅
5️⃣  Loading locations... ✅
6️⃣  Loading programs... ✅
✅ NYC DOE data loaded successfully!
```

**Should take 2-5 minutes total, not 13 minutes!**

---

**Try running with the correct sequence above.** 🚀
