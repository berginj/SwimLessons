# GitHub Actions Setup

## Overview

This repository now authenticates to Azure with GitHub OIDC and `azure/login@v3`.
That removes the need for long-lived `AZURE_CREDENTIALS` JSON secrets.

## Required GitHub Secrets

### Staging

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_SWA_POOLS`

### Production

- `AZURE_CLIENT_ID_PROD`
- `AZURE_TENANT_ID_PROD`
- `AZURE_SUBSCRIPTION_ID_PROD`
- `AZURE_SWA_POOLS_PROD`

Remove any old `AZURE_CREDENTIALS` secrets.

## Configure OIDC in Azure

For the Entra app used by GitHub Actions:

1. Open Microsoft Entra ID -> App registrations.
2. Select the application.
3. Open `Federated credentials`.
4. Add the GitHub credential for staging:
   - Organization: `berginj`
   - Repository: `SwimLessons`
   - Entity type: `Branch`
   - Branch: `main`
5. Add the GitHub credential for production:
   - Organization: `berginj`
   - Repository: `SwimLessons`
   - Entity type: `Environment`
   - Environment: `production`

Expected subjects:

```text
repo:berginj/SwimLessons:ref:refs/heads/main
repo:berginj/SwimLessons:environment:production
```

If production uses a different Entra app, configure the production subject there and store the production IDs in the `_PROD` secrets.

## Workflow Behavior

### CI Build

- Runs on pull requests and pushes
- Builds the app, builds the Function deploy package, runs tests, and validates Bicep
- Does not require Azure login

### Deploy to Staging

- Runs on pushes to `main`
- Uses OIDC via `azure/login@v3`
- Requires `id-token: write`

### Deploy to Production

- Runs on release publish
- Uses OIDC via `azure/login@v3`
- Uses the GitHub environment `production`

## Security Guidance

- Do not commit Azure secrets or deployment tokens.
- Do not share service principal secrets in markdown files.
- Do not whitelist leaked Azure credentials in Git history.
- Rotate any previously exposed client secrets or app tokens.

## Verification

1. Add the secrets in GitHub.
2. Push to `main`.
3. Watch https://github.com/berginj/SwimLessons/actions
4. Confirm Azure login succeeds with OIDC.
