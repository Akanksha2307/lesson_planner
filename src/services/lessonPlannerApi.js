// Single entry point for all Lesson Planner API calls.
// VITE_USE_MOCK=true  -> in-browser mock (services/mock)
// VITE_USE_MOCK=false -> real backend via axios
import { http } from './apiClient';
import * as mock from './mock/api';

export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const base = '/lesson-planner';
const pick =
  (mockFn, realFn) =>
  (...args) =>
    USE_MOCK ? mockFn(...args) : realFn(...args);

export const lessonPlannerApi = {
    // Login → { token, user }
  login: pick(mock.login, (body) => http.post('/auth/login', body)),
  // Masters (classes, sections, subjects, staff, timetable, holidays, exams, templates, settings)
  getMasters: pick(mock.getMasters, () => http.get(`${base}/masters`)),

  // Today & calendar
  getToday: pick(mock.getToday, (p) => http.get(`${base}/today`, { params: p })),
  getCalendar: pick(mock.getCalendar, (p) => http.get(`${base}/calendar`, { params: p })),

  // Plans
  getPlans: pick(mock.getPlans, (p) => http.get(`${base}/plans`, { params: p })),
  getPlan: pick(mock.getPlan, (id) => http.get(`${base}/plans/${id}`)),
  generatePlan: pick(mock.generatePlan, (body) => http.post(`${base}/plans/generate`, body)),
  deletePlan: pick(mock.deletePlan, (id) => http.delete(`${base}/plans/${id}`)),
  extendPlan: pick(mock.extendPlan, (id, body) => http.post(`${base}/plans/${id}/extend`, body)),
  submitPlan: pick(mock.submitPlan, (id) => http.post(`${base}/plans/${id}/submit`)),
  reviewPlan: pick(mock.reviewPlan, (id, body) => http.post(`${base}/plans/${id}/review`, body)),

  // Plan items (one per period)
  updateItem: pick(mock.updateItem, (id, body) => http.patch(`${base}/plan-items/${id}`, body)),
  swapItems: pick(mock.swapItems, (a, b) => http.post(`${base}/plan-items/swap`, { a, b })),
  completeItem: pick(mock.completeItem, (id, body) => http.post(`${base}/plan-items/${id}/complete`, body)),
  rescheduleItem: pick(mock.rescheduleItem, (id, body) => http.post(`${base}/plan-items/${id}/reschedule`, body)),
  cancelItem: pick(mock.cancelItem, (id, body) => http.post(`${base}/plan-items/${id}/cancel`, body)),
  continueLesson: pick(mock.continueLesson, (id, body) => http.post(`${base}/plan-items/${id}/continue`, body)),
  moveItem: pick(mock.moveItem, (id, body) => http.post(`${base}/plan-items/${id}/move`, body)),
  addPeriods: pick(mock.addPeriods, (id, body) => http.post(`${base}/plan-items/${id}/add-periods`, body)),
  // History & library
  getHistory: pick(mock.getHistory, (p) => http.get(`${base}/history`, { params: p })),
  getLibrary: pick(mock.getLibrary, (p) => http.get(`${base}/library`, { params: p })),

  // Syllabus
  getSyllabus: pick(mock.getSyllabus, (p) => http.get(`${base}/syllabus`, { params: p })),
  saveSyllabus: pick(mock.saveSyllabus, (body) => http.put(`${base}/syllabus`, body)),
  importSyllabus: pick(mock.importSyllabus, (body) => http.post(`${base}/syllabus/import`, body)),

  // Reports
  getCoverage: pick(mock.getCoverage, (p) => http.get(`${base}/reports/coverage`, { params: p })),
  getTeacherReport: pick(mock.getTeacherReport, () => http.get(`${base}/reports/teachers`)),

  // Notifications
  getNotifications: pick(mock.getNotifications, (p) => http.get(`${base}/notifications`, { params: p })),
  markNotificationsRead: pick(mock.markNotificationsRead, () => http.post(`${base}/notifications/read`)),

  // Settings & templates
  saveSettings: pick(mock.saveSettings, (body) => http.put(`${base}/settings`, body)),
  saveTemplate: pick(mock.saveTemplate, (body) => http.put(`${base}/templates/${body.id}`, body)),
  resetDemo: pick(mock.resetDemo, () => Promise.resolve({ success: true })),

  // AI lesson suggestion
  aiSuggest: pick(mock.aiSuggest, (body) => http.post(`${base}/ai/suggest`, body)),
};
