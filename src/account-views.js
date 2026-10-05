import {
  account,
  userPages,
  currentPath,
  accountPage,
  profileSetupRequired,
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
  const avatar = account.profile?.avatar_path
    ? `<img src="/api/account/avatar?v=${account.avatarVersion}" alt="">`
    : account.profile
      ? e((account.profile.name || account.profile.email).slice(0, 2).toUpperCase())
      : "◎";
  const links = profileSetupRequired()
    ? '<a href="/dashboard/profile" data-account="nav">Complete Profile</a>'
    : userPages
        .map(
          ([route, label]) =>
            `<a href="/dashboard/${route}" data-account="nav">${label}</a>`,
        )
        .join("");
  return `<div class="profile-control">${button(avatar, "menu", 'class="avatar-button" aria-label="Open profile menu" aria-expanded="' + account.menu + '"')}${account.menu ? `<div class="profile-dropdown"><strong>${e(account.profile?.name || "Your account")}</strong><small>${e(account.profile?.email || "ReVector account services")}</small>${account.profile ? `<small>${profileSetupRequired() ? "SETUP REQUIRED" : e(account.profile.status)}</small>` : ""}${wallet ? `<small>${money(wallet.current_credit_balance)} credits</small>` : ""}${links}${account.profile ? button("Sign Out", "logout") : button("Sign In", "nav", 'data-url="/login"')}</div>` : ""}</div>`;
}
function login() {
  return `<div class="account-login"><a class="console-brand" href="/" data-account="nav"><span class="gold-mark">R</span><strong>ReVector AI</strong></a><section class="login-card"><div class="section-kicker">Invite-only access</div><h1>Sign in to ReVector</h1><p class="muted">First-time users must enter through the invitation link from their administrator. After setup, sign in here with your email address and updated password. User sessions expire after 24 hours.</p>${account.configured === false ? empty("Account services are not configured. Contact the owner to enable Supabase Auth.") : form("login", field("Email", "email", "email", "", 'required autocomplete="username"') + field("Password", "password", "password", "", 'required autocomplete="current-password"'), "Sign In")}${account.error ? `<p role="alert" class="account-error">${e(account.error)}</p>` : ""}</section></div>`;
}

export function userLoginGate() {
  if (currentPath() !== "/" || account.profile || account.configured === null)
    return "";
  return `<div class="user-login-gate" id="user-login-gate" role="dialog" aria-modal="true" aria-labelledby="user-login-title">
    <div class="user-login-gate-card">
      <div class="user-login-brand">
        <img src="/assets/revector-ai-logo.svg" alt="">
        <div><strong>ReVector AI</strong><small>Inside JerseyOS</small></div>
      </div>
      <div class="user-login-kicker">Secure Production Access</div>
      <h2 id="user-login-title">Sign in to continue</h2>
      <p>Your production workspace is ready. Sign in with your invited ReVector account to access projects and tools.</p>
      ${account.configured === false
        ? empty("Account services are not configured. Contact the workspace administrator.")
        : form(
            "login",
            field("Email", "email", "email", "", 'required autocomplete="username" autofocus') +
              field("Password", "password", "password", "", 'required autocomplete="current-password"'),
            "Sign In",
          )}
      ${account.error ? `<p role="alert" class="account-error">${e(account.error)}</p>` : ""}
      <small class="user-login-note">Invite-only workspace • Session access is enforced by the ReVector account service.</small>
    </div>
  </div>`;
}

export function profileSetupPrompt() {
  if (!profileSetupRequired()) return "";
  return `<div class="profile-setup-gate" role="dialog" aria-modal="true" aria-labelledby="profile-setup-title">
    <div class="profile-setup-gate-card">
      <span class="profile-setup-orb" aria-hidden="true"></span>
      <div class="section-kicker">INVITED USER SETUP</div>
      <h2 id="profile-setup-title">Complete your profile to use ReVector</h2>
      <p>Your invitation is verified, but production access stays locked until you update your password, upload a profile picture and complete your account details.</p>
      <div class="profile-setup-checks">
        <span>Secure password</span><span>Profile picture</span><span>Name & company</span>
      </div>
      <a class="button primary" href="/dashboard/profile" data-account="nav">Set Up Profile</a>
      <small>Production APIs remain locked until setup is complete.</small>
    </div>
  </div>`;
}

function userIcon(name) {
  const icons = {
    dashboard: "▦",
    profile: "♙",
    balance: "▣",
    "add-credits": "＋",
    usage: "▥",
    models: "◇",
    support: "?",
    logout: "↪",
    wallet: "◫",
    reserved: "▣",
    status: "✓",
    history: "◴",
    model: "◇",
    image: "▧",
    ticket: "☏",
  };
  return \`<span class="ud-icon" aria-hidden="true">\${icons[name] || "◇"}</span>\`;
}
function paymentSettings() {
  return account.data["payment-settings"]?.settings || null;
}
function bdt(v) {
  return v == null || !Number.isFinite(Number(v))
    ? "Unavailable"
    : "৳" + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function usd(v) {
  return v == null || !Number.isFinite(Number(v))
    ? "Unavailable"
    : "$" + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
function convertedBDT(v) {
  const rate = Number(paymentSettings()?.usd_to_bdt_rate);
  return Number.isFinite(Number(v)) && Number.isFinite(rate) ? bdt(Number(v) * rate) : "Unavailable";
}
function statusTone(status) {
  const value = String(status || "").toUpperCase();
  if (["ACTIVE","APPROVED","COMPLETED","SUCCEEDED","RESOLVED","CLOSED"].includes(value)) return "good";
  if (["PENDING","IN_PROGRESS","RESERVED","OPEN"].includes(value)) return "warn";
  if (["FAILED","REJECTED","SUSPENDED","CANCELLED"].includes(value)) return "bad";
  return "";
}
function userBadge(status) {
  return \`<span class="ud-badge \${statusTone(status)}">\${e(status || "Unavailable")}</span>\`;
}
function accountTable(headers, rows, emptyText = "No records yet.") {
  return rows.length
    ? \`<div class="ud-table-scroll"><table class="ud-table"><thead><tr>\${headers.map((h) => \`<th>\${h}</th>\`).join("")}</tr></thead><tbody>\${rows.map((row) => \`<tr>\${row.map((cell) => \`<td>\${cell}</td>\`).join("")}</tr>\`).join("")}</tbody></table></div>\`
    : empty(emptyText);
}
function usageRows(items, limit = null) {
  const source = items.filter((v) => v.status !== "RESERVED");
  return (limit ? source.slice(0, limit) : source).map((v) => [
    \`<strong>\${e(v.operation || "Operation")}</strong><small>\${e(v.project_id || "No project reference")}</small>\`,
    \`<strong>\${e(v.provider || "Not reported")}</strong><small>\${e(v.model || "Not reported")}</small>\`,
    \`\${userBadge(v.status)}<small>\${e(v.processing_mode || "Mode unavailable")}</small>\`,
    v.estimated_usd_cost == null
      ? v.processing_mode === "DETERMINISTIC" ? "Not applicable" : "Unavailable"
      : usd(v.estimated_usd_cost),
    money(v.credits_charged),
    date(v.created_at),
  ]);
}
function ledgerRows(items) {
  return items.map((v) => [
    userBadge(v.type),
    \`<strong>\${e(v.reason || "Transaction")}</strong><small>\${e(v.reference || "No reference")}</small>\`,
    \`<strong class="\${Number(v.credits_delta) >= 0 ? "positive" : "negative"}">\${Number(v.credits_delta) >= 0 ? "+" : ""}\${money(v.credits_delta)}</strong>\`,
    money(v.balance_after),
    userBadge(v.status || "Recorded"),
    date(v.created_at),
  ]);
}
function ticketRows(items) {
  return items.map((v) => [
    \`<strong>\${e(v.subject || "Support request")}</strong><small>\${e(String(v.category || "OTHER").replaceAll("_"," "))}</small>\`,
    userBadge(v.status),
    \`<span class="ud-priority">\${e(v.payload?.priority || "NORMAL")}</span>\`,
    date(v.updated_at || v.created_at),
    button("Open", "ticket", \`data-id="\${e(v.id)}" class="ud-row-action"\`),
  ]);
}
function accountStatusCards() {
  const health = account.system;
  const ai = account.ai || {};
  const segment = (name) => health?.segments?.[name]?.status || null;
  const card = (title, value, stateName = "") =>
    \`<div class="ud-system-card \${stateName}"><i></i><span><strong>\${e(title)}</strong><small>\${e(value)}</small></span></div>\`;
  const server = health?.status === "ready" || segment("server") === "connected";
  const engine = segment("engine") === "connected";
  const primary = ai.main_ai || ai.primary || {};
  const fallback = ai.fallback_ai || ai.fallback || {};
  const aiText = (v) => v?.configured
    ? [v.provider, v.model].filter(Boolean).join(" • ") || "Configured"
    : v?.configured === false ? "Not configured" : "Unavailable";
  return \`<div class="ud-system-strip">
    \${card("Server", server ? "Connected" : health ? "Unavailable" : "Checking", server ? "good" : "")}
    \${card("Engine", engine ? "Connected" : health ? "Unavailable" : "Checking", engine ? "good" : "")}
    \${card("Primary AI", aiText(primary), primary?.configured ? "primary" : "")}
    \${card("Fallback AI", aiText(fallback), fallback?.configured ? "fallback" : "")}
  </div>\`;
}
function userSidebar(page, setupRequired) {
  const p = account.profile;
  const avatar = p?.avatar_path
    ? \`<img src="/api/account/avatar?v=\${account.avatarVersion}" alt="Profile picture">\`
    : e((p?.name || p?.email || "U").slice(0, 1).toUpperCase());
  const links = [["dashboard","My Dashboard"], ...userPages];
  return \`<aside class="ud-sidebar">
    <section class="ud-user-card">
      <div class="ud-avatar">\${avatar}</div>
      <div><strong>\${e(p?.name || "ReVector User")}</strong><small>\${e(p?.email || "Signed out")}</small>
      <span>\${userBadge(setupRequired ? "Setup Required" : p?.status || "Unavailable")}</span></div>
    </section>
    <nav aria-label="User dashboard navigation">
      \${links.map(([route,label]) => {
        const active = page === route;
        if (setupRequired && route !== "profile")
          return \`<span class="ud-nav-link locked">\${userIcon(route)}<span>\${e(label)}</span><b>•</b></span>\`;
        return \`<a href="/dashboard/\${route === "dashboard" ? "" : route}" data-account="nav" class="ud-nav-link \${active ? "active" : ""}">\${userIcon(route)}<span>\${e(label)}</span><b>›</b></a>\`;
      }).join("")}
      \${button(\`\${userIcon("logout")}<span>Sign Out</span>\`, "logout", 'class="ud-nav-link ud-signout"')}
    </nav>
  </aside>\`;
}
function pageTitle(iconName, title, subtitle, action = "") {
  return \`<section class="ud-page-title">
    <span class="ud-title-icon">\${userIcon(iconName)}</span>
    <div><h1>\${e(title)}</h1><p>\${e(subtitle)}</p></div>
    \${action}
  </section>\`;
}
function metricCard(iconName, title, value, note = "", cls = "") {
  return \`<section class="ud-metric \${cls}">\${userIcon(iconName)}<div><small>\${e(title)}</small><strong>\${value}</strong>\${note ? \`<span>\${note}</span>\` : ""}</div></section>\`;
}
function preferenceName(id, models) {
  return !id ? "Auto — Engine Routing" : models.find((m) => m.id === id)?.display_name || "Unavailable catalog model";
}
function dashboardPage(d,p,w,models) {
  const pref = d.preferences?.items?.[0] || {};
  const usageItems = d.usage?.items || [];
  const available = w ? Number(w.current_credit_balance) - Number(w.reserved_credits) : null;
  return \`
    <section class="ud-welcome">
      <div><small>Welcome back,</small><h1>\${e(p.name || p.email)}</h1><p>Turn your jersey artwork into production-ready vectors with ReVector AI.</p></div>
      <span>\${userBadge(p.status)}</span>
    </section>
    <div class="ud-metrics">
      \${metricCard("wallet","Available Balance", available == null ? "Loading…" : usd(available), available == null ? "" : convertedBDT(available),"blue")}
      \${metricCard("reserved","Reserved Balance", w ? usd(w.reserved_credits) : "Loading…", w ? convertedBDT(w.reserved_credits) : "","purple")}
      \${metricCard("status","Account Status", e(p.status), profileSetupRequired() ? "Onboarding required" : "Production access enabled","teal")}
    </div>
    <section class="ud-workspace-cta">
      <div class="ud-orb"><img src="/assets/revector-ai-logo.svg" alt=""></div>
      <div><h2>Ready to create production-ready jersey vectors?</h2><p>Open the production workspace and continue with your real ReVector projects.</p><a class="ud-primary-button" href="/" data-account="nav">Open Production Workspace <span>→</span></a></div>
      <ul><li>AI-assisted vectorization</li><li>Engine-controlled boundaries</li><li>Production-ready export validation</li></ul>
    </section>
    <div class="ud-preferences">
      <a href="/dashboard/models" data-account="nav">\${userIcon("model")}<span><small>Preferred Analyzer Model</small><strong>\${e(preferenceName(pref.analyzer_model_id,models))}</strong></span><b>›</b></a>
      <a href="/dashboard/models" data-account="nav">\${userIcon("image")}<span><small>Preferred Image Model</small><strong>\${e(preferenceName(pref.image_model_id,models))}</strong></span><b>›</b></a>
    </div>
    <section class="ud-panel">
      <header><div><h2>Recent Usage</h2><p>Your latest real operations.</p></div><a href="/dashboard/usage" data-account="nav">View All →</a></header>
      \${accountTable(["Operation / Project","Provider / Model","Status","Provider Cost","Charged","Time"],usageRows(usageItems,5),"No usage recorded yet.")}
    </section>\`;
}
function onboardingPage(p) {
  const checks = [
    [Boolean(p.avatar_path),"Profile Picture","Upload a profile picture"],
    [Boolean(p.name?.trim()),"Full Name","Enter your full name"],
    [Boolean(p.company?.trim()),"Company / Organization","Set your company"],
    [Boolean(p.password_updated_at),"New Password","Create a secure password"],
  ];
  const complete = checks.filter(([ok]) => ok).length;
  const percent = Math.round((complete / checks.length) * 100);
  return \`
    <section class="ud-onboarding-banner">
      <div class="ud-lock">▣</div>
      <div><span>Onboarding Required</span><h1>Complete Your Onboarding to Unlock Production Tools</h1><p>Your invited account must be completed before production access is enabled.</p></div>
      <div class="ud-onboarding-progress"><strong>Onboarding Progress <b>\${percent}% complete</b></strong><div><i style="width:\${percent}%"></i></div><small>\${complete} of \${checks.length} steps completed</small></div>
    </section>
    <div class="ud-profile-layout">
      <section class="ud-panel ud-profile-form">
        <header><div><h2>Profile Information</h2><p>Set up your account information.</p></div></header>
        <form class="account-form onboarding-form" data-account-form="onboarding"><fieldset \${account.busy ? "disabled" : ""}>
          <div class="ud-profile-grid">
            <label class="ud-avatar-upload"><span>Profile Picture</span><div class="ud-profile-upload-inner"><div class="ud-big-avatar">\${p.avatar_path ? \`<img src="/api/account/avatar?v=\${account.avatarVersion}" alt="Current profile picture">\` : e((p.name || p.email).slice(0,1).toUpperCase())}</div><div><strong>Upload Profile Picture</strong><small>JPG, PNG or WEBP • Max 3 MB</small><input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required></div></div></label>
            <div class="ud-profile-fields">
              \${field("Full Name *","name","text",p.name,'required maxlength="120" autocomplete="name"')}
              \${field("Email Address *","email","email",p.email,"disabled")}
              \${field("Company / Organization *","company","text",p.company,'required maxlength="180" autocomplete="organization"')}
            </div>
          </div>
          <div class="ud-password-block"><h3>Change Password</h3><div class="onboarding-password-grid">\${field("New Password *","password","password","",'required minlength="12" autocomplete="new-password"')}\${field("Confirm New Password *","confirm_password","password","",'required minlength="12" autocomplete="new-password"')}</div><small>Password must be at least 12 characters.</small></div>
          \${submit("Save Profile & Complete Onboarding")}
        </fieldset></form>
      </section>
      <section class="ud-panel ud-checklist"><header><div><h2>Onboarding Checklist</h2><p>Complete every required step.</p></div></header>
        \${checks.map(([ok,title,desc],i)=>\`<div class="ud-check-row \${ok ? "done" : ""}"><b>\${i+1}</b><span><strong>\${e(title)}</strong><small>\${e(desc)}</small></span><em>\${ok ? "Done" : "Required"}</em></div>\`).join("")}
        <div class="ud-after-onboarding"><strong>After onboarding</strong><span>✓ Production workspace access</span><span>✓ Account model preferences</span><span>✓ Usage and balance history</span><span>✓ Support tickets</span></div>
      </section>
    </div>\`;
}
function profilePage(p) {
  if (profileSetupRequired()) return onboardingPage(p);
  return \`
    \${pageTitle("profile","Profile","Manage your ReVector account information and security.")}
    <div class="ud-profile-layout">
      <section class="ud-panel ud-profile-form"><header><div><h2>Profile Information</h2><p>Your account identity and organization.</p></div></header>
        <div class="ud-profile-grid">
          <form class="account-form" data-account-form="avatar"><fieldset \${account.busy ? "disabled" : ""}><label class="ud-avatar-upload"><span>Profile Picture</span><div class="ud-profile-upload-inner"><div class="ud-big-avatar">\${p.avatar_path ? \`<img src="/api/account/avatar?v=\${account.avatarVersion}" alt="Profile picture">\` : e((p.name || p.email).slice(0,1).toUpperCase())}</div><div><strong>Update Profile Picture</strong><small>JPG, PNG or WEBP • Max 3 MB</small><input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required></div></div></label>\${submit("Upload Picture")}</fieldset></form>
          \${form("profile",field("Full Name","name","text",p.name,'required maxlength="120"')+field("Email Address","email","email",p.email,"disabled")+field("Company / Organization","company","text",p.company,'required maxlength="180"'),"Save Profile")}
        </div>
      </section>
      <section class="ud-panel"><header><div><h2>Account Status</h2><p>Current account access state.</p></div></header><div class="ud-status-large">\${userBadge(p.status)}<small>\${p.created_at ? "Created "+date(p.created_at) : "Creation date unavailable"}</small></div></section>
    </div>
    <section class="ud-panel"><header><div><h2>Change Password</h2><p>Use a secure password with at least 12 characters.</p></div></header>\${form("password",field("New Password","password","password","",'required minlength="12" autocomplete="new-password"'),"Update Password")}</section>\`;
}
function balancePage(d,w) {
  const tx = d.transactions?.items || [];
  return \`
    \${pageTitle("balance","Balance & Wallet","View your current balance, reserved balance and complete transaction history.",'<a class="ud-outline-button" href="/dashboard/add-credits" data-account="nav">＋ Add Credits</a>')}
    <div class="ud-wallet-summary">
      \${metricCard("wallet","Current Balance",w ? usd(w.current_credit_balance) : "Loading…",w ? convertedBDT(w.current_credit_balance) : "","blue")}
      \${metricCard("reserved","Reserved Balance",w ? usd(w.reserved_credits) : "Loading…",w ? convertedBDT(w.reserved_credits) : "","purple")}
    </div>
    <section class="ud-panel"><header><div><h2>Transaction History</h2><p>Real wallet transactions and balance changes.</p></div></header>\${accountTable(["Type","Description","Amount","Balance After","Status","Date & Time"],ledgerRows(tx),"No wallet transactions yet.")}</section>\`;
}
function topupPage(d) {
  const settings = paymentSettings();
  const requests = d.requests?.items || [];
  const rate = Number(settings?.usd_to_bdt_rate);
  const method = account.paymentMethod === "NAGAD" ? "NAGAD" : "BKASH";
  const cfg = settings?.[method.toLowerCase()] || null;
  const availableMethods = ["BKASH","NAGAD"].filter((m)=>settings?.[m.toLowerCase()]?.enabled && String(settings?.[m.toLowerCase()]?.number || "").trim());
  return \`
    \${pageTitle("add-credits","Add Credits","Top up your account balance using an administrator-configured payment method.")}
    <section class="ud-panel ud-topup-panel">
      <div class="ud-topup-section"><h2>1. Enter Balance Amount</h2><p>Enter the USD balance amount. The BDT equivalent uses the current administrator-configured conversion rate.</p>
        <div class="ud-amount-grid">
          <label><span>Balance Amount (USD) *</span><div class="ud-money-input"><b>$</b><input name="topup-usd-preview" id="topup-usd-preview" type="number" min="0.0001" max="1000000" step="0.0001" placeholder="0.00" form="topup-request-form"></div></label>
          <label><span>Equivalent in BDT \${Number.isFinite(rate) ? \`<em>Rate: 1 USD = ৳\${e(rate)}</em>\` : ""}</span><div class="ud-money-input bdt"><b>৳</b><input id="topup-bdt-preview" value="" placeholder="\${Number.isFinite(rate) ? "0.00" : "Rate unavailable"}" readonly></div></label>
        </div>
      </div>
      <div class="ud-topup-section"><h2>2. Select Payment Method *</h2><p>Only methods currently enabled by your administrator can be selected.</p>
        <div class="ud-payment-methods">
          \${["BKASH","NAGAD"].map((m)=>{
            const item=settings?.[m.toLowerCase()];
            const enabled=Boolean(item?.enabled && String(item?.number || "").trim());
            return button(\`<span class="ud-radio">\${method===m ? "●":"○"}</span><strong>\${m==="BKASH"?"bKash":"Nagad"}</strong><small>\${enabled ? "Available" : "Unavailable"}</small>\`,"payment-method",\`class="ud-payment-method \${method===m ? "selected":""}" data-method="\${m}" \${enabled ? "" : "disabled"}\`);
          }).join("")}
        </div>
        \${cfg && cfg.enabled && String(cfg.number||"").trim() ? \`<div class="ud-payment-details"><div><strong>\${method==="BKASH"?"bKash":"Nagad"} Payment Details</strong><small>Send your payment to this administrator-configured number:</small><code>\${e(cfg.number)}</code></div><ol>\${Array.isArray(cfg.instructions) && cfg.instructions.length ? cfg.instructions.map((line)=>\`<li>\${e(line)}</li>\`).join("") : "<li>No payment instructions have been configured.</li>"}</ol></div>\` : \`<div class="account-empty">No \${method==="BKASH"?"bKash":"Nagad"} destination is currently configured by the administrator.</div>\`}
      </div>
      <form id="topup-request-form" class="account-form ud-topup-form" data-account-form="topup"><fieldset \${account.busy || !availableMethods.includes(method) ? "disabled" : ""}>
        <input type="hidden" name="requested_credits" id="topup-requested-credits" value="">
        <input type="hidden" name="payment_method" value="\${method}">
        <div class="ud-topup-section"><h2>3. Payment Information</h2><p>Submit your transaction ID or payment reference for administrator verification.</p>
          \${area("Payment Note / Transaction ID / Reference *","payment_note",'required maxlength="1000" placeholder="Enter transaction ID, reference number, or payment note..."')}
          <div class="ud-proof-disabled"><strong>Proof of Payment</strong><span>Attachment upload is not enabled by the current account backend. ReVector will not pretend to upload a file.</span></div>
        </div>
        \${submit("Submit Top-up Request")}
      </fieldset></form>
    </section>
    <section class="ud-panel"><header><div><h2>Previous Balance Requests</h2><p>Your real top-up request history and administrator responses.</p></div></header>
      \${accountTable(["Amount (USD)","Equivalent (BDT)","Payment Method","Submitted","Status","Admin Response"],requests.filter(r=>r.type==="TOPUP").map(r=>[
        usd(r.payload?.requested_balance_usd ?? r.payload?.requested_credits),
        r.payload?.quoted_bdt == null ? "Unavailable" : bdt(r.payload.quoted_bdt),
        e(r.payload?.payment_method || "Unavailable"),
        date(r.created_at),
        userBadge(r.status),
        e(r.admin_response || "Awaiting review"),
      ]),"No top-up requests yet.")}
    </section>\`;
}
function usagePage(d) {
  const items=(d.usage?.items||[]).filter(v=>v.status!=="RESERVED");
  const charged=items.reduce((sum,v)=>sum+(Number(v.credits_charged)||0),0);
  const costs=items.map(v=>Number(v.estimated_usd_cost)).filter(Number.isFinite);
  const success=items.filter(v=>["SUCCEEDED","COMPLETED"].includes(String(v.status).toUpperCase())).length;
  const failed=items.filter(v=>String(v.status).toUpperCase()==="FAILED").length;
  return \`
    \${pageTitle("usage","Usage","View your operation history, charged balance, and recorded provider costs.")}
    <div class="ud-usage-metrics">
      \${metricCard("usage","Total Operations",e(items.length))}
      \${metricCard("wallet","Total Charged",usd(charged))}
      \${metricCard("balance","Estimated Provider Cost",costs.length ? usd(costs.reduce((a,b)=>a+b,0)) : "Unavailable")}
      \${metricCard("status","Successful Operations",e(success),"","teal")}
      \${metricCard("status","Failed Operations",e(failed),"","red")}
    </div>
    <section class="ud-panel"><header><div><h2>Operation History</h2><p>Actual provider/model identities and recorded charges. Failed operations are shown from the ledger and are not assigned invented costs.</p></div></header>
      \${accountTable(["Operation / Project","Provider / Model","Status / Mode","Est. Provider Cost","Charged Balance","Time"],usageRows(items),"No operations recorded yet.")}
    </section>\`;
}
function modelCard(model, selected) {
  return \`<label class="ud-model-card \${selected ? "selected":""}"><input type="radio" disabled \${selected ? "checked":""}><span class="ud-model-logo">◇</span><span><strong>\${e(model.display_name)}</strong><small>\${e(model.provider)} • \${e(model.model_id)}</small></span><em>\${e(model.pricing_version || "Pricing unavailable")}</em></label>\`;
}
function modelsPage(d) {
  const models=d.models?.items||[], pref=d.preferences?.items?.[0]||{}, requests=d.requests?.items||[];
  const analyzer=models.filter(m=>m.capability==="ANALYZER"), image=models.filter(m=>m.capability==="IMAGE");
  const choices=(type)=>[["","Auto — Engine Routing"],...models.filter(m=>m.capability===type).map(m=>[m.id,m.display_name+" · "+m.provider])];
  return \`
    \${pageTitle("models","Select Models","Set preferred analyzer and image models from the real enabled model catalog.")}
    <form class="account-form ud-model-preference-form" data-account-form="preferences"><fieldset \${account.busy ? "disabled":""}>
      <section class="ud-panel"><header><div><h2>Analyzer Model Preference</h2><p>Preferences guide routing; actual provider execution remains engine-controlled.</p></div></header>
        \${select("Analyzer Model","analyzer_model_id",choices("ANALYZER"),pref.analyzer_model_id)}
        <div class="ud-model-list">\${analyzer.length ? analyzer.map(m=>modelCard(m,pref.analyzer_model_id===m.id)).join("") : empty("No analyzer models are currently enabled.")}</div>
      </section>
      <section class="ud-panel"><header><div><h2>Image Model Preference</h2><p>Only models enabled in the real catalog are listed.</p></div></header>
        \${select("Image Model","image_model_id",choices("IMAGE"),pref.image_model_id)}
        <div class="ud-model-list">\${image.length ? image.map(m=>modelCard(m,pref.image_model_id===m.id)).join("") : empty("No image models are currently enabled.")}</div>
      </section>
      \${submit("Save Model Preferences")}
    </fieldset></form>
    <div class="ud-model-bottom">
      <section class="ud-panel"><header><div><h2>Request Additional Model or Provider</h2><p>Send a request to the administrator.</p></div></header>
        \${form("model-request",field("Model / Provider Name *","desired_model","text","",'required maxlength="200" placeholder="Provider or model name"')+select("Capability","capability",[["ANALYZER","Analyzer"],["IMAGE","Image generation"]])+area("Use Case / Reason *","reason",'required maxlength="1000"'),"Send Request")}
      </section>
      <section class="ud-panel"><header><div><h2>Previous Requests</h2><p>Your real model/provider requests and administrator responses.</p></div></header>
        \${accountTable(["Model / Provider","Use Case","Status","Submitted","Admin Response"],requests.filter(r=>r.type==="MODEL_CHANGE").map(r=>[
          e(r.payload?.desired_model||"Unavailable"),e(r.payload?.reason||"—"),userBadge(r.status),date(r.created_at),e(r.admin_response||"Awaiting review")
        ]),"No model requests yet.")}
      </section>
    </div>\`;
}
function ticketConversation() {
  const t=account.ticket;
  if(!t) return \`<div class="ud-ticket-empty">Select a support ticket to open its conversation.</div>\`;
  return \`<section class="ud-ticket-thread">
    <header><div><button type="button" data-account="close-ticket">←</button><span><h2>#\${e(String(t.id).slice(0,8))} — \${e(t.subject)}</h2><small>\${date(t.created_at)} • \${userBadge(t.status)}</small></span></div></header>
    <div class="ud-thread-messages">
      <article class="user"><strong>\${e(account.profile?.name||"You")}</strong><small>\${date(t.created_at)}</small><p>\${e(t.payload?.message||"")}</p></article>
      \${account.messages.map(m=>\`<article class="\${m.author_role==="USER"?"user":"support"}"><strong>\${e(m.author_role==="USER"?(account.profile?.name||"You"):"ReVector Support")}</strong><small>\${date(m.created_at)}</small><p>\${e(m.message)}</p></article>\`).join("")}
      \${t.admin_response && !account.messages.some(m=>m.message===t.admin_response) ? \`<article class="support"><strong>ReVector Support</strong><p>\${e(t.admin_response)}</p></article>\`:""}
    </div>
    \${form("support-message",\`<input type="hidden" name="request_id" value="\${e(t.id)}">\`+area("Reply","message",'placeholder="Type a message..."'),"Send Message")}
  </section>\`;
}
function supportPage(d) {
  const requests=(d.requests?.items||[]).filter(r=>r.type==="SUPPORT");
  return \`
    \${pageTitle("support","Support","Submit a ticket, track your requests, and continue real support conversations.")}
    <div class="ud-support-layout">
      <div>
        <section class="ud-panel"><header><div><h2>My Support Tickets</h2><p>View and manage your support requests.</p></div></header>
          \${accountTable(["Subject","Status","Priority","Updated",""],ticketRows(requests),"No support tickets yet.")}
        </section>
        <section class="ud-panel"><header><div><h2>Submit a New Support Ticket</h2><p>Describe the issue and the support team can reply inside this conversation.</p></div></header>
          \${form("support",field("Subject *","subject","text","",'required maxlength="160" placeholder="Enter a short description"')+select("Category","category",["TECHNICAL","VECTOR_QUALITY","BILLING","CREDITS","MODEL","ACCOUNT","OTHER"].map(v=>[v,v.replaceAll("_"," ")]))+select("Priority","priority",[["LOW","Low"],["NORMAL","Normal"],["HIGH","High"]],"NORMAL")+area("Description *","message",'placeholder="Describe the issue, expected result, and relevant errors."'),"Submit Ticket")}
        </section>
      </div>
      \${ticketConversation()}
    </div>\`;
}
function userContent(page) {
  const d=account.data,p=account.profile,w=d.wallet?.items?.[0],models=d.models?.items||[];
  if(!p) return empty("Sign in to view your private account data.");
  if(page==="dashboard") return dashboardPage(d,p,w,models);
  if(page==="profile") return profilePage(p);
  if(page==="balance") return balancePage(d,w);
  if(page==="add-credits") return topupPage(d);
  if(page==="usage") return usagePage(d);
  if(page==="models") return modelsPage(d);
  if(page==="support") return supportPage(d);
  return empty("This account page does not exist.");
}
export function accountMarkup() {
  const page=accountPage();
  if(!page) return null;
  if(page==="login") return login();
  if(account.configured===false)
    return \`<div class="account-layout"><header><a href="/" data-account="nav">ReVector</a></header><main>\${panel("Account services unavailable",'<p>Account services need server-side configuration.</p><a href="/" data-account="nav">Return to production</a>')}</main></div>\`;
  const p=account.profile, setupRequired=profileSetupRequired();
  return \`<div class="account-layout user-dashboard-shell">
    <header class="ud-topbar">
      <a class="ud-brand" href="\${setupRequired?"/dashboard/profile":"/"}" data-account="nav"><img src="/assets/revector-ai-logo.svg" alt=""><span><strong>ReVector <em>AI</em></strong><small>Turn jersey artwork into production-ready vectors</small></span></a>
      \${accountStatusCards()}
      <div class="ud-top-actions">\${button("⌕","refresh",'class="ud-icon-button" aria-label="Refresh dashboard"')}\${profileMenu()}</div>
    </header>
    <div class="ud-shell">
      <main class="account-main ud-main">
        \${account.error ? \`<p class="account-error" role="alert">\${e(account.error)}</p>\`:""}
        \${account.notice ? \`<p class="account-notice" role="status">\${e(account.notice)}</p>\`:""}
        \${account.busy ? '<div class="ud-loading" role="status">Loading real account data…</div>':""}
        \${userContent(page)}
        \${!setupRequired && ["usage","balance","support","models"].includes(page) ? \`<div class="account-pager">\${button("Previous","previous",account.offset===0?"disabled":"")}<span>Page \${account.offset/50+1}</span>\${button("Next","next",(account.data[page==="balance"?"transactions":page==="models"?"requests":page]?.items||[]).length<50?"disabled":"")}</div>\`:""}
      </main>
      \${userSidebar(page,setupRequired)}
    </div>
  </div>\`;
}

