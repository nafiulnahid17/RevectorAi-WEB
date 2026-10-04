import { account, currentPath, accountPage } from "./account-model.js";
let redraw = () => {};
export function registerAccountRenderer(renderer) {
  redraw = () => {
    account.revision++;
    renderer();
  };
}
export async function accountRequest(path, method = "GET", body) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error(
      typeof navigator !== "undefined" && !navigator.onLine
        ? "No internet connection. Account changes have not been submitted."
        : "Account service could not be reached. Retry when the connection returns.",
    );
  }
  let data;
  try {
    const raw = await response.text();
    if (raw.length > 1024 * 1024) throw new Error();
    data = JSON.parse(raw);
  } catch {
    throw new Error("Account service returned an invalid response.");
  }
  if (!response.ok)
    throw Object.assign(
      new Error(data.error?.message || "Account request failed."),
      { status: response.status, code: data.error?.code },
    );
  return data;
}
export async function navigateAccount(path) {
  if (!/^\/(?:dashboard(?:\/[^?#]*)?|admin(?:\/[^?#]*)?|login)?$/.test(path))
    return;
  history.pushState({}, "", path);
  account.menu = false;
  account.error = "";
  account.notice = "";
  account.ticket = null;
  account.editUser = null;
  account.editModel = null;
  account.offset = 0;
  account.data = {};
  redraw();
  await loadAccountPage();
  if (path === "/")
    window.dispatchEvent(new CustomEvent("revector:open-workspace"));
}
async function guarded(work) {
  account.busy = true;
  account.error = "";
  redraw();
  try {
    return await work();
  } catch (e) {
    account.error = e.message;
    if (
      e.status === 401 &&
      currentPath().startsWith("/admin") &&
      currentPath() !== "/admin/login"
    ) {
      account.adminProfile = null;
      history.replaceState({}, "", "/admin/login");
    }
    return null;
  } finally {
    account.busy = false;
    redraw();
  }
}
export async function initializeAccount() {
  const params = new URLSearchParams(
    typeof location !== "undefined" ? location.search : "",
  );
  const token = params.get("token_hash");
  if (token) history.replaceState({}, "", currentPath());
  try {
    const result = await accountRequest("/api/account/bootstrap");
    account.configured = result.configured;
    account.profile = result.profile;
  } catch {
    account.configured = null;
  }
  if (currentPath().startsWith("/admin") && currentPath() !== "/admin/login") {
    try {
      account.adminProfile = (
        await accountRequest("/api/admin/session")
      ).profile;
    } catch (e) {
      account.error = e.message;
      history.replaceState({}, "", "/admin/login");
    }
  }
  if (account.configured === true && !account.profile && currentPath() === "/")
    history.replaceState({}, "", "/login");
  if (token && params.get("type") === "invite") {
    history.replaceState({}, "", "/login");
    await guarded(async () => {
      const data = await accountRequest("/api/auth/invitation", "POST", {
        token_hash: token,
      });
      account.profile = data.profile;
      history.replaceState({}, "", "/dashboard/profile");
      account.notice = "Invitation accepted. Set your password.";
    });
  } else if (
    typeof location !== "undefined" &&
    location.hash.includes("access_token")
  ) {
    history.replaceState({}, "", currentPath());
    account.error = "Use the secure invitation link provided by the owner.";
  }
  await loadAccountPage();
  redraw();
}
export async function loadAccountPage() {
  const page = accountPage();
  if (
    !page ||
    ["login", "admin-login"].includes(page) ||
    account.configured === false
  )
    return;
  await guarded(async () => {
    const offset = "?offset=" + account.offset;
    if (currentPath().startsWith("/admin")) {
      if (!account.adminProfile)
        account.adminProfile = (
          await accountRequest("/api/admin/session")
        ).profile;
      if (account.adminProfile.role === "SUPPORT" && page !== "support") {
        history.replaceState({}, "", "/admin/support");
        return loadAccountPage();
      }
      if (page === "settings") {
        const [settings, catalog] = await Promise.all([
          accountRequest("/api/admin/settings"),
          accountRequest("/api/admin/models"),
        ]);
        account.data = { settings, catalog: catalog.items };
      } else if (["credits", "models"].includes(page)) {
        const [requests, catalog] = await Promise.all([
          accountRequest(
            "/api/admin/requests" +
              offset +
              "&type=" +
              (page === "credits" ? "TOPUP" : "MODEL_CHANGE"),
          ),
          accountRequest("/api/admin/models"),
        ]);
        account.data = { items: requests.items, catalog: catalog.items };
      } else account.data = await accountRequest("/api/admin/" + page + offset);
      return;
    }
    if (!account.profile) return;
    const pages = {
      dashboard: ["wallet", "usage"],
      balance: ["wallet", "transactions"],
      "add-credits": ["requests"],
      usage: ["usage"],
      models: ["models", "preferences", "requests"],
      support: ["requests"],
      profile: [],
    };
    const pairs = await Promise.all(
      (pages[page] || []).map(async (key) => [
        key,
        await accountRequest("/api/account/" + key + offset),
      ]),
    );
    account.data = Object.fromEntries(pairs);
    if (pairs.some(([, data]) => data.accounting_warning))
      account.notice =
        "Some completed usage is awaiting reconciliation. Current records are shown; refresh after the engine reconnects.";
  });
}
export async function accountClick(target) {
  const action = target.dataset.account;
  if (action === "menu") {
    account.menu = !account.menu;
    redraw();
    return;
  }
  if (action === "nav")
    return navigateAccount(
      target.dataset.url || new URL(target.href, location.origin).pathname,
    );
  if (action === "refresh") return loadAccountPage();
  if (action === "next" || action === "previous") {
    account.offset = Math.max(
      0,
      account.offset + (action === "next" ? 50 : -50),
    );
    return loadAccountPage();
  }
  if (action === "logout" || action === "admin-logout")
    return guarded(async () => {
      await accountRequest(
        action === "logout" ? "/api/auth/logout" : "/api/admin/auth/logout",
        "POST",
        {},
      );
      account.profile = null;
      account.adminProfile = null;
      try {
        localStorage.removeItem("revector.project");
        localStorage.removeItem("revector.active-job");
      } catch {}
      location.assign(action === "logout" ? "/login" : "/admin/login");
    });
  if (action === "close-ticket") {
    account.ticket = null;
    account.messages = [];
    redraw();
    return;
  }
  if (action === "edit-wallet" || action === "edit-status") {
    account.editUser = target.dataset.id;
    redraw();
    return;
  }
  if (action === "edit-model") {
    account.editModel = account.data.catalog.find(
      (m) => m.id === target.dataset.id,
    );
    redraw();
    return;
  }
  const admin = currentPath().startsWith("/admin");
  const requests = admin
    ? account.data.items || []
    : account.data.requests?.items || [];
  if (action === "review-request") {
    account.ticket = requests.find((r) => r.id === target.dataset.id);
    redraw();
    return;
  }
  if (action === "ticket")
    return guarded(async () => {
      account.ticket = requests.find((r) => r.id === target.dataset.id);
      account.messages = (
        await accountRequest(
          (admin ? "/api/admin" : "/api/account") +
            "/support/messages?request_id=" +
            encodeURIComponent(target.dataset.id),
        )
      ).items;
    });
}
const operationKeys = new Map();
function idempotency(action, data) {
  const fingerprint = JSON.stringify(data);
  const existing = operationKeys.get(action);
  if (existing?.fingerprint === fingerprint) return existing.key;
  const key = crypto.randomUUID();
  operationKeys.set(action, { fingerprint, key });
  return key;
}
export async function accountSubmit(element) {
  const type = element.dataset.accountForm;
  const data = Object.fromEntries(new FormData(element));
  await guarded(async () => {
    let result;
    if (type === "login" || type === "admin-login") {
      result = await accountRequest(
        type === "admin-login" ? "/api/admin/auth/login" : "/api/auth/login",
        "POST",
        data,
      );
      if (type === "admin-login") account.adminProfile = result.profile;
      else account.profile = result.profile;
      history.replaceState(
        {},
        "",
        type === "admin-login"
          ? result.profile.role === "SUPPORT"
            ? "/admin/support"
            : "/admin"
          : "/",
      );
      account.notice = "";
      redraw();
      if (type === "login") {
        location.assign("/");
        return;
      }
      await loadAccountPage();
      return;
    }
    const userRoutes = {
      profile: ["/api/account/profile", "PATCH"],
      password: ["/api/auth/password", "POST"],
      preferences: ["/api/account/preferences", "PUT"],
    };
    if (type in userRoutes) {
      const [url, method] = userRoutes[type];
      result = await accountRequest(url, method, data);
      if (type === "profile") account.profile = result.profile;
    } else if (["topup", "model-request", "support"].includes(type)) {
      if (type === "topup") {
        data.type = "TOPUP";
        data.requested_credits = Number(data.requested_credits);
      }
      if (type === "model-request") data.type = "MODEL_CHANGE";
      if (type === "support") data.type = "SUPPORT";
      await accountRequest("/api/account/requests", "POST", data);
    } else if (type === "support-message")
      await accountRequest("/api/account/support/message", "POST", data);
    else if (type === "support-reply")
      await accountRequest("/api/admin/support/reply", "POST", data);
    else if (type === "adjust") {
      data.delta = Number(data.delta);
      data.idempotency_key = idempotency(type, data);
      await accountRequest("/api/admin/wallet/adjust", "POST", data);
    } else if (type === "decision") {
      data.idempotency_key = idempotency(type, data);
      await accountRequest("/api/admin/requests/decide", "POST", data);
    } else if (type === "status")
      await accountRequest("/api/admin/users/status", "POST", data);
    else if (type === "catalog") {
      try {
        data.operation_prices = JSON.parse(data.operation_prices);
      } catch {
        throw new Error("Enter a valid JSON object of operation prices.");
      }
      data.enabled = data.enabled === "true";
      await accountRequest("/api/admin/models/update", "POST", data);
    } else throw new Error("This action is unavailable.");
    operationKeys.delete(type);
    account.notice = "Saved successfully.";
    account.ticket = null;
    account.editModel = null;
    account.editUser = null;
    await loadAccountPage();
  });
}
