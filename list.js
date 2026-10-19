'use strict';

const { json, cors } = require('../_lib/ai');
const { requireAuth } = require('../_lib/auth');
const { listReportsFor, seedFixtures } = require('../_lib/store');

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  seedFixtures();

  const session = requireAuth(req, res, json);
  if (!session) return;

  const rows = listReportsFor(session).map(function (r) {
    // Students never see other owners; teachers see class-scoped only (already filtered)
    return {
      id: r.id,
      problemId: r.problemId,
      note: r.note,
      status: r.status,
      at: r.at,
      ownerId: session.role === 'teacher' ? r.ownerId : undefined,
      classroomId: r.classroomId
    };
  });

  return json(res, 200, { ok: true, reports: rows, scope: session.role === 'teacher' ? 'classroom' : 'self' });
};
