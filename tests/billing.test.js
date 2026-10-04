import test from "node:test";
import assert from "node:assert/strict";
import { terminalState, reconcileJob } from "../worker/control/billing.js";
const J = "00000000-0000-4000-8000-000000000004",
  P = "00000000-0000-4000-8000-000000000005";
test("approved engine COMPLETED job releases reservation and records actual provider once through idempotent RPC", async () => {
  assert.equal(terminalState({ status: "completed" }), "SUCCEEDED");
  assert.equal(
    terminalState({ status: "processing", job_state: "RUNNING" }),
    null,
  );
  const calls = [];
  const identity = {
    user: { id: J },
    db: {
      table: async () => [{ id: J, project_id: P, dispatch_job_id: J }],
      rpc: async (name, body) => calls.push([name, body]),
    },
  };
  await reconcileJob(
    identity,
    {},
    { job_id: J, project_id: P, status: "completed", stage: "prepare" },
    async () =>
      Response.json({
        project_id: P,
        ai_metadata: {
          analysis: {
            processing_mode: "fallback_ai",
            provider: "cloudflare",
            model: "real-reported-model",
            created_at: "2026-10-04T00:00:00Z",
            duration_ms: 1400,
            attempt_count: 1,
          },
        },
      }),
  );
  assert.equal(calls[0][0], "rv_record_usage");
  assert.equal(calls[0][1].p_model, "real-reported-model");
  assert.equal(calls[0][1].p_actual_cost, null);
  assert.deepEqual(calls.at(-1), [
    "rv_finish_reservation",
    { p_user: J, p_id: J, p_status: "SUCCEEDED" },
  ]);
});
test("binding failure can recover from verified job project/stage; failed source remains uncharged and unattributed", async () => {
  const calls = [];
  const identity = {
    user: { id: J },
    db: {
      table: async () => [
        { id: J, operation: "PREPARE", project_id: P, dispatch_job_id: null },
      ],
      rpc: async (name, body) => calls.push([name, body]),
    },
  };
  await reconcileJob(
    identity,
    {},
    {
      job_id: J,
      project_id: P,
      status: "failed",
      stage: "prepare",
      error: { code: "AI_PROVIDER_ERROR" },
    },
    async () => Response.json({ project_id: P, ai_metadata: {} }),
  );
  assert.equal(calls[0][0], "rv_bind_operation");
  assert.equal(calls[1][1].p_status, "FAILED");
  assert.equal(calls[1][1].p_mode, null);
  assert.equal(calls[1][1].p_actual_cost, null);
  assert.equal(calls.at(-1)[1].p_status, "FAILED");
});
