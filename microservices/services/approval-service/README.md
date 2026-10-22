# approval-service (TypeScript)

**Getting a lesson plan approved.** The HOD (or the principal when the HOD is unavailable) approves or sends back a submitted plan; this service keeps the review history and the bell notifications.
Port **5003** · database **qshikshak_approvals** · collections `approvals`, `notifications`.

It does **not** log anyone in (auth-service makes the access tokens; this service only checks them) and it does **not** own plans or school data (both live in **lesson-plan-service**).

```bash
cp .env.example .env      # fill in the real values
npm install
npm run dev               # tsx watch, http://localhost:5003
npm run test:unit         # no database needed
npm run test:api          # in-memory MongoDB (downloads it once)
npm run build && npm start
```

## Endpoints (security and input rules: `src/config/route.config.ts`)

| Method + path | Who | Input |
|---|---|---|
| `POST /api/lesson-planner/plans/:id/review` | hod, principal | `{ action: "approved" \| "returned", comment }` |
| `GET /api/lesson-planner/approvals` | teacher (own only), hod, principal, admin | `?status=` |
| `GET /api/lesson-planner/approvals/log/:planId` | same | – |
| `GET /api/lesson-planner/approvals/:id` | same | – |
| `GET /api/lesson-planner/submissions/:planId` | same | – |
| `GET /api/lesson-planner/notifications` | any logged-in user | `?unread=true` |
| `POST /api/lesson-planner/notifications/read` | any logged-in user | `{ notificationIds? }` (none = all) |
| `POST /internal/notify` | other services (`x-internal-token`) | `{ schoolId, to, title, text, link? }` |
| `GET /health` | anyone | → `{ service, db: 'up' \| 'down' }` |

## Who reviews (`src/services/hodRules.ts`)

The HOD of the subject's department. The principal only when the HOD is unavailable: no HOD, the HOD is inactive, or the plan has waited `settings.principalAfterDays` (default 2) days. If `settings.approver = "principal"`, the principal always reviews. lesson-plan-service changes the plan's status atomically, so if the HOD and the principal click together, only the first one wins (409).

## Calls to lesson-plan-service (`src/services/lessonPlan.client.ts`)

`GET /internal/plans/:id` · `PATCH /internal/plans/:id/status` · `GET /internal/school/:schoolId`

## Folder structure

```
src/
├─ app.ts, server.ts
├─ config/        env.ts (checked with zod) · database.ts · cors.ts · route.config.ts ★
├─ constants/     roles.ts · httpStatus.ts
├─ middleware/    auth (Bearer JWT, roles, internal token) · validation (zod) · error
├─ routes/        index.ts – registers every entry of route.config.ts
├─ controllers/   approval · notification
├─ services/      review · approval · notification · hodRules · lessonPlan.client
├─ repositories/  approval · notification
├─ models/        Approval · Notification
├─ validations/   approval · notification · common
├─ types/         express.d.ts · auth.types.ts · school.types.ts
└─ utils/         AppError · response
```
