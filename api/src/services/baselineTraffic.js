'use strict';

const BASELINE_INTERVAL_MS = 60 * 1000;
const BASELINE_PATHS = [
  '/api/tools/health',
  '/api/products?page=1&pageSize=5',
  '/api/products/1',
  '/api/orders?status=processing',
  '/api/customers/1',
];

function automatedBaselineEnabled() {
  return String(process.env.AUTOMATED_BASELINE_ENABLED).toLowerCase() === 'true';
}

function getGatewayBaseUrl() {
  const configuredUrl = process.env.API_GATEWAY_BASE_URL;
  if (!configuredUrl) {
    throw new Error('API_GATEWAY_BASE_URL is required when automated baseline traffic is enabled.');
  }

  const gatewayUrl = new URL(configuredUrl);
  if (
    gatewayUrl.protocol !== 'https:'
    || !gatewayUrl.hostname.endsWith('.azure-api.net')
    || gatewayUrl.pathname !== '/retail'
  ) {
    throw new Error('API_GATEWAY_BASE_URL must be the HTTPS /retail endpoint on Azure API Management.');
  }
  return gatewayUrl.toString().replace(/\/$/, '');
}

function startAutomatedBaselineTraffic() {
  if (!automatedBaselineEnabled()) {
    console.log('Automated APIM baseline traffic is disabled.');
    return null;
  }

  const gatewayBaseUrl = getGatewayBaseUrl();
  let requestIndex = 0;
  const sendBaselineRequest = async () => {
    const path = BASELINE_PATHS[requestIndex % BASELINE_PATHS.length];
    requestIndex += 1;
    const response = await fetch(gatewayBaseUrl + path, {
      headers: {
        'User-Agent': 'DefenderApisBaseline/1.0',
        'X-Demo-Traffic': 'automated-baseline',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error(`Automated baseline request to ${path} returned HTTP ${response.status}.`);
    }
    console.log(`Automated APIM baseline request completed: GET ${path} -> ${response.status}.`);
  };

  const runBaselineRequest = () => {
    sendBaselineRequest().catch((error) => {
      console.error('Automated APIM baseline request failed:', error);
    });
  };

  const initialTimer = setTimeout(runBaselineRequest, 15000);
  initialTimer.unref();
  const intervalTimer = setInterval(runBaselineRequest, BASELINE_INTERVAL_MS);
  intervalTimer.unref();
  console.log(`Automated APIM baseline traffic enabled at one request per minute via ${gatewayBaseUrl}.`);
  return intervalTimer;
}

module.exports = {
  startAutomatedBaselineTraffic,
};
