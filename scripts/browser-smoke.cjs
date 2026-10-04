/* Real Worker + approved engine workflow. No production deployment or live AI credentials. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

(async () => {
  const base = process.env.REVECTOR_TEST_URL || "http://127.0.0.1:8787";
  const out = path.resolve("samples/web-workspace-review");
  await fs.mkdir(out, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];

  await page.addInitScript(() => {
    window.__revectorVoice = [];
    class TestUtterance {
      constructor(text) {
        this.text = text;
        this.rate = 1;
        this.pitch = 1;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: TestUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak(utterance) {
          window.__revectorVoice.push(utterance.text);
        },
      },
    });
  });

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(base);
  await page.getByText("Engine connected", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Upload Artwork", exact: true }).waitFor();

  const engineStatuses = page.locator(".engine-card");
  assert.equal(await engineStatuses.count(), 2);
  assert.equal(
    await page.getByText("Primary AI Engine", { exact: true }).count(),
    1,
  );
  assert.equal(
    await page.getByText("Fallback AI Engine", { exact: true }).count(),
    1,
  );

  const voicesAtStart = await page.evaluate(() => window.__revectorVoice.slice());
  assert.ok(
    voicesAtStart.includes("Welcome to ReVector AI. Upload your artwork to begin."),
    "Welcome voice should run once after a real successful boot",
  );

  let uploadDelayed = true;
  await page.route("**/api/revector/upload", async (route) => {
    if (uploadDelayed) {
      uploadDelayed = false;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    await route.continue();
  });
  await page.locator("#file-input").setInputFiles(path.resolve("public/assets/sample-layout.png"));
  await page.getByText("Uploading Artwork...", { exact: true }).waitFor();
  await page.getByText("Preparing your file for processing.", { exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "8-Part Review", exact: true })
    .waitFor({ timeout: 120000 });

  const pid = await page.evaluate(() => localStorage.getItem("revector.project"));
  assert.ok(pid);

  const projectAfterPrepare = await (
    await page.request.get(base + "/api/revector/projects/" + pid)
  ).json();
  assert.equal(projectAfterPrepare.state, "PART_REVIEW_READY");
  assert.deepEqual(
    Object.keys(projectAfterPrepare.slots).sort(),
    [
      "BACK_BODY",
      "BACK_COLLAR",
      "BOTTOM_TRIM",
      "FRONT_BODY",
      "FRONT_COLLAR",
      "LEFT_SLEEVE",
      "RIGHT_SLEEVE",
      "TOP_TRIM",
    ],
  );

  assert.equal(
    await page.getByText("AI Production Mockup", { exact: true }).count(),
    0,
    "No AI mockup should be fabricated when AI providers are not configured",
  );
  assert.equal(
    await page.getByText("Editable SVG Ready", { exact: true }).count(),
    0,
    "Review references must not be labelled as editable vectors",
  );

  let extras = page.locator(".compact-parts button");
  const initialExtras = await extras.count();
  assert.ok(initialExtras >= 2, "Deterministic sample should expose separate components");

  const assignments = [
    { name: "Front Body", type: "front_body", width: "520", height: "700" },
    { name: "Back Body", type: "back_body", width: "520", height: "700" },
  ];

  for (const assignment of assignments) {
    extras = page.locator(".compact-parts button");
    const before = await extras.count();
    assert.ok(before > 0, "A component must remain available for classification");
    await extras.first().click();
    await page.locator('[name="part-name"]').fill(assignment.name);
    await page.locator('[name="part-type"]').selectOption(assignment.type);
    await page.locator('[name="part-width"]').fill(assignment.width);
    await page.locator('[name="part-height"]').fill(assignment.height);
    await page
      .getByRole("button", { name: "Save & Confirm Part", exact: true })
      .click();
    await page.waitForFunction(
      (expected) => document.querySelectorAll(".compact-parts button").length === expected,
      before - 1,
    );
  }

  extras = page.locator(".compact-parts button");
  while ((await extras.count()) > 0) {
    const before = await extras.count();
    await extras.first().click();
    await page.getByRole("button", { name: "Remove Part", exact: true }).click();
    await page.waitForFunction(
      (expected) => document.querySelectorAll(".compact-parts button").length === expected,
      before - 1,
    );
    extras = page.locator(".compact-parts button");
  }

  let blankButtons = page.locator('[data-action="leave-blank"]');
  while ((await blankButtons.count()) > 0) {
    const before = await blankButtons.count();
    await blankButtons.first().click();
    await page.waitForFunction(
      (expected) => document.querySelectorAll('[data-action="leave-blank"]').length === expected,
      before - 1,
    );
    blankButtons = page.locator('[data-action="leave-blank"]');
  }

  await page.screenshot({ path: path.join(out, "01-eight-part-review.png"), fullPage: true });
  const confirmButton = page.getByRole("button", { name: /Confirm Parts/ }).last();
  assert.equal(await confirmButton.isEnabled(), true);
  await confirmButton.click();

  await page
    .getByRole("heading", { name: "Download", exact: true })
    .waitFor({ timeout: 180000 });

  const finalProject = await (
    await page.request.get(base + "/api/revector/projects/" + pid)
  ).json();
  assert.equal(finalProject.true_vector_ready, true);
  assert.equal(finalProject.validation.status, "PASS");
  assert.equal(finalProject.validation.embedded_rasters, 0);
  assert.ok(finalProject.validation.vector_paths > 0);

  const voicesAfterValidation = await page.evaluate(() => window.__revectorVoice.slice());
  assert.ok(
    voicesAfterValidation.includes("Validation passed. Your vector files are ready."),
    "Validation-passed voice should be emitted from actual PASS state",
  );

  await page.locator('[data-action="navigate"][data-step="3"]').click();
  await page.getByRole("heading", { name: "Vector Parts", exact: true }).waitFor();
  await page.locator(".vector-part").first().click();
  await page.waitForFunction(() => document.querySelector("#vector-art svg"));
  const shape = page.locator("#vector-art .editable-shape").first();
  assert.ok((await shape.count()) > 0, "A real SVG shape should be selectable");
  await shape.click({ force: true });
  const selectedShapeId = await page.locator("#shape-label").textContent();
  assert.ok(selectedShapeId && selectedShapeId !== "None");
  await page.locator("#shape-color").fill("#ee3344");
  await page
    .getByRole("button", { name: "Apply Color & Revalidate", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply Color & Revalidate", exact: true })
    .waitFor({ timeout: 120000 });

  const edited = await (
    await page.request.get(base + "/api/revector/projects/" + pid)
  ).json();
  assert.equal(edited.true_vector_ready, true);
  assert.ok(
    edited.manual_changes.some((change) => change.action === "vector_fill"),
    "Color edit must be persisted by the engine",
  );

  await page.locator('[data-action="review-view"][data-view="paths"]').click();
  await page.getByText("Diagnostic Paths", { exact: true }).waitFor();
  assert.equal(await page.getByText("Compare", { exact: true }).count(), 0);

  await page.locator('[data-action="navigate"][data-step="4"]').click();
  await page
    .getByRole("heading", { name: "Validation Completed", exact: true })
    .waitFor();
  assert.equal(await page.getByText("PASS", { exact: true }).count() > 0, true);
  assert.equal(await page.getByText("Layers", { exact: true }).count(), 0);

  await page.locator('[data-action="navigate"][data-step="5"]').click();
  await page.getByRole("heading", { name: "Download", exact: true }).waitFor();

  assert.equal(
    await page.getByRole("button", { name: /Download Selected Parts/ }).count(),
    1,
  );
  assert.equal(
    await page.getByRole("button", { name: /Download Production Pack/ }).count(),
    1,
  );
  assert.equal(await page.getByText(/Download Full Pattern/i).count(), 0);
  assert.equal(await page.getByText(/Download Master/i).count(), 0);
  assert.equal(await page.getByText(/Download Complete Pattern/i).count(), 0);

  const aiFormat = page.locator('[data-format="ai"]');
  assert.equal(await aiFormat.isDisabled(), true);
  assert.match((await aiFormat.getAttribute("title")) || "", /unavailable/i);

  await page.getByRole("button", { name: "Deselect All", exact: true }).click();
  const partChecks = page.locator('[name="export-part"]');
  await partChecks.first().check();

  const selectedDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download Selected Parts/ }).click();
  const selectedDownload = await selectedDownloadPromise;
  const selectedPath = path.join(out, "selected-part.svg");
  await selectedDownload.saveAs(selectedPath);
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-action="download-selected"]');
    return button && !button.disabled;
  });
  const svg = await fs.readFile(selectedPath, "utf8");
  assert.ok(/<svg\b/.test(svg));
  assert.ok(!/<(?:\w+:)?image\b|data:image\//i.test(svg));

  await page.getByRole("button", { name: "Select All", exact: true }).click();
  const packPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download Production Pack/ }).click();
  const pack = await packPromise;
  const packPath = path.join(out, "production-pack.zip");
  await pack.saveAs(packPath);
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-action="download-pack"]');
    return button && !button.disabled;
  });
  const listing = execFileSync("unzip", ["-l", packPath], { encoding: "utf8" });
  assert.doesNotMatch(listing, /master\.(svg|pdf|eps|png)/i);
  assert.doesNotMatch(listing, /assembled/i);

  await context.setOffline(true);
  await page.getByText("Connection Lost", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("Internet connection is unavailable.", { exact: true }).count() > 0,
    true,
  );
  const projectDuringOffline = await page.evaluate(() => localStorage.getItem("revector.project"));
  assert.equal(projectDuringOffline, pid);
  const offlineVoices = await page.evaluate(() => window.__revectorVoice.slice());
  assert.ok(
    offlineVoices.some((text) => text.includes("Connection lost")),
    "Offline state should produce one short error voice",
  );

  // First offline occurrence: verify NO preserves the project and closes guidance.
  await page.getByRole("button", { name: "No", exact: true }).click();
  assert.equal(await page.locator(".assistant-card").count(), 0);
  await context.setOffline(false);
  await page.getByText("Ready", { exact: true }).waitFor({ timeout: 30000 });

  // Second occurrence: verify YES exposes only supported recovery guidance.
  await context.setOffline(true);
  await page.getByText("Connection Lost", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Yes, Help Me", exact: true }).click();
  await page.locator(".assistant-guidance").waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Retry Connection", exact: true }).count() > 0,
    true,
    "Offline assistant should expose the supported reconnect action",
  );
  const repeatedOfflineVoices = await page.evaluate(() =>
    window.__revectorVoice.filter((text) => text.includes("Connection lost")).length,
  );
  assert.equal(repeatedOfflineVoices, 1, "The same offline error should be voiced only once");
  await page.getByRole("button", { name: "Close assistant", exact: true }).click();
  await context.setOffline(false);
  await page.getByText("Ready", { exact: true }).waitFor({ timeout: 30000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "02-mobile.png"), fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    "Mobile viewport should not overflow horizontally",
  );

  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(out, "verification.json"),
    JSON.stringify(
      {
        project_id: pid,
        initial_components: initialExtras,
        slots: finalProject.slots,
        validation: finalProject.validation,
        voice_messages: voicesAfterValidation,
        native_ai_export_disabled: true,
        master_export_absent: true,
        browser_errors: errors,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify({
      project_id: pid,
      parts: finalProject.parts.length,
      validation: finalProject.validation.status,
      vector_paths: finalProject.validation.vector_paths,
      master_export_absent: true,
      browser_errors: errors,
      output: out,
    }),
  );

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
