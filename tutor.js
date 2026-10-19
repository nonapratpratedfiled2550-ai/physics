'use strict';

const {
  aiEnabled, envFlag, json, readBody, clientIp, rateLimit, gatewayChat, cors
} = require('../_lib/ai');
const { requireAuth } = require('../_lib/auth');

const SYSTEM = [
  'คุณเป็น AI Physics Tutor สำหรับนักเรียนมัธยมไทย ตามแนว สสวท.',
  'ตอบเป็นภาษาไทยสั้น ชัด ใช้สัญลักษณ์มาตรฐาน (เช่น v, u, a, s, F).',
  'ห้ามให้คำตอบตัวเลขสุดท้ายของโจทย์ ห้ามเขียนสำเนาแบบเรียน.',
  'ช่วยชี้แนวคิด สูตรที่เกี่ยวข้อง ขั้นจัดรูป และจุดที่มักพลาด.',
  'ถ้าข้อมูลไม่พอ ให้ถามกลับสั้น ๆ ว่าขาดปริมาณใด.',
  'ไม่แก้โจทย์แทนนักเรียน — ชี้นำทีละขั้นเท่านั้น.'
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
      message: 'AI Tutor ยังไม่เปิด หรือยังไม่มีคีย์ฝั่งเซิร์ฟเวอร์ — ใช้คำใบ้ในเครื่องไปก่อน'
    });
  }

  const cap = Number(envFlag('AI_TUTOR_PER_HOUR', '20'));
  const ip = clientIp(req);
  const rl = rateLimit('tutor:' + ip + ':' + session.userId, cap);
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  if (!rl.ok) {
    return json(res, 429, {
      ok: false,
      error: 'rate_limited',
      message: 'เกินโควต้าคำขอ AI Tutor ต่อชั่วโมง ลองใหม่ภายหลัง',
      resetMs: rl.resetMs
    });
  }

  let body;
  try {
    body = await readBody(req, 80000);
  } catch (err) {
    return json(res, err.code || 400, { ok: false, error: err.message });
  }

  const question = String(body.question || body.message || '').trim();
  const problem = String(body.problem || '').trim().slice(0, 2000);
  const topic = String(body.topic || '').trim().slice(0, 80);
  const level = Math.max(1, Math.min(3, Number(body.level) || 1));
  if (question.length < 4) {
    return json(res, 400, { ok: false, error: 'question_required', message: 'พิมพ์คำถามสั้น ๆ ก่อน' });
  }

  const model = envFlag('AI_MODEL_TUTOR', 'openai/gpt-4o-mini');
  const maxTokens = Math.min(600, Number(envFlag('AI_TUTOR_MAX_TOKENS', '400')));

  const userParts = [
    'ระดับคำใบ้ที่ต้องการ: ' + level + ' (1=แนวคิด 2=สูตร/ขั้น 3=ชี้การจัดรูปใกล้คำตอบ แต่ห้ามบอกเลขสุดท้าย)',
    topic ? 'บท/หัวข้อ: ' + topic : '',
    problem ? 'โจทย์ของนักเรียน:\n' + problem : '',
    'คำถาม:\n' + question
  ].filter(Boolean).join('\n\n');

  try {
    const out = await gatewayChat({
      model,
      maxTokens,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userParts }
      ]
    });
    return json(res, 200, {
      ok: true,
      reply: out.text,
      model: out.model,
      usage: out.usage,
      spoilerPolicy: 'no_final_numeric_answer'
    });
  } catch (err) {
    return json(res, err.code && err.code >= 400 ? err.code : 502, {
      ok: false,
      error: 'tutor_failed',
      message: err.message || 'เรียก AI ไม่สำเร็จ'
    });
  }
};
