# Lesson Plan Service (TypeScript)

Express 5 + MongoDB (Mongoose) + Zod. Port **5002**. Same folder layout as the Authentication service.

This service owns **lesson plans AND the school data**: classes, sections, subjects, departments, staff
directory, timetable, settings, templates, holidays and exams. (The Authentication service only does login.)

```
src/
├── app.ts                    CORS → body parser → authenticate → routes
├── server.ts
├── config/
│   ├── index.ts              environment config
│   ├── database.ts
│   └── route.config.ts       ONE FILE: method, path, roles, body/query/params schemas for every route
├── constants/                httpStatus.ts, roles.ts
├── controllers/              *.controller.ts   (HTTP only – read validated data, call a service, send the response)
├── middleware/
│   ├── auth.middleware.ts          JWT → req.user, req.ctx           (401)
│   ├── authorize.middleware.ts     roles from route.config.ts        (401 / 403)
│   ├── validation.middleware.ts    Zod safeParse of params/query/body (400) → req.validated
│   ├── internalAuth.middleware.ts  x-internal-token for /internal
│   └── error.middleware.ts
├── models/       plans, syllabus, library + school data (academic, staff, settings, template)
├── services/     plans…, masters.service (school data), school-calendar.service (holidays/exams),
│                 holiday-shift.service (move lessons), notification-client.service (bell via approval), seed.service
├── routes/  types/  utils/  validations/
data/demo.json    demo school   ·   scripts/seed.ts   npm run seed
```

Order for every protected route:
`CORS → body parser → authenticate → authorizeRoute → validateRequest → controller → service → MongoDB`

Add a route: (1) schema in `validations/`, (2) entry in `config/route.config.ts`,
(3) controller method, (4) `registerRoute(router, "name", controller.method)` in `routes/`.

## Scripts
```
npm run dev         nodemon + ts-node
npm run build       tsc → dist/
npm start           node dist/server.js
npm run typecheck   src + tests
npm test            all tests (API workflow tests need MongoDB: downloaded automatically by mongodb-memory-server, or set TEST_MONGO_URI)
npm run test:unit   tests that need no database (auth, roles, validation, CORS, route config, school models, holiday flow, engine, dates)
npm run seed        load the demo school into the database (deletes school "one" first)
```

## Who decides what is taught, and when
* **Syllabus order** – the order of chapters and topics in the syllabus (admin / HOD reorder them on the Syllabus page,
  or by the row order of the Excel sheet).
* **Chapter dates** – a chapter may have `startDate` / `endDate` (Excel columns `From` / `To`, or the page). Its topics are
  only planned inside those dates. Chapters without dates fill the free periods in order.
* **Admin plans** – `POST /plans/generate` with `teacherId` (an active teacher) creates a draft plan FOR that teacher.
  Optional `topicIds` (which topics, in this order), `topicPeriods` (`{ topicId: periods }` for this plan only) and
  `note`. The teacher is notified, fills the lesson details and submits – only the teacher of a plan can submit it.
* **Preview** – `POST /plans/preview` takes the same body and answers where every lesson would land
  (`lessons`, `unscheduled` with a reason, `skippedDays`, `freeSlots`, `neededPeriods`) without saving anything.
* The admin may move / swap lessons of a plan while it is a draft or sent back; never after the teacher submits.

## Holidays and sudden holidays
`POST /holidays` (admin, principal) saves the holiday. For a sudden holiday (`unexpected: true`, today or later)
the lessons of that day are moved by a direct function call (`holiday-shift.service`), the moved/affected counts are
saved, and bell notifications are sent through approval-service (`APPROVAL_URL`). If either step fails the holiday is
still saved.

## Other services
* approval-service reads the school from `GET /internal/school/:schoolId` of THIS service (set its `AUTH_SERVICE_URL`
  to this service's URL) and keeps calling `/internal/plans/...`.
* The API gateway must send `/masters`, `/settings`, `/templates`, `/holidays` and `/exams` here.
* Staff ids in `data/demo.json` (t1, a1 …) must be the user id (`sub`) in the login token.