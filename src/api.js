import {
  API,
  state,
  label,
  processEventLabel,
  loadLocalProjectMeta,
  persistActiveJob,
} from "./model.js";
import { localAdvice } from "./error-catalog.js";
import { render } from "./views.js";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

function apiPath(path) {
  return path.startsWith("/health") || path.startsWith(API + "/")
    ? path
    : API + path;
}

function clientError(code, message, extras = {}) {
  const error = new Error(message);
  Object.assign(error, {
    code,
    error_code: code,
    category: extras.category || "unknown",
    phase: extras.phase || "request",
    retryable: extras.retryable ?? true,
    recoverable: extras.recoverable ?? true,
    technical_summary: extras.technical_summary || "",
    suggested_actions: extras.suggested_actions || [],
    preserveJob: extras.preserveJob || false,
    data: extras.data,
  });
  return error;
}

function normalizeError(data, status, fallbackMessage = "Request failed.") {
  const source = data?.error || {};
  const code =
    source.error_code ||
    source.code ||
    data?.code ||
    (status ? `HTTP_${status}` : "REQUEST_FAILED");
  const error = clientError(
    code,
    source.message ||
      data?.detail?.[0]?.msg ||
      (typeof data?.detail === "string" ? data.detail : "") ||
      fallbackMessage,
    {
      category: source.category || "unknown",
      phase: source.phase || "request",
      retryable: source.retryable ?? status >= 500,
      recoverable: source.recoverable ?? true,
      technical_summary: source.technical_summary || "",
      suggested_actions: source.suggested_actions || [],
      data,
    },
  );
  error.error_id = source.error_id || null;
  error.job_id = source.job_id || null;
  error.part_id = source.part_id || null;
  error.part_type = source.part_type || null;
  error.normalized = source;
  return error;
}

async function request(path, options = {}) {
  const url = apiPath(path);
  if (
    typeof navigator !== "undefined" &&
    navigator.onLine === false &&
    !url.startsWith("/health")
  ) {
    throw clientError("NETWORK_OFFLINE", "Internet connection is unavailable.", {
      category: "network",
      phase: "connection",
      suggested_actions: ["refresh_connection", "view_error_details"],
      preserveJob: true,
    });
  }

  const controller = new AbortController();
  const external = options.signal;
  const timeoutMs = options.timeoutMs ?? (url.startsWith("/health") ? 5000 : 30000);
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  let detach = null;
  if (external) {
    const abort = () => controller.abort(external.reason);
    external.addEventListener("abort", abort, { once: true });
    detach = () => external.removeEventListener("abort", abort);
  }

  let response;
  let data;
  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(!options.body || options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });
    const text = await response.text();
    data = text ? JSON.parse(text) : null;
  } catch (cause) {
    if (controller.signal.aborted && !external?.aborted) {
      throw clientError("REQUEST_TIMEOUT", "The request timed out before a response was received.", {
        category: "network",
        phase: "connection",
        suggested_actions: ["refresh_connection", "view_error_details"],
        preserveJob: true,
      });
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw clientError("NETWORK_OFFLINE", "Internet connection is unavailable.", {
        category: "network",
        phase: "connection",
        suggested_actions: ["refresh_connection", "view_error_details"],
        preserveJob: true,
      });
    }
    if (cause instanceof SyntaxError) {
      throw clientError("INVALID_RESPONSE", "The server returned an unreadable response.", {
        category: "network",
        phase: "connection",
      });
    }
    throw clientError("NETWORK_ERROR", "The server could not be reached.", {
      category: "network",
      phase: "connection",
      suggested_actions: ["refresh_connection", "view_error_details"],
      preserveJob: true,
    });
  } finally {
    clearTimeout(timeout);
    detach?.();
  }

  if (!response.ok) throw normalizeError(data, response.status, `Request failed (${response.status}).`);
  return data;
}

const post = (path, body, options = {}) =>
  request(path, {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  });

async function loadCapabilities() {
  try {
    state.aiCapabilities = await request("/capabilities/ai");
  } catch {
    state.aiCapabilities = null;
  }
  return state.aiCapabilities;
}

async function refresh() {
  if (!state.project?.project_id) return null;
  state.project = await request(`/projects/${state.project.project_id}`);
  state.preset = state.project.settings?.preset || state.preset;
  state.mode = state.project.settings?.vector_mode || state.mode;
  loadLocalProjectMeta(state.project.project_id);

  const ids = new Set((state.project.parts || []).map((p) => p.part_id));
  if (!ids.has(state.selected)) state.selected = state.project.parts?.[0]?.part_id || null;
  state.selectedExports = new Set(
    [...state.selectedExports].filter((id) => ids.has(id)),
  );
  if (!state.selectionInitialized && ids.size) {
    for (const id of ids) state.selectedExports.add(id);
    state.selectionInitialized = true;
  }

  try {
    localStorage.setItem("revector.project", state.project.project_id);
  } catch {}
  return state.project;
}

function updateProcessingUI() {
  const title = document.querySelector("#processing-title");
  const detail = document.querySelector("#processing-detail");
  const jobState = document.querySelector("#processing-job-state");
  if (title) title.textContent = state.operation || "Processing Artwork";
  if (detail) title && (detail.textContent = state.operationDetail || "");
  if (jobState && state.job)
    jobState.textContent = state.job.job_state || label(state.job.status);
}

function setJob(job) {
  state.job = job;
  if (job?.process_event?.event) {
    state.operation = processEventLabel(job.process_event);
    const part = state.project?.parts?.find((p) => p.part_id === job.process_event.part_id);
    state.operationDetail = part
      ? part.name
      : job.process_event.part_id
        ? `Part ${job.process_event.part_id}`
        : "";
  }
  persistActiveJob();
  updateProcessingUI();
}

function isNetworkInterruption(error) {
  return ["NETWORK_OFFLINE", "NETWORK_ERROR", "REQUEST_TIMEOUT", "ENGINE_UNAVAILABLE"].includes(
    error?.code,
  );
}

async function pollJob(jobOrId, { renderStart = false } = {}) {
  let job =
    typeof jobOrId === "string"
      ? { job_id: jobOrId, job_state: "RUNNING", status: "processing" }
      : jobOrId;
  setJob(job);
  if (renderStart) render();

  while (!TERMINAL.has(job.job_state || "")) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      job = await request(`/jobs/${job.job_id}`);
      setJob(job);
    } catch (error) {
      if (!isNetworkInterruption(error)) throw error;
      error.preserveJob = true;
      state.error = {
        ...error.normalized,
        error_id: error.error_id || null,
        error_code: error.error_code || error.code,
        code: error.code,
        category: "network",
        phase: "connection",
        message:
          error.code === "NETWORK_OFFLINE"
            ? "Internet connection is unavailable."
            : "The connection was interrupted while a job was running. The job state has not been changed.",
        technical_summary: error.technical_summary || "",
        retryable: true,
        recoverable: true,
        suggested_actions: ["refresh_connection", "view_error_details"],
        job_id: job.job_id,
      };
      state.assistantAdvice = localAdvice(state.error);
      state.assistantOpen = true;
      persistActiveJob();
      render();
      throw error;
    }
  }

  setJob(job);
  await refresh();
  if (job.job_state !== "SUCCEEDED") {
    const source = job.error || {};
    const error = normalizeError({ error: source }, 0, "Processing failed.");
    error.job = job;
    throw error;
  }
  return job.result;
}

async function stage(name, params = {}) {
  if (!state.project?.project_id)
    throw clientError("PROJECT_NOT_FOUND", "Create or restore a project first.", {
      category: "job",
    });
  if (state.cancel)
    throw clientError("JOB_CANCELLED", "Processing cancelled.", {
      category: "job",
      retryable: false,
    });

  state.lastStageRequest = { name, params: structuredClone(params) };
  state.operation = label(name.replaceAll("-", "_"));
  state.operationDetail = "";
  const job = await post("/" + name, {
    project_id: state.project.project_id,
    ...params,
  });
  setJob(job);
  return pollJob(job);
}

function presentError(error) {
  const normalized = error?.normalized || {};
  state.error = {
    ...normalized,
    error_id: error?.error_id || normalized.error_id || null,
    error_code: error?.error_code || normalized.error_code || error?.code || "REQUEST_FAILED",
    code: error?.code || normalized.code || "REQUEST_FAILED",
    category: error?.category || normalized.category || "unknown",
    phase: error?.phase || normalized.phase || state.operation || "request",
    message: error?.message || normalized.message || "The operation could not be completed.",
    technical_summary: error?.technical_summary || normalized.technical_summary || "",
    retryable: error?.retryable ?? normalized.retryable ?? true,
    recoverable: error?.recoverable ?? normalized.recoverable ?? true,
    suggested_actions: error?.suggested_actions || normalized.suggested_actions || [],
    part_id: error?.part_id || normalized.part_id || state.job?.part_id || null,
    job_id: error?.job_id || normalized.job_id || state.job?.job_id || null,
  };
  state.assistantAdvice = localAdvice(state.error);
  state.assistantOpen = true;
}

async function perform(fn, options = {}) {
  if (state.busy && !options.allowDuringBusy) return;
  const ownsBusy = !state.busy;
  if (ownsBusy) {
    state.busy = true;
    state.cancel = false;
    state.error = null;
    state.assistantAdvice = null;
    render();
  }
  try {
    return await fn();
  } catch (error) {
    presentError(error);
    if (state.project && !isNetworkInterruption(error)) {
      try {
        await refresh();
      } catch {}
    }
    throw error;
  } finally {
    if (ownsBusy) {
      state.busy = false;
      if (!state.error?.job_id || TERMINAL.has(state.job?.job_state || "")) {
        state.job = null;
        persistActiveJob();
      }
      state.operation = "";
      state.operationDetail = "";
      render();
    }
  }
}

async function resumeStoredJob(saved) {
  if (!saved?.job_id || !saved?.project_id) return null;
  if (!state.project || state.project.project_id !== saved.project_id) {
    state.project = { project_id: saved.project_id };
    await refresh();
  }
  state.busy = true;
  state.job = {
    job_id: saved.job_id,
    project_id: saved.project_id,
    stage: saved.stage || "processing",
    job_state: "RUNNING",
    status: "processing",
    process_event: saved.process_event || null,
  };
  render();
  try {
    const result = await pollJob(saved.job_id);
    state.error = null;
    return result;
  } catch (error) {
    presentError(error);
    return null;
  } finally {
    state.busy = false;
    if (TERMINAL.has(state.job?.job_state || "")) {
      state.job = null;
      persistActiveJob();
    }
    render();
  }
}

export {
  request,
  post,
  refresh,
  loadCapabilities,
  pollJob,
  stage,
  perform,
  presentError,
  resumeStoredJob,
  clientError,
  isNetworkInterruption,
};
