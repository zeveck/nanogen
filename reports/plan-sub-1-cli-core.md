# Plan Report — SUB_1_CLI_CORE

## Phase — 4 HTTP Client: Retry, Error Mapping, Env Resolver

**Plan:** plans/SUB_1_CLI_CORE.md
**Status:** Done
**Commit:** `a456bb3` on main
**Landing mode:** direct-to-main

### Work Items
| # | Item | Status |
|---|------|--------|
| 1 | `resolveApiKey()` with hand-rolled `.env` parser (sidesteps `loadEnvFile` pitfalls) | Done |
| 2 | `findDotenvFile()` walker: cwd upward → `__dirname` upward, dedup | Done |
| 3 | `parseDotenvSync()` zero-dep parser; empty-values-as-absent | Done |
| 4 | `fetchWithRetry()` with MAX_RETRIES/BASE_DELAY/TIMEOUT env overrides | Done |
| 5 | Exponential backoff + 50% jitter; `Retry-After` honored (int 1–60 s) | Done |
| 6 | Body-parse failures non-retryable | Done |
| 7 | `mapHttpError()` 11-row table | Done |
| 8 | CLI entrypoint wired: `runHttpFlow` replaces Phase-1 stub | Done |
| 9 | `tests/test_http_retry.cjs` ≥10 tests via `node:http` mock | Done (13) |
| 10 | `tests/test_env.cjs` ≥8 tests incl. empty-GEMINI_API_KEY reproducer | Done (12) |

### Verification
- `test_http_retry.cjs` → **13/13 passed** (3.35s)
- `test_env.cjs` → **12/12 passed**
- Regression: 30 + 21 + 14 + 21 = **86 prior tests still green**
- Aggregate: **111 tests passing**
- **Critical reproducer:** empty `GEMINI_API_KEY` + `.env` with real value → resolver correctly returns the `.env` value (this was the `loadEnvFile` bug the spec was built around)

### Deviations
- `test_http_retry.cjs` uses async `spawn` (wrapped in a Promise) instead of `spawnSync`. Rationale: `spawnSync` blocks the parent event loop, deadlocking the in-process HTTP mock (the server cannot accept the child's connection). Reproduced the deadlock before switching. `test_env.cjs` still uses `spawnSync` where appropriate.
- Empty-values-as-absent logic lives inside `parseDotenvSync` (not a post-filter at call sites) — cleaner contract, matches test expectations.
- Test 10 (chmod-000 `.env`) skips under root (root can read 0-mode files) via `process.getuid() === 0` detection.
- Shipped 13 HTTP tests (2 extra pure-function unit tests for `mapHttpError` and `parseRetryAfter`) beyond the ≥10 floor.

### Gaps
None. Phase 5 surface (file writing, history JSONL, integration tests) is explicitly NOT touched per Phase 4 scope.

### Next
- **SUB_1 Phase 5** — History JSONL, end-to-end integration, aggregate `npm test` green with ≥89 tests. Final SUB_1 phase.

---

## Phase — 3 Pure Request Builder + Response Parser

**Plan:** plans/SUB_1_CLI_CORE.md
**Status:** Done
**Commit:** `78eebd7` on main
**Landing mode:** direct-to-main

### Work Items
| # | Item | Status |
|---|------|--------|
| 1 | `readImageMaterials(args)` I/O wrapper | Done |
| 2 | `buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex)` — pure | Done |
| 3 | `parseResponse(json)` with 8-step decision tree | Done |
| 4 | `magicBytes.cjs` shared helper (rule 19 + response magic check) | Done |
| 5 | 9 request goldens | Done |
| 6 | 10 response fixtures | Done |
| 7 | `tiny-1x1.png` fixture (67-byte canonical PNG) | Done |
| 8 | `test_request_builder.cjs` ≥10 tests | Done (14) |
| 9 | `test_response_parser.cjs` ≥12 tests, all 8 refusal paths | Done (21, all 8 paths asserted) |
| 10 | `--dry-run` uses real builder (not Phase 1 stub) | Done |
| 11 | OMIT `thinkingConfig` when unset; OMIT `safetySettings` when unset | Done |

### Verification
- `test_request_builder.cjs` → **14/14 passed**
- `test_response_parser.cjs` → **21/21 passed** (20 cases + refusal-coverage assertion)
- Regression: `test_parse_args.cjs` **30/30**, `test_styles.cjs` **21/21**
- Aggregate so far: **86 tests passing**
- All 8 refusal paths asserted: `prompt-blocked:SAFETY`, `finish:SAFETY`, `finish:PROHIBITED_CONTENT`, `finish:IMAGE_SAFETY`, `finish:RECITATION`, `soft-refusal:no-image`, `no-candidates`, `bad-image-bytes`

### Deviations
- Shipped 10 response fixtures (plan's AC says ≥9; text said "7+"). Went with the stricter AC.
- Added a final refusal-path-coverage test that fails if any path is un-asserted — defense in depth.
- Extra test (case 17) combines `promptFeedback.blockReason` with a candidate containing `thoughtSignature`, proving step 2 does NOT early-return.
- Additional exports (`composePromptText`, `canonicalSafetySettings`, `mimeTypeForExt`) for Phase 4/5 use. No behavior change.

### Gaps
None.

### Next
- **SUB_1 Phase 4** — HTTP client: `resolveApiKey` (with manual `.env` parsing to sidestep `loadEnvFile` pitfalls), `fetchWithRetry`, `mapHttpError`, `test_http_retry.cjs` (≥10 tests via `node:http` mock), `test_env.cjs` (≥8 tests).

---

## Phase — 2 Style Catalog (styles.json + loader + --style)

**Plan:** plans/SUB_1_CLI_CORE.md
**Status:** Done
**Commit:** `9beb172` on main
**Landing mode:** direct-to-main

### Work Items
| # | Item | Status |
|---|------|--------|
| 1 | `styles.json` with exactly 72 presets | Done |
| 2 | Exactly 10 fixed categories | Done |
| 3 | Every required slug present, neutral promptFragments | Done |
| 4 | `loadStyles()` / `validateStyleCatalog()` / `applyStyles()` | Done |
| 5 | Startup catalog validation BEFORE arg parsing | Done |
| 6 | Validation Matrix rule 5b → `E_UNKNOWN_STYLE` | Done |
| 7 | `--help` includes `--style` note | Done |
| 8 | Request body composition via `applyStyles` | Done |
| 9 | `tests/test_styles.cjs` with ≥14 tests | Done (21 tests) |
| 10 | Forbidden-tokens policy enforced in validator + test | Done |

### Verification
- `node build/nanogen/tests/test_styles.cjs` → **21/21 passed**
- Regression: `node build/nanogen/tests/test_parse_args.cjs` → **30/30 passed**
- `styles.json` count: 72 presets, 10 distinct categories (verified)
- All 13 forbidden tokens checked against live promptFragments — clean

### Deviations
- Shipped 21 tests (spec required ≥14) — added coverage for promptFragment length limits, empty-fragment, synthetic forbidden-token rejection, per-category counts, full slug inventory.
- Added `NANOGEN_STYLES_PATH` test-only env override so tests can point the loader at malformed tmp catalogs. Documented inline; not in `--help` (same pattern as other `NANOGEN_*` hooks).
- `validateArgs` accepts optional `stylesIndex`; rule 5b only fires when supplied. Preserves Phase 1 unit semantics.

### Gaps
None.

### Next
- **SUB_1 Phase 3** — Pure request builder + response parser with refusal detection + golden fixtures.

---

## Phase — 1 Scaffold + Arg Parser + --help + --dry-run

**Plan:** plans/SUB_1_CLI_CORE.md
**Status:** Done
**Commit:** `ae67fde` on main
**Landing mode:** direct-to-main (worktree isolation unavailable in this environment — agent worked directly on main. Since Phase 1 adds only new files under `build/nanogen/`, no conflict risk with other work.)

### Work Items
| # | Item | Status |
|---|------|--------|
| 1 | `build/nanogen/` layout + `tests/` + `fixtures/` | Done |
| 2 | `generate.cjs` with shebang + chmod +x | Done |
| 3 | Runtime env check (Node 20.12+, `loadEnvFile`, `AbortSignal.timeout`) | Done |
| 4 | `parseArgs(argv)` hand-rolled | Done |
| 5 | `validateArgs(args)` — 21-rule matrix, short-circuits on first failure | Done |
| 6 | `--help` / `-h` → free-form text starting with `Usage: nanogen `, exit 0 | Done |
| 7 | `--dry-run` → JSON stub request, exit 0, works with empty `GEMINI_API_KEY` | Done |
| 8 | `NANOGEN_API_BASE` env override respected in URL | Done |
| 9 | `package.json` with `engines.node >=20.12`, zero dependencies | Done |
| 10 | `README.md` with Testing section listing 4 test-only env vars | Done |
| 11 | `tests/test_parse_args.cjs` with ≥21 tests using `node:assert/strict` + `spawnSync` + `withCleanEnv` | Done (30 tests) |

### Verification
- Direct re-run: `node build/nanogen/tests/test_parse_args.cjs` → **30/30 passed**
- Spec compliance: all 21 validation codes exercised by at least one test
- Dry-run contract: baseline test emits `{"dryRun":true,...}` with `headers["x-goog-api-key"]==="<redacted>"`
- `--help` contract: stdout starts with `Usage: nanogen ` and is NOT JSON (per plan's "only stdout-not-JSON case" rule)
- Env isolation: `withCleanEnv` helper deletes all 6 env keys before tests

### Deviations flagged by implementer

1. **`--image` validation per-file evaluation.** Rules 15–19 check each image's existence/ext/size/magic-bytes before rule 20 counts all images. Short-circuit semantics preserved (first failure wins). All 6 image-related codes independently testable.
2. **Non-dry-run, non-help path** returns `code: "E_NOT_IMPLEMENTED"` (exit 1) as a Phase 1 stub. Phase 4 will replace this with `E_MISSING_API_KEY` + HTTP path. The stub code is intentionally NOT in the stable 21-code set.
3. **`safetySettings` stderr warning uses canonical uppercase category names** (e.g. `HARM_CATEGORY_HARASSMENT`, not `harassment`) to match the "canonical upper-case" body-emission rule. Test asserts the exact form.
4. **`--style <value>` accepted but NOT validated** per Phase 2 handoff.

None of these are gaps — they're explicit interpretation choices aligned with the spec.

### Gaps
None.

### Next
- **SUB_1 Phase 2** — Style catalog (`styles.json` + loader + `--style` validation). 72 presets across 10 categories, ≥14 tests.
- Next hourly cron tick (`:33 UTC`) will advance.
