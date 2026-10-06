import request from 'supertest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/common/auth.js';

export const app = createApp();

export const USERS = {
  teacher: { id: 't1', role: 'teacher', name: 'Priya Sharma', departmentId: 'd-sci' },
  hod: { id: 't3', role: 'hod', name: 'Anitha Rao', departmentId: 'd-sci' },
  admin: { id: 'a1', role: 'admin', name: 'Suresh Varma' },
  principal: { id: 'p1', role: 'principal', name: 'Dr. Meena Iyer' },
  parent: { id: 'pa1', role: 'parent', name: 'Demo Parent' },
};

// as('hod').get('/api/...')  → request signed in as that user, school "sch1"
export const as = (role, schoolId = 'sch1') => {
  const token = signToken({ ...USERS[role], schoolId });
  const wrap = (method) => (url) =>
    request(app)[method](url).set('Authorization', `Bearer ${token}`).set('x-school-id', schoolId);
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') };
};

export const sampleSyllabus = () => ({
  classId: 'c8',
  subjectId: 'sci',
  board: 'SSC',
  chapters: [
    {
      title: 'Crop Production and Management',
      topics: [
        { title: 'Agricultural practices', estPeriods: 1, subtopics: ['Kharif and rabi crops'] },
        { title: 'Preparation of soil', estPeriods: 2 },
      ],
    },
    { title: 'Microorganisms', term: 'Term 2', topics: [{ title: 'Useful microorganisms', estPeriods: 2 }] },
  ],
});
