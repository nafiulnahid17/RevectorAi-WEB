export const account = {
  revision: 0,
  configured: null,
  profile: null,
  adminProfile: null,
  menu: false,
  busy: false,
  error: "",
  notice: "",
  data: {},
  ticket: null,
  messages: [],
  offset: 0,
};
export const userPages = [
  ["profile", "Profile"],
  ["balance", "Balance"],
  ["add-credits", "Add Credits"],
  ["usage", "Usage"],
  ["models", "Select Models"],
  ["support", "Support"],
];
export const adminPages = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["wallets", "Wallet / Balances"],
  ["credits", "Credit Requests"],
  ["usage", "Usage Logs"],
  ["models", "Model Requests"],
  ["support", "Support Inbox"],
  ["audit", "Audit Log"],
  ["settings", "Settings"],
];
export function currentPath() {
  return typeof location !== "undefined" ? location.pathname || "/" : "/";
}
export function accountPage() {
  const path = currentPath();
  return path.startsWith("/admin")
    ? path === "/admin/login"
      ? "admin-login"
      : path.split("/")[2] || "overview"
    : path.startsWith("/dashboard")
      ? path.split("/")[2] || "dashboard"
      : path === "/login"
        ? "login"
        : null;
}
