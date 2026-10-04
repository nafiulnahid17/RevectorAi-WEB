import {
  state,
  app,
  part,
  toast,
  stepFromProject,
  saveLocalProjectMeta,
  loadActiveJob,
} from "./model.js";
import {
  request,
  refresh,
  loadCapabilities,
  presentError,
  resumeStoredJob,
  clientError,
} from "./api.js";
import { render } from "./views.js";
import { upload, savePart, handle, updateSettings } from "./actions.js";

function handleFailure(error) {
  if (!state.error || state.error.message !== error.message) presentError(error);
  render();
}

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  event.preventDefault();
  handle(target.dataset.action, target).catch(handleFailure);
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "part-form") savePart().catch(handleFailure);
});

app.addEventListener("input", (event) => {
  const element = event.target;
  if (element.name?.startsWith("req-")) {
    const row = element.closest("[data-index]");
    if (!row) return;
    const requirement = state.requirements[Number(row.dataset.index)];
    if (!requirement) return;
    const key = {
      "req-name": "name",
      "req-width": "width_mm",
      "req-height": "height_mm",
    }[element.name];
    requirement[key] = element.value;
    saveLocalProjectMeta();
  }

  if (element.name === "project-name") state.projectName = element.value;

  if (
    element.name === "part-width" &&
    document.querySelector('[name="aspect-lock"]')?.checked &&
    part()
  ) {
    const height = document.querySelector('[name="part-height"]');
    if (height) {
      height.value = element.value
        ? ((Number(element.value) * part().bbox[3]) / part().bbox[2]).toFixed(1)
        : "";
    }
  }
});

app.addEventListener("change", (event) => {
  const element = event.target;

  if (element.name === "export-part") {
    element.checked
      ? state.selectedExports.add(element.value)
      : state.selectedExports.delete(element.value);
    render();
    return;
  }

  if (element.name === "size-requirement" && element.value !== "") {
    const requirement = state.requirements[Number(element.value)];
    if (!requirement) return;
    const name = document.querySelector('[name="part-name"]');
    const type = document.querySelector('[name="part-type"]');
    const width = document.querySelector('[name="part-width"]');
    const height = document.querySelector('[name="part-height"]');
    const slot = [
      ["Left Sleeve", "left_sleeve"],
      ["Right Sleeve", "right_sleeve"],
      ["Front Body", "front_body"],
      ["Back Body", "back_body"],
      ["Front Collar", "front_collar"],
      ["Back Collar", "back_collar"],
      ["Top Trim", "top_trim"],
      ["Bottom Trim", "bottom_trim"],
    ].find(([label]) => label.toLowerCase() === String(requirement.name).toLowerCase());
    if (name) name.value = requirement.name;
    if (type) type.value = slot?.[1] || "unknown";
    if (width) width.value = requirement.width_mm;
    if (height) height.value = requirement.height_mm;
    const lock = document.querySelector('[name="aspect-lock"]');
    if (lock) lock.checked = false;
    return;
  }

  if (["noise", "colors", "ocr", "vector-mode"].includes(element.name)) {
    const key = {
      noise: "noise_reduction",
      colors: "preserve_original_colors",
      ocr: "ocr",
      "vector-mode": "vector_mode",
    }[element.name];
    const value = element.name === "vector-mode" ? element.value : element.checked;
    if (state.project) {
      updateSettings({ [key]: value }).catch(handleFailure);
    } else {
      if (element.name === "vector-mode") state.mode = value;
      else state[element.name] = value;
    }
  }
});

app.addEventListener("dragover", (event) => {
  const zone = event.target.closest("#dropzone");
  if (zone) {
    event.preventDefault();
    zone.classList.add("drag-over");
  }
});

app.addEventListener("dragleave", (event) => {
  event.target.closest("#dropzone")?.classList.remove("drag-over");
});

app.addEventListener("drop", (event) => {
  if (!event.target.closest("#dropzone")) return;
  event.preventDefault();
  event.target.closest("#dropzone")?.classList.remove("drag-over");
  if (state.busy) return;
  upload(event.dataTransfer.files[0]).catch(handleFailure);
});

document.querySelector("#file-input")?.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) upload(file).catch(handleFailure);
  event.target.value = "";
});

document.querySelector("#close-report")?.addEventListener("click", () => {
  document.querySelector("#report-dialog")?.close();
});

function safeSpeak(text) {
  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    typeof SpeechSynthesisUtterance === "undefined"
  )
    return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function welcomeVoice() {
  try {
    if (sessionStorage.getItem("revector.voice.welcome")) return;
    sessionStorage.setItem("revector.voice.welcome", "1");
    safeSpeak("Welcome to ReVector AI. Upload your artwork to begin.");
  } catch {
    if (!state.voice.welcomeSpoken) {
      state.voice.welcomeSpoken = true;
      safeSpeak("Welcome to ReVector AI. Upload your artwork to begin.");
    }
  }
}

function stateVoice() {
  if (state.error) {
    const key =
      state.error.error_id ||
      [state.error.error_code || state.error.code, state.error.phase, state.error.message].join(":");
    if (!state.voice.spokenErrors.has(key)) {
      state.voice.spokenErrors.add(key);
      safeSpeak(
        state.error.category === "network"
          ? "Connection lost. Your current work is being preserved."
          : "An error was detected. Open ReVector Assistant for recovery help.",
      );
    }
  }

  if (state.project?.true_vector_ready && state.project?.validation?.status === "PASS") {
    const key =
      state.project.validation.validated_sha256 ||
      state.project.validation.vector_status ||
      state.project.updated_at;
    if (state.voice.validationSpokenFor !== key) {
      state.voice.validationSpokenFor = key;
      safeSpeak("Validation passed. Your vector files are ready.");
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("revector:state-rendered", stateVoice);
}

async function connectionReport() {
  const server = await request("/health");
  if (server?.engine !== "ReVector" || server?.status !== "ok")
    throw clientError("ENGINE_UNAVAILABLE", "ReVector server did not respond.", {
      category: "network",
    });

  state.connections.server = "connected";
  let report;
  try {
    report = await request("/health/ready");
  } catch (error) {
    if (!error.data?.segments) throw error;
    report = error.data;
  }
  if (report?.engine !== "ReVector" || !report.segments)
    throw clientError("ENGINE_UNAVAILABLE", "The engine readiness check did not respond.", {
      category: "network",
    });

  for (const key of ["engine", "tool"]) {
    state.connections[key] =
      report.segments[key]?.status === "connected" ? "connected" : "failed";
  }
  state.health = report;
  await loadCapabilities();

  if (
    state.connections.engine !== "connected" ||
    state.connections.tool !== "connected"
  ) {
    state.connectionMessage =
      state.connections.engine === "failed"
        ? "Engine checks failed."
        : "Tool checks failed.";
    return false;
  }
  state.connectionMessage = "";
  return true;
}

async function reconnectOnly() {
  state.networkOnline = typeof navigator === "undefined" ? true : navigator.onLine;
  state.reconnecting = true;
  render();
  if (!state.networkOnline) return false;
  try {
    state.connections = { server: "pending", engine: "pending", tool: "pending" };
    const ready = await connectionReport();
    state.networkOnline = true;
    state.reconnecting = false;
    state.error = null;
    render();
    if (ready && !state.busy) {
      const stored = loadActiveJob();
      const active =
        state.job?.job_id && !["SUCCEEDED", "FAILED", "CANCELLED"].includes(state.job.job_state)
          ? {
              job_id: state.job.job_id,
              project_id: state.job.project_id || state.project?.project_id,
              stage: state.job.stage,
              process_event: state.job.process_event || null,
            }
          : stored;
      if (active?.job_id && active?.project_id) {
        await resumeStoredJob(active);
        state.step = stepFromProject();
      }
    }
    return ready;
  } catch (error) {
    state.reconnecting = false;
    state.connections.server = "failed";
    state.connections.engine = "waiting";
    state.connections.tool = "waiting";
    presentError(error);
    render();
    return false;
  }
}

async function boot() {
  if (boot.running) return;
  boot.running = true;
  state.connecting = true;
  state.health = null;
  state.connections = { server: "pending", engine: "pending", tool: "pending" };
  state.connectionMessage = "";
  render();

  try {
    if (location.protocol === "file:" || location.origin === "null") {
      throw clientError(
        "ENGINE_UNAVAILABLE",
        "The server could not be reached from this preview.",
        { category: "network" },
      );
    }

    const ready = await connectionReport();
    if (!ready) return;

    let savedProject;
    try {
      savedProject = localStorage.getItem("revector.project");
    } catch {}

    if (savedProject && !state.project) {
      try {
        state.project = { project_id: savedProject };
        await refresh();
        if (!state.requirements.length)
          state.requirements = state.project.production_specifications || [];
        state.step = stepFromProject();
      } catch {
        state.project = null;
        try {
          localStorage.removeItem("revector.project");
          localStorage.removeItem("revector.active-job");
        } catch {}
      }
    }

    const active = loadActiveJob();
    if (
      active?.job_id &&
      active?.project_id &&
      (!state.project || state.project.project_id === active.project_id)
    ) {
      await resumeStoredJob(active);
      state.step = stepFromProject();
    }

    welcomeVoice();
  } catch (error) {
    const failed = state.connections.server !== "connected" ? "server" : "engine";
    state.connections[failed] = "failed";
    if (failed === "server") {
      state.connections.engine = "waiting";
      state.connections.tool = "waiting";
    } else {
      state.connections.tool = "waiting";
    }
    state.connectionMessage =
      failed === "server" ? "Server connection failed." : "Engine connection failed.";
  } finally {
    state.connecting = false;
    boot.running = false;
    render();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("offline", () => {
    state.networkOnline = false;
    const error = clientError(
      "NETWORK_OFFLINE",
      "Internet connection is unavailable.",
      {
        category: "network",
        phase: "connection",
        suggested_actions: ["refresh_connection", "view_error_details"],
        preserveJob: true,
      },
    );
    if (state.job?.job_id) {
      error.message =
        "Internet connection is unavailable. The active engine job has not been marked failed.";
      error.job_id = state.job.job_id;
    }
    presentError(error);
    render();
  });

  window.addEventListener("online", () => {
    state.networkOnline = true;
    if (!state.busy) reconnectOnly();
    else render();
  });

  window.addEventListener("revector:retry-connection", () => {
    reconnectOnly();
  });
}

if (globalThis.REVECTOR_PRERENDER) render();
else boot();
