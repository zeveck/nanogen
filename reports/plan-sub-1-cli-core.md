# Plan Report — SUB_1_CLI_CORE

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
