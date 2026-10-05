import {
  account,
  currentPath,
  accountPage,
  profileSetupRequired,
} from "./account-model.js";
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
async function accountUpload(path, file) {
  if (!(file instanceof File) || !file.size)
    throw new Error("Choose a profile picture.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Use a JPG, PNG, or WEBP profile picture.");
  if (file.size > 3 * 1024 * 1024)
    throw new Error("Profile picture must be 3 MB or smaller.");
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": file.type },
      body: file,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      typeof navigator !== "undefined" && !navigator.onLine
        ? "No internet connection. Profile picture was not uploaded."
        : "Profile picture upload could not reach the account service.",
    );
  }
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Profile picture service returned an invalid response.");
  }
  if (!response.ok)
    throw Object.assign(
      new Error(data.error?.message || "Profile picture could not be uploaded."),
      { status: response.status, code: data.error?.code },
    );
  return data;
}
export async function navigateAccount(path) {
  if (!/^\/(?:dashboard(?:\/[^?#]*)?|login)?$/.test(path)) return;
  if (
    profileSetupRequired() &&
    path.startsWith("/dashboard") &&
    path !== "/dashboard/profile"
  )
    path = "/dashboard/profile";
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
    account.setupPrompt =
      Boolean(result.profile_setup_required) && currentPath() === "/";
  } catch {
    account.configured = null;
  }
  if (token && params.get("type") === "invite") {
    history.replaceState({}, "", "/login");
    await guarded(async () => {
      const data = await accountRequest("/api/auth/invitation", "POST", {
        token_hash: token,
      });
      account.profile = data.profile;
      account.setupPrompt = true;
      history.replaceState({}, "", "/");
      account.notice =
        "Invitation accepted. Complete your profile before using ReVector.";
    });
  } else if (
    typeof location !== "undefined" &&
    location.hash.includes("access_token")
  ) {
    history.replaceState({}, "", currentPath());
    account.error = "Use the secure invitation link provided by the owner.";
  }
  if (
    profileSetupRequired() &&
    currentPath().startsWith("/dashboard") &&
    currentPath() !== "/dashboard/profile"
  )
    history.replaceState({}, "", "/dashboard/profile");
  await loadAccountPage();
  redraw();
}
export async function loadAccountPage() {
  const page = accountPage();
  if (!page || page === "login" || account.configured === false) return;
  await guarded(async () => {
    const offset = "?offset=" + account.offset;
    if (!account.profile) return;
    if (profileSetupRequired() && page !== "profile") {
      history.replaceState({}, "", "/dashboard/profile");
      account.data = {};
      redraw();
      return;
    }
    const pages = {
      dashboard: ["wallet", "usage", "models", "preferences"],
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
  if (action === "logout")
    return guarded(async () => {
      await accountRequest("/api/auth/logout", "POST", {});
      account.profile = null;
      try {
        localStorage.removeItem("revector.project");
        localStorage.removeItem("revector.active-job");
      } catch {}
      location.assign("/");
    });
  if (action === "close-ticket") {
    account.ticket = null;
    account.messages = [];
    redraw();
    return;
  }
  const requests = account.data.requests?.items || [];
  if (action === "ticket")
    return guarded(async () => {
      account.ticket = requests.find((r) => r.id === target.dataset.id);
      account.messages = (
        await accountRequest(
          "/api/account" +
            "/support/messages?request_id=" +
            encodeURIComponent(target.dataset.id),
        )
      ).items;
    });
}
export async function accountSubmit(element) {
  const type = element.dataset.accountForm;
  const formData = new FormData(element);
  const data = Object.fromEntries(formData);
  await guarded(async () => {
    let result;
    if (type === "login") {
      result = await accountRequest("/api/auth/login", "POST", data);
      account.profile = result.profile;
      account.setupPrompt = profileSetupRequired();
      account.notice = "";
      location.assign("/");
      return;
    }
    if (type === "onboarding") {
      const password = String(data.password || "");
      const confirm = String(data.confirm_password || "");
      if (password.length < 12)
        throw new Error("Your new password must be at least 12 characters.");
      if (password !== confirm) throw new Error("Passwords do not match.");
      result = await accountRequest("/api/account/profile", "PATCH", {
        name: String(data.name || ""),
        company: String(data.company || ""),
      });
      account.profile = result.profile;
      result = await accountUpload("/api/account/avatar", data.avatar);
      account.profile = result.profile;
      result = await accountRequest("/api/auth/password", "POST", { password });
      if (result.profile) account.profile = result.profile;
      result = await accountRequest("/api/account/profile/complete", "POST", {});
      account.profile = result.profile;
      account.avatarVersion++;
      account.setupPrompt = false;
      account.notice = "Profile setup complete. ReVector is ready.";
      location.assign("/");
      return;
    }
    if (type === "avatar") {
      result = await accountUpload("/api/account/avatar", data.avatar);
      account.profile = result.profile;
      account.avatarVersion++;
      account.notice = "Profile picture updated.";
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
      if (type === "password" && result.profile) account.profile = result.profile;
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
    else throw new Error("This action is unavailable.");
    account.notice = "Saved successfully.";
    account.ticket = null;
    await loadAccountPage();
  });
}
