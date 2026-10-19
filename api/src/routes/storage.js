'use strict';

const express = require('express');
const nodeCrypto = require('crypto');

const router = express.Router();
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const { randomUUID } = nodeCrypto;

function uploadsEnabled() {
  return String(process.env.PUBLIC_SENSITIVE_UPLOADS_ENABLED).toLowerCase() === 'true';
}

async function getStorageToken() {
  const identityEndpoint = process.env.IDENTITY_ENDPOINT;
  const identityHeader = process.env.IDENTITY_HEADER;
  if (!identityEndpoint || !identityHeader) {
    throw new Error('The App Service managed identity endpoint is unavailable.');
  }

  const tokenUrl = new URL(identityEndpoint);
  tokenUrl.searchParams.set('resource', 'https://storage.azure.com/');
  tokenUrl.searchParams.set('api-version', '2019-08-01');
  const response = await fetch(tokenUrl, {
    headers: { 'X-IDENTITY-HEADER': identityHeader },
  });
  if (!response.ok) {
    throw new Error(`Managed identity token request failed with HTTP ${response.status}.`);
  }

  const token = await response.json();
  return token.access_token;
}

function sanitizeFileName(fileName) {
  const baseName = String(fileName || '').split(/[\\/]/).pop();
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+/, '');
  return sanitized.slice(0, 120) || 'synthetic-upload.bin';
}

router.post('/upload', async (req, res, next) => {
  if (!uploadsEnabled()) {
    return res.status(503).json({
      error: 'Sensitive upload demo is disabled.',
      remediation: 'Redeploy with enablePublicSensitiveUploadContainer=true.',
    });
  }

  const { fileName, contentType, contentBase64 } = req.body || {};
  if (!fileName || !contentBase64) {
    return res.status(400).json({ error: 'fileName and contentBase64 are required.' });
  }

  const normalizedBase64 = String(contentBase64).replace(/\s/g, '');
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(normalizedBase64) || normalizedBase64.length % 4 !== 0) {
    return res.status(400).json({ error: 'contentBase64 must be valid base64 data.' });
  }

  const content = Buffer.from(normalizedBase64, 'base64');
  if (!content.length) {
    return res.status(400).json({ error: 'The uploaded file is empty.' });
  }
  if (content.length > MAX_UPLOAD_BYTES) {
    return res.status(413).json({ error: 'The maximum upload size is 5 MB.' });
  }

  const safeFileName = sanitizeFileName(fileName);
  const blobName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}-${safeFileName}`;

  try {
    const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
    if (!accountUrl || !containerName) {
      throw new Error('Azure Storage upload configuration is incomplete.');
    }

    const publicUrl = `${accountUrl}/${containerName}/${encodeURIComponent(blobName)}`;
    const accessToken = await getStorageToken();
    const uploadResponse = await fetch(publicUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': String(contentType || 'application/octet-stream').slice(0, 128),
        'Content-Length': String(content.length),
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-date': new Date().toUTCString(),
        'x-ms-version': '2023-11-03',
        'x-ms-meta-syntheticdemodata': 'true',
        'x-ms-meta-originalfilename': safeFileName,
        'x-ms-meta-uploadedthrough': 'defender-apis-demo',
      },
      body: content,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Azure Blob upload failed with HTTP ${uploadResponse.status}.`);
    }

    res.status(201).json({
      uploaded: true,
      blobName,
      bytes: content.length,
      publicUrl,
      warning: 'This blob is intentionally publicly readable for the Defender CSPM demo. Upload synthetic data only.',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
