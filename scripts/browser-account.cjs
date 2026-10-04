/* Account UI fixtures are confined to this browser test. No live Supabase changes. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const output = process.env.REVECTOR_QA_DIR || "test-results/account";
  await fs.mkdir(output, { recursive: true });
  const html = await fs.readFile("public/index.html", "utf8");
  const U = "00000000-0000-4000-8000-000000000002",
    A = "00000000-0000-4000-8000-000000000001",
    T = "00000000-0000-4000-8000-000000000005";
  const profile = {
      id: U,
      name: "QA User",
      email: "user@example.test",
      company: "QA studio",
      role: "USER",
      status: "ACTIVE",
    },
    admin = {
      id: A,
      name: "QA Admin",
      email: "admin@example.test",
      role: "ADMIN",
      status: "ACTIVE",
    };
  let adminSession = false,
    ledger = [],
    balance = 12,
    tickets = [
      {
        id: T,
        user_id: U,
        type: "SUPPORT",
        subject: "Vector boundary review",
        category: "VECTOR_QUALITY",
        payload: {
          message: "The left sleeve needs review.",
          priority: "NORMAL",
        },
        status: "OPEN",
        created_at: "2026-10-04T00:00:00Z",
      },
    ],
    messages = [];
  const requests = [];
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://qa.revector.test/**", async (route) => {
    const r = route.request(),
      url = new URL(r.url()),
      p = url.pathname,
      body = r.postDataJSON?.bind(r);
    requests.push([r.method(), p]);
    assert.ok(!p.startsWith("/api/admin/"), "User app attempted an Admin API");
    let data = {};
    if (p === "/health")
      return route.fulfill({ json: { status: "ok", engine: "ReVector" } });
    if (p === "/health/ready")
      return route.fulfill({
        json: {
          status: "ready",
          engine: "ReVector",
          segments: {
            server: { status: "connected" },
            engine: { status: "connected" },
            tool: { status: "connected" },
          },
        },
      });
    if (p === "/api/revector/capabilities/ai")
      return route.fulfill({
        json: {
          main_ai: { configured: false },
          fallback_ai: { configured: false },
        },
      });
    if (!p.startsWith("/api/"))
      return route.fulfill({
        contentType: "text/html",
        body: html,
      });
    if (p === "/api/account/bootstrap") data = { configured: true, profile };
    else if (p === "/api/account/wallet")
      data = {
        items: [{ current_credit_balance: balance, reserved_credits: 2 }],
      };
    else if (p === "/api/account/transactions") data = { items: ledger };
    else if (p === "/api/account/usage") data = { items: [] };
    else if (p === "/api/account/models" || p === "/api/admin/models")
      data = {
        items: [
          {
            id: T,
            display_name: "QA catalog model",
            provider: "cloudflare",
            model_id: "QA-test-only-model",
            capability: "ANALYZER",
            enabled: true,
            pricing_version: "UNPRICED",
          },
        ],
      };
    else if (p === "/api/account/preferences") data = { items: [] };
    else if (p === "/api/account/profile") {
      profile.name = body().name;
      data = { profile };
    } else if (p === "/api/account/requests") {
      if (r.method() === "POST") {
        const d = body();
        tickets.push({
          id: crypto.randomUUID(),
          user_id: U,
          type: d.type,
          status: d.type === "SUPPORT" ? "OPEN" : "PENDING",
          subject: d.subject || d.type,
          payload: d,
          created_at: new Date().toISOString(),
        });
        data = { request: tickets.at(-1) };
      } else {
        // Exercise real loading states before forms become editable.
        await new Promise((resolve) => setTimeout(resolve, 250));
        data = { items: tickets };
      }
    } else if (
      p === "/api/account/support/messages" ||
      p === "/api/admin/support/messages"
    )
      data = { items: messages };
    else if (p === "/api/admin/auth/login") {
      adminSession = true;
      data = { profile: admin };
    } else if (p === "/api/admin/session") {
      if (!adminSession)
        return route.fulfill({
          status: 401,
          json: { error: { message: "Admin sign in required." } },
        });
      data = { profile: admin };
    } else if (p === "/api/admin/overview")
      data = {
        total_users: 2,
        open_support: tickets.filter(
          (t) => t.type === "SUPPORT" && t.status === "OPEN",
        ).length,
        pending_topups: 1,
        credits_used: 0,
      };
    else if (p === "/api/admin/support")
      data = { items: tickets.filter((t) => t.type === "SUPPORT") };
    else if (p === "/api/admin/support/reply") {
      const d = body();
      tickets.find((t) => t.id === d.request_id).status = d.status;
      messages.push({
        author_role: "ADMIN",
        message: d.message,
        created_at: new Date().toISOString(),
      });
      data = {};
    } else if (p === "/api/admin/requests")
      data = {
        items: tickets.filter((t) => t.type === url.searchParams.get("type")),
      };
    else if (p === "/api/admin/requests/decide") {
      const d = body(),
        t = tickets.find((t) => t.id === d.request_id);
      t.status = d.decision;
      if (d.decision === "APPROVED") {
        balance += t.payload.requested_credits;
        ledger.push({
          type: "TOPUP",
          credits_delta: t.payload.requested_credits,
          balance_after: balance,
          reason: "QA approval",
          reference: t.id,
          created_at: new Date().toISOString(),
        });
      }
      data = {};
    } else if (p === "/api/admin/wallets")
      data = {
        items: [
          { user_id: U, current_credit_balance: balance, reserved_credits: 2 },
        ],
      };
    else if (p === "/api/admin/settings")
      data = {
        credits_per_usd: null,
        payments: "MANUAL_REQUESTS",
        engine_configuration: "READ_ONLY",
      };
    else data = { items: [] };
    return route.fulfill({ json: data });
  });
  try {
    await page.goto("https://qa.revector.test/dashboard");
    await page
      .getByRole("heading", { name: "My Dashboard", exact: true })
      .waitFor();
    await page.getByText("10", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Open profile menu" }).click();
    assert.equal(
      await page
        .locator(".profile-dropdown")
        .getByText(/Admin|Audit|All Users|Settings/)
        .count(),
      0,
    );
    assert.equal(await page.locator(".profile-dropdown a").count(), 6);
    await page
      .locator(".account-nav")
      .getByRole("link", { name: "Profile", exact: true })
      .click();
    await page.locator("[name=name]").fill("Updated QA User");
    await page.getByRole("button", { name: "Save Profile" }).click();
    await page.getByText("Saved successfully.", { exact: true }).waitFor();
    assert.equal(profile.name, "Updated QA User");
    await page
      .locator(".account-nav")
      .getByRole("link", { name: "Add Credits", exact: true })
      .click();
    await page.locator("[name=requested_credits]").fill("8");
    await page.locator("[name=payment_method]").fill("Manual review");
    await page.locator("[name=payment_note]").fill("QA only");
    await page.getByRole("button", { name: "Submit Credit Request" }).click();
    await page.getByText("PENDING", { exact: true }).waitFor();
    assert.equal(balance, 12);
    // Test-only server fixture for an operations reply from the separate application.
    messages.push({author_role:"ADMIN",message:"Review your crop boundary and revalidate.",created_at:new Date().toISOString()});
    tickets[0].status="IN_PROGRESS";
    assert.ok(!html.includes("ADMIN CONSOLE"));
    assert.ok(!html.includes("/api/admin/"));
    await page.goto("https://qa.revector.test/dashboard/support");
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await page
      .getByText("Review your crop boundary and revalidate.", { exact: true })
      .waitFor();
    await page.goto("https://qa.revector.test/dashboard");
    for (const width of [1920, 1600, 1440, 1366, 1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page
        .getByRole("heading", { name: "My Dashboard", exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "overflow " + width,
      );
      await page.screenshot({
        path: path.join(output, "user-dashboard-" + width + ".png"),
        fullPage: true,
      });
    }
    await page
      .getByRole("link", { name: "Open Production Workspace", exact: true })
      .click();
    await page.getByText("Engine connected", { exact: true }).waitFor();
    await page.locator(".bootstrap-overlay").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".stepper .step").count(), 8);
    assert.equal(
      await page
        .getByRole("heading", { name: "Upload Artwork", exact: true })
        .count(),
      1,
    );
    await page.goto("https://qa.revector.test/dashboard/models");
    await page.getByRole("option", { name: /QA catalog model/ }).waitFor({ state: "attached" });
    assert.equal(
      await page.getByRole("option", { name: /QA catalog model/ }).count(),
      1,
    );
    assert.deepEqual(errors, []);
    assert.ok(!requests.some(([m, p]) => m === "POST" && p.includes("signup")));
    console.log(
      JSON.stringify({
        account_browser: "PASS",
        admin_ui_absent: "PASS",
        manual_topup: "PASS",
        support_reply_history: "PASS",
        responsive_widths: [1920, 1600, 1440, 1366, 1280, 390],
        page_errors: errors,
        fixtures: "TEST_ONLY",
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
