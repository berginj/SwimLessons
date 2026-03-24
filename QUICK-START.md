# GitHub Actions Quick Start

## 1. Configure Azure OIDC

Create federated credentials on the Microsoft Entra app used by GitHub Actions.

- Staging subject: `repo:berginj/SwimLessons:ref:refs/heads/main`
- Production subject: `repo:berginj/SwimLessons:environment:production`

If production uses a different Entra app, add the production subject there instead.

## 2. Add GitHub Secrets

Go to https://github.com/berginj/SwimLessons/settings/secrets/actions and add:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_SWA_POOLS`
- `AZURE_CLIENT_ID_PROD`
- `AZURE_TENANT_ID_PROD`
- `AZURE_SUBSCRIPTION_ID_PROD`
- `AZURE_SWA_POOLS_PROD`

Remove old `AZURE_CREDENTIALS` and `AZURE_CREDENTIALS_PROD` secrets if they still exist.

## 3. Push and Watch

```bash
git push origin main
```

Watch: https://github.com/berginj/SwimLessons/actions

## Notes

- GitHub Actions now uses OIDC with `azure/login@v3`.
- Do not paste service principal JSON into GitHub secrets.
- Do not whitelist leaked Azure secrets in Git history. Rotate and remove them instead.

Full setup: `SETUP-GITHUB-DEPLOY.md`
