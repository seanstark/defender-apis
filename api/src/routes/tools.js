'use strict';

const express = require('express');
const { fakeCreditCard, fakeSsn, fakeEmail, fakePhone } = require('../data/syntheticData');

const router = express.Router();

/**
 * GET /api/tools/health
 * Plain baseline/liveness endpoint. Useful as "known good" low-noise
 * traffic while other controls run.
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/**
 * ANY /api/tools/echo
 * Reflects back headers, query string, and body. Handy for testing/demoing
 * how the website's request builder constructs calls, and for showing
 * suspicious headers (e.g. a spoofed User-Agent sent via curl/PowerShell)
 * round-tripping through the gateway.
 */
router.all('/echo', (req, res) => {
  res.json({
    method: req.method,
    path: req.originalUrl,
    headers: req.headers,
    query: req.query,
    body: req.body,
  });
});

/**
 * GET /api/tools/large-report?sizeKb=512
 * Generates a synthetic "report" response padded out to roughly the
 * requested size (capped at 10 MB) and stuffed with fake sensitive-looking
 * records (SSNs, credit cards, emails). Pairs with the website's "Large
 * Response Payload" control to help demonstrate the response-payload
 * variant of API_SpikeInPayload, as well as general sensitive-data
 * exposure scenarios for API security posture findings.
 */
router.get('/large-report', (req, res) => {
  const requestedKb = Math.min(Math.max(parseInt(req.query.sizeKb, 10) || 256, 1), 10 * 1024);
  const records = [];
  let approxBytes = 0;
  let i = 0;
  while (approxBytes < requestedKb * 1024) {
    const record = {
      index: i,
      name: `Synthetic Person ${i}`,
      ssn: fakeSsn(i),
      creditCard: fakeCreditCard(i),
      email: fakeEmail('person', `${i}`, i),
      phone: fakePhone(i),
      notes: 'This record is entirely synthetic test data generated for a Defender for APIs demo.',
    };
    records.push(record);
    approxBytes += JSON.stringify(record).length;
    i += 1;
  }
  res.json({
    requestedKb,
    recordCount: records.length,
    records,
  });
});

/**
 * POST /api/tools/upload
 * Accepts an arbitrary JSON body and reports how many bytes were received.
 * Pairs with the website's "Large Request Payload" control to help
 * demonstrate the request-payload variant of API_SpikeInPayload.
 */
router.post('/upload', (req, res) => {
  const receivedBytes = req.headers['content-length']
    ? parseInt(req.headers['content-length'], 10)
    : JSON.stringify(req.body || {}).length;
  res.status(201).json({
    received: true,
    receivedBytes,
  });
});

/**
 * GET /api/tools/delay?ms=3000
 * Sleeps for the requested number of milliseconds (capped at 30s) before
 * responding. Pairs with the website's "Latency Spike" control to help
 * demonstrate API_SpikeInLatency.
 */
router.get('/delay', (req, res) => {
  const ms = Math.min(Math.max(parseInt(req.query.ms, 10) || 1000, 0), 30000);
  setTimeout(() => {
    res.json({ delayedMs: ms, time: new Date().toISOString() });
  }, ms);
});

module.exports = router;
