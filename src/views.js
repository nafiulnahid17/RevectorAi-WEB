import {
  types,
  stages,
  expectedSlots,
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
  formatBytes,
  slotState,
  partForSlot,
  slotLabel,
  slotTone,
  aiEngineStatus,
  presetUiName,
  processEventLabel,
  stepFromProject,
} from "./model.js";

function highestStep() {
  return stepFromProject();
}

function presetDescription(preset) {
  return {
    FAST: "Faster processing with simplified paths and lower complexity.",
    BALANCED:
      "Balanced artwork detail, clean paths and production-ready accuracy. Recommended for most jersey artwork.",
    ULTRA:
      "Maximum detail retention with high path precision for complex artwork. Processing may take longer.",
  }[preset] || "This preset is managed by the engine.";
}

function aiStatusCard(kind, title) {
  const status = aiEngineStatus(kind);
  return `<div class="engine-card ${status.tone}">
    <div class="row between">
      <strong>${escape(title)}</strong>
      ${badge(status.label, status.tone)}
    </div>
    <p class="small muted">${escape(status.detail)}</p>
  </div>`;
}

function settingsPanel() {
  const p = state.project;
  const current = presetUiName(state.preset);
  return `<aside class="card sidebar stack artwork-settings">
    <div class="section-kicker">Artwork Setup</div>
    <h2>Artwork Setup</h2>
    <div class="project-form stack">
      ${field(
        "Art Name",
        "project-name",
        p?.name || state.projectName || "Untitled artwork",
        "text",
        p ? 'readonly aria-readonly="true" title="Art Name is set when the engine project is created."' : 'maxlength="120"',
      )}
      <label>Vector Strategy
        <select name="vector-mode" ${state.busy ? "disabled" : ""}>
          ${[
            ["color", "Color trace"],
            ["precision", "Precision shapes"],
            ["mono", "Single-color logo"],
            ["reconstruction", "Layer reconstruction"],
          ]
            .map(
              ([value, text]) =>
                `<option value="${value}" ${state.mode === value ? "selected" : ""}>${text}</option>`,
            )
            .join("")}
        </select>
      </label>
    </div>

    <div class="divider"></div>
    <h3>Artwork Details</h3>
    <div class="presets three">
      ${[
        ["FAST", "Low"],
        ["BALANCED", "Medium"],
        ["ULTRA", "Max"],
      ]
        .map(([value, text]) =>
          btn(
            text,
            "preset",
            state.preset === value ? "selected" : "",
            false,
            `data-value="${value}" aria-pressed="${state.preset === value}"`,
          ),
        )
        .join("")}
    </div>
    <p class="small muted preset-copy">
      ${escape(presetDescription(state.preset))}
      ${current ? "" : " The current engine preset is not exposed in the standard workspace."}
    </p>

    <div class="divider"></div>
    <h3>Processing</h3>
    ${checkbox("Reduce image noise", "noise", p?.settings?.noise_reduction ?? true)}
    ${checkbox("Preserve source colors", "colors", p?.settings?.preserve_original_colors ?? true)}
    ${checkbox("Detect text (OCR)", "ocr", p?.settings?.ocr ?? false)}
    <div class="divider"></div>
    <div class="stack engine-statuses">
      ${aiStatusCard("primary", "Primary AI Engine")}
      ${aiStatusCard("fallback", "Fallback AI Engine")}
    </div>
  </aside>`;
}

function requirementRows() {
  return state.requirements.length
    ? state.requirements
        .map(
          (r, i) => `<div class="requirement" data-index="${i}">
            <input name="req-name" aria-label="Required part name" placeholder="e.g. Front Body" value="${escape(r.name)}">
            <input name="req-width" aria-label="Required width in mm" type="number" min="1" max="10000" placeholder="--" value="${escape(r.width_mm)}">
            <input name="req-height" aria-label="Required height in mm" type="number" min="1" max="10000" placeholder="--" value="${escape(r.height_mm)}">
            ${btn("x", "remove-requirement", "icon-button danger", false, `data-index="${i}" aria-label="Remove size requirement"`)}
          </div>`,
        )
        .join("")
    : '<p class="muted small">No physical sizes supplied. Measurements are never inferred from the artwork.</p>';
}

function requirements() {
  return `<section class="card stack requirements-card">
    <div class="row between">
      <div>
        <h2>Part Sizes</h2>
        <p class="small muted">Optional production measurements.</p>
      </div>
      ${btn("+ Add Part Size", "add-requirement", "quiet")}
    </div>
    <div class="requirements">
      <div class="requirement requirements-head"><span>PART</span><span>WIDTH (mm)</span><span>HEIGHT (mm)</span><span></span></div>
      ${requirementRows()}
    </div>
    ${state.project ? '<p class="small muted">Sizes added after project creation remain workspace notes until applied to a real part.</p>' : ""}
  </section>`;
}

function sourceMeta() {
  const p = state.project;
  const metadata = p?.source_metadata || {};
  const dims = metadata.original_dimensions || metadata.normalized_dimensions;
  const filename =
    state.uploadMeta?.name ||
    metadata.original_filename ||
    metadata.filename ||
    "Filename unavailable";
  const size =
    state.uploadMeta?.size ??
    metadata.bytes ??
    metadata.size_bytes ??
    null;
  return {
    filename,
    size: formatBytes(size),
    dimensions: Array.isArray(dims) && dims.length >= 2 ? `${dims[0]} x ${dims[1]} px` : "Dimensions unavailable",
  };
}

function inputMain() {
  const uploaded = Boolean(state.project?.source_file);
  const meta = sourceMeta();
  return `<main class="main-column">
    <section class="card stack upload-card">
      <div>
        <div class="section-kicker">Source</div>
        <h2>Upload Artwork</h2>
        <p class="muted">Upload a jersey photo or flat artwork. ReVector keeps AI references separate from final vector geometry.</p>
      </div>
      <div class="dropzone ${uploaded ? "has-artwork" : ""}" id="dropzone">
        ${uploaded && state.project?.thumbnail
          ? picture(state.project.thumbnail, "Uploaded artwork", "source-thumbnail")
          : `<div class="upload-icon">${icon("upload")}</div>`}
        <h2>${uploaded ? "Artwork Ready" : "Drop your artwork here"}</h2>
        <p class="small muted">JPG, PNG, WEBP • Up to 50 MB</p>
        ${uploaded
          ? `<div class="file-facts">
              <span><strong>File</strong>${escape(meta.filename)}</span>
              <span><strong>Size</strong>${escape(meta.size)}</span>
              <span><strong>Dimensions</strong>${escape(meta.dimensions)}</span>
            </div>
            <div class="row wrap upload-actions">
              ${btn("Replace", "upload", "primary", !state.health)}
              ${btn("Use Template", "noop", "", true, 'title="Available Soon"')}
              ${btn("Use Existing Image", "noop", "", true, 'title="Available Soon"')}
              ${btn(icon("trash") + " Delete Artwork", "delete-artwork", "quiet danger")}
            </div>`
          : `<div class="row wrap upload-actions">
              ${btn(icon("upload") + " Choose Artwork", "upload", "primary", !state.health)}
              ${btn("Use Template", "noop", "", true, 'title="Available Soon"')}
              ${btn("Use Existing Image", "noop", "", true, 'title="Available Soon"')}
            </div>`}
      </div>
    </section>
    ${requirements()}
  </main>`;
}

function currentProcess() {
  const event = state.job?.process_event;
  if (event?.event) return processEventLabel(event);
  if (state.operation) return state.operation;
  return "Preparing Artwork";
}

function processingPanel(title = "Production Processing") {
  const event = state.job?.process_event;
  const selectedPart = state.project?.parts?.find((pp) => pp.part_id === event?.part_id);
  return `<section class="processing-panel" aria-live="polite">
    <div class="processing-orb"><span></span></div>
    <div class="stack processing-copy">
      <div class="section-kicker">${escape(title)}</div>
      <h2 id="processing-title">${escape(currentProcess())}</h2>
      <p id="processing-detail" class="muted">
        ${escape(
          selectedPart?.name ||
            state.operationDetail ||
            "ReVector is using the current engine job state. No estimated percentage is shown.",
        )}
      </p>
      <div class="row wrap">
        ${state.job ? badge(state.job.job_state || state.job.status || "RUNNING", "purple") : badge("Working", "purple")}
        ${event?.part_id ? badge(selectedPart?.name || "Current Part") : ""}
      </div>
      <span id="processing-job-state" class="small muted">${escape(state.job?.job_state || "")}</span>
    </div>
  </section>`;
}

function analysisMain() {
  const p = state.project;
  const mockup = p?.ai_assets?.mockup;
  return `<main class="main-column">
    <section class="card stack analysis-workspace">
      <div class="row between">
        <div>
          <div class="section-kicker">Automatic Preparation</div>
          <h2>Artwork Processing</h2>
        </div>
        ${badge(state.busy ? "Engine Job Active" : "Preparation Complete", state.busy ? "purple" : "success")}
      </div>
      <div class="split-reference">
        <div class="preview-pane">
          <div class="row between"><strong>Source Reference</strong>${badge("Original")}</div>
          <div class="preview-art">${picture(p?.working_image || p?.thumbnail, "Source artwork")}</div>
        </div>
        <div class="preview-pane">
          <div class="row between"><strong>AI Production Mockup</strong>${badge("Intermediate Reference", "warning")}</div>
          <div class="preview-art">
            ${mockup
              ? picture(mockup, "Intermediate AI production mockup")
              : '<div class="empty-preview">Shown only if the engine actually creates a mockup.</div>'}
          </div>
        </div>
      </div>
      ${processingPanel("Automatic Engine Flow")}
      <p class="note">AI mockups are intermediate raster references. ReVector Engine owns final boundaries, vector geometry and deterministic validation.</p>
    </section>
  </main>`;
}

function correctedSize() {
  return (
    state.project?.geometry?.output_dimensions ||
    state.project?.source_metadata?.normalized_dimensions ||
    [1, 1]
  );
}

function drawingMarkup() {
  const radius = Math.max(...correctedSize()) * 0.006;
  return `<polyline class="drawing-line" points="${state.points.map((p) => p.join(",")).join(" ")}"/>
    ${state.points.map(([x, y]) => `<circle class="draw-point" cx="${x}" cy="${y}" r="${radius}"/>`).join("")}`;
}

function artboard() {
  const p = state.project;
  const [w, h] = correctedSize();
  const drawing = Boolean(state.draw);
  const source = state.originalView ? p.working_image : p.corrected_image;
  return `<div class="canvas-viewport detection-canvas">
    <div class="artboard ${drawing ? "draw-mode" : ""}" style="width:${Math.min(w, 820)}px">
      ${source ? `<img src="${artifact(source)}" alt="Engine detection reference">` : ""}
      <svg class="overlay" id="boundary-canvas" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        ${!drawing && !state.originalView
          ? (p.parts || [])
              .map((pp) =>
                pp.polygon?.length
                  ? `<polygon class="boundary ${pp.part_id === state.selected ? "selected" : ""} ${pp.confirmed ? "confirmed" : ""}" data-id="${escape(pp.part_id)}" points="${pp.polygon.map((point) => point.join(",")).join(" ")}"/>`
                  : `<rect class="boundary ${pp.part_id === state.selected ? "selected" : ""} ${pp.confirmed ? "confirmed" : ""}" data-id="${escape(pp.part_id)}" x="${pp.bbox?.[0] || 0}" y="${pp.bbox?.[1] || 0}" width="${pp.bbox?.[2] || 0}" height="${pp.bbox?.[3] || 0}"/>`,
              )
              .join("")
          : ""}
        ${drawing ? drawingMarkup() : ""}
      </svg>
    </div>
  </div>`;
}

function canCreateMissingWithAI() {
  return Boolean(
    state.aiCapabilities?.primary_configured ||
      state.aiCapabilities?.fallback_configured,
  );
}

function slotCard(definition) {
  const slot = slotState(definition.key);
  const pp = partForSlot(definition.key);
  const confidence =
    Number.isFinite(slot.ai_confidence) ? `${Math.round(slot.ai_confidence * 100)}% AI confidence` : null;
  const status = slot.status || "missing";
  let actions = "";

  if (status === "missing") {
    actions = `<div class="slot-actions">
      ${btn(
        icon("spark") + " Create with AI",
        "create-missing",
        "",
        !canCreateMissingWithAI(),
        `data-slot="${definition.key}" ${!canCreateMissingWithAI() ? 'title="No AI provider is configured in the engine."' : ""}`,
      )}
      ${btn("Manually Select", "manual-slot", "quiet", false, `data-slot="${definition.key}"`)}
      ${btn("Leave Blank", "leave-blank", "quiet", false, `data-slot="${definition.key}"`)}
    </div>`;
  } else if (status === "blank") {
    actions = `<p class="small muted">This slot is intentionally blank for this review.</p>`;
  } else if (pp) {
    actions = `<div class="slot-actions">
      ${btn(status === "uncertain" ? "Review Required" : "Review Part", "select-part", status === "uncertain" ? "warning-action" : "quiet", false, `data-id="${pp.part_id}"`)}
    </div>`;
  }

  return `<article class="slot-card ${status} ${pp?.part_id === state.selected ? "active" : ""}">
    <div class="slot-preview">
      ${pp?.corrected_crop
        ? picture(pp.corrected_crop, definition.label)
        : '<div class="slot-placeholder">' + icon("file") + "</div>"}
    </div>
    <div class="slot-content">
      <div class="row between">
        <strong>${escape(definition.label)}</strong>
        ${badge(slotLabel(status), slotTone(status))}
      </div>
      ${confidence ? `<p class="small muted">${confidence}</p>` : ""}
      ${pp ? `<p class="small muted">${escape(dimensions(pp))} - ${escape(pp.source || "engine")}</p>` : ""}
      ${slot.notes?.length ? `<p class="small muted">${escape(slot.notes.slice(0, 2).join(" "))}</p>` : ""}
      ${actions}
    </div>
  </article>`;
}

function assignedPartIds() {
  return new Set(
    expectedSlots
      .map((def) => state.project?.slots?.[def.key]?.part_id)
      .filter(Boolean),
  );
}

function unassignedParts() {
  const assigned = assignedPartIds();
  return (state.project?.parts || []).filter((pp) => !assigned.has(pp.part_id));
}

function reviewReady() {
  const p = state.project;
  if (!p?.slots) return false;
  const ids = [];
  for (const def of expectedSlots) {
    const slot = p.slots[def.key];
    if (!slot) return false;
    if (slot.status === "blank") continue;
    const pp = p.parts.find((item) => item.part_id === slot.part_id);
    if (!pp || !pp.confirmed || pp.type !== def.type) return false;
    ids.push(pp.part_id);
  }
  if (!ids.length || new Set(ids).size !== ids.length) return false;
  return p.parts.every((pp) => ids.includes(pp.part_id));
}

function definitionMain() {
  const p = state.project;
  const extras = unassignedParts();
  return `<main class="main-column detect-main">
    <section class="card stack">
      <div class="toolbar">
        <div>
          <div class="section-kicker">Human Review Gate</div>
          <h2>8-Part Review</h2>
          <p class="small muted">AI identifies components. ReVector Engine defines the production boundaries.</p>
        </div>
        <div class="tabs">
          ${btn("Reference", "view-original", "tab " + (state.originalView ? "selected" : ""), Boolean(state.draw))}
          ${btn("Boundaries", "view-boundaries", "tab " + (!state.originalView ? "selected" : ""), Boolean(state.draw))}
        </div>
      </div>
      ${artboard()}
      ${state.draw
        ? `<div class="draw-toolbar">
            <p class="small">${state.draw === "add" ? `Select the exact boundary for ${escape(label(state.drawSlot))}.` : state.draw === "geometry" ? "Mark four corners clockwise, starting at top-left." : "Redraw the selected part boundary."}</p>
            <div class="row">
              ${btn("Cancel", "cancel-draw", "quiet")}
              ${btn("Save Boundary", "save-draw", "primary", state.points.length < (state.draw === "geometry" ? 4 : 3))}
            </div>
          </div>`
        : ""}
      ${p.ai_assets?.mockup
        ? '<p class="note warning">The displayed AI production mockup is an intermediate reference only. It is not an editable vector or downloadable master pattern.</p>'
        : ""}
    </section>

    <section class="card stack">
      <div class="row between">
        <div>
          <h2>Production Slots</h2>
          <p class="small muted">Front/Back Body are body panels with collars treated as separate slots.</p>
        </div>
        ${badge(reviewReady() ? "Ready to Confirm" : "Review Required", reviewReady() ? "success" : "warning")}
      </div>
      <div class="slot-grid">
        ${expectedSlots.map(slotCard).join("")}
      </div>
    </section>

    ${extras.length
      ? `<section class="card stack">
          <div class="row between"><h3>Additional Components Requiring Classification</h3>${badge(extras.length, "warning")}</div>
          <p class="small muted">The engine will not approve review while extra components remain unclassified.</p>
          <div class="compact-parts">
            ${extras
              .map(
                (pp) => `<button data-action="select-part" data-id="${pp.part_id}" class="${state.selected === pp.part_id ? "active" : ""}">
                  ${picture(pp.corrected_crop, pp.name)}
                  <span><strong>${escape(pp.name)}</strong><small>${escape(label(pp.type))}</small></span>
                </button>`,
              )
              .join("")}
          </div>
        </section>`
      : ""}

    <section class="card review-confirm-card">
      <div>
        <h2>Confirm Parts</h2>
        <p class="small muted">Vector production begins automatically after the engine accepts all eight slot decisions.</p>
      </div>
      ${btn(icon("check") + " Confirm Parts", "confirm-parts", "primary", !reviewReady() || Boolean(state.draw))}
    </section>
  </main>`;
}

function sizeRequirementOptions() {
  const combined = state.requirements;
  if (!combined.length) return "";
  return `<label>Apply Size Note
    <select name="size-requirement">
      <option value="">Choose a saved size</option>
      ${combined
        .map(
          (r, index) =>
            `<option value="${index}">${escape(r.name)} - ${escape(r.width_mm)} x ${escape(r.height_mm)} mm</option>`,
        )
        .join("")}
    </select>
  </label>`;
}

function partInspector() {
  const pp = part();
  if (!pp)
    return `<aside class="card inspector stack">
      <div class="section-kicker">Part Review</div>
      <h2>Select a Part</h2>
      <p class="muted">Choose a detected or uncertain slot to review its exact engine boundary and classification.</p>
    </aside>`;

  const matchingSlot = expectedSlots.find((def) => state.project?.slots?.[def.key]?.part_id === pp.part_id);
  return `<aside class="card inspector stack">
    <div class="row between">
      <div><div class="section-kicker">Selected Part</div><h2>${escape(pp.name)}</h2></div>
      ${badge(pp.confirmed ? "Confirmed" : "Needs Review", pp.confirmed ? "success" : "warning")}
    </div>
    ${matchingSlot ? `<p class="small muted">Slot: ${escape(matchingSlot.label)}</p>` : '<p class="small muted">This component is not assigned to an eight-part slot yet.</p>'}
    <form id="part-form" class="stack">
      ${field("Part Name", "part-name", pp.name, "text", 'maxlength="120" required')}
      <label>Category
        <select name="part-type" ${state.busy || pp.locked ? "disabled" : ""}>
          ${types.map((type) => `<option value="${type}" ${pp.type === type ? "selected" : ""}>${escape(label(type))}</option>`).join("")}
        </select>
      </label>
      ${sizeRequirementOptions()}
      <div class="divider"></div>
      <h3>Production Dimensions</h3>
      <div class="two-fields">
        ${field("Width (mm)", "part-width", pp.physical_width_mm || "", "number", 'min="0.1" max="10000" step="0.1"')}
        ${field("Height (mm)", "part-height", pp.physical_height_mm || "", "number", 'min="0.1" max="10000" step="0.1"')}
      </div>
      ${checkbox("Keep artwork aspect ratio", "aspect-lock", true)}
      <div class="two-fields">
        ${field("Bleed (mm)", "part-bleed", pp.bleed_mm || 0, "number", 'min="0" max="100" step="0.1"')}
        ${field("Safe Zone (mm)", "part-safe", pp.safe_zone_mm || 0, "number", 'min="0" max="100" step="0.1"')}
      </div>
      <p class="small muted">Dimensions are user-supplied. ReVector never infers physical sewing measurements from pixels.</p>
      ${pp.locked
        ? badge("Part Locked", "warning")
        : btn("Save & Confirm Part", "save-part", "primary full-width")}
      ${btn(pp.locked ? "Unlock Part" : "Lock Part", "lock", "quiet full-width")}
    </form>
    <div class="divider"></div>
    ${btn(icon("pen") + " Redraw Boundary", "draw-update", "", pp.locked)}
    ${btn("Remove Part", "remove-part", "quiet danger", pp.locked)}
  </aside>`;
}

function vectorPartReady(pp) {
  return Boolean(pp?.vector && pp?.cache?.optimize && !pp?.error);
}

function vectorPartTiles() {
  return `<div class="vector-parts">
    ${(state.project?.parts || [])
      .map(
        (pp) => `<button class="vector-part ${state.selected === pp.part_id ? "active" : ""}" data-action="select-part" data-id="${pp.part_id}">
          <div class="vector-part-thumb">${picture(pp.corrected_crop, pp.name)}</div>
          <span><strong>${escape(pp.name)}</strong><small>${escape(pp.processing_state || "Detected")}</small></span>
          ${pp.error ? badge("Failed", "error") : vectorPartReady(pp) ? badge("Vector Ready", "success") : badge("Pending")}
        </button>`,
      )
      .join("")}
  </div>`;
}

function vectorPreview() {
  const pp = part();
  const vectorReady = vectorPartReady(pp);
  const isPaths = state.view === "paths";
  return `<section class="card stack vector-stage">
    <div class="toolbar">
      <div>
        <div class="section-kicker">Selected Vector Part</div>
        <h2>${escape(pp?.name || "Choose a Part")}</h2>
      </div>
      <div class="tabs">
        ${btn("Vector View", "review-view", "tab " + (!isPaths ? "selected" : ""), false, 'data-view="vector"')}
        ${btn("Paths View", "review-view", "tab " + (isPaths ? "selected" : ""), false, 'data-view="paths"')}
      </div>
    </div>
    <div class="wide-preview">
      <div class="preview-pane">
        <div class="row between">
          <span>${isPaths ? "Diagnostic Paths" : "Editable Vector"}</span>
          ${vectorReady
            ? badge(ready() ? "Editable SVG Ready" : "Vector Ready", "success")
            : badge(pp?.error ? "Vectorization Failed" : "Vector Pending", pp?.error ? "error" : "warning")}
        </div>
        <div class="preview-art vector-preview" id="vector-art">
          ${!pp
            ? '<div class="empty-preview">Select a part.</div>'
            : isPaths && pp.previews?.vector_view
              ? picture(pp.previews.vector_view, "Vector path diagnostic")
              : vectorReady
                ? '<div class="empty-preview">Loading real SVG objects...</div>'
                : '<div class="empty-preview">Vector Preview Unavailable. No raster fallback is shown as editable artwork.</div>'}
        </div>
      </div>
    </div>
  </section>`;
}

function vectorControls() {
  const pp = part();
  return `<section class="card stack vector-control-card">
    <div class="row between">
      <h2>Part -> Shape -> Color</h2>
      ${pp && vectorPartReady(pp) ? badge("Real SVG Objects", "purple") : badge("Unavailable")}
    </div>
    <p class="small muted">Select a real shape in Vector View. Fill edits are sent to the engine using the SVG shape ID, then revalidated.</p>
    ${pp?.error ? `<div class="note error">
      <strong>Vectorization Failed</strong><br>
      ${escape(pp.error.message || "The selected part needs isolated recovery.")}
      <div class="row wrap recovery-buttons">
        ${btn("Retry Failed Part", "recover-selected", "primary", false)}
        ${btn("Use Fallback Trace", "recover-selected-fallback", "quiet", false)}
      </div>
    </div>` : ""}
    <div class="selected-shape-box">
      <span class="small muted">Selected Shape</span>
      <strong id="shape-label">${escape(state.shape || "None")}</strong>
    </div>
    <input type="color" class="color-input" id="shape-color" aria-label="Selected shape fill" value="#6d3dee" ${!state.shape || state.busy ? "disabled" : ""}>
    ${btn("Apply Color & Revalidate", "apply-fill", "primary full-width", !state.shape)}
    <div class="divider"></div>
    <h3>Artwork Palette</h3>
    <div class="swatches">
      ${(pp?.palette || [])
        .slice(0, 24)
        .map((color) => {
          const value = /^#[0-9a-f]{6}$/i.test(color.hex || "") ? color.hex : null;
          return value
            ? `<button class="swatch" style="background:${value}" data-action="palette" data-color="${value}" aria-label="Use palette color ${value}"></button>`
            : "";
        })
        .join("") || '<span class="small muted">No engine palette is available for this part.</span>'}
    </div>
  </section>`;
}

function vectorMain() {
  return `<main class="main-column vector-main">
    <section class="card stack">
      <div class="row between">
        <div><div class="section-kicker">Production Geometry</div><h2>Vector Parts</h2></div>
        ${badge(state.busy ? "Processing" : ready() ? "Validated" : "Review Vectors", state.busy ? "purple" : ready() ? "success" : "warning")}
      </div>
      ${vectorPartTiles()}
    </section>
    <div class="vector-split">
      <div class="stack">
        ${vectorPreview()}
        <section class="card source-reference-card">
          <div><strong>Source / Engine Reference</strong><p class="small muted">Reference only - never presented as editable vector.</p></div>
          ${part() ? picture(part().clean_reference || part().corrected_crop, "Selected source reference") : ""}
        </section>
      </div>
      <div class="stack">
        ${state.busy ? processingPanel("Vector Production") : vectorControls()}
      </div>
    </div>
  </main>`;
}

function partValidation(pp) {
  return state.project?.validation?.parts?.find((item) => item.part_id === pp.part_id) || null;
}

function validationMain() {
  const v = state.project?.validation;
  const pass = ready();
  return `<main class="main-column validation-main">
    <div class="validation-split">
      <section class="card stack">
        <div>
          <div class="section-kicker">Completed Vector Parts</div>
          <h2>Vector Output</h2>
        </div>
        <div class="validation-parts">
          ${(state.project?.parts || [])
            .map((pp) => {
              const report = partValidation(pp);
              return `<button data-action="select-part" data-id="${pp.part_id}" class="validation-part ${state.selected === pp.part_id ? "active" : ""}">
                ${picture(pp.corrected_crop, pp.name)}
                <span><strong>${escape(pp.name)}</strong><small>${report ? `${report.paths || 0} paths - ${report.rasters || 0} rasters` : "No validation result"}</small></span>
                ${report?.status === "PASS" ? badge("PASS", "success") : pp.error ? badge("Failed", "error") : badge("Pending", "warning")}
              </button>`;
            })
            .join("")}
        </div>
      </section>
      <section class="card stack validation-results">
        <div class="row between">
          <div><div class="section-kicker">Deterministic Validation</div><h2>${state.busy ? "Validation Running" : pass ? "Validation Completed" : v ? "Validation Failed" : "Validation Pending"}</h2></div>
          ${badge(pass ? "PASS" : v ? "FAIL" : "Pending", pass ? "success" : v ? "error" : "warning")}
        </div>
        ${state.busy
          ? processingPanel("Validation")
          : `<div class="report-metrics">
              ${[
                ["Embedded Rasters", v?.embedded_rasters],
                ["Vector Paths", v?.vector_paths ?? v?.path_count],
                ["Editable Objects", v?.editable_objects],
                ["Geometry Integrity", v?.geometry_integrity],
              ]
                .map(
                  ([key, value]) =>
                    `<div><span>${key}</span><strong>${value === undefined || value === null ? "--" : escape(value)}</strong></div>`,
                )
                .join("")}
            </div>
            <div class="compatibility-row">
              <span>Illustrator Compatibility</span>
              ${badge(v?.illustrator_compatibility || "Not validated", v?.illustrator_compatibility === "PASS" ? "success" : v?.illustrator_compatibility ? "warning" : "")}
            </div>
            <p class="small muted">${escape(v?.compatibility_scope || "Static compatibility is reported by the engine; Adobe Illustrator application acceptance is not claimed.")}</p>
            ${btn("View Validation Report", "report", "quiet full-width", !v)}
            ${!pass && v
              ? `<div class="validation-recovery">
                  <p class="note warning">Download remains blocked until deterministic validation passes.</p>
                  ${btn("Open Error Assistant", "assistant-toggle", "primary")}
                </div>`
              : ""}`}
      </section>
    </div>
  </main>`;
}

function formatSupport(format) {
  const deps = state.health?.dependencies || state.health?.capabilities || {};
  if (format === "svg") return { enabled: true, note: "Canonical editable vector" };
  if (format === "pdf")
    return {
      enabled: Boolean(deps.inkscape && deps.pdfinfo && deps.pdfimages),
      note: "Requires Inkscape + Poppler validation",
    };
  if (format === "eps")
    return {
      enabled: Boolean(deps.inkscape && deps.pdfinfo && deps.pdfimages && deps.ghostscript),
      note: "Requires Inkscape + Poppler + Ghostscript",
    };
  return { enabled: false, note: "Native AI export is unavailable" };
}

function downloadMain() {
  const p = state.project;
  const selectedCount = state.selectedExports.size;
  return `<main class="main-column download-main">
    <section class="card stack">
      <div class="row between">
        <div>
          <div class="section-kicker">Validated Individual Parts</div>
          <h2>Download</h2>
          <p class="small muted">ReVector exports parts only. It does not expose an assembled or master production pattern.</p>
        </div>
        ${btn(selectedCount === p.parts.length ? "Deselect All" : "Select All", "select-all", "quiet")}
      </div>
      <div class="download-parts">
        ${p.parts
          .map((pp) => {
            const report = partValidation(pp);
            const validated = ready() && report?.status === "PASS";
            return `<label class="download-part ${state.selectedExports.has(pp.part_id) ? "selected" : ""}">
              <input type="checkbox" name="export-part" value="${pp.part_id}" ${state.selectedExports.has(pp.part_id) ? "checked" : ""}>
              <div class="download-thumb">${picture(pp.corrected_crop, pp.name)}</div>
              <span><strong>${escape(pp.name)}</strong><small>${escape(dimensions(pp))}</small></span>
              ${validated ? badge("Validated", "success") : badge("Validation Required", "warning")}
            </label>`;
          })
          .join("")}
      </div>
    </section>

    <section class="card stack">
      <div>
        <h2>Export Formats</h2>
        <p class="small muted">Only engine-supported formats can be selected. Native Adobe .AI is not generated or renamed from another format.</p>
      </div>
      <div class="formats export-formats">
        ${["svg", "eps", "pdf", "ai"]
          .map((format) => {
            const support = formatSupport(format);
            const selected = state.downloadFormats.has(format);
            return `<button class="format ${selected ? "selected" : ""}" data-action="format-toggle" data-format="${format}" ${support.enabled ? "" : "disabled"} aria-pressed="${selected}" title="${escape(support.note)}">
              <strong>${format.toUpperCase()}</strong>
              <small>${escape(support.note)}</small>
            </button>`;
          })
          .join("")}
      </div>
    </section>

    <section class="card production-pack-card">
      <div class="pack-copy">
        <div class="section-kicker">Production Handoff</div>
        <h2>Production Pack</h2>
        <p class="muted">ZIP may contain selected individual vector formats, individual previews, palette, project metadata, validation report and Illustrator handoff information. No assembled/master pattern is included.</p>
        <p class="small muted">${selectedCount} selected part${selectedCount === 1 ? "" : "s"} - ${[...state.downloadFormats].map((f) => f.toUpperCase()).join(", ")}</p>
      </div>
      <div class="download-primary-actions">
        ${btn(icon("download") + " Download Selected Parts", "download-selected", "primary download-primary", !ready() || !selectedCount)}
        ${btn(icon("download") + " Download Production Pack", "download-pack", "primary download-primary", !ready())}
      </div>
    </section>

    <section class="card post-download">
      <div><h3>Create Full Pattern with Illusion AI</h3><p class="small muted">Available Soon</p></div>
      <button disabled>Available Soon</button>
      <div><h3>Continue in Illustration Workspace</h3><p class="small muted">Available Soon</p></div>
      <button disabled>Available Soon</button>
    </section>
  </main>`;
}

function connectionStatus() {
  const allReady = Object.values(state.connections).every((status) => status === "connected");
  return `<section class="connection-status" aria-label="Connection status" role="status">
    <div class="connection-segments">
      ${["server", "engine", "tool"]
        .map((key) => {
          const status = state.connections[key];
          const text =
            status === "connected"
              ? `${label(key)} connected`
              : status === "failed"
                ? `${label(key)} failed`
                : status === "waiting"
                  ? `${label(key)} waiting`
                  : `${label(key)} connecting`;
          return `<div class="connection-segment ${status}" data-connection="${key}">
            <span class="status-light" aria-hidden="true"></span>
            <span>${text}</span>
            ${status === "failed" ? btn("Retry", "retry-connection", "connection-retry", false, `data-segment="${key}" aria-label="Retry ${key} connection"`) : ""}
          </div>`;
        })
        .join("")}
    </div>
    <span class="connection-summary ${allReady ? "ready" : ""}">${allReady ? "Ready" : state.connecting ? "Connecting..." : "Not ready"}</span>
  </section>`;
}

function menuPopover() {
  if (!state.menuOpen) return "";
  return `<div class="menu-popover" role="dialog" aria-label="JerseyOS Menu">
    <div class="row between"><strong>JerseyOS Menu</strong>${badge("Available Soon")}</div>
    <p class="small muted">More tools and workspace options</p>
  </div>`;
}

function connectionLost() {
  if (state.networkOnline && !state.reconnecting) return "";
  return `<div class="connection-lost" role="alert">
    <div>${icon("wifi")}</div>
    <div><strong>Connection Lost</strong><p>Internet connection is unavailable.</p></div>
    ${btn(icon("refresh") + " Retry Connection", "retry-connection", "primary")}
  </div>`;
}

function recoveryLabel(action) {
  return {
    retry_stage: "Retry Stage",
    retry_part: "Retry Failed Part",
    use_fallback_trace: "Use Fallback Trace",
    open_manual_editor: "Open Manual Editor",
    return_to_detect_parts: "Return to Detect Parts",
    reselect_part: "Reselect Part",
    revalidate: "Validate Again",
    view_validation_report: "View Validation Report",
    view_error_details: "View Error Details",
    refresh_connection: "Retry Connection",
    restart_upload: "Replace Artwork",
  }[action] || label(action);
}

function errorAssistant() {
  if (!state.error) return "";
  if (!state.assistantOpen) {
    return state.assistantMinimized
      ? `<button class="assistant-pill" data-action="assistant-toggle">${icon("alert")} ReVector Assistant</button>`
      : "";
  }

  const advice = state.assistantAdvice || {};
  const engaged = Boolean(state.assistantEngaged);
  const supported = Array.isArray(advice.supported_actions) ? advice.supported_actions : [];
  const ordered = [
    advice.recommended_action,
    ...(advice.secondary_actions || []),
    ...supported,
  ].filter((value, index, list) => value && supported.includes(value) && list.indexOf(value) === index);

  return `<div class="assistant-shell" role="dialog" aria-modal="false" aria-label="ReVector Assistant">
    <section class="assistant-card">
      <header>
        <div>
          <div class="assistant-title">${icon("spark")}<span><strong>ReVector Assistant</strong><small>AI Support • Error Detected</small></span></div>
        </div>
        <div class="row">
          ${btn("-", "assistant-no", "icon-button quiet", false, 'aria-label="Minimize assistant"')}
          ${btn(icon("close"), "assistant-no", "icon-button quiet", false, 'aria-label="Close assistant"')}
        </div>
      </header>
      <div class="assistant-body stack">
        <div class="assistant-source">
          ${badge(advice.source === "ai" ? "AI Guidance" : "Local Guidance", advice.source === "ai" ? "purple" : "")}
          ${advice.cause_status ? badge(`Cause: ${advice.cause_status}`) : ""}
        </div>
        <div>
          <h2>${escape(advice.title || "Processing issue")}</h2>
          <p class="muted">${escape(advice.explanation || state.error.message)}</p>
        </div>
        <div class="error-summary">
          <strong>What happened</strong>
          <p>${escape(state.error.message || "The operation could not be completed.")}</p>
          <small>${escape(state.error.phase || "request")}</small>
        </div>

        ${!engaged
          ? `<div class="assistant-question">
              <strong>Would you like help resolving this issue?</strong>
              <div class="row">
                ${btn("Yes, Help Me", "assistant-help", "primary")}
                ${btn("No", "assistant-no", "quiet")}
              </div>
            </div>`
          : `<div class="assistant-guidance">
              <p>${escape(advice.user_message || advice.explanation || "")}</p>
              ${advice.likely_causes?.length
                ? `<div><strong>Likely reason</strong><p class="small muted">${escape(advice.likely_causes.join(" "))}</p></div>`
                : ""}
              <div class="assistant-actions">
                ${ordered
                  .map((action, index) =>
                    btn(
                      recoveryLabel(action),
                      "assistant-action",
                      index === 0 ? "primary" : "quiet",
                      false,
                      `data-recovery="${action}"`,
                    ),
                  )
                  .join("") || '<p class="small muted">No executable recovery action is supported for this error. Your current project remains unchanged.</p>'}
              </div>
              <div class="assistant-followup">
                <label>Ask about this error
                  <input id="assistant-question" maxlength="1000" placeholder="Ask a short follow-up question">
                </label>
                ${btn("Ask", "assistant-send", "quiet")}
              </div>
            </div>`}

        ${state.assistantShowDetails
          ? `<details open class="error-details"><summary>Safe error details</summary><pre>${escape(JSON.stringify({
              error_id: state.error.error_id,
              error_code: state.error.error_code || state.error.code,
              category: state.error.category,
              phase: state.error.phase,
              retryable: state.error.retryable,
              recoverable: state.error.recoverable,
              technical_summary: state.error.technical_summary,
            }, null, 2))}</pre></details>`
          : ""}
      </div>
    </section>
  </div>`;
}

function footer() {
  let message = "Your original artwork is preserved by the engine.";
  let action = "";
  if (state.busy) {
    message = "A real engine job is active. Safe workspace inspection remains available.";
    action = state.job?.job_id ? btn("Cancel Job", "cancel", "quiet danger") : "";
  } else if (state.step === 2) {
    message = reviewReady()
      ? "All eight slots are resolved. Confirming starts vector production automatically."
      : "Resolve every slot and confirm real detected parts before production.";
    action = btn("Confirm Parts", "confirm-parts", "primary", !reviewReady());
  } else if (state.step === 4) {
    message = ready()
      ? "Deterministic validation passed."
      : "Validation must pass before download.";
  } else if (state.step === 5) {
    message = "Choose individual parts and formats. Full/master pattern export is intentionally unavailable.";
  }
  return `<footer class="bottom-bar"><p class="small muted">${escape(message)}</p><div class="actions">${action}</div></footer>`;
}

function uploadStatusDialog() {
  if (!(state.busy && state.operation === "Uploading Artwork")) return "";
  return `<div class="upload-status-dialog" role="status" aria-live="polite">
    <span class="spinner" aria-hidden="true"></span>
    <div><strong>Uploading Artwork...</strong><p>Preparing your file for processing.</p></div>
  </div>`;
}

function render() {
  const p = state.project;
  const max = highestStep();
  app.innerHTML = `<header class="topbar">
      <div class="brand"><span class="brand-mark">${icon("pen")}</span><h1>ReVector</h1></div>
      <div class="topbar-center" aria-hidden="true"></div>
      <div class="right">
        ${btn("New Artwork", "new-project", "quiet")}
        ${btn(icon("menu"), "menu-toggle", "icon-button menu-button", false, 'aria-label="Open JerseyOS menu"')}
      </div>
      ${menuPopover()}
    </header>
    ${connectionStatus()}
    ${connectionLost()}
    ${uploadStatusDialog()}
    <nav class="stepper" aria-label="Processing workflow">
      ${stages
        .map(
          (stageName, index) => `<button class="step ${state.step === index ? "active" : index < state.step ? "complete" : ""}" data-action="navigate" data-step="${index}" ${index > max ? "disabled" : ""}>
            <span class="step-number">${index < state.step ? icon("check") : index + 1}</span>
            <span><strong>${stageName}</strong><small>${state.step === index ? "Current step" : index < state.step ? "Complete" : "Upcoming"}</small></span>
          </button>`,
        )
        .join("")}
    </nav>
    ${state.error && !state.assistantOpen
      ? `<div class="status-error" role="alert"><strong>${escape(state.error.error_code || state.error.code)}</strong><span>${escape(state.error.message)}</span>${btn("Open Assistant", "assistant-toggle", "quiet")}${btn("Dismiss", "dismiss-error", "quiet")}</div>`
      : ""}
    <div class="workspace">
      ${state.step < 2 ? settingsPanel() : state.step === 2 ? partInspector() : ""}
      ${state.step === 0
        ? inputMain()
        : state.step === 1
          ? analysisMain()
          : state.step === 2
            ? definitionMain()
            : state.step === 3
              ? vectorMain()
              : state.step === 4
                ? validationMain()
                : downloadMain()}
      ${state.step < 2
        ? `<aside class="card inspector stack">
            <div class="section-kicker">Production Principles</div>
            <h2>AI understands. Engine measures.</h2>
            <p class="small muted">AI may analyze, enhance and create an intermediate mockup. ReVector Engine owns boundaries, vector geometry, validation and part exports.</p>
            <div class="divider"></div>
            <strong>Eight logical slots</strong>
            <p class="small muted">Left/Right Sleeve, Front/Back Body, Front/Back Collar, Top/Bottom Trim.</p>
          </aside>`
        : ""}
    </div>
    ${footer()}
    ${errorAssistant()}`;

  bindCanvas();
  if (state.step === 3 && !state.busy && state.view === "vector") loadVector();
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("revector:state-rendered"));
}

async function loadVector() {
  const pp = part();
  const container = document.querySelector("#vector-art");
  if (!pp || !container || !vectorPartReady(pp)) return;
  const id = pp.part_id;
  const version = state.project.updated_at;
  const constructed = `projects/${state.project.project_id}/vectors/${id}.svg`;
  const url = artifact(pp.vector) || artifact(constructed);
  if (!url) return;

  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const raw = await response.text();
    if (
      state.selected !== id ||
      state.project.updated_at !== version ||
      !container.isConnected
    )
      return;

    const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
    if (doc.querySelector("parsererror,script,foreignObject,image")) return;
    const svg = doc.documentElement;
    for (const element of svg.querySelectorAll("*")) {
      for (const attribute of [...element.attributes]) {
        if (
          attribute.name.startsWith("on") ||
          /(?:https?:|javascript:|data:)/i.test(attribute.value)
        )
          return;
      }
    }

    container.replaceChildren(document.importNode(svg, true));
    state.editSvg = raw;
    const live = container.firstElementChild;
    for (const shape of live.querySelectorAll(
      "path[id],rect[id],circle[id],ellipse[id],polygon[id],polyline[id],line[id]",
    )) {
      if (shape.closest("defs") || shape.closest('[display="none"]')) continue;
      shape.classList.add("editable-shape");
      shape.addEventListener("click", (event) => {
        event.stopPropagation();
        live
          .querySelectorAll(".selected-shape")
          .forEach((item) => item.classList.remove("selected-shape"));
        shape.classList.add("selected-shape");
        state.shape = shape.id;
        const shapeLabel = document.querySelector("#shape-label");
        if (shapeLabel) shapeLabel.textContent = shape.id;
        const input = document.querySelector("#shape-color");
        if (input) {
          input.disabled = false;
          input.value = /^#[0-9a-f]{6}$/i.test(shape.getAttribute("fill") || "")
            ? shape.getAttribute("fill")
            : "#6d3dee";
        }
        const apply = document.querySelector('[data-action="apply-fill"]');
        if (apply) apply.disabled = false;
      });
    }
  } catch {
    const empty = container.querySelector(".empty-preview");
    if (empty)
      empty.textContent =
        "Vector Preview Unavailable. The validated SVG could not be loaded.";
  }
}

function bindCanvas() {
  const canvas = document.querySelector("#boundary-canvas");
  if (!canvas) return;
  canvas.addEventListener("click", (event) => {
    if (!state.draw) {
      const id = event.target.dataset.id;
      if (id) {
        state.selected = id;
        state.shape = null;
        render();
      }
      return;
    }
    if (state.busy) return;
    if (state.draw === "geometry" && state.points.length === 4) return;
    const box = canvas.getBoundingClientRect();
    const [w, h] = correctedSize();
    state.points.push([
      Math.round(
        Math.min(w - 1, Math.max(0, ((event.clientX - box.left) / box.width) * w)),
      ),
      Math.round(
        Math.min(h - 1, Math.max(0, ((event.clientY - box.top) / box.height) * h)),
      ),
    ]);
    canvas.innerHTML = drawingMarkup();
    const save = document.querySelector('[data-action="save-draw"]');
    if (save)
      save.disabled = state.points.length < (state.draw === "geometry" ? 4 : 3);
  });
}

export { render, highestStep, reviewReady, loadVector };
