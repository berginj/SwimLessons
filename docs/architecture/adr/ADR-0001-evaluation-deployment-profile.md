# ADR-0001: Lean Evaluation Deployment Profile

## Status

Accepted

## Date

2026-04-09

## Context

The NYC MVP needs a lower-cost deployment mode for evaluation work without painting the repo into a corner.

The existing infrastructure shape was biased toward eventual expansion:
- App Configuration was provisioned even though the current runtime does not instantiate feature-flag clients.
- Key Vault was provisioned even though the current runtime does not resolve secrets from it.
- The top-level Bicep orchestration deployed an extra Application Insights resource while the Function App module also created one.
- Telemetry retention and sampling were tuned for a broader operating posture than an evaluation environment needs.

We want a cheaper baseline that still preserves:
- the current endpoint surface
- deterministic Cosmos-backed NYC data
- the ability to scale back up without redesigning the deployment model

## Decision

Introduce a first-class `deploymentProfile` parameter in Bicep with a reusable `evaluation` profile.

The `evaluation` profile:
- keeps Azure Functions on Consumption and Cosmos DB in serverless mode
- keeps the Static Web App deployment shape unchanged
- deploys a single shared Application Insights resource and passes its connection string into the Function App
- does not deploy Azure App Configuration by default
- does not deploy Azure Key Vault by default
- lowers Application Insights sampling to `5%`
- lowers Cosmos telemetry-event retention to `14` days

The runtime is updated so `APP_CONFIG_ENDPOINT` and `KEY_VAULT_NAME` are optional instead of required.

An explicit parameter file, `infrastructure-as-code/bicep/parameters/evaluation.parameters.json`, captures the lean profile so it can be reproduced and expanded later.

## Consequences

### Positive

- Reduces recurring evaluation cost without changing the parent-facing API shape.
- Removes the accidental duplicate Application Insights resource.
- Preserves a clean path to re-enable App Configuration and Key Vault later by flipping parameters instead of rewriting the runtime.
- Makes telemetry cost controls configurable rather than hard-coded.

### Negative

- Evaluation deployments will not have App Configuration or Key Vault available unless explicitly enabled.
- Shorter telemetry retention reduces long-window analysis in evaluation environments.
- This ADR does not change the existing staging contract; staging can continue to use the standard profile.

## Alternatives Considered

### Remove services entirely from the codebase

Rejected.

That would save cost now, but it would make later expansion more expensive by forcing another architecture change.

### Keep all services provisioned and only cut telemetry sampling

Rejected.

That leaves meaningful fixed-cost waste in place and does not address the duplicate monitoring resource.

### Change the staging environment to always run in evaluation mode

Rejected for now.

The current staging contract expects the fuller NYC MVP proving path. If staging should become lean by default later, that needs an explicit contract change.
