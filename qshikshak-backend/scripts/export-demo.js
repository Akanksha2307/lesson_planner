import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const frontend = path.resolve(process.argv[2] || '..');
const seedSrc = await readFile(path.join(frontend, 'src/services/mock/seed.js'), 'utf8');
const constSrc = await readFile(path.join(frontend, 'src/utils/constants.js'), 'utf8');

// The date helpers seed.js imports from '@/utils/date'
const dateHelpers = `
  const toISO = (d) => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayISO = () => toISO(new Date());
  const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
  const startOfWeek = (iso) => { const d = parseISO(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toISO(d); };
`;
const body = seedSrc.replace(/^import .*$/gm, '').replace(/^export /gm, '');
const demo = new Function(
  `${dateHelpers}\n${body}\nreturn { classes, sections, departments, subjects, staff, usersByRole, timetable, templates, defaultSettings, calendar: buildCalendar(), syllabus: buildSyllabus() };`,
)();

// Bell schedule (periods and breaks) from constants.js
const bellStart = constSrc.indexOf('export const BELL_SCHEDULE');
const bellCode = constSrc.slice(constSrc.indexOf('[', bellStart), constSrc.indexOf('];', bellStart) + 1);
const bellSchedule = new Function(`return ${bellCode};`)();

const data = {
  exportedAt: new Date().toISOString(),
  classes: demo.classes,
  sections: demo.sections,
  departments: demo.departments,
  subjects: demo.subjects,
  staff: demo.staff,
  timetable: demo.timetable,
  holidays: demo.calendar.holidays,
  exams: demo.calendar.exams,
  templates: demo.templates,
  settings: demo.defaultSettings,
  bellSchedule,
  syllabus: demo.syllabus,
};

await mkdir(new URL('./data/', import.meta.url), { recursive: true });
await writeFile(new URL('./data/demo.json', import.meta.url), JSON.stringify(data, null, 2));
console.log(
  `Wrote scripts/data/demo.json: ${data.staff.length} staff, ${data.classes.length} classes, ` +
    `${data.timetable.length} timetable periods, ${data.holidays.length} holidays, ${data.syllabus.length} syllabi`,
);