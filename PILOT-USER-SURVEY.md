# 📋 Pilot User Feedback Survey

## 🎯 **Purpose**

Gather feedback from your first 20-30 pilot users to:
1. Measure satisfaction and usability
2. Identify critical issues before public launch
3. **Decide if Google Maps transit is worth $40-50/month**
4. Find coverage gaps (missing sessions/facilities)
5. Prioritize V1 features

---

## 📱 **Survey Questions (10 minutes to complete)**

### **Section 1: Background (2 questions)**

**Q1. How did you hear about this platform?**
- [ ] Friend/family
- [ ] Social media
- [ ] Parent group/forum
- [ ] School email
- [ ] Other: ___________

**Q2. How many kids do you have who might take swim lessons?**
- [ ] 1 child
- [ ] 2 children
- [ ] 3+ children

---

### **Section 2: Search Experience (5 questions)**

**Q3. How easy was it to find swim lessons that fit your needs?**
- [ ] Very easy (1-2 searches, found immediately)
- [ ] Easy (2-3 searches, found what I needed)
- [ ] Moderate (4-5 searches, eventually found something)
- [ ] Difficult (5+ searches, struggled to find)
- [ ] Very difficult (gave up, didn't find anything)

**Q4. Which filters did you use? (Check all that apply)**
- [ ] Child's age
- [ ] Days of week
- [ ] Borough/neighborhood
- [ ] Time of day
- [ ] Max price
- [ ] None (just browsed all)

**Q5. Did you find sessions that matched your search?**
- [ ] Yes, found several good matches (3+)
- [ ] Yes, found 1-2 matches
- [ ] Found some but not ideal
- [ ] No matches found (got "no results")

**Q6. If you got "no results," what were you searching for?**
_Open text:_
- Child age: _____
- Days wanted: _____
- Borough: _____
- Time: _____

**Q7. How important is the estimated travel time shown for each session?**
- [ ] 5 - Very important (wouldn't use platform without it)
- [ ] 4 - Important (nice to have, use it often)
- [ ] 3 - Somewhat important (glance at it sometimes)
- [ ] 2 - Not very important (rarely look at it)
- [ ] 1 - Not important (don't care about travel time)

**Q7a. If travel time is important, how accurate does it need to be?**
- [ ] Exact (within 2-3 minutes) - *Would require $40-50/month transit API*
- [ ] Approximate (within 5-10 minutes) - *Current free estimate*
- [ ] General idea (within 15 minutes) - *Current is fine*

---

### **Section 3: Session Details (3 questions)**

**Q8. Did the session details page have enough information to make a decision?**
- [ ] Yes, had everything I needed
- [ ] Mostly, but missing some info (specify below)
- [ ] No, needed more information

**Q8a. What information was missing?**
- [ ] Instructor qualifications
- [ ] Class size (how many kids)
- [ ] What to bring
- [ ] Facility photos
- [ ] Reviews/ratings
- [ ] Other: ___________

**Q9. Did you click "Go to provider signup" for any session?**
- [ ] Yes, signed up for a session ✅ (CONVERSION!)
- [ ] Yes, but didn't complete signup (why: _______)
- [ ] No, just browsing
- [ ] No, sessions didn't fit my needs

**Q10. If you signed up, was the provider's registration process easy?**
- [ ] Very easy
- [ ] Easy
- [ ] Moderate
- [ ] Difficult
- [ ] Very difficult
- [ ] N/A (didn't sign up)

---

### **Section 4: Mobile Experience (2 questions)**

**Q11. What device did you primarily use?**
- [ ] iPhone
- [ ] Android phone
- [ ] iPad/tablet
- [ ] Laptop
- [ ] Desktop computer

**Q12. How was the mobile experience? (If you used phone/tablet)**
- [ ] Excellent (smooth, easy to use)
- [ ] Good (worked well, minor issues)
- [ ] Fair (usable but frustrating)
- [ ] Poor (hard to use on mobile)
- [ ] N/A (used desktop only)

---

### **Section 5: Overall Satisfaction (4 questions)**

**Q13. How likely are you to use this platform again?**
- [ ] 5 - Definitely (will use every season)
- [ ] 4 - Probably (would consider)
- [ ] 3 - Maybe (depends)
- [ ] 2 - Probably not
- [ ] 1 - Definitely not

**Q14. How likely are you to recommend this to other parents?**
- [ ] 10-9 - Extremely likely (Promoter)
- [ ] 8-7 - Likely
- [ ] 6-5 - Neutral
- [ ] 4-3 - Unlikely
- [ ] 2-0 - Extremely unlikely (Detractor)

*This is your Net Promoter Score (NPS) - Target: >30*

**Q15. What did you like most about the platform?**
_Open text:_

**Q16. What frustrated you or needs improvement?**
_Open text:_

---

### **Section 6: Feature Priorities (1 question)**

**Q17. Which features would make you use this more? (Rank top 3)**

Rank 1-3 (1=most important):
- [ ] ___ More facilities/locations (expand coverage)
- [ ] ___ More session times (more options per facility)
- [ ] ___ Exact transit times (real MTA predictions) *Costs $40-50/month*
- [ ] ___ Map view (see pools on a map)
- [ ] ___ Save favorite sessions
- [ ] ___ Email alerts (when new sessions added)
- [ ] ___ Reviews/ratings from other parents
- [ ] ___ Filter by instructor qualifications
- [ ] ___ Show facility photos
- [ ] ___ Native mobile app (iOS/Android)
- [ ] Other: ___________

---

### **Section 7: Demographics (Optional - 2 questions)**

**Q18. What NYC borough do you live in?**
- [ ] Manhattan
- [ ] Brooklyn
- [ ] Queens
- [ ] Bronx
- [ ] Staten Island
- [ ] Outside NYC

**Q19. Child's age range (for swim lessons)?**
- [ ] Under 3 years
- [ ] 3-5 years
- [ ] 6-8 years
- [ ] 9-12 years
- [ ] 13+ years

---

## 🎯 **How to Use This Survey**

### **Option 1: Google Forms (Easiest)**

**1. Create Google Form:**
- Go to: https://forms.google.com
- New form → Copy questions above
- Set up multiple choice, rating scales, text fields

**2. Share link with pilot users:**
```
Thanks for testing the swim lesson platform!
Please share your feedback: [Google Form Link]
Takes 5 minutes. Your input helps us improve!
```

**3. Analyze responses:**
- Export to spreadsheet
- Calculate NPS (Q14)
- Check transit importance (Q7)

---

### **Option 2: Typeform (Professional)**

**1. Create at:** https://typeform.com
- More polished UI
- Better mobile experience
- Free tier: 100 responses

**2. Same questions, better design**

---

### **Option 3: In-App Survey (Future)**

**Add to frontend after pilot:**
```javascript
// Show survey modal after signup click
if (userJustSignedUp) {
  showSurveyModal();
}
```

---

## 📊 **Key Metrics to Track**

### **From Survey Responses:**

**1. Conversion Rate:**
- % who clicked "Go to provider signup" (Q9)
- Target: >30% for pilot
- Compare to telemetry data

**2. Net Promoter Score (NPS):**
- From Q14
- Formula: % Promoters (9-10) - % Detractors (0-6)
- Target: >30 for MVP
- >50 for product-market fit

**3. Transit Importance:**
- From Q7 and Q7a
- If average >4 AND want exact → Enable Google Maps
- If average <4 OR approximate is fine → Keep fallback

**4. Search Success:**
- From Q5
- % who found matches
- Target: >80%
- If <80% → Coverage gaps, add more sessions

**5. Feature Priority:**
- From Q17
- Top 3 ranked features = V1 roadmap
- If "Exact transit" in top 3 → Enable Google Maps

---

## 🎯 **Decision Matrix**

### **Should You Enable Google Maps?**

**YES if:**
- ✅ Q7 average score >4 (transit is important)
- ✅ Q7a: Majority want "exact within 2-3 min"
- ✅ Q17: "Exact transit times" ranked in top 3
- ✅ Budget allows $40-50/month extra

**NO if:**
- ❌ Q7 average score <4 (transit not critical)
- ❌ Q7a: "Approximate" is fine
- ❌ Q17: Other features ranked higher
- ❌ Want to minimize costs

**Most likely:** Users care more about "is there a class?" than "exactly 13 vs 15 minutes"

---

## 📋 **Pilot User Recruitment**

### **Who to Recruit:**

**Target:** 20-30 NYC parents with kids ages 3-12

**Where to find:**
- Friends and family
- Coworkers with kids
- Parent Facebook groups
- School email lists
- Nextdoor app
- Local parenting forums

**Message:**
```
Hi! I built a platform to help NYC parents find swim lessons.
Would you test it and give feedback?
Takes 10 min: [Platform URL]
Then 5-min survey: [Google Form Link]

Thanks! 🏊
```

---

## 🎊 **Summary**

**Created:**
- ✅ Complete pilot user survey (19 questions)
- ✅ Google Forms ready to copy
- ✅ Key metrics to track
- ✅ Decision framework for Google Maps
- ✅ NPS and satisfaction measures

**Critical Questions:**
- Q7: Transit importance (decides Google Maps)
- Q14: NPS (product-market fit)
- Q5: Search success (coverage quality)
- Q17: Feature priorities (V1 roadmap)

**Use This To:**
- Measure pilot success
- Decide on Google Maps ($40-50/month)
- Prioritize V1 features
- Find coverage gaps

---

**Deployment should be done soon!**

**Check:** https://github.com/berginj/SwimLessons/actions

**When green:** Test the platform, then send survey to pilot users! 🎉