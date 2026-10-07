import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
test("user-only build has CSP and contains no Admin UI or API client", async () => {
  const manifest = JSON.parse(
      await readFile("worker/security-manifest.json", "utf8"),
    ),
    html = await readFile("public/index.html", "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.equal(typeof manifest.scriptHash, "string");
  assert.ok(manifest.scriptHash.length > 20);
  assert.ok(!/sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/.test(html));
  for (const marker of [
    "Admin Sign In",
    "ADMIN CONSOLE",
    "Support Inbox",
    "/api/admin/",
  ])
    assert.ok(!html.includes(marker), marker);
  await assert.rejects(access("public/admin-login.html"));
});
