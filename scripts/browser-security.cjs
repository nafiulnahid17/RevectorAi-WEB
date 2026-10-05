/* Verify anonymous session isolation against the real Worker and engine. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const base = process.env.REVECTOR_TEST_URL || 'http://127.0.0.1:8787';
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const owner = await browser.newContext(), stranger = await browser.newContext();
  try {
    const page = await owner.newPage();
    await page.goto(base);
    await page.locator('[data-connection="engine"].connected').waitFor();
    assert.equal(await page.evaluate(() => document.cookie), '', 'Session must be HttpOnly');
    const cookie = (await owner.cookies()).find(c => c.name === 'revector_session');
    assert.ok(cookie?.httpOnly);
    if (base.startsWith('https:')) assert.ok(cookie.secure);
    const make = await owner.request.post(base + '/api/revector/projects', { headers: { origin: new URL(base).origin, 'x-revector-user': 'forged-owner' }, data: { name: 'Ownership regression', user_id: 'forged-owner' } });
    assert.equal(make.status(), 201);
    const project = await make.json();
    assert.match(project.user_id, /^anon_[a-f0-9]{32}$/);
    const id = project.project_id;
    const sample = await fs.readFile(path.resolve('public/assets/sample-panel.png'));
    const uploaded = await owner.request.post(base + '/api/revector/upload', { headers: { origin: new URL(base).origin }, multipart: { project_id: id, file: { name: 'panel.png', mimeType: 'image/png', buffer: sample } } });
    assert.equal(uploaded.status(), 200);
    const jobResponse = await owner.request.post(base + '/api/revector/analyze', { headers: { origin: new URL(base).origin }, data: { project_id: id } });
    assert.equal(jobResponse.status(), 202);
    const job = await jobResponse.json();
    const prefix = base + '/api/revector/projects/' + id;
    assert.equal((await owner.request.get(prefix)).status(), 200);
    assert.equal((await stranger.request.get(prefix)).status(), 404);
    assert.equal((await stranger.request.get(prefix + '/artifacts/working/normalized.png')).status(), 404);
    assert.equal((await stranger.request.get(base + '/api/revector/jobs/' + job.job_id)).status(), 404);
    assert.equal((await stranger.request.post(base + '/api/revector/jobs/' + job.job_id + '/cancel', { headers: { origin: new URL(base).origin } })).status(), 404);
    assert.equal((await stranger.request.delete(prefix, { headers: { origin: new URL(base).origin } })).status(), 404);
    assert.equal((await owner.request.post(base + '/api/revector/projects', { headers: { origin: 'https://malicious.example' }, data: {} })).status(), 403);
    assert.equal((await owner.request.get(base + '/worker/index.js')).status(), 404);
    const html = await (await owner.request.get(base)).text();
    assert.ok(!html.includes('ENGINE_API_KEY') && !html.includes('SESSION_SIGNING_KEY'));
    const report = { session_http_only: true, owner_header_spoof_blocked: true, project_isolation: true, artifact_isolation: true, job_isolation: true, cancellation_isolation: true, deletion_isolation: true, cross_origin_mutation_blocked: true, worker_source_private: true, credentials_absent_from_html: true };
    const output = process.env.REVECTOR_QA_DIR || 'test-results/security';
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, 'security-verification.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
