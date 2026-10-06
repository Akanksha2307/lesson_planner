import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { as } from './helpers.js';
import { seedDemo } from '../scripts/seedDemo.js';
import { Plan, PlanItem } from '../src/modules/plans/plans.model.js';
import { Department } from '../src/modules/masters/masters.model.js';
import { Notification } from '../src/modules/notifications/notifications.model.js';
import { remindPrincipals } from '../src/modules/notifications/notifications.service.js';
import { TopicLesson } from '../src/modules/library/library.model.js';
import { addDays, startOfWeek, todayISO } from '../src/common/dates.js';

const demo = JSON.parse(readFileSync(new URL('../scripts/data/demo.json', import.meta.url), 'utf8'));
const API = '/api/lesson-planner';
const settle = () => new Promise((r) => setTimeout(r, 150)); // let event listeners finish

beforeEach(async () => {
  await seedDemo(demo, { schoolId: 'sch1', password: 'demo123' });
});

async function submittedPlan() {
  const ws = startOfWeek(todayISO());
  const body = { classId: 'c7', sectionId: 's7a', subjectId: 'sci', startDate: addDays(ws, 140), endDate: addDays(ws, 145) };
  const plan = (await as('teacher').post(`${API}/plans/generate`).send(body).expect(201)).body.data.plan;
  await PlanItem.updateMany({ planId: plan.id }, { $set: { 'details.objectives': ['Learn it'], 'details.method': 'Lecture' } });
  await as('teacher').post(`${API}/plans/${plan.id}/submit`).expect(200);
  await settle();
  return plan;
}
const latestFor = (to) => Notification.findOne({ schoolId: 'sch1', to }).sort({ at: -1 });

describe('notifications', () => {
  it('demo notifications are seeded; each person sees only their own, newest first', async () => {
    const mine = (await as('teacher').get(`${API}/notifications`).expect(200)).body.data;
    expect(mine.map((n) => n.title)).toEqual(['Plan sent back', 'Plan approved', 'Reminder']);
    expect(mine[0]).toMatchObject({ id: expect.any(String), read: false, link: expect.stringMatching(/^\/lesson-planner\/plans\//) });
    expect((await as('hod').get(`${API}/notifications`)).body.data).toHaveLength(2);
  });

  it('marks all as read', async () => {
    await as('teacher').post(`${API}/notifications/read`).expect(200);
    const mine = (await as('teacher').get(`${API}/notifications`)).body.data;
    expect(mine.every((n) => n.read)).toBe(true);
    expect((await as('hod').get(`${API}/notifications`)).body.data.some((n) => !n.read)).toBe(true);
  });

  it('submit → the HOD gets "New plan to review"; the principal gets nothing', async () => {
    const before = await Notification.countDocuments({ schoolId: 'sch1', to: 'p1' });
    await submittedPlan();
    expect(await latestFor('t3')).toMatchObject({ title: 'New plan to review', text: 'Priya Sharma submitted Class 7-A Science.' });
    expect(await Notification.countDocuments({ schoolId: 'sch1', to: 'p1' })).toBe(before);
  });

  it('no HOD → the principal is told at submit time', async () => {
    await Department.updateOne({ _id: 'd-sci', schoolId: 'sch1' }, { $unset: { hodId: 1 } });
    await submittedPlan();
    expect(await latestFor('p1')).toMatchObject({ title: 'Plan to review', text: expect.stringMatching(/No HOD is available/) });
  });

  it('approved / sent back → the teacher is told who did it', async () => {
    const plan = await submittedPlan();
    await as('hod').post(`${API}/plans/${plan.id}/review`).send({ action: 'returned', comment: 'Add homework' }).expect(200);
    await settle();
    expect(await latestFor('t1')).toMatchObject({
      title: 'Plan sent back',
      text: 'Your Class 7-A Science plan was sent back by Anitha Rao (HOD): “Add homework”',
      link: `/lesson-planner/plans/${plan.id}`,
    });
  });

  it('principal steps in → teacher AND HOD are told', async () => {
    const waiting = await Plan.findOne({ schoolId: 'sch1', status: 'submitted', teacherId: 't1' }); // waited 3 days
    await as('principal').post(`${API}/plans/${waiting.id}/review`).send({ action: 'approved' }).expect(200);
    await settle();
    expect(await latestFor('t1')).toMatchObject({ title: 'Plan approved', text: expect.stringMatching(/approved by Dr. Meena Iyer \(Principal\)/) });
    expect(await latestFor('t3')).toMatchObject({
      title: 'Principal approved a plan',
      text: "Dr. Meena Iyer approved Priya Sharma's Class 8-B Science plan on your behalf.",
    });
  });

  it('hourly check reminds the principal once about plans waiting too long', async () => {
    const sent = await remindPrincipals();
    expect(sent).toBe(2); // the 2 demo plans were submitted 3 days ago
    expect(await latestFor('p1')).toMatchObject({ title: 'Plan waiting for HOD', text: expect.stringMatching(/waited 3 days/) });
    expect(await remindPrincipals()).toBe(0); // not again
  });

  it('a fresh plan is not reminded about', async () => {
    await Plan.updateMany({ schoolId: 'sch1', status: 'submitted' }, { $set: { status: 'approved' } });
    await submittedPlan();
    expect(await remindPrincipals()).toBe(0);
  });
});

describe('lesson library', () => {
  it('approved demo plans are in the library, newest per topic + teacher', async () => {
    const lib = (await as('teacher').get(`${API}/library`).expect(200)).body.data;
    expect(lib.length).toBeGreaterThan(0);
    expect(lib[0]).toMatchObject({ id: expect.any(String), topicTitle: expect.any(String), classLabel: expect.any(String), teacherName: expect.any(String) });
    expect(lib[0].details.objectives.length).toBeGreaterThan(0);
    const keys = lib.map((l) => `${l.topicId}|${l.teacherId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('filters by topic, subject and search text', async () => {
    const byTopic = (await as('teacher').get(`${API}/library?topicId=tp-0-0-0`)).body.data;
    expect(byTopic.length).toBeGreaterThan(0);
    expect(byTopic.every((l) => l.topicId === 'tp-0-0-0')).toBe(true);
    const maths = (await as('teacher').get(`${API}/library?subjectId=math`)).body.data;
    expect(maths.every((l) => l.subjectName === 'Mathematics')).toBe(true);
    const search = (await as('teacher').get(`${API}/library?q=soil`)).body.data;
    expect(search.every((l) => /soil/i.test(l.topicTitle + l.chapterTitle))).toBe(true);
  });

  it('when a plan is approved, its lessons are added to the library', async () => {
    const plan = await submittedPlan();
    expect(await TopicLesson.countDocuments({ planId: plan.id })).toBe(0);
    await as('hod').post(`${API}/plans/${plan.id}/review`).send({ action: 'approved' }).expect(200);
    await settle();
    const saved = await TopicLesson.find({ planId: plan.id });
    expect(saved).toHaveLength(4);
    expect(saved[0]).toMatchObject({ approvedBy: 't3', details: { objectives: ['Learn it'] } });
  });

  it('a sent-back plan is not added', async () => {
    const plan = await submittedPlan();
    await as('hod').post(`${API}/plans/${plan.id}/review`).send({ action: 'returned', comment: 'No' }).expect(200);
    await settle();
    expect(await TopicLesson.countDocuments({ planId: plan.id })).toBe(0);
  });

  it('parents cannot open the library', async () => {
    await as('parent').get(`${API}/library`).expect(403);
  });
});
