# RevectorAI Web

The ReVector browser workspace and its Cloudflare Worker gateway. This repository
contains the **website only**. The Python engine is in
[RevectorAI-Tool](https://github.com/nafiulnahid17/RevectorAI-Tool).

There is no hero section. The tool workflow is input → analyze → detect parts →
confirm boundaries and measurements → vectorize → validate → download. Individual
parts, selected parts and the full production pack can be downloaded. SVG, vector
PDF and EPS exports use the actual engine. Native `.ai` export is unavailable;
files are never renamed to simulate Illustrator format.

## Architecture and security

`Browser → same-origin Cloudflare Worker → HTTPS authenticated ReVector engine`

The browser calls `/api/revector` on its own website origin. The Worker injects a
server-only bearer credential and a verified owner identity; the engine checks
ownership on projects, jobs and artifacts. Browser-supplied authorization and
identity headers are discarded. Mutating requests require the same website Origin.
Uploads and downloads stream through the gateway; command JSON and engine uploads
are size-bounded. Redirects to other servers are rejected.

An independent signing secret protects HttpOnly, Secure, SameSite=Lax anonymous
session cookies. Sessions expire after seven days of inactivity. Keep the cookie
to access previous projects; clearing it loses access. This is session isolation,
not account login or credit/rate-limit enforcement. Add JerseyOS identity or
Cloudflare Access before restricting a commercial deployment. Existing ownerless
engine projects require an explicit administrator migration.

Secrets do not enter the static build. The browser receives no engine URL/key.
The Worker returns no-store API responses and a CSP with a generated script hash.
Backend SVG sandbox response headers are preserved.

## Cloudflare deployment

Use **Cloudflare Workers with Static Assets**, rather than a static-only Pages
upload. The Worker provides the secure server-side connection.

1. Deploy the engine repository on Railway (see its `docs/RAILWAY.md`), with a
   persistent volume and private random `REVECTOR_API_KEY` of at least 32 characters.
2. Install Node.js 22 or later, then run `npm ci` in this repository.
3. In `wrangler.jsonc`, set `vars.ENGINE_ORIGIN` to the real engine HTTPS origin,
   for example `https://your-service.up.railway.app`. Do not include `/api` or a path.
4. Sign in and set secrets interactively. The first must match the engine key;
   the second must be a separate random value of at least 32 characters.

```bash
npx wrangler login
npx wrangler secret put ENGINE_API_KEY
npx wrangler secret put SESSION_SIGNING_KEY
npm run deploy
```

Do not set `ALLOW_INSECURE_LOCAL_ENGINE` in production. No OpenAI key is needed for
the deterministic workflow. OpenAI analysis/reconstruction is not connected in
this release; this repository does not generate API keys or fabricate AI responses.

For Cloudflare Git integration, connect **this** repository as a Workers project;
use build command `npm run build` and deploy command `npx wrangler deploy`.
Configure the same secrets on that Worker. The dashboard supplies the deployed URL.
Repository publication alone does not deploy either service.

## Local run

Install the engine's Python dependencies and system tools first. Use two terminals:

```bash
# Engine repository: set a private REVECTOR_API_KEY in .env first.
source .venv/bin/activate
python -m app.server
```

```bash
# Website repository:
npm ci
cp .dev.vars.example .dev.vars
# Set ENGINE_API_KEY to the engine's REVECTOR_API_KEY.
# Set an independent random SESSION_SIGNING_KEY (32+ characters).
npm run dev
```

Open `http://127.0.0.1:8787`. `.dev.vars` is ignored by Git. Local HTTP is allowed
only with the explicit flag in the example and a loopback engine origin.

For a disposable, secured local test of both services (engine `.venv` required):

```bash
npm run build
REVECTOR_ENGINE_DIRECTORY=/absolute/path/to/RevectorAI-Tool node scripts/dev-local.cjs
```

This helper creates ephemeral server credentials, starts engine port 8012 and
website port 8787, and removes its generated `.dev.vars` on exit. It refuses to
overwrite an existing `.dev.vars`.

## Usage

- Upload JPG/JPEG/PNG/WEBP or load a supplied sample. Analyze, then detect parts.
- Review each boundary and confirm its category; OpenCV does not guess missing
  garment pieces. Enter real measurements to calibrate production dimensions.
- Vectorize and inspect groups, paths/nodes and colors. Revalidate after editing.
- Download a single part, selected parts ZIP or full production ZIP. Only files
  actually produced are offered. EPS/PDF require Inkscape on the engine.

Three status lights check Server, Engine and Tool. Pending checks pulse, successful
checks turn green, and failed segments turn red with their own Retry option.
**Ready** enables uploads only after real readiness checks succeed. It is separate
from project validation: True Vector exports require zero embedded raster artwork.

## Development and verification

Edit modular sources under `src/`; run `npm run build` to regenerate
`public/index.html` and the matching Worker script-hash manifest. Commit both.
Static sample images are inputs, not fake vector exports.

```bash
npm test
npx wrangler deploy --dry-run
# With Playwright installed and Chromium available:
REVECTOR_TEST_URL=http://127.0.0.1:8787 node scripts/browser-smoke.cjs
REVECTOR_TEST_URL=http://127.0.0.1:8787 node scripts/browser-security.cjs
```

Set `CHROMIUM_PATH` if Chromium is installed elsewhere. Browser tests store
screenshots, actual exports and factual reports in `samples/web-workspace`.
Engine unit/integration tests remain in the engine repository. A hosted URL must
be verified against the real deployed engine before claiming successful deployment.
