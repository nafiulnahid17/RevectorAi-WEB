/** Test-only Auth/PostgREST transport. SQL/RLS is verified independently with real PostgreSQL. */
import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../worker/index.js";
import { seal } from "../worker/control/auth.js";
import { usageRows } from "../worker/control/billing.js";
const U = "00000000-0000-4000-8000-000000000002",
  A = "00000000-0000-4000-8000-000000000001",
  P = "10000000-0000-4000-8000-000000000001";
const env = {
  ENGINE_ORIGIN: "https://engine.example",
  ENGINE_API_KEY: "test-engine-" + "x".repeat(40),
  SESSION_SIGNING_KEY: "test-session-" + "s".repeat(40),
  SUPABASE_URL: "https://database.example",
  SUPABASE_ANON_KEY: "test-only-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-only-service",
};
const req = (path, method = "GET", body, extra = {}) =>
  new Request("https://web.example" + path, {
    method,
    headers: {
      origin: "https://web.example",
      "content-type": "application/json",
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
function fixture() {
  const profiles = {
    [U]: {
      id: U,
      auth_user_id: U,
      email: "user@example.test",
      role: "USER",
      status: "ACTIVE",
      avatar_path: U + "/avatar",
      password_updated_at: "2026-10-05T00:00:00Z",
      profile_completed_at: "2026-10-05T00:00:00Z",
    },
    [A]: {
      id: A,
      auth_user_id: A,
      email: "admin@example.test",
      role: "ADMIN",
      status: "ACTIVE",
    },
  };
  const calls = [];
  async function transport(request) {
    const u = new URL(request.url);
    calls.push({
      url: u,
      headers: request.headers,
      method: request.method,
      body: request.method === "GET" ? null : await request.clone().json(),
    });
    if (u.hostname === "engine.example")
      return Response.json({ project_id: P, job_id: P, status: "queued" });
    if (u.pathname === "/auth/v1/token") {
      const d = await request.json(),
        id = d.email === "admin@example.test" ? A : U;
      return Response.json({
        access_token: "access-" + id,
        refresh_token: "refresh-" + id,
        expires_in: 3600,
        user: { id },
      });
    }
    if (u.pathname === "/auth/v1/user") {
      const id = request.headers
        .get("Authorization")
        .slice("Bearer access-".length);
      return Response.json({ id, user_metadata: { role: "ADMIN" } });
    }
    if (u.pathname === "/rest/v1/revector_profiles")
      return Response.json([profiles[u.searchParams.get("id").slice(3)]]);
    if (u.pathname === "/rest/v1/rpc/rv_admin_overview")
      return Response.json({ total_users: 2 });
    if (u.pathname === "/rest/v1/rpc/rv_reserve_operation")
      return Response.json({ id: P, replayed: false, reserved_credits: 0 });
    if (u.pathname.startsWith("/rest/v1/rpc/")) return Response.json({});
    return Response.json([]);
  }
  return { transport, profiles, calls };
}
async function login(f, admin = false) {
  const r = await handle(
    req(admin ? "/api/admin/auth/login" : "/api/auth/login", "POST", {
      email: admin ? "admin@example.test" : "user@example.test",
      password: "test-only-password",
    }),
    env,
    f.transport,
  );
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.ok(!JSON.stringify(data).includes("access-"));
  return r.headers.get("set-cookie").split(";")[0];
}
test("user Worker does not expose any Admin API, regardless of cookie or caller role", async () => {
  const f = fixture(),
    cookie = await login(f);
  for (const path of [
    "/api/admin/auth/login",
    "/api/admin/overview",
    "/api/admin/wallet/adjust",
    "/api/admin/support",
  ]) {
    const method =
      path.endsWith("/login") || path.endsWith("/adjust") ? "POST" : "GET";
    const r = await handle(
      req(path, method, method === "POST" ? {} : undefined, { cookie }),
      env,
      () => assert.fail("Admin endpoint reached a transport"),
    );
    assert.equal(r.status, 404);
  }
});
test("user data queries use verified owner + RLS token, never a requested owner", async () => {
  const f = fixture(),
    cookie = await login(f);
  const r = await handle(
    req("/api/account/usage?user_id=" + A, "GET", undefined, {
      cookie,
      "x-revector-user": A,
    }),
    env,
    f.transport,
  );
  assert.equal(r.status, 200);
  const query = f.calls
    .filter((c) => c.url.pathname === "/rest/v1/revector_usage_events")
    .at(-1);
  assert.equal(query.url.searchParams.get("user_id"), "eq." + U);
  assert.equal(query.headers.get("Authorization"), "Bearer access-" + U);
  assert.equal(
    (
      await handle(
        req(
          "/api/account/profile",
          "PATCH",
          { name: "User", role: "ADMIN" },
          { cookie },
        ),
        env,
        f.transport,
      )
    ).status,
    400,
  );
  f.profiles[U].status = "SUSPENDED";
  assert.equal(
    (
      await handle(
        req("/api/account/wallet", "GET", undefined, { cookie }),
        env,
        f.transport,
      )
    ).status,
    403,
  );
});
test("incomplete invited users can finish profile but cannot use production APIs", async () => {
  const f = fixture(),
    cookie = await login(f);
  f.profiles[U].profile_completed_at = null;
  const blocked = await handle(
    req(
      "/api/revector/projects",
      "POST",
      { name: "blocked" },
      { cookie },
    ),
    env,
    f.transport,
  );
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).error.code, "PROFILE_SETUP_REQUIRED");
  assert.equal(
    (
      await handle(
        req("/api/account/profile", "GET", undefined, { cookie }),
        env,
        f.transport,
      )
    ).status,
    200,
  );
});

test("engine uses stable verified account identity and rejects incomplete account configuration", async () => {
  const f = fixture(),
    cookie = await login(f);
  const r = await handle(
    req(
      "/api/revector/projects",
      "POST",
      { name: "test", user_id: "forged" },
      { cookie },
    ),
    env,
    f.transport,
  );
  assert.equal(r.status, 200);
  const engine = f.calls.find((c) => c.url.hostname === "engine.example");
  assert.equal(engine.headers.get("X-Revector-User"), "user_" + U);
  assert.equal(engine.body.user_id, "user_" + U);
  assert.equal(engine.headers.get("cookie"), null);
  assert.equal(
    (
      await handle(
        req("/api/revector/projects", "POST", {}),
        { ...env, SUPABASE_SERVICE_ROLE_KEY: "" },
        f.transport,
      )
    ).status,
    503,
  );
  assert.equal(
    (await handle(req("/api/revector/projects", "POST", {}), env, f.transport))
      .status,
    401,
  );
});
test("user Worker no longer serves Admin HTML or its legacy asset", async () => {
  for (const path of [
    "/admin",
    "/admin/login",
    "/admin/support",
    "/admin-login.html",
  ]) {
    const r = await handle(
      req(path),
      { ...env, ASSETS: { fetch: () => assert.fail("Admin asset served") } },
      () => assert.fail(),
    );
    assert.equal(r.status, 404);
  }
});
test("expired/revoked cookies and cross-origin control mutations fail closed", async () => {
  const f = fixture();
  const created = Date.now() / 1000 - 60;
  const cookie = (
    await seal(req("/"), env, false, {
      access: "access-" + U,
      refresh: "test-refresh",
      expires: Date.now() / 1000 + 300,
      created,
    })
  ).split(";")[0];
  f.profiles[U].sessions_valid_after = new Date().toISOString();
  assert.equal(
    (
      await handle(
        req("/api/account/wallet", "GET", undefined, { cookie }),
        env,
        f.transport,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handle(
        req(
          "/api/admin/wallet/adjust",
          "POST",
          {},
          { origin: "https://evil.example" },
        ),
        env,
        () => assert.fail(),
      )
    ).status,
    403,
  );
});
test("AI prepare is ownership-checked and reserved before dispatch; metadata never invents model/cost", async () => {
  const f = fixture(),
    cookie = await login(f);
  const r = await handle(
    req(
      "/api/revector/prepare",
      "POST",
      { project_id: P },
      { cookie, "x-idempotency-key": crypto.randomUUID() },
    ),
    env,
    f.transport,
  );
  assert.equal(r.status, 200);
  const reserve = f.calls.findIndex(
      (c) => c.url.pathname === "/rest/v1/rpc/rv_reserve_operation",
    ),
    dispatch = f.calls.findIndex(
      (c) => c.url.pathname === "/api/revector/prepare",
    );
  assert.ok(reserve >= 0 && reserve < dispatch);
  assert.equal(f.calls[reserve].body.p_user, U);
  assert.equal(
    (
      await handle(
        req("/api/revector/prepare", "POST", { project_id: P }, { cookie }),
        env,
        f.transport,
      )
    ).status,
    400,
  );
  assert.deepEqual(
    usageRows({
      ai_metadata: {
        analysis: {
          provider: "cloudflare",
          model: null,
          processing_mode: "fallback_ai",
          created_at: "2026-10-04T00:00:00Z",
        },
        mockup: { configured: true },
      },
    }).map((r) => [r.operation, r.model, r.actual_cost]),
    [["ANALYZE", null, null]],
  );
});
