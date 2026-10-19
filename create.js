'use strict';

const { json, readBody, cors } = require('../_lib/ai');
const { requireAuth } = require('../_lib/auth');
const { createClassroom, seedFixtures } = require('../_lib/store');

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  seedFixtures();

  const session = requireAuth(req, res, json, { roles: ['teacher'] });
  if (!session) return;

  let body;
  try { body = await readBody(req, 20000); }
  catch (err) { return json(res, err.code || 400, { ok: false, error: err.message }); }

  try {
    const room = createClassroom({
      teacherId: session.userId,
      name: body.name || 'ห้องเรียนใหม่',
      code: body.code
    });
    // Teacher must remint session with classroomId to access class-scoped APIs
    return json(res, 200, {
      ok: true,
      classroom: { code: room.code, name: room.name, teacherId: room.teacherId, members: room.members.length },
      hint: 'ขอเซสชันใหม่พร้อม classroomId = รหัสห้อง เพื่อดูรายงาน/สมาชิก'
    });
  } catch (err) {
    return json(res, err.code || 400, { ok: false, error: err.message });
  }
};
