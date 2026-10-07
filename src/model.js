const API = "/api/revector";

const DEFAULT_PART_DIMENSIONS = Object.freeze({
  widthMm: 558.8,
  heightMm: 787.4,
  chestCm: 55.88,
  lengthCm: 78.74,
  chestIn: 22,
  lengthIn: 31,
});


const types = [
  "unknown",
  "front_body",
  "back_body",
  "left_sleeve",
  "right_sleeve",
  "front_collar",
  "back_collar",
  "top_trim",
  "bottom_trim",
  "left_shoulder",
  "right_shoulder",
  "left_cuff",
  "right_cuff",
  "left_side_panel",
  "right_side_panel",
  "pocket",
  "trim",
  "other_part",
];

const stages = ["Input", "Analyze", "Detect Parts", "Vectorize", "Validate", "Download"];

const expectedSlots = [
  { key: "LEFT_SLEEVE", label: "Left Sleeve", type: "left_sleeve" },
  { key: "RIGHT_SLEEVE", label: "Right Sleeve", type: "right_sleeve" },
  { key: "FRONT_BODY", label: "Front Body", type: "front_body" },
  { key: "BACK_BODY", label: "Back Body", type: "back_body" },
  { key: "FRONT_COLLAR", label: "Front Collar", type: "front_collar" },
  { key: "BACK_COLLAR", label: "Back Collar", type: "back_collar" },
  { key: "TOP_TRIM", label: "Top Trim Strip", type: "top_trim" },
  { key: "BOTTOM_TRIM", label: "Bottom Trim Strip", type: "bottom_trim" },
];

const safeBusyActions = new Set([
  "cancel",
  "dismiss-error",
  "menu-toggle",
  "assistant-toggle",
  "assistant-no",
  "assistant-help",
  "assistant-action",
  "assistant-send",
  "select-part",
  "review-view",
  "vector-toggle",
  "vector-zoom-in",
  "vector-zoom-out",
  "vector-fit",
  "mockup-background",
  "mockup-lighting",
  "mockup-fullscreen",
  "detect-view",
  "detect-fullscreen",
  "report",
  "navigate",
  "retry-connection",
  "view-error-details",
]);

const state = {
  initialBootstrap: !globalThis.REVECTOR_PRERENDER,
  project: null,
  selected: null,
  selectedSlot: null,
  step: 0,
  preparationView: "analyze",
  preset: "BALANCED",
  mode: "color",
  view: "vector",
  busy: false,
  job: null,
  operation: "",
  operationDetail: "",
  lastStageRequest: null,
  error: null,
  assistantAdvice: null,
  assistantOpen: false,
  assistantMinimized: false,
  assistantMessages: [],
  menuOpen: false,
  health: null,
  aiCapabilities: null,
  connecting: true,
  connections: { server: "pending", engine: "pending", tool: "pending" },
  connectionMessage: "",
  networkOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  reconnecting: false,
  selectedExports: new Set(),
  selectionInitialized: false,
  downloadFormats: new Set(["svg"]),
  draw: null,
  drawSlot: null,
  points: [],
  cancel: false,
  requirements: [],
  shape: null,
  editSvg: null,
  vectorZoom: 1,
  vectorShowPaths: true,
  vectorShowLabels: true,
  vectorStats: null,
  shapeMeta: null,
  mockupBackground: "navy",
  mockupLighting: "neutral",
  detectView: "pattern",
  uploadMeta: null,
  originalView: false,
  autoGeometry: false,
  projectName: "",
  voice: {
    spokenErrors: new Set(),
    validationSpokenFor: null,
  },
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
  plus: "M12 4v16M4 12h16",
  ruler: "M3 5h18v14H3V5Zm4 0v6m5-6v4m5-4v6",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M3 12h2m14 0h2M12 3v2m0 14v2",
  menu: "M4 7h16M4 12h16M4 17h16",
  trash: "M4 7h16m-10 4v6m4-6v6M9 7V4h6v3m-9 0 1 14h10l1-14",
  refresh: "M20 6v5h-5M4 18v-5h5M6.5 9a7 7 0 0 1 11.8-2.2L20 11M4 13l1.7 4.2A7 7 0 0 0 17.5 15",
  spark: "m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Zm6 11 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z",
  alert: "M12 3 2.5 20h19L12 3Zm0 6v5m0 3v.01",
  close: "M6 6l12 12M18 6 6 18",
  wifi: "M4.9 9.8a10.4 10.4 0 0 1 14.2 0M7.8 13a6.2 6.2 0 0 1 8.4 0M10.7 16.1a2.1 2.1 0 0 1 2.6 0M12 20h.01",
  file: "M6 3h8l4 4v14H6V3Zm8 0v5h5",
};

const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPaths[name] || iconPaths.file}"/></svg>`;

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

const part = () => state.project?.parts?.find((p) => p.part_id === state.selected) || null;
const ready = () =>
  state.project?.true_vector_ready === true &&
  state.project?.validation?.status === "PASS";

function artifact(key) {
  if (!key || !state.project) return "";
  const prefix = `projects/${state.project.project_id}/`;
  if (!key.startsWith(prefix)) return "";
  return `${API}/projects/${encodeURIComponent(state.project.project_id)}/artifacts/${key
    .slice(prefix.length)
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?v=${encodeURIComponent(state.project.updated_at || "")}`;
}

const picture = (key, alt, cls = "") =>
  key ? `<img class="${cls}" src="${artifact(key)}" alt="${escape(alt)}">` : "";

const dimensions = (p) => {
  if (!p) return "Not available";
  if (p.physical_width_mm && p.physical_height_mm)
    return `${p.physical_width_mm} x ${p.physical_height_mm} mm`;
  if (p.bbox?.length >= 4) return `${p.bbox[2]} x ${p.bbox[3]} px - uncalibrated`;
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

function slotDefinition(slotKey) {
  return expectedSlots.find((slot) => slot.key === slotKey) || null;
}

function slotForPart(pp) {
  if (!pp) return null;
  const direct = expectedSlots.find((slot) => slot.type === pp.type);
  return direct?.key || null;
}

function slotState(slotKey) {
  const backend = state.project?.slots?.[slotKey];
  if (backend) return backend;
  return {
    part_type: slotKey,
    status: "missing",
    part_id: null,
    ai_confidence: null,
    candidate_bbox: null,
    notes: [],
  };
}

function partForSlot(slotKey) {
  const slot = slotState(slotKey);
  if (slot.part_id)
    return state.project?.parts?.find((pp) => pp.part_id === slot.part_id) || null;
  const def = slotDefinition(slotKey);
  return state.project?.parts?.find((pp) => pp.type === def?.type) || null;
}

function slotLabel(status) {
  return {
    detected: "Detected",
    missing: "Missing",
    uncertain: "Review Required",
    manual: "Manual",
    ai_reconstructed: "Reconstructed",
    confirmed: "Confirmed",
    blank: "Left Blank",
  }[status] || label(status);
}

function slotTone(status) {
  return {
    detected: "purple",
    missing: "warning",
    uncertain: "warning",
    manual: "purple",
    ai_reconstructed: "purple",
    confirmed: "success",
    blank: "neutral",
  }[status] || "";
}

function aiUsage(kind) {
  const metadata = state.project?.ai_metadata || {};
  const entries = Object.values(metadata).filter(
    (value) => value && typeof value === "object" && value.processing_mode,
  );
  return entries
    .filter((value) => value.processing_mode === (kind === "primary" ? "primary_ai" : "fallback_ai"))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null;
}

function aiEngineStatus(kind) {
  const caps = state.aiCapabilities || {};
  const used = aiUsage(kind);
  if (used)
    return {
      tone: kind === "fallback" ? "warning" : "success",
      label: kind === "fallback" ? "Degraded - Fallback Used" : "Active",
      detail: used.provider ? `${used.provider} - last successful ${label(used.operation)}` : "Successful provider response recorded",
    };

  const explicit = caps[`${kind}_status`];
  if (explicit === "active")
    return { tone: "success", label: "Active", detail: "Provider connection verified by the engine." };
  if (explicit === "degraded")
    return { tone: "warning", label: "Degraded", detail: "Provider degradation reported by the engine." };
  if (explicit === "error")
    return { tone: "error", label: "Error", detail: "Provider-specific error reported by the engine." };

  const configured = kind === "primary" ? caps.primary_configured : caps.fallback_configured;
  const configErrors = Array.isArray(caps.configuration_errors) ? caps.configuration_errors : [];
  if (configured) {
    if (kind === "primary")
      return {
        tone: configErrors.length ? "warning" : "success",
        label: configErrors.length ? "Ready - Check Warnings" : "Ready",
        detail:
          "Primary AI is configured and available. It becomes Active when this project records a successful provider response." +
          (configErrors.length ? " The engine also reports provider configuration warnings." : ""),
      };
    return {
      tone: "neutral",
      label: "Standby",
      detail:
        "Fallback AI is configured and reserved for primary-provider failure. It becomes Active only when fallback is actually used." +
        (configErrors.length ? " The engine also reports provider configuration warnings." : ""),
    };
  }
  return {
    tone: "neutral",
    label: "Inactive",
    detail:
      "Not configured." +
      (configErrors.length ? " The engine reports provider configuration warnings, but does not identify them as belonging to this specific engine." : ""),
  };
}

function presetUiName(value) {
  return { FAST: "LOW", BALANCED: "MEDIUM", ULTRA: "MAX" }[value] || null;
}

function processEventLabel(event) {
  const name = typeof event === "string" ? event : event?.event;
  return {
    UPLOAD_RECEIVED: "Artwork Received",
    ANALYZING_ARTWORK: "Analyzing Artwork",
    ENHANCING_ARTWORK: "Enhancing Artwork",
    CREATING_PATTERN_MOCKUP: "Creating Production Mockup",
    IDENTIFYING_PARTS: "Identifying Parts",
    REFINING_PART_BOUNDARIES: "Refining Part Boundaries",
    PART_REVIEW_READY: "Preparing Part Review",
    RECONSTRUCTING_PART: "Reconstructing Part",
    TRACING_VECTOR: "Tracing Vector",
    OPTIMIZING_VECTOR: "Optimizing Vector",
    VECTOR_READY: "Vector Ready",
    VALIDATING_VECTOR: "Validating Vector",
    VALIDATION_PASSED: "Validation Passed",
    VALIDATION_FAILED: "Validation Failed",
    EXPORT_READY: "Export Ready",
    ERROR_OCCURRED: "Processing Error",
    ERROR_ASSISTANT_READY: "Assistant Ready",
  }[name] || label(name || "Processing");
}

function stepFromProject(project = state.project) {
  if (!project?.source_file) return 0;
  if (ready()) return 5;
  const currentEvent = state.job?.process_event?.event || project?.events?.at?.(-1)?.event;
  if (currentEvent === "VALIDATING_VECTOR" || currentEvent === "VALIDATION_FAILED") return 4;
  if (
    ["RECONSTRUCTING_PART", "TRACING_VECTOR", "OPTIMIZING_VECTOR", "VECTOR_READY"].includes(currentEvent) ||
    project.parts?.some((pp) => pp.vector)
  ) return 3;
  if (project.state === "PART_REVIEW_READY" || Object.keys(project.slots || {}).length) return 2;
  if (project.analysis && Object.keys(project.analysis).length) return 1;
  return 0;
}

function loadLocalProjectMeta(projectId) {
  if (!projectId) return;
  try {
    const raw = localStorage.getItem(`revector.meta.${projectId}`);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.uploadMeta = saved.uploadMeta || null;
    if (Array.isArray(saved.requirements)) state.requirements = saved.requirements;
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

function persistActiveJob() {
  try {
    if (state.job?.job_id && state.project?.project_id) {
      localStorage.setItem(
        "revector.active-job",
        JSON.stringify({
          job_id: state.job.job_id,
          project_id: state.project.project_id,
          stage: state.job.stage,
          process_event: state.job.process_event || null,
        }),
      );
    } else {
      localStorage.removeItem("revector.active-job");
    }
  } catch {}
}

function loadActiveJob() {
  try {
    const raw = localStorage.getItem("revector.active-job");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export {
  API,
  DEFAULT_PART_DIMENSIONS,
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
  slotDefinition,
  slotForPart,
  slotState,
  partForSlot,
  slotLabel,
  slotTone,
  aiEngineStatus,
  presetUiName,
  processEventLabel,
  stepFromProject,
  loadLocalProjectMeta,
  saveLocalProjectMeta,
  clearLocalProjectMeta,
  persistActiveJob,
  loadActiveJob,
};
