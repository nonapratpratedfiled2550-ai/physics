'use strict';

const { json, readBody, cors } = require('../_lib/ai');
const { requireAuth } = require('../_lib/auth');
const { joinClassroom, seedFixtures } = require('../_lib/store');

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  seedFixtures();

  const session = requireAuth(req, res, json, { roles: ['student', 'teacher'] });
  if (!session) return;

  let body;
  try { body = await readBody(req, 20000); }
  catch (err) { return json(res, err.code || 400, { ok: false, error: err.message }); }

  try {
    const room = joinClassroom({
      code: body.code,
      userId: session.userId,
      name: body.name || session.userId
    });
    return json(res, 200, {
      ok: true,
      classroom: { code: room.code, name: room.name, memberCount: room.members.length }
    });
  } catch (err) {
    return json(res, err.code || 400, { ok: false, error: err.message });
  }
};
