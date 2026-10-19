// Defender for APIs demo console - synthetic traffic generator
// All requests target the mock retail API (see /api/src/routes/*.js and /apim/openapi.yaml).
(function () {
  'use strict';

  const LS_KEY = 'defenderApisDemo.apiBaseUrl';
  const logEl = document.getElementById('console-log');
  const statusPill = document.getElementById('connection-status');
  const urlInput = document.getElementById('api-base-url');
  let suppressLogging = false;
  let requestPreviewCapture = null;

  // ---------------------------------------------------------------------
  // Logging helpers
  // ---------------------------------------------------------------------
  function log(message, level) {
    if (suppressLogging) return;
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
  // Synthetic sensitive-file upload
  // ---------------------------------------------------------------------
  const fileInput = document.getElementById('sensitive-file-input');
  const uploadButton = document.getElementById('btn-upload-sensitive-file');
  const uploadStatus = document.getElementById('upload-status');
  const uploadResult = document.getElementById('upload-result');

  function setUploadStatus(kind, text) {
    uploadStatus.className = 'status-pill status-' + kind;
    uploadStatus.textContent = text;
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const value = String(reader.result || '');
        resolve(value.slice(value.indexOf(',') + 1));
      };
      reader.onerror = function () {
        reject(reader.error || new Error('The file could not be read.'));
      };
      reader.readAsDataURL(file);
    });
  }

  fileInput.addEventListener('change', function () {
    const file = fileInput.files && fileInput.files[0];
    setUploadStatus('unknown', file ? file.name + ' (' + file.size + ' bytes)' : 'No file selected');
    uploadResult.textContent = '';
  });

  uploadButton.addEventListener('click', async function () {
    const base = getBaseUrl();
    const file = fileInput.files && fileInput.files[0];
    if (!base) {
      setUploadStatus('error', 'Set the API URL first');
      return;
    }
    if (!file) {
      setUploadStatus('error', 'Choose a file first');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadStatus('error', 'File exceeds 5 MB');
      return;
    }

    uploadButton.disabled = true;
    setUploadStatus('unknown', 'Uploading...');
    uploadResult.textContent = '';
    try {
      const contentBase64 = await readFileAsBase64(file);
      const response = await fetch(base + '/api/storage/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBase64: contentBase64
        })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Upload returned HTTP ' + response.status);
      }

      setUploadStatus('ok', 'Uploaded ' + result.bytes + ' bytes');
      const link = document.createElement('a');
      link.href = result.publicUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open the publicly readable blob';
      uploadResult.replaceChildren(link);
      log('Sensitive-file demo upload succeeded: ' + result.blobName + ' (' + result.bytes + ' bytes).', 'success');
    } catch (error) {
      setUploadStatus('error', 'Upload failed');
      uploadResult.textContent = error.message;
      log('Sensitive-file demo upload failed: ' + error.message, 'error');
    } finally {
      uploadButton.disabled = false;
    }
  });

  // ---------------------------------------------------------------------
  // Generic HTTP + batch runner
  // ---------------------------------------------------------------------
  async function call(path, opts) {
    opts = opts || {};
    const base = getBaseUrl();
    const url = base + path;
    const method = opts.method || 'GET';
    if (requestPreviewCapture) {
      const headers = opts.headers || {};
      const body = opts.body === undefined ? null : String(opts.body);
      const signature = [method, path, JSON.stringify(headers), body && body.length, body && body.slice(0, 256)].join('|');
      requestPreviewCapture.total++;
      if (!requestPreviewCapture.seen.has(signature) && requestPreviewCapture.requests.length < 16) {
        requestPreviewCapture.seen.add(signature);
        requestPreviewCapture.requests.push({ method: method, path: path, headers: headers, body: body });
      }
      return { ok: true, status: 200, ms: 0, url: url, preview: true };
    }
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method: method,
        headers: opts.headers || undefined,
        body: opts.body
      });
      const ms = Math.round(performance.now() - started);
      const expectedStatuses = opts.expectedStatuses || [];
      return { ok: res.ok || expectedStatuses.includes(res.status), status: res.status, ms: ms, url: url };
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
  const runnableScenarios = [];
  const runAllButton = document.getElementById('btn-run-all-scenarios');
  const runAllStatus = document.getElementById('run-all-status');

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

  function summarizePreviewBody(body) {
    if (body === null) return '';
    if (body.length <= 3000) return body;
    return body.slice(0, 1500)
      + '\n\n... [preview shortened; exact body length: ' + body.length + ' characters] ...\n\n'
      + body.slice(-300);
  }

  function formatRequestPreview(capture) {
    if (!capture.requests.length) return 'No HTTP request is generated by this test.';
    const requests = capture.requests.map(function (request, index) {
      const lines = [
        'Request ' + (index + 1),
        request.method + ' ' + request.path
      ];
      const headerNames = Object.keys(request.headers);
      if (headerNames.length) {
        lines.push('Headers:');
        headerNames.forEach(function (name) {
          lines.push('  ' + name + ': ' + request.headers[name]);
        });
      }
      if (request.body !== null) {
        lines.push('Body:');
        lines.push(summarizePreviewBody(request.body));
      }
      return lines.join('\n');
    });
    if (capture.total > capture.requests.length) {
      requests.push(
        capture.total + ' total requests are generated. '
        + capture.requests.length + ' unique request payloads are shown; repeated requests are collapsed.'
      );
    }
    requests.push('Randomized values shown here are regenerated when the test runs.');
    return requests.join('\n\n----------------------------------------\n\n');
  }

  async function captureRequests(runFn) {
    if (requestPreviewCapture) {
      throw new Error('Another payload preview is already being generated.');
    }
    const capture = { requests: [], total: 0, seen: new Set() };
    requestPreviewCapture = capture;
    suppressLogging = true;
    try {
      await runFn();
      return capture;
    } finally {
      requestPreviewCapture = null;
      suppressLogging = false;
    }
  }

  function appendPayloadPreview(container, captureFn) {
    const details = el('details', 'payload-preview');
    const summary = el('summary', null, 'Show exact request payload');
    const preview = document.createElement('pre');
    preview.textContent = 'Expand to generate the request preview from the same test code.';
    details.appendChild(summary);
    details.appendChild(preview);
    details.addEventListener('toggle', async function () {
      if (!details.open || details.dataset.loaded === 'true') return;
      details.dataset.loaded = 'true';
      preview.textContent = 'Generating payload preview...';
      try {
        preview.textContent = formatRequestPreview(await captureFn());
      } catch (error) {
        details.dataset.loaded = 'false';
        preview.textContent = 'Payload preview failed: ' + error.message;
      }
    });
    container.appendChild(details);
  }

  function registerRunnableScenario(title, run) {
    runnableScenarios.push({ title: title, run: run });
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
    if ((spec.fields || []).length) {
      const options = el('details', 'scenario-options');
      options.appendChild(el('summary', null, 'Configure parameters'));
      options.appendChild(fieldsWrap);
      card.appendChild(options);
    }

    const actions = el('div', 'card-actions');
    const runBtn = el('button', 'btn btn-primary', 'Run scenario');
    const stopBtn = el('button', 'btn btn-secondary', 'Stop');
    stopBtn.disabled = true;
    actions.appendChild(runBtn);
    actions.appendChild(stopBtn);
    card.appendChild(actions);

    let handle = null;
    function resolvedValues() {
      const resolved = {};
      Object.keys(values).forEach(function (k) { resolved[k] = values[k].get(); });
      return resolved;
    }

    function runCard() {
      if (!getBaseUrl()) {
        log('Set and save an API base URL before running scenarios.', 'error');
        return Promise.resolve();
      }
      runBtn.disabled = true;
      stopBtn.disabled = false;
      return new Promise(function (resolve) {
        handle = spec.run(resolvedValues(), function onDone() {
          runBtn.disabled = false;
          stopBtn.disabled = true;
          handle = null;
          resolve();
        });
      });
    }

    appendPayloadPreview(card, function () {
      return captureRequests(function () {
        return new Promise(function (resolve) {
          spec.run(resolvedValues(), resolve);
        });
      });
    });

    runBtn.addEventListener('click', function () {
      runCard();
    });
    stopBtn.addEventListener('click', function () {
      if (handle) handle.cancel();
      stopBtn.disabled = true;
    });

    registerRunnableScenario(spec.title, runCard);
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
      const details = el('details', 'payload-preview');
      details.appendChild(el('summary', null, 'Show exact request payload'));
      const pre = document.createElement('pre');
      pre.textContent = spec.snippet;
      details.appendChild(pre);
      card.appendChild(details);
      const copyBtn = el('button', 'btn btn-secondary btn-small', 'Copy payload');
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
    async function runAction(a) {
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
    }

    async function runAllActions() {
      for (let i = 0; i < spec.actions.length; i++) {
        await runAction(spec.actions[i]);
      }
    }

    spec.actions.forEach(function (a) {
      const btn = el('button', 'btn btn-secondary btn-small', a.label);
      btn.addEventListener('click', function () {
        runAction(a);
      });
      actions.appendChild(btn);
    });
    card.appendChild(actions);
    appendPayloadPreview(card, function () {
      return captureRequests(async function () {
        for (let i = 0; i < spec.actions.length; i++) {
          await call(spec.actions[i].path);
        }
      });
    });
    registerRunnableScenario(spec.title, runAllActions);
    grid.appendChild(card);
  }

  function runBatchPromise(label, count, concurrency, taskFn) {
    return new Promise(function (resolve) {
      runBatch(label, count, concurrency, taskFn, resolve);
    });
  }

  function runBatchSequence(steps, onDone) {
    let cancelled = false;
    let activeHandle = null;

    async function execute() {
      for (let i = 0; i < steps.length; i++) {
        if (cancelled) break;
        const step = steps[i];
        await new Promise(function (resolve) {
          activeHandle = runBatch(step.label, step.count, step.concurrency, step.task, resolve);
        });
      }
      activeHandle = null;
      if (onDone) onDone();
    }

    execute().catch(function (error) {
      log('Scenario sequence failed: ' + error.message, 'error');
      activeHandle = null;
      if (onDone) onDone();
    });

    return {
      cancel: function () {
        cancelled = true;
        if (activeHandle) activeHandle.cancel();
      }
    };
  }

  function buildPatternSuiteCard(spec) {
    const patterns = spec.patterns;
    const card = el('div', 'card scenario-card scenario-card-wide');
    card.id = 'scenario-' + spec.id;
    const head = el('div', 'card-head');
    head.appendChild(el('h3', null, spec.title));
    const runAllBtn = el('button', 'btn btn-primary btn-small', spec.runAllLabel);
    head.appendChild(runAllBtn);
    card.appendChild(head);
    card.appendChild(el('div', 'badges', badgeList(spec.badges)));
    card.appendChild(el('p', 'scenario-desc', spec.description));
    if (spec.sourceUrl) {
      const source = el('p', 'hint', 'Source: ');
      const sourceLink = document.createElement('a');
      sourceLink.href = spec.sourceUrl;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener';
      sourceLink.textContent = spec.sourceLabel;
      source.appendChild(sourceLink);
      card.appendChild(source);
    }

    const list = el('div', 'owasp-pattern-list');
    patterns.forEach(function (pattern) {
      const row = el('div', 'owasp-pattern');
      const details = el('div', 'owasp-pattern-details');
      details.appendChild(el('strong', null, pattern.category + ' - ' + pattern.title));
      details.appendChild(el('span', null, pattern.description));
      appendPayloadPreview(details, function () {
        return captureRequests(pattern.run);
      });
      row.appendChild(details);
      const button = el('button', 'btn btn-secondary btn-small', 'Run');
      button.addEventListener('click', async function () {
        if (!getBaseUrl()) {
          log('Set and save an API base URL before running ' + spec.logLabel + ' tests.', 'error');
          return;
        }
        button.disabled = true;
        try {
          await pattern.run();
        } finally {
          button.disabled = false;
        }
      });
      row.appendChild(button);
      list.appendChild(row);
    });
    card.appendChild(list);

    const note = el(
      'p',
      'hint',
      spec.note
    );
    card.appendChild(note);

    async function runSuite() {
      if (!getBaseUrl()) {
        log('Set and save an API base URL before running the ' + spec.logLabel + ' suite.', 'error');
        return;
      }
      runAllBtn.disabled = true;
      log(spec.logLabel + ' full suite: starting ' + patterns.length + ' traffic patterns.', 'warn');
      try {
        for (let i = 0; i < patterns.length; i++) {
          log(spec.logLabel + ' full suite: [' + (i + 1) + '/' + patterns.length + '] ' + patterns[i].category + ' ' + patterns[i].title);
          await patterns[i].run();
        }
        log(spec.logLabel + ' full suite finished. Check Defender for Cloud after telemetry processing and the applicable learning window.', 'success');
      } finally {
        runAllBtn.disabled = false;
      }
    }

    runAllBtn.addEventListener('click', function () {
      runSuite();
    });

    registerRunnableScenario(spec.title, runSuite);
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

  // ---------------------------------------------------------------------
  // Scenario definitions
  // ---------------------------------------------------------------------

  const apiSprayOperations = [
    { method: 'GET', path: '/api/customers?page=1&pageSize=5' },
    { method: 'GET', path: '/api/customers/1' },
    { method: 'GET', path: '/api/customers/1/payment-methods' },
    { method: 'PATCH', path: '/api/customers/1', body: { syntheticProbe: true } },
    { method: 'GET', path: '/api/orders?status=processing' },
    { method: 'GET', path: '/api/orders/1' },
    { method: 'POST', path: '/api/orders', body: { customerId: 1, items: [] } },
    { method: 'POST', path: '/api/orders/checkout', body: { items: [{ productId: 1, quantity: 1 }] } },
    { method: 'GET', path: '/api/products?page=1&pageSize=5' },
    { method: 'GET', path: '/api/products/1' },
    { method: 'GET', path: '/api/admin/users' },
    { method: 'GET', path: '/api/admin/export' },
    { method: 'GET', path: '/api/search?q=synthetic' },
    { method: 'GET', path: '/api/tools/health' },
    { method: 'GET', path: '/api/tools/echo?probe=discovery' },
    { method: 'GET', path: '/api/tools/large-report?sizeKb=16' },
    { method: 'GET', path: '/api/tools/delay?ms=25' },
    { method: 'POST', path: '/api/tools/upload', body: { data: 'synthetic' } },
    { method: 'POST', path: '/api/auth/login', body: { username: 'guest', password: 'invalid' }, expectedStatuses: [401] },
    { method: 'POST', path: '/api/auth/verify-otp', body: { code: '000000' }, expectedStatuses: [401] },
    { method: 'GET', path: '/api/tools/fetch?url=https%3A%2F%2Fexample.com' },
    { method: 'GET', path: '/api/debug/status' },
    { method: 'GET', path: '/api/v0/customers' },
    { method: 'GET', path: '/api/v1/products' },
    { method: 'POST', path: '/api/integrations/webhook', body: { event: 'synthetic' } },
    { method: 'POST', path: '/api/graphql', body: { query: '{ viewer { id } }' } },
    { method: 'POST', path: '/api/tools/regex', body: { value: 'synthetic' } },
    { method: 'POST', path: '/api/security/probe', body: { category: 'discovery', payload: 'synthetic' } },
    { method: 'GET', path: '/api/security/parameters?id=1&id=2' },
    { method: 'GET', path: '/api/security/redirect?next=%2Faccount' },
    { method: 'GET', path: '/api/security/path?value=synthetic-demo' },
    { method: 'GET', path: '/api/security/headers?value=synthetic' },
    { method: 'POST', path: '/api/security/prototype', body: { synthetic: true } }
  ];

  function callSprayOperation(operation) {
    const opts = {
      method: operation.method,
      expectedStatuses: operation.expectedStatuses
    };
    if (operation.body !== undefined) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(operation.body);
    }
    return call(operation.path, opts);
  }

  buildStandardCard({
    id: 'traffic-spike',
    title: 'Traffic Spike Burst',
    alerts: ['API_SpikeInAPITraffic', '30-day baseline required'],
    description: 'Establishes a short normal-rate sample, then fires a much larger concurrent burst from the same client to the same endpoint and status code. Defender still requires a learned historical baseline and does not publish a guaranteed threshold.',
    fields: [
      { key: 'count', label: 'Burst request count', default: 1200, min: 100, max: 5000 },
      { key: 'concurrency', label: 'Burst concurrency', default: 40, min: 5, max: 100 }
    ],
    run: function (v, onDone) {
      return runBatchSequence([
        {
          label: 'Traffic spike normal-rate phase',
          count: 25,
          concurrency: 2,
          task: function () { return call('/api/products?page=1&pageSize=5'); }
        },
        {
          label: 'Traffic spike attack phase',
          count: v.count,
          concurrency: v.concurrency,
          task: function () { return call('/api/products?page=1&pageSize=5'); }
        }
      ], onDone);
    }
  });

  buildStandardCard({
    id: 'population-spike',
    title: 'Simulated Population Spike',
    alerts: ['API_PopulationSpikeInAPITraffic', 'multiple real source IPs required'],
    description: 'Generates an aggregate-volume spike and labels requests with synthetic client IDs, but does not pretend those headers replace source IPs. The documented population alert requires traffic from multiple real network origins, so run this concurrently from several machines or regions.',
    fields: [
      { key: 'count', label: 'Requests from this origin', default: 1000, min: 100, max: 5000 },
      { key: 'concurrency', label: 'Concurrency', default: 40, min: 5, max: 100 }
    ],
    run: function (v, onDone) {
      return runBatchSequence([
        {
          label: 'Population spike normal-rate phase',
          count: 25,
          concurrency: 2,
          task: function () { return call('/api/products?page=1&pageSize=5'); }
        },
        {
          label: 'Population spike single-origin contribution',
          count: v.count,
          concurrency: v.concurrency,
          task: function (i) {
            return call('/api/products?page=1&pageSize=5', {
              headers: { 'X-Demo-Client-Id': 'population-client-' + i }
            });
          }
        }
      ], onDone);
    }
  });

  buildStandardCard({
    id: 'request-payload-spike',
    title: 'Large Request Payload',
    alerts: ['API_SpikeInPayload (request)', '30-day baseline required'],
    description: 'Sends small normal JSON bodies first, then repeated multi-megabyte bodies to the same operation and status code so the deviation matches the documented request-payload anomaly model.',
    fields: [
      { key: 'sizeKb', label: 'Attack payload size (KB)', default: 5120, min: 512, max: 10240 },
      { key: 'count', label: 'Large request count', default: 10, min: 1, max: 50 }
    ],
    run: function (v, onDone) {
      const payload = JSON.stringify({ filename: 'bulk-upload.bin', data: 'A'.repeat(v.sizeKb * 1024) });
      const normalPayload = JSON.stringify({ filename: 'normal.json', data: 'A'.repeat(1024) });
      return runBatchSequence([
        {
          label: 'Request payload normal-size phase',
          count: 20,
          concurrency: 2,
          task: function () {
            return call('/api/tools/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: normalPayload });
          }
        },
        {
          label: 'Request payload oversized phase',
          count: v.count,
          concurrency: 3,
          task: function () {
            return call('/api/tools/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
          }
        }
      ], onDone);
    }
  });

  buildStandardCard({
    id: 'response-payload-spike',
    title: 'Large Response Payload',
    alerts: ['API_SpikeInPayload (response)', '30-day baseline required'],
    description: 'Requests small reports first and then repeated 8 MB-class responses from the same operation, client, and status code.',
    fields: [
      { key: 'sizeKb', label: 'Attack response size (KB)', default: 8192, min: 512, max: 10240 },
      { key: 'count', label: 'Large response count', default: 8, min: 1, max: 50 }
    ],
    run: function (v, onDone) {
      return runBatchSequence([
        {
          label: 'Response payload normal-size phase',
          count: 20,
          concurrency: 2,
          task: function () { return call('/api/tools/large-report?sizeKb=16'); }
        },
        {
          label: 'Response payload oversized phase',
          count: v.count,
          concurrency: 2,
          task: function () { return call('/api/tools/large-report?sizeKb=' + v.sizeKb); }
        }
      ], onDone);
    }
  });

  buildStandardCard({
    id: 'latency-spike',
    title: 'Latency Spike',
    alerts: ['API_SpikeInLatency (Preview)', '30-day baseline required'],
    description: 'Calls the same endpoint at normal latency first, then produces repeated 20-second responses with the same status code. The latency alert remains preview and baseline-dependent.',
    fields: [
      { key: 'delayMs', label: 'Attack delay (ms)', default: 20000, min: 1000, max: 30000 },
      { key: 'count', label: 'Delayed request count', default: 20, min: 1, max: 100 },
      { key: 'concurrency', label: 'Concurrency', default: 10, min: 1, max: 50 }
    ],
    run: function (v, onDone) {
      return runBatchSequence([
        {
          label: 'Latency normal phase',
          count: 20,
          concurrency: 2,
          task: function () { return call('/api/tools/delay?ms=25'); }
        },
        {
          label: 'Latency attack phase',
          count: v.count,
          concurrency: v.concurrency,
          task: function () { return call('/api/tools/delay?ms=' + v.delayMs); }
        }
      ], onDone);
    }
  });

  buildStandardCard({
    id: 'param-spray',
    title: 'API Endpoint Spray',
    alerts: ['API_SprayInRequests', '30-day baseline required'],
    description: 'Touches more than 30 distinct documented APIM operations in rapid succession, matching the documented endpoint-spray behavior instead of varying values on only one endpoint.',
    fields: [
      { key: 'passes', label: 'Passes across operation list', default: 3, min: 1, max: 20 },
      { key: 'concurrency', label: 'Concurrency', default: 12, min: 1, max: 50 }
    ],
    run: function (v, onDone) {
      return runBatch('API endpoint spray', apiSprayOperations.length * v.passes, v.concurrency, function (i) {
        return callSprayOperation(apiSprayOperations[i % apiSprayOperations.length]);
      }, onDone);
    }
  });

  buildStandardCard({
    id: 'param-enum',
    title: 'Parameter Enumeration',
    alerts: ['API_ParameterEnumeration', 'API_DistributedParameterEnumeration needs multiple IPs', '30-day baseline required'],
    description: 'Sends hundreds of distinct customerId values to the same endpoint and parameter inside one run. Only the single-IP alert is reproducible here; the distributed variant requires multiple real source IPs.',
    fields: [
      { key: 'startId', label: 'Starting customerId', default: 100000, min: 1, max: 999999 },
      { key: 'count', label: 'Distinct values', default: 800, min: 50, max: 2000 },
      { key: 'concurrency', label: 'Concurrency', default: 25, min: 1, max: 50 }
    ],
    run: function (v, onDone) {
      return runBatch('Parameter enumeration', v.count, v.concurrency, function (i) {
        return call('/api/orders?customerId=' + (v.startId + i));
      }, onDone);
    }
  });

  buildStandardCard({
    id: 'unseen-param-type',
    title: 'Unseen Parameter Type',
    alerts: ['API_UnseenParamType', '30-day baseline required'],
    description: 'Reinforces normal integer and enum values first, then sends malformed strings, arrays, and operator-shaped values for those same documented parameters.',
    fields: [
      { key: 'count', label: 'Anomalous request count', default: 100, min: 10, max: 500 }
    ],
    run: function (v, onDone) {
      const anomalousValues = ['not-a-number', 'null', 'true', '1,2,3', '[1,2]', '{"$ne":null}'];
      return runBatchSequence([
        {
          label: 'Parameter type normal phase',
          count: 50,
          concurrency: 5,
          task: function (i) {
            return call('/api/orders?customerId=' + ((i % 25) + 1) + '&status=processing');
          }
        },
        {
          label: 'Parameter type anomaly phase',
          count: v.count,
          concurrency: 10,
          task: function (i) {
            const value = anomalousValues[i % anomalousValues.length];
            return call(i % 2
              ? '/api/orders?customerId=' + encodeURIComponent(value)
              : '/api/orders?status=' + encodeURIComponent(value));
          }
        }
      ], onDone);
    }
  });

  buildStandardCard({
    id: 'unseen-param',
    title: 'Unseen Parameter',
    alerts: ['API_UnseenParam', '30-day baseline required'],
    description: 'Reinforces the documented status parameter, then adds many schema-unknown parameter names to the same endpoint.',
    fields: [
      { key: 'count', label: 'Unknown parameter requests', default: 100, min: 10, max: 500 }
    ],
    run: function (v, onDone) {
      return runBatchSequence([
        {
          label: 'Known parameter normal phase',
          count: 50,
          concurrency: 5,
          task: function () { return call('/api/orders?status=processing'); }
        },
        {
          label: 'Previously unseen parameter phase',
          count: v.count,
          concurrency: 10,
          task: function (i) {
            return call('/api/orders?x_attack_probe_' + i + '=synthetic-' + i);
          }
        }
      ], onDone);
    }
  });

  buildActionsCard({
    id: 'sensitive-data',
    title: 'Sensitive Data Exposure Walkthrough',
    alerts: ['Posture finding, not runtime alert', '3 endpoints currently classified'],
    description: 'Calls endpoints that return synthetic PII, payment, and credential-like data without authentication. The live Defender API collection already reports three sensitive-data endpoints and 36 unauthenticated endpoints; these appear as posture/classification findings, not triggered alerts.',
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
    snippet: 'curl "{{BASE_URL}}/api/tools/health" -A "Demo-Client/1.0"\n# The network source must genuinely be a current Tor exit node or Microsoft threat-intelligence-flagged IP. Headers cannot simulate IP reputation.'
  });

  buildStandardCard({
    id: 'suspicious-user-agent',
    title: 'Official Suspicious User-Agent Validation',
    alerts: ['API_AccessFromSuspiciousUserAgent', 'Microsoft documented validation'],
    description: 'Calls a controlled server-side relay that sends the exact Microsoft-documented User-Agent value javascript: through this demo\'s APIM gateway. This is the only Defender for APIs alert with an official one-request validation procedure; Microsoft still describes alert arrival only as "after some time."',
    fields: [
      { key: 'count', label: 'Validation requests', default: 3, min: 1, max: 10 }
    ],
    run: function (v, onDone) {
      return runBatch('Official suspicious User-Agent validation', v.count, 1, function () {
        return call('/api/security/canary/suspicious-user-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ validation: 'User-Agent: javascript:' })
        });
      }, onDone);
    }
  });

  const forgedNoneJwt = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsImV4cCI6MX0.';
  const ssrfTargets = [
    'http://169.254.169.254/metadata/instance',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/computeMetadata/',
    'http://127.0.0.1/',
    'http://[::1]/'
  ];
  const injectionPayloads = [
    "' OR '1'='1",
    "' OR 1=1-- -",
    '{"$ne":null}',
    '<script>alert("astf")</script>',
    '../../../etc/passwd',
    '{{7*7}}'
  ];

  function postSecurityProbe(category, payload) {
    return call('/api/security/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: category, payload: payload })
    });
  }

  buildPatternSuiteCard({
    id: 'owasp-api-top-10',
    title: 'OWASP API Security Top 10 + ASTF Traffic Suite',
    runAllLabel: 'Run full OWASP suite',
    logLabel: 'OWASP',
    badges: ['OWASP API Top 10:2023', 'OWASP ASTF patterns', 'safe synthetic traffic'],
    description: 'Runs non-destructive request shapes adapted from the OWASP API Security Testing Framework. These produce useful APIM telemetry for investigation and WAF exercises, but SQL injection, SSRF, BOLA, command injection, and generic authentication abuse are not named Defender for APIs alert types.',
    sourceUrl: 'https://github.com/OWASP/www-project-api-security-testing-framework',
    sourceLabel: 'OWASP API Security Testing Framework',
    note: 'ASTF gRPC and mTLS cases are intentionally excluded from browser execution because they require HTTP/2 framing or client certificates. The suite does not exploit systems, persist changes, make SSRF callbacks, execute injected text, or run vulnerable regular expressions.',
    patterns: [
    {
      category: 'API1:2023',
      title: 'Broken Object Level Authorization',
      description: 'Walks alternate customer IDs and unauthenticated payment-method resources.',
      run: function () {
        return runBatchPromise('OWASP API1 BOLA', 30, 5, function (i) {
          const id = (i % 25) + 1;
          return call(i % 2 ? '/api/customers/' + id : '/api/customers/' + id + '/payment-methods');
        });
      }
    },
    {
      category: 'API2:2023',
      title: 'Broken Authentication',
      description: 'Sends an alg:none JWT shape, common usernames, and repeated synthetic OTP values.',
      run: function () {
        return runBatchPromise('OWASP API2 authentication probes', 20, 4, function (i) {
          if (i % 2) {
            return call('/api/auth/verify-otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + forgedNoneJwt },
              expectedStatuses: [401],
              body: JSON.stringify({ code: String(i).padStart(6, '0') })
            });
          }
          return call('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + forgedNoneJwt },
            expectedStatuses: [401],
            body: JSON.stringify({ username: ['admin', 'root', 'test', 'guest'][i % 4], password: 'synthetic-invalid' })
          });
        });
      }
    },
    {
      category: 'API3:2023',
      title: 'Broken Object Property Level Authorization',
      description: 'Submits mass-assignment properties such as isAdmin and role without persisting them.',
      run: function () {
        return runBatchPromise('OWASP API3 mass assignment', 16, 4, function (i) {
          return call('/api/customers/' + ((i % 10) + 1), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isAdmin: true, role: 'admin', creditLimit: 999999, syntheticProbe: i })
          });
        });
      }
    },
    {
      category: 'API4:2023',
      title: 'Unrestricted Resource Consumption',
      description: 'Bursts large-page requests without a client-side delay to create a rate/resource anomaly.',
      run: function () {
        return runBatchPromise('OWASP API4 resource consumption', 75, 15, function () {
          return call('/api/products?page=1&pageSize=500');
        });
      }
    },
    {
      category: 'API5:2023',
      title: 'Broken Function Level Authorization',
      description: 'Alternates unexpected PUT and DELETE methods against an administrator operation.',
      run: function () {
        return runBatchPromise('OWASP API5 method escalation', 20, 5, function (i) {
          return call('/api/admin/users', {
            method: i % 2 ? 'DELETE' : 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Demo-Role': 'customer' },
            body: i % 2 ? undefined : JSON.stringify({ role: 'administrator' })
          });
        });
      }
    },
    {
      category: 'API6:2023',
      title: 'Unrestricted Access to Sensitive Business Flows',
      description: 'Repeats synthetic checkout requests to resemble automated business-flow abuse.',
      run: function () {
        return runBatchPromise('OWASP API6 checkout abuse', 30, 8, function (i) {
          return call('/api/orders/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [{ productId: (i % 20) + 1, quantity: 1 }], coupon: 'AUTOMATED-' + i })
          });
        });
      }
    },
    {
      category: 'API7:2023',
      title: 'Server-Side Request Forgery',
      description: 'Places cloud metadata and loopback URLs in fetch parameters; the backend never connects to them.',
      run: function () {
        return runBatchPromise('OWASP API7 SSRF signatures', 20, 5, function (i) {
          return call('/api/tools/fetch?url=' + encodeURIComponent(ssrfTargets[i % ssrfTargets.length]));
        });
      }
    },
    {
      category: 'API8:2023',
      title: 'Security Misconfiguration',
      description: 'Probes synthetic .env, actuator, Swagger UI, heapdump, and console paths.',
      run: function () {
        const probes = ['.env', 'actuator-env', 'swagger-ui.html', 'heapdump', 'h2-console'];
        return runBatchPromise('OWASP API8 debug paths', 25, 5, function (i) {
          return call('/api/debug/' + encodeURIComponent(probes[i % probes.length]));
        });
      }
    },
    {
      category: 'API9:2023',
      title: 'Improper Inventory Management',
      description: 'Alternates deprecated v0 and versioned v1 API inventory endpoints.',
      run: function () {
        return runBatchPromise('OWASP API9 legacy inventory', 30, 6, function (i) {
          return call(i % 2 ? '/api/v0/customers' : '/api/v1/products');
        });
      }
    },
    {
      category: 'API10:2023',
      title: 'Unsafe Consumption of APIs',
      description: 'Posts SQLi, NoSQLi, XSS, traversal, and template-expression strings as inert webhook data.',
      run: function () {
        return runBatchPromise('OWASP API10 unsafe-consumption payloads', 24, 6, function (i) {
          return call('/api/integrations/webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: injectionPayloads[i % injectionPayloads.length], source: 'owasp-astf-demo' })
          });
        });
      }
    },
    {
      category: 'ASTF GraphQL',
      title: 'Introspection and Batching',
      description: 'Sends introspection, deep nesting, and batched GraphQL-shaped requests to a non-executing parser.',
      run: function () {
        const bodies = [
          { query: 'query { __schema { types { name } } }' },
          { query: 'query { viewer { account { orders { items { product { supplier { name } } } } } } }' },
          [{ query: '{ viewer { id } }' }, { query: '{ __type(name:"Customer") { fields { name } } }' }]
        ];
        return runBatchPromise('ASTF GraphQL probes', 12, 3, function (i) {
          return call('/api/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodies[i % bodies.length])
          });
        });
      }
    },
    {
      category: 'ASTF Injection',
      title: 'SQL and NoSQL Signatures',
      description: 'Places non-destructive tautology and operator strings into search parameters.',
      run: function () {
        return runBatchPromise('ASTF injection signatures', 24, 6, function (i) {
          return call('/api/search?q=' + encodeURIComponent(injectionPayloads[i % injectionPayloads.length]));
        });
      }
    },
    {
      category: 'ASTF ReDoS',
      title: 'Regex Denial-of-Service Shape',
      description: 'Submits long near-match strings without evaluating them in a vulnerable expression.',
      run: function () {
        return runBatchPromise('ASTF ReDoS-shaped input', 8, 2, function (i) {
          return call('/api/tools/regex', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: 'a'.repeat(35 + i) + '!' })
          });
        });
      }
    }
    ]
  });

  buildPatternSuiteCard({
    id: 'payloads-all-the-things',
    title: 'PayloadsAllTheThings API Traffic Suite',
    runAllLabel: 'Run full payload suite',
    logLabel: 'PayloadsAllTheThings',
    badges: ['PayloadsAllTheThings', 'API penetration-test shapes', 'safe synthetic traffic'],
    description: 'Runs bounded, non-destructive API payload shapes adapted from PayloadsAllTheThings. They create investigation and WAF telemetry, not named Defender for APIs alerts. The mock endpoints observe input but never execute commands, parse external entities, access files, follow redirects, make outbound requests, merge prototype keys, or persist privilege changes.',
    sourceUrl: 'https://github.com/swisskyrepo/PayloadsAllTheThings',
    sourceLabel: 'swisskyrepo/PayloadsAllTheThings (MIT)',
    note: 'Real request desynchronization, reverse shells, destructive SQL, credential attacks, external callbacks, file reads, entity expansion, and unbounded denial-of-service payloads are intentionally excluded. The request-smuggling case sends header names as JSON data only because browsers cannot safely set Content-Length or Transfer-Encoding.',
    patterns: [
      {
        category: 'JWT',
        title: 'None-algorithm and claim-shape probes',
        description: 'Sends a synthetic alg:none bearer token to an endpoint that always rejects authentication.',
        run: function () {
          return runBatchPromise('PayloadsAllTheThings JWT probes', 4, 2, function (i) {
            return call('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + forgedNoneJwt },
              expectedStatuses: [401],
              body: JSON.stringify({ username: ['admin', 'service', 'guest', 'root'][i], password: 'synthetic-invalid' })
            });
          });
        }
      },
      {
        category: 'HTTP Parameter Pollution',
        title: 'Duplicate and nested query parameters',
        description: 'Sends duplicate IDs, role arrays, and nested role names without changing authorization.',
        run: function () {
          const queries = [
            'id=1&id=2',
            'role%5B%5D=user&role%5B%5D=admin',
            'user%5Brole%5D=admin'
          ];
          return runBatchPromise('PayloadsAllTheThings parameter pollution', queries.length, 2, function (i) {
            return call('/api/security/parameters?' + queries[i]);
          });
        }
      },
      {
        category: 'XXE',
        title: 'DOCTYPE and external-entity signatures',
        description: 'Posts XML entity declarations to a text-only endpoint that never invokes an XML parser.',
        run: function () {
          const xmlPayloads = [
            '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY demo SYSTEM "file:///synthetic-demo/marker.txt">]><root>&demo;</root>',
            '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY demo SYSTEM "http://169.254.169.254/latest/meta-data/">]><root>&demo;</root>'
          ];
          return runBatchPromise('PayloadsAllTheThings XXE signatures', xmlPayloads.length, 1, function (i) {
            return call('/api/security/xml', {
              method: 'POST',
              headers: { 'Content-Type': 'application/xml' },
              body: xmlPayloads[i]
            });
          });
        }
      },
      {
        category: 'SSRF',
        title: 'Metadata, loopback, and alternate-scheme URLs',
        description: 'Records high-signal SSRF targets without making any outbound connection.',
        run: function () {
          const targets = ssrfTargets.concat(['gopher://127.0.0.1:6379/_synthetic']);
          return runBatchPromise('PayloadsAllTheThings SSRF signatures', targets.length, 3, function (i) {
            return call('/api/tools/fetch?url=' + encodeURIComponent(targets[i]));
          });
        }
      },
      {
        category: 'SQL / NoSQL Injection',
        title: 'Tautology and operator injection',
        description: 'Submits boolean SQL and MongoDB-style operators as inert JSON values.',
        run: function () {
          const payloads = [
            "' OR '1'='1",
            "admin' -- -",
            "1' AND 1=2--",
            { username: { $ne: null }, password: { $ne: null } },
            { password: { $regex: '^a' } }
          ];
          return runBatchPromise('PayloadsAllTheThings database injection', payloads.length, 3, function (i) {
            return postSecurityProbe('database-injection', payloads[i]);
          });
        }
      },
      {
        category: 'LDAP / XPath Injection',
        title: 'Directory and XML-query filter injection',
        description: 'Records LDAP filter and XPath boolean expressions without contacting a directory or evaluating XPath.',
        run: function () {
          const payloads = [
            '*)(uid=*))(|(uid=*',
            'admin)(!(&(1=0',
            "' or '1'='1",
            "x' or name()='username' or 'x'='y"
          ];
          return runBatchPromise('PayloadsAllTheThings directory injection', payloads.length, 2, function (i) {
            return postSecurityProbe('ldap-xpath-injection', payloads[i]);
          });
        }
      },
      {
        category: 'SSTI / Command Injection',
        title: 'Template and shell-metacharacter shapes',
        description: 'Sends math-only template expressions and harmless echo commands to a non-executing sink.',
        run: function () {
          const payloads = ['{{7*7}}', '#{7*7}', '${{<%[%-synthetic-%]}}', '127.0.0.1; echo synthetic', '$(echo synthetic)'];
          return runBatchPromise('PayloadsAllTheThings execution signatures', payloads.length, 3, function (i) {
            return postSecurityProbe('template-command-injection', payloads[i]);
          });
        }
      },
      {
        category: 'Directory Traversal',
        title: 'Plain and encoded traversal sequences',
        description: 'Submits traversal syntax using a synthetic target; no filesystem path is resolved or read.',
        run: function () {
          const payloads = ['../../../../synthetic-demo/marker.txt', '%2e%2e%2f%2e%2e%2fsynthetic-demo', '..%252f..%252fsynthetic-demo', '..;/..;/synthetic-demo'];
          return runBatchPromise('PayloadsAllTheThings traversal signatures', payloads.length, 2, function (i) {
            return call('/api/security/path?value=' + encodeURIComponent(payloads[i]));
          });
        }
      },
      {
        category: 'Open Redirect',
        title: 'External and scheme-relative redirect targets',
        description: 'Records reserved-domain redirect targets but never returns a redirect or Location header.',
        run: function () {
          const payloads = ['https://evil.example.com', '//evil.example.com', '/\\evil.example.com'];
          return runBatchPromise('PayloadsAllTheThings redirect signatures', payloads.length, 2, function (i) {
            return call('/api/security/redirect?next=' + encodeURIComponent(payloads[i]));
          });
        }
      },
      {
        category: 'CORS',
        title: 'Cross-origin API request observation',
        description: 'Calls the API cross-origin and records the browser-supplied Origin header without hosting an exploit page.',
        run: function () {
          return runBatchPromise('PayloadsAllTheThings CORS observation', 2, 1, function () {
            return call('/api/security/headers?value=cors-observation');
          });
        }
      },
      {
        category: 'Request Smuggling',
        title: 'CL.TE and TE.CL simulation',
        description: 'Sends conflicting transport-header names as JSON data only; it does not create an HTTP desynchronization.',
        run: function () {
          const simulations = [
            { 'Content-Length': '13', 'Transfer-Encoding': 'chunked', bodyShape: '0\\r\\n\\r\\nSYNTHETIC' },
            { 'Transfer-Encoding': ['chunked', 'x'], bodyShape: '0\\r\\n\\r\\n' }
          ];
          return runBatchPromise('PayloadsAllTheThings request-smuggling simulation', simulations.length, 1, function (i) {
            return postSecurityProbe('request-smuggling-simulation', simulations[i]);
          });
        }
      },
      {
        category: 'GraphQL',
        title: 'Introspection and bounded batching',
        description: 'Sends introspection and a two-operation batch to a non-executing GraphQL stub.',
        run: function () {
          const bodies = [
            { query: '{ __schema { types { name } } }' },
            [{ query: '{ user(id:1){id} }' }, { query: '{ user(id:2){id} }' }]
          ];
          return runBatchPromise('PayloadsAllTheThings GraphQL probes', bodies.length, 1, function (i) {
            return call('/api/graphql', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(bodies[i])
            });
          });
        }
      },
      {
        category: 'Mass Assignment',
        title: 'Privileged property over-posting',
        description: 'Submits role and isAdmin fields; the endpoint reports fields but does not persist changes.',
        run: function () {
          return runBatchPromise('PayloadsAllTheThings mass assignment', 3, 1, function (i) {
            return call('/api/customers/' + (i + 1), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: 'synthetic-user', email: 'synthetic@example.com', isAdmin: true, role: 'admin' })
            });
          });
        }
      },
      {
        category: 'Prototype Pollution',
        title: 'Prototype and constructor property shapes',
        description: 'Posts prototype keys to an endpoint that inspects own properties without merging objects.',
        run: function () {
          const bodies = [
            '{"__proto__":{"polluted":true}}',
            '{"constructor":{"prototype":{"polluted":true}}}'
          ];
          return runBatchPromise('PayloadsAllTheThings prototype pollution', bodies.length, 1, function (i) {
            return call('/api/security/prototype', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: bodies[i]
            });
          });
        }
      },
      {
        category: 'CRLF Injection',
        title: 'Header-splitting string shapes',
        description: 'Sends encoded CRLF sequences as query data; the backend never writes them to response headers.',
        run: function () {
          const payloads = ['value%0d%0aSet-Cookie:%20admin=true', 'en%0D%0AContent-Length:%200', '%0d%0aLocation:%20https://example.com'];
          return runBatchPromise('PayloadsAllTheThings CRLF signatures', payloads.length, 2, function (i) {
            return call('/api/security/headers?value=' + encodeURIComponent(payloads[i]));
          });
        }
      },
      {
        category: 'ReDoS',
        title: 'Bounded near-match strings',
        description: 'Sends short near-match values that are measured but never evaluated by a vulnerable regex.',
        run: function () {
          return runBatchPromise('PayloadsAllTheThings ReDoS shapes', 3, 1, function (i) {
            return call('/api/tools/regex', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: 'a'.repeat(20 + i) + '!' })
            });
          });
        }
      }
    ]
  });

  buildPatternSuiteCard({
    id: 'controlled-canary-actions',
    title: 'Controlled High-Risk Canary Actions',
    runAllLabel: 'Run all controlled canaries',
    logLabel: 'Controlled canary',
    badges: ['parameter-gated', 'real scoped side effects', 'automatic rollback'],
    description: 'Performs narrowly scoped actions for telemetry and investigation exercises without exposing the host: a temporary synthetic-user privilege change, reads of dedicated synthetic canary data, fixed code execution in a restricted VM, and one callback through this demo\'s own APIM gateway. These do not map to named Defender for APIs alerts.',
    note: 'Requires enableControlledCanaryTests=true. Arbitrary users, paths, environment variables, code, commands, and callback URLs are not accepted. The privilege scenario resets immediately after verification and also has a 30-second server-side rollback.',
    patterns: [
      {
        category: 'Privilege Change',
        title: 'Elevate and restore synthetic canary user',
        description: 'Changes one in-memory role to admin, verifies the endpoint remains reachable, and restores viewer in a finally block.',
        run: async function () {
          log('Controlled privilege canary: elevating synthetic-canary-user.', 'warn');
          const elevate = await call('/api/security/canary/privilege', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'elevate', requestedRole: 'admin' })
          });
          try {
            const status = await call('/api/security/canary/privilege', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'status' })
            });
            log('Controlled privilege canary: elevate HTTP ' + elevate.status + ', status HTTP ' + status.status + '.');
          } finally {
            const reset = await call('/api/security/canary/privilege', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'reset' })
            });
            log('Controlled privilege canary: reset HTTP ' + reset.status + '.', reset.ok ? 'success' : 'error');
          }
        }
      },
      {
        category: 'Canary Secret Access',
        title: 'Read allowlisted synthetic file and app setting',
        description: 'Performs actual reads of the dedicated canary JSON file and synthetic environment value; a traversal-shaped requested path is ignored.',
        run: function () {
          const paths = [
            '/api/security/canary/secret?source=file&path=' + encodeURIComponent('../../../../etc/passwd'),
            '/api/security/canary/secret?source=environment&path=' + encodeURIComponent('AZURE_CLIENT_SECRET')
          ];
          return runBatchPromise('Controlled canary secret reads', paths.length, 1, function (i) {
            return call(paths[i]);
          });
        }
      },
      {
        category: 'Fixed Code Execution',
        title: 'Restricted VM execution with attempted code telemetry',
        description: 'Runs one fixed string transformation under a 50 ms timeout while recording, but never evaluating, request-supplied code.',
        run: function () {
          return runBatchPromise('Controlled fixed-code execution', 1, 1, function () {
            return call('/api/security/canary/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                input: 'defender-canary',
                code: 'require("child_process").exec("echo synthetic")'
              })
            });
          });
        }
      },
      {
        category: 'Controlled Callback',
        title: 'Outbound callback through this demo APIM',
        description: 'Makes one HTTPS callback to a fixed receiver in this same demo; no target URL is accepted from the browser.',
        run: function () {
          return runBatchPromise('Controlled APIM callback', 1, 1, function () {
            return call('/api/security/canary/callback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ requestedTarget: 'ignored-by-server' })
            });
          });
        }
      }
    ]
  });

  runAllButton.addEventListener('click', async function () {
    if (!getBaseUrl()) {
      log('Set and save an API base URL before running all scenarios.', 'error');
      return;
    }

    runAllButton.disabled = true;
    runAllStatus.className = 'status-pill status-unknown';
    log('All scenarios: starting ' + runnableScenarios.length + ' runnable cards sequentially. Baseline and informational cards are excluded.', 'warn');
    try {
      for (let i = 0; i < runnableScenarios.length; i++) {
        const scenario = runnableScenarios[i];
        runAllStatus.textContent = (i + 1) + '/' + runnableScenarios.length;
        log('All scenarios: [' + (i + 1) + '/' + runnableScenarios.length + '] ' + scenario.title, 'warn');
        await scenario.run();
      }
      runAllStatus.className = 'status-pill status-ok';
      runAllStatus.textContent = 'Complete';
      log('All runnable Alert & posture scenarios finished.', 'success');
    } catch (error) {
      runAllStatus.className = 'status-pill status-error';
      runAllStatus.textContent = 'Stopped';
      log('Run all scenarios stopped: ' + error.message, 'error');
    } finally {
      runAllButton.disabled = false;
    }
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  loadBaseUrl();
  log('Console ready. Configure the API base URL above, then save and test the connection before running scenarios.');
})();
