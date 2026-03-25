# 🗺️ Geocoding Workaround - API Activation Issue

## ⚠️ **Issue: NYC GeoClient API Returns 401**

**Your subscription:**
- Name: SwimmingLessons
- Status: Just created (03/25/2026)
- Primary key: a1f7cbce145347559fd5509ff63e53ea
- Secondary key: 3fecc5ef1e884697ae9eca8f75406b6d

**Problem:**
- API returns "Access denied due to invalid subscription key"
- Subscription may need 5-30 minutes to activate
- Or you may be subscribed to wrong product

---

## ✅ **SOLUTION 1: Wait and Retry (Recommended)**

**New subscriptions can take 5-30 minutes to activate.**

**Try in 15 minutes:**
```powershell
# Update .env with credentials
Add-Content -Path ..\.env -Value "NYC_GEOCLIENT_APP_ID=SwimmingLessons"
Add-Content -Path ..\.env -Value "NYC_GEOCLIENT_APP_KEY=a1f7cbce145347559fd5509ff63e53ea"

# Run geocoding
npx tsx geocode-nyc-facilities.ts
```

**If still 401 after 30 minutes:**
- Check subscription is "Active" (not "Pending")
- Make sure you subscribed to "Geoclient V2 User" (not a different product)

---

## ✅ **SOLUTION 2: Use Fallback Geocoding NOW (Works Immediately)**

**The script automatically falls back to approximate coordinates if API fails.**

**Just run:**
```powershell
npx tsx geocode-nyc-facilities.ts
```

**What happens:**
- ✅ Tries API first (will get 401)
- ✅ Falls back to borough centers automatically
- ✅ Creates geocoded CSV with approximate coordinates
- ✅ Accuracy: ~2-3 miles (good enough for demo)

**Output will show:**
```
[1/24] NEW YORK CITY DEPARTMENT OF EDUCATION
   Address: 120 EAST 184 STREET, BX 10457
   ⚠️  Fallback: 40.8448, -73.8648  (Bronx center + random offset)
```

**This is FINE for MVP!** Distance calculations will work, just not super precise.

---

## ✅ **SOLUTION 3: Manual Geocoding (Best Accuracy)**

**Use Google Maps to get exact coordinates for top 10 facilities:**

1. **Open Google Maps:** https://maps.google.com
2. **Search:** "120 East 184 Street, Bronx, NY 10457"
3. **Right-click location** → Click coordinates
4. **Copy:** `40.8572, -73.8945`
5. **Add to CSV manually**

**Do this for your top 10 most popular facilities.**

**Then edit `data/nyc-pools-geocoded.csv` directly:**
```csv
...,latitude,longitude,geocode_quality
...,40.8572,-73.8945,high
```

---

## 🎯 **RECOMMENDATION: Use Fallback for Now**

**Skip the API hassle, use fallback geocoding:**

```powershell
# Just run it - will use fallback automatically
npx tsx geocode-nyc-facilities.ts
```

**Pros:**
- ✅ Works immediately (no waiting)
- ✅ Good enough for MVP demo
- ✅ Can improve later with exact coords

**Cons:**
- ⚠️ Less accurate (~2-3 miles vs exact address)
- ⚠️ Distance sorting not as precise

**For a demo/pilot, this is totally acceptable!**

---

## 📋 **Next Steps**

### **Option A: Use Fallback (Fastest)**

```powershell
# Run with fallback geocoding
npx tsx geocode-nyc-facilities.ts

# Then load data
npx tsx load-nyc-data.ts

# You'll have 24 NYC facilities in ~5 minutes!
```

---

### **Option B: Wait for API Activation**

**Wait 15-30 minutes, then:**

```powershell
# Try again
npx tsx geocode-nyc-facilities.ts

# If still 401:
# 1. Check subscription is "Active"
# 2. Verify you subscribed to "Geoclient V2 User"
# 3. Try secondary key instead
```

---

### **Option C: Manually Geocode Top 10**

**For best accuracy:**
1. Use Google Maps for top 10 facilities
2. Edit CSV manually
3. Load into Cosmos DB

---

## 💡 **MY RECOMMENDATION:**

**Just use fallback for now:**

```powershell
npx tsx geocode-nyc-facilities.ts
```

**It will warn about API failure but continue with fallback coordinates.**

**You'll have working NYC data in 5 minutes!**

**Later (when API activates or for production), re-run with real API for exact coordinates.**

---

**Want to proceed with fallback geocoding?** ✅
