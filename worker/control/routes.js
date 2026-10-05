import { reconcileAccount } from "./billing.js";
import {
  configured,
  enabled,
  configuration,
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
const AVATAR_BUCKET = "revector-avatars";
const AVATAR_LIMIT = 3 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
function profileSetupComplete(profile) {
  if (profile?.role !== "USER") return true;
  if (!Object.prototype.hasOwnProperty.call(profile || {}, "profile_completed_at"))
    return true;
  return Boolean(profile.profile_completed_at);
}
function avatarPath(uid) {
  return uid + "/avatar";
}
async function storageObject(env, transport, path, init = {}) {
  const origin = configuration(env);
  const headers = new Headers(init.headers || {});
  headers.set("apikey", env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set("Authorization", "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY);
  return transport(
    new Request(
      origin +
        "/storage/v1/object/" +
        AVATAR_BUCKET +
        "/" +
        path.split("/").map(encodeURIComponent).join("/"),
      { ...init, headers, redirect: "manual" },
    ),
  );
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
        {
          configured: true,
          profile: id.profile,
          profile_setup_required: !profileSetupComplete(id.profile),
        },
        { headers: id.cookie ? { "Set-Cookie": id.cookie } : {} },
      );
    } catch (e) {
      if (e.status === 401 || e.code === "USER_REQUIRED")
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
  const onboardingRoute =
    route === "profile" ||
    route === "avatar" ||
    route === "profile/complete";
  if (!profileSetupComplete(identity.profile) && !onboardingRoute)
    throw new ControlError(
      "PROFILE_SETUP_REQUIRED",
      403,
      "Complete your ReVector profile before using account services.",
    );
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
  if (route === "avatar" && request.method === "GET") {
    if (!identity.profile.avatar_path)
      throw new ControlError("AVATAR_NOT_FOUND", 404, "Profile picture not found.");
    const asset = await storageObject(
      env,
      transport,
      identity.profile.avatar_path,
      { method: "GET" },
    );
    if (!asset.ok)
      throw new ControlError("AVATAR_NOT_FOUND", 404, "Profile picture not found.");
    const headers = new Headers();
    headers.set(
      "Content-Type",
      asset.headers.get("content-type") || "application/octet-stream",
    );
    headers.set("Cache-Control", "private, no-store");
    if (identity.cookie) headers.set("Set-Cookie", identity.cookie);
    return new Response(asset.body, { status: 200, headers });
  }
  if (route === "avatar" && request.method === "POST") {
    const type = (request.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!AVATAR_TYPES.has(type))
      throw new ControlError(
        "INVALID_AVATAR",
        400,
        "Use a JPG, PNG, or WEBP profile picture.",
      );
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > AVATAR_LIMIT)
      throw new ControlError(
        "AVATAR_TOO_LARGE",
        413,
        "Profile picture must be 3 MB or smaller.",
      );
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > AVATAR_LIMIT)
      throw new ControlError(
        "AVATAR_TOO_LARGE",
        413,
        "Profile picture must be between 1 byte and 3 MB.",
      );
    const path = avatarPath(uid);
    const stored = await storageObject(env, transport, path, {
      method: "POST",
      headers: {
        "Content-Type": type,
        "x-upsert": "true",
        "Cache-Control": "3600",
      },
      body: bytes,
    });
    if (!stored.ok)
      throw new ControlError(
        "AVATAR_UPLOAD_FAILED",
        502,
        "Profile picture could not be saved.",
      );
    return response({
      profile: (
        await db.table(
          "revector_profiles",
          { id: "eq." + uid },
          {
            method: "PATCH",
            body: { avatar_path: path },
            prefer: "return=representation",
          },
        )
      )[0],
    });
  }
  if (route === "profile/complete" && request.method === "POST") {
    const profile = (
      await db.table("revector_profiles", {
        id: "eq." + uid,
        select: "*",
        limit: "1",
      })
    )[0];
    if (
      !profile?.name?.trim() ||
      !profile?.company?.trim() ||
      !profile?.avatar_path ||
      !profile?.password_updated_at
    )
      throw new ControlError(
        "PROFILE_SETUP_INCOMPLETE",
        409,
        "Add your name, company, profile picture, and a new password first.",
      );
    return response({
      profile: (
        await db.table(
          "revector_profiles",
          { id: "eq." + uid },
          {
            method: "PATCH",
            body: { profile_completed_at: new Date().toISOString() },
            prefer: "return=representation",
          },
        )
      )[0],
    });
  }
  if (route === "payment-settings" && request.method === "GET") {
    const settings = (
      await db.table(
        "revector_payment_settings",
        {
          id: "eq.default",
          select: "usd_to_bdt_rate,bkash,nagad,updated_at",
          limit: "1",
        },
        options(identity),
      )
    )[0] || null;
    return response({ settings });
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
      const requested = number(d.requested_credits, 0.0001);
      const method = text(d.payment_method, 20).toUpperCase();
      if (!["BKASH", "NAGAD"].includes(method))
        throw new ControlError("INVALID_PAYMENT_METHOD");
      const settings = (
        await db.table(
          "revector_payment_settings",
          {
            id: "eq.default",
            select: "usd_to_bdt_rate,bkash,nagad,updated_at",
            limit: "1",
          },
          options(identity),
        )
      )[0];
      const methodSettings = settings?.[method.toLowerCase()];
      if (
        !settings ||
        !methodSettings?.enabled ||
        !String(methodSettings?.number || "").trim()
      )
        throw new ControlError(
          "PAYMENT_METHOD_UNAVAILABLE",
          409,
          "The selected payment method is not currently available.",
        );
      payload = {
        requested_credits: requested,
        requested_balance_usd: requested,
        payment_method: method,
        payment_destination: String(methodSettings.number),
        payment_note: text(d.payment_note || "", 1000, false),
        usd_to_bdt_rate: Number(settings.usd_to_bdt_rate),
        quoted_bdt: Math.round(requested * Number(settings.usd_to_bdt_rate) * 100) / 100,
        payment_settings_updated_at: settings.updated_at,
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
