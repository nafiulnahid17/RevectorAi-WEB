import test from "node:test";
import assert from "node:assert/strict";
import { safeUpload } from "../worker/upload.js";
test("streamed uploads preserve raster bytes while stripping duplicate auto-prepare fields", async () => {
  const bytes = crypto.getRandomValues(new Uint8Array(50000));
  const form = new FormData();
  form.append("auto_prepare", "true");
  form.append("project_id", "test");
  form.append("file", new Blob([bytes]), "jersey.jpg");
  form.append("auto_prepare", "true");
  const original = new Request("https://test/upload", {
    method: "POST",
    body: form,
  });
  const all = new Uint8Array(await original.arrayBuffer());
  // Deliberately split every header/boundary across small chunks.
  let offset = 0;
  const stream = new ReadableStream({
    pull(c) {
      if (offset >= all.length) {
        c.close();
        return;
      }
      const end = Math.min(all.length, offset + 23);
      c.enqueue(all.slice(offset, end));
      offset = end;
    },
  });
  const req = new Request(original.url, {
    method: "POST",
    headers: original.headers,
    body: stream,
    duplex: "half",
  });
  const result = new Request(original.url, {
    method: "POST",
    headers: req.headers,
    body: safeUpload(req, all.length + 1),
    duplex: "half",
  });
  const data = await result.formData();
  assert.deepEqual(data.getAll("auto_prepare"), ["false"]);
  assert.equal(data.get("project_id"), "test");
  assert.deepEqual(new Uint8Array(await data.get("file").arrayBuffer()), bytes);
});
test("unquoted control fields cannot bypass filtering; malformed or oversized streams fail", async () => {
  const content =
    "--abc\r\nContent-Disposition: form-data; name = auto_prepare\r\n\r\ntrue\r\n--abc--\r\n";
  const request = () =>
    new Request("https://test/upload", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=abc" },
      body: content,
    });
  const result = new Request("https://test/upload", {
    method: "POST",
    headers: request().headers,
    body: safeUpload(request(), 1000),
    duplex: "half",
  });
  assert.deepEqual((await result.formData()).getAll("auto_prepare"), ["false"]);
  await assert.rejects(
    new Response(safeUpload(request(), 10)).text(),
    /UPLOAD_TOO_LARGE/,
  );
  const corrupt = new Request("https://test/upload", {
    method: "POST",
    headers: request().headers,
    body: "--abc\r\nno header",
  });
  await assert.rejects(
    new Response(safeUpload(corrupt, 1000)).text(),
    /INVALID_REQUEST/,
  );
});
