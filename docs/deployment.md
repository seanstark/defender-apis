# Deployment guide

This guide covers the one-time setup needed to deploy this repo via GitHub Actions (OIDC,
no stored client secret), plus the full secrets/variables reference. If you only want to deploy
with the Azure CLI, see the main [README](../README.md#option-a--azure-cli) instead — you can skip
straight to [Step 3](#step-3-first-deployment).

## Step 1 — Create the App Registration + federated credential

Run these with an account that has permission to create App Registrations in Entra ID and assign
roles on the target subscription.

```powershell
# Variables — adjust as needed
$appName   = "defender-apis-demo-gha"
$repo      = "<your-org>/<your-repo>"   # e.g. contoso/defender-apis
$subId     = az account show --query id -o tsv

# 1. Create the app registration + service principal
$appId = az ad app create --display-name $appName --query appId -o tsv
az ad sp create --id $appId | Out-Null

# 2. Federated credential scoped to the main branch
az ad app federated-credential create --id $appId --parameters (@{
  name        = "github-main-branch"
  issuer      = "https://token.actions.githubusercontent.com"
  subject     = "repo:$repo:ref:refs/heads/main"
  audiences   = @("api://AzureADTokenExchange")
} | ConvertTo-Json -Compress)

# Optional: also allow manual workflow_dispatch runs from other branches/environments, e.g.:
# subject = "repo:$repo:environment:production"

# 3. Grant Contributor on the subscription (or scope to a specific resource group you pre-create)
az role assignment create `
  --assignee $appId `
  --role Contributor `
  --scope "/subscriptions/$subId"

# 4. Note these three values for GitHub secrets
az ad app show --id $appId --query appId -o tsv          # -> AZURE_CLIENT_ID
az account show --query tenantId -o tsv                   # -> AZURE_TENANT_ID
az account show --query id -o tsv                          # -> AZURE_SUBSCRIPTION_ID
```

> Scoping Contributor to a pre-created resource group instead of the whole subscription is more
> conservative — just change `--scope` to
> `/subscriptions/$subId/resourceGroups/rg-defender-apis-demo` and create that group first. Note
> that `infra/pricing.json` deploys at **subscription** scope, so if you scope role assignment to a
> resource group, that optional step will need separate elevated credentials or to be run manually.

## Step 2 — Configure the repository

**Secrets** (Settings → Secrets and variables → Actions → Secrets):

| Secret | Value |
|---|---|
| `AZURE_CLIENT_ID` | App registration's Application (client) ID |
| `AZURE_TENANT_ID` | Entra ID tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Target subscription ID |
| `APIM_PUBLISHER_EMAIL` | Any valid email — required by API Management, shown as the publisher contact |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Added **after** the first infra deploy — see [Step 3](#step-3-first-deployment) |

**Variables** (same screen, Variables tab) — optional, both have defaults in the workflow:

| Variable | Default | Purpose |
|---|---|---|
| `AZURE_RESOURCE_GROUP` | `rg-defender-apis-demo` | Resource group all resources deploy into |
| `AZURE_LOCATION` | `eastus2` | Azure region |

## Step 3 — First deployment

1. Go to **Actions → Deploy Infrastructure (ARM) → Run workflow**. Leave defaults, or set
   `appServicePlanSku` if you need a different SKU than `B1` (see
   [README — known environment constraints](../README.md#known-environment-constraints) if you hit
   a quota error). Leave `enableDefenderPlans` as `false` for the first run unless you already know
   the subscription needs the plans turned on.
2. Watch the run. It performs, in order: `deploy-main` (resource group ARM deploy), `deploy-backend`
   (zip-deploys `api/` to the new Web App), `onboard-api` (imports `apim/openapi.yaml` into APIM and
   creates the `Microsoft.Security/apiCollections` resource), and optionally `deploy-pricing`.
3. Once it succeeds, fetch the Static Web App deployment token and add it as the
   `AZURE_STATIC_WEB_APPS_API_TOKEN` secret:
   ```powershell
   az staticwebapp secrets list `
     -n <staticSiteName-from-workflow-summary> `
     -g <AZURE_RESOURCE_GROUP> `
     --query properties.apiKey -o tsv
   ```
4. Go to **Actions → Deploy Website (Azure Static Web Apps) → Run workflow**, optionally supplying
   `apimGatewayUrl` (e.g. `https://<apim-name>.azure-api.net/retail`, found in the previous run's
   `onboard-api` job summary) to pre-fill the site's API base URL.
5. Open the Static Web App's default hostname (also in the `deploy-main` job summary /
   `staticSiteDefaultHostname` output) and confirm "Test connection" succeeds.
6. If you didn't enable Defender plans in step 1, either re-run `deploy-infra.yml` with
   `enableDefenderPlans: true`, or run `az deployment sub create -l <region> -f infra/pricing.json`
   locally, or enable **Defender for APIs** and **Defender CSPM** from the Defender for Cloud
   portal (**Environment settings → your subscription → Defender plans**).

## Re-running / updating

- Changes under `api/**` trigger `ci-backend.yml` automatically (build/boot smoke test only — it
  does not deploy). Re-run `deploy-infra.yml`'s `deploy-backend`/`onboard-api` jobs manually to ship
  code or spec changes.
- Changes under `website/**` on `main` automatically trigger `deploy-website.yml`.
- Changes to `apim/openapi.yaml` require re-running `deploy-infra.yml` (or at least its
  `onboard-api` job) so APIM re-imports the updated spec.

## Private-repository caveat

`deploy-infra.yml` derives `openApiSpecUrl` as:

```
https://raw.githubusercontent.com/${{ github.repository }}/${{ github.ref_name }}/apim/openapi.yaml
```

This only resolves if that raw URL is publicly reachable. For a **private** repository, either:

- Temporarily make the repo public for the duration of the `onboard-api` job, or
- Host `apim/openapi.yaml` somewhere reachable at deploy time (a storage account blob with a SAS
  token, a GitHub Gist, etc.) and pass that URL as an explicit `openApiSpecUrl` workflow input /
  CLI parameter instead of relying on the raw GitHub URL.
