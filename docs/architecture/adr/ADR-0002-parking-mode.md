# ADR-0002: Static Parking Mode For Temporary App Pauses

## Status

Accepted

## Date

2026-04-24

## Context

The repo already had two imperfect ways to reduce consumption:

- keep the full app live in the lean `evaluation` profile
- let the frontend fall back to demo behavior when the API is unavailable

Neither is a clean operational pause:

- evaluation still keeps the full endpoint surface running
- an accidental backend outage does not communicate intent clearly to parents or operators

We need a reversible pause path that keeps a static page online while allowing the Function App to be stopped deliberately.

## Decision

Introduce a repo-owned parking mode.

Parking mode consists of:

- a runtime web config file at `src/web/runtime-config.json`
- frontend behavior that renders a static parked view when that config is enabled
- a manual workflow at `.github/workflows/parking-mode.yml` that writes the runtime config and stops or starts the target Function App

Resume mode uses the same workflow to restore the live runtime config, redeploy the web app, and start the Function App again.

## Consequences

### Positive

- Keeps the site reachable with an explicit static state during temporary pauses.
- Avoids presenting an unintentional broken shell or generic API failure as healthy.
- Gives operators a repo-owned pause/resume path instead of manual portal edits.

### Negative

- Does not remove baseline cost from the Static Web App or other provisioned resources.
- Requires a content redeploy when switching between parked and live states.
- Temporarily suspends live search, session details, and telemetry ingestion while parked.

## Alternatives Considered

### Rely on existing frontend demo fallback

Rejected.

That behavior is useful for resilience, but it is not a clear operational mode and still attempts live initialization before failing over.

### Use only the lean evaluation profile

Rejected.

That profile reduces cost, but it still keeps the live Function surface running and is intended for active evaluation rather than pause/resume.
