import {
  account,
  userPages,
  currentPath,
  accountPage,
} from "./account-model.js";
import { escape } from "./model.js";
const e = escape;
const money = (v) =>
  v == null
    ? "Unavailable"
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 });
const date = (v) => (v ? e(new Date(v).toLocaleString()) : "—");
const field = (label, name, type = "text", value = "", extra = "") =>
  `<label class="account-field"><span>${label}</span><input name="${name}" type="${type}" value="${e(value || "")}" ${extra}></label>`;
const area = (label, name, extra = "") =>
  `<label class="account-field"><span>${label}</span><textarea name="${name}" rows="3" required maxlength="4000" ${extra}></textarea></label>`;
const select = (label, name, choices, value = "") =>
  `<label class="account-field"><span>${label}</span><select name="${name}">${choices.map(([key, label]) => `<option value="${e(key)}" ${key === value ? "selected" : ""}>${e(label)}</option>`).join("")}</select></label>`;
const button = (label, action, extra = "") =>
  `<button type="button" data-account="${action}" ${extra}>${label}</button>`;
const submit = (label) =>
  `<button class="primary" type="submit" ${account.busy ? "disabled" : ""}>${account.busy ? "Saving…" : label}</button>`;
const form = (name, body, label) =>
  `<form class="account-form" data-account-form="${name}"><fieldset ${account.busy ? "disabled" : ""}>${body}${submit(label)}</fieldset></form>`;
const panel = (title, content) =>
  `<section class="account-card"><h2>${title}</h2>${content}</section>`;
const empty = (message) => `<div class="account-empty">${message}</div>`;
function table(headers, rows) {
  return rows.length
    ? `<div class="table-scroll"><table class="account-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : empty("No records yet.");
}
const badge = (status) =>
  `<span class="account-badge">${e(status || "—")}</span>`;
export function profileMenu() {
  const wallet = account.data.wallet?.items?.[0];
  return `<div class="profile-control">${button(account.profile ? e((account.profile.name || account.profile.email).slice(0, 2).toUpperCase()) : "◎", "menu", 'class="avatar-button" aria-label="Open profile menu" aria-expanded="' + account.menu + '"')}${account.menu ? `<div class="profile-dropdown"><strong>${e(account.profile?.name || "Your account")}</strong><small>${e(account.profile?.email || "ReVector account services")}</small>${account.profile ? `<small>${e(account.profile.status)}</small>` : ""}${wallet ? `<small>${money(wallet.current_credit_balance)} credits</small>` : ""}${userPages.map(([route, label]) => `<a href="/dashboard/${route}" data-account="nav">${label}</a>`).join("")}${account.profile ? button("Sign Out", "logout") : button("Sign In", "nav", 'data-url="/login"')}</div>` : ""}</div>`;
}
function login() {
  return `<div class="account-login"><a class="console-brand" href="/" data-account="nav"><span class="gold-mark">R</span><strong>ReVector AI</strong></a><section class="login-card"><div class="section-kicker">Invite-only account</div><h1>Welcome to ReVector</h1><p class="muted">Sign in with your invited account to access your production workspace.</p>${account.configured === false ? empty("Account services are not configured. Contact the owner to enable Supabase Auth.") : form("login", field("Email", "email", "email", "", 'required autocomplete="username"') + field("Password", "password", "password", "", 'required autocomplete="current-password"'), "Sign In")}${account.error ? `<p role="alert" class="account-error">${e(account.error)}</p>` : ""}<a href="/" data-account="nav">Return to production workspace</a></section></div>`;
}
function usage(items) {
  return table(
    [
      "Operation / Project",
      "Provider / Model",
      "Mode / Status",
      "Provider cost",
      "Credits",
      "Time",
    ],
    items
      .filter((v) => v.status !== "RESERVED")
      .map((v) => [
        `${e(v.operation)}<small>${e(v.project_id || "No project")}</small>`,
        `${e(v.provider || "Not reported")}<small>${e(v.model || "Not reported")}</small>`,
        `${badge(v.processing_mode)} ${badge(v.status)}`,
        v.estimated_usd_cost == null
          ? v.processing_mode === "DETERMINISTIC"
            ? "Not applicable"
            : "Unavailable"
          : `$${Number(v.estimated_usd_cost).toFixed(6)}<small>${e(v.cost_source)} · ${e(v.pricing_version || "")}</small>`,
        money(v.credits_charged),
        date(v.created_at),
      ]),
  );
}
function ledger(items) {
  return table(
    ["Type", "Credits", "Balance after", "Reason / Reference", "Time"],
    items.map((v) => [
      badge(v.type),
      money(v.credits_delta),
      money(v.balance_after),
      `${e(v.reason)}<small>${e(v.reference)}</small>`,
      date(v.created_at),
    ]),
  );
}
function tickets(items) {
  return table(
    ["Subject / Category", "Status", "Reply", "Updated", ""],
    items.map((v) => [
      `${e(v.subject)}<small>${e(v.category)}</small>`,
      badge(v.status),
      e(v.admin_response || "Awaiting reply"),
      date(v.updated_at),
      button("Open", "ticket", `data-id="${e(v.id)}"`),
    ]),
  );
}
function conversation() {
  const t = account.ticket;
  if (!t) return "";
  return panel(
    e(t.subject),
    `<div class="ticket-thread"><article><strong>Original request</strong><p>${e(t.payload?.message || "")}</p><small>${date(t.created_at)}</small></article>${account.messages.map((m) => `<article><strong>${e(m.author_role === "USER" ? "User" : "ReVector Support")}</strong><p>${e(m.message)}</p><small>${date(m.created_at)}</small></article>`).join("")}</div>${form("support-message", `<input type="hidden" name="request_id" value="${e(t.id)}">` + area("Reply", "message"), "Send Message")}${button("Close conversation", "close-ticket")}`,
  );
}
function userContent(page) {
  const d = account.data,
    p = account.profile,
    w = d.wallet?.items?.[0],
    models = d.models?.items || [],
    requests = d.requests?.items || [];
  if (!p)
    return (
      empty("Sign in to view your private account data.") +
      button("Sign In", "nav", 'data-url="/login"')
    );
  if (page === "dashboard") {
    const pref = d.preferences?.items?.[0];
    const preferenceName = (id) =>
      !d.preferences || !d.models
        ? "Loading…"
        : !id
          ? "Auto — engine routing"
          : models.find((m) => m.id === id)?.display_name ||
            "Unavailable catalog model";
    return (
      `<div class="account-metrics">${[
        [
          "Available credits",
          w
            ? money(
                Number(w.current_credit_balance) - Number(w.reserved_credits),
              )
            : "Loading…",
        ],
        ["Reserved credits", w ? money(w.reserved_credits) : "Loading…"],
        ["Account status", p.status],
      ]
        .map(
          ([label, value]) =>
            `<section><small>${label}</small><strong>${e(value)}</strong></section>`,
        )
        .join("")}</div>` +
      panel(
        "Welcome, " + e(p.name || p.email),
        '<p>Your account controls are separate from the production workflow. Model preferences are requests; actual provider usage appears in Usage.</p><a class="button primary" href="/" data-account="nav">Open Production Workspace</a>',
      ) +
      panel(
        "Preferred Models",
        `<p>Analyzer: ${e(preferenceName(pref?.analyzer_model_id))}</p><p>Image: ${e(preferenceName(pref?.image_model_id))}</p><p class="muted">Preferences guide requests. Actual provider/model execution appears in Usage.</p><a href="/dashboard/models" data-account="nav">Select Models</a>`,
      ) +
      panel("Recent Usage", usage(d.usage?.items || []))
    );
  }
  if (page === "profile")
    return (
      panel(
        "Profile",
        `<p class="muted">Status: ${e(p.status)}${p.created_at ? ` · Created ${date(p.created_at)}` : ""}</p>` +
          form(
            "profile",
            field("Name", "name", "text", p.name, 'maxlength="120"') +
              field("Email", "email", "email", p.email, "disabled") +
              field("Company", "company", "text", p.company, 'maxlength="180"'),
            "Save Profile",
          ),
      ) +
      panel(
        "Password",
        form(
          "password",
          field(
            "New Password",
            "password",
            "password",
            "",
            'required minlength="12" autocomplete="new-password"',
          ),
          "Update Password",
        ),
      )
    );
  if (page === "balance")
    return (
      panel(
        "Wallet",
        `<div class="balance-value">${w ? money(w.current_credit_balance) : "Loading…"} <small>credits</small></div><p class="muted">${w ? money(w.reserved_credits) : "—"} reserved. Credits are internal ReVector units.</p><a href="/dashboard/add-credits" data-account="nav">Request Credits</a>`,
      ) + panel("Transactions", ledger(d.transactions?.items || []))
    );
  if (page === "add-credits")
    return (
      panel(
        "Request Credits",
        '<p class="muted">Manual review is required. Submitting a request does not confirm payment or change your balance.</p>' +
          form(
            "topup",
            field(
              "Requested credits",
              "requested_credits",
              "number",
              "",
              'required min="0.0001" max="1000000" step="0.0001"',
            ) +
              field(
                "Payment method",
                "payment_method",
                "text",
                "",
                'required maxlength="100"',
              ) +
              area(
                "Payment note / reference",
                "payment_note",
                'maxlength="1000"',
              ),
            "Submit Credit Request",
          ),
      ) +
      panel(
        "My Credit Requests",
        table(
          ["Request", "Status", "Response", "Created"],
          requests
            .filter((r) => r.type === "TOPUP")
            .map((r) => [
              money(r.payload.requested_credits),
              badge(r.status),
              e(r.admin_response || "Awaiting review"),
              date(r.created_at),
            ]),
        ),
      )
    );
  if (page === "usage")
    return panel(
      "My Usage",
      '<p class="muted">Actual provider/model identities come from completed engine operations. Estimated cost is labelled; missing cost metadata remains unavailable. Failed operations are not charged.</p>' +
        usage(d.usage?.items || []),
    );
  if (page === "models") {
    const pref = d.preferences?.items?.[0] || {};
    const choices = (type) => [
      ["", "Auto — engine routing"],
      ...models
        .filter((m) => m.capability === type)
        .map((m) => [m.id, m.display_name + " · " + m.provider]),
    ];
    return (
      panel(
        "Model Preferences",
        '<p class="muted">These are account preferences, not a claim that an AI provider is connected. Engine routing remains authoritative.</p>' +
          form(
            "preferences",
            select(
              "Analyzer",
              "analyzer_model_id",
              choices("ANALYZER"),
              pref.analyzer_model_id,
            ) +
              select(
                "Image model",
                "image_model_id",
                choices("IMAGE"),
                pref.image_model_id,
              ),
            "Save Preferences",
          ),
      ) +
      panel(
        "Request Another Model",
        form(
          "model-request",
          field(
            "Desired provider / model",
            "desired_model",
            "text",
            "",
            'required maxlength="200"',
          ) +
            select("Capability", "capability", [
              ["ANALYZER", "Analyzer"],
              ["IMAGE", "Image generation"],
            ]) +
            area("Reason", "reason", 'maxlength="1000"'),
          "Send Model Request",
        ),
      ) +
      panel(
        "My Model Requests",
        table(
          ["Model", "Status", "Response"],
          requests
            .filter((r) => r.type === "MODEL_CHANGE")
            .map((r) => [
              e(r.payload.desired_model),
              badge(r.status),
              e(r.admin_response || "Awaiting review"),
            ]),
        ),
      )
    );
  }
  if (page === "support")
    return (
      conversation() +
      panel(
        "Create Support Request",
        form(
          "support",
          field("Subject", "subject", "text", "", 'required maxlength="160"') +
            select(
              "Category",
              "category",
              [
                "TECHNICAL",
                "VECTOR_QUALITY",
                "BILLING",
                "CREDITS",
                "MODEL",
                "ACCOUNT",
                "OTHER",
              ].map((v) => [v, v.replaceAll("_", " ")]),
            ) +
            select(
              "Priority",
              "priority",
              [
                ["LOW", "Low"],
                ["NORMAL", "Normal"],
                ["HIGH", "High"],
              ],
              "NORMAL",
            ) +
            area("Message", "message"),
          "Create Request",
        ),
      ) +
      panel(
        "My Support History",
        tickets(requests.filter((r) => r.type === "SUPPORT")),
      )
    );
  return empty("This account page does not exist.");
}
export function accountMarkup() {
  const page = accountPage();
  if (!page) return null;
  if (page === "login") return login();
  if (account.configured === false)
    return `<div class="account-layout"><header><a href="/" data-account="nav">ReVector</a></header><main>${panel("Account services unavailable", '<p>Supabase Auth and Control Backend V1 need server-side configuration. Production workflow remains available.</p><a href="/" data-account="nav">Return to production</a>')}</main></div>`;
  const profile = account.profile,
    pages = [["dashboard", "My Dashboard"], ...userPages];
  return `<div class="account-layout"><header><a class="console-brand" href="/" data-account="nav"><span class="gold-mark">R</span><strong>ReVector AI<small>My Account</small></strong></a><div class="right">${badge(profile?.role || "SIGNED OUT")}${profileMenu()}</div></header><div class="account-shell"><nav class="account-nav" aria-label="Account navigation"><a href="/" data-account="nav">← Production Workspace</a>${pages.map(([route, label]) => `<a href="/dashboard/${route === "dashboard" ? "" : route}" class="${page === route ? "active" : ""}" data-account="nav">${label}</a>`).join("")}</nav><main class="account-main"><div class="account-heading"><div><div class="section-kicker">Private Account</div><h1>${e(pages.find(([r]) => r === page)?.[1] || page)}</h1></div>${button("Refresh", "refresh")}</div>${account.error ? `<p class="account-error" role="alert">${e(account.error)}</p>` : ""}${account.notice ? `<p class="account-notice" role="status">${e(account.notice)}</p>` : ""}${account.busy ? '<p role="status">Loading account data…</p>' : ""}${userContent(page)}${["usage", "balance", "support", "models"].includes(page) ? `<div class="account-pager">${button("Previous", "previous", account.offset === 0 ? "disabled" : "")}<span>Page ${account.offset / 50 + 1}</span>${button("Next", "next", (account.data[page === "balance" ? "transactions" : page === "models" ? "requests" : page]?.items || []).length < 50 ? "disabled" : "")}</div>` : ""}</main></div></div>`;
}
