const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

loadEnv();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const FAL_API_KEY = process.env.FAL_API_KEY || '';
const FAL_PIPELINE = process.env.FAL_PIPELINE || 'fal-ai/fast-svd-video';
const PUBLIC_DIR = path.join(__dirname, 'public');

const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || '';
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || '';
const APPLE_KEY_ID = process.env.APPLE_KEY_ID || '';
const APPLE_PRIVATE_KEY = normalizePrivateKey(process.env.APPLE_PRIVATE_KEY || '');
const APPLE_REDIRECT_URI = process.env.APPLE_REDIRECT_URI || '';
const APPLE_SCOPE = process.env.APPLE_SCOPE || 'name email';
const APPLE_ENABLED = Boolean(
  APPLE_CLIENT_ID &&
  APPLE_TEAM_ID &&
  APPLE_KEY_ID &&
  APPLE_PRIVATE_KEY &&
  APPLE_REDIRECT_URI
);

const appleStates = new Map();
const appleKeysCache = { keys: null, fetchedAt: 0 };
let jwtModule;
let jwkToPemModule;

const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && parsedUrl.pathname === '/api/generate') {
    handleGenerateRequest(req, res);
    return;
  }

  if (req.method === 'GET' && parsedUrl.pathname === '/api/auth/apple/config') {
    handleAppleConfigRequest(res);
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/auth/apple/complete') {
    await handleAppleCompleteRequest(req, res);
    return;
  }

  if (req.method === 'OPTIONS' && parsedUrl.pathname === '/api/generate') {
    res.writeHead(204, defaultHeaders());
    res.end();
    return;
  }

  if (
    req.method === 'OPTIONS' &&
    (parsedUrl.pathname === '/api/auth/apple/complete' || parsedUrl.pathname === '/api/auth/apple/config')
  ) {
    res.writeHead(204, defaultHeaders());
    res.end();
    return;
  }

  if (req.method === 'GET') {
    serveStatic(parsedUrl.pathname, res);
    return;
  }

  res.writeHead(404, defaultHeaders({ 'Content-Type': 'application/json' }));
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, 'utf-8');
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      return;
    }
    const key = trimmed.substring(0, idx).trim();
    const value = trimmed.substring(idx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  });
}

function defaultHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

function serveStatic(requestPath, res) {
  let filePath = requestPath;
  if (filePath === '/') {
    filePath = '/index.html';
  }

  const resolvedPath = path.join(PUBLIC_DIR, decodeURIComponent(filePath));

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, defaultHeaders({ 'Content-Type': 'application/json' }));
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, defaultHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ error: 'Resource not found' }));
      return;
    }

    const stream = fs.createReadStream(resolvedPath);
    stream.on('open', () => {
      res.writeHead(200, defaultHeaders({ 'Content-Type': getMimeType(resolvedPath) }));
      stream.pipe(res);
    });
    stream.on('error', () => {
      res.writeHead(500, defaultHeaders({ 'Content-Type': 'application/json' }));
      res.end(JSON.stringify({ error: 'Failed to read file' }));
    });
  });
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  };
  return map[ext] || 'application/octet-stream';
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.socket.destroy();
      }
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        resolve(parsed);
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

async function handleGenerateRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, defaultHeaders());
    res.end();
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const { prompt, aspectRatio, duration } = body;

    if (!prompt || typeof prompt !== 'string') {
      respondJson(res, 400, { error: 'Prompt is required.' });
      return;
    }

    const allowedRatios = ['16:9', '9:16', '1:1'];
    if (!allowedRatios.includes(aspectRatio)) {
      respondJson(res, 400, { error: 'Invalid aspect ratio selected.' });
      return;
    }

    const allowedDurations = [5, 10];
    if (!allowedDurations.includes(Number(duration))) {
      respondJson(res, 400, { error: 'Invalid duration selected.' });
      return;
    }

    if (!FAL_API_KEY) {
      respondJson(res, 500, { error: 'Server is not configured with a fal.ai API key.' });
      return;
    }

    const videoResult = await requestFalVideo({ prompt, aspectRatio, duration: Number(duration) });

    respondJson(res, 200, {
      status: 'completed',
      videoUrl: videoResult.videoUrl,
      requestId: videoResult.requestId,
      metadata: videoResult.metadata,
    });
  } catch (error) {
    console.error('Generation error:', error);
    const message = error.message || 'Unknown error';
    respondJson(res, 500, { error: message });
  }
}

function handleAppleConfigRequest(res) {
  if (!APPLE_ENABLED) {
    respondJson(res, 200, { enabled: false });
    return;
  }

  pruneAppleStates();
  const state = generateAppleState();
  appleStates.set(state, Date.now());

  respondJson(res, 200, {
    enabled: true,
    clientId: APPLE_CLIENT_ID,
    redirectUri: APPLE_REDIRECT_URI,
    scope: APPLE_SCOPE,
    state,
  });
}

async function handleAppleCompleteRequest(req, res) {
  if (!APPLE_ENABLED) {
    respondJson(res, 400, { error: 'Sign in with Apple is not configured on the server.' });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const { code, idToken, state, user } = body || {};

    pruneAppleStates();

    if (!state || !appleStates.has(state)) {
      respondJson(res, 400, { error: 'Invalid or expired authorization state.' });
      return;
    }

    appleStates.delete(state);

    if (!code) {
      respondJson(res, 400, { error: 'Missing authorization code from Apple.' });
      return;
    }

    const clientSecret = createAppleClientSecret();
    const tokenResponse = await exchangeAppleCodeForToken({ code, clientSecret });
    const resolvedIdToken = tokenResponse.id_token || idToken;

    if (!resolvedIdToken) {
      throw new Error('Apple did not return an ID token.');
    }

    const verified = await verifyAppleIdToken(resolvedIdToken, APPLE_CLIENT_ID);

    const profile = {
      email: verified.email || user?.email || null,
      emailVerified: parseAppleBoolean(verified.email_verified),
      sub: verified.sub || null,
      name: {
        firstName: user?.name?.firstName || null,
        lastName: user?.name?.lastName || null,
      },
    };

    respondJson(res, 200, {
      success: true,
      tokens: {
        accessToken: tokenResponse.access_token || null,
        expiresIn: tokenResponse.expires_in || null,
        refreshToken: tokenResponse.refresh_token || null,
        idToken: resolvedIdToken,
        tokenType: tokenResponse.token_type || null,
      },
      profile,
    });
  } catch (error) {
    console.error('Apple sign-in error:', error);
    respondJson(res, 500, { error: error.message || 'Failed to complete Apple sign in.' });
  }
}

function respondJson(res, statusCode, payload) {
  res.writeHead(statusCode, defaultHeaders({ 'Content-Type': 'application/json' }));
  res.end(JSON.stringify(payload));
}

async function requestFalVideo({ prompt, aspectRatio, duration }) {
  const baseUrl = `https://api.fal.ai/v1/pipelines/${FAL_PIPELINE}`;
  const invokeUrl = `${baseUrl}/invoke`;

  const body = {
    input: {
      prompt,
      aspect_ratio: aspectRatio,
      duration,
    },
  };

  const invokeResponse = await fetch(invokeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${FAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!invokeResponse.ok) {
    let details = await safeJson(invokeResponse);
    throw new Error(`fal.ai request failed (${invokeResponse.status}): ${JSON.stringify(details)}`);
  }

  const invokeData = await invokeResponse.json();
  const requestId = invokeData.request_id || invokeData.requestId;
  const statusUrl = invokeData.status_url || invokeData.statusUrl || `${baseUrl}/requests/${requestId}`;

  if (!requestId || !statusUrl) {
    throw new Error('fal.ai response did not include a request identifier.');
  }

  const timeoutMs = 5 * 60 * 1000;
  const pollIntervalMs = 3000;
  const start = Date.now();

  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Video generation timed out.');
    }

    await delay(pollIntervalMs);
    const statusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        Authorization: `Key ${FAL_API_KEY}`,
      },
    });

    if (!statusResponse.ok) {
      let details = await safeJson(statusResponse);
      throw new Error(`fal.ai status check failed (${statusResponse.status}): ${JSON.stringify(details)}`);
    }

    const statusData = await statusResponse.json();
    const state = statusData.status || statusData.state || statusData.phase;

    if (state === 'failed' || state === 'error') {
      const reason = statusData.error || statusData.message || 'Video generation failed.';
      throw new Error(reason);
    }

    if (state === 'completed' || state === 'succeeded') {
      const output = statusData.output || statusData.outputs || {};
      const videoUrl = output.video || output.video_url || output.url || null;

      if (!videoUrl) {
        throw new Error('fal.ai completed the request but no video URL was provided.');
      }

      return {
        requestId,
        videoUrl,
        metadata: {
          state,
          startedAt: statusData.started_at || statusData.startedAt || null,
          completedAt: statusData.completed_at || statusData.completedAt || null,
          duration,
          aspectRatio,
        },
      };
    }
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return { message: 'Unable to parse response body as JSON.' };
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateAppleState() {
  return crypto.randomBytes(32).toString('hex');
}

function pruneAppleStates() {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [state, createdAt] of appleStates.entries()) {
    if (createdAt < cutoff) {
      appleStates.delete(state);
    }
  }
}

function normalizePrivateKey(value) {
  if (!value) {
    return value;
  }
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

function parseAppleBoolean(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false;
  }
  return null;
}

function createAppleClientSecret() {
  const { jwt } = getAppleCryptoModules();
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: APPLE_TEAM_ID,
      aud: 'https://appleid.apple.com',
      iat: now,
      exp: now + 5 * 60,
      sub: APPLE_CLIENT_ID,
    },
    APPLE_PRIVATE_KEY,
    {
      algorithm: 'ES256',
      keyid: APPLE_KEY_ID,
    }
  );
}

async function exchangeAppleCodeForToken({ code, clientSecret }) {
  const params = new URLSearchParams();
  params.set('grant_type', 'authorization_code');
  params.set('code', code);
  params.set('client_id', APPLE_CLIENT_ID);
  params.set('client_secret', clientSecret);
  if (APPLE_REDIRECT_URI) {
    params.set('redirect_uri', APPLE_REDIRECT_URI);
  }

  const response = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Apple token exchange failed (${response.status}): ${details}`);
  }

  return response.json();
}

async function verifyAppleIdToken(idToken, expectedAudience) {
  const { jwt, jwkToPem } = getAppleCryptoModules();
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded?.header?.kid) {
    throw new Error('Unable to decode Apple ID token.');
  }

  const keys = await getAppleKeys();
  const matchingKey = keys.find((key) => key.kid === decoded.header.kid);
  if (!matchingKey) {
    throw new Error('Unable to locate a matching Apple public key.');
  }

  const pem = jwkToPem(matchingKey);
  return jwt.verify(idToken, pem, { algorithms: ['RS256'], audience: expectedAudience });
}

function getAppleCryptoModules() {
  if (!jwtModule || !jwkToPemModule) {
    try {
      jwtModule = require('jsonwebtoken');
      jwkToPemModule = require('jwk-to-pem');
    } catch (error) {
      throw new Error(
        'Sign in with Apple dependencies are missing. Install jsonwebtoken and jwk-to-pem to enable this feature.'
      );
    }
  }
  return { jwt: jwtModule, jwkToPem: jwkToPemModule };
}

async function getAppleKeys() {
  const now = Date.now();
  if (appleKeysCache.keys && now - appleKeysCache.fetchedAt < 24 * 60 * 60 * 1000) {
    return appleKeysCache.keys;
  }

  const response = await fetch(APPLE_KEYS_URL, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to download Apple public keys (${response.status}).`);
  }

  const payload = await response.json();
  if (!payload?.keys || !Array.isArray(payload.keys)) {
    throw new Error('Apple public key response was malformed.');
  }

  appleKeysCache.keys = payload.keys;
  appleKeysCache.fetchedAt = now;
  return appleKeysCache.keys;
}
