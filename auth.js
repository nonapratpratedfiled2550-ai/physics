'use strict';

const crypto = require('crypto');

function sessionSecret() {
  if (process.env.PHYS_SESSION_SECRET) return process.env.PHYS_SESSION_SECRET;
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('PHYS_SESSION_SECRET is required in production');
  }
  return process.env.AI_GATEWAY_API_KEY || 'phys-dev-preview-only-not-for-prod';
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function fromB64url(str) {
  return Buffer.from(String(str), 'base64url');
}

/** Create signed session payload. Never embed PII beyond synthetic ids. */
function mintSession({ userId, role, classroomId }) {
  const body = {
    uid: String(userId || '').slice(0, 64),
    role: role === 'teacher' ? 'teacher' : 'student',
    classId: classroomId ? String(classroomId).slice(0, 32) : null,
    iat: Date.now(),
    exp: Date.now() + 12 * 3600 * 1000
  };
  const payload = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function verifySession(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) {
    return { ok: false, error: 'missing_session' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, error: 'invalid_session' };
  const [payload, sig] = parts;
  const expect = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'bad_signature' };
  }
  let body;
  try {
    body = JSON.parse(fromB64url(payload).toString('utf8'));
  } catch (err) {
    return { ok: false, error: 'bad_payload' };
  }
  if (!body || !body.uid || !body.exp || body.exp < Date.now()) {
    return { ok: false, error: 'expired' };
  }
  if (body.role !== 'teacher' && body.role !== 'student') {
    return { ok: false, error: 'bad_role' };
  }
  return {
    ok: true,
    userId: body.uid,
    role: body.role,
    classroomId: body.classId || null,
    exp: body.exp
  };
}

function readAuthHeader(req) {
  const h = req.headers || {};
  const auth = h.authorization || h.Authorization || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return h['x-phys-session'] || h['X-Phys-Session'] || '';
}

function requireAuth(req, res, json, opts) {
  opts = opts || {};
  const token = readAuthHeader(req);
  const session = verifySession(token);
  if (!session.ok) {
    json(res, 401, { ok: false, error: 'unauthorized', message: 'ต้องมีเซสชันที่ลงนามฝั่งเซิร์ฟเวอร์', detail: session.error });
    return null;
  }
  if (opts.roles && opts.roles.indexOf(session.role) === -1) {
    json(res, 403, { ok: false, error: 'forbidden', message: 'สิทธิ์ไม่เพียงพอสำหรับ API นี้' });
    return null;
  }
  return session;
}

/** Ensure resource.ownerId matches session — blocks cross-user reads/writes. */
function assertOwner(session, ownerId, res, json) {
  if (!session || !ownerId || session.userId !== ownerId) {
    json(res, 403, { ok: false, error: 'cross_user_denied', message: 'ห้ามเข้าถึงข้อมูลของผู้ใช้อื่น' });
    return false;
  }
  return true;
}

function assertTeacherClass(session, classroomId, res, json) {
  if (!session || session.role !== 'teacher') {
    json(res, 403, { ok: false, error: 'forbidden', message: 'เฉพาะครู' });
    return false;
  }
  if (!classroomId || session.classroomId !== classroomId) {
    json(res, 403, { ok: false, error: 'class_mismatch', message: 'ห้องเรียนไม่ตรงกับเซสชันครู' });
    return false;
  }
  return true;
}

module.exports = {
  mintSession,
  verifySession,
  readAuthHeader,
  requireAuth,
  assertOwner,
  assertTeacherClass,
  sessionSecret
};
