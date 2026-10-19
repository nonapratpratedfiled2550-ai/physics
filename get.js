'use strict';

const { json, cors } = require('../_lib/ai');
const { requireAuth, assertOwner } = require('../_lib/auth');
const { getReport, seedFixtures, store } = require('../_lib/store');

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  seedFixtures();

  const session = requireAuth(req, res, json);
  if (!session) return;

  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id');
  const report = getReport(id);
  if (!report) return json(res, 404, { ok: false, error: 'not_found' });

  if (session.role === 'teacher') {
    if (!session.classroomId || report.classroomId !== session.classroomId) {
      return json(res, 403, { ok: false, error: 'cross_user_denied', message: 'รายงานนอกห้องเรียนของครู' });
    }
    const room = store().classrooms[session.classroomId];
    if (!room || room.teacherId !== session.userId) {
      return json(res, 403, { ok: false, error: 'not_your_class' });
    }
  } else if (!assertOwner(session, report.ownerId, res, json)) {
    return;
  }

  return json(res, 200, { ok: true, report: report });
};
