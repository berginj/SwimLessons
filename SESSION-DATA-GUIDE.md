# 🏊 Session Data Template - Add Swim Schedules

## ✅ **What I Created**

| File | Purpose | Lines |
|------|---------|-------|
| `data/sessions-template.csv` | Pre-filled template with 10 example sessions | 11 |
| `scripts/load-sessions.ts` | Script to load sessions from CSV | 200 |
| `SESSION-DATA-GUIDE.md` | This guide - how to use templates | - |

---

## 📋 **Template Overview**

**File:** `data/sessions-template.csv`

**Contains 10 example sessions** for the top 5 NYC facilities:

| Facility | Program | Days | Time | Price | Spots |
|----------|---------|------|------|-------|-------|
| **Brooklyn Tech** | Beginner | Mon/Wed/Fri | 5:00-6:00 PM | $75 | 12/20 |
| **Brooklyn Tech** | Intermediate | Tue/Thu | 4:30-5:30 PM | $85 | 3/15 |
| **Abraham Lincoln** | Weekend Beginner | Saturday | 9:00-10:00 AM | $90 | 10/25 |
| **Abraham Lincoln** | Advanced Youth | Saturday | 10:30-11:30 AM | $95 | 4/12 |
| **George Washington** | Morning Beginner | Mon/Wed/Fri | 8:00-9:00 AM | $70 | 15/20 |
| **George Washington** | Evening Intermediate | Tue/Thu | 6:00-7:00 PM | $80 | 8/18 |
| **Bayside HS** | Weekend Beginner | Sunday | 10:00-11:00 AM | $85 | 8/20 |
| **Bayside HS** | Weekday Intermediate | Mon/Wed/Fri | 4:00-5:00 PM | $90 | 6/15 |
| **Truman HS** | Summer Swim | Tue/Thu | 3:30-4:30 PM | $65 | 7/25 |
| **Truman HS** | Advanced Teen | Mon/Wed/Fri | 5:00-6:00 PM | $85 | 5/12 |

**These are EXAMPLES** - Edit with real data from school websites!

---

## 🎯 **How to Use**

### **Option 1: Use Template As-Is (Quick Demo)**

**Just load the example data:**

```powershell
cd scripts
npx tsx load-sessions.ts
```

**Result:**
- ✅ 10 sessions loaded
- ✅ 5 facilities have swim programs
- ✅ Ready to demo immediately
- ⚠️ Data is example (not real schedules)

---

### **Option 2: Research and Fill Real Data (Recommended)**

**Step 1: Research Each Facility**

**For each of the 5 facilities, find:**

**Brooklyn Tech H.S. (40425704):**
- Google: "Brooklyn Tech High School swim program"
- Or call: (718) 804-6400
- Or visit: https://www.bths.edu/

**What to find:**
- ✅ Summer 2026 swim program dates
- ✅ Days and times offered
- ✅ Price (or "free" for NYC residents)
- ✅ Registration URL
- ✅ How many spots available

**Repeat for:**
- Abraham Lincoln H.S. (40425705)
- George Washington H.S. (40425724)
- Bayside High School (40425700)
- Harry S. Truman H.S. (40425714)

---

**Step 2: Edit the CSV**

**Open:** `data/sessions-template.csv`

**Replace example data with real data:**

```csv
facility_id,program_name,skill_level,age_min_months,age_max_months,start_date,end_date,days_of_week,time_start,time_end,price,capacity,enrolled,registration_url,notes
40425704,Summer Swim 2026,beginner,48,84,2026-07-06,2026-08-14,"1,2,3,4,5",14:00,15:00,50,30,0,https://real-registration-url.com,Real schedule from website
```

**Fields explained:**
- `facility_id`: From nyc-pools-sample.csv (Permit_ID column)
- `program_name`: What the school calls it
- `skill_level`: beginner, intermediate, or advanced
- `age_min_months`: 48 = 4 years old, 84 = 7 years old
- `age_max_months`: 96 = 8 years, 168 = 14 years
- `start_date`: YYYY-MM-DD format
- `end_date`: YYYY-MM-DD format
- `days_of_week`: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
- `time_start`: HH:MM format (24-hour)
- `time_end`: HH:MM format
- `price`: Dollar amount (just number, no $)
- `capacity`: Total spots available
- `enrolled`: How many already signed up
- `registration_url`: Where to sign up
- `notes`: Any additional info

---

**Step 3: Load Sessions**

```powershell
cd scripts
npx tsx load-sessions.ts
```

**Or load custom CSV:**
```powershell
npx tsx load-sessions.ts ../data/my-custom-sessions.csv
```

---

### **Option 3: Add More Sessions (Expand Coverage)**

**Copy the template and add more:**

1. **Copy template:**
   ```powershell
   cp data/sessions-template.csv data/summer-2026-sessions.csv
   ```

2. **Add more rows** for:
   - More facilities (use other facility_ids from nyc-pools-sample.csv)
   - More time slots (morning, afternoon, evening)
   - More skill levels
   - More days (weekday, weekend, daily)

3. **Load:**
   ```powershell
   npx tsx load-sessions.ts ../data/summer-2026-sessions.csv
   ```

---

## 📝 **Template Fields Reference**

### **facility_id** (Required)
**Value:** Permit_ID from `nyc-pools-sample.csv`

**Examples:**
- `40425704` = Brooklyn Tech H.S.
- `40425705` = Abraham Lincoln H.S.
- `40425724` = George Washington H.S.

**Find it:**
```bash
# List all facility IDs
cat data/nyc-pools-sample.csv | cut -d',' -f2
```

---

### **skill_level** (Required)
**Values:** `beginner`, `intermediate`, `advanced`, `all`

**Guidelines:**
- **beginner:** Ages 4-7, learning to swim
- **intermediate:** Ages 7-12, improving strokes
- **advanced:** Ages 12-16, competitive prep

---

### **age_min_months / age_max_months** (Required)
**Convert years to months:**
- 2 years = 24 months
- 4 years = 48 months
- 6 years = 72 months
- 8 years = 96 months
- 10 years = 120 months
- 12 years = 144 months
- 14 years = 168 months

**Example:**
- Ages 5-8: `age_min_months=60, age_max_months=96`

---

### **days_of_week** (Required)
**Format:** Comma-separated numbers

**Day codes:**
- 0 = Sunday
- 1 = Monday
- 2 = Tuesday
- 3 = Wednesday
- 4 = Thursday
- 5 = Friday
- 6 = Saturday

**Examples:**
- Mon/Wed/Fri: `1,3,5`
- Tue/Thu: `2,4`
- Weekends: `0,6`
- Daily: `0,1,2,3,4,5,6`

---

### **time_start / time_end** (Required)
**Format:** HH:MM (24-hour time)

**Examples:**
- 8:00 AM = `08:00`
- 3:30 PM = `15:30`
- 5:00 PM = `17:00`
- 6:30 PM = `18:30`

---

### **price** (Required)
**Format:** Number only (no $)

**Typical NYC DOE Prices:**
- Free for NYC residents: `0`
- Subsidized: `25-50`
- Standard: `75-100`
- Premium: `150-200`

---

### **capacity / enrolled** (Optional)
**capacity:** Total spots in the class
**enrolled:** How many already signed up

**Script calculates:**
- `availableSpots = capacity - enrolled`
- `registrationOpen = availableSpots > 0`

**Example:**
- `capacity=20, enrolled=8` → 12 spots available

---

## 🚀 **Quick Start (Use Example Data)**

**To get started immediately with example data:**

```powershell
cd scripts
npx tsx load-sessions.ts
```

**This loads 10 example sessions** so you can:
- ✅ Test search functionality
- ✅ See how sessions appear in UI
- ✅ Demo to stakeholders
- ✅ Test booking flow

**Later:** Replace with real data from school websites.

---

## 📊 **What Gets Created**

**Each CSV row becomes a Session document:**

```json
{
  "id": "nyc-session-40425704-1",
  "cityId": "nyc",
  "type": "SessionDocument",
  "programId": "nyc-prog-40425704-beginner",
  "providerId": "nyc-provider-doe",
  "locationId": "nyc-loc-40425704",
  "startDate": "2026-06-15",
  "endDate": "2026-08-10",
  "daysOfWeek": [1, 3, 5],
  "timeOfDay": {
    "start": "17:00",
    "end": "18:00"
  },
  "price": {
    "amount": 75,
    "currency": "USD"
  },
  "capacity": 20,
  "enrolled": 8,
  "availableSpots": 12,
  "registrationOpen": true,
  "registrationUrl": "https://www.schools.nyc.gov/enrollment",
  "searchTerms": "beginner swim lessons nyc doe",
  "geographyIds": ["brooklyn"],
  "confidence": "medium",
  "sourceSystem": "csv-import"
}
```

---

## 🎯 **After Loading Sessions**

### **Search Will Work End-to-End:**

**User searches:**
- Age: 5 years old
- Days: Weekends
- Borough: Brooklyn

**Returns:**
- Weekend Beginner at Abraham Lincoln H.S.
- Saturday, 9:00-10:00 AM
- $90 for 8 weeks
- 10 spots available

**User clicks "Sign Up"** → Goes to registration URL ✅

---

## 📋 **Quick Reference**

### **Load Template Sessions:**
```powershell
npx tsx load-sessions.ts
```

### **Load Custom CSV:**
```powershell
npx tsx load-sessions.ts ../data/my-sessions.csv
```

### **Verify in Cosmos DB:**
```
Azure Portal → Cosmos DB → Data Explorer
Filter: type = "SessionDocument"
```

### **Test Search API:**
```powershell
curl -X POST https://func-swim-r5bmpt.azurewebsites.net/api/search -H "Content-Type: application/json" -d '{\"cityId\":\"nyc\",\"filters\":{\"skillLevel\":[\"beginner\"]}}'
```

---

## 🎊 **Summary**

**Created:**
- ✅ CSV template with 10 example sessions
- ✅ Loading script (load-sessions.ts)
- ✅ Complete field reference guide

**You can:**
- ✅ Load example data now (immediate demo)
- ✅ Research real schedules later (production data)
- ✅ Add more sessions anytime (expand coverage)

**Ready to load:**
```powershell
cd scripts
npx tsx load-sessions.ts
```

**Takes 1 minute, adds 10 searchable sessions!** 🏊

---

## 💡 **Recommendation**

**Load the template now** for immediate functionality:

```powershell
npx tsx load-sessions.ts
```

**Then this week:**
1. Research real schedules for 2-3 facilities
2. Update CSV with real data
3. Re-run script to update sessions
4. Launch pilot!

**Want to load the template sessions now?** ✅
