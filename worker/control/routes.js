import { reconcileAccount } from "./billing.js";
import {
  configured,
  enabled,
  database,
  input,
  uuid,
  text,
  number,
  ControlError,
} from "./db.js";
import { authenticate, authRoute } from "./auth.js";
const userTables = {
  wallet: "revector_wallets",
  transactions: "revector_wallet_transactions",
  usage: "revector_usage_events",
  requests: "revector_requests",
  preferences: "revector_user_model_preferences",
};
function page(url) {
  const n = Number(url.searchParams.get("offset") || 0);
  if (!Number.isInteger(n) || n < 0 || n > 100000)
    throw new ControlError("INVALID_PAGE");
  return { limit: "50", offset: String(n) };
}
function options(identity) {
  return { auth: true, token: identity.access };
}
export async function controlRoute(request, env, transport) {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === "/api/account/bootstrap" && request.method === "GET") {
    if (enabled(env) && !configured(env))
      throw new ControlError(
        "CONTROL_NOT_CONFIGURED",
        503,
        "Account configuration is incomplete.",
      );
    if (!configured(env))
      return Response.json({
        configured: false,
        profile: null,
        account_status: "UNAVAILABLE",
      });
    try {
      const id = await authenticate(request, env, transport);
      return Response.json(
        { configured: true, profile: id.profile },
        { headers: id.cookie ? { "Set-Cookie": id.cookie } : {} },
      );
    } catch (e) {
      if (e.status === 401)
        return Response.json({
          configured: true,
          profile: null,
          account_status: "SIGNED_OUT",
        });
      throw e;
    }
  }
  if (path.startsWith("/api/admin/"))
    throw new ControlError("ROUTE_NOT_ALLOWED", 404);
  if (path.startsWith("/api/auth/"))
    return authRoute(request, env, transport, false);
  const identity = await authenticate(request, env, transport, false);
  const db = identity.db,
    uid = identity.user.id;
  const response = (data) =>
    Response.json(data, {
      headers: identity.cookie ? { "Set-Cookie": identity.cookie } : {},
    });
  const route = path.slice("/api/account/".length);
  if (route === "profile" && request.method === "GET")
    return response({ profile: identity.profile });
  if (route === "profile" && request.method === "PATCH") {
    const d = await input(request);
    if (Object.keys(d).some((k) => !["name", "company"].includes(k)))
      throw new ControlError("FIELD_NOT_ALLOWED");
    const body = {};
    if (d.name !== undefined) body.name = text(d.name, 120, false);
    if (d.company !== undefined) body.company = text(d.company, 180, false);
    return response({
      profile: (
        await db.table(
          "revector_profiles",
          { id: "eq." + uid },
          {
            ...options(identity),
            method: "PATCH",
            body,
            prefer: "return=representation",
          },
        )
      )[0],
    });
  }
  if (route === "models" && request.method === "GET")
    return response({
      items: await db.table(
        "revector_model_catalog",
        {
          enabled: "eq.true",
          select:
            "id,provider,model_id,display_name,capability,enabled,pricing_version,operation_prices",
        },
        options(identity),
      ),
      routing: "PREFERENCE_ONLY",
    });
  if (route in userTables && request.method === "GET") {
    let pendingSync = false;
    if (route === "usage") {
      try {
        pendingSync = await reconcileAccount(identity, env, transport);
      } catch {
        pendingSync = true;
      }
    }
    const query = { user_id: "eq." + uid, select: "*", ...page(url) };
    if (route === "usage") query.event_key = "not.like.request:*";
    if (["transactions", "usage", "requests"].includes(route))
      query.order = "created_at.desc";
    return response({
      items: await db.table(userTables[route], query, options(identity)),
      ...(pendingSync ? { accounting_warning: "USAGE_SYNC_PENDING" } : {}),
    });
  }
  if (route === "preferences" && request.method === "PUT") {
    const d = await input(request);
    return response(
      await db.rpc("rv_set_preferences", {
        p_user: uid,
        p_analyzer: d.analyzer_model_id ? uuid(d.analyzer_model_id) : null,
        p_image: d.image_model_id ? uuid(d.image_model_id) : null,
      }),
    );
  }
  if (route === "requests" && request.method === "POST") {
    const d = await input(request);
    let payload, status;
    if (d.type === "TOPUP") {
      payload = {
        requested_credits: number(d.requested_credits, 0.0001),
        payment_method: text(d.payment_method, 100),
        payment_note: text(d.payment_note || "", 1000, false),
      };
      status = "PENDING";
    } else if (d.type === "MODEL_CHANGE") {
      payload = {
        desired_model: text(d.desired_model, 200),
        capability: text(d.capability, 20),
        reason: text(d.reason, 1000),
        ...(d.model_id ? { model_id: uuid(d.model_id) } : {}),
      };
      if (!["ANALYZER", "IMAGE"].includes(payload.capability))
        throw new ControlError("INVALID_CAPABILITY");
      status = "PENDING";
    } else if (d.type === "SUPPORT") {
      payload = {
        message: text(d.message, 4000),
        priority: d.priority || "NORMAL",
      };
      if (!["LOW", "NORMAL", "HIGH"].includes(payload.priority))
        throw new ControlError("INVALID_PRIORITY");
      status = "OPEN";
    } else throw new ControlError("INVALID_REQUEST_TYPE");
    const category = d.category || "OTHER";
    if (
      ![
        "TECHNICAL",
        "VECTOR_QUALITY",
        "BILLING",
        "CREDITS",
        "MODEL",
        "ACCOUNT",
        "OTHER",
      ].includes(category)
    )
      throw new ControlError("INVALID_CATEGORY");
    return response({
      request: (
        await db.table(
          "revector_requests",
          {},
          {
            method: "POST",
            body: {
              user_id: uid,
              type: d.type,
              status,
              subject: text(d.subject || d.type, 160),
              category,
              payload,
            },
            prefer: "return=representation",
          },
        )
      )[0],
    });
  }
  if (route === "support/messages" && request.method === "GET") {
    const ticket = uuid(url.searchParams.get("request_id"));
    return response({
      items: await db.table(
        "revector_support_messages",
        {
          request_id: "eq." + ticket,
          select: "*",
          order: "created_at.asc",
          ...page(url),
        },
        options(identity),
      ),
    });
  }
  if (route === "support/message" && request.method === "POST") {
    const d = await input(request);
    return response(
      await db.rpc("rv_user_support_message", {
        p_user: uid,
        p_request: uuid(d.request_id),
        p_message: text(d.message, 4000),
      }),
    );
  }
  throw new ControlError("ROUTE_NOT_ALLOWED", 404);
}
