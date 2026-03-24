# GitHub OIDC Deploy Checklist

## Goal

Use GitHub OIDC with `azure/login@v3` so Azure deployments no longer depend on long-lived service principal secrets.

## Azure Setup

- Create or identify the Microsoft Entra app for staging.
- Add a federated credential for branch `main`.
  Subject: `repo:berginj/SwimLessons:ref:refs/heads/main`
- Create or identify the Microsoft Entra app for production.
- Add a federated credential for the GitHub environment `production`.
  Subject: `repo:berginj/SwimLessons:environment:production`
- Grant each app the required Azure RBAC roles.

## GitHub Secrets

Add these repository secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_SWA_POOLS`
- `AZURE_CLIENT_ID_PROD`
- `AZURE_TENANT_ID_PROD`
- `AZURE_SUBSCRIPTION_ID_PROD`
- `AZURE_SWA_POOLS_PROD`

Remove these old secrets if they exist:

- `AZURE_CREDENTIALS`
- `AZURE_CREDENTIALS_PROD`

## Verify

- Push to `main` and watch https://github.com/berginj/SwimLessons/actions
- Confirm staging can log in with OIDC
- Confirm production uses the `production` environment subject

## Security

- Do not commit client secrets or deployment tokens to the repo.
- Do not whitelist leaked Azure secrets in Git history.
- Rotate any previously exposed credentials before relying on this setup.

## Reference

Detailed setup steps live in `SETUP-GITHUB-DEPLOY.md`.
