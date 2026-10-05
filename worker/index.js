import manifest from "./security-manifest.json" with { type: "json" };
import { session } from "./session.js";
import { safeUpload } from "./upload.js";
import { configured, failure, boundedJSON, ControlError, uuid } from "./control/db.js";
import { authenticate } from "./control/auth.js";
import { controlRoute } from "./control/routes.js";
import { reserve, bind, finish, reconcileJob, assistantUsage } from "./control/billing.js";
function controlResponse(response) {
 const cookies = response.headers.getSetCookie();
 const result = decorate(response);
 for (const cookie of cookies) result.headers.append("Set-Cookie", cookie);
 return result;
}

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_UPLOAD = 51 * 1024 * 1024;
const UUID = "[a-f0-9-]{36}";
const ROUTES = [
  ["POST", new RegExp("^/api/revector/(projects|upload|analyze|correct-geometry|segment|reconstruct|vectorize|optimize|compose|validate|export|parts/actions|prepare|production|recover-part|ai-missing|review/confirm|slots/update|assistant/explain|assistant/feedback)$")],
  ["GET", new RegExp("^/api/revector/(capabilities/ai|error-catalog)$")],
  ["GET", new RegExp(`^/api/revector/projects/${UUID}(?:/(?:status|parts|validation|exports|events|errors))?$`)],
  ["GET", new RegExp(`^/api/revector/projects/${UUID}/artifacts/[^\\\\]+$`)],
  ["DELETE", new RegExp(`^/api/revector/projects/${UUID}$`)],
  ["PUT", new RegExp(`^/api/revector/projects/${UUID}/settings$`)],
  ["POST", new RegExp("^/api/revector/segments/[A-Za-z0-9_]+/(confirm|update|vector-edit)$")],
  ["GET", new RegExp(`^/api/revector/jobs/${UUID}$`)],
  ["POST", new RegExp(`^/api/revector/jobs/${UUID}/cancel$`)],
];

function decorate(response, cookie, isAPI = true) {
  const headers = new Headers(response.headers);
  for (const key of ["access-control-allow-origin", "access-control-allow-credentials", "server", "set-cookie"]) headers.delete(key);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!headers.has("Content-Security-Policy")) headers.set("Content-Security-Policy", `default-src 'self'; script-src 'self' 'sha256-${manifest.scriptHash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
  if (isAPI) headers.set("Cache-Control", "no-store");
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function error(code, status) {
  const messages = { GATEWAY_NOT_CONFIGURED: "Gateway configuration is incomplete.", ORIGIN_REJECTED: "Request origin is not allowed.", ROUTE_NOT_ALLOWED: "Endpoint is unavailable.", UPLOAD_TOO_LARGE: "Upload exceeds the configured limit.", INVALID_REQUEST: "Request JSON is invalid.", ENGINE_UNAVAILABLE: "Engine could not be reached." };
  return Response.json({ success: false, error: { code, message: messages[code] || "Request could not be completed.", recoverable: true } }, { status });
}
function engineOrigin(env) {
  if (!env.ENGINE_API_KEY || env.ENGINE_API_KEY.length < 32) throw new Error("GATEWAY_NOT_CONFIGURED");
  const url = new URL(env.ENGINE_ORIGIN);
  const local = env.ALLOW_INSECURE_LOCAL_ENGINE === "true" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.hostname.includes("your-")) throw new Error("GATEWAY_NOT_CONFIGURED");
  return url.origin;
}

async function smallBody(request) {
  const reader = request.body.getReader();
  const chunks = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 1024 * 1024) { await reader.cancel(); throw new RangeError("UPLOAD_TOO_LARGE"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export async function handle(request, env, transport = fetch) {
  const url = new URL(request.url);
  const isAPI = url.pathname.startsWith("/api/") || url.pathname.startsWith("/health");
  if (!isAPI) {
    if (url.pathname === "/admin-login.html" || url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return decorate(error("ROUTE_NOT_ALLOWED",404),null,false);
    const assetRequest=new Request(url.origin+"/index.html",request);
    const response=await env.ASSETS.fetch(url.pathname.startsWith("/dashboard")||url.pathname==="/login"?assetRequest:request);
    return decorate(response, null, false);
  }
  if (request.headers.get("sec-fetch-site") === "cross-site" || (MUTATIONS.has(request.method) && request.headers.get("origin") !== url.origin)) return decorate(error("ORIGIN_REJECTED", 403));
  if (url.pathname === "/health" && request.method === "GET") return decorate(Response.json({ status: "ok", engine: "ReVector", server: "Cloudflare gateway" }));
  if (/^\/api\/(?:account|auth)\//.test(url.pathname)) {
    try { return controlResponse(await controlRoute(request, env, transport)); }
    catch (error) { return decorate(failure(error)); }
  }
  const readiness = url.pathname === "/health/ready" && request.method === "GET";
  if (!readiness && !ROUTES.some(([method, expression]) => request.method === method && expression.test(url.pathname))) return decorate(error("ROUTE_NOT_ALLOWED", 404));
  // Canonical composition is an internal validation asset, never a production download.
  let decodedPath; try { decodedPath = decodeURIComponent(url.pathname); } catch { return decorate(error("ROUTE_NOT_ALLOWED", 404)); }
  if (/\/artifacts\/(?:.*\/)?(?:master|assembled|full-pattern)\.(?:svg|pdf|eps|ai)$/i.test(decodedPath)) return decorate(error("ROUTE_NOT_ALLOWED", 404));
  if (/%(?:2f|5c|00)/i.test(url.pathname) || url.pathname.split("/").some((p) => p === "..")) return decorate(error("ROUTE_NOT_ALLOWED", 404));
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_UPLOAD || length < 0 || !Number.isFinite(length)) return decorate(error("UPLOAD_TOO_LARGE", 413));
  let identity, reservation;
  try {
    const origin = engineOrigin(env);
    if (readiness) {
      identity = await session(request, env);
    } else {
      if (!configured(env))
        throw new ControlError(
          "CONTROL_NOT_CONFIGURED",
          503,
          "Private ReVector access requires the configured account service.",
        );
      identity = await authenticate(request, env, transport);
    }
    const informationalRoute =
      request.method === "GET" &&
      ["/api/revector/capabilities/ai", "/api/revector/error-catalog"].includes(
        url.pathname,
      );
    if (
      identity.db &&
      identity.profile?.role === "USER" &&
      Object.prototype.hasOwnProperty.call(
        identity.profile || {},
        "profile_completed_at",
      ) &&
      !identity.profile.profile_completed_at &&
      !informationalRoute
    )
      throw new ControlError(
        "PROFILE_SETUP_REQUIRED",
        403,
        "Complete your ReVector profile before using the production workspace.",
      );
    const headers = new Headers();
    headers.set("Authorization", "Bearer " + env.ENGINE_API_KEY);
    headers.set("X-Revector-User", identity.principal);
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    if (request.headers.get("accept")) headers.set("Accept", request.headers.get("accept"));
    let body = MUTATIONS.has(request.method) ? request.body : undefined;
    if (body && url.pathname !== "/api/revector/upload") body = await smallBody(request);
    if (body && url.pathname === "/api/revector/upload") body = safeUpload(request, MAX_UPLOAD);
    const engineFetch = (path) => transport(new Request(origin + path, { headers: { Authorization: "Bearer " + env.ENGINE_API_KEY, "X-Revector-User": identity.principal }, redirect: "manual", signal: AbortSignal.timeout(25000) }));
    if (identity.db && request.method === "POST" && ["/api/revector/prepare", "/api/revector/ai-missing", "/api/revector/assistant/explain"].includes(url.pathname)) {
      const data = JSON.parse(body);
      if (data.project_id) {
        const ownership = await engineFetch("/api/revector/projects/" + uuid(data.project_id));
        if (!ownership.ok) return decorate(ownership, identity.cookie);
      }
      reservation = await reserve(identity, env, url.pathname, data, request);
      if (reservation.replayed) return decorate(Response.json(reservation.dispatch), identity.cookie);
    }
    if (url.pathname === "/api/revector/projects" && request.method === "POST") {
      const data = JSON.parse(body);
      body = JSON.stringify({ ...data, user_id: identity.principal });
    }
    const upstream = new Request(origin + url.pathname + url.search, { method: request.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(25000), duplex: "half" });
    const response = await transport(upstream);
    if (response.status >= 300 && response.status < 400) return decorate(error("ENGINE_UNAVAILABLE", 502), identity.cookie);
    if (identity.db && (reservation || /\/jobs\/[a-f0-9-]{36}$/.test(url.pathname))) {
      const data = await boundedJSON(response);
      let accountingWarning;
      try {
        if (reservation && response.ok) {
          await bind(identity, reservation, data);
          if (url.pathname.endsWith("/assistant/explain")) await assistantUsage(identity, env, reservation, data);
        } else if (reservation) await finish(identity, reservation, "FAILED");
        if (response.ok && url.pathname.includes("/jobs/")) await reconcileJob(identity, env, data, engineFetch);
      } catch { accountingWarning = "USAGE_SYNC_PENDING"; }
      return decorate(Response.json({ ...data, ...(accountingWarning ? { accounting_warning: accountingWarning } : {}) }, { status: response.status }), identity.cookie);
    }
    return decorate(response, identity.cookie);
  } catch (failure) {
    if (reservation) { try { await finish(identity, reservation, "FAILED"); } catch {} }
    if (failure instanceof ControlError) return decorate(Response.json({ success: false, error: { code: failure.code, message: failure.message, recoverable: true } }, { status: failure.status }), identity?.cookie);
    if (failure.message === "INVALID_REQUEST") return decorate(error("INVALID_REQUEST", 400), identity?.cookie);
    if (failure instanceof SyntaxError) return decorate(error("INVALID_REQUEST", 400), identity?.cookie);
    if (failure.message === "UPLOAD_TOO_LARGE") return decorate(error("UPLOAD_TOO_LARGE", 413), identity?.cookie);
    const missing = failure.message === "GATEWAY_NOT_CONFIGURED" || failure instanceof TypeError;
    return decorate(error(missing ? "GATEWAY_NOT_CONFIGURED" : "ENGINE_UNAVAILABLE", missing ? 503 : 502), identity?.cookie);
  }
}

export default { fetch(request, env) { return handle(request, env); } };
