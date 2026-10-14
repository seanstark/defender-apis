// Defender for APIs demo console - synthetic traffic generator
// All requests target the mock retail API (see /api/src/routes/*.js and /apim/openapi.yaml).
(function () {
  'use strict';

  const LS_KEY = 'defenderApisDemo.apiBaseUrl';
  const logEl = document.getElementById('console-log');
  const statusPill = document.getElementById('connection-status');
  const urlInput = document.getElementById('api-base-url');

  // ---------------------------------------------------------------------
  // Logging helpers
  // ---------------------------------------------------------------------
  function log(message, level) {
    level = level || 'info';
    const ts = new Date().toISOString().split('T')[1].replace('Z', '');
    const line = document.createElement('div');
    line.className = 'log-line log-' + level;
    line.textContent = '[' + ts + '] ' + message;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  document.getElementById('btn-clear-log').addEventListener('click', function () {
    logEl.innerHTML = '';
  });

  // ---------------------------------------------------------------------
  // Base URL handling
  // ---------------------------------------------------------------------
  function getBaseUrl() {
    return (urlInput.value || '').trim().replace(/\/+$/, '');
  }

  function loadBaseUrl() {
    const stored = window.localStorage.getItem(LS_KEY);
    urlInput.value = stored || window.DEFAULT_API_BASE_URL || '';
  }

  document.getElementById('btn-save-url').addEventListener('click', function () {
    window.localStorage.setItem(LS_KEY, getBaseUrl());
    log('Saved API base URL: ' + (getBaseUrl() || '(empty)'));
  });

  document.getElementById('btn-test-connection').addEventListener('click', async function () {
    const base = getBaseUrl();
    if (!base) {
      setStatus('unknown', 'Enter a URL first');
      return;
    }
    setStatus('unknown', 'Testing...');
    try {
      const started = performance.now();
      const res = await fetch(base + '/api/tools/health', { method: 'GET' });
      const ms = Math.round(performance.now() - started);
      if (res.ok) {
        setStatus('ok', 'Connected (' + ms + ' ms)');
        log('Connection test succeeded against ' + base + '/api/tools/health in ' + ms + ' ms', 'success');
      } else {
        setStatus('error', 'HTTP ' + res.status);
        log('Connection test returned HTTP ' + res.status, 'error');
      }
    } catch (err) {
      setStatus('error', 'Failed');
      log('Connection test failed: ' + err.message + '. This is often a CORS or DNS issue - double-check the base URL.', 'error');
    }
  });

  function setStatus(kind, text) {
    statusPill.className = 'status-pill status-' + kind;
    statusPill.textContent = text;
  }

  // ---------------------------------------------------------------------
  // Generic HTTP + batch runner
  // ---------------------------------------------------------------------
  async function call(path, opts) {
    opts = opts || {};
    const base = getBaseUrl();
    const url = base + path;
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers: opts.headers || undefined,
        body: opts.body
      });
      const ms = Math.round(performance.now() - started);
      return { ok: res.ok, status: res.status, ms: ms, url: url };
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      return { ok: false, status: 0, ms: ms, url: url, error: err.message };
    }
  }

  // Runs `count` invocations of taskFn(index) with up to `concurrency` in flight at once.
  // taskFn must return a Promise resolving to { ok, status, ms }. Returns a cancel() handle.
  function runBatch(label, count, concurrency, taskFn, onDone) {
    let cancelled = false;
    let started = 0;
    let completed = 0;
    let successes = 0;
    let failures = 0;
    let totalMs = 0;
    const startTime = performance.now();
    const progressEvery = Math.max(1, Math.floor(count / 10));

    log(label + ': starting ' + count + ' request(s) at concurrency ' + concurrency + '...');

    function next() {
      if (cancelled) return Promise.resolve();
      if (started >= count) return Promise.resolve();
      const i = started++;
      return taskFn(i).then(function (result) {
        completed++;
        totalMs += result.ms || 0;
        if (result.ok) successes++; else failures++;
        if (completed % progressEvery === 0 || completed === count) {
          log(label + ': ' + completed + '/' + count + ' complete (' + successes + ' ok, ' + failures + ' failed)');
        }
        if (!cancelled && started < count) return next();
      });
    }

    const workers = [];
    for (let w = 0; w < Math.min(concurrency, count); w++) {
      workers.push(next());
    }
    Promise.all(workers).then(function () {
      const elapsed = Math.round(performance.now() - startTime);
      const avg = completed ? Math.round(totalMs / completed) : 0;
      if (cancelled) {
        log(label + ': stopped by user after ' + completed + '/' + count + ' request(s).', 'warn');
      } else {
        log(label + ': finished. ' + successes + ' succeeded, ' + failures + ' failed, elapsed ' + elapsed + ' ms, avg latency ' + avg + ' ms.', 'success');
      }
      if (onDone) onDone();
    });

    return {
      cancel: function () { cancelled = true; }
    };
  }

  function randomString(len) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let out = '';
    for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ---------------------------------------------------------------------
  // Baseline traffic toggle
  // ---------------------------------------------------------------------
  let baselineTimer = null;
  const baselineToggle = document.getElementById('baseline-toggle');
  const baselineStatus = document.getElementById('baseline-status');

  baselineToggle.addEventListener('change', function () {
    if (baselineToggle.checked) {
      baselineStatus.innerHTML = 'Baseline traffic is currently <strong>on</strong> - sending one request every ~4 seconds.';
      log('Baseline traffic started.');
      baselineTimer = setInterval(async function () {
        const target = Math.random() < 0.5 ? '/api/products?pageSize=5' : '/api/tools/health';
        const r = await call(target);
        log('Baseline GET ' + target + ' -> ' + (r.ok ? r.status : 'error') + ' (' + r.ms + ' ms)');
      }, 4000);
    } else {
      baselineStatus.innerHTML = 'Baseline traffic is currently <strong>off</strong>.';
      log('Baseline traffic stopped.');
      clearInterval(baselineTimer);
      baselineTimer = null;
    }
  });

  // ---------------------------------------------------------------------
  // Scenario card rendering
  // ---------------------------------------------------------------------
  const grid = document.getElementById('scenario-grid');

  function el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function badgeList(alerts) {
    return alerts.map(function (a) {
      return '<span class="badge">' + a + '</span>';
    }).join(' ');
  }

  // Builds a standard card with numeric inputs, a Run button, a Stop button and a status line.
  // spec: { id, title, alerts: [], description, fields: [{key,label,default,min,max}], run(values, handle) }
  function buildStandardCard(spec) {
    const card = el('div', 'card scenario-card');
    card.id = 'scenario-' + spec.id;

    const head = el('div', 'card-head');
    head.appendChild(el('h3', null, spec.title));
    card.appendChild(head);
    card.appendChild(el('div', 'badges', badgeList(spec.alerts)));
    card.appendChild(el('p', 'scenario-desc', spec.description));

    const fieldsWrap = el('div', 'fields-row');
    const values = {};
    (spec.fields || []).forEach(function (f) {
      const wrap = el('label', 'field');
      wrap.appendChild(el('span', null, f.label));
      const input = document.createElement('input');
      input.type = 'number';
      input.value = f.default;
      if (f.min !== undefined) input.min = f.min;
      if (f.max !== undefined) input.max = f.max;
      wrap.appendChild(input);
      fieldsWrap.appendChild(wrap);
      values[f.key] = { get: function () { return Number(input.value) || f.default; } };
    });
    card.appendChild(fieldsWrap);

    const actions = el('div', 'card-actions');
    const runBtn = el('button', 'btn btn-primary', 'Run scenario');
    const stopBtn = el('button', 'btn btn-secondary', 'Stop');
    stopBtn.disabled = true;
    actions.appendChild(runBtn);
    actions.appendChild(stopBtn);
    card.appendChild(actions);

    let handle = null;
    runBtn.addEventListener('click', function () {
      if (!getBaseUrl()) {
        log('Set and save an API base URL before running scenarios.', 'error');
        return;
      }
      const resolved = {};
      Object.keys(values).forEach(function (k) { resolved[k] = values[k].get(); });
      runBtn.disabled = true;
      stopBtn.disabled = false;
      handle = spec.run(resolved, function onDone() {
        runBtn.disabled = false;
        stopBtn.disabled = true;
      });
    });
    stopBtn.addEventListener('click', function () {
      if (handle) handle.cancel();
      stopBtn.disabled = true;
    });

    grid.appendChild(card);
  }

  // Builds an informational-only card (no live traffic possible from a browser), with a copy button.
  function buildInfoCard(spec) {
    const card = el('div', 'card scenario-card scenario-card-info');
    card.id = 'scenario-' + spec.id;
    const head = el('div', 'card-head');
    head.appendChild(el('h3', null, spec.title));
    card.appendChild(head);
    card.appendChild(el('div', 'badges', badgeList(spec.alerts)));
    card.appendChild(el('p', 'scenario-desc', spec.description));
    if (spec.snippet) {
      const pre = el('pre', 'snippet', escapeHtml(spec.snippet));
      card.appendChild(pre);
      const copyBtn = el('button', 'btn btn-secondary btn-small', 'Copy snippet');
      copyBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(spec.snippet.replace('{{BASE_URL}}', getBaseUrl() || 'https://your-apim-name.azure-api.net/retail'))
          .then(function () { log('Copied ' + spec.title + ' snippet to clipboard.'); })
          .catch(function () { log('Could not copy to clipboard - select and copy the snippet manually.', 'warn'); });
      });
      card.appendChild(copyBtn);
    }
    grid.appendChild(card);
  }

  // Builds a card with several independent one-shot action buttons (used for sensitive-data walkthrough).
  function buildActionsCard(spec) {
    const card = el('div', 'card scenario-card');
    card.id = 'scenario-' + spec.id;
    const head = el('div', 'card-head');
    head.appendChild(el('h3', null, spec.title));
    card.appendChild(head);
    card.appendChild(el('div', 'badges', badgeList(spec.alerts)));
    card.appendChild(el('p', 'scenario-desc', spec.description));
    const actions = el('div', 'card-actions card-actions-wrap');
    spec.actions.forEach(function (a) {
      const btn = el('button', 'btn btn-secondary btn-small', a.label);
      btn.addEventListener('click', async function () {
        if (!getBaseUrl()) {
          log('Set and save an API base URL before calling endpoints.', 'error');
          return;
        }
        log('Calling ' + a.path + ' ...');
        const r = await call(a.path);
        if (r.ok) {
          let extra = '';
          try {
            const res = await fetch(getBaseUrl() + a.path);
            const json = await res.json();
            extra = summarizeSensitiveFields(json);
          } catch (e) { /* best effort only */ }
          log(a.label + ' -> HTTP ' + r.status + ' in ' + r.ms + ' ms.' + (extra ? ' ' + extra : ''), 'success');
        } else {
          log(a.label + ' -> HTTP ' + r.status + (r.error ? ' (' + r.error + ')' : ''), 'error');
        }
      });
      actions.appendChild(btn);
    });
    card.appendChild(actions);
    grid.appendChild(card);
  }

  function summarizeSensitiveFields(json) {
    const text = JSON.stringify(json);
    const found = [];
    if (/ssn/i.test(text)) found.push('SSN');
    if (/cardNumber|card_number/i.test(text)) found.push('card numbers');
    if (/apiKey|api_key/i.test(text)) found.push('API keys');
    if (/password/i.test(text)) found.push('passwords');
    if (/email/i.test(text)) found.push('emails');
    if (/phone/i.test(text)) found.push('phone numbers');
    if (!found.length) return '';
    return 'Sensitive fields observed: ' + found.join(', ') + '.';
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
  }

  // ---------------------------------------------------------------------
  // Scenario definitions
  // ---------------------------------------------------------------------

  buildStandardCard({
    id: 'traffic-spike',
    title: 'Traffic Spike Burst',
    alerts: ['API_SpikeInAPITraffic'],
    description: 'Fires a rapid burst of requests at a single endpoint, well above its established baseline rate, to trigger a volumetric traffic-spike detection.',
    fields: [
      { key: 'count', label: 'Request count', default: 300, min: 10, max: 5000 },
      { key: 'concurrency', label: 'Concurrency', default: 20, min: 1, max: 100 }
    ],
    run: function (v, onDone) {
      return runBatch('Traffic spike', v.count, v.concurrency, function () {
        return call('/api/products?pageSize=5');
      }, onDone);
    }
  });

  buildStandardCard({
    id: 'population-spike',
    title: 'Simulated Population Spike',
    alerts: ['API_PopulationSpikeInAPITraffic'],
    description: 'Rotates a synthetic client-identifier header on every request to emulate many distinct callers. Note: this detection is based on distinct source IPs, which a single browser cannot change - for a faithful demo, fire this scenario concurrently from several machines/networks (or Cloud Shell sessions) against the same endpoint.',
    fields: [
      { key: 'count', label: 'Request count', default: 300, min: 10, max: 5000 },
      { key: 'concurrency', label: 'Concurrency', default: 20, min: 1, max: 100 }
    ],
    run: function (v, onDone) {
      return runBatch('Population spike (single-origin simulation)', v.count, v.concurrency, function (i) {
        return call('/api/products?pageSize=5', { headers: { 'X-Demo-Client-Id': 'client-' + randomString(8) + '-' + i } });
      }, onDone);
    }
  });

  buildStandardCard({
    id: 'request-payload-spike',
    title: 'Large Request Payload',
    alerts: ['API_SpikeInPayload (request)'],
    description: 'Submits oversized request bodies to the upload endpoint, well above typical payload sizes, to trigger a request payload-size anomaly.',
    fields: [
      { key: 'sizeKb', label: 'Payload size (KB)', default: 2048, min: 1, max: 10240 },
      { key: 'count', label: 'Request count', default: 8, min: 1, max: 50 }
    ],
    run: function (v, onDone) {
      const payload = JSON.stringify({ filename: 'bulk-upload.bin', data: 'A'.repeat(v.sizeKb * 1024) });
      return runBatch('Large request payload', v.count, 3, function () {
        return call('/api/tools/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
      }, onDone);
    }
  });

  buildStandardCard({
    id: 'response-payload-spike',
    title: 'Large Response Payload',
    alerts: ['API_SpikeInPayload (response)'],
    description: 'Requests an oversized synthetic report, well above typical response sizes, to trigger a response payload-size anomaly.',
    fields: [
      { key: 'sizeKb', label: 'Report size (KB)', default: 4096, min: 1, max: 10240 },
      { key: 'count', label: 'Request count', default: 6, min: 1, max: 50 }
    ],
    run: function (v, onDone) {
      return runBatch('Large response payload', v.count, 2, function () {
        return call('/api/tools/large-report?sizeKb=' + v.sizeKb);
      }, onDone);
    }
  });

  buildStandardCard({
    id: 'latency-spike',
    title: 'Latency Spike',
    alerts: ['API_SpikeInLatency'],
    description: 'Requests an endpoint that deliberately delays its response, well above typical response times, to trigger a latency anomaly.',
    fields: [
      { key: 'delayMs', label: 'Delay (ms)', default: 8000, min: 100, max: 30000 },
      { key: 'count', label: 'Request count', default: 15, min: 1, max: 100 },
      { key: 'concurrency', label: 'Concurrency', default: 10, min: 1, max: 50 }
    ],
    run: function (v, onDone) {
      return runBatch('Latency spike', v.count, v.concurrency, function () {
        return call('/api/tools/delay?ms=' + v.delayMs);
      }, onDone);
    }
  });

  buildStandardCard({
    id: 'param-spray',
    title: 'Parameter Spray',
    alerts: ['API_SprayInRequests'],
    description: 'Rapidly hits the search endpoint with many different query values in quick succession, resembling a spraying/fuzzing access pattern.',
    fields: [
      { key: 'count', label: 'Request count', default: 250, min: 10, max: 5000 },
      { key: 'concurrency', label: 'Concurrency', default: 25, min: 1, max: 100 }
    ],
    run: function (v, onDone) {
      return runBatch('Parameter spray', v.count, v.concurrency, function () {
        return call('/api/search?q=' + randomString(6) + '&category=' + randomString(4));
      }, onDone);
    }
  });

  buildStandardCard({
    id: 'param-enum',
    title: 'Parameter Enumeration',
    alerts: ['API_ParameterEnumeration', 'API_DistributedParameterEnumeration'],
    description: 'Sequentially walks through resource identifiers (customer and order IDs) one after another, a classic enumeration/IDOR-probing pattern. For the "distributed" variant, run this concurrently from multiple networks.',
    fields: [
      { key: 'startId', label: 'Start ID', default: 1, min: 1, max: 1000 },
      { key: 'count', label: 'IDs to walk', default: 200, min: 5, max: 800 }
    ],
    run: function (v, onDone) {
      return runBatch('Parameter enumeration', v.count, 1, function (i) {
        const id = v.startId + i;
        const path = (i % 2 === 0) ? '/api/customers/' + id : '/api/orders/' + id;
        return call(path);
      }, onDone);
    }
  });

  buildStandardCard({
    id: 'unseen-param-type',
    title: 'Unseen Parameter Type',
    alerts: ['API_UnseenParamType'],
    description: 'Sends known query parameters with an unexpected data type (a number where a string enum is expected, and vice versa), which the API flags via its own type-mismatch detector in addition to triggering Defender for APIs.',
    fields: [
      { key: 'count', label: 'Request count', default: 40, min: 1, max: 500 }
    ],
    run: function (v, onDone) {
      return runBatch('Unseen parameter type', v.count, 5, function (i) {
        const path = (i % 2 === 0)
          ? '/api/orders?status=' + randomInt(1000, 9999)
          : '/api/orders?customerId=' + randomString(5);
        return call(path);
      }, onDone);
    }
  });

  buildStandardCard({
    id: 'unseen-param',
    title: 'Unseen Parameter',
    alerts: ['API_UnseenParam'],
    description: 'Adds entirely new, never-before-seen query parameter names to requests against known endpoints, which fall outside the learned API schema.',
    fields: [
      { key: 'count', label: 'Request count', default: 40, min: 1, max: 500 }
    ],
    run: function (v, onDone) {
      return runBatch('Unseen parameter', v.count, 5, function () {
        const paramName = 'x_' + randomString(6);
        return call('/api/orders?' + paramName + '=' + randomString(8));
      }, onDone);
    }
  });

  buildActionsCard({
    id: 'sensitive-data',
    title: 'Sensitive Data Exposure Walkthrough',
    alerts: ['API security posture - sensitive data classification'],
    description: 'Calls endpoints in the mock workload that intentionally return synthetic PII, payment, and credential-like data without authentication - useful for demonstrating API security posture\'s sensitive data discovery (all values are fabricated, not real).',
    actions: [
      { label: 'List customers (PII)', path: '/api/customers' },
      { label: "Customer payment methods", path: '/api/customers/1/payment-methods' },
      { label: 'Admin users + API keys', path: '/api/admin/users' },
      { label: 'Full data export', path: '/api/admin/export' },
      { label: 'Large synthetic report', path: '/api/tools/large-report?sizeKb=256' }
    ]
  });

  buildInfoCard({
    id: 'tor-suspicious-ip',
    title: 'Tor Exit Node / Suspicious IP Access',
    alerts: ['API_AccessFromTorExitNode', 'API_AccessFromSuspiciousIP'],
    description: 'These alerts rely on Microsoft threat intelligence recognizing the caller\'s network-layer source IP address as a known Tor exit node or otherwise suspicious/malicious IP. A browser cannot spoof its own network origin, so this cannot be simulated client-side. To demo this, issue a request to the API (e.g. with curl below) from a machine whose outbound IP is a known Tor exit node (for example, over the Tor Browser) or from an IP address with an existing threat-intel reputation.',
    snippet: 'curl "{{BASE_URL}}/api/tools/health" -A "Demo-Client/1.0"\n# Run this from a Tor exit node or a host with a known-malicious IP reputation to trigger the alert.'
  });

  buildInfoCard({
    id: 'suspicious-user-agent',
    title: 'Suspicious User-Agent',
    alerts: ['API_AccessFromSuspiciousUserAgent'],
    description: 'Browsers do not allow JavaScript to override the User-Agent header, so this scenario cannot be fired from this page. Use the snippet below (curl or PowerShell) to call the echo endpoint with a User-Agent string matching a known scanning/attack tool signature.',
    snippet: 'curl "{{BASE_URL}}/api/tools/echo" -A "sqlmap/1.6.12#stable (http://sqlmap.org)"\n\n# PowerShell:\nInvoke-WebRequest -Uri "{{BASE_URL}}/api/tools/echo" -UserAgent "Nikto/2.5.0"'
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  loadBaseUrl();
  log('Console ready. Configure the API base URL above, then save and test the connection before running scenarios.');
})();
