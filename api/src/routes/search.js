'use strict';

const express = require('express');
const { products } = require('../data/syntheticData');

const router = express.Router();

/**
 * GET /api/search
 * Freeform product search. Accepts an open-ended set of query string
 * parameters (q, category, minPrice, maxPrice, sort, plus anything else the
 * caller sends) and echoes back which parameter names/types it had never
 * seen a "typical" value for. Because this endpoint intentionally tolerates
 * arbitrary extra parameters, it's a convenient target for the website's
 * "Unseen Parameter" and "Parameter Spray" demo controls
 * (API_UnseenParam, API_UnseenParamType, API_SprayInRequests).
 */
router.get('/', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const category = req.query.category;
  const minPrice = req.query.minPrice !== undefined ? Number(req.query.minPrice) : undefined;
  const maxPrice = req.query.maxPrice !== undefined ? Number(req.query.maxPrice) : undefined;

  let results = products;
  if (q) {
    results = results.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }
  if (category) {
    results = results.filter((p) => p.category.toLowerCase() === String(category).toLowerCase());
  }
  if (minPrice !== undefined && !Number.isNaN(minPrice)) {
    results = results.filter((p) => p.price >= minPrice);
  }
  if (maxPrice !== undefined && !Number.isNaN(maxPrice)) {
    results = results.filter((p) => p.price <= maxPrice);
  }

  res.json({
    query: req.query,
    total: results.length,
    items: results.slice(0, 50),
  });
});

module.exports = router;
