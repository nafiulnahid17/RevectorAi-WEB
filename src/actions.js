import {
  types,
  state,
  expectedSlots,
  part,
  ready,
  artifact,
  label,
  toast,
  saveLocalProjectMeta,
  clearLocalProjectMeta,
  safeBusyActions,
} from "./model.js";
import {
  request,
  post,
  refresh,
  pollJob,
  stage,
  perform,
  loadCapabilities,
  presentError,
} from "./api.js";
import { IMPLEMENTED_RECOVERY_ACTIONS, localAdvice } from "./error-catalog.js";
import { render } from "./views.js";

function collectRequirements() {
  return state.requirements
    .filter((r) => r.name || r.width_mm || r.height_mm)
    .map((r) => {
      if (!r.name || !r.width_mm || !r.height_mm)
        throw new Error("Each size requirement needs a name, width and height.");
      const direct = expectedSlots.find(
        (slot) => slot.label.toLowerCase() === String(r.name).trim().toLowerCase(),
      );
      return {
        name: String(r.name).trim(),
        type: direct?.type || "unknown",
        width_mm: Number(r.width_mm),
        height_mm: Number(r.height_mm),
      };
    });
}

function validArtwork(file) {
  if (!file) return false;
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  const ext = String(file.name || "").split(".").pop()?.toLowerCase();
  return allowed.has(file.type) && ["jpg", "jpeg", "png", "webp"].includes(ext);
}

async function upload(file) {
  if (!file) return;
  if (!validArtwork(file))
    throw Object.assign(new Error("Choose a JPG, PNG or WEBP artwork file."), {
      code: "INVALID_UPLOAD_TYPE",
      category: "upload",
    });
  if (file.size > 50 * 1024 * 1024)
    throw Object.assign(new Error("Artwork must be 50 MB or smaller."), {
      code: "UPLOAD_TOO_LARGE",
      category: "upload",
    });

  await perform(async () => {
    if (!state.health)
      throw Object.assign(new Error("ReVector Engine is not ready."), {
        code: "ENGINE_UNAVAILABLE",
        category: "network",
      });

    state.operation = "Uploading Artwork";
    state.operationDetail = "Preparing your file for processing";
    render();

    if (!state.project?.project_id) {
      const settings = {
        preset: state.preset,
        vector_mode: state.mode,
        noise_reduction: state.noise ?? true,
        preserve_original_colors: state.colors ?? true,
        ocr: state.ocr ?? false,
        ai_workflow: true,
      };
      const name =
        document.querySelector('[name="project-name"]')?.value?.trim() ||
        state.projectName?.trim() ||
        file.name.replace(/\.[^.]+$/, "");
      state.project = await post("/projects", {
        name,
        settings,
        production_specifications: collectRequirements(),
      });
    }

    const data = new FormData();
    data.append("project_id", state.project.project_id);
    data.append("file", file, file.name);
    data.append("auto_prepare", "true");

    const uploaded = await request("/upload", { method: "POST", body: data });
    const preparationJob = uploaded.preparation_job;
    state.project = uploaded;
    state.uploadMeta = {
      name: file.name,
      size: file.size,
      type: file.type,
    };
    state.selectionInitialized = false;
    state.selectedExports.clear();
    state.selected = null;
    state.shape = null;
    state.step = 1;
    state.lastStageRequest = { name: "prepare", params: {} };
    saveLocalProjectMeta();

    if (!preparationJob?.job_id)
      throw Object.assign(
        new Error("Upload succeeded, but the preparation job was not returned."),
        { code: "JOB_NOT_CREATED", category: "job" },
      );

    state.job = preparationJob;
    render();
    await pollJob(preparationJob);
    await loadCapabilities();
    state.step = 2;
    toast("Artwork is ready for the eight-part review.");
  });
}

async function deleteArtwork() {
  if (!state.project?.project_id) return;
  if (
    !confirm(
      "Delete this artwork and its current ReVector project? The engine does not expose a source-only delete operation.",
    )
  )
    return;
  await perform(async () => {
    const id = state.project.project_id;
    state.operation = "Deleting Artwork";
    await request(`/projects/${id}`, { method: "DELETE" });
    clearLocalProjectMeta(id);
    try {
      localStorage.removeItem("revector.project");
      localStorage.removeItem("revector.active-job");
    } catch {}
    resetWorkspace();
    toast("Artwork project deleted.");
  });
}

function resetWorkspace() {
  state.project = null;
  state.selected = null;
  state.step = 0;
  state.error = null;
  state.assistantAdvice = null;
  state.assistantOpen = false;
  state.requirements = [];
  state.uploadMeta = null;
  state.selectionInitialized = false;
  state.selectedExports.clear();
  state.downloadFormats = new Set(["svg"]);
  state.shape = null;
  state.draw = null;
  state.drawSlot = null;
  state.points = [];
  state.job = null;
}

async function savePart() {
  const pp = part();
  const form = document.querySelector("#part-form");
  if (!pp || !form) return;
  const data = new FormData(form);
  const width = data.get("part-width");
  const height = data.get("part-height");
  if (Boolean(width) !== Boolean(height))
    throw new Error("Enter both width and height, or leave both blank.");

  const payload = {
    project_id: state.project.project_id,
    name: String(data.get("part-name") || pp.name).trim(),
    type: data.get("part-type") || pp.type,
    physical_width_mm: width ? Number(width) : null,
    physical_height_mm: height ? Number(height) : null,
    bleed_mm: Number(data.get("part-bleed") || 0),
    safe_zone_mm: Number(data.get("part-safe") || 0),
    confirmed: true,
  };

  await perform(async () => {
    state.operation = "Confirming Part";
    state.project = await post(`/segments/${pp.part_id}/update`, payload);
    state.shape = null;
    await refresh();
    toast("Part confirmed with the engine geometry.");
  });
}

function decisionsForReview() {
  const decisions = {};
  for (const slot of expectedSlots) {
    const current = state.project.slots?.[slot.key];
    if (current?.status === "blank") {
      decisions[slot.key] = { status: "blank" };
      continue;
    }
    const pp = state.project.parts?.find((item) => item.part_id === current?.part_id);
    if (!pp)
      throw Object.assign(new Error(`${slot.label} is unresolved.`), {
        code: "PART_REVIEW_REQUIRED",
        category: "parts",
      });
    if (pp.type !== slot.type)
      throw Object.assign(
        new Error(`${slot.label} must be classified as ${slot.label} before confirmation.`),
        { code: "PART_REVIEW_REQUIRED", category: "parts", part_id: pp.part_id },
      );
    if (!pp.confirmed)
      throw Object.assign(new Error(`${slot.label} still requires confirmation.`), {
        code: "PART_REVIEW_REQUIRED",
        category: "parts",
        part_id: pp.part_id,
      });
    decisions[slot.key] = { status: "confirmed", part_id: pp.part_id };
  }
  return decisions;
}

async function confirmParts() {
  await perform(async () => {
    const decisions = decisionsForReview();
    state.step = 3;
    state.operation = "Starting Vector Production";
    state.lastStageRequest = {
      name: "review/confirm",
      params: { decisions: structuredClone(decisions) },
    };
    const job = await post("/review/confirm", {
      project_id: state.project.project_id,
      decisions,
    });
    state.job = job;
    render();
    await pollJob(job);
    state.step = ready() ? 5 : 4;
    if (ready()) toast("Validation passed. Individual vector files are ready.");
  });
}

async function createMissing(slot) {
  await perform(async () => {
    state.step = 2;
    state.operation = `Reconstructing ${label(slot)}`;
    await stage("ai-missing", { slot });
    await refresh();
    const created = state.project.slots?.[slot]?.part_id;
    if (created) state.selected = created;
    toast("AI proposal created. Review and confirm its engine-refined boundary.");
  });
}

async function leaveBlank(slot) {
  await perform(async () => {
    state.operation = `Leaving ${label(slot)} Blank`;
    state.project = await post("/slots/update", {
      project_id: state.project.project_id,
      slot,
      status: "blank",
    });
    await refresh();
  });
}

function manualSlot(slot) {
  const def = expectedSlots.find((item) => item.key === slot);
  if (!def) return;
  state.draw = "add";
  state.drawSlot = slot;
  state.points = [];
  state.step = 2;
  state.originalView = false;
  render();
}

async function saveDraw() {
  const polygon = state.points.map((p) => [...p]);
  const mode = state.draw;
  const id = state.selected;
  await perform(async () => {
    if (mode === "geometry") {
      await stage("correct-geometry", { corners: polygon });
      await stage("segment");
    } else if (mode === "add") {
      const def = expectedSlots.find((item) => item.key === state.drawSlot);
      state.project = await post("/parts/actions", {
        project_id: state.project.project_id,
        action: "add",
        polygon,
        name: def?.label || "Manual part",
        type: def?.type || "unknown",
      });
      await refresh();
      const matching = state.project.parts
        .filter((item) => item.type === def?.type)
        .at(-1);
      if (matching) {
        state.selected = matching.part_id;
        state.project = await post(`/segments/${matching.part_id}/update`, {
          project_id: state.project.project_id,
          name: def.label,
          type: def.type,
          confirmed: false,
        });
      }
    } else if (mode === "update" && id) {
      state.project = await post(`/segments/${id}/update`, {
        project_id: state.project.project_id,
        polygon,
        confirmed: false,
      });
    }
    state.draw = null;
    state.drawSlot = null;
    state.points = [];
    await refresh();
  });
}

async function removePart() {
  if (!state.selected || !confirm("Remove this part from the current project?")) return;
  await perform(async () => {
    state.project = await post("/parts/actions", {
      project_id: state.project.project_id,
      part_id: state.selected,
      action: "remove",
    });
    state.selected = null;
    await refresh();
  });
}

function saveDownload(key) {
  if (!key) throw new Error("Export did not produce a downloadable file.");
  const a = document.createElement("a");
  a.href = artifact(key);
  a.download = key.split("/").pop();
  document.body.append(a);
  a.click();
  a.remove();
}

function chosenFormats() {
  const supported = new Set(["svg", "pdf", "eps"]);
  return [...state.downloadFormats].filter((format) => supported.has(format));
}

async function exportSelected() {
  await perform(async () => {
    if (!ready())
      throw Object.assign(new Error("Validation must pass before export."), {
        code: "VALIDATION_REQUIRED",
        category: "validation",
      });
    const ids = [...state.selectedExports];
    const formats = chosenFormats();
    if (!ids.length) throw new Error("Select at least one part.");
    if (!formats.length) throw new Error("Select at least one supported format.");

    if (ids.length === 1 && formats.length === 1) {
      const result = await stage("export", { part_ids: ids, formats });
      saveDownload(result.part_files?.[ids[0]]?.[formats[0]]);
    } else {
      const result = await stage("export", {
        part_ids: ids,
        formats: [...formats, "zip"],
      });
      saveDownload(result.exports?.zip);
    }
    toast("Selected validated part export is ready.");
  });
}

async function exportPack() {
  await perform(async () => {
    if (!ready())
      throw Object.assign(new Error("Validation must pass before export."), {
        code: "VALIDATION_REQUIRED",
        category: "validation",
      });
    const ids = state.selectedExports.size
      ? [...state.selectedExports]
      : state.project.parts.map((item) => item.part_id);
    const formats = chosenFormats();
    if (!formats.length) throw new Error("Select at least one supported format.");
    const result = await stage("export", {
      part_ids: ids,
      formats: [...formats, "zip"],
    });
    saveDownload(result.exports?.zip);
    toast("Production Pack is ready. It contains individual parts only.");
  });
}

function showReport() {
  const report = state.project?.validation;
  if (!report) return;
  const div = document.querySelector("#report-content");
  if (!div) return;
  div.replaceChildren();
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(report, null, 2);
  div.append(pre);
  document.querySelector("#report-dialog")?.showModal();
}

async function applyFill() {
  if (!state.shape || !state.selected) {
    toast("Select a vector shape first.");
    return;
  }
  const input = document.querySelector("#shape-color");
  const color = input?.value;
  await perform(async () => {
    state.operation = "Updating Vector Color";
    state.project = await post(`/segments/${state.selected}/vector-edit`, {
      project_id: state.project.project_id,
      shape_id: state.shape,
      fill: color,
    });
    state.shape = null;
    await stage("compose");
    await stage("validate");
    await refresh();
    state.step = 3;
    toast("Vector fill updated and deterministic validation rerun.");
  });
}

async function assistantHelp(question = "") {
  const error = state.error;
  state.assistantEngaged = true;
  if (!error) return;
  if (!state.networkOnline) {
    state.assistantAdvice = localAdvice(error);
    state.assistantOpen = true;
    render();
    return;
  }

  await perform(
    async () => {
      state.operation = "Getting Error Guidance";
      const body = {
        project_id: state.project?.project_id || null,
        question,
      };
      if (error.error_id) body.error_id = error.error_id;
      else
        body.error = {
          error_code: error.error_code || error.code || "UNKNOWN_ERROR",
          message: error.message || "Unknown error",
          phase: String(error.phase || "request").slice(0, 80),
          part_id: error.part_id || null,
          retryable: error.retryable !== false,
        };

      const response = await post("/assistant/explain", body, { timeoutMs: 30000 });
      const advice = response?.advice || localAdvice(error);
      const backendSupported = Array.isArray(advice.supported_actions)
        ? advice.supported_actions
        : [];
      advice.supported_actions = backendSupported.filter((id) =>
        IMPLEMENTED_RECOVERY_ACTIONS.has(id),
      );
      if (!advice.supported_actions.includes(advice.recommended_action))
        advice.recommended_action = advice.supported_actions[0] || null;
      advice.secondary_actions = (advice.secondary_actions || []).filter((id) =>
        advice.supported_actions.includes(id),
      );
      state.assistantAdvice = advice;
      if (response?.error_id) state.error.error_id = response.error_id;
      state.assistantOpen = true;
    },
    { allowDuringBusy: false },
  );
}

async function feedback(action, outcome) {
  if (!state.project?.project_id || !state.error?.error_id) return;
  try {
    await post("/assistant/feedback", {
      project_id: state.project.project_id,
      error_id: state.error.error_id,
      action,
      outcome,
    });
  } catch {}
}

function recoveryPartId() {
  return state.error?.part_id || state.job?.part_id || state.selected || null;
}

async function executeRecovery(action) {
  if (!IMPLEMENTED_RECOVERY_ACTIONS.has(action)) return;
  let outcome = "FAILED";
  try {
    if (action === "restart_upload") {
      document.querySelector("#file-input")?.click();
      outcome = "SUCCESS";
      return;
    }
    if (action === "refresh_connection") {
      window.dispatchEvent(new CustomEvent("revector:retry-connection"));
      outcome = "SUCCESS";
      return;
    }
    if (action === "view_error_details") {
      state.assistantShowDetails = true;
      state.assistantOpen = true;
      render();
      outcome = "SUCCESS";
      return;
    }
    if (action === "view_validation_report") {
      showReport();
      outcome = "SUCCESS";
      return;
    }
    if (action === "return_to_detect_parts") {
      state.step = 2;
      render();
      outcome = "SUCCESS";
      return;
    }
    if (action === "reselect_part") {
      state.step = 2;
      if (recoveryPartId()) state.selected = recoveryPartId();
      state.draw = state.selected ? "update" : null;
      state.points = [];
      render();
      outcome = "SUCCESS";
      return;
    }
    if (action === "open_manual_editor") {
      if (recoveryPartId()) state.selected = recoveryPartId();
      const selectedPart = part();
      state.step = selectedPart?.vector ? 3 : 2;
      render();
      outcome = "SUCCESS";
      return;
    }

    await perform(async () => {
      if (action === "retry_part" || action === "use_fallback_trace") {
        const partId = recoveryPartId();
        if (!partId) throw new Error("No failed part is available for isolated recovery.");
        await stage("recover-part", {
          part_id: partId,
          fallback_trace: action === "use_fallback_trace",
        });
      } else if (action === "revalidate") {
        await stage("validate");
      } else if (action === "retry_stage") {
        const recorded = state.lastStageRequest;
        if (!recorded?.name)
          throw new Error("The original typed stage request is not available to retry safely.");
        if (recorded.name === "review/confirm") {
          const job = await post("/review/confirm", {
            project_id: state.project.project_id,
            ...structuredClone(recorded.params),
          });
          state.job = job;
          await pollJob(job);
        } else {
          await stage(recorded.name, structuredClone(recorded.params || {}));
        }
      }
      await refresh();
      state.step = ready() ? 5 : Math.max(3, state.step);
      if (ready()) {
        state.error = null;
        state.assistantAdvice = null;
        state.assistantOpen = false;
      }
    });
    outcome = ready() || action !== "revalidate" ? "SUCCESS" : "FAILED";
  } catch (error) {
    presentError(error);
    outcome = "FAILED";
  } finally {
    await feedback(action, outcome);
  }
}

async function updateSettings(changes) {
  if (!state.project) {
    if (changes.preset) state.preset = changes.preset;
    if (changes.vector_mode) state.mode = changes.vector_mode;
    render();
    return;
  }
  await perform(async () => {
    state.operation = "Updating Artwork Settings";
    state.project = await request(
      `/projects/${state.project.project_id}/settings`,
      { method: "PUT", body: JSON.stringify(changes) },
    );
    await refresh();
  });
}

async function handle(action, target) {
  if (state.busy && !safeBusyActions.has(action)) return;

  switch (action) {
    case "upload":
      document.querySelector("#file-input")?.click();
      break;
    case "delete-artwork":
      await deleteArtwork();
      break;
    case "new-project":
      if (state.project && !confirm("Start a new workspace view? The current engine project will remain stored.")) return;
      resetWorkspace();
      try {
        localStorage.removeItem("revector.project");
        localStorage.removeItem("revector.active-job");
      } catch {}
      render();
      break;
    case "menu-toggle":
      state.menuOpen = !state.menuOpen;
      render();
      break;
    case "assistant-toggle":
      state.assistantOpen = !state.assistantOpen;
      state.assistantMinimized = false;
      render();
      break;
    case "assistant-no":
      state.assistantOpen = false;
      state.assistantMinimized = true;
      render();
      break;
    case "assistant-help":
      await assistantHelp();
      break;
    case "assistant-action":
      await executeRecovery(target.dataset.recovery);
      break;
    case "assistant-send": {
      const input = document.querySelector("#assistant-question");
      const question = input?.value?.trim() || "";
      if (question) await assistantHelp(question);
      break;
    }
    case "confirm-parts":
      await confirmParts();
      break;
    case "create-missing":
      await createMissing(target.dataset.slot);
      break;
    case "manual-slot":
      manualSlot(target.dataset.slot);
      break;
    case "leave-blank":
      await leaveBlank(target.dataset.slot);
      break;
    case "select-part":
      state.selected = target.dataset.id;
      state.shape = null;
      render();
      break;
    case "save-part":
      await savePart();
      break;
    case "remove-part":
      await removePart();
      break;
    case "lock":
      await perform(async () => {
        state.project = await post(`/segments/${state.selected}/update`, {
          project_id: state.project.project_id,
          locked: !part().locked,
        });
        await refresh();
      });
      break;
    case "review-view":
      state.view = target.dataset.view === "paths" ? "paths" : "vector";
      state.shape = null;
      render();
      break;
    case "palette":
      if (!state.shape) return toast("Select a vector shape first.");
      document.querySelector("#shape-color").value = target.dataset.color;
      break;
    case "apply-fill":
      await applyFill();
      break;
    case "report":
      showReport();
      break;
    case "download-selected":
      await exportSelected();
      break;
    case "download-pack":
      await exportPack();
      break;
    case "select-all":
      state.selectedExports =
        state.selectedExports.size === state.project.parts.length
          ? new Set()
          : new Set(state.project.parts.map((item) => item.part_id));
      render();
      break;
    case "format-toggle": {
      const format = target.dataset.format;
      if (state.downloadFormats.has(format)) state.downloadFormats.delete(format);
      else state.downloadFormats.add(format);
      if (!state.downloadFormats.size) state.downloadFormats.add("svg");
      render();
      break;
    }
    case "add-requirement":
      state.requirements.push({ name: "", width_mm: "", height_mm: "" });
      saveLocalProjectMeta();
      render();
      break;
    case "remove-requirement":
      state.requirements.splice(Number(target.dataset.index), 1);
      saveLocalProjectMeta();
      render();
      break;
    case "view-original":
      state.originalView = true;
      render();
      break;
    case "view-boundaries":
      state.originalView = false;
      render();
      break;
    case "draw-update":
      state.draw = "update";
      state.drawSlot = null;
      state.points = [];
      render();
      break;
    case "geometry":
      if (
        state.project.parts.length &&
        !confirm("Correcting geometry replaces detected parts and invalidates current vectors. Continue?")
      )
        return;
      state.draw = "geometry";
      state.drawSlot = null;
      state.points = [];
      state.originalView = false;
      render();
      break;
    case "cancel-draw":
      state.draw = null;
      state.drawSlot = null;
      state.points = [];
      render();
      break;
    case "save-draw":
      await saveDraw();
      break;
    case "preset":
      await updateSettings({ preset: target.dataset.value });
      break;
    case "navigate":
      state.step = Number(target.dataset.step);
      state.draw = null;
      state.shape = null;
      render();
      break;
    case "back":
      state.step = Math.max(0, state.step - 1);
      state.draw = null;
      render();
      break;
    case "cancel":
      state.cancel = true;
      if (state.job?.job_id) {
        try {
          await post(`/jobs/${state.job.job_id}/cancel`, {});
          toast("Cancellation requested. ReVector will stop at a safe boundary.");
        } catch (error) {
          presentError(error);
          render();
        }
      }
      break;
    case "dismiss-error":
      state.error = null;
      state.assistantAdvice = null;
      state.assistantOpen = false;
      state.assistantEngaged = false;
      state.assistantShowDetails = false;
      render();
      break;
    case "retry-connection":
      window.dispatchEvent(new CustomEvent("revector:retry-connection"));
      break;
  }
}

export {
  upload,
  deleteArtwork,
  savePart,
  handle,
  updateSettings,
  assistantHelp,
  executeRecovery,
  confirmParts,
  collectRequirements,
};
