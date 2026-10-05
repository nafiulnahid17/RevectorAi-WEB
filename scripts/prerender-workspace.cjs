/* Render the real initial workspace markup, so script-restricted previews show UI. */
const fs = require("node:fs");
const vm = require("node:vm");
const app = { innerHTML: "", addEventListener() {} };
const control = { addEventListener() {} };
const document = {
  querySelector(selector) {
    if (selector === "#app") return app;
    if (["#file-input", "#close-report"].includes(selector)) return control;
    return null;
  },
};
vm.runInNewContext(
  fs.readFileSync(process.argv[2], "utf8"),
  {
    document,
    location: { protocol: "about:", origin: "null", pathname: process.argv[3] || "/" },
    setTimeout,
    clearTimeout,
    REVECTOR_PRERENDER: true,
  },
  { timeout: 5000 },
);
if (!app.innerHTML.includes(process.argv[3] ? "Admin Sign In" : "Upload Your Jersey Artwork"))
  throw new Error("Initial workspace did not render");
process.stdout.write(app.innerHTML);
