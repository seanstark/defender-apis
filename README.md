# Defender for APIs / API Security Posture — Demo Environment

This repository builds a self-contained Azure environment for **evaluating Microsoft Defender
for Cloud's API security capabilities**:

- **API security posture management** — discovery and posture assessment of unprotected/externally
  exposed APIs (no Defender plan required).
- **Defender for APIs** — runtime threat detection for APIs published through Azure API Management
  (requires the `Api` Defender plan).
- **Defender CSPM attack-path analysis** — an optional, intentionally public Blob container receives
  synthetic sensitive files through the API so sensitive-data discovery can correlate data
  exposure with the App Service workload.
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
- [OWASP API Security Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x00-toc/)
- [OWASP API Security Testing Framework](https://github.com/OWASP/www-project-api-security-testing-framework)
- [PayloadsAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings)

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
                                        ├── managed identity ──▶ Public Blob container
                                        │                       (optional synthetic data only)
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
| [api/](./api) | Node.js/Express mock retail API with synthetic PII/PCI-shaped data, realistic anomaly traffic targets, an official suspicious-User-Agent validation relay, and bounded security-test endpoints. |
| [apim/openapi.yaml](./apim/openapi.yaml) | OpenAPI 3.0.3 definition of the demo API paths, imported into API Management. This is also the artifact Defender for APIs uses to understand the API's schema (used for sensitive-data and schema-violation detections). |
| [infra/](./infra) | ARM templates: one-click master deployment, core infra, API onboarding, application-content publishing, and optional subscription-level Defender plan enablement. |
| [website/](./website) | Static HTML/CSS/JS traffic generator that separates named Defender anomaly candidates, posture demonstrations, and OWASP/WAF telemetry exercises. |
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
4. ZIP-deploys the Node.js API and publishes the preconfigured traffic-generator website to Azure
   Static Web Apps using `infra/content-deployment.json`.
5. Optionally enables the paid Defender for APIs and Defender CSPM plans using
   `infra/pricing.json`. The `enableDefenderPlans` parameter defaults to `false` to avoid enabling
   billable plans without an explicit choice.

The account running the deployment needs permission to create resource groups and resources at the
subscription scope. Application-content publishing creates a user-assigned managed identity and a
resource-group-scoped Contributor role assignment for the ARM deployment script, so the deploying
account must also be able to create role assignments (for example, Owner or User Access
Administrator plus Contributor). Enabling the Defender plans requires the appropriate
subscription-level security/pricing permissions. The identity remains in the resource group so
the content stage can run again on later master-template deployments.

The `deployApplicationContent` parameter defaults to `true`. Set it to `false` only when you want
to provision the hosts without publishing the backend and website.

The intentionally public storage attack-path demo is disabled by default. Set
`enablePublicSensitiveUploadContainer` to `true` to create the storage account and
`sensitive-uploads` container, grant the Web App's managed identity write access, and enable the
website upload flow. This permits anonymous reads of uploaded blobs by design. Use only synthetic
data in a disposable demo environment.

The controlled high-risk canary suite is also disabled by default. Set
`enableControlledCanaryTests` to `true` to enable its scoped privilege-change, synthetic
secret/file-read, fixed-code, and same-demo callback endpoints. This does not enable arbitrary
file access, arbitrary code execution, or caller-selected callback URLs.

Automated baseline generation is disabled by default. Set `enableAutomatedBaselineTraffic` to
`true` to keep the App Service active and send one normal request per minute through APIM. This is
about 43,200 calls over 30 days, excluding manually generated traffic. Use it to build the
approximately 30-day history required by Defender for APIs anomaly models; a short browser session
is not a substitute for that learning period.

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
scenario cards. The cards are deliberately separated into named Defender anomaly candidates,
posture demonstrations, and general API-security/WAF telemetry exercises.

No simulation guarantees an alert. Microsoft's documented anomaly detections use an approximately
30-day learned baseline. Tor and suspicious-IP alerts require a real network source with that
reputation. The suspicious User-Agent alert is the only alert with a Microsoft-documented
one-request validation procedure: the site invokes a fixed server-side relay that sends the exact
`User-Agent: javascript:` request through APIM. Microsoft says the alert appears "after some time"
and publishes no delivery SLA.

- Use the sticky left navigation to jump between connection, baseline, upload, scenario-suite, and
  activity-log sections.
- Expand **Show exact request payload** on any test to generate its request preview from the same
  code that runs the scenario. Repeated requests are collapsed and exceptionally large bodies are
  shortened with their exact total length shown.
- Standard alert-card parameters are under **Configure parameters** and remain collapsed by
  default.
- **Run all scenarios** executes every runnable card sequentially with its current configuration.
  It excludes the continuous baseline toggle and informational-only cards. Default settings include
  high-volume, multi-megabyte, and delayed requests, so allow the complete run time before starting
  another suite.

| Scenario card | Defender outcome | Endpoint(s) used |
|---|---|---|
| Traffic Spike Burst | `API_SpikeInAPITraffic` | `GET /api/products` |
| Simulated Population Spike | `API_PopulationSpikeInAPITraffic`; multiple real source IPs are required | `GET /api/products` |
| Large Request Payload | `API_SpikeInPayload` (request) | `POST /api/tools/upload` |
| Large Response Payload | `API_SpikeInPayload` (response) | `GET /api/tools/large-report` |
| Latency Spike | `API_SpikeInLatency` (Preview) | `GET /api/tools/delay` |
| API Endpoint Spray | `API_SprayInRequests`; touches more than 30 documented operations | Multiple APIM operations |
| Parameter Enumeration | `API_ParameterEnumeration`; distributed variant requires multiple real IPs | `GET /api/orders?customerId=` |
| Unseen Parameter Type | `API_UnseenParamType` | `GET /api/orders` |
| Unseen Parameter | `API_UnseenParam` | `GET /api/orders` |
| Official Suspicious User-Agent Validation | `API_AccessFromSuspiciousUserAgent`; exact documented `javascript:` value | `POST /api/security/canary/suspicious-user-agent` relays to APIM health |
| Sensitive Data Exposure Walkthrough | Posture/classification finding, not a runtime alert | Customer, payment, admin, and export endpoints |
| Tor Exit Node / Suspicious IP Access | `API_AccessFromTorExitNode` / `API_AccessFromSuspiciousIP`; real reputation required | `GET /api/tools/health` |
| Automated baseline traffic | One normal APIM call per minute for long-term model learning | Five normal read operations |
| OWASP, PayloadsAllTheThings, and controlled canary suites | Investigation/WAF telemetry; no corresponding named Defender for APIs alerts | Multiple bounded test endpoints |

SQL injection, command injection, SSRF, path traversal, BOLA, and generic authentication abuse do
not map to named Defender for APIs alerts. Keep these suites for APIM logging, investigation
workflows, and Azure WAF exercises rather than treating the absence of a Defender alert as a
deployment failure. Sensitive-data discovery and unauthenticated endpoint inventory are posture
findings, not runtime alerts.

The OWASP suite adapts non-destructive request shapes from the
[OWASP API Security Testing Framework](https://github.com/OWASP/www-project-api-security-testing-framework)
(Apache-2.0) and maps them to the
[OWASP API Security Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x00-toc/)
(CC BY-SA 4.0). The mock backend records or echoes attack-shaped input but never makes SSRF
callbacks, executes injected text, changes authorization state, persists mass-assignment fields,
or evaluates deliberately vulnerable regular expressions.

The separate **PayloadsAllTheThings API Traffic Suite** adapts API-relevant request shapes from
[swisskyrepo/PayloadsAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings) (MIT).
It adds inert endpoints for observing duplicate parameters, XML entity declarations, redirect and
traversal targets, header/CRLF values, generic injection strings, and prototype keys. Real request
desynchronization, reverse shells, destructive or time-based SQL, credential attacks, external
callbacks, filesystem reads, XML entity expansion, and unbounded denial-of-service payloads are
excluded. The request-smuggling scenario transmits header names inside JSON rather than setting
conflicting HTTP transport headers. See [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for
attribution.

### Controlled high-risk canary actions

Deploy with `enableControlledCanaryTests=true`, then use **Controlled High-Risk Canary Actions**
on the website. These tests perform real but tightly bounded side effects:

- **Privilege change:** changes only `synthetic-canary-user` in the current Node.js process from
  `viewer` to `admin`. The website resets it immediately in a `finally` block, and the server
  independently restores it after 30 seconds.
- **Canary secret access:** reads only
  `api/src/data/canarySecrets.json` or the `DEMO_CANARY_SECRET` synthetic app setting. Requested
  paths and environment-variable names are recorded for telemetry but ignored.
- **Fixed code execution:** executes one repository-defined string transformation in a Node.js
  `vm` context with dynamic string/WASM code generation disabled and a 50 ms timeout.
  Request-supplied code is recorded but never evaluated.
- **Controlled callback:** makes one five-second-bounded HTTPS request to
  `/retail/api/security/canary/callback-receiver` on this deployment's own APIM hostname. The
  browser cannot supply a destination, and the API rejects non-HTTPS, non-APIM, or different-path
  targets.

The feature defaults to off because these operations intentionally produce real state-change,
file/app-setting-read, execution, and outbound-request telemetry. The data and identity remain
synthetic and grant no Azure permissions or access to real secrets.

## Public Blob Storage attack-path walkthrough

This optional workflow sends a file along the complete path:

`Static Web App → API Management → App Service → managed identity → Blob Storage`

1. Deploy with `enablePublicSensitiveUploadContainer=true`. In the GitHub workflow, select
   **Create intentionally public synthetic-sensitive-data blob container**. For the one-click
   deployment, set the corresponding template parameter to `true`.
2. Enable Defender CSPM and its sensitive-data discovery extension by deploying
   `infra/pricing.json` with `enableSensitiveDataDiscovery=true`, or configure the equivalent
   plan in Defender for Cloud.
3. Open the Static Web App and use **Upload synthetic sensitive data to public Blob Storage**.
   Download one of the included samples first if needed:
   - [synthetic-customer-records.json](./website/samples/synthetic-customer-records.json)
   - [synthetic-payment-export.txt](./website/samples/synthetic-payment-export.txt)
   - [synthetic-employee-directory.xml](./website/samples/synthetic-employee-directory.xml)
4. Select the sample and click **Upload through API**. A successful response includes a link that
   opens anonymously, confirming the intended public exposure.
5. In Defender for Cloud, review **Attack path analysis**, **Cloud Security Explorer**, and the
   storage account's data-security insights for paths or classifications involving public access
   and sensitive data.

Sensitive-data classification and attack-path correlation are asynchronous. Initial discovery can
take hours or longer, and an individual upload does not guarantee that Defender for Cloud will
produce a particular attack path. The API caps uploads at 5 MB, sanitizes file names, and accepts
only base64-encoded content. Storage writes use the Web App's managed identity; storage account
keys are disabled.

> **Warning:** The container is deliberately public. Never upload real personal, financial,
> credential, customer, or confidential data.

To stop new uploads, redeploy with `enablePublicSensitiveUploadContainer=false`. Because ARM
deployments use incremental mode, this disables the API feature but does not delete a storage
account that was created previously. Delete the demo storage account or the entire resource group
to remove existing public blobs.

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
  real personal data is ever processed. The optional Blob upload path persists only files you
  explicitly select and must never be used with real data.

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
