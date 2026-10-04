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
const adminTables = {
  users: "revector_profiles",
  wallets: "revector_wallets",
  transactions: "revector_wallet_transactions",
  usage: "revector_usage_events",
  requests: "revector_requests",
  audit: "revector_admin_audit_log",
  models: "revector_model_catalog",
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
  const admin = path.startsWith("/api/admin/");
  if (path.startsWith("/api/auth/") || path.startsWith("/api/admin/auth/"))
    return authRoute(request, env, transport, admin);
  const identity = await authenticate(request, env, transport, admin);
  const db = identity.db,
    uid = identity.user.id;
  const response = (data) =>
    Response.json(data, {
      headers: identity.cookie ? { "Set-Cookie": identity.cookie } : {},
    });
  if (admin) {
    const route = path.slice("/api/admin/".length);
    if (
      identity.profile.role === "SUPPORT" &&
      !["session", "support", "support/reply", "support/messages"].includes(
        route,
      )
    )
      throw new ControlError(
        "ADMIN_REQUIRED",
        403,
        "This action requires an administrator.",
      );
    if (route === "session" && request.method === "GET")
      return response({ profile: identity.profile });
    if (route === "overview" && request.method === "GET")
      return response(await db.rpc("rv_admin_overview", { p_admin: uid }));
    if (route === "settings" && request.method === "GET")
      return response({
        credits_per_usd: env.CREDITS_PER_USD
          ? Number(env.CREDITS_PER_USD)
          : null,
        payments: "MANUAL_REQUESTS",
        authentication: "INVITE_ONLY",
        model_preferences: "ADVISORY",
        engine_configuration: "READ_ONLY",
      });
    if (route === "support" && request.method === "GET")
      return response({
        items: await db.table("revector_requests", {
          type: "eq.SUPPORT",
          select:
            "*,revector_profiles!revector_requests_user_id_fkey(name,email)",
          order: "updated_at.desc",
          ...page(url),
        }),
      });
    if (route in adminTables && request.method === "GET") {
      const query = { select: route === "usage" ? "*" : "*", ...page(url) };
      if (route === "usage") query.event_key = "not.like.request:*";
      if (!["models", "wallets"].includes(route))
        query.order = "created_at.desc";
      if (route === "requests" && url.searchParams.has("type")) {
        const type = url.searchParams.get("type");
        if (!["TOPUP", "MODEL_CHANGE", "SUPPORT"].includes(type))
          throw new ControlError("INVALID_TYPE");
        query.type = "eq." + type;
      }
      return response({ items: await db.table(adminTables[route], query) });
    }
    if (route === "wallet/adjust" && request.method === "POST") {
      const d = await input(request);
      return response(
        await db.rpc("rv_adjust_wallet", {
          p_admin: uid,
          p_user: uuid(d.user_id),
          p_delta: number(d.delta, -1e6, 1e6),
          p_reason: text(d.reason),
          p_key: uuid(d.idempotency_key),
        }),
      );
    }
    if (route === "requests/decide" && request.method === "POST") {
      const d = await input(request);
      if (d.decision === "REPLY")
        return response(
          await db.rpc("rv_reply_request", {
            p_admin: uid,
            p_request: uuid(d.request_id),
            p_response: text(d.response, 4000),
          }),
        );
      if (!["APPROVED", "REJECTED"].includes(d.decision))
        throw new ControlError("INVALID_DECISION");
      return response(
        await db.rpc("rv_decide_request", {
          p_admin: uid,
          p_request: uuid(d.request_id),
          p_decision: d.decision,
          p_response: text(d.response || "", 4000, false),
          p_key: uuid(d.idempotency_key),
          p_model: d.model_id ? uuid(d.model_id) : null,
        }),
      );
    }
    if (route === "users/status" && request.method === "POST") {
      const d = await input(request);
      if (!["ACTIVE", "SUSPENDED", "DISABLED"].includes(d.status))
        throw new ControlError("INVALID_STATUS");
      return response(
        await db.rpc("rv_set_account_status", {
          p_admin: uid,
          p_user: uuid(d.user_id),
          p_status: d.status,
          p_reason: text(d.reason),
        }),
      );
    }
    if (route === "support/reply" && request.method === "POST") {
      const d = await input(request);
      return response(
        await db.rpc("rv_reply_support", {
          p_admin: uid,
          p_request: uuid(d.request_id),
          p_response: text(d.message, 4000),
          p_status: text(d.status, 30),
        }),
      );
    }
    if (route === "support/messages" && request.method === "GET") {
      const ticket = uuid(url.searchParams.get("request_id"));
      const found = (
        await db.table("revector_requests", {
          id: "eq." + ticket,
          type: "eq.SUPPORT",
          select: "id",
        })
      )[0];
      if (!found) throw new ControlError("NOT_FOUND", 404);
      return response({
        items: await db.table("revector_support_messages", {
          request_id: "eq." + ticket,
          select: "*",
          order: "created_at.asc",
          ...page(url),
        }),
      });
    }
    if (route === "models/update" && request.method === "POST") {
      const d = await input(request);
      if (
        typeof d.enabled !== "boolean" ||
        !d.operation_prices ||
        Array.isArray(d.operation_prices) ||
        Object.keys(d.operation_prices).length > 6
      )
        throw new ControlError("INVALID_PRICING");
      return response(
        await db.rpc("rv_update_catalog", {
          p_admin: uid,
          p_id: uuid(d.model_id),
          p_enabled: d.enabled,
          p_prices: d.operation_prices,
          p_version: text(d.pricing_version, 80),
          p_reason: text(d.reason),
        }),
      );
    }
    throw new ControlError("ROUTE_NOT_ALLOWED", 404);
  }
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
