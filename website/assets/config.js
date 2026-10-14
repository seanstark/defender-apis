// Default API base URL. Left blank by default; the deploy-website workflow can inject a value
// here via `website/assets/config.js` generation, or the user can just type it into the
// "API base URL" field in the UI (it is remembered via localStorage).
//
// Expected format: the APIM gateway URL + the API's published path suffix, e.g.
//   https://<apim-service-name>.azure-api.net/retail
// (the "/retail" suffix comes from the apiPath parameter in infra/api-onboarding.json).
window.DEFAULT_API_BASE_URL = window.DEFAULT_API_BASE_URL || '';
