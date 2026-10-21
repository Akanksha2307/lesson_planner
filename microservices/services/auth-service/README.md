# auth-service (TypeScript)

**Who are you, and are you allowed in?** Login, access + refresh tokens, logout and device sessions. Nothing else.
Port **5001** · database **qshikshak_auth** · collections `accounts`, `refresh_sessions`.

School data (classes, staff profiles, timetable, settings, templates, holidays, exams) lives in **lesson-plan-service**. A person has the **same id** in both (`t1`, `t3` …): the profile is there, the login is here. lesson-plan-service creates and updates logins through `PUT /internal/accounts`.

```bash
cp .env.example .env      # fill in the real values
npm install
npm run seed              # the 7 demo logins (t1, t3, p1, a1 … / demo123) – development only
npm run dev               # tsx watch, http://localhost:5001
npm run test:unit         # 56 tests, no database needed
npm run test:integration  # in-memory MongoDB (downloads it once)
npm run build && npm start
```

## Endpoints

| Method + path | Body | Who | Answer |
|---|---|---|---|
| `POST /api/auth/login` | `{ username, password }` (+ optional `x-school-id` header) | public, max 20 tries / 15 min per IP | tokens + user |
| `POST /api/auth/refresh-token` | `{ refreshToken }` | public, same limit | a new pair of tokens |
| `POST /api/auth/logout` | `{ refreshToken? }` (none = every device) | logged in | `{ sessionsEnded }` |
| `GET /api/auth/me` | – | logged in | the user |
| `POST /api/auth/demo-login` | `{ role }` | public, only when `ALLOW_DEV_AUTH=true` | tokens + user |
| `PUT /internal/accounts` | `{ schoolId, accounts: [{ id, username, name, role, departmentId, active, password? }] }` | other services (`x-internal-token`) | `{ created, updated, loggedOut }` |
| `GET /health` | – | anyone | `{ service, db: 'up' \| 'down' }` |

Login / refresh answer: `{ tokenType: 'Bearer', accessToken, token, expiresIn, refreshToken, user: { id, name, role, departmentId, schoolId } }`. `token` = `accessToken`, kept for the current frontend.

`PUT /internal/accounts`: creates or updates logins in one call. The password only changes when one is sent, so updating a profile never resets it. `active: false` logs that person out on every device.

## Tokens

| | Access token | Refresh token |
|---|---|---|
| Sent as | `Authorization: Bearer …` on every call, to every service | body of `POST /api/auth/refresh-token` only |
| Lifetime | 15 min (`ACCESS_TOKEN_EXPIRES_IN`) | 7 days (`REFRESH_TOKEN_EXPIRES_IN`) |
| Secret | `JWT_ACCESS_SECRET`, shared by all services | `JWT_REFRESH_SECRET`, auth-service only |
| Payload | `sub, role, name, departmentId, schoolId, type: "access"` | `sub, schoolId, sid, type: "refresh"` |

Both are HS256 with `iss=qshikshak-auth` and `aud=qshikshak`. Refresh tokens rotate on every use and are stored only as a SHA-256 hash. Re-using an old one logs the user out on every device.

Until the frontend refreshes tokens by itself, set `ACCESS_TOKEN_EXPIRES_IN=12h` in `.env`.

## Folder structure

```
src/
├─ app.ts, server.ts
├─ config/        env.ts (checked with zod) · database.ts · cors.ts · routeRoles.ts ★
├─ constants/     roles.ts · httpStatus.ts
├─ middleware/    common (request id, helmet, CORS, body parser, content type, log)
│                 auth (Bearer JWT, roles, internal token) · validation (zod) · rateLimit · error
├─ routes/        secureRouter.ts · index.ts · auth.routes.ts · internal.routes.ts
├─ controllers/   auth.controller.ts · internal.controller.ts
├─ services/      auth.service.ts (login, refresh, logout, me, syncAccounts)
├─ repositories/  account.repository.ts · session.repository.ts
├─ models/        account.model.ts (login) · refreshSession.model.ts (one per device)
├─ validations/   auth · internal · common (zod schemas for body, query, params)
├─ dto/           user.dto.ts · authResponse.dto.ts (what goes back to the client)
├─ types/         express.d.ts (req.user, req.validated) · auth.types.ts
└─ utils/         AppError · response · jwt · ids
scripts/          seed.ts · demo-accounts.ts
tests/            unit/ · api/ (no database) · integration/ (in-memory MongoDB) · helpers/
```

## Order of every request

`request id → helmet → CORS → body parser → content-type check → authenticate (Bearer JWT) → role check (routeRoles.ts) → validate (params, query, body) → controller → error handler`

## Adding a route

1. Add `'METHOD /full/path': roles(...)` (or `PUBLIC` / `INTERNAL`) to `src/config/routeRoles.ts`.
2. Add the zod schema in `src/validations/`.
3. Register it: `r.post('/path', validate({ body: schema }), controller.fn)`.

If step 1 is missing, the service refuses to start.