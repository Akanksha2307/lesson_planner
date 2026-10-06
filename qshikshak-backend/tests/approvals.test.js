import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { app, as } from './helpers.js';
import { seedDemo } from '../scripts/seedDemo.js';
import { Plan, PlanItem } from '../src/modules/plans/plans.model.js';
import { Department, Settings, Staff } from '../src/modules/masters/masters.model.js';
import { events } from '../src/common/events.js';
import { signToken } from '../src/common/auth.js';
import { addDays, startOfWeek, todayISO } from '../src/common/dates.js';

const demo = JSON.parse(readFileSync(new URL('../scripts/data/demo.json', import.meta.url), 'utf8'));
const API = '/api/lesson-planner';
let seen = [];
const record = (name) => (p) => seen.push({ name, ...p });
const onSubmitted = record('plan.submitted');
const onReviewed = record('plan.reviewed');

beforeEach(async () => {
  await seedDemo(demo, { schoolId: 'sch1', password: 'demo123' });
  seen = [];
  events.on('plan.submitted', onSubmitted);
  events.on('plan.reviewed', onReviewed);
});
afterEach(() => {
  events.off('plan.submitted', onSubmitted);
  events.off('plan.reviewed', onReviewed);
});
const tick = () => new Promise((r) => setTimeout(r, 20));

// A new draft plan for Priya (Class 7-A Science) far in the future
async function draftPlan({ fill = true } = {}) {
  const ws = startOfWeek(todayISO());
  const body = { classId: 'c7', sectionId: 's7a', subjectId: 'sci', startDate: addDays(ws, 140), endDate: addDays(ws, 145) };
  const plan = (await as('teacher').post(`${API}/plans/generate`).send(body).expect(201)).body.data.plan;
  if (fill) await PlanItem.updateMany({ planId: plan.id }, { $set: { 'details.objectives': ['x'], 'details.method': 'Lecture' } });
  return plan;
}
const submitted = () => Plan.findOne({ schoolId: 'sch1', teacherId: 't1', status: 'submitted' });

describe('submit', () => {
  it('sends a complete plan for approval and tells the HOD + principal', async () => {
    const plan = await draftPlan();
    const r = await as('teacher').post(`${API}/plans/${plan.id}/submit`).expect(200);
    expect(r.body.message).toBe('Plan sent to HOD');
    expect(r.body.data).toMatchObject({ id: plan.id, status: 'submitted', submittedAt: expect.any(String) });
    await tick();
    expect(seen).toEqual([
      expect.objectContaining({ name: 'plan.submitted', planId: plan.id, teacherId: 't1', reviewerId: 't3', reviewerRole: 'hod' }),
    ]);
  });

  it('refuses when lessons are missing objectives or method', async () => {
    const plan = await draftPlan({ fill: false });
    const r = await as('teacher').post(`${API}/plans/${plan.id}/submit`).expect(400);
    expect(r.body.message).toMatch(/^4 lessons are missing objectives or teaching method/);
  });

  it('is approved straight away when the school turned approval off', async () => {
    await Settings.updateOne({ _id: 'sch1' }, { $set: { approvalRequired: false } });
    const plan = await draftPlan();
    const r = await as('teacher').post(`${API}/plans/${plan.id}/submit`).expect(200);
    expect(r.body).toMatchObject({ message: 'Plan approved', data: { status: 'approved' } });
  });

  it('only the plan’s own teacher can submit, and only once', async () => {
    const plan = await draftPlan();
    const ravi = signToken({ id: 't2', role: 'teacher', name: 'Ravi', schoolId: 'sch1' });
    await request(app).post(`${API}/plans/${plan.id}/submit`).set('Authorization', `Bearer ${ravi}`).expect(403);
    await as('hod').post(`${API}/plans/${plan.id}/submit`).expect(403);
    await as('teacher').post(`${API}/plans/${plan.id}/submit`).expect(200);
    const again = await as('teacher').post(`${API}/plans/${plan.id}/submit`).expect(409);
    expect(again.body.message).toMatch(/already waiting/);
  });
});

describe('review', () => {
  it('HOD approves; the review is saved with the reviewer’s name', async () => {
    const plan = await submitted();
    const r = await as('hod').post(`${API}/plans/${plan.id}/review`).send({ action: 'approved', comment: 'Good' }).expect(200);
    expect(r.body.message).toBe('Plan approved');
    expect(r.body.data.status).toBe('approved');
    expect(r.body.data.reviews.at(-1)).toMatchObject({ action: 'approved', by: 't3', byName: 'Anitha Rao', comment: 'Good' });
    await tick();
    expect(seen.at(-1)).toMatchObject({ name: 'plan.reviewed', action: 'approved', teacherId: 't1', onBehalfOfHodId: null });
  });

  it('sending back needs a comment', async () => {
    const plan = await submitted();
    const r = await as('hod').post(`${API}/plans/${plan.id}/review`).send({ action: 'returned', comment: '  ' }).expect(400);
    expect(r.body.message).toMatch(/Add a comment/);
    await as('hod').post(`${API}/plans/${plan.id}/review`).send({ action: 'returned', comment: 'Add an activity' }).expect(200);
    expect((await Plan.findById(plan.id)).status).toBe('returned');
  });

  it('principal can step in once the plan has waited 2+ days; the HOD is told', async () => {
    const plan = await submitted(); // demo plans were submitted 3 days ago
    await as('principal').post(`${API}/plans/${plan.id}/review`).send({ action: 'approved' }).expect(200);
    await tick();
    expect(seen.at(-1)).toMatchObject({ reviewerRole: 'principal', onBehalfOfHodId: 't3' });
  });

  it('first review wins – the second reviewer is told who already reviewed', async () => {
    const plan = await submitted();
    const [a, b] = await Promise.all([
      as('hod').post(`${API}/plans/${plan.id}/review`).send({ action: 'approved' }),
      as('principal').post(`${API}/plans/${plan.id}/review`).send({ action: 'approved' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.message).toMatch(/already reviewed by (Anitha Rao|Dr. Meena Iyer)/);
    expect((await Plan.findById(plan.id)).reviews).toHaveLength(1);
  });

  it('an HOD of another department cannot review', async () => {
    await Staff.create({ _id: 'h2', schoolId: 'sch1', name: 'Other HOD', role: 'hod', username: 'h2' });
    await Department.updateOne({ _id: 'd-math', schoolId: 'sch1' }, { $set: { hodId: 'h2' } });
    const scienceWaiting = await submitted();
    const h2 = signToken({ id: 'h2', role: 'hod', name: 'Other HOD', schoolId: 'sch1' });
    await request(app)
      .post(`${API}/plans/${scienceWaiting.id}/review`)
      .set('Authorization', `Bearer ${h2}`)
      .send({ action: 'approved' })
      .expect(403);
    // …and their Approvals page only shows Maths plans
    const list = await request(app).get(`${API}/approvals`).set('Authorization', `Bearer ${h2}`).expect(200);
    expect(list.body.data.map((p) => p.subjectName)).toEqual(['Mathematics']);
  });

  it('when the approver setting is "principal", the HOD cannot review', async () => {
    await Settings.updateOne({ _id: 'sch1' }, { $set: { approver: 'principal' } });
    const plan = await submitted();
    await as('hod').post(`${API}/plans/${plan.id}/review`).send({ action: 'approved' }).expect(403);
    await as('principal').post(`${API}/plans/${plan.id}/review`).send({ action: 'approved' }).expect(200);
  });

  it('teachers cannot review; a plan that is not waiting cannot be reviewed', async () => {
    const plan = await submitted();
    await as('teacher').post(`${API}/plans/${plan.id}/review`).send({ action: 'approved' }).expect(403);
    const draft = await draftPlan();
    const r = await as('hod').post(`${API}/plans/${draft.id}/review`).send({ action: 'approved' }).expect(409);
    expect(r.body.message).toMatch(/not waiting/);
  });
});

describe('principal only when the HOD is not available', () => {
  const freshlySubmitted = async () => {
    const plan = await draftPlan();
    await as('teacher').post(`${API}/plans/${plan.id}/submit`).expect(200);
    return plan;
  };

  it('blocks the principal while the HOD is available and the plan is new', async () => {
    const plan = await freshlySubmitted();
    const r = await as('principal').post(`${API}/plans/${plan.id}/review`).send({ action: 'approved' }).expect(403);
    expect(r.body.message).toBe('Anitha Rao (HOD) reviews this plan. You can step in if the HOD is unavailable, or if it is still waiting in 2 days.');
    await as('hod').post(`${API}/plans/${plan.id}/review`).send({ action: 'approved' }).expect(200);
  });

  it('allows the principal when the plan waited longer than the setting', async () => {
    await Settings.updateOne({ _id: 'sch1' }, { $set: { principalAfterDays: 1 } });
    const plan = await freshlySubmitted();
    await Plan.updateOne({ _id: plan.id }, { $set: { submittedAt: new Date(Date.now() - 86400000 * 1.5) } });
    await as('principal').post(`${API}/plans/${plan.id}/review`).send({ action: 'approved' }).expect(200);
  });

  it('no HOD assigned → submit goes to the principal, who can review straight away', async () => {
    await Department.updateOne({ _id: 'd-sci', schoolId: 'sch1' }, { $unset: { hodId: 1 } });
    const plan = await draftPlan();
    const r = await as('teacher').post(`${API}/plans/${plan.id}/submit`).expect(200);
    expect(r.body.message).toBe('Plan sent to the principal (no HOD available)');
    await tick();
    expect(seen.at(-1)).toMatchObject({ name: 'plan.submitted', reviewerId: 'p1', reviewerRole: 'principal' });
    await as('principal').post(`${API}/plans/${plan.id}/review`).send({ action: 'approved' }).expect(200);
  });

  it('HOD account inactive → the principal can review', async () => {
    const plan = await freshlySubmitted();
    await Staff.updateOne({ _id: 't3', schoolId: 'sch1' }, { $set: { active: false } });
    await as('principal').post(`${API}/plans/${plan.id}/review`).send({ action: 'returned', comment: 'Please add homework' }).expect(200);
  });

  it('the principal’s Approvals list says which plans they can review now', async () => {
    const plan = await freshlySubmitted();
    const list = (await as('principal').get(`${API}/approvals`).expect(200)).body.data;
    const fresh = list.find((p) => p.id === plan.id);
    const old = list.find((p) => p.id !== plan.id);
    expect(fresh).toMatchObject({ canReview: false, reviewNote: expect.stringMatching(/Anitha Rao \(HOD\) reviews this plan/) });
    expect(old).toMatchObject({ canReview: true, reviewNote: null });
    const hodList = (await as('hod').get(`${API}/approvals`).expect(200)).body.data;
    expect(hodList.every((p) => p.canReview)).toBe(true);
  });

  it('admin can change the number of days', async () => {
    const r = await as('admin').put(`${API}/settings`).send({ principalAfterDays: 3 }).expect(200);
    expect(r.body.data.principalAfterDays).toBe(3);
  });
});

describe('full cycle and approvals list', () => {
  it('returned → teacher edits → submits again → approved', async () => {
    const returned = await Plan.findOne({ schoolId: 'sch1', status: 'returned' });
    const item = await PlanItem.findOne({ planId: returned.id });
    await as('teacher').patch(`${API}/plan-items/${item.id}`).send({ details: { activities: 'Leaf starch test' } }).expect(200);
    await as('teacher').post(`${API}/plans/${returned.id}/submit`).expect(200);
    await as('hod').post(`${API}/plans/${returned.id}/review`).send({ action: 'approved' }).expect(200);
    const plan = await Plan.findById(returned.id);
    expect(plan.status).toBe('approved');
    expect(plan.reviews.map((r) => r.action)).toEqual(['returned', 'approved']);
  });

  it('the HOD sees the waiting plans; tabs filter by status', async () => {
    const waiting = (await as('hod').get(`${API}/approvals`).expect(200)).body.data;
    expect(waiting).toHaveLength(2);
    expect(waiting[0]).toMatchObject({ status: 'submitted', teacherName: expect.any(String), submittedAt: expect.any(String) });
    expect((await as('principal').get(`${API}/approvals?status=returned`).expect(200)).body.data).toHaveLength(1);
    await as('teacher').get(`${API}/approvals`).expect(403);
  });
});
