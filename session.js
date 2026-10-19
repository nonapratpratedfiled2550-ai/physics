'use strict';

const { json, readBody, cors } = require('../_lib/ai');
const { mintSession, requireAuth } = require('../_lib/auth');
const { seedFixtures } = require('../_lib/store');

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  seedFixtures();

  if (req.method === 'GET') {
    const session = requireAuth(req, res, json);
    if (!session) return;
    return json(res, 200, {
      ok: true,
      userId: session.userId,
      role: session.role,
      classroomId: session.classroomId,
      exp: session.exp
    });
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  let body;
  try {
    body = await readBody(req, 20000);
  } catch (err) {
    return json(res, err.code || 400, { ok: false, error: err.message });
  }

  const userId = String(body.userId || '').trim().slice(0, 64);
  const role = body.role === 'teacher' ? 'teacher' : 'student';
  const classroomId = body.classroomId ? String(body.classroomId).toUpperCase().slice(0, 8) : null;
  if (!userId || userId.length < 3) {
    return json(res, 400, { ok: false, error: 'userId_required', message: 'ต้องระบุ userId (ใช้รหัสโปรไฟล์สังเคราะห์)' });
  }
  // Block obvious real-email style identifiers in Preview fixtures policy
  if (/@/.test(userId)) {
    return json(res, 400, { ok: false, error: 'no_pii', message: 'ห้ามใช้อีเมล/ข้อมูลจริงเป็นตัวระบุทดสอบโดยไม่มีแผนอนุมัติ' });
  }

  const token = mintSession({ userId, role, classroomId });
  return json(res, 200, {
    ok: true,
    token,
    userId,
    role,
    classroomId,
    note: 'ส่ง token ใน Authorization: Bearer … ทุก API ที่ต้องมีสิทธิ์'
  });
};
