# Separate user and operations repositories

The user application and Admin/Support console now have independent source,
builds, Worker entry points and deployment targets.

| Repository | Purpose / Cloudflare target |
| --- | --- |
| RevectorAi-WEB | Production tool and own account; existing `revectorai-web` Worker |
| Revectorai-support- | Standalone operations/support console; future `revectorai-support` Worker |
| RevectorAI-Tool | Unchanged deterministic engine |

The user bundle contains no Admin sign-in, operations navigation or privileged
API client. USER Worker `/admin/*`, the legacy `admin-login.html` asset, and all
`/api/admin/*` endpoints return 404, including for callers with an ADMIN database
role. This is source and server separation, not CSS hiding.

The Admin application has its own `/admin/login`, guarded `/admin/*` pages,
server-side ADMIN/SUPPORT checks and APIs. It does not proxy the engine and cannot
serve normal-user account APIs. Its cookie is host-only, encrypted and bound to
the Admin origin. Use a distinct signing key and hostname when deployment is
authorized. No shared browser cookies or cross-origin admin API bypass is needed.

Both Workers use the same reviewed Supabase Auth/control data. Tickets and
operations replies remain in the same private conversation; approved credit
requests update the same atomic wallet ledger/audit. No records were moved or
deleted. The authoritative SQL migration stays in this repository; the Admin
repository carries an identical schema snapshot for its standalone tests.

Existing user invite login, wallet, usage accounting, model preferences, support
history, signed anonymous development mode and production processing remain.
The engine repository and production database were not changed. Manual deployment
was stopped at the user's request; repository separation does not claim either
new Admin hosting or production Supabase activation.

Repository creation may require the owner's GitHub access if the current
integration cannot create repositories. A tested Admin source ZIP is supplied
when that access is unavailable.
