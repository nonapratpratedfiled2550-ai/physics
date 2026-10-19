'use strict';

/**
 * Ephemeral Preview store (per serverless isolate).
 * Not a second learner DB — only classroom roster + problem reports for Phase 8 APIs.
 * Production would swap to durable store after approval; never seed with real student PII.
 */
function store() {
  if (!globalThis.__physPhase8Store) {
    globalThis.__physPhase8Store = {
      classrooms: Object.create(null),
      reports: [],
      /** synthetic fixtures only */
      fixturesSeeded: false
    };
  }
  return globalThis.__physPhase8Store;
}

function seedFixtures() {
  const s = store();
  if (s.fixturesSeeded) return s;
  // Synthetic demo data — NOT real learners (approval plan: fixtures only)
  s.classrooms['DEMO01'] = {
    code: 'DEMO01',
    name: 'ห้องสาธิต (synthetic)',
    teacherId: 'teacher-fixture-001',
    createdAt: Date.now(),
    members: [
      { userId: 'student-fixture-a', name: 'นักเรียนจำลอง A', joinedAt: Date.now() },
      { userId: 'student-fixture-b', name: 'นักเรียนจำลอง B', joinedAt: Date.now() }
    ]
  };
  s.reports.push({
    id: 'rep-fixture-1',
    ownerId: 'student-fixture-a',
    classroomId: 'DEMO01',
    problemId: 'car-accel',
    note: 'ข้อความจำลองสำหรับทดสอบเท่านั้น',
    status: 'open',
    at: Date.now()
  });
  s.fixturesSeeded = true;
  return s;
}

function createClassroom({ teacherId, name, code }) {
  const s = store();
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (c.length < 4) throw Object.assign(new Error('bad_code'), { code: 400 });
  if (s.classrooms[c]) throw Object.assign(new Error('code_taken'), { code: 409 });
  s.classrooms[c] = {
    code: c,
    name: String(name || 'ห้องเรียน').slice(0, 80),
    teacherId,
    createdAt: Date.now(),
    members: []
  };
  return s.classrooms[c];
}

function joinClassroom({ code, userId, name }) {
  const s = store();
  const c = String(code || '').toUpperCase();
  const room = s.classrooms[c];
  if (!room) throw Object.assign(new Error('not_found'), { code: 404 });
  if (!room.members.some(function (m) { return m.userId === userId; })) {
    room.members.push({ userId, name: String(name || userId).slice(0, 64), joinedAt: Date.now() });
  }
  return room;
}

function addReport(row) {
  const s = store();
  const item = {
    id: 'rep-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    ownerId: row.ownerId,
    classroomId: row.classroomId || null,
    problemId: String(row.problemId || '').slice(0, 64),
    note: String(row.note || '').slice(0, 500),
    status: 'open',
    at: Date.now()
  };
  s.reports.push(item);
  if (s.reports.length > 500) s.reports = s.reports.slice(-500);
  return item;
}

function listReportsFor(session) {
  const s = store();
  if (session.role === 'teacher') {
    return s.reports.filter(function (r) {
      return r.classroomId && r.classroomId === session.classroomId;
    });
  }
  return s.reports.filter(function (r) { return r.ownerId === session.userId; });
}

function getReport(id) {
  return store().reports.filter(function (r) { return r.id === id; })[0] || null;
}

module.exports = {
  store,
  seedFixtures,
  createClassroom,
  joinClassroom,
  addReport,
  listReportsFor,
  getReport
};
