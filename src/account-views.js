import {
  account,
  userPages,
  adminPages,
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
  `<form class="account-form" data-account-form="${name}">${body}${submit(label)}</form>`;
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
  return `<div class="profile-control">${button(account.profile ? e((account.profile.name || account.profile.email).slice(0, 2).toUpperCase()) : "◎", "menu", 'class="avatar-button" aria-label="Open profile menu" aria-expanded="' + account.menu + '"')}${account.menu ? `<div class="profile-dropdown"><strong>${e(account.profile?.name || "Your account")}</strong><small>${e(account.profile?.email || "ReVector account services")}</small>${userPages.map(([route, label]) => `<a href="/dashboard/${route}" data-account="nav">${label}</a>`).join("")}${account.profile ? button("Sign Out", "logout") : button("Sign In", "nav", 'data-url="/login"')}</div>` : ""}</div>`;
}
function login(admin) {
  return `<div class="account-login ${admin ? "admin-login" : ""}"><a class="console-brand" href="/" data-account="nav"><span class="gold-mark">R</span><strong>ReVector AI</strong></a><section class="login-card"><div class="section-kicker">${admin ? "Support & Operations Console" : "Invite-only account"}</div><h1>${admin ? "Admin Sign In" : "Welcome to ReVector"}</h1><p class="muted">${admin ? "Authorized administrators and support staff only." : "Sign in with your invited account to access your production workspace."}</p>${account.configured === false ? empty("Account services are not configured. Contact the owner to enable Supabase Auth.") : form(admin ? "admin-login" : "login", field(admin ? "Admin Email" : "Email", "email", "email", "", 'required autocomplete="username"') + field("Password", "password", "password", "", 'required autocomplete="current-password"'), admin ? "Sign In to Admin Console" : "Sign In")}${account.error ? `<p role="alert" class="account-error">${e(account.error)}</p>` : ""}${!admin ? '<a href="/" data-account="nav">Return to production workspace</a>' : ""}</section></div>`;
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
function tickets(items, admin = false) {
  return table(
    admin
      ? ["User", "Subject / Priority", "Status", "Updated", ""]
      : ["Subject / Category", "Status", "Reply", "Updated", ""],
    items.map((v) =>
      admin
        ? [
            `${e(v.revector_profiles?.name || v.user_id)}<small>${e(v.revector_profiles?.email || "")}</small>`,
            `${e(v.subject)}<small>${e(v.payload?.priority || "NORMAL")}</small>`,
            badge(v.status),
            date(v.updated_at),
            button("Open", "ticket", `data-id="${e(v.id)}"`),
          ]
        : [
            `${e(v.subject)}<small>${e(v.category)}</small>`,
            badge(v.status),
            e(v.admin_response || "Awaiting reply"),
            date(v.updated_at),
            button("Open", "ticket", `data-id="${e(v.id)}"`),
          ],
    ),
  );
}
function conversation(admin) {
  const t = account.ticket;
  if (!t) return "";
  return panel(
    e(t.subject),
    `<div class="ticket-thread"><article><strong>Original request</strong><p>${e(t.payload?.message || "")}</p><small>${date(t.created_at)}</small></article>${account.messages.map((m) => `<article><strong>${e(m.author_role === "USER" ? "User" : "ReVector Support")}</strong><p>${e(m.message)}</p><small>${date(m.created_at)}</small></article>`).join("")}</div>${form(
      admin ? "support-reply" : "support-message",
      `<input type="hidden" name="request_id" value="${e(t.id)}">` +
        area("Reply", "message") +
        (admin
          ? select(
              "Ticket status",
              "status",
              [
                ["OPEN", "Open"],
                ["IN_PROGRESS", "In Progress"],
                ["RESOLVED", "Resolved"],
                ["CLOSED", "Closed"],
              ],
              t.status,
            )
          : ""),
      admin ? "Send Support Reply" : "Send Message",
    )}${button("Close conversation", "close-ticket")}`,
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
  if (page === "dashboard")
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
      panel("Recent Usage", usage(d.usage?.items || []))
    );
  if (page === "profile")
    return (
      panel(
        "Profile",
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
      conversation(false) +
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
function adminContent(page) {
  const d = account.data,
    items = d.items || [];
  if (page === "overview")
    return (
      `<div class="account-metrics">${
        Object.entries(d)
          .filter(([k, v]) => typeof v === "number" || v === null)
          .map(
            ([k, v]) =>
              `<section><small>${e(k.replaceAll("_", " "))}</small><strong>${money(v)}</strong></section>`,
          )
          .join("") || empty("No operational data loaded.")
      }</div>` +
      panel(
        "Support & Operations",
        "<p>Global reports are available only in this console. Wallet changes use append-only ledger transactions and audited reasons.</p>",
      )
    );
  if (page === "users")
    return (
      panel(
        "Users",
        table(
          ["User", "Role", "Status", "Created", "Actions"],
          items.map((v) => [
            `${e(v.name || v.email)}<small>${e(v.id)}</small>`,
            badge(v.role),
            badge(v.status),
            date(v.created_at),
            button("Change Status", "edit-status", `data-id="${e(v.id)}"`),
          ]),
        ),
      ) +
      (account.editUser
        ? panel(
            "Account status",
            form(
              "status",
              `<input type="hidden" name="user_id" value="${e(account.editUser)}">` +
                select("Status", "status", [
                  ["ACTIVE", "Active"],
                  ["SUSPENDED", "Suspended"],
                  ["DISABLED", "Disabled"],
                ]) +
                area("Reason", "reason", 'maxlength="1000"'),
              "Apply Status",
            ),
          )
        : "")
    );
  if (page === "wallets")
    return (
      panel(
        "Balances",
        table(
          ["User ID", "Balance", "Reserved", "Action"],
          items.map((v) => [
            e(v.user_id),
            money(v.current_credit_balance),
            money(v.reserved_credits),
            button("Adjust", "edit-wallet", `data-id="${e(v.user_id)}"`),
          ]),
        ),
      ) +
      panel(
        "Audited Wallet Adjustment",
        form(
          "adjust",
          field(
            "User ID",
            "user_id",
            "text",
            account.editUser || "",
            "required",
          ) +
            field(
              "Credits delta (negative to deduct)",
              "delta",
              "number",
              "",
              'required min="-1000000" max="1000000" step="0.0001"',
            ) +
            area("Required reason", "reason", 'maxlength="1000"'),
          "Record Adjustment",
        ),
      )
    );
  if (["credits", "models"].includes(page))
    return (
      panel(
        page === "credits" ? "Credit Requests" : "Model Requests",
        table(
          ["User", "Request", "Status", "Response", "Actions"],
          items.map((v) => [
            e(v.user_id),
            e(
              v.type === "TOPUP"
                ? v.payload.requested_credits + " credits"
                : v.payload.desired_model,
            ),
            badge(v.status),
            e(v.admin_response || "—"),
            v.status === "PENDING"
              ? button("Review", "review-request", `data-id="${e(v.id)}"`)
              : "—",
          ]),
        ),
      ) +
      (account.ticket
        ? panel(
            "Review Request",
            form(
              "decision",
              `<input type="hidden" name="request_id" value="${e(account.ticket.id)}">` +
                select("Decision", "decision", [
                  ["APPROVED", "Approve"],
                  ["REJECTED", "Reject"],
                  ["REPLY", "Reply without changing status"],
                ]) +
                (page === "models"
                  ? select("Approved catalog model", "model_id", [
                      ["", "Choose approved model"],
                      ...(d.catalog || []).map((m) => [m.id, m.display_name]),
                    ])
                  : "") +
                area("Response / reason", "response"),
              "Record Decision",
            ),
          )
        : "")
    );
  if (page === "usage") return panel("Global Usage", usage(items));
  if (page === "support")
    return conversation(true) + panel("Support Inbox", tickets(items, true));
  if (page === "audit")
    return panel(
      "Append-only Audit Log",
      table(
        ["Actor", "Action", "Target", "Reason", "Time"],
        items.map((v) => [
          e(v.admin_user_id),
          e(v.action),
          e(v.target),
          e(v.reason),
          date(v.created_at),
        ]),
      ),
    );
  if (page === "settings")
    return (
      panel(
        "Control Backend Settings",
        `<dl class="account-details">${Object.entries(d.settings || {})
          .map(
            ([key, value]) =>
              `<dt>${e(key.replaceAll("_", " "))}</dt><dd>${e(value == null ? "Not configured" : String(value))}</dd>`,
          )
          .join(
            "",
          )}</dl><p class="muted">Engine and production secrets are managed separately. This console cannot change Railway settings.</p>`,
      ) +
      panel(
        "Model Catalog",
        table(
          ["Model", "Enabled", "Pricing version", ""],
          (d.catalog || []).map((m) => [
            `${e(m.display_name)}<small>${e(m.model_id)}</small>`,
            e(String(m.enabled)),
            e(m.pricing_version),
            button("Configure", "edit-model", `data-id="${e(m.id)}"`),
          ]),
        ),
      ) +
      (account.editModel
        ? panel(
            "Catalog Pricing",
            form(
              "catalog",
              `<input type="hidden" name="model_id" value="${e(account.editModel.id)}">` +
                select(
                  "Availability",
                  "enabled",
                  [
                    ["true", "Enabled"],
                    ["false", "Disabled"],
                  ],
                  String(account.editModel.enabled),
                ) +
                field(
                  "Pricing version",
                  "pricing_version",
                  "text",
                  account.editModel.pricing_version,
                  "required",
                ) +
                area(
                  "Operation prices in USD (JSON object)",
                  "operation_prices",
                ) +
                area("Change reason", "reason"),
              "Save Catalog",
            ),
          )
        : "")
    );
  return empty("This console page does not exist.");
}
export function accountMarkup() {
  const page = accountPage();
  if (!page) return null;
  const admin = currentPath().startsWith("/admin");
  if (page === "login" || page === "admin-login") return login(admin);
  const profile = admin ? account.adminProfile : account.profile;
  if (account.configured === false && !admin)
    return `<div class="account-layout"><header><a href="/" data-account="nav">ReVector</a></header><main>${panel("Account services unavailable", '<p>Supabase Auth and Control Backend V1 need server-side configuration. Production workflow remains available.</p><a href="/" data-account="nav">Return to production</a>')}</main></div>`;
  if (admin && !profile) return login(true);
  const pages = admin
    ? profile.role === "SUPPORT"
      ? adminPages.filter(([key]) => key === "support")
      : adminPages
    : [["dashboard", "My Dashboard"], ...userPages];
  return `<div class="account-layout ${admin ? "admin-console" : ""}"><header><a class="console-brand" href="${admin ? "/admin" : "/"}" data-account="nav"><span class="gold-mark">R</span><strong>ReVector AI<small>${admin ? "ADMIN CONSOLE · Support & Operations" : "My Account"}</small></strong></a><div class="right">${badge(profile?.role || "SIGNED OUT")}${admin ? button("Sign Out", "admin-logout") : profileMenu()}</div></header><div class="account-shell"><nav class="account-nav" aria-label="${admin ? "Admin navigation" : "Account navigation"}">${!admin ? '<a href="/" data-account="nav">← Production Workspace</a>' : ""}${pages.map(([route, label]) => `<a href="${admin ? "/admin/" : "/dashboard/"}${route === "dashboard" ? "" : route}" class="${page === route ? "active" : ""}" data-account="nav">${label}</a>`).join("")}</nav><main class="account-main"><div class="account-heading"><div><div class="section-kicker">${admin ? "Operations & Support" : "Private Account"}</div><h1>${e(pages.find(([r]) => r === page)?.[1] || page)}</h1></div>${button("Refresh", "refresh")}</div>${account.error ? `<p class="account-error" role="alert">${e(account.error)}</p>` : ""}${account.notice ? `<p class="account-notice" role="status">${e(account.notice)}</p>` : ""}${account.busy ? '<p role="status">Loading account data…</p>' : ""}${admin ? adminContent(page) : userContent(page)}${["usage", "balance", "support", "credits", "models", "users", "wallets", "audit"].includes(page) ? `<div class="account-pager">${button("Previous", "previous", account.offset === 0 ? "disabled" : "")}<span>Page ${account.offset / 50 + 1}</span>${button("Next", "next", (account.data.items || account.data[page === "balance" ? "transactions" : page === "models" ? "requests" : page]?.items || []).length < 50 ? "disabled" : "")}</div>` : ""}</main></div></div>`;
}
