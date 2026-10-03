/* Start both split services locally using ephemeral server-only credentials. */
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const engine = path.resolve(process.env.REVECTOR_ENGINE_DIRECTORY || "../RevectorAI-Tool");
const key = randomBytes(48).toString("base64url");
const signing = randomBytes(48).toString("base64url");
if (fs.existsSync(path.join(root, ".dev.vars"))) throw new Error(".dev.vars already exists. Preserve your configuration or move it aside before running this ephemeral test launcher.");
fs.writeFileSync(path.join(root, ".dev.vars"), `ENGINE_ORIGIN=http://127.0.0.1:8012\nALLOW_INSECURE_LOCAL_ENGINE=true\nENGINE_API_KEY=${key}\nSESSION_SIGNING_KEY=${signing}\n`, { mode: 0o600 });
const children = [
  spawn(path.join(engine, ".venv/bin/python"), ["-m", "app.server"], { cwd: engine, stdio: "inherit", env: { ...process.env, PORT: "8012", REVECTOR_API_KEY: key, REVECTOR_ALLOW_UNAUTHENTICATED: "false", REVECTOR_DATA_DIR: path.join(engine, "data/secure-split-preview") } }),
  spawn(process.execPath, [path.join(root, "node_modules/wrangler/bin/wrangler.js"), "dev", "--local", "--ip", "127.0.0.1", "--port", "8787"], { cwd: root, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } }),
];
function shutdown() {
  for (const child of children) child.kill("SIGTERM");
  fs.rmSync(path.join(root, ".dev.vars"), { force: true });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);
for (const child of children) child.on("error", (error) => { console.error(error.message); shutdown(); process.exitCode = 1; });
console.log("Local website: http://127.0.0.1:8787 — credentials stay server-side. Ctrl+C stops both services.");
