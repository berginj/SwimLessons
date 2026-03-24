# GitHub OIDC Setup

This repo now uses GitHub OIDC with `azure/login@v3` for Azure authentication.
Do not use `AZURE_CREDENTIALS` JSON secrets anymore.

## 1. Create or Choose Microsoft Entra Apps

Use one app for staging and one for production, or reuse the same app if your access model allows it.

For each app, record:

- Client ID
- Tenant ID
- Subscription ID

Grant the app the Azure roles it needs for the target resource group or subscription.

## 2. Add Federated Credentials in Azure

Open Microsoft Entra ID -> App registrations -> your app -> Federated credentials.

### Staging

Add a GitHub federated credential with:

- Organization: `berginj`
- Repository: `SwimLessons`
- Entity type: `Branch`
- Branch: `main`

Expected subject:

```text
repo:berginj/SwimLessons:ref:refs/heads/main
```

### Production

The production workflow uses the GitHub environment `production`, so the federated credential must target that environment.

- Organization: `berginj`
- Repository: `SwimLessons`
- Entity type: `Environment`
- Environment: `production`

Expected subject:

```text
repo:berginj/SwimLessons:environment:production
```

If production uses a separate Entra app, add this federated credential there.

## 3. Add GitHub Secrets

Go to https://github.com/berginj/SwimLessons/settings/secrets/actions and add:

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

Remove old secrets if they still exist:

- `AZURE_CREDENTIALS`
- `AZURE_CREDENTIALS_PROD`

## 4. Push and Verify

```bash
git push origin main
```

Watch runs at:

https://github.com/berginj/SwimLessons/actions

## 5. Troubleshooting

### `No matching federated identity record found`

The subject in Azure does not match the GitHub workflow context.

Check:

- Staging uses branch `main`
- Production uses environment `production`

### `Login failed` on OIDC

Check:

- `azure/login@v3` is in use
- `permissions` includes `id-token: write`
- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` are correct
- The federated credential was created on the same Entra app referenced by `AZURE_CLIENT_ID`

### Static Web App deploy issues

OIDC does not replace the Static Web App deployment token in this repo.
You still need the appropriate `AZURE_SWA_POOLS` secret.

## Security Notes

- Do not commit Azure secrets or deployment tokens.
- Do not whitelist leaked Azure credentials in Git history.
- Rotate any previously exposed service principal secrets or app tokens.
