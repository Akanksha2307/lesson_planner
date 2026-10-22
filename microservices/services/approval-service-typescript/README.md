# Qshikshak Approval Service (TypeScript)

Approval Service converted from the supplied JavaScript service to TypeScript while preserving its existing routes and workflow. Added repository and DTO layers following the Auth Service's folder conventions.

## Requirements
- Node.js 22 or newer
- MongoDB connection available to this service
- Auth Service on `AUTH_SERVICE_URL`
- Lesson Plan Service on `LESSON_PLAN_URL` for cross-service review workflow

## Setup
1. Copy `.env.example` to `.env`.
2. Fill in your own MongoDB URI, the same JWT verification secret used by Auth Service, and the shared internal token configured in the other services.
3. Install dependencies: `npm install`
4. Development: `npm run dev`
5. Production build: `npm run build`, then `npm start`
6. Tests: `npm test`

Do not commit or share `.env`. The example file intentionally contains placeholders only.

## Health
`GET http://localhost:5003/health`

## Existing route families
- `POST /api/lesson-planner/plans/:id/review`
- `GET /api/lesson-planner/approvals`
- `GET /api/lesson-planner/approvals/log/:planId`
- `GET /api/lesson-planner/approvals/:id`
- `GET /api/lesson-planner/submissions/:planId`
- `GET /api/lesson-planner/notifications`
- `POST /api/lesson-planner/notifications/read`
- `POST /internal/notify` (requires the shared internal token)

Protected endpoints require `Authorization: Bearer <access-token>`. Cross-service review requires the internal APIs described in `src/services/serviceClient.ts` to be implemented and reachable in the other services.


### Create an approval request

`POST /api/lesson-planner/approvals` (requires a valid teacher Bearer token).

Example JSON body:

```json
{
  "lessonPlanId": "<lesson-plan-id>",
  "title": "Fractions",
  "subject": "Mathematics",
  "className": "5",
  "section": "A"
}
```

This endpoint creates (or resubmits an eligible returned) approval request using the existing approval service logic. The Lesson Plan Service is not modified by this change; its submit flow must call this endpoint for the approval record to be created automatically.
