'use strict';

const express = require('express');
const { adminUsers, customers, orders } = require('../data/syntheticData');

const router = express.Router();

/**
 * GET /api/admin/users
 * Deliberately ships with NO authentication/authorization check and returns
 * administrator accounts including fake API keys. This models the classic
 * "unauthenticated API" / "broken object level authorization" finding that
 * Defender for Cloud's API security posture management is designed to
 * surface (see api-security-posture-overview). All values are synthetic.
 */
router.get('/users', (req, res) => {
  res.json({ items: adminUsers });
});

/**
 * GET /api/admin/export
 * Returns a full dump of every customer and order record in a single
 * response. Combined with the website's "large response payload" control,
 * this is used to drive the response-payload variant of API_SpikeInPayload.
 * Also unauthenticated by design -- see note above.
 */
router.get('/export', (req, res) => {
  res.json({
    exportedAt: new Date().toISOString(),
    customers,
    orders,
  });
});

module.exports = router;
