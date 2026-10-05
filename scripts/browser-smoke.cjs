/* Real Worker + approved engine workflow. No production deployment or live AI credentials. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

(async () => {
  const base = process.env.REVECTOR_TEST_URL || "http://127.0.0.1:8787";
  const out = path.resolve(
    process.env.REVECTOR_QA_DIR || "test-results/workflow",
  );
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
  await page.locator('[data-connection="engine"].connected').waitFor();
  await page
    .getByRole("heading", { name: "Upload Your Jersey Artwork", exact: true })
    .waitFor();

  const engineStatuses = page.locator(".upload-header-card.ai");
  assert.equal(await engineStatuses.count(), 2);
  assert.equal(
    await page.getByText("Primary AI", { exact: true }).count(),
    1,
  );
  assert.equal(
    await page.getByText("Fallback AI", { exact: true }).count(),
    1,
  );

  await page.locator(".bootstrap-overlay").waitFor({ state: "hidden" });
  const voicesAtStart = await page.evaluate(() =>
    window.__revectorVoice.slice(),
  );
  assert.ok(
    voicesAtStart.includes(
      "Welcome to ReVector AI by JerseyOS. Server connected. Engine connected. Let's create production-ready vectors.",
    ),
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
  await page
    .locator("#file-input")
    .setInputFiles(path.resolve("public/assets/sample-layout.png"));
  await page.getByText("Uploading artwork...", { exact: true }).waitFor();
  await page.locator(".upload-reference-progress .upload-progress-track").waitFor();
  await page
    .getByRole("heading", { name: "Detected Jersey Parts (8)", exact: true })
    .waitFor({ timeout: 120000 });

  const pid = await page.evaluate(() =>
    localStorage.getItem("revector.project"),
  );
  assert.ok(pid);

  const projectAfterPrepare = await (
    await page.request.get(base + "/api/revector/projects/" + pid)
  ).json();
  assert.equal(projectAfterPrepare.state, "PART_REVIEW_READY");
  assert.deepEqual(Object.keys(projectAfterPrepare.slots).sort(), [
    "BACK_BODY",
    "BACK_COLLAR",
    "BOTTOM_TRIM",
    "FRONT_BODY",
    "FRONT_COLLAR",
    "LEFT_SLEEVE",
    "RIGHT_SLEEVE",
    "TOP_TRIM",
  ]);

  await page.locator('button[data-prep-view="enhance"]').click();
  await page
    .getByRole("heading", { name: "Enhance Your Jersey Artwork", exact: true })
    .waitFor();
  assert.equal(
    await page.locator('img[alt="AI enhanced artwork"]').count(),
    0,
    "Enhance page must not fabricate an enhanced image when no AI provider ran",
  );
  await page.getByText("No enhanced result yet", { exact: true }).waitFor();
  await page.getByText("Not exposed", { exact: true }).first().waitFor();
  for (const fakeValue of ["68%", "75%", "4.2s", "Claude 3.5 Sonnet", "GPT-4o"]) {
    assert.equal(
      await page.getByText(fakeValue, { exact: true }).count(),
      0,
      `Enhance page must not contain demo value ${fakeValue}`,
    );
  }
  await page.screenshot({
    path: path.join(out, "00-enhance-real-empty-state.png"),
    fullPage: true,
  });
  await page.locator('button.step[data-step="2"]').click();
  await page
    .getByRole("heading", { name: "Detected Jersey Parts (8)", exact: true })
    .waitFor();

  assert.equal(
    await page.locator('img[alt="AI production mockup"]').count(),
    0,
    "Detected Parts must not fabricate an AI mockup when no provider ran",
  );
  await page.getByText("No AI mockup available", { exact: true }).waitFor();
  for (const fakeValue of ["75%", "92%", "2.1s", "4.3s", "6.8s", "Claude 3.5 Sonnet", "GPT-4o"]) {
    assert.equal(
      await page.getByText(fakeValue, { exact: true }).count(),
      0,
      `Detected Parts must not contain demo value ${fakeValue}`,
    );
  }

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
  assert.ok(
    initialExtras >= 2,
    "Deterministic sample should expose separate components",
  );

  const assignments = [
    { name: "Front Body", type: "front_body", width: "520", height: "700" },
    { name: "Back Body", type: "back_body", width: "520", height: "700" },
  ];

  for (const assignment of assignments) {
    extras = page.locator(".compact-parts button");
    const before = await extras.count();
    assert.ok(
      before > 0,
      "A component must remain available for classification",
    );
    await extras.first().click();
    await page.locator('[name="part-name"]').fill(assignment.name);
    await page.locator('[name="part-type"]').selectOption(assignment.type);
    await page.locator('[name="part-width"]').fill(assignment.width);
    await page.locator('[name="part-height"]').fill(assignment.height);
    await page
      .getByRole("button", { name: "Save & Confirm Part", exact: true })
      .click();
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll(".compact-parts button").length === expected,
      before - 1,
    );
  }

  extras = page.locator(".compact-parts button");
  while ((await extras.count()) > 0) {
    const before = await extras.count();
    await extras.first().click();
    await page
      .getByRole("button", { name: "Remove Part", exact: true })
      .click();
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll(".compact-parts button").length === expected,
      before - 1,
    );
    extras = page.locator(".compact-parts button");
  }

  let missingSlots = page.locator(".detect-slot-card.missing .detect-slot-select");
  while ((await missingSlots.count()) > 0) {
    const before = await missingSlots.count();
    await missingSlots.first().click();
    const blankButton = page.locator('.detect-inspector [data-action="leave-blank"]');
    await blankButton.waitFor();
    await blankButton.click();
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll(".detect-slot-card.missing .detect-slot-select").length === expected,
      before - 1,
    );
    missingSlots = page.locator(".detect-slot-card.missing .detect-slot-select");
  }

  await page.screenshot({
    path: path.join(out, "01-detected-parts-review.png"),
    fullPage: true,
  });
  const confirmButton = page.locator('[data-action="confirm-parts"]').last();
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

  const voicesAfterValidation = await page.evaluate(() =>
    window.__revectorVoice.slice(),
  );
  assert.ok(
    voicesAfterValidation.includes(
      "Validation passed. Your vector files are ready.",
    ),
    "Validation-passed voice should be emitted from actual PASS state",
  );

  await page.locator('[data-action="navigate"][data-step="3"]').click();
  await page
    .getByRole("heading", { name: "Vector Parts", exact: true })
    .waitFor();
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
  assert.equal(
    (await page.getByText("PASS", { exact: true }).count()) > 0,
    true,
  );
  assert.equal(await page.getByText("Layers", { exact: true }).count(), 0);

  await page.locator('[data-action="navigate"][data-step="5"]').click();
  await page.getByRole("heading", { name: "Download", exact: true }).waitFor();

  assert.equal(
    await page.getByRole("button", { name: /Download Selected Parts/ }).count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("button", { name: /Download Production Pack/ })
      .count(),
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

  // Use the tool's actual per-part EPS/PDF workflow, then independent strict parsers.
  if (finalProject.capabilities?.inkscape !== false) {
    await page.locator('[data-format="eps"]').click();
    await page.locator('[data-format="pdf"]').click();
    const formatDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download Selected Parts/ }).click();
    const formats = await formatDownload;
    const archive = path.join(out, "selected-part-formats.zip");
    await formats.saveAs(archive);
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-action="download-selected"]').disabled,
    );
    const dir = path.join(out, "part-formats");
    await fs.mkdir(dir, { recursive: true });
    execFileSync("unzip", ["-o", archive, "-d", dir]);
    const walk = async (root) => {
      const files = [];
      for (const item of await fs.readdir(root, { withFileTypes: true })) {
        const file = path.join(root, item.name);
        if (item.isDirectory()) files.push(...(await walk(file)));
        else files.push(file);
      }
      return files;
    };
    const files = await walk(dir),
      pdf = files.find((file) => file.endsWith(".pdf")),
      eps = files.find((file) => file.endsWith(".eps"));
    assert.ok(pdf && eps, "Both requested vector formats must actually exist");
    const pdfInfo = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
    assert.match(pdfInfo, /Pages:\s+1/);
    const rasters = execFileSync("pdfimages", ["-list", pdf], {
      encoding: "utf8",
    });
    assert.equal(
      rasters.trim().split("\n").length,
      2,
      "PDF must have no raster image rows",
    );
    execFileSync("gs", [
      "-q",
      "-dNOPAUSE",
      "-dBATCH",
      "-dSAFER",
      "-sDEVICE=nullpage",
      eps,
    ]);
    const reopened = path.join(out, "reopened-pdf.svg");
    execFileSync(
      "inkscape",
      [
        pdf,
        "--export-text-to-path",
        "--export-type=svg",
        "--export-filename=" + reopened,
      ],
      { stdio: "pipe" },
    );
    const geometry = await fs.readFile(reopened, "utf8");
    assert.ok(/<path\b/.test(geometry));
    assert.ok(!/<image\b|data:image\//i.test(geometry));
    await page.locator('[data-format="eps"]').click();
    await page.locator('[data-format="pdf"]').click();
  }
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
    (await page
      .getByText("Internet connection is unavailable.", { exact: true })
      .count()) > 0,
    true,
  );
  const projectDuringOffline = await page.evaluate(() =>
    localStorage.getItem("revector.project"),
  );
  assert.equal(projectDuringOffline, pid);
  const offlineVoices = await page.evaluate(() =>
    window.__revectorVoice.slice(),
  );
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
    (await page
      .getByRole("button", { name: "Retry Connection", exact: true })
      .count()) > 0,
    true,
    "Offline assistant should expose the supported reconnect action",
  );
  const repeatedOfflineVoices = await page.evaluate(
    () =>
      window.__revectorVoice.filter((text) => text.includes("Connection lost"))
        .length,
  );
  assert.equal(
    repeatedOfflineVoices,
    1,
    "The same offline error should be voiced only once",
  );
  await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .click();
  await context.setOffline(false);
  await page.getByText("Ready", { exact: true }).waitFor({ timeout: 30000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(out, "02-mobile.png"),
    fullPage: true,
  });
  const mobileOverflow = await page.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= innerWidth + 1,
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter(
        (element) => element.getBoundingClientRect().right > innerWidth + 1,
      )
      .slice(0, 8)
      .map((element) => ({
        tag: element.tagName,
        className: element.className?.toString?.() || "",
        text: (element.textContent || "").trim().slice(0, 100),
        right: Math.round(element.getBoundingClientRect().right),
      })),
  }));
  assert.equal(
    mobileOverflow.fits,
    true,
    "Mobile viewport should not overflow horizontally: " +
      JSON.stringify(mobileOverflow),
  );

  const unexpectedBrowserErrors = errors.filter(
    (message) => !message.includes("net::ERR_INTERNET_DISCONNECTED"),
  );
  assert.deepEqual(unexpectedBrowserErrors, []);
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
        browser_errors: unexpectedBrowserErrors,
        expected_offline_console_errors: errors.filter((message) =>
          message.includes("net::ERR_INTERNET_DISCONNECTED"),
        ).length,
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
      browser_errors: unexpectedBrowserErrors,
      output: out,
    }),
  );

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
