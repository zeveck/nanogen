---
title: /nanogen Skill — Meta-Plan
created: 2026-04-17
status: complete
completed: 2026-04-18
---

# Meta-Plan: /nanogen Skill — Build, Edit Flow, Install, User Checkpoint

## Overview
Implement a new `/nanogen` skill for this repo, similar in capabilities
to `github.com/zeveck/imagegen` but built on Google's Nano Banana
(Gemini image generation). Expanded style catalog (≥72 presets, 10
categories), first-class image modification (multi-image refs,
natural-language region guidance, multi-turn continuation with
thoughtSignature round-tripping), thorough offline test coverage
(≥121 tests), developed in `build/nanogen/` then installed into
`.claude/skills/nanogen/` in the FINAL phase. Final phase stops at a
user checkpoint with an API-key setup document for hands-on
verification — the meta-plan is intentionally NOT auto-completed.

## Decomposition
Three sub-plans in a strict linear dependency chain:

1. **SUB_1 — Foundation CLI + Style Catalog + Offline Tests** (5
   phases). Zero-dep Node CLI at `build/nanogen/generate.cjs`,
   72-preset `styles.json`, pure request builder + response parser
   with refusal detection, HTTP client with retry + error mapping,
   `.env`-walking env-var resolution that avoids `process.loadEnvFile`
   pitfalls, JSONL history with tolerant reader. ≥89 offline tests.
2. **SUB_2 — Edit Flow: Multi-Image + `--region` + Multi-Turn
   Continuation** (3 phases). Extends single-image passthrough to
   up-to-14-image composition; natural-language `--region` for mask-
   free inpainting; `--history-continue <id>` with `thoughtSignature`
   round-trip (critical Gemini 3 gotcha); +30 new tests (cumulative
   ≥119). Depends on SUB_1.
3. **SUB_3 — SKILL.md + Install + API-Key Doc + USER CHECKPOINT**
   (3 phases). Authors `SKILL.md` + `reference.md`; installs in a
   SINGLE `rsync`/`cp -r` from `build/nanogen/` into
   `.claude/skills/nanogen/`; writes `reports/nanogen-api-key-setup.md`;
   emits checkpoint banner; writes `.landed` with
   `status: not-landed` in the same bash step as the commit. Final
   phase marked `⊘` (awaiting user), plan `status: active`. Depends
   on SUB_1 + SUB_2.

**Dependency graph:** SUB_1 → SUB_2 → SUB_3.

**In scope:** zero-dep REST client, 72-preset catalog, edit mode with
multi-image and mask-free region guidance, 2-turn continuation with
thoughtSignature preservation, offline test coverage for every code
path + refusal detection, `.env` walking, magic-byte validation,
retry + timing-override env vars, styles-author forbidden-tokens
policy, install to `.claude/skills/nanogen/`, API-key setup doc,
user-verification checkpoint.

**Out of scope:** `@google/genai` SDK (stay REST), Vertex AI,
bitmap masks, batch API, SynthID detector, >2-turn conversations,
multi-provider abstraction, UI/GUI, auto-install of an API key.

## Sub-Plans
| Plan | Phases | Dependencies | Staleness Note |
|------|--------|--------------|----------------|
| [SUB_1_CLI_CORE.md](SUB_1_CLI_CORE.md) | 5 | None | Foundation |
| [SUB_2_EDIT_FLOW.md](SUB_2_EDIT_FLOW.md) | 3 | SUB_1 | Drafted before SUB_1 implemented — `/run-plan` may auto-refresh before execution |
| [SUB_3_SKILL_INSTALL.md](SUB_3_SKILL_INSTALL.md) | 3 | SUB_1 + SUB_2 | Drafted before SUB_1/2 implemented — `/run-plan` may auto-refresh before execution |

## Progress Tracker
| Phase | Status | Commit | Notes |
|-------|--------|--------|-------|
| 1 — Implement SUB_1_CLI_CORE | ✅ Done | `6902e0d` | All 5 SUB_1 phases landed; `npm test` exit 0, 126 tests |
| 2 — Implement SUB_2_EDIT_FLOW | ✅ Done | `b76a4cd` | All 3 SUB_2 phases landed; 164 tests green |
| 3 — Implement SUB_3_SKILL_INSTALL | ✅ Done | `a69fce6` | User signed off 2026-04-18. Live-verified: 6 real /nanogen invocations across generate, single-image edit, region-based inpainting, object replacement, style transfer, multi-turn continuation. Two critical bugs fixed during verification (NANOGEN_DOTENV_PATH test isolation, thoughtSignature same-part placement). See `reports/nanogen-verification.md`. |

## Phase 1 — Implement: SUB_1 (Foundation CLI + Style Catalog + Tests)

### Goal
Execute the plan at `plans/SUB_1_CLI_CORE.md` to produce the
`build/nanogen/` foundation: CLI, styles.json (72 presets), pure
request builder + response parser, HTTP client with retry + env
resolution, history JSONL, all offline tests.

### Execution: delegate `/run-plan plans/SUB_1_CLI_CORE.md finish auto`

### Acceptance Criteria
- [ ] All 5 phases in `SUB_1_CLI_CORE.md` marked Done.
- [ ] `cd build/nanogen && npm test` → exit 0, ≥ 89 passing tests.
- [ ] `node build/nanogen/generate.cjs --help` prints help.
- [ ] `node build/nanogen/generate.cjs --prompt X --output
      /tmp/x.png --dry-run` with empty `GEMINI_API_KEY` → exit 0.
- [ ] `.claude/skills/nanogen/` does NOT exist yet (install is
      SUB_3 only).
- [ ] Plan report exists (`reports/plan-sub-1-cli-core.md` or
      equivalent).

### Dependencies
None.

## Phase 2 — Implement: SUB_2 (Edit Flow + Multi-Turn)

### Goal
Execute the plan at `plans/SUB_2_EDIT_FLOW.md` to add multi-image
composition, `--region`, and `--history-continue`. Run in the same
`build/nanogen/` tree produced by Phase 1.

### Execution: delegate `/run-plan plans/SUB_2_EDIT_FLOW.md finish auto`

### Acceptance Criteria
- [ ] All 3 phases in `SUB_2_EDIT_FLOW.md` marked Done.
- [ ] `cd build/nanogen && npm test` → exit 0, ≥ 119 passing tests
      (cumulative).
- [ ] `build/nanogen/tests/test_edit_multi_image.cjs` and
      `build/nanogen/tests/test_multi_turn.cjs` exist and pass.
- [ ] `build/nanogen/tests/fixtures/` contains the 6 new request
      goldens and 3 continuable history fixtures.
- [ ] Integration test proves round-trip of `thoughtSignature`
      across a mock 2-turn conversation.
- [ ] Plan report exists.

### Dependencies
Phase 1. Staleness refresh applicable — `/run-plan` auto-refreshes
this sub-plan before execution if any API referenced (history schema,
env var names, readHistory signature) drifted during SUB_1's
implementation.

## Phase 3 — Implement: SUB_3 (SKILL.md + Install + API-Key Doc + USER CHECKPOINT)

### Goal
Execute the plan at `plans/SUB_3_SKILL_INSTALL.md` to author
`SKILL.md` + `reference.md`, install `build/nanogen/` →
`.claude/skills/nanogen/` in ONE operation, write
`reports/nanogen-api-key-setup.md`, and emit the user-checkpoint
banner. This phase DOES NOT auto-complete — it stops in a
"ready for user verification" state.

### Execution: delegate `/run-plan plans/SUB_3_SKILL_INSTALL.md finish auto`

### Acceptance Criteria
- [ ] Phases 1 and 2 of `SUB_3_SKILL_INSTALL.md` marked Done.
- [ ] Phase 3 of `SUB_3_SKILL_INSTALL.md` marked `⊘` (not Done).
- [ ] `.claude/skills/nanogen/` contains `generate.cjs`,
      `styles.json`, `SKILL.md`, `reference.md`, `README.md`,
      `package.json`, `tests/`, `fixtures/`. `tools/` is absent.
- [ ] `.claude/settings.local.json` has the
      `Bash(node ...generate.cjs:*)` permission entry; no other
      entries modified or removed.
- [ ] `.claude/zskills-config.json` `testing.unit_cmd ===
      "cd .claude/skills/nanogen && npm test"`.
- [ ] `cd .claude/skills/nanogen && npm test` → exit 0, ≥ 121
      passing tests (cumulative).
- [ ] `reports/nanogen-api-key-setup.md` exists with all required
      sections (TL;DR, Getting a key, Setting env var, Testing,
      Pricing, Regional, SynthID, Invoking /nanogen, End-to-end
      checklist, Troubleshooting ≥ 12 codes, Uninstall).
- [ ] `.landed` marker (written in the same bash step as the
      commit) reads `status: not-landed`.
- [ ] Final stdout contains the verbatim checkpoint banner.
- [ ] `plans/SUB_3_SKILL_INSTALL.md` frontmatter: `status: active`
      (NOT `complete`).
- [ ] This meta-plan's Phase 3 status updated to `⊘ Awaiting user
      verification` and the meta-plan's frontmatter `status: active`.
- [ ] Plan report exists.

### Dependencies
Phase 2. Staleness refresh applicable.

## Plan Quality
**Drafting process:** `/research-and-plan` invoked via
`/research-and-go`. Each sub-plan drafted via `/draft-plan` with 1-2
rounds of adversarial review (SUB_1: full 2-agent parallel review +
refinement; SUB_2 and SUB_3: review-informed drafts with embedded
disposition tables). A final cross-plan consistency review ran
against all three sub-plans and surfaced 2 CRITICAL + 3 MAJOR
findings; all landed directly as edits in the affected sub-plan
files (see each sub-plan's Plan Quality section for the disposition).

**Cross-plan fixes applied directly in sub-plan files:**
- C1: `E_MISSING_PROMPT` renamed forward-compatibly to
  `E_MISSING_PROMPT_OR_IMAGE` at the SUB_1 Validation Matrix level,
  eliminating a cross-plan rename.
- C2: `NANOGEN_MAX_RETRIES` hoisted into SUB_1 Phase 4 (alongside
  `NANOGEN_RETRY_BASE_MS` and `NANOGEN_FETCH_TIMEOUT_MS`). SUB_2
  references rather than introduces it.
- M1: SUB_3's `nanogen-api-key-setup.md` troubleshooting table
  expanded from 9 to 13 rows (adds `E_REGION_WITHOUT_IMAGE`,
  `E_EDIT_NEEDS_INSTRUCTION`, `E_CONTINUE_UNKNOWN_ID`,
  `E_CONTINUE_MISSING_OUTPUT`, `E_CONTINUE_NO_SIGNATURE`).
- M2: SUB_3's `reference.md` gains new section 7b enumerating all 5
  pinned stderr-warning strings verbatim.
- M3: SUB_1's `withCleanEnv` now explicitly deletes known env keys;
  SUB_3's verification checklist uses `env -u ...` to protect
  against user-exported keys.
- m6: SUB_3's commit + `.landed` marker now occur in a single
  `&&`-chained bash step, eliminating the TOCTOU race that could
  let auto-land fire before the `not-landed` marker exists.

**User-checkpoint guardrails:**
- SUB_3 Phase 3 marked `⊘` in every Progress Tracker that touches it
  (this meta-plan + SUB_3 itself).
- SUB_3 plan frontmatter stays `status: active` (NOT `complete`).
- `.landed` marker with `status: not-landed` is written atomically
  with the installation commit.
- This meta-plan's Phase 3 row shows `⊘`.
- The `/research-and-go` pipeline's final `/verify-changes branch`
  gate will run before the user signs off; that gate is written as
  a separate cron-fired turn by `/run-plan` Phase 5c.

**Remaining concerns:** None blocking. The `⊘` convention is
non-standard; if `/run-plan`'s auto-land logic ignores it, the
guardrails above (frontmatter `active` + `.landed`
`status: not-landed`) ensure the pipeline cannot silently mark the
meta-plan complete.
