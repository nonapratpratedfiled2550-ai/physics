'use strict';

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';

/** Best-effort in-memory rate limit (resets per serverless isolate). */
const buckets = globalThis.__physAiBuckets || (globalThis.__physAiBuckets = new Map());

function envFlag(name, fallback) {
  const v = process.env[name];
  if (v == null || v === '') return fallback;
  return v;
}

function aiEnabled() {
  const flag = String(envFlag('AI_ENABLED', 'true')).toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  return !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload_too_large'), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(Object.assign(new Error('invalid_json'), { code: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function rateLimit(key, maxPerHour) {
  const now = Date.now();
  const hour = 3600000;
  let row = buckets.get(key);
  if (!row || now - row.start > hour) {
    row = { start: now, count: 0 };
    buckets.set(key, row);
  }
  row.count += 1;
  const remaining = Math.max(0, maxPerHour - row.count);
  const ok = row.count <= maxPerHour;
  return { ok, remaining, resetMs: row.start + hour - now };
}

async function gatewayChat({ model, messages, maxTokens, temperature }) {
  const key = process.env.AI_GATEWAY_API_KEY;
  const headers = {
    'Content-Type': 'application/json'
  };
  if (key) headers.Authorization = 'Bearer ' + key;
  else if (process.env.VERCEL_OIDC_TOKEN) headers.Authorization = 'Bearer ' + process.env.VERCEL_OIDC_TOKEN;
  else {
    const err = new Error('missing_ai_credentials');
    err.code = 503;
    throw err;
  }

  const resp = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: temperature == null ? 0.2 : temperature
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error((data && (data.error && data.error.message)) || data.message || 'gateway_error');
    err.code = resp.status;
    err.details = data;
    throw err;
  }
  const text = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';
  return {
    text: String(text || '').trim(),
    usage: data.usage || null,
    model: data.model || model
  };
}

function cors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  aiEnabled,
  envFlag,
  json,
  readBody,
  clientIp,
  rateLimit,
  gatewayChat,
  cors,
  GATEWAY_URL
};
