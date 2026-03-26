# NYC Parent Persona Contract

**Last Updated:** 2026-03-26
**Status:** Active
**Primary Persona:** NYC parent/caregiver searching for children's swim lessons

## Purpose

This document records the current parent persona assumptions that already drive the NYC MVP.

It exists so future work does not depend on thread memory or stale planning docs when making
workflow, product, or deployment decisions.

This is a formalization of the current approved direction, not a persona change request.

## Persona Snapshot

- Parent or caregiver in NYC
- Searching for children's swim lessons, not adult aquatics programming
- Time-constrained and comparison-driven
- Often evaluating options around work, school, and family schedule constraints
- Needs enough confidence to click through to signup without feeling misled

## Core Jobs To Be Done

1. Find real lesson options that fit the child's age and the family's schedule.
2. Understand whether getting to the pool is realistic at lesson time.
3. Avoid wasting time on empty, broken, or misleading search results.
4. Move from discovery to provider signup with enough context to feel safe doing so.

## What Good Looks Like For This Persona

- Search returns real NYC lesson options instead of an empty demo shell.
- Travel time is shown in a way that is useful for a real family decision.
- The app is honest about defaults and approximations.
- Geolocation is helpful when granted, but the app still works when location is denied.
- The parent can reach a signup path without dead ends.

## Trust Requirements

The parent experience should optimize for trust, not just data availability.

Required trust behaviors:
- Do not present empty staging or empty live data as "healthy."
- Do not imply live precision when the system is using fallback estimates.
- Do not auto-prompt for location on page load.
- Do not break search or session details if the browser location or transit router is unavailable.
- Do not hide the current travel-time origin assumption from the parent.

## Current Workflow Contract For This Persona

For the NYC MVP, the approved parent-facing flow is:

1. Parent lands on the web app.
2. The app can show real NYC lesson options.
3. Travel times default to Times Square until the parent chooses browser geolocation.
4. If geolocation is granted, search and session details use the browser-provided origin.
5. If geolocation is denied or unavailable, the app falls back cleanly to Times Square.
6. Transit estimates should reflect lesson-time routing when the external router is available.
7. The parent can inspect session details and continue to provider signup.

## Product Priorities Implied By This Persona

High priority:
- trustworthy search results
- deterministic non-empty NYC data in staging
- honest travel-time behavior
- regression coverage around browser origin and transit
- deployment behavior that preserves the parent journey

Lower priority:
- operator convenience that changes parent-visible behavior
- adding new cities before the NYC path is trustworthy
- expanding transport modes before the current subway/walking path is stable

## Constraints And Approved Defaults

- NYC is the deterministic first market.
- Times Square is the deterministic fallback origin.
- Browser geolocation is opt-in.
- Router-backed travel time is preferred when available.
- Deterministic fallback travel time is required when live routing is unavailable.
- The current frontend is plain HTML/CSS/JS, not React.

## Secondary Supporting Persona

The supporting persona is the platform operator.

Operator work matters when it protects the parent journey by:
- keeping staging reproducible
- keeping deployment contract-driven
- preserving telemetry needed to learn from parent behavior

Operator convenience does not override the parent workflow contract.

## Non-Goals

This persona contract does not currently imply:
- nationwide lesson discovery
- adult aquatics discovery
- realtime-perfect transit guarantees
- mandatory account creation before discovery
- production rollout by default

## Change Control

Changes to this document require human approval when they:
- materially change the parent journey
- change what "trustworthy" means for travel-time presentation
- change the approved origin behavior
- shift the primary persona away from the NYC parent/caregiver
