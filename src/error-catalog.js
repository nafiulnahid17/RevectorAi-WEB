const OFFLINE_ERROR_CATALOG = {
  version: "1.0",
  source: "deterministic_catalog",
  categories: {
    network: {
      title: "Connection issue",
      explanation: "The connection failed. Check your internet connection and server status.",
      actions: ["refresh_connection", "view_error_details"],
    },
    upload: {
      title: "Upload issue",
      explanation: "The source could not be accepted. Use a valid JPG, PNG or WEBP within the upload limits.",
      actions: ["restart_upload", "view_error_details"],
    },
    ai: {
      title: "AI provider issue",
      explanation: "An AI operation did not complete. Check provider configuration or continue with manual part selection.",
      actions: ["return_to_detect_parts", "view_error_details"],
    },
    geometry: {
      title: "Vector geometry issue",
      explanation: "The geometry did not pass deterministic checks. Review the boundary or retry tracing.",
      actions: ["open_manual_editor", "view_error_details"],
    },
    parts: {
      title: "Part review required",
      explanation: "A part is missing or uncertain. Select its region, create a proposal with AI, or leave the slot blank.",
      actions: ["return_to_detect_parts", "view_error_details"],
    },
    validation: {
      title: "Validation blocked",
      explanation: "The output did not pass vector integrity checks. Correct the artwork and validate again.",
      actions: ["revalidate", "view_validation_report", "view_error_details"],
    },
    export: {
      title: "Export issue",
      explanation: "A requested file could not be generated. Existing validated individual files are preserved.",
      actions: ["view_error_details"],
    },
    auth: {
      title: "Access issue",
      explanation: "The request could not be authorized. Reconnect through the secured website.",
      actions: ["refresh_connection", "view_error_details"],
    },
    job: {
      title: "Processing stopped",
      explanation: "The job stopped or exceeded a timeout. Completed parts remain stored; inspect details before retrying.",
      actions: ["view_error_details"],
    },
    storage: {
      title: "Storage issue",
      explanation: "A required project file could not be read or saved. Contact the operator if this persists.",
      actions: ["view_error_details"],
    },
    unknown: {
      title: "Processing issue",
      explanation: "The cause is not yet known. Inspect the safe diagnostic details before retrying.",
      actions: ["view_error_details"],
    },
  },
};

const IMPLEMENTED_RECOVERY_ACTIONS = new Set([
  "open_manual_editor",
  "refresh_connection",
  "reselect_part",
  "restart_upload",
  "retry_part",
  "retry_stage",
  "return_to_detect_parts",
  "revalidate",
  "use_fallback_trace",
  "view_error_details",
  "view_validation_report",
]);

function normalizeLocalCategory(error) {
  if (!error) return "unknown";
  if (error.category && OFFLINE_ERROR_CATALOG.categories[error.category])
    return error.category;
  const code = String(error.error_code || error.code || "").toUpperCase();
  if (/NETWORK|CONNECTION|ENGINE_UNAVAILABLE|REQUEST_TIMEOUT/.test(code)) return "network";
  if (/UPLOAD|IMAGE_TOO_LARGE|SOURCE/.test(code)) return "upload";
  if (/AI_|PROVIDER|MOCKUP/.test(code)) return "ai";
  if (/PART|DETECTION|BOUNDARY/.test(code)) return "parts";
  if (/SVG|VECTOR|GEOMETRY|TRACE|RASTER/.test(code)) return "geometry";
  if (/VALIDAT/.test(code)) return "validation";
  if (/EXPORT|CONVERSION/.test(code)) return "export";
  if (/AUTH|IDENTITY|ACCESS/.test(code)) return "auth";
  if (/JOB|QUEUE|CANCEL/.test(code)) return "job";
  if (/STORAGE|FILE/.test(code)) return "storage";
  return "unknown";
}

function localAdvice(error) {
  const category = normalizeLocalCategory(error);
  const entry = OFFLINE_ERROR_CATALOG.categories[category];
  const suggested = Array.isArray(error?.suggested_actions) ? error.suggested_actions : [];
  const candidates = suggested.length ? suggested : entry.actions;
  const supported = candidates.filter((id) => IMPLEMENTED_RECOVERY_ACTIONS.has(id));
  return {
    title: entry.title,
    explanation: entry.explanation,
    likely_causes: [],
    severity: error?.recoverable === false ? "fatal" : "unknown",
    cause_status: error?.technical_summary ? "known" : "unknown",
    recommended_action: supported[0] || null,
    secondary_actions: supported.slice(1),
    user_message: error?.message || entry.explanation,
    source: "deterministic_catalog",
    supported_actions: supported,
  };
}

export { OFFLINE_ERROR_CATALOG, IMPLEMENTED_RECOVERY_ACTIONS, localAdvice, normalizeLocalCategory };
