import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../worker/index.js";
import { session } from "../worker/session.js";

const env = {
  ENGINE_ORIGIN: "https://engine.example",
  ENGINE_API_KEY: "test-only-" + "x".repeat(48),
  SESSION_SIGNING_KEY: "test-signing-" + "y".repeat(48),
};
const req = (path, init = {}) =>
  new Request("https://web.example" + path, init);

test("proxy strips browser credentials and injects server-only secret and identity", async () => {
  const response = await handle(
    req("/api/revector/projects", {
      method: "POST",
      headers: {
        origin: "https://web.example",
        "content-type": "application/json",
        authorization: "Bearer client-spoof",
        "x-revector-user": "victim",
      },
      body: JSON.stringify({ name: "Test", user_id: "victim" }),
    }),
    env,
    async (upstream) => {
      assert.equal(
        upstream.url,
        "https://engine.example/api/revector/projects",
      );
      assert.equal(
        upstream.headers.get("authorization"),
        "Bearer " + env.ENGINE_API_KEY,
      );
      assert.match(
        upstream.headers.get("x-revector-user"),
        /^anon_[a-f0-9]{32}$/,
      );
      assert.equal(
        (await upstream.json()).user_id,
        upstream.headers.get("x-revector-user"),
      );
      return Response.json({ project_id: "fixture-id" });
    },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  assert.match(response.headers.get("set-cookie"), /Secure/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(!(await response.text()).includes(env.ENGINE_API_KEY));
});

test("cross-origin mutations and arbitrary proxy routes are denied before fetching", async () => {
  const never = () => assert.fail("Upstream must not be requested");
  assert.equal(
    (
      await handle(
        req("/api/revector/projects", {
          method: "POST",
          headers: { origin: "https://evil.example" },
          body: "{}",
        }),
        env,
        never,
      )
    ).status,
    403,
  );
  assert.equal((await handle(req("/api/arbitrary"), env, never)).status, 404);
  assert.equal(
    (
      await handle(
        req("/api/revector/upload", {
          method: "POST",
          headers: {
            origin: "https://web.example",
            "content-length": String(100 * 1024 * 1024),
          },
        }),
        env,
        never,
      )
    ).status,
    413,
  );
});

test("missing secrets, insecure nonlocal origin and redirects fail closed", async () => {
  assert.equal(
    (await handle(req("/health/ready"), {}, () => assert.fail())).status,
    503,
  );
  assert.equal(
    (
      await handle(
        req("/health/ready"),
        { ...env, ENGINE_ORIGIN: "http://engine.example" },
        () => assert.fail(),
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await handle(
        req("/health/ready"),
        env,
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://evil.example" },
          }),
      )
    ).status,
    502,
  );
});

test("signed sessions persist, forged cookies cannot impersonate an owner", async () => {
  const first = await session(req("/health/ready"), env);
  const repeat = await session(
    req("/health/ready", { headers: { cookie: first.cookie.split(";")[0] } }),
    env,
  );
  assert.equal(first.principal, repeat.principal);
  const forged = first.cookie
    .split(";")[0]
    .replace(/.$/, (c) => (c === "0" ? "1" : "0"));
  assert.notEqual(
    (await session(req("/health/ready", { headers: { cookie: forged } }), env))
      .principal,
    first.principal,
  );
});

test("multipart upload stays streamed and forwarded engine failures remain failures", async () => {
  const form = new FormData();
  form.append("project_id", "fixture-id");
  form.append("file", new Blob(["raster bytes"]), "input.png");
  const response = await handle(
    req("/api/revector/upload", {
      method: "POST",
      headers: { origin: "https://web.example" },
      body: form,
    }),
    env,
    async (upstream) => {
      assert.match(
        upstream.headers.get("content-type"),
        /multipart\/form-data/,
      );
      assert.equal(upstream.headers.get("cookie"), null);
      assert.equal((await upstream.formData()).get("file").name, "input.png");
      return Response.json(
        { error: { code: "SOURCE_REJECTED" } },
        { status: 422 },
      );
    },
  );
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "SOURCE_REJECTED");
});

test("JSON commands are bounded even without Content-Length", async () => {
  const never = () => assert.fail("Invalid command must not reach engine");
  const init = {
    method: "POST",
    headers: {
      origin: "https://web.example",
      "content-type": "application/json",
    },
  };
  assert.equal(
    (
      await handle(
        req("/api/revector/projects", { ...init, body: "{bad" }),
        env,
        never,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handle(
        req("/api/revector/projects", {
          ...init,
          body: "x".repeat(1024 * 1024 + 1),
        }),
        env,
        never,
      )
    ).status,
    413,
  );
});

test("protected SVG artifact sandbox policy is preserved", async () => {
  const response = await handle(
    req(
      "/api/revector/projects/11111111-1111-1111-1111-111111111111/artifacts/parts/part_fixture/optimized.svg",
    ),
    env,
    async () =>
      new Response("<svg/>", {
        headers: {
          "content-security-policy": "sandbox; default-src 'none'",
          "content-type": "image/svg+xml",
        },
      }),
  );
  assert.equal(
    response.headers.get("content-security-policy"),
    "sandbox; default-src 'none'",
  );
});

test("approved engine orchestration and assistant routes are allowlisted through the secured gateway", async () => {
  const cases = [
    ["GET", "/api/revector/capabilities/ai"],
    ["GET", "/api/revector/error-catalog"],
    ["POST", "/api/revector/prepare"],
    ["POST", "/api/revector/production"],
    ["POST", "/api/revector/recover-part"],
    ["POST", "/api/revector/ai-missing"],
    ["POST", "/api/revector/review/confirm"],
    ["POST", "/api/revector/slots/update"],
    [
      "GET",
      "/api/revector/projects/11111111-1111-1111-1111-111111111111/events",
    ],
    [
      "GET",
      "/api/revector/projects/11111111-1111-1111-1111-111111111111/errors",
    ],
    ["POST", "/api/revector/assistant/explain"],
    ["POST", "/api/revector/assistant/feedback"],
  ];
  for (const [method, path] of cases) {
    const init = { method, headers: {} };
    if (method !== "GET") {
      init.headers.origin = "https://web.example";
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify({
        project_id: "11111111-1111-1111-1111-111111111111",
      });
    }
    const response = await handle(req(path, init), env, async (upstream) => {
      assert.equal(
        upstream.headers.get("authorization"),
        "Bearer " + env.ENGINE_API_KEY,
      );
      assert.match(
        upstream.headers.get("x-revector-user"),
        /^anon_[a-f0-9]{32}$/,
      );
      return Response.json({ proxied: true });
    });
    assert.equal(response.status, 200, method + " " + path);
  }
});

test("unapproved recovery-like routes remain blocked", async () => {
  const never = () => assert.fail("Unapproved route must not reach engine");
  const response = await handle(
    req("/api/revector/resume-job", {
      method: "POST",
      headers: {
        origin: "https://web.example",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    env,
    never,
  );
  assert.equal(response.status, 404);
});

test("assembled canonical vector assets are private while part artifacts remain supported", async () => {
  for (const filename of [
    "vectors/master.svg",
    "exports/master.pdf",
    "exports/assembled.eps",
    "vectors/%6daster.svg",
  ]) {
    const response = await handle(
      req(
        "/api/revector/projects/11111111-1111-1111-1111-111111111111/artifacts/" +
          filename,
      ),
      env,
      () => assert.fail("Canonical asset must not be fetched"),
    );
    assert.equal(response.status, 404);
  }
});
