# Qshikshak – Lesson Planner Backend

Node.js + Express + MongoDB (Atlas). One server split into modules; each module becomes a microservice later.

## Run

```powershell
npm install
npm run seed      # resets the demo school "one" (staff, timetable, syllabus, 8 plans, library, notifications)
npm run dev       # http://localhost:5000/api/health
npm test          # 88 automated tests (start their own in-memory MongoDB – Atlas is not touched)
```

Demo logins (password `demo123`): `t1` Priya (teacher) · `t2` Ravi (teacher) · `t3` Anitha (HOD) · `a1` Suresh (admin) · `p1` Dr. Meena (principal).

## Modules

| Module | Folder | What it does |
|---|---|---|
| Auth | `src/modules/auth` | Login → token (the token carries the school id) |
| Masters | `src/modules/masters` | Classes, sections, departments, subjects, staff, timetable, holidays, exams, templates, settings |
| Syllabus | `src/modules/syllabus` | Syllabus → chapters → topics; Excel import; teacher can add a topic; topics used in plans cannot be removed |
| Plans | `src/modules/plans` | Create a plan from syllabus + timetable (skips Sundays, holidays, exams), view, edit a lesson, extend, delete |
| Approvals | `src/modules/approvals` | Submit → HOD approves / sends back. Principal only when the HOD is not available (no HOD, HOD inactive, or waited `principalAfterDays` days, default 2) |
| Notifications | `src/modules/notifications` | Bell messages from events + an hourly reminder to the principal |
| Library | `src/modules/library` | Lessons of approved plans, saved against their syllabus topic |

Modules talk through **events** (`src/common/events.js`): `plan.submitted`, `plan.reviewed`.
Notifications and Library listen to them. In the microservice step these become messages on a queue.

## API (all answers are `{ success, data, message }`)

Base: `/api/lesson-planner` (needs `Authorization: Bearer <token>`)

| Method | URL | Who |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/demo-login` · GET `/api/auth/me` | anyone / logged in |
| GET | `/masters` | logged in |
| PUT | `/settings` · `/templates/:id` | admin, principal |
| GET | `/syllabus?classId=&subjectId=` | logged in |
| PUT | `/syllabus` · POST `/syllabus/import` | admin, hod, principal |
| POST | `/syllabus/:id/topics` | teacher, hod, admin, principal |
| GET | `/plans?status=` · `/plans/:id` | teacher (own), hod, admin, principal |
| POST | `/plans/generate` · `/plans/:id/extend` · DELETE `/plans/:id` · PATCH `/plan-items/:id` | teacher (own), hod, admin |
| POST | `/plans/:id/submit` | teacher (own) |
| POST | `/plans/:id/review` `{ action: approved \| returned, comment }` | HOD of the subject; principal when HOD not available |
| GET | `/approvals?status=` (each waiting plan has `canReview` + `reviewNote`) | hod, principal |
| GET | `/notifications` · POST `/notifications/read` | logged in |
| GET | `/library?q=&subjectId=&topicId=` | teacher, hod, admin, principal |

## Not built yet (the frontend still uses its mock for these)

Today page, calendar, marking lessons done / partly / not done, reschedule / cancel, drag & drop
(swap / move / continue), add periods, history, coverage and teacher reports, AI suggestion.
