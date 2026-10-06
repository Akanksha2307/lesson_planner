import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { app, as } from './helpers.js';
import { seedDemo } from '../scripts/seedDemo.js';

const demo = JSON.parse(readFileSync(new URL('../scripts/data/demo.json', import.meta.url), 'utf8'));
const SCHOOL = 'sch1';

beforeEach(async () => {
  await seedDemo(demo, { schoolId: SCHOOL, password: 'demo123' });
});

const login = (username, password) =>
  request(app).post('/api/auth/login').set('x-school-id', SCHOOL).send({ username, password });

describe('login', () => {
  it('logs in with username + password and returns a token', async () => {
    const r = await login('T1', 'demo123').expect(200); // username is not case-sensitive
    expect(r.body.data.user).toEqual({ id: 't1', name: 'Priya Sharma', role: 'teacher', departmentId: 'd-sci', schoolId: SCHOOL });
    expect(r.body.data.token).toEqual(expect.any(String));
    expect(r.body.data.user.passwordHash).toBeUndefined();
  });

  it('the token works on the API and /me returns the user', async () => {
    const { token } = (await login('t3', 'demo123')).body.data;
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.data).toMatchObject({ id: 't3', role: 'hod' });
    await request(app)
      .get('/api/lesson-planner/syllabus?classId=c8&subjectId=sci')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('wrong password and unknown user give the same message', async () => {
    const a = await login('t1', 'nope').expect(401);
    const b = await login('nobody', 'demo123').expect(401);
    expect(a.body.message).toBe('Wrong username or password.');
    expect(b.body.message).toBe(a.body.message);
  });

  it('needs username and password', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 't1' }).expect(400);
    expect(r.body.message).toMatch(/Password is required/);
  });

  it('a token cannot be used to read another school (school comes from the token)', async () => {
    const { token } = (await login('t1', 'demo123')).body.data;
    const r = await request(app)
      .get('/api/lesson-planner/masters')
      .set('Authorization', `Bearer ${token}`)
      .set('x-school-id', 'other-school')
      .expect(200);
    expect(r.body.data.staff.length).toBe(7); // still sch1's data
  });

  it('demo login picks the first person of a role ("View as" switch)', async () => {
    const r = await request(app).post('/api/auth/demo-login').set('x-school-id', SCHOOL).send({ role: 'principal' }).expect(200);
    expect(r.body.data.user).toMatchObject({ id: 'p1', name: 'Dr. Meena Iyer' });
  });
});

describe('GET /masters', () => {
  it('returns the same data as the frontend mock', async () => {
    const r = await as('teacher').get('/api/lesson-planner/masters').expect(200);
    const m = r.body.data;
    expect(m.classes.map((c) => c.id)).toEqual(['c7', 'c8']);
    expect(m.sections.map((s) => s.id)).toEqual(['s7a', 's8a', 's8b']);
    expect(m.departments.find((d) => d.id === 'd-sci').hodId).toBe('t3');
    expect(m.staff).toHaveLength(7);
    expect(m.staff[0]).toEqual({ id: 't1', name: 'Priya Sharma', role: 'teacher', departmentId: 'd-sci' });
    expect(m.timetable).toHaveLength(31);
    expect(m.timetable[0]).toMatchObject({ sectionId: expect.any(String), weekday: 0, periodId: expect.any(String) });
    expect(m.usersByRole).toEqual({ teacher: 't1', hod: 't3', admin: 'a1', principal: 'p1', parent: 'pa1' });
    expect(m.periods).toHaveLength(8);
    expect(m.holidays.length).toBe(4);
    expect(m.templates.find((t) => t.isDefault).id).toBe('tpl-ssc');
    expect(m.settings).toMatchObject({ approvalRequired: true, editAfterApproval: 'reapprove' });
    expect(m.settings.bellSchedule).toBeUndefined();
  });

  it('the seeded syllabus keeps the frontend ids', async () => {
    const r = await as('teacher').get('/api/lesson-planner/syllabus?classId=c8&subjectId=sci').expect(200);
    expect(r.body.data.id).toBe('syl-c8-sci');
    expect(r.body.data.chapters[0].topics[0].id).toBe('tp-0-0-0');
  });

  it('seeding again resets the demo (no duplicates)', async () => {
    await seedDemo(demo, { schoolId: SCHOOL, password: 'demo123' });
    const r = await as('admin').get('/api/lesson-planner/masters').expect(200);
    expect(r.body.data.staff).toHaveLength(7);
  });
});

describe('settings and templates', () => {
  it('admin changes a setting; others stay the same', async () => {
    const r = await as('admin').put('/api/lesson-planner/settings').send({ approvalRequired: false }).expect(200);
    expect(r.body.data).toMatchObject({ approvalRequired: false, skipHolidays: true });
  });

  it('rejects a bad value', async () => {
    await as('admin').put('/api/lesson-planner/settings').send({ editAfterApproval: 'whatever' }).expect(400);
  });

  it('teachers and HODs cannot change settings', async () => {
    await as('teacher').put('/api/lesson-planner/settings').send({ approvalRequired: false }).expect(403);
    await as('hod').put('/api/lesson-planner/settings').send({ approvalRequired: false }).expect(403);
  });

  it('making a template default turns the others off', async () => {
    const m = (await as('admin').get('/api/lesson-planner/masters')).body.data;
    const cbse = m.templates.find((t) => t.id === 'tpl-cbse');
    await as('principal').put('/api/lesson-planner/templates/tpl-cbse').send({ ...cbse, isDefault: true }).expect(200);
    const after = (await as('admin').get('/api/lesson-planner/masters')).body.data.templates;
    expect(after.filter((t) => t.isDefault).map((t) => t.id)).toEqual(['tpl-cbse']);
  });
});
