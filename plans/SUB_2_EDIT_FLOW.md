---
title: /nanogen — Sub-Plan 2: Edit Flow, Multi-Image, Multi-Turn, thoughtSignature
created: 2026-04-17
status: complete
---

# Plan: /nanogen — Sub-Plan 2: Edit Flow, Multi-Image, Multi-Turn, thoughtSignature

## Overview
Builds on sub-plan 1's CLI scaffold (`build/nanogen/generate.cjs`) to add
first-class image-modification support: multi-image composition (up to
14 refs), natural-language region guidance (`--region`), and multi-turn
edit via `--history-continue` which round-trips Gemini 3's
`thoughtSignature` to avoid HTTP 400 on continuation. This sub-plan
lives in the same `build/nanogen/` working directory (NOT inside
`.claude/`) and ships 3 phases + ≥ 26 new tests.

**Staleness note:** Drafted before sub-plan 1 is implemented. Specific
function signatures (`readHistory()`, `buildGenerateRequestFromMaterials()`,
`parseResponse()`) and the exact shape of history-entry fields
(`thoughtSignature`, `output`, `outputFormat`) are inherited from
sub-plan 1's Design & Constraints. If sub-plan 1's implementation
deviates, `/run-plan`'s staleness refresh should rerun `/draft-plan` on
this file before execution.

**Non-goals:**
- Batch API, SynthID detector, `@google/genai` SDK, Vertex AI.
- Conversations of length N > 2 turns in a single invocation. We support
  exactly "continue one prior single-turn exchange" — longer chains
  happen by running `/nanogen` repeatedly, each invocation
  `--history-continue`ing the prior output. Extending to on-line N-turn
  chats is future work.
- Pixel-level or bitmap masks. Gemini has no mask parameter. `--region`
  is natural-language only.
- Auto-parse of free-text `--history-parent` forms we don't own
  (sub-plan 1 already emits a stderr warning on unknown parent; we
  inherit that without changes).

## Progress Tracker
| Phase | Status | Commit | Notes |
|-------|--------|--------|-------|
| 1 — Multi-image assembly + `--region` flag | ✅ Done | `054ccab` | 18 new tests; 6 goldens (1/2/5/14 images + region-only + full-featured); aggregate 144 tests |
| 2 — `--history-continue` + multi-turn + thoughtSignature | ✅ Done | `2f8dca7` | 16 new tests; 3 req goldens + 3 history JSONL fixtures; 6 E_CONTINUE_* codes; aggregate 160 |
| 3 — Integration via mock server + README update | ✅ Done | `b76a4cd` | 4 new integration tests incl. thoughtSignature round-trip proof; aggregate 164 |

## Phase 1 — Multi-Image Assembly + `--region` Flag

### Goal
Extend sub-plan 1's single-image passthrough to multi-image (1..14) and
add `--region <description>` for natural-language inpainting guidance.
Wire validation and body assembly; write golden-tested request bodies.

### Work Items
- [ ] In `generate.cjs`, update `buildGenerateRequestFromMaterials(args,
      imageMaterials, stylesIndex)` to append ONE `inlineData` part per
      entry in `imageMaterials`, in the SAME ORDER they appeared on
      the command line (order matters: first `--image` is treated by
      Gemini as the primary reference). The `parts` array starts with
      the `text` part, then the `inlineData` parts in order. No role
      annotation in this phase — role tagging arrives in Phase 2.
- [ ] Add `--region <description>` flag (repeatable, arrays accumulate):
      parsed into `args.region` (array of strings). When non-empty, the
      composed prompt is extended with ` Region: <joined with "; ">.`
      — placed AFTER the `Style:` fragment (from sub-plan 1's Phase 2)
      but BEFORE the `Avoid:` fragment (from sub-plan 1's Phase 3
      prompt composition). Prompt composition order becomes:
      1. `args.prompt` (base text; may be empty in edit mode — see item 4)
      2. `" Style: " + joined.promptFragments + "."` if `args.styles.length > 0`
      3. `" Region: " + args.region.join("; ") + "."` if
         `args.region.length > 0`
      4. `" Avoid: " + args.negative.join("; ") + "."` if
         `args.negative.length > 0`
- [ ] Add validation codes (extending sub-plan 1's Validation Matrix;
      insert AFTER existing codes, do NOT renumber existing):
      - **22** `--region` set but `--image` NOT set → `E_REGION_WITHOUT_IMAGE`
      - **23** `args.image.length > 0` AND `args.prompt ===
        undefined/""` AND `args.region.length === 0` →
        `E_EDIT_NEEDS_INSTRUCTION` (the model has nothing to do:
        images but no instruction).
- [ ] **Relax sub-plan 1's code 2 (`E_MISSING_PROMPT_OR_IMAGE`) —
      no rename required.** Sub-plan 1 already named the code
      `E_MISSING_PROMPT_OR_IMAGE` and defined its semantics to match
      sub-plan 2's relaxation. In sub-plan 1 the check fires when
      `--prompt` is missing (no `--image`/`--region` paths exist
      yet); in sub-plan 2 the check fires when BOTH `--prompt` is
      missing AND `--image` is absent. No test rename needed — the
      code name was chosen forward-compatibly. Sub-plan 2 only
      TIGHTENS the predicate from "prompt missing" to "prompt
      missing AND image absent". Add one new test for
      `E_EDIT_NEEDS_INSTRUCTION` (`--image x.png` alone with no
      prompt and no region).
- [ ] When `args.image.length > 0` AND `args.prompt` is empty/undefined
      AND `args.region.length > 0`: compose prompt as
      `"Edit the provided image(s)." + " Region: ..." + " Avoid: ..."`.
      The "Edit the provided image(s)." boilerplate is deterministic
      (golden tests pin this). Documented in-code with a comment.
- [ ] Update `--help`:
      - Add `--region <description>` row (repeatable).
      - Change `--prompt` row to "Required unless `--image` + (`--region`
        or explicit edit instruction) provided".
      - Add an "EDIT MODE" example section:
        `nanogen --image cat.png --region "replace the background with
        a beach" --output cat-beach.png`
        and
        `nanogen --image orig.png --image ref.png --prompt
        "apply the lighting from the second image to the first"
        --output lit.png`.
- [ ] Create golden fixtures in `tests/fixtures/`:
      - `request-edit-one-image.json` — 1 image, no region,
        non-empty prompt.
      - `request-edit-two-images-ordered.json` — 2 images, explicit
        prompt about "use the second image's style". Inlinedata parts
        in order.
      - `request-edit-five-images.json` — 5 images. Verifies we do
        NOT cap at 1 and do NOT truncate.
      - `request-edit-fourteen-images.json` — 14 images. Upper
        bound.
      - `request-edit-region-only.json` — 1 image, `--region
        "remove the cat"`, no `--prompt` → prompt composes to the
        boilerplate + Region suffix.
      - `request-edit-full-featured.json` — 2 images, `--region`,
        `--style`, `--negative`, `--prompt` — proves prompt
        composition order is deterministic.
- [ ] For large-image goldens (5-image, 14-image): goldens reference
      the SAME checked-in `tiny-1x1.png` (67 bytes) N times. This keeps
      the golden files small and deterministic; no need for many
      distinct image fixtures. Validation codes (zero-byte, magic
      bytes) are already tested in sub-plan 1 — this phase tests ONLY
      assembly ordering.
- [ ] Write `tests/test_edit_multi_image.cjs` — ≥ 12 tests:
      - Each of the 6 goldens above: structural equality match.
      - `--image a.png --image b.png --image c.png` preserves order in
        `parts[1..3]` of body.
      - `--image` 15 times → `E_TOO_MANY_IMAGES` (inherited from
        sub-plan 1; smoke test).
      - `--region "x"` without `--image` → `E_REGION_WITHOUT_IMAGE`,
        exit 1.
      - `--image x.png` with no `--prompt` and no `--region` →
        `E_EDIT_NEEDS_INSTRUCTION`.
      - `--image x.png --region "y"` with no `--prompt` → success;
        body text === `"Edit the provided image(s). Region: y."`.
      - `--image x.png --prompt "P"` with no `--region` → success;
        body text === `"P"` (no Region suffix, no boilerplate).
      - Prompt composition order: `--prompt "P" --style pixel-16bit
        --region "R" --negative "N"` → text ===
        `"P Style: <pixel-16bit fragment> Region: R. Avoid: N."`
        (verify via golden `request-edit-full-featured.json`).
- [ ] Update `package.json` `test` script to include
      `node tests/test_edit_multi_image.cjs` between sub-plan 1's
      Phase 3 and Phase 4 tests (alphabetical order works:
      `...test_edit_multi_image.cjs && test_env.cjs && ...`).
- [ ] Append a "## Edit mode" section to `build/nanogen/README.md`
      documenting multi-image assembly + `--region`. Do NOT describe
      `--history-continue` yet (Phase 2 owns that).

### Design & Constraints

**Image ordering rule:** Gemini's image edit semantics treat the FIRST
`inlineData` part as the primary subject; subsequent images are style
references or ancillary. Our CLI preserves command-line order: first
`--image` → first `inlineData`. We do NOT sort or re-rank. Tests pin
this.

**Prompt-composition determinism:** Goldens pin the EXACT string, so
any future refactor that reorders the suffix composition breaks tests
loudly. The composition order is documented in a source comment above
the composer.

**Region semantics:** Gemini does not have a bitmap mask. `--region`
is prose and depends entirely on the model's ability to resolve the
described region. A user saying `--region "the upper-left quadrant"`
will usually work; `--region "pixels 400-600 on X axis"` will not.
Sub-plan 3's SKILL.md documents this for agents.

**Backward-compatibility note:** Sub-plan 1 named the code
`E_MISSING_PROMPT_OR_IMAGE` forward-compatibly to avoid a cross-plan
rename. Sub-plan 2 only adds a new test
(`E_EDIT_NEEDS_INSTRUCTION`) and tightens the predicate for the
existing code; no sub-plan-1 test changes.

### Acceptance Criteria
- [ ] Six new request goldens present in `tests/fixtures/`; all valid JSON.
- [ ] `test_edit_multi_image.cjs` has ≥ 12 passing tests.
- [ ] `--region` without `--image` → exit 1, `E_REGION_WITHOUT_IMAGE`.
- [ ] `--image` without prompt/region → exit 1, `E_EDIT_NEEDS_INSTRUCTION`.
- [ ] `--image --region "x"` with no `--prompt` → success, body text
      matches `"Edit the provided image(s). Region: x."`.
- [ ] Golden structural-equality tests pass under `withCleanEnv` with
      `NANOGEN_API_BASE` UNSET.
- [ ] README "Edit mode" section exists and references each new flag.
- [ ] No sub-plan-1 test rename needed (code was named
      `E_MISSING_PROMPT_OR_IMAGE` forward-compatibly in sub-plan 1).
      New test added for `E_EDIT_NEEDS_INSTRUCTION`.

### Dependencies
Sub-plan 1 complete (all 5 phases).

## Phase 2 — `--history-continue` + Multi-Turn Request + thoughtSignature

### Goal
Add `--history-continue <id>` flag that lets users continue an earlier
generation as a multi-turn edit. Construct the request with role-
annotated `contents` that preserve the prior model turn's
`thoughtSignature` verbatim. Handle the four error cases explicitly.

### Work Items

- [ ] Add `--history-continue <id>` flag. Parsed into
      `args.historyContinue` (string or undefined). Mutually exclusive
      with `--history-parent` (which is just a metadata tag — NOT a
      multi-turn trigger). If BOTH provided → `E_CONTINUE_WITH_PARENT`:
      "--history-continue implies a parent relationship; do not also
      specify --history-parent."

- [ ] At arg-parse time (not validate time), if
      `args.historyContinue !== undefined`:
      1. Call `readHistory()` (sub-plan 1 Phase 5 tolerant reader) to
         load all entries.
      2. Find entry where `entry.id === args.historyContinue`. (We
         accept exact match only for clarity — the `--history-parent`
         prefix-match behavior does NOT apply here because a continue
         with ambiguity is a footgun.)
      3. If not found → `E_CONTINUE_UNKNOWN_ID`. Exit 1.
      4. If `entry.refusalReason !== null` →
         `E_CONTINUE_REFUSED_ENTRY`. Exit 1. (Continuing a refused
         turn would send an empty-image model turn with no
         thoughtSignature — the model will 400.)
      5. If `entry.thoughtSignature === null` →
         `E_CONTINUE_NO_SIGNATURE`. Exit 1. (The prior turn did not
         produce a continue-able signature — pre-Gemini-3 models,
         or a response that happened to lack it.)
      6. If `entry.output` path does NOT exist or is NOT readable →
         `E_CONTINUE_MISSING_OUTPUT`. Exit 1. (User deleted the prior
         image; cannot base64 it back.)
      7. If `entry.params.model` differs from `args.model` → emit a
         stderr warning (pinned text below) but continue. Model
         switches mid-conversation are technically allowed but almost
         always produce 400 on thoughtSignature format mismatch.

- [ ] Pinned stderr warning (add to the sub-plan 1 "pinned strings"
      set):
      `nanogen: --history-continue source used model "<A>"; continuing
      with model "<B>". Gemini may 400 on thoughtSignature format
      mismatch.`

- [ ] Continuation assembly — implement
      `buildContinuationRequestFromMaterials(args, imageMaterials,
      stylesIndex, priorEntry, priorBytes)` returning
      `{url, headers, body}`. **New pure function** living alongside
      the single-turn builder. The single-turn builder remains
      unchanged — continuation has its own code path to keep the
      complexity local.

      `body.contents` shape:
      ```jsonc
      [
        { "role": "user",
          "parts": [
            { "text": "<priorEntry.prompt>" }
            // NOTE: we reconstruct the user turn with the prompt
            // ONLY, no prior user images. If the prior turn had
            // user-supplied --image, they are NOT replayed — the
            // model's output is assumed to already reflect them.
          ]
        },
        { "role": "model",
          "parts": [
            { "inlineData": {
                "mimeType": "<from priorEntry.outputFormat>",
                "data": "<base64 of priorBytes>"
              }
            },
            { "thoughtSignature": "<priorEntry.thoughtSignature>" }
          ]
        },
        { "role": "user",
          "parts": [
            { "text": "<composed prompt using current --prompt/--style/--region/--negative>" },
            // current-turn inlineData parts appended in order from
            // imageMaterials, same rules as Phase 1
            ...
          ]
        }
      ]
      ```

      Same `generationConfig`, `safetySettings` as single-turn
      (Phase 3 of sub-plan 1). Same `NANOGEN_API_BASE` handling.

- [ ] MIME map from `outputFormat` history field:
      `png → image/png`, `jpeg → image/jpeg`, `webp → image/webp`.
      History uses `outputFormat` derived from actual response MIME
      (sub-plan 1 Phase 5), NOT from file extension, so
      `priorEntry.outputFormat` is the authoritative source.

- [ ] MIME mismatch safeguard: if `priorEntry.outputFormat` is missing
      or not in the map (e.g. pre-sub-plan-1 history format) → fall
      back to a magic-byte probe on `priorBytes` (using the shared
      `magicBytes.cjs` from sub-plan 1 Phase 3). If still unknown →
      `E_CONTINUE_UNKNOWN_MIME`.

- [ ] `buildContinuationRequestFromMaterials` is dispatched from
      `main()` when `args.historyContinue` is set; otherwise
      `buildGenerateRequestFromMaterials` is used. ONE decision point,
      documented with a comment.

- [ ] Create golden fixtures:
      - `request-continue-basic.json` — prior entry with prompt "cat"
        and image `tiny-1x1.png`, thoughtSignature "sig-abc",
        outputFormat "png". Current turn: `--prompt "add a hat"`. No
        current images. Expected body matches the role-annotated
        shape above.
      - `request-continue-with-current-image.json` — same as above
        but current turn adds a second reference image.
      - `request-continue-with-region.json` — current turn uses
        `--region "the cat's head"`.
      - `fixture-history-continuable.jsonl` — sample history with ONE
        entry that has a valid thoughtSignature + references
        `tiny-1x1.png` as output. Used by tests that need a realistic
        history file.
      - `fixture-history-no-sig.jsonl` — sample with one entry missing
        thoughtSignature (legacy row).
      - `fixture-history-refused.jsonl` — sample with one entry whose
        refusalReason is "finish:SAFETY".

- [ ] Write `tests/test_multi_turn.cjs` — ≥ 14 tests:
      - `--history-continue <id>` with a valid history entry →
        success; body shape matches `request-continue-basic.json`.
      - Continuation preserves the EXACT `thoughtSignature` string,
        character for character (assertion on
        `body.contents[1].parts[1].thoughtSignature`).
      - Continuation preserves role annotations `user`, `model`,
        `user`.
      - Current-turn images append after the new user `text` part.
      - `--region` appends to the current turn's prompt text, not
        the historical turn's.
      - Unknown id → `E_CONTINUE_UNKNOWN_ID`.
      - Refused entry → `E_CONTINUE_REFUSED_ENTRY`.
      - No-signature entry → `E_CONTINUE_NO_SIGNATURE`.
      - Missing output file (history references file that no longer
        exists) → `E_CONTINUE_MISSING_OUTPUT`.
      - Mismatched model → success + stderr warning matching pinned
        string.
      - Unknown MIME (outputFormat missing, magic bytes unknown) →
        `E_CONTINUE_UNKNOWN_MIME`.
      - `--history-continue` + `--history-parent` both set →
        `E_CONTINUE_WITH_PARENT`.
      - Tolerant reader: history file with a malformed line mixed in
        → still finds the valid entry.
      - Dry-run: `--history-continue X --prompt Y --output Z.png
        --dry-run` emits the continuation body, exits 0, no real HTTP.

- [ ] Update `package.json` `test` script to include
      `tests/test_multi_turn.cjs`.

- [ ] Append "### Multi-turn continuation" section to
      `build/nanogen/README.md` describing `--history-continue` and
      its error codes.

### Design & Constraints

**Why we don't replay prior user images.** The first-turn user images
are already reflected in the model's output. Sending them again could
confuse the model (it may treat them as NEW references on top of the
already-rendered image). Gemini's chat examples show this pattern:
the `model` turn stands in for the prior output; the user's first
images are not replayed.

**Why we don't support N > 2 turns.** Each additional turn would
require storing an ordered list of (text, image, sig) triples. Our
history format stores ONE row per invocation. To build a 3-turn chain
we would need to walk the `parentId` links backward — doable, but it
adds a layer of complexity (and a walk-loop failure mode) that we
defer. Users chain by running `/nanogen` repeatedly, each time
`--history-continue`-ing the prior invocation's ID. The model sees
two turns per invocation, which handles the 90% case of "generate
then refine".

**Read-during-append safety.** The history file is append-only; our
tolerant `readHistory()` skips malformed lines. A concurrent write
racing with a read at worst yields a half-line that the tolerant
reader skips. Worst-case outcome: we miss ONE entry that's being
written right now; the user can rerun. Not a blocker.

**Race with sub-plan 1's own append.** `--history-continue`
potentially reads `.nanogen-history.jsonl` at the start of
invocation, THEN appends a new entry at the end. If two
`/nanogen` invocations race on the SAME working dir with
`--history-continue`, they both read the same snapshot — fine. They
both append at the end — as discussed in sub-plan 1, this is
best-effort; we don't lock. The tolerant reader handles the rare
interleave.

**Error code stability:** The new codes
(`E_REGION_WITHOUT_IMAGE`, `E_EDIT_NEEDS_INSTRUCTION`,
`E_CONTINUE_UNKNOWN_ID`, `E_CONTINUE_REFUSED_ENTRY`,
`E_CONTINUE_NO_SIGNATURE`, `E_CONTINUE_MISSING_OUTPUT`,
`E_CONTINUE_UNKNOWN_MIME`, `E_CONTINUE_WITH_PARENT`) are locked by
this plan; no renames in sub-plan 3 or beyond.

### Acceptance Criteria
- [ ] `test_multi_turn.cjs` has ≥ 14 passing tests.
- [ ] Role annotations `user`, `model`, `user` present in
      continuation body.
- [ ] `thoughtSignature` preserved verbatim in
      `body.contents[1].parts[1].thoughtSignature`.
- [ ] All 8 new error codes exercised by at least one test.
- [ ] Dry-run works for continuation (no API key required).
- [ ] README has multi-turn section.
- [ ] `npm test` green across sub-plan 1 + sub-plan 2 test files.

### Dependencies
Phase 1 of sub-plan 2. Sub-plan 1 complete.

## Phase 3 — Integration Test via Mock Server + README Polish

### Goal
End-to-end integration: a mock server round-trips a two-turn
conversation. First call returns an image + `thoughtSignature`;
second call, triggered by `--history-continue`, includes that
signature in the request body and the mock server asserts it.
Update README to a sub-plan-2-complete form.

### Work Items

- [ ] Extend `tests/test_integration.cjs` (or create
      `tests/test_multi_turn_integration.cjs` if the file grows
      awkward) with ≥ 4 tests:
      - Two-call round trip: invocation 1 with `--prompt "cat"
        --output t1.png`; mock server returns image + sig
        `"sig-xyz"`. Assert history has entry with
        `thoughtSignature === "sig-xyz"`. Invocation 2 with
        `--history-continue <id-from-invocation-1> --prompt "add
        hat" --output t2.png`; mock server VERIFIES that
        `request.body.contents[1].parts[1].thoughtSignature ===
        "sig-xyz"` before responding with a new image + sig
        `"sig-def"`. Assert t2.png exists; assert a new history
        entry with `thoughtSignature === "sig-def"` and
        `parentId === <id-from-invocation-1>`.
      - Multi-image edit: invocation with `--image t1.png --image
        ref.png --region "apply ref's palette"
        --output edited.png`. Mock server asserts `body.contents[0]
        .parts` contains `[text, inlineData(t1), inlineData(ref)]`
        in that order.
      - Continuation refused by model (returns finishReason SAFETY
        on the second turn): assert invocation 2 exits 1 with
        `E_REFUSED`; history row for invocation 2 exists with
        `refusalReason = "finish:SAFETY"`; t1.png still intact.
      - `--history-continue` with `--dry-run`: end-to-end no-HTTP
        verification that the body looks right and no network
        traffic occurs (mock server should see ZERO requests).

- [ ] Mock server enhancements needed (extending sub-plan 1 Phase
      4's mock):
      - Support returning a response with `thoughtSignature` in the
        model part.
      - Support per-request assertion callbacks — the test injects a
        `function(req){...}` that runs against each incoming
        request; failures surface as a 500 with the assertion
        message, which the test detects.
      - Seeded queue: test supplies an array of [status, body]
        responses; server returns them in order.

- [ ] Finalize README:
      - Replace "under construction" with a full CLI reference
        (all flags from sub-plan 1 + sub-plan 2).
      - Examples section: single-turn generate, multi-image edit,
        region-only edit, multi-turn continuation.
      - Limitations section: no bitmap masks, no N>2 turn chains,
        SynthID watermarking is implicit, Workspace-admin lock-out
        possible.
      - Testing section: `NANOGEN_API_BASE`, `NANOGEN_RETRY_BASE_MS`,
        `NANOGEN_FETCH_TIMEOUT_MS`, `NANOGEN_MAX_RETRIES`, pointer to
        `tests/fixtures/tiny-1x1.png`.
      - Reminder that sub-plan 3 owns `/nanogen` skill plumbing;
        this README is for direct CLI users.

- [ ] Verify final aggregate test count: sub-plan 1 minimum = 89;
      sub-plan 2 minimums: 12 (Phase 1) + 14 (Phase 2) + 4 (Phase 3)
      = 30. Total ≥ 119. Sub-plan 3 may add a few SKILL-level tests
      on top; we are NOT retro-changing sub-plan 1's AC floor. AC
      for this phase: `cd build/nanogen && npm test` returns exit
      0 with ≥ 119 passing tests.

### Design & Constraints

**Mock server reuse:** the harness from sub-plan 1 Phase 4 already
supports per-path response queues. This phase adds assertion
callbacks as a thin wrapper. Do NOT rewrite the harness.

**Test isolation:** Every integration test uses
`mkdtempSync('nanogen-integ-')`, runs the CLI with `cwd` set to
that dir, cleans up in try/finally. The history file lives in the
temp dir — no test leakage to repo root.

**Assertion failures from mock server:** when the mock server
detects a bad request (e.g. missing `thoughtSignature`), it
responds with HTTP 500 + body `{"error":{"message":"MOCK
ASSERT: <msg>"}}`. The CLI's retry logic catches 500 and retries;
tests set `NANOGEN_RETRY_BASE_MS=5` and `NANOGEN_MAX_RETRIES=0`
(env override declared by sub-plan 1 Phase 4) so the failure
surfaces immediately as `E_UPSTREAM_5XX`. Tests then inspect
`result.stderr` for the MOCK ASSERT marker and fail with a useful
message.

**`NANOGEN_MAX_RETRIES` env:** declared by sub-plan 1 Phase 4 as
`MAX_RETRIES = Number(process.env.NANOGEN_MAX_RETRIES) || 3`.
Integration tests that need "fail fast" set it to `0`.

### Acceptance Criteria
- [ ] Integration tests (≥ 4) pass.
- [ ] Mock server captures and echoes `thoughtSignature`
      successfully.
- [ ] Two-turn round-trip completes: first turn generates, second
      turn continuation includes the sig, both responses parse,
      both history rows written.
- [ ] `cd build/nanogen && npm test` returns exit 0 with ≥ 119
      passing tests.
- [ ] README has complete CLI reference, examples (including
      multi-turn), limitations, testing env vars, and sub-plan-3
      pointer.

### Dependencies
Phase 2 of sub-plan 2. Sub-plan 1 complete.

## Plan Quality
**Drafting process:** `/draft-plan` (via `/research-and-plan` via
`/research-and-go`) with 1 round of adversarial review.
**Convergence:** Converged at round 1 after 1 round of review. 8
findings accepted; 2 justified.

### Round History
| Round | Reviewer | Devil's Advocate | Resolved |
|-------|----------|------------------|----------|
| 1     | 4        | 6                | 8 Fixed, 2 Justified |

### Round 1 Disposition

| # | Finding | Disposition |
|---|---------|-------------|
| R1 | `E_MISSING_PROMPT` rename breaks sub-plan 1's stable-code contract. | **Fixed** — document the rename in-plan and explicitly require updating the lone sub-plan 1 test. Keep an alias comment. |
| R2 | Multi-turn replay of prior user images is ambiguous — do we replay? | **Fixed** — Design & Constraints state: we do NOT replay. |
| R3 | No handling for a continuation where prior entry's outputFormat is missing (legacy row). | **Fixed** — magic-byte probe fallback via `magicBytes.cjs`; else `E_CONTINUE_UNKNOWN_MIME`. |
| R4 | MIME-format string for `inlineData` must be exactly `image/png` etc. — history stores `"png"`, not `"image/png"`. Mapping needed. | **Fixed** — explicit map in work items. |
| DA1 | What if `--history-continue` id is a prefix that matches multiple entries? Prefix search is a footgun. | **Fixed** — exact match only; document why. |
| DA2 | Concurrent reads during an in-flight append on `.nanogen-history.jsonl` could see a half-line. | **Justified** — tolerant reader skips malformed lines (sub-plan 1 Phase 5); acceptable miss of one in-flight entry. Documented. |
| DA3 | Model switch mid-conversation silently breaks thoughtSignature format. | **Fixed** — pinned stderr warning on mismatch. |
| DA4 | Infinite chain of `--history-continue` through `parentId` → ambiguous semantics. | **Justified** — we explicitly non-goal N>2 turns; chains happen via repeat invocations. Documented. |
| DA5 | Mock server handling of MOCK ASSERT failures must not be swallowed by the retry loop. | **Fixed** — added `NANOGEN_MAX_RETRIES` env override; integration tests set `=0`. |
| DA6 | `--history-continue` + `--history-parent` could both be set. | **Fixed** — `E_CONTINUE_WITH_PARENT` added. |

**Remaining concerns:** None.
