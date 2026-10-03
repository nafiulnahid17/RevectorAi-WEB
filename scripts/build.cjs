/* No engine secrets are read or included by this frontend build. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const child = require("node:child_process");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const result = esbuild.buildSync({
  entryPoints: [path.join(root, "src/workspace.js")],
  bundle: true, format: "iife", target: "es2020", write: false,
});
const javascript = result.outputFiles[0].text.replace(/<\/script/g, "<\\/script");
const temporary = path.join(root, "public/workspace-build.js");
fs.writeFileSync(temporary, javascript);
const markup = child.execFileSync(process.execPath, [path.join(root, "scripts/prerender-workspace.cjs"), temporary], { encoding: "utf8" });
fs.unlinkSync(temporary);
const fonts = fs.readFileSync(path.join(root, "public/assets/fonts.css"), "utf8");
const css = fs.readFileSync(path.join(root, "src/workspace.css"), "utf8").replace('@import url("./assets/fonts.css");', fonts);
const favicon = fs.readFileSync(path.join(root, "public/assets/mark.svg")).toString("base64");
let html = fs.readFileSync(path.join(root, "src/workspace.template.html"), "utf8")
  .replace('href="./assets/mark.svg"', `href="data:image/svg+xml;base64,${favicon}"`)
  .replace("<!-- WORKSPACE_STYLE -->", `<style>\n${css}\n</style>`)
  .replace("    <!-- WORKSPACE_SCRIPT -->\n", "")
  .replace('<div id="app"><div class="boot">Loading ReVector workspace…</div></div>', `<div id="app">${markup}</div>`)
  .replace("</body>", `<script>\n${javascript}\n</script>\n</body>`);
fs.mkdirSync(path.join(root, "public"), { recursive: true });
fs.writeFileSync(path.join(root, "public/index.html"), html);
const scriptHash = crypto.createHash("sha256").update(`\n${javascript}\n`).digest("base64");
fs.writeFileSync(path.join(root, "worker/security-manifest.json"), JSON.stringify({ scriptHash }) + "\n");
console.log(`Built Cloudflare web workspace (${Buffer.byteLength(html)} bytes); no engine credentials bundled.`);
