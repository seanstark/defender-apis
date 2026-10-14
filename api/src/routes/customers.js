'use strict';

const express = require('express');
const { customers } = require('../data/syntheticData');

const router = express.Router();

/**
 * GET /api/customers
 * Paged list of customers. Intentionally returns full PII fields (email,
 * phone, SSN, payment methods) to give Defender CSPM's sensitive-data
 * scanner (via Microsoft Purview) realistic content to classify.
 */
router.get('/', (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 200);
  const start = (page - 1) * pageSize;
  const slice = customers.slice(start, start + pageSize);
  res.json({
    page,
    pageSize,
    total: customers.length,
    items: slice,
  });
});

/**
 * GET /api/customers/:id
 * Sequential numeric identifier (1..500). Calling this repeatedly with
 * incrementing IDs is a textbook parameter-enumeration pattern and is
 * intentionally left this way to help demonstrate the
 * API_ParameterEnumeration / API_DistributedParameterEnumeration alerts.
 */
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const customer = customers.find((c) => c.id === id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found', id });
  }
  res.json(customer);
});

/**
 * GET /api/customers/:id/payment-methods
 * Deliberately unauthenticated and returns raw (fake) card data. This route
 * exists to illustrate the "sensitive data returned by an unauthenticated
 * API" finding surfaced by Defender for Cloud's API security posture
 * management. Do not model production APIs after this endpoint.
 */
router.get('/:id/payment-methods', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const customer = customers.find((c) => c.id === id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found', id });
  }
  res.json({ customerId: id, paymentMethods: customer.paymentMethods });
});

module.exports = router;
