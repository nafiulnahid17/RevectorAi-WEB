import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
test("user-only build has CSP and contains no Admin UI or API client", async () => {
  const manifest = JSON.parse(
      await readFile("worker/security-manifest.json", "utf8"),
    ),
    html = await readFile("public/index.html", "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  const currentHash = createHash("sha256").update(scripts[0][1]).digest("base64");
  assert.equal(typeof manifest.scriptHash, "string");
  assert.ok(manifest.scriptHash.length > 20);
  assert.ok(currentHash.length > 20);
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
