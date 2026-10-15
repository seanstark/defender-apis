# Defender for APIs / API Security Posture — Demo Environment

This repository builds a self-contained Azure environment for **evaluating Microsoft Defender
for Cloud's API security capabilities**:

- **API security posture management** — discovery and posture assessment of unprotected/externally
  exposed APIs (no Defender plan required).
- **Defender for APIs** — runtime threat detection for APIs published through Azure API Management
  (requires the `Api` Defender plan).
- **GitHub DevOps security integration** — IaC/code scanning via the Microsoft Security DevOps
  (MSDO) GitHub Action, surfaced in GitHub's Security tab and, once connected, in Defender for
  Cloud's DevOps Security pane.

It is a **demo/training environment only**. All data is synthetic and regenerated in memory each
time the mock API starts; nothing here should be pointed at production data or credentials.

Reference documentation used to design this environment:

- [API security posture overview](https://learn.microsoft.com/en-us/azure/defender-for-cloud/api-security-posture-overview)
- [Deploy Defender for APIs](https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-apis-deploy)
- [GitHub Action for Defender for Cloud](https://learn.microsoft.com/en-us/azure/defender-for-cloud/github-action)
- [IaC template mapping](https://learn.microsoft.com/en-us/azure/defender-for-cloud/iac-template-mapping)
- [Defender for APIs alerts reference](https://learn.microsoft.com/en-us/azure/defender-for-cloud/alerts-defender-for-apis)

## Architecture

```
                         ┌───────────────────────────┐
  Browser  ───────────▶  │ Azure Static Web App      │   website/  (HTML/CSS/JS, no backend)
  (traffic generator)    │ "synthetic traffic site"  │
                         └──────────────┬────────────┘
                                        │ HTTPS calls (configurable base URL)
                                        ▼
                         ┌───────────────────────────┐
                         │ Azure API Management       │   apim/openapi.yaml imported as API
                         │ (Developer tier)            │   "retail" API, path /retail
                         └──────────────┬────────────┘
                                        │ backend-url pass-through
                                        ▼
                         ┌───────────────────────────┐
                         │ App Service (Linux, Node)  │   api/  (Express mock retail API)
                         │ mock retail/e-commerce API │   synthetic customers/orders/products
                         └──────────────┬────────────┘
                                        │ logs / metrics
                                        ▼
                         ┌───────────────────────────┐
                         │ Log Analytics + App        │
                         │ Insights                   │
                         └───────────────────────────┘

  Microsoft.Security/apiCollections  → onboards the APIM API into Defender for APIs
  Microsoft.Security/pricings        → enables the Api + CloudPosture Defender plans (subscription scope)
```

| Folder | Purpose |
|---|---|
| [api/](./api) | Node.js/Express mock retail API with synthetic PII/PCI-shaped data, intentionally "noisy"/insecure endpoints (admin dumps, SSRF-shaped tool, oversized payload endpoints, parameter-driven filters) designed to trip specific Defender for APIs alert types. |
| [apim/openapi.yaml](./apim/openapi.yaml) | OpenAPI 3.0.3 definition of all 15 endpoints, imported into API Management. This is also the artifact Defender for APIs uses to understand the API's schema (used for sensitive-data and schema-violation detections). |
| [infra/](./infra) | ARM templates: one-click master deployment, core infra, API onboarding, and optional subscription-level Defender plan enablement. |
| [website/](./website) | Static HTML/CSS/JS "synthetic traffic generator" — a control panel for firing the scenarios that map to each Defender for APIs alert type. |
| [.github/workflows/](./.github/workflows) | GitHub Actions: infra deploy, website deploy, backend CI, and the MSDO DevOps-security scan. |
| [docs/](./docs) | Deeper how-to guides referenced below. |

## Quick start

You can deploy this either **directly with Azure CLI** or **via GitHub Actions (OIDC)**. Both paths
run the same three ARM templates in the same order:

1. `infra/main.json` (resource group scope) — Log Analytics, Application Insights, App Service
   Plan + Web App, API Management (Developer tier), Static Web App.
2. Deploy the Node.js API code to the Web App.
3. `infra/api-onboarding.json` (resource group scope) — imports `apim/openapi.yaml` into APIM and
   creates a `Microsoft.Security/apiCollections` resource, which is what onboards the API into
   Defender for APIs.
4. *(Optional, separate step)* `infra/pricing.json` (**subscription** scope) — enables the
   `Api` (Defender for APIs) and `CloudPosture` (Defender CSPM) plans if they are not already on in
   the target subscription.

### One-click Azure deployment

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fseanstark%2Fdefender-apis%2Fmain%2Finfra%2Fmaster.json)

The button deploys [infra/master.json](./infra/master.json) at subscription scope. In one Azure
deployment it:

1. Creates or updates the target resource group.
2. Deploys the core Azure infrastructure from `infra/main.json`.
3. Imports the public OpenAPI document into API Management and onboards the API into Defender for
   APIs using `infra/api-onboarding.json`.
4. Optionally enables the paid Defender for APIs and Defender CSPM plans using
   `infra/pricing.json`. The `enableDefenderPlans` parameter defaults to `false` to avoid enabling
   billable plans without an explicit choice.

The account running the deployment needs permission to create resource groups and resources at the
subscription scope. Enabling the Defender plans also requires the appropriate subscription-level
security/pricing permissions.

> The master ARM template provisions and configures all Azure resources, but ARM cannot publish
> this repository's application files to the provisioned hosts. After it succeeds, run
> **Deploy Infrastructure (ARM)** to zip-deploy the Node.js backend, or deploy the `api/` folder
> with `az webapp deploy`. Then run **Deploy Website (Azure Static Web Apps)** to publish the
> `website/` folder. The API is already configured in APIM and starts forwarding successfully as
> soon as the backend code is present.

### Option A — Azure CLI

```powershell
# 1. Core infra
az group create -n rg-defender-apis-demo -l eastus2
az deployment group create `
  -g rg-defender-apis-demo `
  -f infra/main.json `
  -p infra/main.parameters.json apimPublisherEmail=you@example.com

# Capture outputs
$out = az deployment group show -g rg-defender-apis-demo -n main --query properties.outputs -o json | ConvertFrom-Json
$webAppName = $out.webAppName.value
$apimServiceName = $out.apimServiceName.value
$apimGatewayUrl = $out.apimGatewayUrl.value
$staticSiteName = $out.staticSiteName.value

# 2. Deploy backend code (zip deploy)
cd api; npm install; Compress-Archive -Path * -DestinationPath ..\api-release.zip -Force; cd ..
az webapp deploy -g rg-defender-apis-demo -n $webAppName --src-path api-release.zip --type zip

# 3. Onboard the API into APIM + Defender for APIs
az deployment group create `
  -g rg-defender-apis-demo `
  -f infra/api-onboarding.json `
  -p apimServiceName=$apimServiceName `
     backendWebAppUrl="https://$webAppName.azurewebsites.net" `
     openApiSpecUrl="https://raw.githubusercontent.com/<you>/<repo>/main/apim/openapi.yaml"

# 4. (Optional) enable Defender plans at subscription scope
az deployment sub create -l eastus2 -f infra/pricing.json

# 5. Deploy the website
az staticwebapp secrets list -n $staticSiteName -g rg-defender-apis-demo --query properties.apiKey -o tsv
# use the SWA CLI or the deploy-website.yml workflow to push /website using that token
```

> `openApiSpecUrl` must be reachable by the APIM control plane at deployment time. The quickest
> option is the raw GitHub URL of this file once pushed; alternatively upload `apim/openapi.yaml`
> to any public/SAS-protected blob and pass that URL instead.

### Option B — GitHub Actions (recommended)

1. Create an Azure AD App Registration with a **federated credential** trusting this GitHub repo
   (no client secret stored in GitHub). See [docs/deployment.md](./docs/deployment.md) for exact
   steps.
2. Add repository secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
   `APIM_PUBLISHER_EMAIL`. Add `AZURE_STATIC_WEB_APPS_API_TOKEN` after step 1 of the infra deploy
   (see below).
3. Optionally set repository variables `AZURE_RESOURCE_GROUP` and `AZURE_LOCATION` (defaults:
   `rg-defender-apis-demo` / `eastus2`).
4. Run **Actions → Deploy Infrastructure (ARM)** (`workflow_dispatch`). This deploys `main.json`,
   zip-deploys the backend, then deploys `api-onboarding.json`. Optionally set
   `enableDefenderPlans: true` to also run `pricing.json` in the same run.
5. Retrieve the Static Web App deployment token:
   `az staticwebapp secrets list -n <staticSiteName> -g <rg> --query properties.apiKey -o tsv`,
   store it as the `AZURE_STATIC_WEB_APPS_API_TOKEN` secret.
6. Run **Actions → Deploy Website (Azure Static Web Apps)**, optionally passing `apimGatewayUrl`
   (e.g. `https://<apim>.azure-api.net/retail`) to pre-fill the website's API base URL; otherwise
   set it once in the browser UI after the site loads.

Workflow files:

| Workflow | Trigger | What it does |
|---|---|---|
| [deploy-infra.yml](./.github/workflows/deploy-infra.yml) | manual | Deploys `main.json` → backend code → `api-onboarding.json` → optional `pricing.json`. |
| [deploy-website.yml](./.github/workflows/deploy-website.yml) | push to `website/**`, manual | Publishes `/website` to the Static Web App. |
| [ci-backend.yml](./.github/workflows/ci-backend.yml) | push/PR touching `api/**` | Boots the Express app and checks `/healthz` responds, as a lightweight smoke test. |
| [security-devops.yml](./.github/workflows/security-devops.yml) | push/PR to `main`, weekly schedule, manual | Runs the Microsoft Security DevOps GitHub Action (ARM/Bicep Template Analyzer, Checkov, Trivy, etc.) and uploads SARIF to GitHub's Security tab — see below for Defender for Cloud integration. |

## GitHub ↔ Defender for Cloud DevOps security integration

Two separate things make up "DevOps security" for GitHub in Defender for Cloud, and only one of
them is ARM-scriptable:

1. **Microsoft Security DevOps (MSDO) GitHub Action** — `.github/workflows/security-devops.yml`
   runs IaC and code scanners (ARM/Bicep Template Analyzer, Checkov, Terrascan, ESLint, Bandit,
   BinSkim, Trivy) on every push/PR and uploads results as SARIF to the repo's **Security** tab.
   This works standalone, with no portal configuration, the moment the workflow runs.
2. **Connecting the GitHub org/repository to Defender for Cloud** — done once, interactively, in
   the Azure Portal: **Defender for Cloud → Environment settings → Add environment → GitHub**,
   then authorize the Microsoft Security DevOps GitHub App against your org/repo. Once connected,
   this same repo's findings (and its Dependabot/code-scanning alerts) are correlated into
   Defender for Cloud's **DevOps Security** pane, and (where applicable) into attack-path analysis
   and Cloud Security Explorer. **This step cannot be done via ARM/Bicep/CLI** — there is no
   `Microsoft.Security` resource type for GitHub connectors — so it is intentionally left as a
   manual one-time step rather than baked into `infra/`. See
   [docs/github-devops-integration.md](./docs/github-devops-integration.md) for click-by-click
   instructions.

### A note on code-to-cloud / IaC template mapping

The [IaC template mapping](https://learn.microsoft.com/en-us/azure/defender-for-cloud/iac-template-mapping)
feature (which lets Defender for Cloud trace a running Azure resource back to the IaC template and
pull request that created it, for Cloud Security Explorer queries) is currently **Azure DevOps
only** — it is not available for GitHub repositories. This repo therefore cannot demonstrate that
specific code-to-cloud mapping experience; it demonstrates the GitHub-side equivalent instead (the
MSDO scan + DevOps Security pane connector described above). This is called out here explicitly so
it isn't mistaken for a gap in the implementation.

## Defender for APIs alert walkthrough

Once the API is onboarded (`api-onboarding.json` applied) and the `Api` Defender plan is enabled
(`pricing.json`, or enabled manually in the portal), open the deployed website and work through the
scenario cards. Each card fires the specific traffic pattern documented in
[Defender for APIs alerts](https://learn.microsoft.com/en-us/azure/defender-for-cloud/alerts-defender-for-apis)
to trigger that alert:

| Scenario card | Alert type | Endpoint(s) used |
|---|---|---|
| Traffic Spike Burst | `API_SpikeInAPITraffic` | `GET /api/products` |
| Simulated Population Spike | `API_PopulationSpikeInAPITraffic` | `GET /api/products` (rotating client-id header) |
| Large Request Payload | `API_SpikeInPayload` (request) | `POST /api/products/bulk-upload` |
| Large Response Payload | `API_SpikeInPayload` (response) | `GET /api/admin/reports/large` |
| Latency Spike | `API_LatencySpike` | `GET /api/tools/slow` |
| Parameter Spray | `API_ParameterSpray`-style enumeration | `GET /api/orders?customerId=` |
| Parameter Enumeration | sequential ID/parameter enumeration | `GET /api/customers/{id}` |
| Unseen Parameter Type | undocumented/anomalous parameter *type* | `GET /api/search` |
| Unseen Parameter | undocumented parameter *name* | `GET /api/search` |
| Sensitive Data Exposure Walkthrough | sensitive-data-in-response detections | `GET /api/customers`, `GET /api/orders`, `GET /api/admin/users` |
| Tor Exit Node / Suspicious IP Access | `API_AccessFromSuspiciousIP`-style | `GET /api/tools/health` (informational — must be run from a real Tor/threat-intel-flagged IP; see card for details) |
| Suspicious User-Agent | request with known-attack-tool UA string (`sqlmap`, `Nikto`, ...) | `GET /api/tools/echo` |
| Continuous baseline traffic | establishes the "normal" baseline the spike/latency/population detections compare against | `GET /api/products`, `GET /api/tools/health` |

Two cards (Tor/suspicious-IP and User-Agent) are flagged as **informational** in the UI because they
require a real suspicious network origin or a literal attack-tool header string — the browser
cannot spoof its own outbound IP, so the card instead gives you the exact `curl`/PowerShell command
to run from a Tor exit node (for IP reputation) or as-is (for the User-Agent string), and explains
why.

> Alerts in Defender for Cloud are driven by learned baselines and can take time to appear after
> onboarding (the service needs a representative traffic history before some detectors activate).
> Run the baseline-traffic toggle for a while before trying the spike/latency scenarios if alerts
> don't show up immediately.

## Known environment constraints

- **Subscription quota**: this template was validated against a subscription with **zero App
  Service / VM quota** in `eastus2` (`InternalSubscriptionIsOverQuotaForSku`). `az deployment group
  validate` passed structurally; the live deployment itself will fail with that quota error until
  quota is requested. If you hit the same error, either request quota
  (<https://aka.ms/antquotahelp>) or pick a different region/SKU — `appServicePlanSku` is
  parameterized (try `F1` for the free tier, subject to its own feature restrictions) and
  `deploy-infra.yml` exposes it as a workflow input.
- **`subscriptionRequired: false`**: the demo API's APIM product is configured without a
  subscription key so the website can call it with no setup friction. Do not reuse this pattern for
  anything beyond a disposable demo subscription.
- **API Management Developer tier**: no SLA, single unit, not for production — used here purely to
  keep demo cost down while still exercising the real `Microsoft.Security/apiCollections` onboarding
  path.
- **Synthetic data only**: `api/src/data/syntheticData.js` generates fake customers/orders/products/
  admin users at process start using a seeded faker-style generator. Nothing is persisted and no
  real personal data is ever processed.

## Cleanup

```powershell
az group delete -n rg-defender-apis-demo --yes --no-wait
# If pricing.json was applied and you want to revert the Defender plans:
az security pricing create -n Api --tier Free
az security pricing create -n CloudPosture --tier Free
```

## Further reading

- [docs/deployment.md](./docs/deployment.md) — OIDC App Registration setup, secrets/variables
  reference, step-by-step first deployment.
- [docs/github-devops-integration.md](./docs/github-devops-integration.md) — connecting this repo
  to Defender for Cloud's DevOps Security pane.
- [docs/website-guide.md](./docs/website-guide.md) — using the synthetic traffic generator site.
