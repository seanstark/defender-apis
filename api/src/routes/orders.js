'use strict';

const express = require('express');
const { orders, generateOrder } = require('../data/syntheticData');

const router = express.Router();

const KNOWN_PARAMS = new Set(['status', 'customerId', 'sort', 'page', 'pageSize']);
const KNOWN_STATUS_VALUES = new Set(['pending', 'processing', 'shipped', 'delivered', 'cancelled']);

/**
 * GET /api/orders
 * Supports filtering by status/customerId/sort. Any additional/unknown query
 * string parameters -- or known parameters sent with an unexpected data type
 * (e.g. status=1234 instead of a string, or customerId=abc instead of a
 * number) -- are reflected back in `_unrecognizedParams` / `_typeMismatches`.
 * The website's "Unseen Parameter" panel uses this to help illustrate the
 * API_UnseenParam and API_UnseenParamType alerts.
 */
router.get('/', (req, res) => {
  let results = orders;
  const unrecognizedParams = [];
  const typeMismatches = [];

  for (const key of Object.keys(req.query)) {
    if (!KNOWN_PARAMS.has(key)) {
      unrecognizedParams.push(key);
    }
  }

  if (req.query.status !== undefined) {
    if (!KNOWN_STATUS_VALUES.has(req.query.status) && !/^\d+$/.test(String(req.query.status))) {
      // non-numeric & unknown status value - just filter to nothing informative
    }
    if (/^\d+$/.test(String(req.query.status))) {
      typeMismatches.push({ param: 'status', expected: 'string enum', received: 'number' });
    } else {
      results = results.filter((o) => o.status === req.query.status);
    }
  }

  if (req.query.customerId !== undefined) {
    if (!/^\d+$/.test(String(req.query.customerId))) {
      typeMismatches.push({ param: 'customerId', expected: 'integer', received: 'string' });
    } else {
      const customerId = parseInt(req.query.customerId, 10);
      results = results.filter((o) => o.customerId === customerId);
    }
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 200);
  const start = (page - 1) * pageSize;

  res.json({
    page,
    pageSize,
    total: results.length,
    items: results.slice(start, start + pageSize),
    _unrecognizedParams: unrecognizedParams,
    _typeMismatches: typeMismatches,
  });
});

/**
 * GET /api/orders/:id
 * Sequential numeric identifier (1..800) -- another enumeration target,
 * paired with /api/customers/:id so the website can drive distributed
 * enumeration across two resource types at once.
 */
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const order = orders.find((o) => o.id === id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found', id });
  }
  res.json(order);
});

/**
 * POST /api/orders
 * Creates a new (in-memory, non-persisted) synthetic order from a posted
 * body. Used by the "large request payload" demo control to drive the
 * request-body variant of API_SpikeInPayload.
 */
router.post('/', (req, res) => {
  const id = orders.length + 1;
  const order = generateOrder(id);
  const receivedBytes = req.headers['content-length']
    ? parseInt(req.headers['content-length'], 10)
    : JSON.stringify(req.body || {}).length;
  res.status(201).json({
    ...order,
    _receivedBodyBytes: receivedBytes,
    _note: 'This order is synthetic and was not persisted.',
  });
});

module.exports = router;
