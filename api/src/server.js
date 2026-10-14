'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { randomUUID } = require('crypto');

const customersRouter = require('./routes/customers');
const ordersRouter = require('./routes/orders');
const productsRouter = require('./routes/products');
const adminRouter = require('./routes/admin');
const searchRouter = require('./routes/search');
const toolsRouter = require('./routes/tools');

const app = express();

// Trust the APIM / App Service front door for correct req.ip / protocol handling.
app.set('trust proxy', true);

// Permissive CORS so the static website (hosted separately) can call this
// API directly, and so it can also be called through APIM with CORS enabled
// via the apim/cors-policy.xml policy applied at the API level.
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(morgan('combined'));

// Correlation id -- harmless, but gives something extra to see in logs/traces
// when walking through requests during a demo.
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);
  next();
});

app.get('/', (req, res) => {
  res.json({
    name: 'defender-apis mock workload',
    description: 'Synthetic e-commerce API used to demonstrate Microsoft Defender for Cloud API security capabilities. All data is fake.',
    endpoints: [
      'GET /healthz',
      'GET /api/customers',
      'GET /api/customers/:id',
      'GET /api/customers/:id/payment-methods',
      'GET /api/orders',
      'GET /api/orders/:id',
      'POST /api/orders',
      'GET /api/products',
      'GET /api/products/:id',
      'GET /api/admin/users',
      'GET /api/admin/export',
      'GET /api/search',
      'GET /api/tools/health',
      'ALL /api/tools/echo',
      'GET /api/tools/large-report',
      'POST /api/tools/upload',
      'GET /api/tools/delay',
    ],
  });
});

app.get('/healthz', (req, res) => {
  res.json({ status: 'healthy', time: new Date().toISOString() });
});

app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/products', productsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/search', searchRouter);
app.use('/api/tools', toolsRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`defender-apis mock API listening on port ${PORT}`);
});

module.exports = app;
