# Plan Report — SUB_2_EDIT_FLOW

## Phase — 2 `--history-continue` + Multi-Turn + thoughtSignature

**Plan:** plans/SUB_2_EDIT_FLOW.md
**Status:** Done
**Commit:** `2f8dca7` on main
**Landing mode:** direct-to-main

### Work Items
| # | Item | Status |
|---|------|--------|
| 1 | `--history-continue <id>` flag added | Done |
| 2 | `buildContinuationRequestFromMaterials` pure function with 3-turn role-annotated contents | Done |
| 3 | `resolveContinuation` helper enforcing 6 E_CONTINUE_* codes | Done |
| 4 | thoughtSignature preserved verbatim in body | Done |
| 5 | `OUTPUT_FORMAT_TO_MIME` map + magic-byte fallback | Done |
| 6 | Model-mismatch pinned stderr warning | Done |
| 7 | No replay of prior user images (documented contract) | Done |
| 8 | Continuation mode relaxes rules 2/22 (prior model-turn image implicit) | Done |
| 9 | `parentId` wired to `priorEntry.id` for continuation history rows | Done |
| 10 | 3 request goldens + 3 history JSONL fixtures | Done |
| 11 | `tests/test_multi_turn.cjs` ≥14 tests | Done (16) |
| 12 | README "Multi-turn continuation" section + error codes table | Done |

### Verification
- `cd build/nanogen && npm test` → exit 0
- 10 test files: 30 + 21 + 14 + 21 + 13 + 12 + 9 + 6 + 18 + 16 = **160 passing**
- SUB_1 (126) + SUB_2 Phase 1 (18) still green
- thoughtSignature round-trip verified via golden (`body.contents[1].parts[1].thoughtSignature === "sig-abc"`)
- All 6 E_CONTINUE_* codes exercised

### Deviations
- `composePromptText` extended to apply edit-mode boilerplate (`"Edit the provided image(s)."`) in continuation mode with `--region` and no `--prompt`. Prior model-turn image plays the same semantic role as a current-turn `--image` — avoids a leading-space text artifact. Pinned by golden.
- Continuation mode relaxes rules 2 + 22 (the prior model-turn image implicitly satisfies the "image required" constraint); rule 23 (`E_EDIT_NEEDS_INSTRUCTION`) still fires if neither `--prompt` nor `--region` is supplied.
- Shipped 16 tests (≥14 floor).

### Gaps
Self-identified by the implementer:
- `parentId` wiring in history entries not exercised by a dedicated unit test here (tests use `--dry-run`). Phase 3's integration tests will cover it end-to-end per the plan's AC.
- `E_CONTINUE_MISSING_OUTPUT` only tested with ENOENT path; EACCES / permission-denied paths share the same code path but aren't separately asserted.

Neither is a spec gap — flagged for future coverage opportunistically.

### Next
- **SUB_2 Phase 3** — integration test via mock server that round-trips a 2-turn conversation (first call captures sig, second call includes sig in request body), plus README polish to sub-plan-2-complete form.

---

## Phase — 1 Multi-Image Assembly + `--region` Flag

**Plan:** plans/SUB_2_EDIT_FLOW.md
**Status:** Done
**Commit:** `054ccab` on main
**Landing mode:** direct-to-main

### Work Items
| # | Item | Status |
|---|------|--------|
| 1 | Multi-image assembly preserves command-line order | Done (confirmed; already worked from Phase 3) |
| 2 | `--region` flag (repeatable) added to parser | Done |
| 3 | Prompt composition order: prompt → style → region → avoid | Done (golden-tested) |
| 4 | Edit-mode boilerplate `"Edit the provided image(s)."` when `--image` + `--region` without `--prompt` | Done |
| 5 | Rule 22 `E_REGION_WITHOUT_IMAGE` (evaluated before rule 2) | Done |
| 6 | Rule 23 `E_EDIT_NEEDS_INSTRUCTION` (image-only, no prompt, no region) | Done |
| 7 | Rule 2 predicate tightened forward-compatibly (no rename) | Done |
| 8 | 6 golden fixtures (1/2/5/14 images + region-only + full-featured) | Done |
| 9 | `tests/test_edit_multi_image.cjs` ≥12 tests | Done (18) |
| 10 | `--help` updated with `--region` + EDIT MODE example | Done |
| 11 | README "Edit mode" section | Done |
| 12 | `package.json` test script includes new file | Done |

### Verification
- `cd build/nanogen && npm test` → exit 0
- 9 test files: 30 + 21 + 14 + 21 + 13 + 12 + 9 + 6 + 18 = **144 passing**
- SUB_1 unchanged and green (126 prior)
- Golden-test fixtures use a base64 placeholder expanded at test time from the real `tiny-1x1.png` — diff-readable fixtures, one source of truth

### Deviations
- Rule 22 evaluated BEFORE rule 2 in the code path (not strictly at numeric position 22) so `--region` without `--image` surfaces as `E_REGION_WITHOUT_IMAGE` rather than falling through to `E_MISSING_PROMPT_OR_IMAGE`. Pinned by a dedicated precedence test.
- Shipped 18 tests (≥12 floor) — includes golden-expansion helper tests, rule-precedence coverage, CLI + pure-function dual-path.

### Gaps
None.

### Next
- **SUB_2 Phase 2** — `--history-continue`, multi-turn `contents` with role annotations, `thoughtSignature` verbatim round-trip, and the eight new error codes (`E_CONTINUE_*`).
