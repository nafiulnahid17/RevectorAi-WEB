# ReVector WEB upgrade verification

Date: 2026-10-05 (Asia/Dhaka). Baseline WEB main: da7250001188cc6cd329d6324a6fe4e2be2978e4.
Engine local source remained unchanged at ca43c35aa363695c4eaa6b563a2bbf89102396c9.
CI pins approved engine API commit 699ac010ad73c6eb5f8bf4b932f9cd5952879aff.

PASS means implemented and locally verified at the stated scope, not a claim that
production Supabase credentials/migrations have been installed. Account browser
screens use fixtures confined to tests; SQL/RLS/ledger tests execute real PostgreSQL
migration code via PGlite. The vector workflow uses the real secured Worker and
existing deterministic engine, with no live AI calls or invented provider activation.

| Check | Result / evidence |
| --- | --- |
| Visual theme | PASS — dark navy, gold actions, technical accents; inspected browser renders |
| Profile dropdown | PASS — user-only entries, no admin navigation |
| User Dashboard | PASS — own wallet/status/usage, honest empty state |
| Profile | PASS — edit name/company; password through Auth; role edits denied |
| Balance | PASS — own wallet/ledger, reserved funds separated |
| Add Credits | PASS — manual pending requests, no automatic payment claim |
| Usage | PASS — actual engine identity; unknown cost remains unavailable |
| Select Models | PASS — enabled catalog, Auto, preference/request only |
| Support | PASS — own tickets/history and operations replies |
| Supabase schema | PASS — migration executes, prefixed independent tables |
| RLS | PASS — cross-user reads denied; privilege edits/RPCs blocked |
| Wallet ledger | PASS — row locks, atomic ledger, append-only history, idempotency |
| Usage accounting | PASS — preflight/reservation, immutable price/rate snapshot, per-operation rounding, terminal job reconciliation |
| Top-up workflow | PASS — pending → approved ledger once; rejected requests charge/fund nothing |
| Model request workflow | PASS — capability/enabled catalog checks and authorized approval; reply-only supported |
| Admin panel | PASS — separate static login/shell/cookie; normal user session insufficient |
| Admin wallet adjustment | PASS — required reason, bounded delta, ledger and audit |
| Admin Support Inbox | PASS — private conversation, statuses, SUPPORT least privilege |
| Admin Audit Log | PASS — privileged global read; append-only entries |
| Existing ReVector workflow | PASS — real upload, 8-slot review, automatic production, fill edit/revalidation, part-only download |
| Startup screen | PASS — real bootstrap status, 3-second minimum healthy initial load; retries preserve workspace |
| Welcome voice | PASS — healthy server/engine only, once per session; no unverified AI-ready statement |
| Browser layout | PASS — 1920, 1600, 1440, 1366, 1280 and 390 width account checks; production desktop/mobile checks |
| Security | PASS — CSRF, own headers, cookie integrity/separation, role freshness, HTML secret/source protection, upload field bypass prevention |
| SVG/PDF/EPS | PASS — actual selected-part files; PDF no raster rows, Ghostscript EPS parse, Inkscape PDF→SVG reopening with real paths |
| Production Pack | PASS — ZIP contains individual parts, no assembled/master vector |
| Native AI | UNAVAILABLE — no fake renamed Adobe Illustrator files |
| Adobe Illustrator itself | NOT EXECUTED — strict SVG parser/render, Inkscape, Poppler and Ghostscript used instead |

Real deterministic sample: `public/assets/sample-layout.png`. Two actual components
were classified/confirmed as Front Body and Back Body. Six other canonical slots
were explicitly left blank; they were not fabricated. Validation: PASS, 124 paths,
22 groups, 2,707 anchors, 0 embedded rasters, render succeeded. Static Illustrator
compatibility: PASS with scope explicitly limited to feature/parser checks.
SSIM 0.9065 is advisory, not a fidelity or pixel-perfect guarantee. Color edits
persisted to real SVG geometry and reran deterministic validation.

Required final gates are `npm ci`, `npm run check`, `npm test`, `npm run build`,
standalone/account/production/security browser tests and latest main CI. Their
final execution results and main commit/CI URL are supplied in the delivery report.
QA screenshots/export files remain outside Git; CI uploads test-results artifacts.

## Remaining production setup

Apply the reviewed Supabase migration to the intended project, provision invited
profiles with explicit roles, configure the Worker Supabase secrets, and verify
live invitation/login/ledger isolation. Verified catalog prices plus CREDITS_PER_USD
are needed to activate estimated credit charging. These were not invented or
configured during this task. Error Assistant exact model/cost and provider invoice
metadata remain unavailable from the current engine contract.

Required environment names only: ENGINE_ORIGIN, ENGINE_API_KEY,
SESSION_SIGNING_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY, CREDITS_PER_USD.
