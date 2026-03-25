# 🚇 MTA Integration Guide - Real Transit Time Routing

## 📊 **Current State Analysis**

**What's Already Built:**
- ✅ `TransitService` interface defined (src/services/transit/transit-service.ts)
- ✅ Transit helper functions (src/functions/search-api/transit-helpers.ts)
- ✅ Frontend displays transit time (src/web/app.js)
- ✅ Environment var: `TRANSIT_ROUTER_GRAPHQL_URL` (placeholder)

**Current Implementation:**
- ⚠️ Uses **fallback mode** (haversine distance + mode-specific speeds)
- ⚠️ No real MTA API integration yet
- ⚠️ Estimates based on: subway=20mph, bus=12mph, walking=3mph

**Accuracy:**
- Fallback: ±5-10 minutes (approximate)
- With MTA: ±2-3 minutes (real-time)

---

## 🎯 **MTA API Options**

### **Option 1: MTA Real-Time Data Feeds (Official, Free)**

**What it provides:**
- Real-time subway arrival times
- Service alerts and delays
- Static GTFS schedule data
- Bus locations

**Pros:**
- ✅ Official MTA data
- ✅ Free (no cost)
- ✅ Real-time updates
- ✅ Comprehensive coverage

**Cons:**
- ❌ Complex to use (GTFS format, protobuf)
- ❌ No routing engine (just raw data)
- ❌ You have to calculate routes yourself
- ❌ Requires significant development (2-3 weeks)

**API Docs:** https://api.mta.info/

**Not recommended for MVP** - too complex

---

### **Option 2: Google Maps Directions API (Best for MVP)**

**What it provides:**
- Door-to-door routing
- Transit directions (subway, bus, walk)
- Real-time traffic and delays
- Multiple route options
- Walking directions

**Pros:**
- ✅ Easy to integrate (1-2 days)
- ✅ Handles all complexity (routing, transfers, delays)
- ✅ Includes MTA data automatically
- ✅ Works globally (not just NYC)
- ✅ Well-documented

**Cons:**
- ❌ Costs money ($5 per 1,000 requests)
- ❌ Requires Google Cloud account
- ❌ API key management

**Pricing:**
- Directions API: $5 per 1,000 requests
- At 5K MAU: ~15K requests/month = $75/month
- At 15K MAU: ~45K requests/month = $225/month

**Cost optimization:**
- Only calculate for top 10 results (already implemented!)
- Cache results for 5 minutes
- Fallback to distance if API fails

**API Docs:** https://developers.google.com/maps/documentation/directions/

**Recommended for production** - easiest and most reliable

---

### **Option 3: Mapbox Directions API (Good Alternative)**

**What it provides:**
- Transit routing
- Walking, cycling, driving
- Real-time traffic

**Pros:**
- ✅ Cheaper than Google ($0.40 per 1,000 requests)
- ✅ Good documentation
- ✅ Modern API

**Cons:**
- ❌ Transit coverage not as good as Google in NYC
- ❌ May not include all MTA routes

**Pricing:**
- $0.40 per 1,000 requests
- At 15K MAU: ~45K requests/month = $18/month

**API Docs:** https://docs.mapbox.com/api/navigation/directions/

**Recommended if budget is tight**

---

### **Option 4: Transit Router (Open Source - Complex)**

**What it is:**
- Open-source transit routing engine
- Uses GTFS feeds (including MTA)
- Self-hosted or cloud-hosted

**Examples:**
- OpenTripPlanner (Java)
- Valhalla (C++)
- OSRM (C++)

**Pros:**
- ✅ No per-request costs
- ✅ Full control
- ✅ Can customize routing

**Cons:**
- ❌ Complex setup (1-2 weeks)
- ❌ Need to host/maintain server ($20-50/month)
- ❌ Need to update GTFS feeds regularly
- ❌ Requires DevOps expertise

**Not recommended for MVP** - too much work

---

### **Option 5: Citymapper API (Premium)**

**What it provides:**
- Best-in-class transit routing
- MTA + all NYC transit
- Real-time arrival predictions
- Door-to-door with transfers

**Pros:**
- ✅ Best UX (Citymapper is gold standard)
- ✅ Accurate NYC routing
- ✅ Real-time updates

**Cons:**
- ❌ Enterprise pricing (need to contact sales)
- ❌ Likely expensive ($500+/month)
- ❌ May have minimum commitment

**Only if budget increases significantly**

---

## 💡 **RECOMMENDATION: Google Maps Directions API**

**Why:**
1. **Easy integration** - 1-2 days of work
2. **Reliable** - Battle-tested by billions of users
3. **Comprehensive** - Includes MTA automatically
4. **Cost-effective** - With optimizations, ~$50-75/month at 5K MAU

**Cost optimization strategies:**
- ✅ Only calculate for top 10 results (already implemented!)
- ✅ Cache results for 5 minutes (reduce API calls)
- ✅ Fallback to distance if API fails
- ✅ Skip transit if user within 1 mile (walking only)

**Optimized cost at 5K MAU:** ~$30-40/month (not $75)

---

## 🚀 **Implementation Plan - Google Maps Integration**

### **Phase 1: Setup (30 minutes)**

**1. Get Google Maps API Key:**
- Go to: https://console.cloud.google.com/
- Enable: Directions API
- Create API key
- Restrict to your domain

**2. Add to environment:**
```bash
# Add to .env (gitignored)
GOOGLE_MAPS_API_KEY=your_api_key_here
```

**3. Add to Function App settings:**
```bash
az functionapp config appsettings set \
  --name func-swim-r5bmpt \
  --resource-group pools-dev-rg \
  --settings GOOGLE_MAPS_API_KEY=your_api_key_here
```

---

### **Phase 2: Update TransitService (1-2 hours)**

**File:** `src/services/transit/transit-service.ts`

**Add Google Maps integration:**

```typescript
class TransitService implements ITransitService {
  private googleMapsApiKey: string;

  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  }

  async estimateTransitTime(
    origin: Coordinates,
    destination: Coordinates,
    mode: TransitMode,
    cityId: string,
    departureTime?: Date
  ): Promise<TransitEstimate | null> {
    // If Google Maps available, use it
    if (this.googleMapsApiKey && cityId === 'nyc') {
      return this.googleMapsEstimate(origin, destination, mode, departureTime);
    }

    // Otherwise fallback to distance-based
    return this.fallbackEstimate(origin, destination, mode);
  }

  private async googleMapsEstimate(
    origin: Coordinates,
    destination: Coordinates,
    mode: TransitMode,
    departureTime?: Date
  ): Promise<TransitEstimate | null> {
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');

    url.searchParams.set('origin', `${origin.latitude},${origin.longitude}`);
    url.searchParams.set('destination', `${destination.latitude},${destination.longitude}`);

    // Map our mode to Google's mode
    const googleMode = this.mapToGoogleMode(mode.mode);
    url.searchParams.set('mode', googleMode);

    // If transit, request departure time
    if (googleMode === 'transit' && departureTime) {
      url.searchParams.set('departure_time', Math.floor(departureTime.getTime() / 1000).toString());
    }

    url.searchParams.set('key', this.googleMapsApiKey);

    try {
      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status !== 'OK' || !data.routes?.[0]) {
        console.warn('Google Maps routing failed:', data.status);
        return this.fallbackEstimate(origin, destination, mode);
      }

      const route = data.routes[0];
      const leg = route.legs[0];

      return {
        durationMinutes: Math.ceil(leg.duration.value / 60),
        distance: leg.distance.value / 1609.34, // meters to miles
        mode: mode.mode,
        confidence: 'realtime',
        calculatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Google Maps API error:', error);
      return this.fallbackEstimate(origin, destination, mode);
    }
  }

  private mapToGoogleMode(mode: string): string {
    const modeMap: Record<string, string> = {
      'subway': 'transit',
      'bus': 'transit',
      'rail': 'transit',
      'walking': 'walking',
      'biking': 'bicycling',
      'driving': 'driving',
    };
    return modeMap[mode] || 'transit';
  }

  private fallbackEstimate(
    origin: Coordinates,
    destination: Coordinates,
    mode: TransitMode
  ): TransitEstimate {
    // Existing fallback logic
    const distance = this.calculateDistance(origin, destination);
    const speed = this.getModeSpeed(mode.mode);
    const durationMinutes = Math.ceil((distance / speed) * 60);

    return {
      durationMinutes,
      distance,
      mode: mode.mode,
      confidence: 'estimated',
      calculatedAt: new Date().toISOString(),
    };
  }
}
```

---

### **Phase 3: Add Caching Layer (1 hour)**

**Reduce API costs by 60-80%:**

```typescript
interface CachedRoute {
  estimate: TransitEstimate;
  cachedAt: number;
}

class TransitService {
  private cache = new Map<string, CachedRoute>();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  async estimateTransitTime(...): Promise<TransitEstimate | null> {
    const cacheKey = this.getCacheKey(origin, destination, mode, departureTime);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
      return cached.estimate;
    }

    // Call API
    const estimate = await this.googleMapsEstimate(...);

    // Cache result
    if (estimate) {
      this.cache.set(cacheKey, {
        estimate,
        cachedAt: Date.now(),
      });
    }

    return estimate;
  }

  private getCacheKey(origin, destination, mode, departureTime): string {
    const originKey = `${origin.latitude.toFixed(3)},${origin.longitude.toFixed(3)}`;
    const destKey = `${destination.latitude.toFixed(3)},${destination.longitude.toFixed(3)}`;
    const timeKey = departureTime ? departureTime.toISOString().substring(0, 16) : 'now';
    return `${originKey}-${destKey}-${mode.mode}-${timeKey}`;
  }
}
```

**With caching:**
- Same origin/destination within 5 minutes → Cached (free)
- Different routes → New API call
- **Reduces cost by 60-80%!**

---

### **Phase 4: Update Frontend to Show Transit Details (30 min)**

**File:** `src/web/app.js`

**Already shows basic transit time:**
```javascript
🚇 15 min
```

**Enhance to show:**
```javascript
🚇 15 min via 2 train
📍 Transfer at Times Square
⏰ Departs every 8 minutes
```

**Parse Google Maps response:**
```javascript
const transitDetails = data.routes[0].legs[0].steps
  .filter(step => step.transit_details)
  .map(step => ({
    line: step.transit_details.line.short_name, // "2"
    departure: step.transit_details.departure_stop.name,
    arrival: step.transit_details.arrival_stop.name,
  }));
```

---

## 💰 **Cost Analysis**

### **With Google Maps Directions API:**

**Assumptions:**
- 5K MAU
- 3 searches per user = 15K searches/month
- Top 10 results get transit estimate = 150K API calls/month
- With 70% cache hit rate = 45K actual API calls

**Cost:**
- API calls: 45K × $5 / 1,000 = **$225/month**
- **Over budget!** ❌

---

### **With Optimizations:**

**1. Only Top 5 Results** (not 10)
- Reduces to 75K potential calls
- With cache: 22.5K actual calls
- Cost: **$112/month**

**2. Add Client-Side Caching**
- User searches same area multiple times
- Cache in browser for 15 minutes
- Reduces to ~15K API calls
- Cost: **$75/month**

**3. Skip Transit for Walking Distance**
- If distance < 1 mile, skip transit (just show walking)
- Reduces to ~10K API calls
- Cost: **$50/month**

**4. Use Mapbox Instead**
- $0.40 per 1,000 vs $5
- Same 10K calls = **$4/month**
- But less accurate transit in NYC

---

## 🎯 **RECOMMENDATION: Phased Approach**

### **MVP (Now): Fallback Only**

**Current implementation:**
- ✅ Already works
- ✅ Zero cost
- ✅ Good enough for pilot (100 users)
- ⚠️ Approximate (±5-10 min accuracy)

**Keep this for MVP launch.**

---

### **V1 (Month 2): Add Google Maps for Premium Users**

**Hybrid approach:**
- Default: Fallback estimates (free)
- Optional: "Get exact transit time" button
- User clicks → Calls Google Maps API
- Only charges when user explicitly requests

**Cost:**
- Only ~20% of users click "exact time"
- 15K searches × 20% = 3K API calls
- Cost: **$15/month** ✅

---

### **V2 (Month 3-4): Full Integration with Optimization**

**When you have budget ($200-300/month):**
- Enable Google Maps for all results
- Implement all caching optimizations
- Show detailed transit instructions
- Real-time arrival predictions

**Cost with optimizations:** $50-75/month

---

## 🔧 **Quick Implementation (Google Maps)**

### **Step 1: Get API Key (10 min)**

1. Go to: https://console.cloud.google.com/
2. Create project: "SwimLessons"
3. Enable API: "Directions API"
4. Create credentials → API key
5. Restrict key:
   - Application restrictions: HTTP referrers
   - API restrictions: Directions API only
   - Allowed referrers: `*.azurestaticapps.net/*`

---

### **Step 2: Add to Environment (5 min)**

```bash
# Add to .env (local)
echo "GOOGLE_MAPS_API_KEY=your_api_key_here" >> .env

# Add to Azure Function App
az functionapp config appsettings set \
  --name func-swim-r5bmpt \
  --resource-group pools-dev-rg \
  --settings GOOGLE_MAPS_API_KEY=your_api_key_here
```

---

### **Step 3: Update TransitService (1 hour)**

**I can create the implementation for you:**

**File:** `src/services/transit/google-maps-transit.ts`

```typescript
export class GoogleMapsTransitService {
  async getDirections(
    origin: Coordinates,
    destination: Coordinates,
    departureTime: Date
  ): Promise<TransitEstimate> {
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');

    url.searchParams.set('origin', `${origin.latitude},${origin.longitude}`);
    url.searchParams.set('destination', `${destination.latitude},${destination.longitude}`);
    url.searchParams.set('mode', 'transit');
    url.searchParams.set('departure_time', Math.floor(departureTime.getTime() / 1000).toString());
    url.searchParams.set('key', process.env.GOOGLE_MAPS_API_KEY!);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${data.status}`);
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    return {
      durationMinutes: Math.ceil(leg.duration.value / 60),
      distance: leg.distance.value / 1609.34,
      mode: 'subway', // Parse from transit_details
      confidence: 'realtime',
      calculatedAt: new Date().toISOString(),
    };
  }
}
```

---

### **Step 4: Test Integration (15 min)**

```bash
# Test API call directly
curl "https://maps.googleapis.com/maps/api/directions/json?origin=40.7580,-73.9855&destination=40.7489,-73.9680&mode=transit&key=YOUR_KEY"
```

**Should return:**
- Duration in seconds
- Distance in meters
- Transit steps (subway lines, transfers)
- Departure/arrival times

---

## 📊 **Cost Comparison Summary**

| Solution | Cost/Month (5K MAU) | Accuracy | Complexity | Recommended? |
|----------|---------------------|----------|------------|--------------|
| **Fallback (current)** | $0 | ±10 min | Simple | ✅ MVP |
| **Google Maps** | $50-75 (optimized) | ±2 min | Easy | ✅ V1 |
| **Mapbox** | $18 | ±5 min | Easy | ⚠️ If budget tight |
| **MTA Direct** | $0 | ±3 min | Very hard | ❌ Too complex |
| **Open Source Router** | $30 (hosting) | ±3 min | Hard | ❌ Overkill |
| **Citymapper** | $500+ | ±1 min | Easy | ❌ Too expensive |

---

## 🎯 **Phased Rollout Strategy**

### **Week 1-4 (MVP - NOW):**
- ✅ Use fallback estimates
- ✅ Zero cost
- ✅ Launch pilot with 100 users
- ✅ Gather feedback on accuracy needs

**User sees:** "~15 min by subway" (approximate)

---

### **Week 5-8 (V1):**
- Add Google Maps API
- Hybrid mode: "Get exact time" button
- Only calculate when user clicks
- Cost: ~$15/month

**User sees:** "~15 min by subway" + button to get exact time

---

### **Month 3+ (V2):**
- Enable for all searches (with caching)
- Show transit details (line numbers, transfers)
- Real-time arrival predictions
- Cost: ~$50-75/month (optimized)

**User sees:** "15 min via 2 train, departs every 8 min"

---

## 🚨 **MTA-Specific Gotchas**

### **Why MTA Direct API is Hard:**

**1. GTFS Format is Complex:**
- Need to parse protobuf files
- Build routing graph
- Calculate shortest path
- Handle service changes

**2. Real-Time Updates:**
- Need to merge static GTFS + real-time feeds
- Handle delays and service alerts
- Update every 30 seconds

**3. Transfer Logic:**
- Calculate walk time between stations
- Handle multiple route options
- Optimize for time vs transfers

**Effort:** 2-3 weeks of full-time development

**Google Maps does ALL of this for you!**

---

## 💡 **MY STRONG RECOMMENDATION**

### **For Your Use Case:**

**MVP (Now):**
- ✅ Keep fallback estimates
- ✅ Zero cost
- ✅ Good enough for pilot

**After Pilot Feedback (Month 2):**
- ✅ Add Google Maps if users request accuracy
- ✅ Implement caching to control costs
- ✅ Target: $30-50/month transit costs

**Don't Build:**
- ❌ Custom MTA integration (too complex)
- ❌ Self-hosted routing engine (overkill)

---

## 🎯 **Immediate Action (Optional)**

**Want me to:**

**1. Create Google Maps integration?** (1-2 hours)
- Complete implementation
- With caching
- Cost-optimized
- Ready to deploy

**2. Create "exact transit" feature?** (30 min)
- Button on frontend
- On-demand API call
- Only charges when clicked

**3. Document MTA integration for V2?** (30 min)
- Future roadmap
- Technical specs
- Cost projections

**Or:**

**4. Wait until after pilot?** ✅ **Recommended!**
- Launch with fallback
- See if users complain about accuracy
- Add Google Maps only if needed

---

## 📋 **Quick Decision Matrix**

**Users don't complain about transit accuracy?**
→ Keep fallback (save $50-75/month) ✅

**Users say "times are wrong"?**
→ Add Google Maps with caching ($30-50/month)

**Users demand real-time arrivals?**
→ Add Google Maps with full details ($50-75/month)

---

**What do you think? Add Google Maps now, or wait for user feedback?** 🚇