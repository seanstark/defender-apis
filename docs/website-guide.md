# Using the synthetic traffic generator website

The deployed Static Web App (or `website/index.html` opened locally) is a single-page control
panel for driving traffic at the mock retail API in patterns that map to specific Defender for
APIs alert types.

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

## 2. Continuous baseline traffic

Defender for APIs' spike/population/latency detectors compare incoming traffic against a learned
baseline. Toggle **Continuous baseline traffic** on before running the spike-style scenarios (and
leave it running in a background browser tab) so there's a "normal" pattern to deviate from. It
calls `GET /api/products` and `GET /api/tools/health` at a low, steady rate until you toggle it
off or close the tab.

## 3. Run scenario cards

Each card in the grid represents one traffic pattern. Click **Run scenario** (or, for the two
informational cards, **Copy snippet**) and watch the **Activity log** console at the bottom of the
page for live progress, per-request results, and a final summary (success/fail counts, elapsed
time, average latency).

| Card | What it does | Informational only? |
|---|---|---|
| Traffic Spike Burst | Fires a large burst of `GET /api/products` requests in a short window | No |
| Simulated Population Spike | Same burst, but rotates a synthetic client-identifier header per request to simulate many distinct callers | No |
| Large Request Payload | `POST`s an oversized JSON body to the bulk-upload endpoint | No |
| Large Response Payload | Requests an endpoint that returns a deliberately large JSON response | No |
| Latency Spike | Calls an endpoint with an artificial delay | No |
| Parameter Spray | Calls `GET /api/orders` with a wide sweep of `customerId` values | No |
| Parameter Enumeration | Calls `GET /api/customers/{id}` across a sequential range of IDs | No |
| Unseen Parameter Type | Sends `GET /api/search` with a parameter value of an unexpected type (e.g. an object/array where a string is documented) | No |
| Unseen Parameter | Sends `GET /api/search` with an entirely undocumented query parameter name | No |
| Sensitive Data Exposure Walkthrough | Calls customer/order/admin-user endpoints and runs a client-side heuristic (`summarizeSensitiveFields()`) that highlights which sensitive field types (SSNs, card numbers, emails, phone numbers) appear in the real response, so you can see exactly what Defender for APIs' own sensitive-data classifier should flag | No |
| Tor Exit Node / Suspicious IP Access | Shows a ready-to-copy `curl`/PowerShell command | **Yes** — your browser can't spoof its own egress IP, so this must be run from a real Tor exit node or another IP with poor reputation |
| Suspicious User-Agent | Shows a ready-to-copy command using a known attack-tool User-Agent string (e.g. `sqlmap`) | **Yes** — included so you can run it from any shell, since the browser's own `User-Agent` header can't be overridden by page JavaScript |

## 4. Finding the results in Defender for Cloud

1. **Azure Portal → Microsoft Defender for Cloud → Security alerts** — filter by resource type
   "API Management service" or search for the APIM instance name. New alerts can take some time to
   appear (anomaly-based detectors need a baseline period).
2. **Defender for Cloud → Inventory**, or **API security** workbook/blade (where available in your
   portal version) — shows the onboarded API collection, its discovered endpoints, authentication
   posture, and sensitive-data tags once classification has run.
3. For the DevOps/code-scanning side (MSDO workflow results), see
   [docs/github-devops-integration.md](./github-devops-integration.md).

## Troubleshooting

- **"Test connection" fails with a CORS error**: the mock backend sets permissive CORS headers by
  default, but if you've customized `api/src/server.js`'s CORS config or are calling through APIM
  with a custom policy, confirm `Access-Control-Allow-Origin` covers your Static Web App's origin.
- **Scenario runs but no alert appears**: alerts are anomaly/baseline-driven and not instantaneous —
  retry after leaving baseline traffic running for 15–30+ minutes, and confirm the traffic is going
  through APIM (not directly to the App Service), since Defender for APIs only observes APIM-routed
  traffic.
- **Base URL resets after closing the browser**: the value is stored in that browser's
  `localStorage` under the site's origin — using a different browser/profile or clearing site data
  will reset it to the `config.js` default.
