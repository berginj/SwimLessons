# 📊 Monitoring Guide - Cost & User Behavior

## Overview

This monitoring solution tracks TWO critical aspects:
1. **Azure Costs** - Real-time cost tracking and projections
2. **User Abandonment** - Where users drop off in the search-to-signup funnel

---

## 🎯 Key Abandonment Points to Monitor

### Critical Drop-Off Stages:

```
User Flow:           Typical Drop-Off Rate:
────────────────     ───────────────────────
1. Page Load         → 10-20% (bounce without searching)
2. Search Started    → 5-10% (no results returned)
3. Results Returned  → 30-40% (don't view any sessions)
4. Session Viewed    → 50-60% (view but don't click signup)
5. Signup Clicked    ✅ CONVERSION!
```

**Where to Focus:**
- **No Results (Stage 2)**: If >10% no-results rate, need more data coverage
- **Results → View (Stage 3)**: If <40% view rate, results aren't compelling
- **View → Signup (Stage 4)**: If <20% click rate, details aren't convincing

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `monitoring/application-insights-queries.kql` | 29 pre-built queries for costs & behavior |
| `monitoring/cost-calculator.ts` | Calculate projected costs for any MAU tier |
| `monitoring/dashboard-config.json` | Azure Portal dashboard template |
| `src/web/telemetry.js` | Frontend tracking library |
| `src/web/app-with-telemetry.js` | Integration guide for app.js |
| `monitoring/README.md` | This file - how to use monitoring |

---

## 🚀 Quick Start (3 Steps)

### Step 1: Run Cost Calculator

```bash
cd monitoring
npx tsx cost-calculator.ts
```

**Output:**
```
💰 Azure Cost Model - Swim Lessons Platform
================================================================================

📊 COST SUMMARY BY TIER
────────────────────────────────────────────────────────────────────────────────
Tier          MAU        Avg/Month    Peak/Month   Annual       $/User
────────────────────────────────────────────────────────────────────────────────
PILOT         100        $16-20       $25-30       $200-250     $0.1600
MVP           5,000      $18-25       $30-40       $250-350     $0.0036
SCALE         15,000     $30-40       $50-70       $400-550     $0.0020
```

---

### Step 2: Set Up Application Insights Queries

1. **Open Application Insights:**
   ```
   Azure Portal → Search "appi-swim-r5bmpt" → Logs
   ```

2. **Run Key Queries:**

   **User Funnel (Query #7):**
   ```kql
   let timeRange = 7d;
   let searches = customEvents | where name == "SearchStarted" ...
   // Copy from application-insights-queries.kql
   ```

   **No Results Rate (Query #9):**
   ```kql
   let totalSearches = customEvents | where name == "SearchStarted" ...
   // Copy from application-insights-queries.kql
   ```

   **Cost Per Day (Query #1):**
   ```kql
   customMetrics
   | where name == "cosmos_db_request_charge"
   | summarize TotalRUs = sum(value) by bin(timestamp, 1d)
   ...
   ```

3. **Save as Favorites:**
   - Click "Save" → "Save as function"
   - Name: "User Funnel", "Daily Costs", "Abandonment Points"
   - Quick access later

---

### Step 3: Deploy Dashboard

```bash
# Deploy Azure dashboard
az deployment group create \
  --resource-group pools-dev-rg \
  --template-file monitoring/dashboard-config.json \
  --parameters appInsightsResourceId="/subscriptions/.../appi-swim-r5bmpt"
```

**View Dashboard:**
Azure Portal → Dashboards → "Swim Lessons - Cost & User Behavior"

---

## 📊 Top 10 Queries to Run Weekly

### Cost Monitoring:

**1. Daily Cost Trend (Query #1)**
- Shows Cosmos DB costs over time
- **Action if:** Daily cost >$5 → Investigate expensive queries

**2. Cost Per Search (Query #2)**
- Average RUs consumed per search
- **Action if:** >120 RUs/search → Optimize queries

**3. Expensive Queries (Query #3)**
- Identifies queries using >100 RUs
- **Action:** Optimize or add caching

**4. Monthly Projection (Query #4)**
- Projects end-of-month cost
- **Action if:** Projected >$150 → Enable optimizations

**5. Cost Per Conversion (Query #28)**
- How much each signup costs
- **Target:** <$0.50 per signup

### User Behavior:

**6. Complete Funnel (Query #7)**
- Conversion at each stage
- **Targets:**
  - Search → Results: >95%
  - Results → View: >40%
  - View → Signup: >20%
  - Overall: >8%

**7. Abandonment Points (Query #15)**
- Where users drop off most
- **Action:** Fix highest abandonment stage first

**8. No Results Rate (Query #9)**
- % of searches with zero results
- **Target:** <10%
- **Action if >10%:** Add more session data

**9. Filter Usage (Query #12)**
- Which filters users actually use
- **Action:** Prioritize most-used filters in UI

**10. Session Click Position (Query #20)**
- If users click position 1-3: Good ranking
- If users click position 5+: Poor ranking
- **Target:** >60% click positions 1-5

---

## 🎯 Abandonment Analysis Framework

### How to Identify Abandonment Causes

**Run Query #15 (Abandonment Heatmap):**
```kql
customEvents
| where timestamp > ago(7d)
| where name in ("SearchStarted", "SearchResultsReturned", "SessionViewed", "SignupClicked")
| summarize Events = make_list(name) by session_Id
| extend LastEvent = Events[array_length(Events) - 1]
...
```

**Interpret Results:**

| Last Event | Abandonment Reason | Fix |
|------------|-------------------|-----|
| **SearchStarted** | API error or timeout | Fix API reliability |
| **SearchResultsReturned** | Results not compelling | Improve result ranking |
| **SessionViewed** | Details not convincing | Enhance session details |
| **NoResults** | No matching sessions | Add more data coverage |

---

### Abandonment Scenarios & Solutions

**Scenario 1: High No-Results Rate (>15%)**

**Symptoms:**
- Query #9 shows no-results rate >15%
- Query #21 shows common filter combos with zero results

**Root Cause:**
- Insufficient session coverage
- Specific neighborhoods/days not covered

**Solutions:**
1. Run Query #21 to identify gaps (e.g., "Brooklyn + Tuesday mornings")
2. Add more sessions for those filter combos
3. Partner with providers in underserved areas
4. Show "Notify me when available" for zero-result searches

---

**Scenario 2: Results Don't Lead to Views (Results → View <30%)**

**Symptoms:**
- Query #7 shows Results → View conversion <30%
- Users get results but don't click any

**Root Cause:**
- Results don't show enough info in cards
- Ranking is poor (irrelevant results on top)
- Too many results (overwhelming)

**Solutions:**
1. Run Query #20 (click position) - if users click position 8+, ranking is bad
2. Enhance session cards (show price, availability, location upfront)
3. Improve ranking weights (adjust city search profile)
4. Limit results to top 20 most relevant

---

**Scenario 3: Views Don't Lead to Signups (View → Signup <15%)**

**Symptoms:**
- Query #7 shows View → Signup <15%
- Users view many sessions but don't click signup

**Root Cause:**
- Session details missing key info
- Signup process unclear
- Price too high or availability too low

**Solutions:**
1. Run Query #10 (session view depth) - if >5 sessions viewed, they're searching hard
2. Enhance session details modal (add provider info, facility details)
3. Add "What to expect" before signup click-out
4. Show availability prominently ("Only 3 spots left!")

---

**Scenario 4: Geolocation Denial Causes Abandonment**

**Symptoms:**
- Query #16 shows high geolocation denial rate
- Users who deny location have high abandonment

**Root Cause:**
- Users don't trust location permission
- Neighborhood search is hard to find

**Solutions:**
1. Make neighborhood dropdown more prominent
2. Add messaging: "We never store your location"
3. Show benefits of location: "Find closest pools to you"
4. Allow search without location (just slower)

---

## 📈 Cost Monitoring Workflows

### Daily Check (2 minutes)

**Every morning:**
1. Run Query #1 (Daily Cost Trend)
2. Check: Is today's cost similar to yesterday?
3. If spike: Run Query #3 (Expensive Queries) to identify cause

**Alert if:**
- Daily cost >$5 (at pilot scale)
- Daily cost >$10 (at MVP scale)
- Daily cost >$20 (at full scale)

---

### Weekly Review (15 minutes)

**Every Monday:**
1. Run Query #4 (Monthly Projection)
   - Are we on track for budget?
   - Projected: $XX/month

2. Run Query #5 (Cost by Endpoint)
   - Which API is most expensive?

3. Run Query #28 (Cost Per Conversion)
   - Is cost per signup reasonable?
   - Target: <$0.50

**Actions:**
- If projected >$150: Enable caching
- If projected >$200: Urgent optimization needed

---

### Monthly Deep Dive (1 hour)

**First Monday of month:**
1. Review actual Azure bill
2. Compare to cost model projections
3. Identify variances >25%
4. Run all 29 queries for comprehensive view
5. Update cost model if needed
6. Plan optimizations for next month

---

## 🎯 Funnel Optimization Workflows

### Daily Metrics (5 minutes)

**Every day:**
1. Run Query #7 (User Funnel)
2. Check conversion rates:
   - Overall conversion rate (target: >8%)
   - No-results rate (target: <10%)

**Alert if:**
- Overall conversion <5%
- No-results rate >15%
- Results → View conversion <30%

---

### Weekly Behavior Analysis (30 minutes)

**Every week:**
1. **Query #12** - Filter Usage
   - What are users searching for?
   - Are we optimizing for the right filters?

2. **Query #15** - Abandonment Heatmap
   - Where are users dropping off?
   - Which stage has highest abandonment?

3. **Query #24** - Search Refinement
   - How many searches per session?
   - Target: 2-4 searches (not too many, not too few)

4. **Query #21** - Zero-Results Combos
   - Which filter combinations produce no results?
   - Add data for top 5 combos

**Actions:**
- If abandonment at Stage 3: Improve result cards
- If abandonment at Stage 4: Enhance session details
- If no-results is top issue: Add more data

---

## 🚨 Alerts to Configure

### Cost Alerts (Azure Cost Management)

**Budget: $200/month**

**Thresholds:**
- 50% ($100): Warning email
- 75% ($150): Daily email + review meeting
- 90% ($180): Urgent alert + implement optimizations
- 100% ($200): Critical alert + consider throttling

---

### Behavior Alerts (Application Insights)

**Create alerts for:**

1. **High No-Results Rate**
   ```kql
   let noResultsRate = customEvents
   | where name == "NoResults"
   | where timestamp > ago(1h)
   | summarize count() * 100.0 / toscalar(customEvents | where name == "SearchStarted" | where timestamp > ago(1h) | count());
   noResultsRate > 20 // Alert if >20% no results
   ```

2. **Drop in Conversion Rate**
   ```kql
   let conversionRate = customEvents
   | where timestamp > ago(1d)
   | summarize Signups = countif(name == "SignupClicked"), Searches = countif(name == "SearchStarted")
   | extend Rate = Signups * 100.0 / Searches;
   conversionRate < 5 // Alert if <5% conversion
   ```

3. **Error Spike**
   ```kql
   customEvents
   | where name == "Error"
   | where timestamp > ago(1h)
   | summarize count() > 10 // Alert if >10 errors/hour
   ```

---

## 📖 Query Reference Guide

### All 29 Queries Organized by Category:

**COST MONITORING (Queries 1-6):**
1. Daily Cosmos DB RU Consumption
2. Cost Per Search
3. Expensive Queries Identification
4. Monthly Cost Projection
5. Cost by API Endpoint
6. Peak vs Off-Peak Cost Analysis

**USER FUNNEL (Queries 7-9):**
7. Complete User Funnel (Search → View → Signup)
8. Abandonment Points Analysis
9. No Results Rate

**ENGAGEMENT (Queries 10-14):**
10. Session View Depth
11. Time to Signup
12. Filter Usage Patterns
13. Abandonment by No Results
14. Filter Refinement Patterns

**ABANDONMENT (Queries 15-17):**
15. Abandonment Heatmap
16. Geolocation Permission Denial Rate
17. Daily Active Users Trend

**SEARCH QUALITY (Queries 18-21):**
18. Search Success Rate
19. Most Popular Filter Combinations
20. Session Click Position Analysis
21. Zero-Results Filter Combinations

**USER JOURNEY (Queries 22-27):**
22. User Journey Duration
23. Immediate Bounce Rate
24. Search Refinement Journey
25. Top Abandonment Reasons
26. Relaxation Effectiveness
27. User Cohort Analysis

**ROI METRICS (Queries 28-29):**
28. Cost Per Conversion
29. ROI Dashboard

---

## 🛠️ Setup Instructions

### 1. Integrate Telemetry into Frontend

**File:** `src/web/app.js`

**Add at top:**
```javascript
import telemetry from './telemetry.js';
```

**Add tracking calls** (see `app-with-telemetry.js` for examples):
- `trackPageLoaded()` - On DOMContentLoaded
- `trackSearchStarted()` - When search form submits
- `trackSearchResultsReturned()` - After API returns
- `trackNoResults()` - If result count is 0
- `trackSessionViewed()` - When user clicks session card
- `trackSignupClicked()` - When "Sign Up" clicked
- `trackFilterChanged()` - When any filter changes

**Page abandonment** tracks automatically via `beforeunload`.

---

### 2. Deploy Monitoring Dashboard

```bash
# Get Application Insights resource ID
APP_INSIGHTS_ID=$(az monitor app-insights component show \
  --app appi-swim-r5bmpt \
  --resource-group pools-dev-rg \
  --query id -o tsv)

# Deploy dashboard
az deployment group create \
  --resource-group pools-dev-rg \
  --template-file monitoring/dashboard-config.json \
  --parameters appInsightsResourceId="$APP_INSIGHTS_ID"
```

**View:** Azure Portal → Dashboards → "Swim Lessons - Cost & User Behavior"

---

### 3. Set Up Cost Alerts

**Azure Portal:**
1. Go to "Cost Management + Billing"
2. Click "Budgets"
3. Click "Add"
4. Fill in:
   - Name: "Swim Lessons Monthly Budget"
   - Amount: $200
   - Reset period: Monthly
   - Scope: Resource group `pools-dev-rg`
5. Add alerts at 50%, 75%, 90%, 100%
6. Email: Your email
7. Create

---

## 📊 How to Use the Queries

### In Application Insights:

1. **Go to:**
   ```
   Azure Portal → appi-swim-r5bmpt → Logs
   ```

2. **Copy query** from `application-insights-queries.kql`

3. **Paste and run**

4. **Save as favorite** for quick access

5. **Pin to dashboard** for always-on monitoring

---

### Example: Track Daily Active Users

```kql
// Query #17: Daily Active Users
customEvents
| where timestamp > ago(30d)
| where name == "SearchStarted"
| summarize DAU = dcount(user_Id) by bin(timestamp, 1d)
| render timechart
```

**What you'll see:**
- Line chart of DAU over 30 days
- Peaks during registration windows
- Valleys during off-peak

**Use this to:**
- Validate peaky pattern (90% in 2-week windows)
- Forecast future costs (more DAU = more costs)
- Plan marketing campaigns

---

## 🎯 Funnel Optimization Process

### Weekly Funnel Review (Every Monday)

**1. Run Query #7 (Complete Funnel):**
```
Step1_Searches: 500
Step2_Results: 475
Step3_Views: 190
Step4_Signups: 38

Conv_SearchToResults: 95.0%  ✅ GOOD
Conv_ResultsToView: 40.0%    ✅ GOOD
Conv_ViewToSignup: 20.0%     ✅ GOOD
Overall_Conversion: 7.6%     ⚠️ BELOW TARGET (8%)
```

**2. Identify weakest stage:**
- In example above: Overall conversion is 7.6% (target: 8%)
- All stages are okay, but compound effect is below target

**3. Prioritize improvement:**
- Improve View → Signup from 20% to 25%
- This would boost overall to 9.5% ✅

**4. Implement fix:**
- Enhance session details modal
- Add "What to bring" section
- Show provider ratings (V1 feature)
- Clarify signup process

**5. Measure impact (next week):**
- Run Query #7 again
- Did View → Signup improve?

---

## 💡 Optimization Decision Tree

```
Is monthly cost > $100?
├─ NO → Monitor only (current setup is fine)
└─ YES → Is Cosmos DB >60% of total?
    ├─ YES → Implement caching (HTTP + client-side)
    │   └─ Cost reduced by 20-30%
    └─ NO → Is bandwidth exceeding 100GB?
        ├─ YES → Add CDN or reduce page size
        └─ NO → Check Function App execution costs

Is overall conversion < 8%?
├─ NO → Funnel is healthy (monitor)
└─ YES → Which stage is weakest?
    ├─ Search → Results (<95%): API reliability issue
    ├─ Results → View (<40%): Results not compelling
    ├─ View → Signup (<20%): Details not convincing
    └─ No Results (>10%): Coverage gaps
```

---

## 📋 Monthly Monitoring Checklist

**Week 1:**
- [ ] Run Query #7 (User Funnel) - Check conversion rates
- [ ] Run Query #1 (Daily Costs) - Is cost trending normal?
- [ ] Run Query #17 (DAU) - Are users growing?

**Week 2:**
- [ ] Run Query #15 (Abandonment) - Where are users dropping?
- [ ] Run Query #21 (No-Results Combos) - What coverage gaps exist?
- [ ] Run Query #12 (Filter Usage) - What are users searching for?

**Week 3:**
- [ ] Run Query #4 (Monthly Projection) - Will we hit budget?
- [ ] Run Query #28 (Cost Per Signup) - Is it reasonable?
- [ ] Run Query #20 (Click Position) - Is ranking good?

**Week 4:**
- [ ] Run Query #27 (Cohort Analysis) - Are users returning?
- [ ] Run Query #24 (Search Refinement) - How many searches per user?
- [ ] Generate monthly report (actual vs projected costs)

**Month End:**
- [ ] Compare Azure bill to projections
- [ ] Update cost model if variance >25%
- [ ] Plan optimizations if needed
- [ ] Review funnel metrics (did we hit 8% conversion?)

---

## 🎯 Success Metrics Dashboard

### What to Track:

**Costs:**
- ✅ Monthly total <$200
- ✅ Cost per user <$0.01 at scale
- ✅ Cost per signup <$0.50

**Funnel:**
- ✅ Overall conversion >8%
- ✅ No-results rate <10%
- ✅ Results → View >40%
- ✅ View → Signup >20%

**Engagement:**
- ✅ DAU growing week-over-week
- ✅ Avg searches per user: 2-4
- ✅ Return user rate >20%

**Performance:**
- ✅ Search latency p95 <500ms
- ✅ Error rate <1%
- ✅ API uptime >99.5%

---

## 📝 How to Generate Monthly Report

**Run cost-calculator.ts:**
```bash
npx tsx monitoring/cost-calculator.ts > monthly-cost-report.txt
```

**Combine with actual Azure costs:**
```bash
# Get actual costs
az consumption usage list \
  --start-date "2026-03-01" \
  --end-date "2026-03-31" \
  --output table > actual-costs.txt
```

**Compare:**
- Projected (from calculator): $27-37
- Actual (from Azure): $XX
- Variance: XX%

**If variance >25%:**
- Investigate which service is off
- Update cost model assumptions
- Check for unexpected usage patterns

---

## 🚨 Critical Alerts Configuration

**Set up these alerts in Application Insights:**

**Alert 1: Cost Spike**
```kql
customMetrics
| where name == "cosmos_db_request_charge"
| where timestamp > ago(1h)
| summarize HourlyRUs = sum(value)
| where HourlyRUs > 50000 // Alert if >50K RUs/hour
```

**Alert 2: Conversion Drop**
```kql
let conversionRate = customEvents
| where timestamp > ago(1d)
| summarize Signups = countif(name == "SignupClicked"),
            Searches = countif(name == "SearchStarted")
| extend Rate = Signups * 100.0 / Searches;
conversionRate < 5 // Alert if <5%
```

**Alert 3: Error Spike**
```kql
customEvents
| where name == "Error"
| where timestamp > ago(15m)
| summarize count() > 5 // Alert if >5 errors in 15 min
```

**Alert 4: No Results Spike**
```kql
let noResultsRate = customEvents
| where timestamp > ago(1h)
| summarize NoResults = countif(name == "NoResults"),
            Searches = countif(name == "SearchStarted")
| extend Rate = NoResults * 100.0 / Searches;
noResultsRate > 20 // Alert if >20% no results
```

---

## 📚 Quick Reference

**Run cost calculator:**
```bash
npx tsx monitoring/cost-calculator.ts
```

**Check current costs:**
```bash
az consumption usage list --start-date 2026-03-01 --end-date 2026-03-31 --output table
```

**Open Application Insights:**
```
Azure Portal → appi-swim-r5bmpt → Logs
```

**All queries:**
```
monitoring/application-insights-queries.kql (29 queries)
```

**Deploy dashboard:**
```bash
az deployment group create --resource-group pools-dev-rg --template-file monitoring/dashboard-config.json
```

---

## 🎉 Summary

**You now have:**
- ✅ 29 pre-built Application Insights queries
- ✅ Cost calculator for any MAU tier
- ✅ Azure Portal dashboard template
- ✅ Frontend telemetry library
- ✅ Complete monitoring documentation

**This tracks:**
- ✅ Real-time Azure costs (Cosmos DB, Functions, etc.)
- ✅ Cost projections and trends
- ✅ User funnel conversion rates
- ✅ Abandonment points (where users leave)
- ✅ Search quality metrics
- ✅ Coverage gaps (no-results analysis)
- ✅ User engagement patterns

**Use this to:**
- Stay under $200/month budget
- Optimize costs proactively
- Identify and fix abandonment causes
- Improve conversion rates
- Plan capacity for peak periods

---

**Next: Integrate telemetry.js into app.js and start tracking!** 🚀
