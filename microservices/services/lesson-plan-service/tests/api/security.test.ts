// Authentication (401), role authorization (403), request validation (400), CORS and
// the route configuration. NO database is needed: all of these run before any service call.
// Where a controller has to run, the service function is replaced with a stub.
import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import request from "supertest";

const JWT_SECRET = "test-jwt-secret";
const INTERNAL_TOKEN = "test-internal-token";
const ORIGIN = "http://localhost:3002";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = JWT_SECRET;
process.env.INTERNAL_TOKEN = INTERNAL_TOKEN;
process.env.CORS_ORIGINS = ORIGIN;
process.env.DEFAULT_SCHOOL_ID = "one";


const tokenFor = (id: string, role: string): string => {
  const token = jwt.sign(
    {
      sub: id,
      role,
      name: id,
      schoolId: "one",
      type: "access"
    },
    JWT_SECRET,
    {
      algorithm: "HS256",
      issuer: "qshikshak-auth",
      audience: "qshikshak",
      expiresIn: "1h"
    }
  );

  return `Bearer ${token}`;
};

const TEACHER = tokenFor("t1", "teacher");
const HOD = tokenFor("h1", "hod");
const PRINCIPAL = tokenFor("p1", "principal");
const PARENT = tokenFor("pa1", "parent");

const BASE = "/api/lesson-planner";

let app: any;
let routeConfig: any;
let plansService: any;
let todayService: any;
let apiRouter: any;
let internalRouter: any;

before(() => {
  app = require("../../src/app").default;
  routeConfig = require("../../src/config/route.config").routeConfig;
  plansService = require("../../src/services/plans.service");
  todayService = require("../../src/services/today.service");
  apiRouter = require("../../src/routes/index").default;
  internalRouter = require("../../src/routes/internal.routes").default;
});

// ───────────────────────── 401 ─────────────────────────

test("missing token → 401", async () => {
  const res = await request(app).get(`${BASE}/plans`);
  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
});

test("invalid token → 401", async () => {
  const res = await request(app).get(`${BASE}/plans`).set("Authorization", "Bearer not.a.jwt");
  assert.equal(res.status, 401);
});

test("token signed with the wrong secret → 401", async () => {
  const bad = jwt.sign({ sub: "t1", role: "teacher" }, "another-secret");
  const res = await request(app).get(`${BASE}/plans`).set("Authorization", `Bearer ${bad}`);
  assert.equal(res.status, 401);
});

test("token without sub/role → 401", async () => {
  const bad = jwt.sign({ name: "x" }, JWT_SECRET);
  const res = await request(app).get(`${BASE}/plans`).set("Authorization", `Bearer ${bad}`);
  assert.equal(res.status, 401);
});

test("authentication runs before validation (bad body + no token → 401, not 400)", async () => {
  const res = await request(app).post(`${BASE}/plans/generate`).send({});
  assert.equal(res.status, 401);
});

// ───────────────────────── 403 ─────────────────────────

test("parent cannot list plans → 403", async () => {
  const res = await request(app).get(`${BASE}/plans`).set("Authorization", PARENT);
  assert.equal(res.status, 403);
  assert.equal(res.body.message, "Access denied");
});

test("principal cannot generate plans (planners only) → 403", async () => {
  const res = await request(app)
    .post(`${BASE}/plans/generate`).set("Authorization", PRINCIPAL).send({});
  assert.equal(res.status, 403);
});

test("HOD cannot mark a lesson complete (teacher only) → 403", async () => {
  const res = await request(app)
    .post(`${BASE}/plan-items/item-1/complete`).set("Authorization", HOD).send({});
  assert.equal(res.status, 403);
});

test("teacher cannot save a syllabus (admin/hod/principal) → 403", async () => {
  const res = await request(app).put(`${BASE}/syllabus`).set("Authorization", TEACHER).send({});
  assert.equal(res.status, 403);
});

test("authorization runs before validation (wrong role + bad body → 403, not 400)", async () => {
  const res = await request(app)
    .post(`${BASE}/plans/generate`).set("Authorization", PARENT).send({ nonsense: true });
  assert.equal(res.status, 403);
});

test("routes without a roles list stay open to every logged-in user (parent reaches validation)", async () => {
  const res = await request(app).get(`${BASE}/holidays/impact`).set("Authorization", PARENT);
  assert.equal(res.status, 400); // allowed through, then the missing date is rejected
});

// ───────────────────────── 400 ─────────────────────────

test("invalid POST body → 400 with field-level errors", async () => {
  const res = await request(app)
    .post(`${BASE}/plans/generate`).set("Authorization", TEACHER)
    .send({ classId: "c8", startDate: "not-a-date" });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, "Validation failed");
  const fields = res.body.errors.map((e: any) => e.field);
  assert.ok(fields.includes("sectionId"));
  assert.ok(fields.includes("startDate"));
  assert.ok(res.body.errors.every((e: any) => e.location === "body" && e.message));
});

test("POST with no body at all → 400", async () => {
  const res = await request(app).post(`${BASE}/plans/generate`).set("Authorization", TEACHER);
  assert.equal(res.status, 400);
});

test("cross-field rule: endDate before startDate → 400", async () => {
  const res = await request(app)
    .post(`${BASE}/plans/generate`).set("Authorization", TEACHER)
    .send({ classId: "c8", sectionId: "s8a", subjectId: "sci", startDate: "2026-11-10", endDate: "2026-11-01" });
  assert.equal(res.status, 400);
  assert.equal(res.body.errors[0].field, "endDate");
});

test("invalid GET query: bad plan status → 400", async () => {
  const res = await request(app).get(`${BASE}/plans?status=nope`).set("Authorization", TEACHER);
  assert.equal(res.status, 400);
  assert.equal(res.body.errors[0].location, "query");
});

test("invalid GET query: calendar needs real dates → 400", async () => {
  const res = await request(app).get(`${BASE}/calendar?from=2026-13-40&to=x`).set("Authorization", TEACHER);
  assert.equal(res.status, 400);
});

test("invalid GET query: calendar from after to → 400", async () => {
  const res = await request(app)
    .get(`${BASE}/calendar?from=2026-11-10&to=2026-11-01`).set("Authorization", TEACHER);
  assert.equal(res.status, 400);
  assert.match(res.body.errors[0].message, /'from' must be before or equal to 'to'/);
});

test("invalid GET query: syllabus needs classId and subjectId → 400", async () => {
  const res = await request(app).get(`${BASE}/syllabus`).set("Authorization", TEACHER);
  assert.equal(res.status, 400);
});

test("invalid GET query: history date → 400", async () => {
  const res = await request(app).get(`${BASE}/history?from=yesterday`).set("Authorization", TEACHER);
  assert.equal(res.status, 400);
});

test("holiday impact without a date keeps its old message → 400", async () => {
  const res = await request(app).get(`${BASE}/holidays/impact`).set("Authorization", TEACHER);
  assert.equal(res.status, 400);
  assert.equal(res.body.message, "Holiday date is required");
});

test("invalid route parameter (id too long) → 400", async () => {
  const res = await request(app)
    .get(`${BASE}/plans/${"x".repeat(250)}`).set("Authorization", TEACHER);
  assert.equal(res.status, 400);
  assert.equal(res.body.errors[0].location, "params");
  assert.equal(res.body.errors[0].field, "id");
});

test("invalid route parameter + invalid body are both reported", async () => {
  const res = await request(app)
    .post(`${BASE}/plans/${"x".repeat(250)}/extend`).set("Authorization", TEACHER).send({});
  assert.equal(res.status, 400);
  const places = res.body.errors.map((e: any) => e.location).sort();
  assert.deepEqual([...new Set(places)], ["body", "params"]);
});

test("AI suggest validates topic and minutes → 400", async () => {
  const res = await request(app)
    .post(`${BASE}/ai/suggest`).set("Authorization", TEACHER).send({ topicTitle: "", minutes: 0 });
  assert.equal(res.status, 400);
});

test("reschedule needs a reason → 400", async () => {
  const res = await request(app)
    .post(`${BASE}/plan-items/item-1/reschedule`).set("Authorization", TEACHER)
    .send({ date: "2026-11-10", periodId: "p1", reason: "  " });
  assert.equal(res.status, 400);
});

test("completion rule: 'not_done' needs remarks → 400", async () => {
  const res = await request(app)
    .post(`${BASE}/plan-items/item-1/complete`).set("Authorization", TEACHER)
    .send({ status: "not_done" });
  assert.equal(res.status, 400);
  assert.equal(res.body.errors[0].field, "remarks");
});

// ───────────────────── allowed requests succeed ─────────────────────

test("AI suggest: authorized role + valid body → 200 (real controller, no database)", async () => {
  const res = await request(app)
    .post(`${BASE}/ai/suggest`).set("Authorization", HOD)
    .send({ topicTitle: "Photosynthesis", minutes: 40 });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, "OK");
  assert.equal(res.body.data.timePlan.length, 5);
});

test("POST /plans/generate: valid body reaches the controller with parsed data → 201", async () => {
  const stub = mock.method(plansService, "generatePlan", async () => ({ plan: { id: "plan-1" }, placedCount: 3 }));
  try {
    const res = await request(app)
      .post(`${BASE}/plans/generate`).set("Authorization", TEACHER)
      .send({ classId: "c8", sectionId: "s8a", subjectId: "sci", startDate: "2026-11-02", endDate: "2026-11-07" });
    assert.equal(res.status, 201);
    assert.equal(res.body.message, "Plan created");
    assert.equal(res.body.data.plan.id, "plan-1");
    const [ctx, user, body] = stub.mock.calls[0].arguments;
    assert.equal(ctx.schoolId, "one");
    assert.equal(user.id, "t1");
    assert.equal(body.classId, "c8");
  } finally {
    stub.mock.restore();
  }
});

test("GET /plans: empty status means no filter; the controller receives the parsed query", async () => {
  const stub = mock.method(plansService, "listPlans", async () => []);
  try {
    const res = await request(app).get(`${BASE}/plans?status=`).set("Authorization", PRINCIPAL);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
    assert.equal(stub.mock.calls[0].arguments[2].status, undefined);
  } finally {
    stub.mock.restore();
  }
});

test("GET /plans/:id: valid param reaches the controller", async () => {
  const stub = mock.method(plansService, "getPlan", async (_c: any, _u: any, id: string) => ({ id }));
  try {
    const res = await request(app).get(`${BASE}/plans/plan-123`).set("Authorization", HOD);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, "plan-123");
  } finally {
    stub.mock.restore();
  }
});

test("GET /today: any logged-in role, optional date", async () => {
  const stub = mock.method(todayService, "getToday", async (_c: any, _u: any, date: string) => ({ date }));
  try {
    const res = await request(app).get(`${BASE}/today?date=2026-11-02`).set("Authorization", PARENT);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.date, "2026-11-02");
  } finally {
    stub.mock.restore();
  }
});

// ───────────────────────── internal routes ─────────────────────────

test("internal route without token → 401, wrong token → 403, JWT is not accepted", async () => {
  assert.equal((await request(app).get("/internal/plans/p1")).status, 401);
  assert.equal((await request(app).get("/internal/plans/p1").set("x-internal-token", "nope-nope-nope-")).status, 403);
  assert.equal((await request(app).get("/internal/plans/p1").set("Authorization", TEACHER)).status, 401);
});

test("internal status update keeps its old 400 message", async () => {
  const res = await request(app)
    .patch("/internal/plans/p1/status").set("x-internal-token", INTERNAL_TOKEN)
    .send({ status: "maybe" });
  assert.equal(res.status, 400);
  assert.equal(res.body.message, "Valid schoolId, reviewerId and status are required");
});

test("internal holiday-shift keeps its old 400 message", async () => {
  const res = await request(app)
    .post("/internal/holiday-shift").set("x-internal-token", INTERNAL_TOKEN).send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.message, "schoolId is required");
});

// ───────────────────────── CORS / misc ─────────────────────────


test("CORS: the configured frontend origin is allowed", async () => {
  const res = await request(app)
    .get("/health")
    .set("Origin", ORIGIN);

  assert.equal(res.status, 503);
  assert.equal(
    res.headers["access-control-allow-origin"],
    ORIGIN
  );
});

test("CORS: another origin gets no allow-origin header", async () => {
  const res = await request(app).get("/health").set("Origin", "http://evil.example");
  assert.equal(res.headers["access-control-allow-origin"], undefined);
});

test("CORS preflight for the configured origin", async () => {
  const res = await request(app)
    .options(`${BASE}/plans/generate`)
    .set("Origin", ORIGIN)
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "authorization,content-type");
  assert.equal(res.status, 204);
  assert.equal(res.headers["access-control-allow-origin"], ORIGIN);
});

test("body larger than 2mb is rejected (body parser limit)", async () => {
  const res = await request(app)
    .post(`${BASE}/ai/suggest`).set("Authorization", TEACHER)
    .send({ topicTitle: "x".repeat(3 * 1024 * 1024), minutes: 10 });
  assert.equal(res.status, 413);
});

test("unknown route under the API base: 401 without token, 404 with token", async () => {
  assert.equal((await request(app).get(`${BASE}/nope`)).status, 401);
  assert.equal((await request(app).get(`${BASE}/nope`).set("Authorization", TEACHER)).status, 404);
});


test("health check is public", async () => {
  const res = await request(app).get("/health");

  assert.equal(res.status, 503);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data.service, "lesson-plan-service");
  assert.equal(res.body.data.db, "down");
  assert.equal(res.body.message, "Database unavailable");
});

// ───────────────────── route configuration is the single source ─────────────────────

function registered(router: any): string[] {
  const out: string[] = [];
  const walk = (stack: any[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          out.push(`${method.toUpperCase()} ${layer.route.path}`);
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk(router.stack);
  return out;
}

test("every route in route.config.ts is registered exactly once, and nothing else is", () => {
  const expectedApi: string[] = [];
  const expectedInternal: string[] = [];
  for (const def of Object.values<any>(routeConfig)) {
    (def.internal ? expectedInternal : expectedApi).push(`${def.method} ${def.path}`);
  }
  assert.deepEqual(registered(apiRouter).sort(), expectedApi.sort());
  assert.deepEqual(registered(internalRouter).sort(), expectedInternal.sort());
});

test("route.config.ts has no duplicate method+path in the same scope", () => {
  const seen = new Set<string>();
  for (const def of Object.values<any>(routeConfig)) {
    const key = `${def.internal ? "internal" : "api"} ${def.method} ${def.path}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
  }
});

test("the old permissions are preserved", () => {
  const rolesOf = (name: string) => routeConfig[name].roles?.join(",");
  assert.equal(rolesOf("listPlans"), "teacher,hod,admin,principal");
  assert.equal(rolesOf("generatePlan"), "teacher,hod,admin");
  assert.equal(rolesOf("saveSyllabus"), "admin,hod,principal");
  assert.equal(rolesOf("completePlanItem"), "teacher");
  assert.equal(rolesOf("getCalendar"), "teacher,hod,admin,principal");
  assert.equal(rolesOf("aiSuggest"), "teacher,hod,admin,principal");
  assert.equal(routeConfig.getSyllabus.roles, undefined); // any logged-in user
  assert.equal(routeConfig.getToday.roles, undefined);
  assert.equal(routeConfig.getHolidayImpact.roles, undefined);
});

// ───────────────────── school data routes (no database needed) ─────────────────────

test("masters / holidays / exams need a token → 401", async () => {
  for (const path of ["/masters", "/holidays", "/exams"]) {
    assert.equal((await request(app).get(`${BASE}${path}`)).status, 401, path);
  }
});

test("only admin / principal may change settings, templates, holidays and exams → 403", async () => {
  const calls: Array<[string, string]> = [
    ["put", "/settings"],
    ["put", "/templates/tpl-1"],
    ["post", "/holidays"],
    ["put", "/holidays/hol-1"],
    ["delete", "/holidays/hol-1"],
    ["post", "/exams"],
    ["put", "/exams/exam-1"],
    ["delete", "/exams/exam-1"]
  ];
  for (const who of [TEACHER, HOD, PARENT]) {
    for (const [method, path] of calls) {
      const res = await (request(app) as any)[method](`${BASE}${path}`).set("Authorization", who).send({});
      assert.equal(res.status, 403, `${method} ${path}`);
    }
  }
});

test("settings: bad value → 400 and the message names the field", async () => {
  const res = await request(app)
    .put(`${BASE}/settings`).set("Authorization", tokenFor("a1", "admin")).send({ dailyReminderTime: "6pm" });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /dailyReminderTime/);
  assert.equal(res.body.errors[0].location, "body");
});

test("holiday: missing name / bad date → 400", async () => {
  const admin = tokenFor("a1", "admin");
  const noName = await request(app).post(`${BASE}/holidays`).set("Authorization", admin).send({ date: "2030-01-01" });
  assert.equal(noName.status, 400);
  assert.match(noName.body.message, /name/);
  const badDate = await request(app).post(`${BASE}/holidays`).set("Authorization", admin).send({ name: "x", date: "1/1/2030" });
  assert.equal(badDate.status, 400);
});

test("exam: missing exam name / bad date → 400", async () => {
  const principal = tokenFor("p1", "principal");
  const res = await request(app).post(`${BASE}/exams`).set("Authorization", principal).send({ examDate: "soon" });
  assert.equal(res.status, 400);
  const fields = res.body.errors.map((e: any) => e.field);
  assert.ok(fields.includes("examName") && fields.includes("examDate"));
});

test("template: a field without a label → 400", async () => {
  const res = await request(app)
    .put(`${BASE}/templates/tpl-1`).set("Authorization", tokenFor("a1", "admin"))
    .send({ name: "T", fields: [{ key: "a", label: "", type: "text" }] });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /label/);
});

test("holiday/exam route parameter too long → 400", async () => {
  const admin = tokenFor("a1", "admin");
  const long = "x".repeat(250);
  assert.equal((await request(app).delete(`${BASE}/holidays/${long}`).set("Authorization", admin)).status, 400);
  assert.equal((await request(app).delete(`${BASE}/exams/${long}`).set("Authorization", admin)).status, 400);
});

test("internal school routes need the internal token", async () => {
  assert.equal((await request(app).get("/internal/school/one")).status, 401);
  assert.equal((await request(app).post("/internal/seed").send({})).status, 401);
  assert.equal((await request(app).get("/internal/school/one").set("Authorization", TEACHER)).status, 401);
});
