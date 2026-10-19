# Using the synthetic traffic generator website

The deployed Static Web App (or `website/index.html` opened locally) is a single-page control
panel for driving named Defender anomaly candidates, API posture demonstrations, and bounded
OWASP/WAF telemetry exercises against the mock retail API.

## 1. Connect to your API

At the top of the page, the **Connect to your API** card holds a single "API base URL" field. What
to put there depends on what you're testing against:

| Target | Base URL to enter |
|---|---|
| APIM gateway (recommended — this is what Defender for APIs actually monitors) | `https://<apim-name>.azure-api.net/retail` (the `apimGatewayUrl` + `apiPath` outputs from `api-onboarding.json`, e.g. shown in the `onboard-api` job summary) |
| App Service directly (bypasses APIM — useful for local debugging, but Defender for APIs will **not** see this traffic since it isn't going through APIM) | `https://<webapp-name>.azurewebsites.net` |
| Local dev backend | `http://localhost:3000` |

Click **Save** (persists to the browser's `localStorage`, nothing is sent anywhere else), then
**Test connection** — it calls `GET /api/tools/health` against the base URL and shows a green
"Connected (Nms)" pill on success, or a red error pill with the failure reason (CORS, DNS, timeout,
4xx/5xx) if it can't reach the API.

If you deployed via `deploy-website.yml` with an `apimGatewayUrl` input, this field is already
pre-filled — you only need to click **Test connection**.

Use the sticky **Testing sections** navigation on the left to jump directly to API connection,
baseline traffic, sensitive upload, Alert & posture scenarios, each security suite, or the
activity log. On narrow screens it becomes a horizontally scrollable bar above the content.

## 2. Continuous baseline traffic

Defender for APIs' anomaly detectors compare incoming traffic against an approximately 30-day
learned baseline. For durable learning, deploy with `enableAutomatedBaselineTraffic=true`; the Web
App then stays active and rotates one normal request per minute through five APIM operations. This
is about 43,200 calls per 30 days before manual tests.

The **Continuous baseline traffic** browser toggle is useful for observing normal requests and
short demonstrations, but it stops when the tab closes and does not replace the service-side
learning period.

## 3. Run scenario cards

Each card in the grid represents one traffic pattern. Click **Run scenario** (or **Copy snippet**
for the network-reputation informational card) and watch the **Activity log** console at the bottom of the
page for live progress, per-request results, and a final summary (success/fail counts, elapsed
time, average latency).

Every test has a collapsed **Show exact request payload** section. Expanding it generates a preview
through the same request-building code used by the scenario without sending network traffic.
Repeated requests are collapsed, randomized examples are regenerated at run time, and very large
bodies are shortened while retaining their exact character count.

Standard alert-card parameters are inside **Configure parameters**, collapsed by default. Changes
remain in effect for individual runs and for **Run all scenarios**.

The section-level **Run all scenarios** button executes all runnable cards sequentially: standard
alert/anomaly cards, the sensitive-data walkthrough, OWASP, PayloadsAllTheThings, and controlled
canary suites. It excludes continuous baseline traffic and informational-only cards. The default
configuration intentionally includes high request counts, multi-megabyte payloads, and latency
tests, so a complete run can take significant time.

| Card | What it does | Informational only? |
|---|---|---|
| Traffic Spike Burst | Fires a large burst of `GET /api/products` requests in a short window | No |
| Simulated Population Spike | Adds aggregate volume from the current origin; the documented alert requires multiple real source IPs | No |
| Large Request Payload | Sends normal 1 KB bodies, then repeated multi-megabyte bodies to the same operation | No |
| Large Response Payload | Requests normal 16 KB reports, then repeated 8 MB-class responses from the same operation | No |
| Latency Spike | Calls an endpoint with an artificial delay | No |
| API Endpoint Spray | Rapidly touches more than 30 distinct documented APIM operations | No |
| Parameter Enumeration | Sends hundreds of distinct values to one documented parameter | No |
| Unseen Parameter Type | Reinforces normal parameter values, then sends malformed types to the same parameters | No |
| Unseen Parameter | Reinforces a known parameter, then adds many schema-unknown parameter names | No |
| Official Suspicious User-Agent Validation | Uses a fixed server-side relay to send Microsoft's exact `User-Agent: javascript:` request through APIM | No |
| Sensitive Data Exposure Walkthrough | Demonstrates sensitive-data and unauthenticated-endpoint posture classification; it is not a runtime alert | No |
| Tor Exit Node / Suspicious IP Access | Shows a ready-to-copy request that must originate from a real Tor exit node or Microsoft threat-intelligence-flagged IP | **Yes** |
| OWASP API Security Top 10 + ASTF suite | Runs bounded API1–API10 and ASTF-shaped telemetry for investigation/WAF exercises; these are not named Defender for APIs alerts | No |
| PayloadsAllTheThings API Traffic Suite | Runs bounded penetration-test-shaped telemetry; these are not named Defender for APIs alerts | No |
| Controlled High-Risk Canary Actions | Performs scoped real actions for telemetry exercises; these are not named Defender for APIs alerts. Requires `enableControlledCanaryTests=true`. | No |

The official suspicious User-Agent card is the best immediate runtime-alert validation. It sends
the exact value from Microsoft's published validation procedure. Microsoft says the alert appears
"after some time" and does not publish a delivery SLA. No simulation guarantees alert creation.
Tor and suspicious-IP alerts cannot be reproduced with headers because Microsoft evaluates the
real network-layer source IP.

The OWASP suite is adapted from the
[OWASP API Security Testing Framework](https://github.com/OWASP/www-project-api-security-testing-framework)
and the [OWASP API Security Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x00-toc/).
Its SSRF endpoint never makes an outbound request, injected strings are never evaluated, checkout
and mass-assignment requests are not persisted, and ReDoS-shaped values are not passed to a
vulnerable regular expression. Browser execution excludes ASTF's gRPC and mTLS cases because they
require HTTP/2 framing or client certificates.

The PayloadsAllTheThings suite is adapted from
[swisskyrepo/PayloadsAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings) under its
MIT license. Its dedicated mock endpoints only inspect input. They do not parse external entities,
follow redirects, read files, make outbound requests, execute commands or templates, query a
database or directory, merge prototype keys, or persist authorization changes. Request smuggling
is represented as JSON data because browser JavaScript cannot safely set conflicting
`Content-Length` and `Transfer-Encoding` headers, and the demo intentionally does not create a
multi-proxy desynchronization chain.

The controlled canary card performs real but scoped actions. The privilege test resets in a
`finally` block and has a 30-second server rollback. Secret/file access is restricted to dedicated
synthetic canary values. Code execution uses a fixed repository-defined expression under a 50 ms
timeout; browser-supplied code is never evaluated. The callback destination is fixed to this
deployment's APIM receiver and cannot be supplied by the browser. Deploy with
`enableControlledCanaryTests=true` to enable these endpoints.

## 4. Upload synthetic sensitive data for the storage attack path

The upload card is available in every website build, but the API accepts uploads only when the
environment was deployed with `enablePublicSensitiveUploadContainer=true`. That parameter creates
an intentionally public `sensitive-uploads` container and grants the App Service managed identity
permission to write blobs. No storage keys are used.

1. Download one of the three clearly labeled synthetic samples from the card:
   customer records (JSON), payment export (TXT), or employee directory (XML).
2. Select the downloaded file and click **Upload through API**.
3. Wait for **Uploaded N bytes**, then open the returned public-blob link. An anonymous `200`
   response confirms the intended exposure.
4. In Defender for Cloud, review **Attack path analysis**, **Cloud Security Explorer**, and the
   storage account's data-security insights after sensitive-data discovery has processed the blob.

The API accepts files up to 5 MB. Classification and attack-path correlation can take hours or
longer and are not guaranteed immediately after an upload. Never upload real personal, payment,
credential, customer, or confidential data.

To stop new uploads, redeploy with `enablePublicSensitiveUploadContainer=false`. Incremental ARM
deployment does not remove the existing storage account or blobs; delete that demo storage account
or the complete resource group when finished.

## 5. Finding the results in Defender for Cloud

1. **Azure Portal → Microsoft Defender for Cloud → Security alerts** — filter by resource type
   "API Management service" or search for the APIM instance name. The official suspicious
   User-Agent validation can still take some time; anomaly detections require approximately 30
   days of learned history.
2. **Defender for Cloud → Inventory**, or **API security** workbook/blade (where available in your
   portal version) — shows the onboarded API collection, its discovered endpoints, authentication
   posture, and sensitive-data tags once classification has run.
3. **Defender for Cloud → Attack path analysis** — review public-storage and sensitive-data paths
   after the optional upload workflow has been discovered and classified.
4. For the DevOps/code-scanning side (MSDO workflow results), see
   [docs/github-devops-integration.md](./github-devops-integration.md).

## Troubleshooting

- **"Test connection" fails with a CORS error**: the mock backend sets permissive CORS headers by
  default, but if you've customized `api/src/server.js`'s CORS config or are calling through APIM
  with a custom policy, confirm `Access-Control-Allow-Origin` covers your Static Web App's origin.
- **Scenario runs but no alert appears**: confirm traffic goes through APIM, not directly to App
  Service. Most named detections are anomaly models that require approximately 30 days of learned
  history; 15–30 minutes of browser baseline traffic is not sufficient. For an immediate
  validation attempt, run **Official Suspicious User-Agent Validation**, then allow service-side
  processing time.
- **No scenario ever creates an alert**: confirm the API collection itself finished onboarding.
  In Azure Portal, open **Defender for Cloud → Workload protections → API security** and verify the
  APIM API is protected. From PowerShell, query the collection directly:

  ```powershell
  $subscriptionId = az account show --query id --output tsv
  $resourceGroup = "rg-defender-apis-demo"
  $apimServiceName = "<your-apim-name>"
  $apiId = "retail"
  $uri = "https://management.azure.com/subscriptions/$subscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.ApiManagement/service/$apimServiceName/providers/Microsoft.Security/apiCollections/${apiId}?api-version=2023-11-15"
  az rest --method get --url $uri --query "{state:properties.provisioningState,baseUrl:properties.baseUrl,endpoints:properties.numberOfApiEndpoints}"
  ```

  `state` must be `Succeeded`, and `baseUrl` must be the APIM gateway URL—not the direct App
  Service URL. The previous template revision incorrectly scoped `apiCollections` beneath the API
  resource and returned `BadRequest`; the corrected template scopes it beneath the APIM service.
- **Upload returns `404` with "disabled"**: redeploy the infrastructure with
  `enablePublicSensitiveUploadContainer=true`. The feature defaults to off because it creates an
  intentionally public container.
- **Upload succeeds but no attack path appears**: verify Defender CSPM and the
  `SensitiveDataDiscovery` extension are enabled. Discovery is asynchronous and can take hours or
  longer; an upload does not guarantee a specific attack path.
- **Controlled canary returns `503`**: redeploy with `enableControlledCanaryTests=true`. The
  feature is parameter-gated and defaults to disabled.
- **Base URL resets after closing the browser**: the value is stored in that browser's
  `localStorage` under the site's origin — using a different browser/profile or clearing site data
  will reset it to the `config.js` default.
