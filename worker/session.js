const encoder = new TextEncoder();
const COOKIE = "revector_session";
const LIFETIME = 7 * 24 * 3600;

async function signingKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function hex(bytes) { return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function sign(value, secret) { return hex(await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(value))); }

export async function session(request, env) {
  if (!env.SESSION_SIGNING_KEY || env.SESSION_SIGNING_KEY.length < 32) throw new Error("GATEWAY_NOT_CONFIGURED");
  const existing = request.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  let id;
  if (existing && /^[a-f0-9]{32}\.\d{10}\.[a-f0-9]{64}$/.test(existing)) {
    const [candidate, expiry, signature] = existing.split(".");
    const bytes = Uint8Array.from(signature.match(/../g), (b) => parseInt(b, 16));
    const valid = await crypto.subtle.verify("HMAC", await signingKey(env.SESSION_SIGNING_KEY), bytes, encoder.encode(`${candidate}.${expiry}`));
    if (valid && Number(expiry) > Date.now() / 1000 && Number(expiry) < Date.now() / 1000 + LIFETIME + 60) id = candidate;
  }
  if (!id) id = crypto.randomUUID().replaceAll("-", "");
  const expires = Math.floor(Date.now() / 1000) + LIFETIME;
  const payload = `${id}.${expires}`;
  const token = `${payload}.${await sign(payload, env.SESSION_SIGNING_KEY)}`;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return { principal: "anon_" + id, cookie: `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${LIFETIME}${secure}` };
}
