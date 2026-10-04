import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
test("both static shells use byte-exact scripts matching CSP; admin never prerenders production controls", async () => {
  const manifest = JSON.parse(
    await readFile("worker/security-manifest.json", "utf8"),
  );
  for (const filename of ["index.html", "admin-login.html"]) {
    const html = await readFile("public/" + filename, "utf8");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.equal(
      createHash("sha256").update(scripts[0][1]).digest("base64"),
      manifest.scriptHash,
    );
    assert.ok(!/sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/.test(html));
    if (filename === "admin-login.html") {
      const markup = html.split("<script>")[0];
      assert.ok(markup.includes("Admin Sign In"));
      assert.ok(!markup.includes('data-action="new-project"'));
    }
  }
});
