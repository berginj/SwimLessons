# 🏊 NYC Pool Data Analysis

## 📊 **Data Source Identified!**

**You have real NYC DOE (Department of Education) pool data!**

This appears to be from NYC's permit/facility database (possibly ACCELA system or NYC Open Data).

---

## 🎯 **Data Structure Analysis**

### **Fields Available:**

| Field | Example | Purpose in Platform |
|-------|---------|---------------------|
| **Permit_Type** | ACCELA | Data source identifier |
| **Permit_ID** | 41699809 | Unique facility ID |
| **Facility_Name** | NYC BD OF ED/P.S. 70 | Location name (use as is) |
| **ADDRESS_No** | 1691 | Street number |
| **ADDRESS_St** | WEEKS AVENUE | Street name |
| **BO** | BX/BK/QU/MA/SI | Borough code |
| **ZIP** | 10457 | Zip code |
| **Community_Board** | 204 | NYC community board |
| **Council_District** | 15 | Council district |
| **Census_tract** | 22902 | Census tract |
| **Boro-Block-Lot** | 2027930028 | NYC property ID |
| **BIN** | 2007387 | Building ID |
| **NTA** | Mount Hope | Neighborhood name |
| **NTA_Code** | BX41 | Neighborhood code |
| **Indoor** | Indoor | Facility type |

---

## 🎯 **Mapping to Canonical Schema**

### **What You Have → What You Need:**

**Provider (Organization):**
```typescript
{
  id: "nyc-provider-doe",
  cityId: "nyc",
  type: "ProviderDocument",
  name: "NYC Department of Education",
  providerType: "public",
  verified: true,
  confidence: "high" // Official NYC data!
}
```

**Location (Pool Facility):**
```typescript
{
  id: `nyc-loc-${Permit_ID}`, // Use Permit_ID
  cityId: "nyc",
  type: "LocationDocument",
  providerId: "nyc-provider-doe",
  name: Facility_Name, // "NYC BD OF ED/P.S. 70"
  address: {
    street: `${ADDRESS_No} ${ADDRESS_St}`, // "1691 WEEKS AVENUE"
    city: "New York",
    state: "NY",
    zipCode: ZIP, // "10457"
    geographyId: mapBorough(BO) // BX → "bronx"
  },
  coordinates: {
    latitude: geocodeAddress(), // Need geocoding
    longitude: geocodeAddress()
  },
  facilityType: "indoor", // All are indoor
  confidence: "high"
}
```

**What's MISSING from This Data:**
- ❌ Coordinates (lat/lng) - Need geocoding!
- ❌ Programs offered (beginner, intermediate, advanced)
- ❌ Session schedules (dates, times)
- ❌ Pricing
- ❌ Registration URLs
- ❌ Availability/capacity

---

## 🔍 **Data Analysis**

### **Coverage:**

**Sample Size:** 24 facilities (from your snippet)

**Borough Distribution:**
- Bronx (BX): 5 facilities
- Brooklyn (BK): 9 facilities
- Queens (QU): 7 facilities
- Manhattan (MA): 2 facilities
- Staten Island (SI): 1 facility

**Facility Types:**
- All Indoor ✅

**Provider:**
- All NYC Department of Education (public schools)
- Need to add: YMCA, JCC, private swim schools

---

## 🎯 **Next Steps to Use This Data**

### **Option 1: Create NYC DOE Adapter (Recommended)**

**File:** `src/adapters/nyc/nyc-doe-adapter.ts`

```typescript
/**
 * NYC DOE Pool Adapter
 * Parses NYC Department of Education pool data
 */
import { BaseAdapter } from '@core/contracts/city-adapter';
import { Location, Provider } from '@core/models/canonical-schema';

export class NYCDOEAdapter extends BaseAdapter {
  private csvData: string;

  constructor(cityId: string, csvData: string) {
    super(cityId);
    this.csvData = csvData;
  }

  async getLocations(): Promise<Location[]> {
    const rows = this.parseCSV(this.csvData);

    return rows.map(row => ({
      id: `nyc-loc-${row.Permit_ID}`,
      cityId: 'nyc',
      type: 'LocationDocument',
      providerId: 'nyc-provider-doe',
      name: row.Facility_Name,
      address: {
        street: `${row.ADDRESS_No} ${row.ADDRESS_St}`,
        city: 'New York',
        state: 'NY',
        zipCode: row.ZIP,
        geographyId: this.mapBorough(row.BO)
      },
      coordinates: {
        latitude: 0, // TODO: Geocode
        longitude: 0
      },
      facilityType: 'indoor',
      confidence: 'high',
      sourceSystem: 'nyc-doe-accela',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  private mapBorough(code: string): string {
    const boroughMap: Record<string, string> = {
      'BX': 'bronx',
      'BK': 'brooklyn',
      'QU': 'queens',
      'MA': 'manhattan',
      'SI': 'staten-island'
    };
    return boroughMap[code] || code.toLowerCase();
  }

  // ... implement other methods
}
```

---

### **Option 2: Geocode Addresses (CRITICAL)**

**You need lat/lng for distance calculations!**

**Method 1: Use NYC GeoClient API (Free!)**
```bash
# NYC provides free geocoding
https://api.nyc.gov/geo/geoclient/v2/address.json?
  houseNumber=1691&
  street=WEEKS AVENUE&
  borough=BRONX
```

**Method 2: Batch Geocode with Google/Azure**
```bash
# Google Maps Geocoding API
# Or Azure Maps Geocoding
# ~$5 per 1,000 addresses
# You have ~100-200 facilities = $1-2 one-time
```

**Method 3: Use Existing NYC Dataset**
```bash
# NYC Open Data may already have these geocoded
# Search: "NYC swimming pools with coordinates"
```

---

### **Option 3: Enrich with Program Data**

**This data only gives FACILITIES (locations).**

**You still need:**
- Programs (beginner, intermediate, advanced classes)
- Sessions (specific dates/times to enroll)
- Pricing
- Registration links

**Where to get it:**
1. **NYC Parks Department website** - scrape or API
2. **Each school's website** - manual for top 20
3. **Partner with NYC DOE** - request program schedules
4. **Start with subset** - Focus on 10 high-demand facilities

---

## 🎯 **Recommended Implementation Plan**

### **Phase 1: Load Facilities (This Week)**

**1. Create NYC DOE Adapter:**
- Parse this CSV
- Transform to Location canonical schema
- Geocode addresses (use NYC GeoClient API)
- Load into Cosmos DB

**Result:** 24+ real NYC pool locations ✅

---

### **Phase 2: Add Program Data (Week 2)**

**2. Manual Data Entry for Top 10:**
- Pick 10 most popular facilities (Manhattan, Brooklyn)
- Visit school websites or call them
- Get: Program types, session times, pricing
- Create Program and Session documents

**Result:** 10 facilities with full data ✅

---

### **Phase 3: Expand Coverage (Week 3-4)**

**3. Add More Providers:**
- YMCA locations (from YMCA website)
- JCC locations (from JCC website)
- Private swim schools (Google search + manual)

**Result:** 30-50 facilities total ✅

---

### **Phase 4: Automate (Week 5+)**

**4. Build Scrapers or APIs:**
- NYC Parks API (if available)
- YMCA API integration
- Automated sync jobs

**Result:** 100+ facilities with auto-updates ✅

---

## 🚀 **Immediate Actions**

### **Action 1: Save Full Dataset**

Save the complete CSV to:
```
data/nyc-doe-pools-full.csv
```

**How many total rows do you have?**

---

### **Action 2: Geocode Addresses**

**Option A: Use NYC GeoClient (Free, Official)**

```bash
# Example for one address:
curl "https://api.nyc.gov/geo/geoclient/v2/address.json?houseNumber=1691&street=WEEKS%20AVENUE&borough=BRONX&app_id=YOUR_APP_ID&app_key=YOUR_APP_KEY"
```

**Sign up:** https://developer.cityofnewyork.us/

**Option B: Use Batch Geocoding Script**

I can create a script that:
1. Reads CSV
2. Calls NYC GeoClient API for each address
3. Adds lat/lng columns
4. Saves enriched CSV

---

### **Action 3: Create NYC DOE Data Adapter**

```bash
# Create adapter
src/adapters/nyc/nyc-doe-adapter.ts

# Register in factory
src/adapters/index.ts
```

**This replaces mock data with REAL NYC facilities!**

---

## 💡 **What This Unlocks**

**With this data + geocoding:**
- ✅ 24+ real NYC pool locations
- ✅ Accurate addresses and neighborhoods
- ✅ High data confidence (official NYC data)
- ✅ Distance calculations work (with lat/lng)
- ✅ Neighborhood filtering works

**Still need (manual for MVP):**
- ⏳ Program schedules (beginner, intermediate, etc.)
- ⏳ Session dates/times
- ⏳ Pricing ($150-400 typical)
- ⏳ Registration URLs
- ⏳ Availability (spots remaining)

---

## 🎯 **Recommendation**

**Week 1 (This Week):**
1. Geocode these 24 facilities (NYC GeoClient API)
2. Create NYC DOE Adapter
3. Load locations into Cosmos DB
4. **Result:** Real NYC facilities in your app!

**Week 2:**
1. Pick top 10 facilities (Manhattan + Brooklyn)
2. Manually research programs and schedules
3. Add Programs and Sessions
4. **Result:** 10 facilities with full data for demo!

**Week 3:**
1. Add YMCA data (5-10 locations)
2. Add JCC data (2-3 locations)
3. **Result:** 20-25 facilities total

**Week 4:**
1. Launch pilot with real users
2. Get feedback on coverage
3. Add more based on demand

---

## 📋 **Questions for You**

1. **How many total rows** do you have in this dataset?
   - Just these 24?
   - Or more?

2. **Do you have access to program/schedule data** from NYC DOE?
   - Or need to scrape/call schools?

3. **Want me to create:**
   - Geocoding script (NYC GeoClient API)?
   - NYC DOE adapter (parse this CSV)?
   - Data enrichment pipeline?

---

## 🎊 **This is GREAT Data!**

**You found:**
- ✅ Official NYC facility data
- ✅ Accurate addresses
- ✅ Neighborhood mappings (NTA codes)
- ✅ All boroughs covered

**This is exactly what you need to replace mock data with real NYC pools!**

**Want me to:**
1. Create geocoding script?
2. Build NYC DOE adapter?
3. Set up data pipeline to load this into Cosmos DB?

Let me know and I'll implement it! 🚀
