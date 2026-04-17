# nanogen

**Under construction.** This directory contains the zero-dependency Node.js
CLI for the `/nanogen` skill — text-to-image generation via Google's Gemini
Nano Banana models. See [`plans/SUB_1_CLI_CORE.md`](../../plans/SUB_1_CLI_CORE.md)
for the authoritative spec.

As of this revision only Phase 1 is implemented: arg parser, 21-rule
validation matrix, `--help`, and `--dry-run`. HTTP, retry, style catalog,
and history are landed in later phases.

## Testing / env overrides

These environment variables are **test-only hooks** and are intentionally
omitted from `--help`:

| Var | Purpose |
|-----|---------|
| `NANOGEN_API_BASE`         | Override the Gemini API base URL. Point at an in-process mock (`http://127.0.0.1:<port>`) for offline retry/integration tests. |
| `NANOGEN_RETRY_BASE_MS`    | Base exponential-backoff delay in milliseconds. Default 1000. Tests set to 5 so the full retry ladder completes in ~35ms. |
| `NANOGEN_FETCH_TIMEOUT_MS` | Per-attempt fetch timeout in milliseconds. Default 120000. |
| `NANOGEN_MAX_RETRIES`      | Retry count ceiling. Default 3 (→ 4 total attempts). |

These are documented here, not in `--help`, so the user-facing help text
stays focused on the real CLI surface.
