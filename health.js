'use strict';

const { aiEnabled, envFlag, json, cors } = require('../_lib/ai');

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  json(res, 200, {
    ok: true,
    aiEnabled: aiEnabled(),
    hasGatewayKey: !!process.env.AI_GATEWAY_API_KEY,
    hasOidc: !!process.env.VERCEL_OIDC_TOKEN,
    tutorModel: envFlag('AI_MODEL_TUTOR', 'openai/gpt-4o-mini'),
    ocrModel: envFlag('AI_MODEL_OCR', 'openai/gpt-4o-mini'),
    caps: {
      tutorPerHour: Number(envFlag('AI_TUTOR_PER_HOUR', '20')),
      ocrPerHour: Number(envFlag('AI_OCR_PER_HOUR', '10')),
      maxImageBytes: Number(envFlag('AI_MAX_IMAGE_BYTES', '1500000'))
    },
    authRequired: ['/api/ai/tutor', '/api/ai/ocr', '/api/class/*', '/api/report/*', '/api/auth/session GET'],
    note: 'Secrets are never returned. Protected routes need Authorization: Bearer <signed session>. Set AI_GATEWAY_API_KEY / PHYS_SESSION_SECRET in Vercel env after approval.'
  });
};
