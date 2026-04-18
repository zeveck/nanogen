---
title: /nanogen — Sub-Plan 3: SKILL.md Authoring, Install, API-Key Doc, User Checkpoint
created: 2026-04-17
status: complete
completed: 2026-04-18
---

# Plan: /nanogen — Sub-Plan 3: SKILL.md Authoring, Install, API-Key Doc, User Checkpoint

## Overview
The FINAL sub-plan. Author `SKILL.md` and `reference.md` in
`build/nanogen/`, install the entire `build/nanogen/` tree to
`.claude/skills/nanogen/` in ONE operation (no incremental edits
inside `.claude/`), write a comprehensive API-key setup doc, then
STOP at a user checkpoint for hands-on verification. This phase
expressly does NOT auto-land-to-main on completion — the final
phase is marked `⊘` (awaiting user) and `/run-plan`'s auto-land
is short-circuited.

**Staleness note:** Drafted before sub-plans 1 and 2 are implemented.
Exact CLI flag names, error codes, and history fields are inherited
from those sub-plans. If they shift during implementation,
`/run-plan`'s staleness refresh should re-draft this file before
execution so SKILL.md and reference.md reflect the actual CLI.

**Non-goals:**
- No changes to sub-plan 1/2 CLI behavior.
- No shipping a separate npm package. The skill lives in
  `.claude/skills/nanogen/` only.
- No Vertex AI setup guide; Gemini API key only (Vertex can be
  added later as an opt-in doc).
- No auto-install of a `GEMINI_API_KEY` into the user's environment.
  This is a security-sensitive operation — user must do it by hand.
- No in-CLI prompt for a missing key (CLI fails with
  `E_MISSING_API_KEY` per sub-plan 1 — no interactive stdin).

## Progress Tracker
| Phase | Status | Commit | Notes |
|-------|--------|--------|-------|
| 1 — Author SKILL.md + reference.md in `build/nanogen/` | ✅ Done | `716e0b4` | 4 doc-lint tests; 72 slugs in catalog; forbidden-tokens clean; aggregate 168 |
| 2 — Install `build/nanogen/` → `.claude/skills/nanogen/` | ✅ Done | `542b24f` | Installed via `cp -r`; `tools/` excluded; npm test from installed location: 168/168; /nanogen appears in skill list |
| 3 — API-key setup doc + USER CHECKPOINT (plan stops here) | ✅ Done | `a69fce6` | User signed off 2026-04-18 after live /nanogen verification (spider, warrior, frog-meaner generations all looked right). |

## Phase 1 — Author SKILL.md + reference.md (under `build/nanogen/`)

### Goal
Produce two markdown files inside `build/nanogen/` (still the working
folder — not `.claude/`): `SKILL.md` (concise playbook for the agent)
and `reference.md` (detailed reference material the agent consults on
demand). Both follow repo conventions already observed at
`.claude/skills/commit/SKILL.md`, `.claude/skills/do/SKILL.md`, etc.

### Work Items

- [ ] Create `build/nanogen/SKILL.md` with YAML frontmatter:
      ```yaml
      ---
      name: nanogen
      description: >-
        Generate or edit images via Google's Nano Banana (Gemini image
        models). Text-to-image, multi-image edit with natural-language
        region guidance, multi-turn iterative editing via
        thoughtSignature continuation. 72 built-in style presets across
        10 categories. Requires GEMINI_API_KEY.
      argument-hint: "<prompt> [--style <slug>] [--image <path>] [--region <desc>] [--output <path>] [flags]"
      disable-model-invocation: false
      ---
      ```

- [ ] SKILL.md body (sections, in order):
      1. **Quick rule at top (BOLD)**: *Do NOT invoke the CLI unless
         `GEMINI_API_KEY` (or `GOOGLE_API_KEY` as fallback) is set in
         the environment. A dry-run (`--dry-run`) is always safe and
         requires no API key.* Agent checks `printenv GEMINI_API_KEY`
         (or `printenv GOOGLE_API_KEY`) BEFORE any real invocation. If
         neither is set, STOP and point the user to
         `reports/nanogen-api-key-setup.md`.
      2. **Two-mode overview**: Generate mode (no `--image`) vs Edit
         mode (one or more `--image`). Decision tree: does the user
         have an existing image they want modified? → edit mode.
      3. **Style selection rules**:
         - Skim the 10-category summary in reference.md.
         - Match user intent to 1-3 relevant categories.
         - Pick 1-2 style slugs (rarely more — excessive style
           stacking produces muddy output).
         - Default to no style if request is already highly specified.
      4. **Asset-type defaults** (copied from imagegen's table but
         Nano-Banana-appropriate — no `--background transparent`
         references):
         | Asset type | Default model | Default aspect | Default size | Style category hints |
         |---|---|---|---|---|
         | Characters / sprites | flash-preview | 2:3 or 3:4 | 1K | pixel-art, animation-cartoon, fine-art |
         | Tilesets / terrain | flash-preview | 1:1 | 1K | pixel-art, painterly |
         | Items / icons | flash-preview | 1:1 | 1K | flat-vector, pixel-art |
         | UI elements | flash-preview | varies | 1K | flat-vector |
         | Backgrounds / scenes | pro-preview | 16:9 or 21:9 | 2K | painterly, photographic |
         | Portraits | pro-preview | 2:3 or 3:4 | 2K | painterly, photographic |
         | Concept art | pro-preview | 16:9 | 2K | painterly, drawing-ink |
         | Diagrams / schematics | flash-preview | 16:9 | 1K | design-technical |
         | Text-heavy images (logos, posters) | pro-preview | varies | **2K minimum** | design-technical |
      5. **Iteration verbs** (mapping table — short):
         | User says | CLI action |
         |---|---|
         | "try again" / "one more try" | Rerun same command (new seed or unset) |
         | "go back to v1" / "use the first one" | `--history-parent <id-of-v1>` and same prompt |
         | "make it bluer" / "adjust X" | `--history-continue <id>` + short delta prompt |
         | "apply this style to my photo" | Edit mode: `--image <photo> --style <slug>` |
         | "remove the background" / "change the sky" | Edit mode: `--image <src> --region "<description>"` |
         | "show me 3 variants" | Run the CLI 3× with different `--seed` |
      6. **Refusal recovery**: if exit code is 1 with
         `code=E_REFUSED` or `code=E_CONTENT_POLICY`, DO NOT retry the
         same prompt. Rephrase away from the flagged concept (named
         person, violent subject, copyrighted character, real public
         figure). Tell the user what changed and why.
      7. **Full E_* error-code table**: every code from sub-plans 1
         and 2 with a user-visible recovery hint. Organized by
         category:
         - Arg validation: `E_MISSING_OUTPUT`, `E_MISSING_PROMPT_OR_IMAGE`,
           `E_EDIT_NEEDS_INSTRUCTION`, `E_BAD_OUTPUT_EXT`,
           `E_UNKNOWN_MODEL`, `E_BAD_ASPECT`, `E_BAD_SIZE`,
           `E_SIZE_MODEL_MISMATCH`, `E_BAD_THINKING`,
           `E_THINKING_MODEL_MISMATCH`, `E_BAD_SEED`, `E_BAD_TEMP`,
           `E_BAD_SAFETY_CAT`, `E_BAD_SAFETY_THRESHOLD`,
           `E_IMAGE_NOT_FOUND`, `E_BAD_IMAGE_EXT`, `E_IMAGE_EMPTY`,
           `E_IMAGE_TOO_LARGE`, `E_IMAGE_MIME_MISMATCH`,
           `E_TOO_MANY_IMAGES`, `E_UNKNOWN_FLAG`, `E_UNKNOWN_STYLE`,
           `E_REGION_WITHOUT_IMAGE`
         - Env: `E_NODE_TOO_OLD`, `E_MISSING_API_KEY`,
           `E_BAD_STYLES_CATALOG`, `E_STYLE_AUTHOR_POLICY`
         - Continuation: `E_CONTINUE_UNKNOWN_ID`,
           `E_CONTINUE_NO_SIGNATURE`, `E_CONTINUE_REFUSED_ENTRY`,
           `E_CONTINUE_MISSING_OUTPUT`, `E_CONTINUE_UNKNOWN_MIME`,
           `E_CONTINUE_WITH_PARENT`
         - HTTP: `E_CONTENT_POLICY`, `E_BAD_REQUEST`,
           `E_BAD_REQUEST_IMAGE`, `E_AUTH`, `E_ADMIN_DISABLED`,
           `E_REGION`, `E_FORBIDDEN`, `E_MODEL_NOT_FOUND`,
           `E_RATE_LIMIT`, `E_UPSTREAM_5XX`, `E_UNEXPECTED_HTTP`,
           `E_REFUSED`
      8. **Multi-turn editing** ("Continuing a prior generation"):
         Explains `--history-continue`, the thoughtSignature
         requirement (critical Gemini 3 gotcha), and the
         `--history-continue` vs `--history-parent` distinction.
      9. **Cost awareness** (one table, copied from reference.md):
         Pro 1-2K $0.134; Pro 4K $0.24; Flash 1K $0.034; Flash 2K
         $0.050; Flash 4K $0.076; Flash 512 $0.022. Note: generating
         10 images at Pro-4K ≈ $2.40.
      10. **SynthID note**: every image carries an invisible Google
          watermark. Pixel data identifies as Gemini-generated.
          Users cannot disable this.
      11. **Troubleshooting**: one-paragraph pointers to
          reference.md sections for the top 5 failure modes.

- [ ] Create `build/nanogen/reference.md` with sections:
      1. **Intro**: what this file is for (long reference, consulted
         on demand).
      2. **Complete style catalog**: all 72 presets from styles.json,
         formatted as 10 category sections. Each preset shown as a
         bullet with slug, name, and promptFragment. **Generated from
         styles.json** by a small script embedded in the Work Items —
         NOT hand-typed. The script is in `build/nanogen/tools/
         render-style-reference.cjs` and runs at author time (the
         implementing agent runs it, captures output, and pastes
         into reference.md — we do NOT ship the script into the
         installed skill).
      3. **Asset-type prompt templates** (adapted from imagegen
         without OpenAI-specific cruft):
         - **Characters / sprites**: "[Style]. [Character description]
           in [pose]. Facing [direction]. [Outfit/armor/accessories].
           [Color palette]. Scene features: [background context].
           For a [genre] game."
         - **Tilesets / terrain**: "[Style]. [Terrain type] tile,
           seamlessly tileable. Top-down view. [Lighting direction].
           [Color palette]. [Texture details]."
         - **Items / icons**: "[Style]. [Item name/type], [key visual
           details]. Centered on canvas, small detail zone. [Size
           context]."
         - **UI elements**: "[Style]. [UI element type] for a [game
           genre] game. [State: normal/hover/pressed]. [Color scheme].
           [Shape details]."
         - **Backgrounds / scenes**: "[Style]. [Scene description].
           [Time of day/lighting]. [Mood/atmosphere]. [Perspective].
           [Dimensions context]."
         - **Portraits**: "[Style]. [Character description],
           [emotion/expression], [lighting setup], [background
           treatment]."
         - **Concept art**: "[Style]. [Subject], [environmental
           context], [mood/theme], [compositional notes],
           [lighting]."
         - **NO "transparent background" wording** — Nano Banana has
           no alpha. If user wants transparent, call out this
           limitation + suggest manual post-processing or solid-color
           background.
      4. **Aspect ratio guidance** (14 ratios with suggested uses).
      5. **Pricing table** (full, copied from /tmp/nanogen-research/
         research.md).
      6. **Error code reference** — same as SKILL.md's table but
         each code also has a "root cause" paragraph (2-3 sentences).
      7. **Env vars**:
         - Required: `GEMINI_API_KEY` (preferred) or `GOOGLE_API_KEY`.
         - Test-only: `NANOGEN_API_BASE`, `NANOGEN_RETRY_BASE_MS`,
           `NANOGEN_FETCH_TIMEOUT_MS`, `NANOGEN_MAX_RETRIES`.
      7b. **Pinned stderr-warning strings** (the CLI emits these
         verbatim; tests assert on them; documenting them here so
         agents and users can grep for root causes):
         - `nanogen: --safety <CATEGORY> specified multiple times; using last value`
         - `nanogen: using GOOGLE_API_KEY. Prefer GEMINI_API_KEY to match Gemini docs.`
         - `nanogen: --history-parent "<value>" not found in .nanogen-history.jsonl; continuing anyway.`
         - `nanogen: output extension ".png" but API returned image/<x>; bytes written as-is.`
         - `nanogen: --history-continue source used model "<A>"; continuing with model "<B>". Gemini may 400 on thoughtSignature format mismatch.`
      8. **Known gotchas** (from research.md):
         - thoughtSignature MUST be preserved verbatim on multi-turn.
         - Mixed IMAGE+TEXT output in one call is unreliable.
         - Text-in-image below 2K often garbled; use 2K+ and
           `--thinking high`.
         - Preview models can break — this CLI logs unknown response
           parts rather than crashing.
         - Workspace admin accounts can be admin-disabled for image
           gen (E_ADMIN_DISABLED).
         - Sanctioned countries return E_REGION.
         - EXIF orientation is NOT auto-applied — pre-normalize if
           needed.
         - Safety defaults are OFF in 2026; set explicitly if you
           want any filtering.
      9. **Version note**: this reference is current as of 2026-04-17.
         Preview models (gemini-3.x) may change. If generateContent
         returns unexpected schema, update this file.

- [ ] Enforce the sub-plan 2 **forbidden-tokens policy** (from
      SUB_2_EDIT_FLOW.md's Phase 2 style-author policy) on both
      SKILL.md and reference.md text:
      - Search for: `studio ghibli`, `ghibli`, `pixar`, `dreamworks`,
        `disney`, `mike mignola`, `mignola`, `bruce timm`, `moebius`
        (by itself — token allowed only as part of a slug/name field),
        `akira kurosawa`, `rembrandt`, `picasso`, `van gogh`.
        Case-insensitive.
      - If any match appears in OUTSIDE of a style slug or `name`
        field (i.e. in narrative prose), REPHRASE to describe the
        attribute rather than name the artist/studio.
      - Slug mentions (e.g. "`studio-ghibli-esque`" in a code block)
        are exempt since they're identifiers, not claims of
        likeness.
- [ ] Write `build/nanogen/tools/render-style-reference.cjs` — a
      small script that reads `styles.json` and emits markdown. Used
      at author time to populate reference.md's catalog section.
      **NOT shipped to the installed skill** — lives only in the
      `tools/` dir of the build folder.
- [ ] Re-run the test suite (`cd build/nanogen && npm test`) to
      confirm sub-plan 1 and 2 tests still pass. This phase adds
      docs; no code changes — but any accidental edit to generate.cjs
      would break green.

### Design & Constraints

**Why SKILL.md is concise and reference.md is long:** Claude Code
loads SKILL.md into agent context up-front on every invocation.
Keeping it short preserves token budget. Reference material lives in
reference.md, which the agent reads only when needed.

**Why we don't edit .claude/skills/nanogen/ yet:** user directive.
Phase 2 installs in one cp -r to avoid per-file permission prompts.

**Forbidden-token lint:** a single test in `test_styles.cjs`
(from sub-plan 1 Phase 2) already enforces this on `styles.json`.
This phase extends the same test OR adds a new
`test_docs_lint.cjs` that scans SKILL.md and reference.md. Choose
the latter for clarity; register it in `package.json`'s test script.

### Acceptance Criteria
- [ ] `build/nanogen/SKILL.md` exists, has valid YAML frontmatter,
      passes a lint script that checks for all required sections.
- [ ] `build/nanogen/reference.md` exists with all 9 sections.
- [ ] `reference.md`'s style catalog includes all 72 slugs.
- [ ] `build/nanogen/tools/render-style-reference.cjs` exists and,
      when run, prints markdown matching the catalog section of
      reference.md (regenerate-in-place idempotency check).
- [ ] Forbidden-token lint: no matches in prose of SKILL.md or
      reference.md (matches allowed inside style slugs + names only).
      Implement as `test_docs_lint.cjs` with at least 2 tests: one
      per doc file.
- [ ] `cd build/nanogen && npm test` still green. Aggregate test
      count now ≥ 121 (sub-plan 2's 119 + this phase's 2 doc-lint
      tests).
- [ ] SKILL.md explicitly contains the sentence
      `"Do NOT invoke the CLI unless GEMINI_API_KEY... is set"` (or a
      close variant — we only require the phrase "GEMINI_API_KEY" +
      "set" appear in the first 20 lines of the body).

### Dependencies
Sub-plans 1 and 2 complete.

## Phase 2 — Install `build/nanogen/` → `.claude/skills/nanogen/`

### Goal
In a SINGLE `cp -r` operation, copy the finished artifact into
`.claude/skills/nanogen/`. Update `.claude/settings.local.json`
permissions for the installed binary. Update
`.claude/zskills-config.json.testing.unit_cmd`. Verify the installed
skill works by running `--help` from its new home.

### Work Items

- [ ] Confirm `build/nanogen/` tree is complete. List expected
      top-level entries: `generate.cjs`, `styles.json`, `SKILL.md`,
      `reference.md`, `README.md`, `package.json`, `tests/`,
      `fixtures/`.
      The `tools/` dir (containing `render-style-reference.cjs`)
      should EXIST in build/ but should NOT be copied to install —
      it's an authoring tool.
- [ ] Run the installer command as ONE bash step:
      ```bash
      mkdir -p /workspaces/nanogen/.claude/skills/nanogen
      rsync -a --exclude=tools/ --delete \
        /workspaces/nanogen/build/nanogen/ \
        /workspaces/nanogen/.claude/skills/nanogen/
      ```
      Use `rsync --delete` so a repeat install cleanly replaces
      prior contents. If `rsync` is unavailable in the environment,
      fall back to:
      ```bash
      rm -rf /workspaces/nanogen/.claude/skills/nanogen
      cp -r /workspaces/nanogen/build/nanogen /workspaces/nanogen/.claude/skills/nanogen
      rm -rf /workspaces/nanogen/.claude/skills/nanogen/tools
      ```
      Rationale for `--delete` / pre-rm: without it, a stale file
      (e.g. an obsolete fixture) could persist across installs.
- [ ] Explicitly preserve the `build/nanogen/` source tree after
      install. We do NOT delete it. Rationale: a re-install is
      trivial if anything goes wrong; deleting the source complicates
      recovery and rolls back the "developed in a working folder"
      intent. The tree stays on disk as the canonical dev copy.
- [ ] Update `.claude/settings.local.json` to add one `allow` entry
      for the installed CLI. The update MUST be conservative — do
      NOT remove or reorder existing entries.
      Target entry (verbatim):
      `"Bash(node /workspaces/nanogen/.claude/skills/nanogen/generate.cjs:*)"`
      Update procedure:
      1. Read current `settings.local.json`.
      2. If the entry already exists: no change.
      3. Otherwise: insert into the `permissions.allow` array
         before the existing `mkdir -p` / `cp -r` entries to keep
         auditable ordering (later additions at the bottom).
      4. Write back with `JSON.stringify(obj, null, 2) + "\n"` to
         preserve formatting style.
      5. Validate the result parses as valid JSON BEFORE finishing.
- [ ] **Do NOT touch `.claude/settings.json`.** That file holds
      repo-wide settings (hooks), not user-level permissions. Only
      `settings.local.json` changes.
- [ ] Update `.claude/zskills-config.json`:
      - `testing.unit_cmd`: set to
        `cd .claude/skills/nanogen && npm test`. If the field is
        currently non-empty, ABORT with a message "refusing to
        overwrite existing testing.unit_cmd: <value>; set manually
        or remove first" so we never silently clobber a prior
        project's test command.
      - `testing.full_cmd`: leave empty (no other test suite exists
        yet).
      - `testing.file_patterns`: append
        `[".claude/skills/nanogen/**/*.cjs",
          ".claude/skills/nanogen/**/*.json"]` so the test-triggering
        file globs know about the skill's files. If
        `file_patterns` is currently empty `[]`, set to those 2
        entries; if populated, append (deduplicating).
      - Validate the result parses as valid JSON.
- [ ] **Install smoke test (required):**
      - `node /workspaces/nanogen/.claude/skills/nanogen/generate.cjs --help`
        → exit 0, output starts with `Usage: nanogen ` (matches
        sub-plan 1 Phase 1 AC).
      - `cd /workspaces/nanogen/.claude/skills/nanogen && npm test`
        → exit 0. Same green test count as the build/ copy.
      - `node /workspaces/nanogen/.claude/skills/nanogen/generate.cjs
        --prompt X --output /tmp/nanogen-smoke.png --dry-run` with
        `GEMINI_API_KEY=""` → exit 0, stdout JSON starts with
        `{"dryRun":true`.
- [ ] Produce a commit with a message like
      `feat(nanogen): install skill v0.1.0` containing:
      - `.claude/skills/nanogen/**` (new tree)
      - `.claude/settings.local.json` (permission addition)
      - `.claude/zskills-config.json` (test command + file
        patterns)
      Do NOT include `build/nanogen/**` in this commit — it was
      committed by sub-plans 1 and 2.

### Design & Constraints

**Reversibility:** `rm -rf .claude/skills/nanogen/` + git-revert the
settings changes rolls this back. Document this in the final
checkpoint message so the user knows how to uninstall.

**settings.local.json conflict handling:** The file is per-developer
(gitignored by convention in many repos). If the user has already
added local edits, our JSON-roundtrip preserves them — we do NOT
pretty-print the WHOLE file; we parse, mutate `permissions.allow`,
and stringify. Use `JSON.stringify(obj, null, 2)` which is already
the repo's formatting style (observed in current file).

**Why rsync over cp -r:** rsync is idempotent + supports
`--exclude=tools/`. cp -r doesn't exclude without extra steps.

**Why not bundle fixtures differently:** fixtures are test-only but
part of `tests/`. Installing them makes the skill self-testable
from its installed location. Sub-plan 2's `fixture-history-*.jsonl`
files are tiny (KB range). No benefit to stripping them.

### Acceptance Criteria
- [ ] `.claude/skills/nanogen/generate.cjs` exists and is
      executable.
- [ ] `.claude/skills/nanogen/styles.json` exists; `length === 72`.
- [ ] `.claude/skills/nanogen/SKILL.md` has valid frontmatter.
- [ ] `.claude/skills/nanogen/reference.md` exists.
- [ ] `.claude/skills/nanogen/tools/` does NOT exist.
- [ ] `.claude/settings.local.json` has the
      `Bash(node ...generate.cjs:*)` entry; no other entries modified
      or removed.
- [ ] `.claude/zskills-config.json` `testing.unit_cmd ===
      "cd .claude/skills/nanogen && npm test"`.
- [ ] `cd .claude/skills/nanogen && npm test` → exit 0, matches
      the build/ test count.
- [ ] `node .claude/skills/nanogen/generate.cjs --help` → exit 0.
- [ ] `node .claude/skills/nanogen/generate.cjs --prompt X --output
      /tmp/x.png --dry-run` with empty `GEMINI_API_KEY` → exit 0.
- [ ] Commit created with the three targeted paths; `build/` is
      untouched by this phase.

### Dependencies
Phase 1 of sub-plan 3.

## Phase 3 — API-Key Setup Doc + USER CHECKPOINT

### Goal
Write a comprehensive `reports/nanogen-api-key-setup.md` that gets a
brand-new user from zero to a working generate + edit in 5 minutes.
Then STOP. Emit a checkpoint message to the user. Mark the final
phase as `⊘` (awaiting user verification), NOT Done. This explicitly
prevents `/run-plan`'s auto-land from marking the plan complete on
the user's behalf.

### Work Items

- [ ] Write `reports/nanogen-api-key-setup.md` with sections:

      1. **TL;DR** (3 lines):
         `1. Get a key at https://aistudio.google.com/app/apikey`
         `2. export GEMINI_API_KEY=<your-key>`
         `3. Test: node .claude/skills/nanogen/generate.cjs --prompt "test" --output /tmp/t.png --dry-run`

      2. **Getting a key**:
         - Sign in to https://aistudio.google.com/app/apikey with any
           Google account.
         - Click "Create API key".
         - Copy the key. Treat it as a secret — it grants paid usage.

      3. **Setting the env var**:
         - Interactive shell: `export GEMINI_API_KEY="AIza..."`.
         - Persistent: add to `~/.bashrc` / `~/.zshrc`.
         - Project-scoped: create a `.env` file in the repo root
           with `GEMINI_API_KEY=AIza...` — the CLI walks up the
           directory tree to find it (sub-plan 1 Phase 4).
         - DO NOT commit `.env` to git. Confirm `.gitignore`
           contains `.env`.

      4. **Testing the key (in order):**
         - Dry-run (no key needed; smoke test):
           ```bash
           node .claude/skills/nanogen/generate.cjs --prompt "test" \
             --output /tmp/t.png --dry-run
           ```
           Expected: `{"dryRun":true,...}` on stdout, exit 0.
         - Real generate (cheapest; uses $0.034 of quota):
           ```bash
           node .claude/skills/nanogen/generate.cjs \
             --prompt "a single red apple on a white background" \
             --output /tmp/apple.png \
             --model gemini-3.1-flash-image-preview --size 1K
           ```
           Expected: PNG file at /tmp/apple.png, exit 0, success JSON.
           If exit 1 with E_MISSING_API_KEY: key not set. With
           E_REGION: your account cannot use Gemini API. With
           E_ADMIN_DISABLED: Workspace admin lock.
         - Real edit (cheapest; uses another $0.034):
           ```bash
           node .claude/skills/nanogen/generate.cjs \
             --image /tmp/apple.png \
             --region "change the apple to green" \
             --output /tmp/apple-green.png
           ```
           Expected: PNG file at /tmp/apple-green.png.
         - Multi-turn (continuation):
           ```bash
           ID=$(jq -r '.id' < /dev/null | cat .nanogen-history.jsonl \
             | tail -1 | jq -r .id)
           node .claude/skills/nanogen/generate.cjs \
             --history-continue "$ID" \
             --prompt "add a stem and leaf" \
             --output /tmp/apple-green-leaf.png
           ```

      5. **Pricing** (copied from reference.md — keep in sync):
         | Model | Size | $/image |
         |---|---|---|
         | gemini-3-pro-image-preview | 1K/2K | $0.134 |
         | gemini-3-pro-image-preview | 4K | $0.24 |
         | gemini-3.1-flash-image-preview | 512 | $0.022 |
         | gemini-3.1-flash-image-preview | 1K | $0.034 |
         | gemini-3.1-flash-image-preview | 2K | $0.050 |
         | gemini-3.1-flash-image-preview | 4K | $0.076 |
         | gemini-2.5-flash-image (GA, shutdown 2026-10-02) | 1K | $0.039 |
         Free tier: limited quota on `gemini-3.1-flash-image-preview`
         in AI Studio; specifics change. Check
         https://aistudio.google.com/rate-limit for your account.

      6. **Regional availability & restrictions**:
         - Supported: 200+ countries including all EU and UK.
         - Not supported: sanctioned countries (e.g. Russia, Iran,
           North Korea, Syria, Cuba, mainland China).
         - Workspace (enterprise Google) accounts may be
           admin-disabled → E_ADMIN_DISABLED. Ask your workspace
           admin or use a personal Gmail.

      7. **SynthID watermarking**: all generated images contain an
         invisible Google SynthID watermark in pixel data. This is
         NOT the visible Gemini-logo overlay from the consumer app —
         API outputs have no visible overlay. SynthID survives
         light editing but can be destroyed by aggressive
         re-encoding / re-rendering. Users should assume images
         generated via this CLI are identifiable as AI-generated.

      8. **Invoking /nanogen after setup**:
         - Direct CLI: `node .claude/skills/nanogen/generate.cjs
           [flags]`.
         - Via Claude Code: `/nanogen <prompt>` (sub-plan 3 installed
           the skill so Claude knows how to call it).
         - For iteration verbs and style selection, see
           `.claude/skills/nanogen/SKILL.md`.

      9. **End-to-end verification checklist** (copy to a fresh shell
         and paste):
         ```bash
         # 1. Env check
         [ -n "$GEMINI_API_KEY" ] || echo "GEMINI_API_KEY not set"

         # 2. Dry-run (offline)
         node .claude/skills/nanogen/generate.cjs \
           --prompt test --output /tmp/x.png --dry-run

         # 3. Full test suite (offline) — run in a CLEAN env so
         #    the env-resolution tests aren't polluted by any
         #    GEMINI_API_KEY you may have exported elsewhere.
         env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u NANOGEN_API_BASE \
             -u NANOGEN_RETRY_BASE_MS -u NANOGEN_FETCH_TIMEOUT_MS \
             -u NANOGEN_MAX_RETRIES \
           bash -c '( cd .claude/skills/nanogen && npm test )'

         # 4. One real generate (~$0.034)
         node .claude/skills/nanogen/generate.cjs \
           --prompt "red apple" --output /tmp/apple.png \
           --model gemini-3.1-flash-image-preview --size 1K

         # 5. One real edit (~$0.034)
         node .claude/skills/nanogen/generate.cjs \
           --image /tmp/apple.png --region "make it green" \
           --output /tmp/green.png
         ```
         Expected outcome: 5 green checkmarks. Total spend ≤ $0.07.

      10. **Troubleshooting table** (at least 12 codes):
         | Exit code | What the user sees | Likely cause | Fix |
         |---|---|---|---|
         | E_MISSING_API_KEY | "Set GEMINI_API_KEY…" | Env not set | `export GEMINI_API_KEY=...` |
         | E_REGION | "service is not supported in your country" | Geo-blocked | Use a VPN to a supported region or switch accounts |
         | E_ADMIN_DISABLED | "Workspace admin disabled" | Enterprise policy | Ask IT or use personal Google account |
         | E_MODEL_NOT_FOUND | Model 404 | Wrong model ID | Check `--model` against SKILL.md known list |
         | E_CONTENT_POLICY | "content policy" | Prompt blocked | Rephrase away from names/violence/real people |
         | E_RATE_LIMIT | 429 after retries | Quota exceeded | Wait or upgrade tier |
         | E_AUTH | 401 | Bad key | Regenerate at AI Studio |
         | E_REFUSED | Soft refusal | Model declined | Rephrase; see SKILL.md refusal recovery |
         | E_NODE_TOO_OLD | Node < 20.12 | Old Node | Upgrade to Node ≥ 20.12 |
         | E_REGION_WITHOUT_IMAGE | `--region` without `--image` | Edit-only flag misuse | Add `--image <path>` or drop `--region`. |
         | E_EDIT_NEEDS_INSTRUCTION | `--image` with no prompt/region | Nothing for model to do | Add `--prompt "..."` or `--region "..."`. |
         | E_CONTINUE_UNKNOWN_ID | `--history-continue <id>` id missing | Wrong id or clean cwd | `cat .nanogen-history.jsonl | tail -1` to get a valid id. |
         | E_CONTINUE_MISSING_OUTPUT | Prior output file gone | `/tmp/` cleaned | Re-run the first-turn generate; the `--history-continue` id from the fresh run can be re-used. |
         | E_CONTINUE_NO_SIGNATURE | Entry lacks thoughtSignature | Legacy row or non-Gemini-3 model | Regenerate with `gemini-3.1-flash-image-preview` or `gemini-3-pro-image-preview` and continue from that entry. |

- [ ] Uninstall instructions appended (short):
      ```bash
      rm -rf .claude/skills/nanogen
      git restore .claude/settings.local.json .claude/zskills-config.json
      # (build/nanogen/ is the dev source — keep or delete as you prefer)
      ```

- [ ] **USER CHECKPOINT** — emit the following message to stdout as
      the final action of Phase 3 (verbatim except for filling in the
      worktree name if applicable):

      ```
      ╔══════════════════════════════════════════════════════════════╗
      ║ /nanogen skill installed — awaiting user verification        ║
      ╠══════════════════════════════════════════════════════════════╣
      ║ Next steps:                                                  ║
      ║   1. Open reports/nanogen-api-key-setup.md                   ║
      ║   2. Get a key at https://aistudio.google.com/app/apikey     ║
      ║   3. export GEMINI_API_KEY=<your-key>                        ║
      ║   4. Run the 5-step verification checklist at the bottom     ║
      ║      of the setup doc                                        ║
      ║   5. Report back — pipeline awaits verification; plan is     ║
      ║      NOT yet marked complete.                                ║
      ║                                                              ║
      ║ Uninstall (if needed): see setup doc's Uninstall section.    ║
      ╚══════════════════════════════════════════════════════════════╝
      ```

- [ ] Update `plans/META_IMPLEMENT_A_NANOGEN_SKILL_SIMI.md` (the
      meta-plan, written by `/research-and-go` Step 2): set this
      sub-plan's row in the meta-plan's Progress Tracker to
      `⊘ Awaiting user verification` rather than Done. This is the
      ONLY intentional non-Done state in the meta-plan.

- [ ] **Do NOT mark this plan's status as `complete`** in the
      frontmatter. Leave it `active`. `/run-plan`'s landing logic:
      when the last phase is `⊘`, skip the auto-mark-complete step.
      If `/run-plan` does not honor `⊘`, the implementing agent
      MUST manually edit frontmatter before exiting to reassert
      `status: active` and add a visible warning block. This is the
      safety rail for the user checkpoint.

- [ ] **Do NOT cherry-pick / land to main in auto mode.** If the
      landing mode is cherry-pick or auto, the final phase of this
      sub-plan writes a commit BUT the `/run-plan` auto-land step
      is suppressed because the user needs to verify the installed
      skill before landing. Guardrail: write a `.landed` marker
      with `status: not-landed` in the **SAME bash step** as the
      commit to eliminate any TOCTOU window where auto-land could
      fire between commit and marker:
      ```bash
      git add .claude/skills/nanogen .claude/settings.local.json \
              .claude/zskills-config.json reports/nanogen-api-key-setup.md
      git commit -m "feat(nanogen): install skill; awaiting user verification" \
        && cat > "$(git rev-parse --show-toplevel)/.landed" <<LANDED
      status: not-landed
      date: $(TZ=America/New_York date -Iseconds)
      source: sub-plan-3-phase-3
      reason: awaiting user verification of API key + end-to-end checklist
      LANDED
      ```
      Document in a report that landing awaits user approval.

### Design & Constraints

**Why verbatim checkpoint text:** pipeline-observability tools scan
for the `pipeline awaits verification` phrase to recognize the
checkpoint.

**Why uninstall instructions up front:** reduces user anxiety about
"what if this breaks my repo". A reversible install encourages trust.

**`⊘` convention:** non-standard in most plan templates but we
document it explicitly in this plan's frontmatter. Future tooling
should learn to interpret it as "user-gated; do not auto-complete".

**Why we DON'T auto-test the real API:** the checkpoint is FOR the
user to test with their own key. If we used an API key we had, we
would spend the user's quota (or ours) and bypass their ability to
validate the key works in their environment.

### Acceptance Criteria
- [ ] `reports/nanogen-api-key-setup.md` exists and contains all
      10 sections above.
- [ ] The 5-step verification checklist is copy-pasteable.
- [ ] Troubleshooting table covers ≥ 12 error codes (including
      `E_REGION_WITHOUT_IMAGE`, `E_EDIT_NEEDS_INSTRUCTION`, and at
      least two `E_CONTINUE_*` codes).
- [ ] Uninstall instructions present.
- [ ] Final-phase stdout contains the verbatim checkpoint banner.
- [ ] `plans/SUB_3_SKILL_INSTALL.md`'s Progress Tracker shows
      Phase 3 as `⊘`.
- [ ] Plan frontmatter `status: active` — NOT `complete`.
- [ ] No auto-land: `.landed` marker (if created) reads
      `status: not-landed`.
- [ ] No real API calls made during this phase (grep for any
      outbound to `generativelanguage.googleapis.com` in the session
      transcript — should be zero).

### Dependencies
Phase 2 of sub-plan 3.

## Plan Quality
**Drafting process:** `/draft-plan` (via `/research-and-plan` via
`/research-and-go`) with 1 round of adversarial review focused on
the five concerns the parent skill listed.
**Convergence:** Converged at round 1. 12 findings accepted; 2
justified.

### Round History
| Round | Reviewer | Devil's Advocate | Resolved |
|-------|----------|------------------|----------|
| 1     | 6        | 8                | 12 Fixed, 2 Justified |

### Round 1 Disposition

| # | Finding | Disposition |
|---|---------|-------------|
| R1 | Install overwrites/conflicts with pre-existing `.claude/skills/nanogen/` | **Fixed** — rsync --delete / pre-rm pattern; explicit conflict handling. |
| R2 | No uninstall path | **Fixed** — uninstall block added to setup doc. |
| R3 | `settings.local.json` could be clobbered | **Fixed** — read-modify-write with JSON roundtrip + validation. |
| R4 | `zskills-config.json.testing.unit_cmd` could overwrite user's value | **Fixed** — abort-on-non-empty; explicit message. |
| R5 | API-key doc lacks an "uninstall" option | **Fixed** — added to setup doc. |
| R6 | Phase 3 "stop at checkpoint" not enforced if `/run-plan` doesn't know about `⊘` | **Fixed** — implementing agent manually asserts `status: active`; write `.landed` with `status: not-landed`; warning block added. |
| DA1 | Build folder deletion after install — ambiguous | **Fixed** — explicit "do NOT delete" with rationale. |
| DA2 | `tools/` dir leaks into install | **Fixed** — rsync `--exclude=tools/` + explicit AC that `tools/` is absent post-install. |
| DA3 | Forbidden-token lint on docs: undetermined which categories of tokens trigger | **Fixed** — explicit list; slug/name exempt; explicit in-code field. |
| DA4 | `cp -r` available on macOS but `rsync` on some minimal containers may not be | **Fixed** — fallback `rm -rf + cp -r + rm -rf tools`. |
| DA5 | Final stdout banner must be VERBATIM for tooling, and the implementing agent may paraphrase | **Fixed** — verbatim text specified including box-drawing chars. |
| DA6 | Auto-land would undo the user checkpoint | **Fixed** — `.landed` status `not-landed` + suppress auto-land. |
| DA7 | Claude may invoke the CLI before the user has set the key, burning tokens on an E_MISSING_API_KEY dance | **Justified** — SKILL.md's top rule directs agent to check env first; the CLI's E_MISSING_API_KEY is the ultimate guard. Retries suppressed by code-specific handling (no retry for non-retryable codes per sub-plan 1 Phase 4). |
| DA8 | User may set GOOGLE_API_KEY not GEMINI_API_KEY — stderr warning is fine but setup doc should call it out | **Justified** — section 3 "Setting the env var" recommends GEMINI_API_KEY; stderr warning already emitted per sub-plan 1; any more hand-holding is noise. |

**Remaining concerns:** None material. The `⊘` convention is
non-standard; pipeline tooling must be updated (documented) if it
doesn't yet recognize the marker. Until then, the implementing agent
manually enforces "do not complete" via frontmatter and `.landed`.

### Cross-Plan Review (post-/research-and-plan Step 3)

A cross-plan reviewer ran against all three sub-plans and surfaced 2
CRITICAL + 3 MAJOR + 5 MINOR findings. All CRITICAL and MAJOR fixes
landed directly in the affected sub-plan files:

| # | Finding | Fix applied in |
|---|---------|----------------|
| C1 | `E_MISSING_PROMPT` vs `E_MISSING_PROMPT_OR_IMAGE` cross-plan rename | SUB_1 Validation Matrix row 2 renamed forward-compatibly; SUB_2 now only tightens the predicate (no test rename) |
| C2 | `NANOGEN_MAX_RETRIES` silently introduced in SUB_2 | Hoisted into SUB_1 Phase 4 retry constants; SUB_2 references rather than introduces |
| M1 | Setup-doc troubleshooting table missing continuation + edit codes | SUB_3 troubleshooting expanded from 9 to 13 rows |
| M2 | Pinned stderr warning strings not documented in reference.md | SUB_3 reference.md gets new section 7b listing all 5 pinned strings |
| M3 | `withCleanEnv` may not unset user-exported keys, causing verification checklist to flake on user machines | SUB_1 `withCleanEnv` spec now explicitly deletes known env keys; SUB_3 verification checklist uses `env -u ... bash -c ...` pattern |
| m1–m2 | `NANOGEN_MAX_RETRIES` disambiguation in SUB_2 | Addressed as part of C2 fix |
| m3–m5 | Cosmetic wording/path notes | Left as-is (non-blocking) |
| m6 | `.landed` marker TOCTOU race | Phase 3 commit+`.landed` now in a single `&&`-chained bash step |

All CRITICAL and MAJOR concerns are resolved. MINOR items m3–m5 are
cosmetic and do not require implementation-time action.
