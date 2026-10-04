/** Accounting consumes only verified engine metadata; absent costs remain unavailable. */
import { uuid, ControlError } from "./db.js";
const operations = {
  analysis: "ANALYZE",
  enhancement: "ENHANCE",
  mockup: "MASTER_MOCKUP",
  identification: "IDENTIFY_PARTS",
  missing_part: "RECONSTRUCT_MISSING_PART",
};
export function usageRows(project) {
  const rows = [];
  for (const [key, metadata] of Object.entries(project.ai_metadata || {})) {
    const operation =
      operations[key] ||
      (key.startsWith("missing-") ? "RECONSTRUCT_MISSING_PART" : null);
    if (
      !operation ||
      !metadata?.created_at ||
      !["primary_ai", "fallback_ai"].includes(metadata.processing_mode) ||
      typeof metadata.provider !== "string"
    )
      continue;
    rows.push({
      operation,
      provider: metadata.provider,
      model: metadata.model || null,
      mode: metadata.processing_mode.toUpperCase(),
      created_at: metadata.created_at,
      usage: {
        processed_at: metadata.created_at,
        attempt_count: metadata.attempt_count,
        duration_ms: metadata.duration_ms,
      },
      actual_cost: null,
    });
  }
  return rows;
}
async function hash(value) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function reserve(identity, env, path, data, request) {
  const operation = path.endsWith("/prepare")
    ? "PREPARE"
    : path.endsWith("/ai-missing")
      ? "RECONSTRUCT_MISSING_PART"
      : path.endsWith("/assistant/explain")
        ? "ERROR_ASSISTANT"
        : null;
  if (!operation) return null;
  const key = uuid(request.headers.get("x-idempotency-key"));
  const project = data.project_id ? uuid(data.project_id) : null;
  const r = await identity.db.rpc("rv_reserve_operation", {
    p_user: identity.user.id,
    p_key: key,
    p_operation: operation,
    p_project: project,
    p_conversion: env.CREDITS_PER_USD ? Number(env.CREDITS_PER_USD) : null,
  });
  return { ...r, operation, project, key };
}
export async function bind(identity, reservation, data) {
  if (reservation)
    await identity.db.rpc("rv_bind_operation", {
      p_user: identity.user.id,
      p_id: reservation.id,
      p_dispatch: data,
      p_job: data.job_id || null,
    });
}
export async function finish(identity, reservation, status) {
  if (reservation)
    await identity.db.rpc("rv_finish_reservation", {
      p_user: identity.user.id,
      p_id: reservation.id,
      p_status: status,
    });
}
export async function syncUsage(identity, env, project, reservation = null) {
  if (!project?.project_id) return;
  for (const row of usageRows(project)) {
    const event = await hash(
      [project.project_id, row.operation, row.created_at].join(":"),
    );
    await identity.db.rpc("rv_record_usage", {
      p_user: identity.user.id,
      p_event_key: "engine:" + event,
      p_project: project.project_id,
      p_operation: row.operation,
      p_provider: row.provider,
      p_model: row.model,
      p_mode: row.mode,
      p_status: "SUCCEEDED",
      p_usage: row.usage,
      p_actual_cost: row.actual_cost,
      p_reservation: reservation?.id || null,
      p_conversion: env.CREDITS_PER_USD ? Number(env.CREDITS_PER_USD) : null,
    });
  }
}
export function terminalState(job) {
  const state =
    job.job_state ||
    {
      completed: "SUCCEEDED",
      succeeded: "SUCCEEDED",
      failed: "FAILED",
      cancelled: "CANCELLED",
    }[String(job.status).toLowerCase()];
  return ["SUCCEEDED", "FAILED", "CANCELLED"].includes(state) ? state : null;
}
export async function reconcileJob(identity, env, job, engineFetch) {
  const status = terminalState(job);
  if (!status) return;
  const reservations = await identity.db.table("revector_usage_events", {
    user_id: "eq." + identity.user.id,
    status: "eq.RESERVED",
    or:
      "(dispatch_job_id.eq." +
      uuid(job.job_id) +
      ",and(dispatch_job_id.is.null,project_id.eq." +
      uuid(job.project_id) +
      "))",
    select: "*",
    limit: "50",
  });
  for (const r of reservations) {
    if (!r.dispatch_job_id) {
      const stage = {
        PREPARE: "prepare",
        RECONSTRUCT_MISSING_PART: "ai-missing",
      }[r.operation];
      if (job.stage !== stage) continue;
      await bind(identity, r, job);
    }
    const response = await engineFetch(
      "/api/revector/projects/" + r.project_id,
    );
    if (!response.ok) throw new ControlError("USAGE_SYNC_UNAVAILABLE", 503);
    const project = await response.json();
    await syncUsage(identity, env, project, r);
    if (
      status === "SUCCEEDED" &&
      r.operation === "PREPARE" &&
      usageRows(project).length === 0 &&
      project.usage?.ai_calls === 0
    ) {
      await identity.db.rpc("rv_record_usage", {
        p_user: identity.user.id,
        p_event_key: "deterministic:" + r.id,
        p_project: r.project_id,
        p_operation: "ANALYZE",
        p_provider: null,
        p_model: null,
        p_mode: "DETERMINISTIC",
        p_status: "SUCCEEDED",
        p_usage: { ai_calls: 0 },
        p_actual_cost: null,
        p_reservation: r.id,
        p_conversion: null,
      });
    }
    if (status === "FAILED")
      await identity.db.rpc("rv_record_usage", {
        p_user: identity.user.id,
        p_event_key: "failed:" + r.id,
        p_project: r.project_id,
        p_operation: r.operation === "PREPARE" ? "ANALYZE" : r.operation,
        p_provider: null,
        p_model: null,
        p_mode: null,
        p_status: "FAILED",
        p_usage: {
          error_code: job.error?.error_code || job.error?.code || "JOB_FAILED",
        },
        p_actual_cost: null,
        p_reservation: r.id,
        p_conversion: null,
      });
    await finish(identity, r, status);
  }
}
export async function assistantUsage(identity, env, reservation, data) {
  const ai = data.source === "ai" || data.provider;
  const mode = ["primary_ai", "fallback_ai"].includes(data.processing_mode)
    ? data.processing_mode.toUpperCase()
    : null;
  // The engine does not currently expose the assistant's model or cost. Do not infer either.
  await identity.db.rpc("rv_record_usage", {
    p_user: identity.user.id,
    p_event_key: "assistant:" + reservation.id,
    p_project: reservation.project,
    p_operation: "ERROR_ASSISTANT",
    p_provider: ai && mode ? data.provider || null : null,
    p_model: null,
    p_mode: ai && mode ? mode : "DETERMINISTIC",
    p_status: "SUCCEEDED",
    p_usage: { source: data.source || "deterministic" },
    p_actual_cost: null,
    p_reservation: reservation.id,
    p_conversion: null,
  });
  await finish(identity, reservation, "SUCCEEDED");
}

/** Reconcile durable engine job IDs when a user returns to Usage without browser job storage. */
export async function reconcileAccount(identity, env, transport) {
  const origin = new URL(env.ENGINE_ORIGIN);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new ControlError("USAGE_SYNC_UNAVAILABLE", 503);
  const engineFetch = (path) =>
    transport(
      new Request(origin.origin + path, {
        headers: {
          Authorization: "Bearer " + env.ENGINE_API_KEY,
          "X-Revector-User": identity.principal,
        },
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      }),
    );
  const pending = await identity.db.table("revector_usage_events", {
    user_id: "eq." + identity.user.id,
    status: "eq.RESERVED",
    dispatch_job_id: "not.is.null",
    select: "*",
    limit: "5",
    order: "created_at.asc",
  });
  const results = await Promise.allSettled(
    pending.map(async (row) => {
      const response = await engineFetch(
        "/api/revector/jobs/" + uuid(row.dispatch_job_id),
      );
      if (!response.ok) throw new ControlError("USAGE_SYNC_UNAVAILABLE", 503);
      await reconcileJob(identity, env, await response.json(), engineFetch);
    }),
  );
  return results.some((result) => result.status === "rejected");
}
