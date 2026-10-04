const API = "/api/revector";
const types = [
  "unknown",
  "front_body",
  "back_body",
  "left_sleeve",
  "right_sleeve",
  "front_collar",
  "back_collar",
  "left_shoulder",
  "right_shoulder",
  "left_cuff",
  "right_cuff",
  "trim",
  "other_part",
];
const stages = ["Input", "Analyze", "Detect Parts", "Vectorize", "Validate", "Download"];
const expectedSlots = [
  { key: "left_sleeve", label: "Left Sleeve", type: "left_sleeve" },
  { key: "right_sleeve", label: "Right Sleeve", type: "right_sleeve" },
  { key: "front_body", label: "Front Body", type: "front_body" },
  { key: "back_body", label: "Back Body", type: "back_body" },
  { key: "front_collar", label: "Front Collar", type: "front_collar" },
  { key: "back_collar", label: "Back Collar", type: "back_collar" },
  { key: "top_trim", label: "Top Trim", type: "trim", nameHint: "top" },
  { key: "bottom_trim", label: "Bottom Trim", type: "trim", nameHint: "bottom" },
];
const safeBusyActions = new Set([
  "cancel",
  "dismiss-error",
  "menu-toggle",
  "assistant-toggle",
  "assistant-send",
  "select-part",
  "review-view",
  "report",
]);
const state = {
  project: null,
  selected: null,
  step: 0,
  preset: "BALANCED",
  mode: "color",
  view: "vector",
  busy: false,
  job: null,
  operation: "",
  operationDetail: "",
  error: null,
  health: null,
  connecting: true,
  connections: { server: "pending", engine: "pending", tool: "pending" },
  connectionMessage: "",
  selectedExports: new Set(),
  downloadFormats: new Set(["svg"]),
  draw: null,
  drawSlot: null,
  points: [],
  cancel: false,
  requirements: [],
  layers: [],
  shape: null,
  editSvg: null,
  blankSlots: new Set(),
  menuOpen: false,
  assistantOpen: false,
  assistantMessages: [],
  networkOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  uploadMeta: null,
};
const app = document.querySelector("#app");
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const label = (s) =>
  String(s || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const iconPaths = {
  pen: "m4 16-1 5 5-1L20 8l-4-4L4 16Zm11-11 4 4",
  upload: "M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4",
  download: "M12 4v12m-4-4 4 4 4-4M4 18v3h16v-3",
  check: "m5 12 4 4 10-10",
  chevron: "m9 5 7 7-7 7",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  layers: "M12 3 2 8l10 5 10-5-10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
  plus: "M12 4v16M4 12h16",
  ruler: "M3 5h18v14H3V5Zm4 0v6m5-6v4m5-4v6",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M3 12h2m14 0h2M12 3v2m0 14v2",
  menu: "M4 7h16M4 12h16M4 17h16",
  trash: "M4 7h16m-10 4v6m4-6v6M9 7V4h6v3m-9 0 1 14h10l1-14",
  refresh: "M20 6v5h-5M4 18v-5h5M6.5 9a7 7 0 0 1 11.8-2.2L20 11M4 13l1.7 4.2A7 7 0 0 0 17.5 15",
  spark: "m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Zm6 11 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z",
  alert: "M12 3 2.5 20h19L12 3Zm0 6v5m0 3v.01",
  close: "M6 6l12 12M18 6 6 18",
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPaths[name] || iconPaths.layers}"/></svg>`;
const badge = (text, tone = "") =>
  `<span class="badge ${tone}">${escape(text)}</span>`;
const btn = (text, action, tone = "", disabled = false, extra = "") => {
  const blocked = disabled || (state.busy && !safeBusyActions.has(action));
  return `<button class="${tone}" data-action="${action}" ${blocked ? "disabled" : ""} ${extra}>${text}</button>`;
};
const field = (title, name, value, type = "text", extra = "") =>
  `<label>${escape(title)}<input name="${name}" type="${type}" value="${escape(value)}" ${extra} ${state.busy ? "disabled" : ""}></label>`;
const checkbox = (title, name, checked, disabled = false) =>
  `<label class="checkbox"><input type="checkbox" name="${name}" ${checked ? "checked" : ""} ${state.busy || disabled ? "disabled" : ""}>${escape(title)}</label>`;
const part = () => state.project?.parts.find((p) => p.part_id === state.selected);
const ready = () => state.project?.true_vector_ready === true;
function artifact(key) {
  if (!key || !state.project) return "";
  const prefix = `projects/${state.project.project_id}/`;
  if (!key.startsWith(prefix)) return "";
  return `${API}/projects/${encodeURIComponent(state.project.project_id)}/artifacts/${key
    .slice(prefix.length)
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?v=${encodeURIComponent(state.project.updated_at)}`;
}
const picture = (key, alt, cls = "") =>
  key ? `<img class="${cls}" src="${artifact(key)}" alt="${escape(alt)}">` : "";
const dimensions = (p) => {
  if (!p) return "Not available";
  if (p.physical_width_mm)
    return `${p.physical_width_mm} × ${p.physical_height_mm} mm`;
  if (p.bbox?.length >= 4) return `${p.bbox[2]} × ${p.bbox[3]} px · uncalibrated`;
  return "Dimensions not available";
};
function toast(message) {
  const t = document.querySelector("#toast");
  if (!t) return;
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 4500);
}
function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Not available";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
function slotForPart(pp) {
  if (!pp) return null;
  const direct = expectedSlots.find((slot) => slot.type === pp.type && slot.type !== "trim");
  if (direct) return direct.key;
  if (pp.type !== "trim") return null;
  const name = String(pp.name || "").toLowerCase();
  if (name.includes("top")) return "top_trim";
  if (name.includes("bottom")) return "bottom_trim";
  return null;
}
function partForSlot(slotKey) {
  return state.project?.parts.find((pp) => slotForPart(pp) === slotKey) || null;
}
function normalizeEngineState(value, fallbackLabel = "Inactive") {
  const raw = typeof value === "string" ? value : value?.status || value?.state;
  const normalized = String(raw || "").toLowerCase();
  if (["active", "connected", "ready", "processing", "running"].includes(normalized))
    return { tone: "success", label: normalized === "processing" || normalized === "running" ? "Active · Processing" : "Active" };
  if (["degraded", "fallback", "backup"].includes(normalized))
    return { tone: "warning", label: "Degraded · Backup Processing" };
  if (["error", "failed", "unavailable"].includes(normalized))
    return { tone: "error", label: "Error" };
  return { tone: "neutral", label: fallbackLabel };
}
function aiEngineStatus(kind) {
  const health = state.health || {};
  const groups = [health.ai, health.ai_engines, health.providers, health.aiProviders].filter(Boolean);
  const aliases = kind === "primary" ? ["primary", "primary_ai", "openai"] : ["fallback", "fallback_ai", "backup", "cloudflare"];
  let value = null;
  for (const group of groups) {
    for (const alias of aliases) {
      if (group?.[alias] !== undefined) {
        value = group[alias];
        break;
      }
    }
    if (value !== null) break;
  }
  if (value === null) return normalizeEngineState(null, kind === "primary" ? "Inactive" : "Not configured");
  return normalizeEngineState(value, "Inactive");
}
function presetUiName(value) {
  return { FAST: "LOW", BALANCED: "MEDIUM", ULTRA: "MAX" }[value] || null;
}
function loadLocalProjectMeta(projectId) {
  if (!projectId) return;
  try {
    const raw = localStorage.getItem(`revector.meta.${projectId}`);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.uploadMeta = saved.uploadMeta || null;
    state.requirements = Array.isArray(saved.requirements) ? saved.requirements : state.requirements;
    state.blankSlots = new Set(Array.isArray(saved.blankSlots) ? saved.blankSlots : []);
  } catch {}
}
function saveLocalProjectMeta() {
  const projectId = state.project?.project_id;
  if (!projectId) return;
  try {
    localStorage.setItem(
      `revector.meta.${projectId}`,
      JSON.stringify({
        uploadMeta: state.uploadMeta,
        requirements: state.requirements,
        blankSlots: [...state.blankSlots],
      }),
    );
  } catch {}
}
function clearLocalProjectMeta(projectId) {
  if (!projectId) return;
  try {
    localStorage.removeItem(`revector.meta.${projectId}`);
  } catch {}
}

export {
  API,
  types,
  stages,
  expectedSlots,
  safeBusyActions,
  state,
  app,
  escape,
  label,
  icon,
  badge,
  btn,
  field,
  checkbox,
  part,
  ready,
  artifact,
  picture,
  dimensions,
  toast,
  formatBytes,
  slotForPart,
  partForSlot,
  aiEngineStatus,
  presetUiName,
  loadLocalProjectMeta,
  saveLocalProjectMeta,
  clearLocalProjectMeta,
};
