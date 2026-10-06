import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, as, sampleSyllabus } from './helpers.js';

const URL = '/api/lesson-planner/syllabus';
const create = async (role = 'admin', body = sampleSyllabus()) => (await as(role).put(URL).send(body).expect(200)).body.data;

describe('health and login checks', () => {
  it('health check works without login', async () => {
    const r = await request(app).get('/api/health').expect(200);
    expect(r.body.data.status).toBe('up');
  });

  it('refuses calls without a token', async () => {
    const r = await request(app).get(`${URL}?classId=c8&subjectId=sci`).expect(401);
    expect(r.body).toMatchObject({ success: false, message: expect.any(String) });
  });

  it('refuses an invalid token', async () => {
    await request(app).get(`${URL}?classId=c8&subjectId=sci`).set('Authorization', 'Bearer nope').expect(401);
  });

  it('accepts dev headers outside production (until login is built)', async () => {
    await request(app)
      .get(`${URL}?classId=c8&subjectId=sci`)
      .set('x-user-id', 't1')
      .set('x-user-role', 'teacher')
      .expect(200);
  });

  it('unknown routes answer in the standard shape', async () => {
    const r = await as('admin').get('/api/lesson-planner/nothing-here').expect(404);
    expect(r.body.success).toBe(false);
  });
});

describe('GET /syllabus', () => {
  it('returns null when there is no syllabus yet', async () => {
    const r = await as('teacher').get(`${URL}?classId=c8&subjectId=sci`).expect(200);
    expect(r.body).toEqual({ success: true, data: null, message: 'OK' });
  });

  it('needs classId and subjectId', async () => {
    const r = await as('teacher').get(`${URL}?classId=c8`).expect(400);
    expect(r.body.message).toMatch(/subjectId/);
  });
});

describe('PUT /syllabus (save)', () => {
  it('creates a syllabus in the same shape the frontend uses', async () => {
    const syl = await create();
    expect(syl).toMatchObject({ id: expect.any(String), classId: 'c8', subjectId: 'sci', board: 'SSC', version: 1 });
    expect(syl._id).toBeUndefined();
    const [ch1, ch2] = syl.chapters;
    expect(ch1).toMatchObject({ id: expect.any(String), order: 1, term: 'Term 1' });
    expect(ch2).toMatchObject({ order: 2, term: 'Term 2' });
    expect(ch1.topics[1]).toMatchObject({ order: 2, chapterId: ch1.id, estPeriods: 2 });
    // a topic with no subtopics gets its own title as the only subtopic (same as the mock)
    expect(ch1.topics[1].subtopics).toEqual(['Preparation of soil']);

    const r = await as('teacher').get(`${URL}?classId=c8&subjectId=sci`).expect(200);
    expect(r.body.data.id).toBe(syl.id);
  });

  it('keeps topic ids when saved again, so plans stay linked', async () => {
    const syl = await create();
    const topicId = syl.chapters[0].topics[0].id;
    syl.chapters[0].topics[0].title = 'Agricultural practices (updated)';
    syl.chapters[0].topics.push({ title: 'Brand new topic', estPeriods: 1 });

    const r = await as('hod').put(URL).send(syl).expect(200);
    const topics = r.body.data.chapters[0].topics;
    expect(topics[0]).toMatchObject({ id: topicId, title: 'Agricultural practices (updated)' });
    expect(topics[2].id).toEqual(expect.any(String));
    expect(r.body.data.version).toBe(2);
  });

  it('rejects a save made on an old copy (someone else saved first)', async () => {
    const syl = await create();
    await as('hod').put(URL).send(syl).expect(200); // version 1 → 2
    const r = await as('admin').put(URL).send(syl).expect(409); // still says version 1
    expect(r.body.message).toMatch(/changed by someone else/);
  });

  it('teachers and parents cannot edit the syllabus', async () => {
    await as('teacher').put(URL).send(sampleSyllabus()).expect(403);
    await as('parent').put(URL).send(sampleSyllabus()).expect(403);
  });

  it('every chapter and topic needs a name', async () => {
    const body = sampleSyllabus();
    body.chapters[0].topics[0].title = '  ';
    const r = await as('admin').put(URL).send(body).expect(400);
    expect(r.body.message).toMatch(/Topic name cannot be empty/);
  });

  it('keeps schools separate', async () => {
    await create();
    const r = await as('teacher', 'other-school').get(`${URL}?classId=c8&subjectId=sci`).expect(200);
    expect(r.body.data).toBeNull();
  });
});

describe('POST /syllabus/import', () => {
  const rows = [
    { Chapter: 'Rational Numbers', Topic: 'Properties', Periods: 2, Subtopics: 'Closure; Commutativity' },
    { Chapter: 'Rational Numbers', Topic: 'Number line', Periods: '1' },
    { Chapter: '', Topic: 'No chapter – skipped' },
    { Chapter: 'Linear Equations', Topic: 'Solving equations', Term: 'Term 2' },
  ];

  it('builds chapters and topics from Excel rows', async () => {
    const r = await as('admin')
      .post(`${URL}/import`)
      .send({ classId: 'c8', subjectId: 'math', rows })
      .expect(200);
    const syl = r.body.data;
    expect(syl.chapters.map((c) => c.title)).toEqual(['Rational Numbers', 'Linear Equations']);
    expect(syl.chapters[0].topics[0]).toMatchObject({ estPeriods: 2, subtopics: ['Closure', 'Commutativity'] });
    expect(syl.chapters[1].term).toBe('Term 2');
    expect(syl.skippedRows).toEqual([4]);
    expect(r.body.message).toMatch(/1 row\(s\) skipped/);
  });

  it('re-importing keeps ids of topics with the same name', async () => {
    const first = (await as('admin').post(`${URL}/import`).send({ classId: 'c8', subjectId: 'math', rows })).body.data;
    const second = (await as('admin').post(`${URL}/import`).send({ classId: 'c8', subjectId: 'math', rows }).expect(200))
      .body.data;
    expect(second.id).toBe(first.id);
    expect(second.chapters[0].topics[0].id).toBe(first.chapters[0].topics[0].id);
  });

  it('fails clearly when no row has a chapter and topic', async () => {
    const r = await as('admin')
      .post(`${URL}/import`)
      .send({ classId: 'c8', subjectId: 'math', rows: [{ Foo: 'bar' }] })
      .expect(400);
    expect(r.body.message).toMatch(/Chapter, Topic, Periods, Subtopics/);
  });
});

describe('POST /syllabus/:id/topics (add a lesson to the syllabus)', () => {
  it('a teacher can add a topic to an existing chapter; it is marked as teacher-added', async () => {
    const syl = await create();
    const ch = syl.chapters[0];
    const r = await as('teacher')
      .post(`${URL}/${syl.id}/topics`)
      .send({ chapterId: ch.id, title: 'Organic farming', estPeriods: 2, afterTopicId: ch.topics[0].id })
      .expect(201);
    const { topic, syllabus } = r.body.data;
    expect(topic).toMatchObject({ title: 'Organic farming', source: 'teacher', addedBy: 't1', chapterId: ch.id });
    expect(syllabus.chapters[0].topics.map((t) => t.title)).toEqual([
      'Agricultural practices',
      'Organic farming',
      'Preparation of soil',
    ]);
    expect(syllabus.chapters[0].topics.map((t) => t.order)).toEqual([1, 2, 3]);
  });

  it('can create a new chapter by name', async () => {
    const syl = await create();
    const r = await as('hod')
      .post(`${URL}/${syl.id}/topics`)
      .send({ chapterTitle: 'Pollution', title: 'Air pollution' })
      .expect(201);
    expect(r.body.data.syllabus.chapters).toHaveLength(3);
    expect(r.body.data.topic.source).toBe('syllabus'); // added by HOD, not a teacher
  });

  it('stops the same topic being added twice to a chapter', async () => {
    const syl = await create();
    const r = await as('teacher')
      .post(`${URL}/${syl.id}/topics`)
      .send({ chapterId: syl.chapters[0].id, title: 'agricultural PRACTICES' })
      .expect(409);
    expect(r.body.message).toMatch(/already in the chapter/);
  });

  it('a later full save keeps the topic marked as teacher-added', async () => {
    const syl = await create();
    const added = (
      await as('teacher').post(`${URL}/${syl.id}/topics`).send({ chapterId: syl.chapters[0].id, title: 'Organic farming' })
    ).body.data.syllabus;
    const r = await as('admin').put(URL).send(added).expect(200);
    const t = r.body.data.chapters[0].topics.find((x) => x.title === 'Organic farming');
    expect(t).toMatchObject({ source: 'teacher', addedBy: 't1' });
  });

  it('needs a chapter, and the syllabus must exist', async () => {
    const syl = await create();
    await as('teacher').post(`${URL}/${syl.id}/topics`).send({ title: 'x' }).expect(400);
    await as('teacher').post(`${URL}/syl-missing/topics`).send({ chapterTitle: 'A', title: 'x' }).expect(404);
    await as('parent').post(`${URL}/${syl.id}/topics`).send({ chapterTitle: 'A', title: 'x' }).expect(403);
  });
});
