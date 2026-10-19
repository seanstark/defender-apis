'use strict';

const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const vm = require('vm');
const { randomUUID } = require('crypto');
const { customers, products } = require('../data/syntheticData');

const router = express.Router();
const xmlBodyParser = express.text({
  type: ['application/xml', 'text/xml'],
  limit: '64kb',
});
const canarySecretsPath = path.join(__dirname, '..', 'data', 'canarySecrets.json');
const canaryUser = {
  id: 'synthetic-canary-user',
  role: 'viewer',
  rollbackTimer: null,
  rollbackAt: null,
};

function hasOwn(value, key) {
  return Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key));
}

function controlledCanariesEnabled() {
  return String(process.env.CONTROLLED_CANARY_TESTS_ENABLED).toLowerCase() === 'true';
}

function requireControlledCanaries(req, res, next) {
  if (!controlledCanariesEnabled()) {
    return res.status(503).json({
      error: 'Controlled canary tests are disabled.',
      hint: 'Deploy with enableControlledCanaryTests=true to enable these scoped actions.',
    });
  }
  next();
}

function resetCanaryUser() {
  if (canaryUser.rollbackTimer) {
    clearTimeout(canaryUser.rollbackTimer);
  }
  canaryUser.role = 'viewer';
  canaryUser.rollbackTimer = null;
  canaryUser.rollbackAt = null;
}

router.post('/auth/login', (req, res) => {
  const authorization = req.headers.authorization || '';
  res.status(401).json({
    authenticated: false,
    username: req.body && req.body.username,
    tokenShape: authorization.startsWith('Bearer ') ? 'bearer' : 'missing',
    note: 'Synthetic authentication probe; no credentials are validated or stored.',
  });
});

router.post('/auth/verify-otp', (req, res) => {
  res.status(401).json({
    verified: false,
    codeLength: String((req.body && req.body.code) || '').length,
    note: 'Synthetic OTP probe; no account or verification state exists.',
  });
});

router.patch('/customers/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const customer = customers.find((item) => item.id === id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found', id });
  }

  res.json({
    ...customer,
    _acceptedFields: Object.keys(req.body || {}),
    _note: 'Synthetic mass-assignment response only; no data was changed.',
  });
});

router.all('/admin/:operation', (req, res) => {
  res.json({
    operation: req.params.operation,
    method: req.method,
    authorized: false,
    executed: false,
    _note: 'Synthetic function-level authorization probe; no admin action was executed.',
  });
});

router.post('/orders/checkout', (req, res) => {
  res.status(202).json({
    accepted: true,
    checkoutId: `synthetic-${Date.now()}`,
    itemCount: Array.isArray(req.body && req.body.items) ? req.body.items.length : 0,
    _note: 'Synthetic checkout only; no order, payment, or inventory change was made.',
  });
});

router.get('/tools/fetch', (req, res) => {
  res.json({
    attemptedTarget: req.query.url || req.query.uri || req.query.callback || '',
    fetched: false,
    blocked: true,
    _note: 'SSRF-shaped input was recorded but no outbound request was performed.',
  });
});

router.get('/debug/:probe', (req, res) => {
  res.json({
    probe: req.params.probe,
    environment: 'synthetic-demo',
    secrets: 'not-present',
    debug: true,
    _note: 'Synthetic debug response; it contains no configuration or secret values.',
  });
});

router.get('/v0/customers', (req, res) => {
  res.json({
    version: 'v0-deprecated',
    items: customers.slice(0, 5),
    _note: 'Synthetic legacy API inventory endpoint.',
  });
});

router.get('/v1/products', (req, res) => {
  res.json({
    version: 'v1',
    items: products.slice(0, 10),
  });
});

router.post('/integrations/webhook', (req, res) => {
  res.status(202).json({
    accepted: true,
    received: req.body,
    evaluated: false,
    _note: 'Input was echoed as data and was never executed or forwarded.',
  });
});

router.post('/graphql', (req, res) => {
  const operations = Array.isArray(req.body) ? req.body.length : 1;
  const query = Array.isArray(req.body)
    ? req.body.map((item) => item && item.query).join(' ')
    : req.body && req.body.query;

  res.json({
    data: {
      synthetic: true,
      operationCount: operations,
      introspectionRequested: /__schema|__type/.test(String(query || '')),
    },
    _note: 'Synthetic GraphQL parser response; no schema execution occurred.',
  });
});

router.post('/tools/regex', (req, res) => {
  const candidate = String((req.body && req.body.value) || '');
  res.json({
    accepted: true,
    inputLength: candidate.length,
    evaluated: false,
    _note: 'ReDoS-shaped input was measured but not evaluated by a regular expression.',
  });
});

router.post('/security/probe', (req, res) => {
  const category = String((req.body && req.body.category) || 'unspecified').slice(0, 80);
  const payload = req.body && req.body.payload;
  const serializedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload ?? null);

  res.json({
    category,
    received: true,
    payloadType: Array.isArray(payload) ? 'array' : typeof payload,
    payloadLength: serializedPayload.length,
    evaluated: false,
    forwarded: false,
    persisted: false,
    _note: 'PayloadsAllTheThings-shaped input was recorded as inert data only.',
  });
});

router.get('/security/parameters', (req, res) => {
  res.json({
    rawQuery: req.originalUrl.split('?')[1] || '',
    parsedQuery: req.query,
    queryKeys: Object.keys(req.query || {}),
    authorized: false,
    _note: 'Duplicate and nested parameters were observed but did not affect authorization.',
  });
});

router.post('/security/xml', xmlBodyParser, (req, res) => {
  const input = typeof req.body === 'string' ? req.body : '';
  res.json({
    received: true,
    bytes: Buffer.byteLength(input, 'utf8'),
    doctypeDetected: /<!DOCTYPE/i.test(input),
    entityDetected: /<!ENTITY/i.test(input),
    systemIdentifierDetected: /\bSYSTEM\b/i.test(input),
    parsed: false,
    externalEntityResolved: false,
    _note: 'XML was inspected as text only. No XML parser, DTD loader, file read, or network request ran.',
  });
});

router.get('/security/redirect', (req, res) => {
  res.json({
    requestedTarget: req.query.next || req.query.redirect || req.query.url || '',
    redirected: false,
    allowedTargets: ['/account', '/orders'],
    _note: 'Redirect-shaped input was recorded but no Location header or redirect response was produced.',
  });
});

router.get('/security/path', (req, res) => {
  const candidate = String(req.query.value || '');
  res.json({
    candidate,
    traversalShapeDetected: /(?:\.\.[/\\]|%2e|%252e|%2f|%252f)/i.test(candidate),
    resolved: false,
    fileRead: false,
    _note: 'Path-shaped input was never passed to filesystem APIs.',
  });
});

router.get('/security/headers', (req, res) => {
  const candidate = String(req.query.value || '');
  res.json({
    observedOrigin: req.headers.origin || null,
    candidateLength: candidate.length,
    crlfShapeDetected: /(?:\r|\n|%0d|%0a)/i.test(candidate),
    responseHeaderWritten: false,
    transferEncodingObserved: req.headers['transfer-encoding'] || null,
    contentLengthObserved: req.headers['content-length'] || null,
    _note: 'Header-shaped values were returned in JSON only and never copied into response headers.',
  });
});

router.post('/security/prototype', (req, res) => {
  res.json({
    ownProtoPropertyDetected: hasOwn(req.body, '__proto__'),
    ownConstructorPropertyDetected: hasOwn(req.body, 'constructor'),
    globalObjectPolluted: Object.prototype.polluted === true,
    merged: false,
    _note: 'The request object was inspected without merging it into application or global state.',
  });
});

router.post('/security/canary/privilege', requireControlledCanaries, (req, res) => {
  const action = String((req.body && req.body.action) || 'status').toLowerCase();
  if (action === 'reset') {
    resetCanaryUser();
    return res.json({
      userId: canaryUser.id,
      role: canaryUser.role,
      reset: true,
      _note: 'The synthetic canary user was restored to its baseline role.',
    });
  }
  if (action !== 'elevate') {
    return res.json({
      userId: canaryUser.id,
      role: canaryUser.role,
      rollbackAt: canaryUser.rollbackAt,
      _note: 'This state exists only in this Node.js process and grants no Azure or application access.',
    });
  }

  const previousRole = canaryUser.role;
  canaryUser.role = 'admin';
  if (canaryUser.rollbackTimer) {
    clearTimeout(canaryUser.rollbackTimer);
  }
  canaryUser.rollbackAt = new Date(Date.now() + 30000).toISOString();
  canaryUser.rollbackTimer = setTimeout(resetCanaryUser, 30000);
  canaryUser.rollbackTimer.unref();

  res.json({
    userId: canaryUser.id,
    previousRole,
    role: canaryUser.role,
    changed: previousRole !== canaryUser.role,
    rollbackAt: canaryUser.rollbackAt,
    _note: 'Only the ephemeral synthetic canary user changed. Automatic rollback occurs within 30 seconds.',
  });
});

router.get('/security/canary/secret', requireControlledCanaries, async (req, res, next) => {
  try {
    const source = String(req.query.source || 'file').toLowerCase();
    if (source === 'environment') {
      return res.json({
        source,
        requestedPath: req.query.path || null,
        value: process.env.DEMO_CANARY_SECRET || 'SYNTHETIC-CANARY-ENV-NOT-A-REAL-SECRET',
        synthetic: true,
        _note: 'Only the dedicated synthetic canary app setting was read.',
      });
    }
    if (source !== 'file') {
      return res.status(400).json({ error: 'source must be file or environment.' });
    }

    const contents = await fs.readFile(canarySecretsPath, 'utf8');
    return res.json({
      source,
      requestedPath: req.query.path || null,
      resolvedPath: 'api/src/data/canarySecrets.json',
      data: JSON.parse(contents),
      synthetic: true,
      _note: 'The requested path was ignored. Only the allowlisted synthetic canary file was read.',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/security/canary/execute', requireControlledCanaries, (req, res) => {
  const input = String((req.body && req.body.input) || 'defender-canary').slice(0, 128);
  const requestedCode = String((req.body && req.body.code) || '').slice(0, 512);
  const context = vm.createContext(
    { input },
    { codeGeneration: { strings: false, wasm: false } },
  );
  const result = vm.runInContext(
    'Object.freeze({ reversed: input.split("").reverse().join(""), length: input.length })',
    context,
    { timeout: 50 },
  );

  res.json({
    requestedCodeObserved: requestedCode,
    requestedCodeExecuted: false,
    fixedCanaryExecuted: true,
    result,
    timeoutMs: 50,
    _note: 'A fixed allowlisted expression ran in a restricted VM. Request-supplied code was never evaluated.',
  });
});

router.post('/security/canary/callback-receiver', requireControlledCanaries, (req, res) => {
  const expectedToken = process.env.DEMO_CALLBACK_TOKEN;
  if (!expectedToken || req.headers['x-demo-canary-callback'] !== expectedToken) {
    return res.status(401).json({ error: 'Invalid synthetic callback token.' });
  }

  res.json({
    received: true,
    eventId: req.body && req.body.eventId,
    marker: req.body && req.body.marker,
    _note: 'Controlled callback received by the same demo API through APIM.',
  });
});

router.post('/security/canary/callback', requireControlledCanaries, async (req, res, next) => {
  try {
    const callbackUrl = process.env.CONTROLLED_CALLBACK_URL;
    const callbackToken = process.env.DEMO_CALLBACK_TOKEN;
    if (!callbackUrl || !callbackToken) {
      return res.status(503).json({ error: 'Controlled callback configuration is incomplete.' });
    }

    const target = new URL(callbackUrl);
    if (
      target.protocol !== 'https:'
      || !target.hostname.endsWith('.azure-api.net')
      || target.pathname !== '/retail/api/security/canary/callback-receiver'
    ) {
      return res.status(500).json({ error: 'Controlled callback URL failed its fixed APIM allowlist.' });
    }

    const eventId = randomUUID();
    const callbackResponse = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Canary-Callback': callbackToken,
      },
      body: JSON.stringify({
        eventId,
        marker: 'SYNTHETIC-CONTROLLED-CALLBACK',
      }),
      signal: AbortSignal.timeout(5000),
    });
    const callbackResult = await callbackResponse.json();
    if (!callbackResponse.ok) {
      return res.status(502).json({
        error: `Controlled callback returned HTTP ${callbackResponse.status}.`,
        callbackResult,
      });
    }

    return res.json({
      callbackSent: true,
      callbackHost: target.hostname,
      eventId,
      receiverConfirmed: callbackResult.received === true,
      arbitraryTargetAllowed: false,
      _note: 'The callback destination is fixed to this demo API through its own APIM gateway.',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/security/canary/suspicious-user-agent', async (req, res, next) => {
  try {
    const gatewayBaseUrl = process.env.API_GATEWAY_BASE_URL;
    if (!gatewayBaseUrl) {
      return res.status(503).json({ error: 'API gateway URL is not configured.' });
    }

    const target = new URL(`${gatewayBaseUrl.replace(/\/$/, '')}/api/tools/health`);
    if (
      target.protocol !== 'https:'
      || !target.hostname.endsWith('.azure-api.net')
      || target.pathname !== '/retail/api/tools/health'
    ) {
      return res.status(500).json({ error: 'Suspicious User-Agent validation target failed its APIM allowlist.' });
    }

    const validationResponse = await fetch(target, {
      headers: {
        'User-Agent': 'javascript:',
        'X-Demo-Traffic': 'official-defender-validation',
      },
      signal: AbortSignal.timeout(10000),
    });
    const responseBody = await validationResponse.json();
    return res.status(validationResponse.ok ? 200 : 502).json({
      validationRequestSent: true,
      targetHost: target.hostname,
      targetPath: target.pathname,
      userAgent: 'javascript:',
      targetStatus: validationResponse.status,
      targetResponse: responseBody,
      expectedAlertId: 'API_AccessFromSuspiciousUserAgent',
      _note: 'This uses the exact User-Agent value from Microsoft Defender for APIs validation guidance.',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
