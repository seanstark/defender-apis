'use strict';

const express = require('express');
const { products } = require('../data/syntheticData');

const router = express.Router();

/**
 * GET /api/products
 * Public, non-sensitive product catalog. No PII involved. This endpoint
 * represents a "normal", healthy API surface and is a good target for
 * generating steady baseline traffic (useful groundwork for the ~30 day
 * learning period that several Defender for APIs anomaly alerts require).
 */
router.get('/', (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 500);
  const category = req.query.category;
  let results = products;
  if (category) {
    results = results.filter((p) => p.category.toLowerCase() === String(category).toLowerCase());
  }
  const start = (page - 1) * pageSize;
  res.json({
    page,
    pageSize,
    total: results.length,
    items: results.slice(start, start + pageSize),
  });
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const product = products.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found', id });
  }
  res.json(product);
});

module.exports = router;
