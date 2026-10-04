# WEB upgrade audit
Starting main: da7250001188cc6cd329d6324a6fe4e2be2978e4 (fast-forwarded before edits).
Engine repository is read-only. Contract reference: 699ac010ad73c6eb5f8bf4b932f9cd5952879aff.
Deployed engine has the later Cloudflare native JSON adapter, with the same frontend API contract.
No engine, Railway configuration, engine secret or OpenAI integration is part of this upgrade.

Existing modular workflow, signed anonymous cookies, CSRF checks, streamed uploads,
gateway route allowlist, private owner headers, job resume/cancel, semantic eight-slot
review, vector shape edits, validation, part-only downloads and advisory recovery
are retained. Nine baseline gateway tests and the standalone browser preview passed.

Three preexisting edits were backed up outside Git and stashed before sync. The
obsolete preview fallback fix is already superseded by the newer paths-only preview,
which avoids raw-trace/raster fallbacks; its unsafe download behavior is not restored.
Generated HTML and its matching script hash are rebuilt from the latest sources.

Nine attached PNG references were inspected. Generated mockup numbers, plan names,
incorrect garment labels and native AI buttons are illustrative, not application data.
Supabase is not configured in WEB. Schema and tests are local only; existing connected
Supabase projects and production data are not modified.

Latest correction applied: operations login/shell/session are separate at /admin/login
and /admin, not an entry in the user profile menu. SUPPORT has ticket-only authority;
ADMIN owns global management. Engine Git worktree stayed clean. The approved
contract's status=completed/job_state=SUCCEEDED is explicitly handled by accounting.
The build now inserts inline script via a replacement callback, preserving literal
USD dollar signs and matching both shell scripts against their CSP hash.
