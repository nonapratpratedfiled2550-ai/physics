'use strict';

const {
  aiEnabled, envFlag, json, readBody, clientIp, rateLimit, gatewayChat, cors
} = require('../_lib/ai');
const { requireAuth } = require('../_lib/auth');

const SYSTEM = [
  'คุณแปลงภาพโจทย์ฟิสิกส์ภาษาไทย/อังกฤษ เป็นข้อความโจทย์ที่พิมพ์ได้',
  'คืนเฉพาะข้อความโจทย์ที่อ่านได้ ใช้เลขอารบิก และคงหน่วย (เช่น m/s, km/h, N)',
  'ถ้าอ่านไม่ชัด ให้ใส่ [?] ในจุดที่ไม่แน่ใจ',
  'ห้ามแก้โจทย์ ห้ามใส่คำตอบ ห้ามสรุปสูตร',
  'ลงท้ายด้วยประโยคถาม เช่น จงหา... ถ้าภาพมีคำถาม'
].join(' ');

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const session = requireAuth(req, res, json);
  if (!session) return;

  if (!aiEnabled()) {
    return json(res, 503, {
      ok: false,
      error: 'ai_disabled',
      message: 'ระบบอ่านภาพยังไม่เปิด — พิมพ์โจทย์เองได้ตามปกติ'
    });
  }

  const cap = Number(envFlag('AI_OCR_PER_HOUR', '10'));
  const ip = clientIp(req);
  const rl = rateLimit('ocr:' + ip + ':' + session.userId, cap);
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  if (!rl.ok) {
    return json(res, 429, {
      ok: false,
      error: 'rate_limited',
      message: 'เกินโควต้าอ่านภาพต่อชั่วโมง',
      resetMs: rl.resetMs
    });
  }

  let body;
  try {
    body = await readBody(req, Number(envFlag('AI_MAX_IMAGE_BYTES', '1500000')) + 50000);
  } catch (err) {
    return json(res, err.code || 400, { ok: false, error: err.message });
  }

  const dataUrl = String(body.image || body.dataUrl || '');
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(dataUrl)) {
    return json(res, 400, {
      ok: false,
      error: 'invalid_image',
      message: 'รองรับเฉพาะ PNG/JPEG/WebP แบบ data URL'
    });
  }
  const b64 = dataUrl.split(',')[1] || '';
  const approxBytes = Math.floor(b64.length * 0.75);
  const maxBytes = Number(envFlag('AI_MAX_IMAGE_BYTES', '1500000'));
  if (approxBytes > maxBytes) {
    return json(res, 413, { ok: false, error: 'image_too_large', message: 'ไฟล์ภาพใหญ่เกินไป' });
  }

  const model = envFlag('AI_MODEL_OCR', 'openai/gpt-4o-mini');
  const maxTokens = Math.min(800, Number(envFlag('AI_OCR_MAX_TOKENS', '500')));

  try {
    const out = await gatewayChat({
      model,
      maxTokens,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'อ่านโจทย์จากภาพนี้แล้วพิมพ์เป็นข้อความอย่างเดียว:' },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ]
    });

    return json(res, 200, {
      ok: true,
      draftText: out.text,
      model: out.model,
      usage: out.usage,
      requiresConfirmation: true,
      message: 'ตรวจและแก้ไขข้อความให้ถูกต้องก่อนกดยืนยัน — ระบบจะไม่วิเคราะห์จนกว่าจะยืนยัน'
    });
  } catch (err) {
    return json(res, err.code && err.code >= 400 ? err.code : 502, {
      ok: false,
      error: 'ocr_failed',
      message: err.message || 'อ่านภาพไม่สำเร็จ'
    });
  }
};
