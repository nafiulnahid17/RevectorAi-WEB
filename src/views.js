import { account, currentPath } from "./account-model.js";
import { accountMarkup, profileMenu } from "./account-views.js";
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

function connectionDisplay(key) {
  const status = state.connections[key] || "pending";
  const word =
    status === "connected"
      ? "Connected"
      : status === "failed"
        ? "Failed"
        : status === "waiting"
          ? "Waiting"
          : "Connecting";
  return { status, word };
}

function uploadHeaderConnectionCard(key, title) {
  const current = connectionDisplay(key);
  return `<div class="upload-header-card connection-segment ${current.status}" data-connection="${key}">
    <span class="upload-header-icon status-light" aria-hidden="true"></span>
    <span class="upload-header-copy"><strong>${escape(title)}</strong><small>${escape(current.word)}</small></span>
    ${current.status === "failed"
      ? btn("Retry", "retry-connection", "connection-retry", false, `data-segment="${key}" aria-label="Retry ${key} connection"`)
      : ""}
  </div>`;
}

function uploadHeaderAiCard(kind, title) {
  const status = aiEngineStatus(kind);
  return `<div class="upload-header-card ai ${status.tone}">
    <span class="upload-ai-symbol" aria-hidden="true">${icon(kind === "primary" ? "spark" : "refresh")}</span>
    <span class="upload-header-copy"><strong>${escape(title)}</strong><small title="${escape(status.detail)}">${escape(status.label)}</small></span>
  </div>`;
}

function uploadHeaderStatuses() {
  return `<div class="upload-header-statuses" aria-label="Live system status">
    ${uploadHeaderConnectionCard("server", "Server")}
    ${uploadHeaderConnectionCard("engine", "Engine")}
    ${uploadHeaderConnectionCard("tool", "Tool")}
    ${uploadHeaderAiCard("primary", "Primary AI")}
    ${uploadHeaderAiCard("fallback", "Fallback AI")}
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

function uploadStrategyCard(value, title, subtitle, iconName) {
  const selected = state.preset === value;
  return `<button class="upload-strategy-card ${selected ? "selected" : ""}" data-action="preset" data-value="${value}" aria-pressed="${selected}">
    <span class="upload-strategy-icon">${icon(iconName)}</span>
    <strong>${escape(title)}</strong>
    <small>${escape(subtitle)}</small>
  </button>`;
}

function fileTypeFromName(filename) {
  const match = String(filename || "").match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : "Unavailable";
}

function uploadFileCard(meta) {
  const p = state.project;
  if (!p?.source_file) return "";
  return `<section class="upload-file-card">
    <div class="upload-file-thumb">
      ${p.thumbnail
        ? picture(p.thumbnail, "Uploaded artwork")
        : `<div class="upload-empty-thumb">${icon("file")}</div>`}
    </div>
    <div class="upload-file-copy">
      <strong>${escape(meta.filename)}</strong>
      <p>${escape(meta.size)}${meta.dimensions !== "Dimensions unavailable" ? ` • ${escape(meta.dimensions)}` : ""}</p>
      <span class="upload-file-ready">${icon("check")} Artwork uploaded</span>
      <div class="upload-file-actions">
        ${btn(icon("refresh") + " Replace", "upload", "primary", !state.health)}
        ${btn("Use Template", "noop", "", true, 'title="Available Soon"')}
        ${btn("Use Existing Image", "noop", "", true, 'title="Available Soon"')}
        ${btn(icon("trash"), "delete-artwork", "icon-button danger", false, 'aria-label="Delete Artwork"')}
      </div>
    </div>
  </section>`;
}

function inputMain() {
  const uploaded = Boolean(state.project?.source_file);
  const meta = sourceMeta();
  return `<main class="main-column upload-reference-main">
    <section class="upload-hero-copy">
      <div>
        <span class="upload-step-label">Step 1 of 8</span>
        <h1>Upload Your Jersey Artwork</h1>
        <p>Start by uploading a jersey image or design file. ReVector will prepare the real source for analysis and vectorization.</p>
      </div>
      <button class="upload-template-card" disabled title="Available Soon">
        <span class="upload-template-icon">${icon("file")}</span>
        <span><strong>Need a template?</strong><small>Available Soon</small></span>
        <span aria-hidden="true">›</span>
      </button>
    </section>

    <section class="upload-reference-card">
      <div class="dropzone upload-reference-dropzone ${uploaded ? "has-artwork" : ""}" id="dropzone">
        <div class="upload-reference-icon">${icon("upload")}</div>
        <h2>${uploaded ? "Upload another jersey artwork" : "Drag & drop your jersey artwork here"}</h2>
        <p>or click to browse files</p>
        <div class="upload-format-chips" aria-label="Supported upload formats">
          <span>PNG</span><span>JPG</span><span>JPEG</span><span>WEBP</span>
        </div>
        <small>Maximum file size: 50 MB • High-resolution images recommended</small>
        ${btn(icon("upload") + " Choose Artwork", "upload", "upload-browse-button", !state.health)}
      </div>
    </section>

    ${uploadFileCard(meta)}
    ${requirements()}
  </main>`;
}

function uploadSetupPanel() {
  const p = state.project;
  const uploaded = Boolean(p?.source_file);
  const meta = sourceMeta();
  const artName = p?.name || state.projectName || "";
  return `<aside class="upload-setup-panel">
    <section class="upload-setup-section">
      <div class="upload-panel-heading"><span>Artwork Setup</span><span title="Values shown here come from the current workspace.">ⓘ</span></div>
      <label class="upload-field">Art Name
        <input name="project-name" type="text" value="${escape(artName)}" placeholder="Enter artwork name" maxlength="120" ${p ? 'readonly aria-readonly="true"' : ""} ${state.busy ? "disabled" : ""}>
      </label>
      <div class="upload-field-label">Vector Strategy</div>
      <div class="upload-strategy-grid">
        ${uploadStrategyCard("BALANCED", "Balanced", "Recommended", "file")}
        ${uploadStrategyCard("FAST", "Clean", "Simpler vectors", "spark")}
        ${uploadStrategyCard("ULTRA", "Detailed", "Maximum accuracy", "settings")}
      </div>
    </section>

    <section class="upload-setup-section">
      <div class="upload-panel-heading"><span>Source Preview</span></div>
      <div class="upload-source-preview ${uploaded ? "has-source" : ""}">
        ${uploaded && p?.thumbnail
          ? picture(p.thumbnail, "Source preview")
          : `<div class="upload-source-empty">${icon("file")}<span>Preview appears after a real upload</span></div>`}
      </div>
    </section>

    <section class="upload-setup-section upload-file-info">
      <div class="upload-panel-heading"><span>File Information</span><span aria-hidden="true">⌄</span></div>
      <div class="upload-info-row"><span>${icon("file")} File Name</span><strong>${escape(uploaded ? meta.filename : "Unavailable")}</strong></div>
      <div class="upload-info-row"><span>${icon("file")} File Size</span><strong>${escape(uploaded ? meta.size : "Unavailable")}</strong></div>
      <div class="upload-info-row"><span>${icon("ruler")} Dimensions</span><strong>${escape(uploaded ? meta.dimensions.replace("Dimensions unavailable", "Unavailable") : "Unavailable")}</strong></div>
      <div class="upload-info-row"><span>${icon("file")} File Type</span><strong>${escape(uploaded ? fileTypeFromName(meta.filename) : "Unavailable")}</strong></div>
    </section>

    <details class="upload-advanced">
      <summary>Advanced Processing</summary>
      <div class="upload-advanced-body">
        <label>Vector Mode
          <select name="vector-mode" ${state.busy ? "disabled" : ""}>
            ${[
              ["color", "Color trace"],
              ["precision", "Precision shapes"],
              ["mono", "Single-color logo"],
              ["reconstruction", "Layer reconstruction"],
            ].map(([value,text]) => `<option value="${value}" ${state.mode === value ? "selected" : ""}>${text}</option>`).join("")}
          </select>
        </label>
        ${checkbox("Reduce image noise", "noise", p?.settings?.noise_reduction ?? true)}
        ${checkbox("Preserve source colors", "colors", p?.settings?.preserve_original_colors ?? true)}
        ${checkbox("Detect text (OCR)", "ocr", p?.settings?.ocr ?? false)}
      </div>
    </details>
  </aside>`;
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

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedPercent(value) {
  const number = finiteNumber(value);
  if (number === null || number < 0 || number > 1) return null;
  return Math.round(number * 1000) / 10;
}

function rgbToHex(rgb) {
  if (!Array.isArray(rgb) || rgb.length < 3) return null;
  const channels = rgb.slice(0, 3).map((value) => {
    const number = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
    return number.toString(16).padStart(2, "0");
  });
  return "#" + channels.join("");
}

function analysisEvents() {
  const stored = Array.isArray(state.project?.events)
    ? state.project.events.map((event) => typeof event === "string" ? event : event?.event).filter(Boolean)
    : [];
  const current = state.job?.process_event?.event;
  return { stored, current };
}

function analysisPipeline() {
  const sequence = [
    ["UPLOAD_RECEIVED", "File loaded"],
    ["ANALYZING_ARTWORK", "Artwork analysis"],
    ["ENHANCING_ARTWORK", "Image enhancement"],
    ["CREATING_PATTERN_MOCKUP", "Production reference"],
    ["IDENTIFYING_PARTS", "Part identification"],
    ["REFINING_PART_BOUNDARIES", "Boundary refinement"],
    ["PART_REVIEW_READY", "Part review preparation"],
  ];
  const { stored, current } = analysisEvents();
  const observed = [...stored, current].filter(Boolean);
  const furthest = Math.max(-1, ...observed.map((name) => sequence.findIndex(([event]) => event === name)));
  return sequence.map(([event, text], index) => {
    const complete = stored.includes(event) || index < furthest || (event === "UPLOAD_RECEIVED" && Boolean(state.project?.source_file));
    const active = current === event && !["SUCCEEDED", "FAILED", "CANCELLED"].includes(state.job?.job_state);
    const tone = complete ? "complete" : active ? "active" : "pending";
    return `<div class="analysis-stage ${tone}">
      <span class="analysis-stage-dot">${complete ? icon("check") : ""}</span>
      <span><strong>${escape(text)}</strong><small>${complete ? "Complete" : active ? "In progress" : "Pending"}</small></span>
    </div>`;
  }).join("");
}

function analysisOverlayPreview() {
  const p = state.project;
  const source = p?.corrected_image || p?.working_image || p?.thumbnail;
  if (!source)
    return `<div class="analysis-empty-preview">${icon("file")}<span>No analysis reference is available yet.</span></div>`;

  const [w, h] = correctedSize();
  const parts = Array.isArray(p?.parts) ? p.parts : [];
  const overlays = parts.map((pp) => {
    if (Array.isArray(pp.polygon) && pp.polygon.length >= 3)
      return `<polygon points="${pp.polygon.map((point) => point.join(",")).join(" ")}"></polygon>`;
    if (Array.isArray(pp.bbox) && pp.bbox.length >= 4)
      return `<rect x="${pp.bbox[0]}" y="${pp.bbox[1]}" width="${pp.bbox[2]}" height="${pp.bbox[3]}"></rect>`;
    return "";
  }).join("");

  return `<div class="analysis-overlay-art">
    <img src="${artifact(source)}" alt="Analysis reference">
    ${overlays ? `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Detected engine boundaries">${overlays}</svg>` : ""}
  </div>`;
}

function analysisMetricBar(title, value) {
  const percent = normalizedPercent(value);
  if (percent === null) return "";
  return `<div class="analysis-quality-row">
    <div><span>${escape(title)}</span><strong>${escape(percent)}%</strong></div>
    <div class="analysis-quality-track"><span style="width:${percent}%"></span></div>
  </div>`;
}

function analysisQualityRows() {
  const q = state.project?.analysis?.quality || {};
  const rows = [
    analysisMetricBar("Blur score", q.blur_score),
    analysisMetricBar("Contrast", q.contrast),
    analysisMetricBar("Brightness", q.brightness),
    analysisMetricBar("Noise score", q.noise_score),
    analysisMetricBar("Possible glare", q.possible_glare_fraction),
    analysisMetricBar("Possible shadow", q.possible_shadow_fraction),
  ].filter(Boolean);
  return rows.length ? rows.join("") : '<p class="analysis-empty-copy">Quality metrics are not available yet.</p>';
}

function analysisPalette() {
  const colors = Array.isArray(state.project?.analysis?.dominant_colors)
    ? state.project.analysis.dominant_colors
    : [];
  if (!colors.length)
    return '<p class="analysis-empty-copy">No dominant colors are available yet.</p>';
  return `<div class="analysis-palette">${colors.slice(0, 8).map((color) => {
    const hex = rgbToHex(color?.rgb);
    if (!hex) return "";
    const fraction = normalizedPercent(color?.fraction);
    return `<span class="analysis-swatch" style="--swatch:${hex}" title="${hex}${fraction === null ? "" : ` • ${fraction}%`}"></span>`;
  }).join("")}</div>
  <small>${colors.length} dominant color${colors.length === 1 ? "" : "s"} reported by the engine</small>`;
}

function analysisSourceCard() {
  const p = state.project;
  const meta = sourceMeta();
  return `<section class="analysis-preview-card">
    <header><span>${icon("file")}<strong>Source Artwork</strong></span>${p?.source_file ? badge("Uploaded", "success") : badge("Unavailable")}</header>
    <div class="analysis-preview-art">
      ${p?.working_image || p?.thumbnail
        ? picture(p.working_image || p.thumbnail, "Source artwork")
        : `<div class="analysis-empty-preview">${icon("file")}<span>Source preview unavailable</span></div>`}
    </div>
    <footer>
      <span>${escape(meta.filename)}</span>
      <small>${escape(meta.size)}${meta.dimensions !== "Dimensions unavailable" ? ` • ${escape(meta.dimensions)}` : ""}</small>
    </footer>
  </section>`;
}

function analysisReferenceCard() {
  const parts = state.project?.parts || [];
  return `<section class="analysis-preview-card analysis-reference-card">
    <header><span>${icon("spark")}<strong>Analysis Preview</strong></span>${parts.length ? badge("Real Boundaries", "purple") : badge("Engine Reference")}</header>
    <div class="analysis-preview-art">${analysisOverlayPreview()}</div>
    <footer>
      <span>${parts.length ? `${parts.length} detected component${parts.length === 1 ? "" : "s"}` : "Waiting for detected structure"}</span>
      <small>${parts.length ? "Boundary overlay comes from engine geometry." : "No structure overlay is fabricated."}</small>
    </footer>
  </section>`;
}

function analysisProgressCard() {
  const p = state.project;
  const hasAnalysis = Boolean(p?.analysis && Object.keys(p.analysis).length);
  const running = Boolean(state.busy && state.step === 1);
  const process = running ? currentProcess() : hasAnalysis ? "Analysis data available" : "Waiting for analysis";
  return `<section class="analysis-progress-card" aria-live="polite">
    <div class="analysis-progress-head">
      <div class="analysis-progress-ring ${hasAnalysis && !running ? "complete" : running ? "running" : ""}">
        <span>${hasAnalysis && !running ? icon("check") : running ? "LIVE" : "—"}</span>
      </div>
      <div><strong>Analysis Progress</strong><p>${escape(process)}</p></div>
    </div>
    <div class="analysis-stage-list">${analysisPipeline()}</div>
    <div class="analysis-progress-state">
      <span>Job state</span><strong>${escape(state.job?.job_state || p?.state || "Unavailable")}</strong>
    </div>
  </section>`;
}

function analysisInsights() {
  const p = state.project;
  const meta = sourceMeta();
  const analysis = p?.analysis || {};
  const q = analysis.quality || {};
  const resolution = analysis.resolution || {};
  const sharpness = finiteNumber(q.sharpness_laplacian_variance);
  const blocking = normalizedPercent(q.compression_blocking_estimate);
  const parts = Array.isArray(p?.parts) ? p.parts : [];
  const preset = presetUiName(p?.settings?.preset || state.preset) || p?.settings?.preset || state.preset || "Unavailable";
  const vectorMode = p?.settings?.vector_mode || state.mode || "Unavailable";

  return `<section class="analysis-insights">
    <h3>Analysis Insights</h3>
    <div class="analysis-insight-grid">
      <article>
        <span class="analysis-insight-icon">${icon("file")}</span>
        <strong>File Information</strong>
        <dl>
          <div><dt>File</dt><dd>${escape(meta.filename)}</dd></div>
          <div><dt>Size</dt><dd>${escape(meta.size)}</dd></div>
          <div><dt>Resolution</dt><dd>${Number.isFinite(Number(resolution.width)) && Number.isFinite(Number(resolution.height)) ? `${resolution.width} × ${resolution.height}px` : escape(meta.dimensions)}</dd></div>
          <div><dt>Type</dt><dd>${escape(fileTypeFromName(meta.filename))}</dd></div>
        </dl>
      </article>
      <article>
        <span class="analysis-insight-icon">${icon("settings")}</span>
        <strong>Quality Signals</strong>
        <dl>
          <div><dt>Sharpness variance</dt><dd>${sharpness === null ? "Unavailable" : sharpness.toFixed(1)}</dd></div>
          <div><dt>Blocking estimate</dt><dd>${blocking === null ? "Unavailable" : blocking + "%"}</dd></div>
          <div><dt>Perspective issue</dt><dd>${typeof q.perspective_issue === "boolean" ? (q.perspective_issue ? "Detected" : "Not detected") : "Unavailable"}</dd></div>
          <div><dt>Lighting issue</dt><dd>${typeof q.lighting_issue === "boolean" ? (q.lighting_issue ? "Detected" : "Not detected") : "Unavailable"}</dd></div>
        </dl>
      </article>
      <article>
        <span class="analysis-insight-icon">${icon("file")}</span>
        <strong>Detected Structure</strong>
        <div class="analysis-structure-summary">
          <b>${parts.length || "—"}</b>
          <span>${parts.length ? `component${parts.length === 1 ? "" : "s"} currently reported` : "No detected parts available yet"}</span>
        </div>
      </article>
      <article>
        <span class="analysis-insight-icon">${icon("spark")}</span>
        <strong>Color Palette</strong>
        ${analysisPalette()}
      </article>
      <article>
        <span class="analysis-insight-icon">${icon("settings")}</span>
        <strong>Processing Mode</strong>
        <div class="analysis-mode-badge">${escape(preset)}</div>
        <p>${escape(label(vectorMode))}</p>
        <small>Values come from the active project settings.</small>
      </article>
    </div>
  </section>`;
}

function analysisMain() {
  return `<main class="main-column analysis-reference-main">
    <section class="analysis-hero-copy">
      <div>
        <span class="analysis-step-label">Step 2 of 8</span>
        <h1>Analyze Your Jersey Artwork</h1>
        <p>ReVector analyzes the real source artwork for image quality, color information, structure and production preparation. Values shown below come directly from the current engine project.</p>
      </div>
      <div class="analysis-why-card">
        <span class="analysis-why-icon">${icon("spark")}</span>
        <span><strong>Why we analyze?</strong><small>To inspect source quality and prepare trustworthy structure for later vectorization.</small></span>
        <span aria-hidden="true">›</span>
      </div>
    </section>

    <section class="analysis-primary-grid">
      ${analysisSourceCard()}
      ${analysisReferenceCard()}
      ${analysisProgressCard()}
    </section>

    ${analysisInsights()}
  </main>`;
}

function analysisInspector() {
  const p = state.project;
  const meta = sourceMeta();
  const analysis = p?.analysis || {};
  const resolution = analysis.resolution || {};
  const q = analysis.quality || {};
  const colors = Array.isArray(analysis.dominant_colors) ? analysis.dominant_colors : [];
  const parts = Array.isArray(p?.parts) ? p.parts : [];
  const analysisReady = Boolean(Object.keys(analysis).length);
  const partReviewReady = p?.state === "PART_REVIEW_READY" || parts.length > 0 && Object.values(p?.slots || {}).some((slot) => slot?.status !== "missing");
  const analysisScale = finiteNumber(analysis.analysis_scale);

  return `<aside class="analysis-inspector">
    <header><strong>Inspector</strong><span title="Live project data">${icon("refresh")}</span></header>

    <section>
      <h3>Source File</h3>
      <div class="analysis-inspector-source">
        <div class="analysis-inspector-thumb">
          ${p?.thumbnail || p?.working_image ? picture(p.thumbnail || p.working_image, "Source file") : icon("file")}
        </div>
        <dl>
          <div><dt>File Name</dt><dd>${escape(meta.filename)}</dd></div>
          <div><dt>File Size</dt><dd>${escape(meta.size)}</dd></div>
          <div><dt>Dimensions</dt><dd>${escape(meta.dimensions)}</dd></div>
          <div><dt>File Type</dt><dd>${escape(fileTypeFromName(meta.filename))}</dd></div>
        </dl>
      </div>
    </section>

    <section>
      <h3>Analysis Summary</h3>
      <div class="analysis-summary-list">
        <div><span>${icon("ruler")} Analysis Resolution</span><strong>${Number.isFinite(Number(resolution.width)) && Number.isFinite(Number(resolution.height)) ? `${resolution.width} × ${resolution.height}` : "Unavailable"}</strong></div>
        <div><span>${icon("file")} Detected Components</span><strong>${parts.length || "Unavailable"}</strong></div>
        <div><span>${icon("spark")} Dominant Colors</span><strong>${colors.length || "Unavailable"}</strong></div>
        <div><span>${icon("settings")} Analysis Scale</span><strong>${analysisScale === null ? "Unavailable" : analysisScale}</strong></div>
        <div><span>${icon("alert")} Perspective Issue</span><strong>${typeof q.perspective_issue === "boolean" ? (q.perspective_issue ? "Detected" : "Not detected") : "Unavailable"}</strong></div>
      </div>
    </section>

    <section>
      <h3>Detected Structure</h3>
      ${parts.length
        ? `<div class="analysis-detected-parts">${parts.slice(0, 6).map((pp) => `<div>
            <span>${pp.corrected_crop ? picture(pp.corrected_crop, pp.name) : icon("file")}</span>
            <small>${escape(label(pp.type))}</small>
          </div>`).join("")}</div>`
        : '<p class="analysis-empty-copy">No detected structure is available yet.</p>'}
    </section>

    <section>
      <h3>Quality Metrics</h3>
      <div class="analysis-quality-list">${analysisQualityRows()}</div>
    </section>

    <section class="analysis-complete-card ${analysisReady ? "ready" : ""}">
      <div><strong>${analysisReady ? "Analysis Data Available" : "Analysis In Progress"}</strong>
      <p>${partReviewReady ? "The project has real detected structure ready for review." : state.busy ? "The engine is continuing the automatic preparation flow." : "Waiting for more engine analysis data."}</p></div>
      ${partReviewReady
        ? btn("Open Detected Parts " + icon("chevron"), "navigate", "analysis-next-button", false, 'data-step="2"')
        : `<button class="analysis-next-button" disabled>${state.busy ? "Enhance runs automatically" : "Waiting for engine"}</button>`}
    </section>
  </aside>`;
}


function enhancementMeta() {
  const meta = state.project?.ai_metadata?.enhancement;
  return meta && typeof meta === "object" ? meta : {};
}

function enhancementAsset() {
  return state.project?.ai_assets?.enhancement || "";
}

function enhancementRunning() {
  return Boolean(
    state.step === 1 &&
      state.job?.process_event?.event === "ENHANCING_ARTWORK" &&
      !["SUCCEEDED", "FAILED", "CANCELLED"].includes(state.job?.job_state),
  );
}

function enhancementComplete() {
  return Boolean(enhancementAsset() && enhancementMeta().provider);
}

function enhancementDuration() {
  const ms = finiteNumber(enhancementMeta().duration_ms);
  if (ms === null || ms < 0) return "Unavailable";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

function enhancementProviderText() {
  const meta = enhancementMeta();
  const values = [meta.provider, meta.model].filter(Boolean);
  return values.length ? values.join(" • ") : "Unavailable";
}

function enhancementPreviewCard(kind) {
  const p = state.project;
  const original = kind === "original";
  const asset = original ? (p?.working_image || p?.thumbnail) : enhancementAsset();
  const meta = sourceMeta();
  const enhancement = enhancementMeta();
  const status = original
    ? (asset ? badge("Original") : badge("Unavailable"))
    : enhancementComplete()
      ? badge("Enhanced", "success")
      : enhancementRunning()
        ? badge("Processing", "purple")
        : badge("Not Available");

  return `<section class="enhance-preview-card ${original ? "original" : "result"}">
    <header>
      <span>${icon(original ? "file" : "spark")}<strong>${original ? "Original Artwork" : "AI Enhanced Result"}</strong></span>
      ${status}
    </header>
    <div class="enhance-preview-art">
      ${asset
        ? picture(asset, original ? "Original artwork" : "AI enhanced artwork")
        : `<div class="enhance-empty-preview">${icon(original ? "file" : "spark")}<strong>${original ? "Original artwork unavailable" : "No enhanced result yet"}</strong><span>${original ? "The engine has not provided a source preview." : "An image appears here only after the engine stores a real enhancement asset."}</span></div>`}
      <span class="enhance-corner-label">${original ? "Before" : "After"}</span>
    </div>
    <footer>
      ${original
        ? `<span>${escape(fileTypeFromName(meta.filename))}</span><small>${escape(meta.size)} • ${escape(meta.dimensions)}</small>`
        : `<span>${asset ? escape(fileTypeFromName(asset)) : "Unavailable"}</span><small>${enhancement.provider ? escape(enhancementProviderText()) : "Provider unavailable"}</small>`}
      ${original ? "" : '<button class="enhance-compare-button" disabled title="Interactive compare is not exposed by the current engine UI contract">' + icon("eye") + " Compare</button>"}
    </footer>
  </section>`;
}

function enhancementProgressItems() {
  const p = state.project;
  const meta = enhancementMeta();
  const asset = enhancementAsset();
  const events = Array.isArray(p?.events)
    ? p.events.map((event) => typeof event === "string" ? event : event?.event).filter(Boolean)
    : [];
  const current = state.job?.process_event?.event;
  const later = events.some((event) =>
    ["CREATING_PATTERN_MOCKUP", "IDENTIFYING_PARTS", "REFINING_PART_BOUNDARIES", "PART_REVIEW_READY"].includes(event),
  ) || ["CREATING_PATTERN_MOCKUP", "IDENTIFYING_PARTS", "REFINING_PART_BOUNDARIES", "PART_REVIEW_READY"].includes(current);

  const rows = [
    {
      label: "Source artwork ready",
      complete: Boolean(p?.working_image),
      active: false,
      detail: p?.working_image ? "Available" : "Waiting",
    },
    {
      label: "Enhancement stage",
      complete: Boolean(meta.provider || asset || later),
      active: enhancementRunning(),
      detail: enhancementRunning() ? "In progress" : meta.provider || asset || later ? "Complete" : "Pending",
    },
    {
      label: "AI provider response",
      complete: Boolean(meta.provider),
      active: enhancementRunning() && !meta.provider,
      detail: meta.provider ? meta.provider : enhancementRunning() ? "Waiting" : "Pending",
    },
    {
      label: "Enhanced asset stored",
      complete: Boolean(asset),
      active: Boolean(meta.provider && !asset && enhancementRunning()),
      detail: asset ? "Available" : meta.provider ? "Waiting" : "Pending",
    },
    {
      label: "Continue preparation",
      complete: later,
      active: Boolean(asset && !later && !enhancementRunning()),
      detail: later ? "Started" : asset ? "Ready" : "Pending",
    },
  ];

  return rows.map((row) => `<div class="enhance-progress-stage ${row.complete ? "complete" : row.active ? "active" : "pending"}">
    <span class="enhance-stage-dot">${row.complete ? icon("check") : ""}</span>
    <span><strong>${escape(row.label)}</strong><small>${escape(row.detail)}</small></span>
  </div>`).join("");
}

function enhancementProgressPanel() {
  const running = enhancementRunning();
  const complete = enhancementComplete();
  const meta = enhancementMeta();
  const attempts = finiteNumber(meta.attempt_count);
  return `<section class="enhance-progress-panel" aria-live="polite">
    <div class="enhance-progress-ring ${complete ? "complete" : running ? "running" : ""}">
      <span>${complete ? icon("check") : running ? "LIVE" : "—"}</span>
    </div>
    <div class="enhance-progress-copy">
      <strong>${running ? "Enhancing artwork with AI..." : complete ? "AI enhancement completed" : "AI enhancement is not active"}</strong>
      <p>${running
        ? "The engine is running its configured enhancement provider."
        : complete
          ? "The enhanced raster shown above is the real asset stored by ReVector."
          : "No enhancement result is being fabricated while the engine has no real asset to show."}</p>
      <div class="enhance-progress-track ${complete ? "complete" : running ? "running" : ""}"><span></span></div>
      <div class="enhance-progress-meta">
        <span>Duration: <strong>${escape(enhancementDuration())}</strong></span>
        <span>Attempts: <strong>${attempts === null ? "Unavailable" : attempts}</strong></span>
      </div>
    </div>
    <div class="enhance-progress-stages">${enhancementProgressItems()}</div>
  </section>`;
}

function enhancementFactRow(iconName, title, subtitle, status, tone = "") {
  return `<div class="enhance-control-row">
    <span class="enhance-control-icon">${icon(iconName)}</span>
    <span class="enhance-control-copy"><strong>${escape(title)}</strong><small>${escape(subtitle)}</small></span>
    <span class="enhance-switch ${tone}" aria-label="${escape(title)}: ${escape(status)}"><i></i><em>${escape(status)}</em></span>
  </div>`;
}

function enhancementInspector() {
  const p = state.project;
  const settings = p?.settings || {};
  const meta = enhancementMeta();
  const running = enhancementRunning();
  const complete = enhancementComplete();
  const aiConfigured = Boolean(state.aiCapabilities?.primary_configured || state.aiCapabilities?.fallback_configured);
  const requestedW = finiteNumber(settings.mockup_width);
  const requestedH = finiteNumber(settings.mockup_height);
  const requestedResolution = requestedW && requestedH ? `${requestedW} × ${requestedH}px requested` : "Unavailable";
  const route = meta.processing_mode === "fallback_ai"
    ? "Fallback AI"
    : meta.processing_mode === "primary_ai"
      ? "Primary AI"
      : "Unavailable";

  return `<aside class="enhance-inspector">
    <section class="enhance-mode-head">
      <div><span class="enhance-control-icon">${icon("settings")}</span><strong>Processing Mode</strong></div>
      ${complete
        ? badge("AI Enhanced", "success")
        : running
          ? badge("Enhancing", "purple")
          : badge(aiConfigured ? "Auto Prepare" : "AI Unavailable", aiConfigured ? "" : "warning")}
    </section>

    <div class="enhance-tabs">
      <button class="selected" disabled>Auto Enhance</button>
      <button disabled title="Not exposed by the current engine contract">Manual Adjust</button>
      <button disabled title="Not exposed by the current engine contract">AI Upscale</button>
    </div>

    <section class="enhance-controls">
      ${enhancementFactRow("spark", "Clean Artwork", "Noise reduction project setting", settings.noise_reduction === false ? "Off" : "On", settings.noise_reduction === false ? "" : "on")}
      ${enhancementFactRow("ruler", "Sharpen Details", "No independent engine setting is exposed", "N/A", "disabled")}
      ${enhancementFactRow("settings", "Preserve Source Colors", "Project color-preservation setting", settings.preserve_original_colors === false ? "Off" : "On", settings.preserve_original_colors === false ? "" : "on")}
      ${enhancementFactRow("file", "Remove Background", "No independent engine setting is exposed", "N/A", "disabled")}
      ${enhancementFactRow("file", "Rebuild Missing Areas", "No independent engine setting is exposed", "N/A", "disabled")}
      ${enhancementFactRow("file", "Text Detection (OCR)", "Project OCR setting", settings.ocr ? "On" : "Off", settings.ocr ? "on" : "")}
    </section>

    <section class="enhance-readout">
      <div class="enhance-readout-row"><span>Provider Route</span><strong>${escape(route)}</strong></div>
      <div class="enhance-readout-row"><span>Provider / Model</span><strong title="${escape(enhancementProviderText())}">${escape(enhancementProviderText())}</strong></div>
      <div class="enhance-readout-row"><span>Enhancement Strength</span><strong>Not exposed</strong></div>
      <div class="enhance-disabled-slider" aria-label="Enhancement strength is not exposed by the engine"><span></span></div>
      <div class="enhance-readout-row"><span>Output Resolution</span><strong>${escape(requestedResolution)}</strong></div>
    </section>

    <section class="enhance-apply-wrap">
      <button class="enhance-apply-button" disabled>
        ${icon("spark")}
        ${running
          ? "Enhancement Running"
          : complete
            ? "Enhancement Applied Automatically"
            : settings.ai_workflow && aiConfigured
              ? "Runs Automatically During Prepare"
              : "Automatic Enhancement Unavailable"}
        ${icon("chevron")}
      </button>
      <small>ReVector currently runs enhancement automatically inside the real Prepare workflow; there is no separate Apply endpoint.</small>
    </section>
  </aside>`;
}

function enhanceMain() {
  return `<main class="main-column enhance-reference-main">
    <section class="enhance-hero-copy">
      <div class="enhance-hero-title">
        <span class="enhance-hero-icon">${icon("spark")}</span>
        <div>
          <span class="enhance-step-label">Step 3 of 8</span>
          <h1>Enhance Your Jersey Artwork</h1>
        </div>
      </div>
      <p>AI enhancement is shown only when the engine actually runs and stores the enhancement stage. ReVector never fabricates a before/after result.</p>
      <div class="enhance-why-card">
        <span class="enhance-why-icon">${icon("spark")}</span>
        <div><strong>Why Enhance?</strong><ul><li>Prepare cleaner source detail</li><li>Improve downstream part detection</li><li>Provide a stronger intermediate reference</li></ul></div>
      </div>
    </section>

    <section class="enhance-comparison-grid">
      ${enhancementPreviewCard("original")}
      <div class="enhance-arrow" aria-hidden="true">→</div>
      ${enhancementPreviewCard("result")}
    </section>

    ${enhancementProgressPanel()}
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
  return `<div class="upload-status-dialog upload-reference-progress" role="status" aria-live="polite">
    <div class="upload-progress-orb"><span></span></div>
    <div class="upload-progress-copy">
      <div class="row between"><strong>Uploading artwork...</strong><span class="muted small">Working</span></div>
      <p>${escape(state.operationDetail || "Preparing workspace and validating the source file.")}</p>
      <div class="upload-progress-track" aria-hidden="true"><span></span></div>
    </div>
  </div>`;
}

function startupStage(labelText, status, pendingLabel) {
  const normalized = status || "pending";
  const tone =
    normalized === "connected"
      ? "success"
      : normalized === "failed"
        ? "error"
        : normalized === "unavailable"
          ? "muted"
          : "pending";
  const detail =
    normalized === "connected"
      ? "Ready"
      : normalized === "failed"
        ? "Failed"
        : normalized === "unavailable"
          ? "Unavailable"
          : pendingLabel;
  return `<div class="bootstrap-stage ${tone}">
    <span class="bootstrap-stage-dot" aria-hidden="true"></span>
    <span><strong>${escape(labelText)}</strong><small>${escape(detail)}</small></span>
  </div>`;
}

function startupStages() {
  const ai =
    !state.aiCapabilities
      ? "pending"
      : state.aiCapabilities.primary_configured ||
          state.aiCapabilities.fallback_configured
        ? "connected"
        : "unavailable";
  const workspace =
    state.health &&
    state.connections.server === "connected" &&
    state.connections.engine === "connected" &&
    state.connections.tool === "connected"
      ? "connected"
      : "pending";
  return [
    startupStage("Server", state.connections.server, "Connecting"),
    startupStage("Engine", state.connections.engine, "Checking"),
    startupStage("AI", ai, "Checking"),
    startupStage("Workspace", workspace, "Preparing"),
  ].join("");
}

function startupCurrentLabel() {
  if (state.connections.server !== "connected") return "Connecting Server";
  if (state.connections.engine !== "connected") return "Checking Engine";
  if (state.connections.tool !== "connected") return "Checking Tool";
  if (!state.aiCapabilities) return "Checking AI";
  return "Preparing Workspace";
}


function productionStepper(p, max, prepView) {
  const items = [
    ["Upload", 0, "Jersey image or design file", null],
    ["Analyze", 1, "Detect structure & parts", "analyze"],
    ["Enhance", 1, "Clean, sharpen & rebuild", "enhance"],
    ["Mockup", 1, "Preview production reference", "mockup"],
    ["Detect Parts", 2, "Identify garment pieces", null],
    ["Vectorize", 3, "Convert to production vectors", null],
    ["Validate", 4, "Check vector integrity", null],
    ["Download", 5, "Export factory-ready files", null],
  ];
  const event = state.job?.process_event?.event;
  const phases = {
    Analyze: "ANALYZING_ARTWORK",
    Enhance: "ENHANCING_ARTWORK",
    Mockup: "CREATING_PATTERN_MOCKUP",
  };

  return items.map(([name, index, description, prep], n) => {
    const done =
      name === "Analyze"
        ? Boolean(p?.analysis && Object.keys(p.analysis).length) || index < state.step
        : name === "Enhance"
          ? Boolean(p?.ai_assets?.enhancement && p?.ai_metadata?.enhancement?.provider)
          : name === "Mockup"
            ? Boolean(p?.ai_assets?.mockup && p?.ai_metadata?.mockup?.provider)
            : index < state.step;
    const active =
      index === state.step &&
      (prep
        ? event === phases[name] || (!state.busy && prepView === prep)
        : true);
    const extra = prep ? ` data-prep-view="${prep}"` : "";
    return `<button class="step ${active ? "active" : done ? "complete" : ""}" data-action="navigate" data-step="${index}"${extra} ${index > max ? "disabled" : ""}><span class="step-number">${done ? icon("check") : n + 1}</span><span><strong>${name}</strong><small>${escape(description)}</small></span></button>`;
  }).join("");
}

let renderedAccountMarker = null;
function render() {
  const accountView = accountMarkup();
  if (accountView) {
    const marker = currentPath() + ":" + account.revision;
    if (marker !== renderedAccountMarker) app.innerHTML = accountView;
    renderedAccountMarker = marker;
    return;
  }
  renderedAccountMarker = null;
  const p = state.project;
  const max = highestStep();
  const prepView = state.preparationView || "analyze";
  app.innerHTML = `<header class="topbar ${state.step === 0 ? "upload-reference-topbar" : state.step === 1 ? `upload-reference-topbar ${prepView === "enhance" ? "enhance-reference-topbar" : "analysis-reference-topbar"}` : ""}">
      <div class="brand revector-brand"><img class="brand-logo" src="/assets/revector-ai-logo.svg" alt=""><div><h1>ReVector AI</h1><small>${state.step === 1 ? "Turn jersey designs into production-ready vectors" : "Inside JerseyOS"}</small></div></div>
      <div class="topbar-center">${state.step <= 1 ? uploadHeaderStatuses() : ""}</div>
      <div class="right">
        ${state.step <= 1 ? "" : btn("New Artwork", "new-project", "quiet")}
        ${profileMenu()}
        ${btn(icon("menu"), "menu-toggle", "icon-button menu-button", false, 'aria-label="Open JerseyOS menu"')}
      </div>
      ${menuPopover()}
    </header>
    ${state.initialBootstrap && state.connecting ? `<div class="bootstrap-overlay" role="status" aria-live="polite">
      <div class="bootstrap-grid" aria-hidden="true"></div>
      <div class="bootstrap-card">
        <img class="bootstrap-logo" src="/assets/revector-ai-logo.svg" alt="ReVector AI">
        <span class="bootstrap-badge">A Tool of Jersey OS</span>
        <h1>Launching ReVector AI</h1>
        <p>Preparing your production workspace</p>
        <div class="bootstrap-progress" aria-hidden="true"><span></span></div>
        <div class="bootstrap-stages">${startupStages()}</div>
        <div class="bootstrap-status"><span class="spinner"></span>${escape(startupCurrentLabel())}</div>
      </div>
    </div>` : ""}
    ${state.step <= 1 ? "" : connectionStatus()}
    ${connectionLost()}
    ${uploadStatusDialog()}
    <div class="production-shell ${state.step <= 1 ? "upload-shell" : ""} ${state.step === 1 ? (prepView === "enhance" ? "enhance-shell" : "analysis-shell") : ""}"><nav class="stepper" aria-label="Processing workflow">
      ${productionStepper(p, max, prepView)}
    </nav><div class="production-content">
    ${state.error && !state.assistantOpen
      ? `<div class="status-error" role="alert"><strong>${escape(state.error.error_code || state.error.code)}</strong><span>${escape(state.error.message)}</span>${btn("Open Assistant", "assistant-toggle", "quiet")}${btn("Dismiss", "dismiss-error", "quiet")}</div>`
      : ""}
    <div class="workspace ${state.step === 0 ? "upload-reference-workspace" : state.step === 1 ? (prepView === "enhance" ? "enhance-reference-workspace" : "analysis-reference-workspace") : ""}">
      ${state.step <= 1 ? "" : state.step === 2 ? partInspector() : ""}
      ${state.step === 0
        ? inputMain()
        : state.step === 1
          ? (prepView === "enhance" ? enhanceMain() : analysisMain())
          : state.step === 2
            ? definitionMain()
            : state.step === 3
              ? vectorMain()
              : state.step === 4
                ? validationMain()
                : downloadMain()}
      ${state.step === 0 ? uploadSetupPanel() : state.step === 1 ? (prepView === "enhance" ? enhancementInspector() : analysisInspector()) : ""}
    </div>
    ${state.step === 1 ? "" : footer()}
    </div></div>
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
