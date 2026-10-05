export const account = {
  revision: 0,
  configured: null,
  profile: null,
  menu: false,
  setupPrompt: false,
  avatarVersion: 0,
  busy: false,
  error: "",
  notice: "",
  data: {},
  ticket: null,
  messages: [],
  offset: 0,
  paymentMethod: "BKASH",
  system: null,
  ai: null,
};
export const userPages = [
  ["profile", "Profile"],
  ["balance", "Balance"],
  ["add-credits", "Add Credits"],
  ["usage", "Usage"],
  ["models", "Select Models"],
  ["support", "Support"],
];
export function currentPath() {
  return typeof location !== "undefined" ? location.pathname || "/" : "/";
}
export function accountPage() {
  const path = currentPath();
  return path.startsWith("/dashboard")
    ? path.split("/")[2] || "dashboard"
    : path === "/login"
      ? "login"
      : null;
}

export function profileSetupRequired() {
  if (account.profile?.role !== "USER") return false;
  if (
    !Object.prototype.hasOwnProperty.call(
      account.profile || {},
      "profile_completed_at",
    )
  )
    return false;
  return !account.profile.profile_completed_at;
}
