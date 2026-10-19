'use strict';

const { json, cors } = require('../_lib/ai');
const { requireAuth, assertTeacherClass } = require('../_lib/auth');
const { store, seedFixtures } = require('../_lib/store');

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  seedFixtures();

  const session = requireAuth(req, res, json, { roles: ['teacher'] });
  if (!session) return;
  if (!assertTeacherClass(session, session.classroomId, res, json)) return;

  const room = store().classrooms[session.classroomId];
  if (!room || room.teacherId !== session.userId) {
    return json(res, 403, { ok: false, error: 'not_your_class', message: 'ไม่ใช่ห้องของครูคนนี้' });
  }

  return json(res, 200, {
    ok: true,
    classroom: {
      code: room.code,
      name: room.name,
      members: room.members.map(function (m) {
        return { userId: m.userId, name: m.name, joinedAt: m.joinedAt };
      })
    }
  });
};
