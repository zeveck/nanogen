---
title: /nanogen — Sub-Plan 1: CLI Core, Generate Flow, Style Catalog, Tests
created: 2026-04-17
status: active
---

# Plan: /nanogen — Sub-Plan 1: CLI Core, Generate Flow, Style Catalog, Tests

## Overview
Foundation sub-plan for the `/nanogen` skill: build a zero-dependency Node.js
CLI under `build/nanogen/` (NOT inside `.claude/`) that performs text-to-image
generation against Google's Nano Banana models via the Gemini REST API.
Ships a machine-readable `styles.json` catalog of **at least 72 presets
across 10 categories** (clearly exceeding imagegen's ~31), split into a
**pure** request builder + a thin I/O wrapper (for golden-testability), a
response parser that explicitly detects every refusal variant (critical:
Nano Banana returns text-only responses for soft refusals even when
`finishReason` is `"STOP"`) and validates decoded image bytes by magic
number, exponential-backoff retry with the correct immediate-fail vs
retry split and a test-mode timing override, JSONL history with
tolerant reader, and **at least 65 offline tests** covering every
validation path, request-body golden, response-parser variant, retry
behavior (including `Retry-After`, timeout, and body-parse failures),
env-var resolution (including the `loadEnvFile` pitfalls documented
below), and stderr-warning contracts.

**Critical design pivots away from imagegen's OpenAI baseline:**
- NOT `--quality low|medium|high` (OpenAI-only) — use `--thinking
  low|medium|high|minimal` mapped to `thinkingConfig.thinkingLevel`.
- NOT `--background transparent|opaque|auto` (OpenAI-only) — Nano Banana
  has no alpha support. Drop the flag entirely.
- NOT `--size 1024x1024|...` pixel dimensions — use `--aspect
  1:1|16:9|...` (14 valid ratios) × `--size 512|1K|2K|4K` (uppercase-K
  REQUIRED — Gemini rejects `"1k"`).
- NOT `--mask <file>` (OpenAI alpha-PNG) — Nano Banana does mask-free
  inpainting via natural-language region descriptions. Sub-plan 2 handles
  region-description UX; this sub-plan only defines `--image` passthrough
  and the edit-mode endpoint switch.
- DO NOT send `response_format`, `output_format`, `n`, or `quality` —
  those are OpenAI fields and will be silently ignored or (worse)
  400-rejected by Gemini.
- DEFAULT model: `gemini-3.1-flash-image-preview`. The older
  `gemini-2.5-flash-image-preview` was shut down 2026-01-15 (will 404).
  The GA `gemini-2.5-flash-image` shuts down 2026-10-02 — allow only as
  an opt-in budget fallback.

**Non-goals for this sub-plan:** multi-image composition beyond a single
`--image` passthrough, `thoughtSignature` round-tripping across turns,
multi-turn chat state (all handled in sub-plan 2); `SKILL.md` /
`reference.md` authoring and the install-to-`.claude` step (sub-plan 3).

**Non-goals for the whole skill:** `@google/genai` SDK (stay REST so
zero-deps like imagegen), Vertex AI, mask autogeneration, batch API,
SynthID detector, multi-provider abstraction, UI/GUI.

## Progress Tracker
| Phase | Status | Commit | Notes |
|-------|--------|--------|-------|
| 1 — Scaffold + arg parser + help + dry-run | ✅ Done | `ae67fde` | 30/30 tests pass |
| 2 — Style catalog (styles.json + loader + `--style`) | ✅ Done | `9beb172` | 21 new tests, 72 presets × 10 categories, Phase 1 still green (30) |
| 3 — Pure request builder + response parser | ⬚ | | |
| 4 — HTTP client: retry + error mapping + env var | ⬚ | | |
| 5 — History JSONL + end-to-end integration + full test suite | ⬚ | | |

## Phase 1 — Scaffold + Arg Parser + --help + --dry-run

### Goal
Establish `build/nanogen/` layout and a fully functional CLI shell with
argument parsing, validation, `--help`, and `--dry-run` that can print a
stub request body. **No `--style` in this phase** — that is fully owned
by Phase 2 to avoid a phase-dependency inversion. **No HTTP** — that is
Phase 4.

### Work Items
- [ ] Create `build/nanogen/` directory at the worktree root (NOT inside
      `.claude/`). Create subdirectories `tests/` and `fixtures/`.
- [ ] Create `build/nanogen/generate.cjs` with shebang `#!/usr/bin/env node`
      and `chmod +x`. Plain CommonJS (`.cjs`) like imagegen so `node
      build/nanogen/generate.cjs` works regardless of enclosing package
      type.
- [ ] **First line of `main()` after shebang:** runtime environment check.
      If `typeof process.loadEnvFile !== "function"` OR `typeof
      AbortSignal?.timeout !== "function"`, emit
      `{"success":false,"code":"E_NODE_TOO_OLD","error":"nanogen requires
      Node.js >= 20.12"}` and exit 1.
- [ ] Implement `parseArgs(argv)` as a hand-rolled parser (no
      minimist/yargs) returning a plain object. Repeatable flags (e.g.
      `--image`, `--negative`, `--safety`) collect into arrays.
- [ ] Implement `validateArgs(args)` that performs every validation
      listed under **Validation Matrix** in a STABLE fixed order and
      returns `{ok: true}` or `{ok: false, code, error}`. Validation
      short-circuits on first failure — order must NOT be changed
      without updating the plan. `--style` validation is a Phase-2
      concern; sub-plan 1's `parseArgs` accepts `--style <value>` into
      `args.styles` but `validateArgs` does NOT check membership (no
      Phase-1 test asserts acceptance OR rejection of `--style <slug>`,
      so Phase 2 can add validation without breaking Phase 1 tests).
- [ ] Implement `--help` / `-h` that prints free-form text:
      usage line, flag table, enum value lists (aspects, sizes,
      thinking levels, safety categories + thresholds), one generate
      example, one edit-mode preview example marked `# (edit mode —
      see sub-plan 2)`, a "get your key at https://aistudio.google.com/
      app/apikey; set GEMINI_API_KEY" footer. Exit 0. **Not JSON** —
      the only stdout-not-JSON case.
- [ ] Implement `--dry-run`:
      1. Run `parseArgs` + `validateArgs`.
      2. Read any input images into Buffers (Phase 3 moves this into a
         dedicated `readImageMaterials(args)` helper; the Phase 1 stub
         just tracks that images were read successfully).
      3. Call `buildGenerateRequestFromMaterials(args, imageBuffers)`
         — Phase 3 provides the real body; Phase 1 stub returns a
         minimal `{contents:[{parts:[{text:args.prompt}]}]}`.
      4. Print `{"dryRun": true, "url": <url>, "headers":
         {"x-goog-api-key": "<redacted>", "Content-Type":
         "application/json"}, "body": <body>}` as ONE JSON line.
      5. Exit 0. No HTTP call. No env-var resolution. **`GEMINI_API_KEY`
         may be unset — dry-run MUST succeed regardless.**
- [ ] Stdout contract: one JSON line per invocation. Success: emit
      `{"success":true, ...}`. Error: emit `{"success":false,"code":
      "E_...","error":"<human-readable>"}` with exit 1. `--help` is
      the ONLY exception (free-form text + exit 0).
- [ ] Write `tests/test_parse_args.cjs` using `node:assert/strict` +
      `node:child_process.spawnSync` (NOT `execFileSync`; we need to
      capture stderr separately). All tests run the CLI as a subprocess
      with `GEMINI_API_KEY=""` in `env` and assert exit code, stdout
      JSON, and (where relevant) stderr. Include AT LEAST one test per
      validation code below (so 21 tests minimum: 20 codes + one
      baseline success).
- [ ] Add `build/nanogen/package.json`:
      ```json
      {
        "name": "nanogen",
        "version": "0.0.0",
        "private": true,
        "type": "commonjs",
        "engines": { "node": ">=20.12" },
        "scripts": {
          "test": "node tests/test_parse_args.cjs && node tests/test_styles.cjs && node tests/test_request_builder.cjs && node tests/test_response_parser.cjs && node tests/test_http_retry.cjs && node tests/test_env.cjs && node tests/test_history.cjs && node tests/test_integration.cjs"
        }
      }
      ```
      Later phases write the referenced test files. Phase 1 need NOT
      make `npm test` green — only `node tests/test_parse_args.cjs`.
- [ ] Seed `build/nanogen/README.md` with:
      - Brief "under construction" note
      - Pointer to this plan
      - A **`## Testing / env overrides`** section documenting
        `NANOGEN_API_BASE`, `NANOGEN_RETRY_BASE_MS`,
        `NANOGEN_FETCH_TIMEOUT_MS`, and `NANOGEN_MAX_RETRIES` as
        test-only hooks — NOT in `--help`.
      Sub-plan 3 rewrites this README into user-facing docs.

### Design & Constraints

**Flag surface (sub-plan 1 scope; `--style` handled in Phase 2):**

| Flag | Type | Default | Valid values / constraints |
|------|------|---------|----------------------------|
| `--prompt <str>` | string | — | Required in Phase 1. Sub-plan 2 relaxes when `--image` provided. |
| `--output <path>` | string | — | Required. Extension ∈ `{.png,.jpg,.jpeg,.webp}`. Parent dirs auto-created. |
| `--model <id>` | string | `gemini-3.1-flash-image-preview` | Must ∈ `{gemini-3.1-flash-image-preview, gemini-3-pro-image-preview, gemini-2.5-flash-image}`. |
| `--aspect <r>` | string | `1:1` | ∈ 14 valid ratios (see Design & Constraints). Case-sensitive. |
| `--size <l>` | string | `1K` | ∈ `{512, 1K, 2K, 4K}`. **Uppercase K required.** Cross-model: `512` rejected unless model is `gemini-3.1-flash-image-preview`. |
| `--thinking <lvl>` | string | *(unset → API default)* | ∈ `{low, medium, high, minimal}`. Cross-model: `minimal` rejected on non-flash. When unset, body OMITS `thinkingConfig`. |
| `--seed <int>` | int | none | `Number.isInteger(Number(x))`; reject non-integer/non-finite. |
| `--temperature <f>` | float | none | `Number.isFinite(Number(x))`. |
| `--style <slug>` | string, repeatable | none | Parsed into `args.styles` in Phase 1. **Validated in Phase 2.** |
| `--negative <str>` | string, repeatable | none | Joined " ; " and appended as ` Avoid: <joined>.`. |
| `--safety <cat=thr>` | string, repeatable | none | Both sides are **case-insensitive** on input; request body always emits canonical upper-case. Shorthand categories accepted. Duplicate categories → last wins with deterministic stderr warning (exact text below). |
| `--image <path>` | string, repeatable | none | File must exist, `size > 0`, `size <= 15 MB` (raw — base64 expansion brings this comfortably under Gemini's 20 MB inline cap), extension ∈ `{.png,.jpg,.jpeg,.webp}`, magic-byte check matches the declared extension. Max 14 per call as a soft cap (Gemini Pro accepts up to 11 — server will 400 if too many; we do NOT attempt per-model client-side validation). |
| `--history-id <str>` | string | auto-derived from `--output` (see Phase 5) | Pass-through. |
| `--history-parent <str>` | string | none | Pass-through. Warns on stderr if not found in existing history (Phase 5). |
| `--no-history` | flag | false | Skip history append. |
| `--dry-run` | flag | false | Print would-be request as JSON, exit 0. |
| `--help` / `-h` | flag | — | Print free-form help, exit 0. |

**Validation Matrix (evaluate in this order; short-circuit on first
failure; emit `{"success":false,"code":"E_...","error":"<msg>"}` +
exit 1). Rationale column documents WHY each code exists — a reviewer
can challenge a code only by challenging the rationale.**

| # | Condition | Code | Rationale |
|---|-----------|------|-----------|
| 0 | `--help` / `-h` present → print help, exit 0. | — | Not a validation failure. |
| 1 | `--dry-run` set without `--output` | E_MISSING_OUTPUT | dry-run must show the actual output path too, not leak into an ambiguous state. |
| 2 | `--prompt` missing (sub-plan 2 relaxes to: missing AND `--image` absent AND `--region` absent) | E_MISSING_PROMPT_OR_IMAGE | Named for its sub-plan-2 semantics to avoid a rename. In sub-plan 1 alone the check is `--prompt missing`; sub-plan 2 adds the `--image` / `--region` escape path without renaming the code. |
| 3 | `--output` missing | E_MISSING_OUTPUT | Required. |
| 4 | `--output` extension not in valid set | E_BAD_OUTPUT_EXT | We pass it through to history; unknown ext confuses downstream. |
| 5 | `--model` not in known set | E_UNKNOWN_MODEL | Fail fast rather than 404 from Gemini. |
| 6 | `--aspect` not in 14-valid set | E_BAD_ASPECT | Fail fast. |
| 7 | `--size` not in `{512,1K,2K,4K}` | E_BAD_SIZE | Gemini rejects `1k` lowercase. |
| 8 | `--size 512` with non-flash-3.1 model | E_SIZE_MODEL_MISMATCH | Only flash 3.1 accepts 512. |
| 9 | `--thinking` not in valid set | E_BAD_THINKING | |
| 10 | `--thinking minimal` with non-flash model | E_THINKING_MODEL_MISMATCH | `minimal` is Flash-only. |
| 11 | `--seed` not integer | E_BAD_SEED | |
| 12 | `--temperature` not finite | E_BAD_TEMP | |
| 13 | `--safety` category unknown | E_BAD_SAFETY_CAT | |
| 14 | `--safety` threshold unknown | E_BAD_SAFETY_THRESHOLD | |
| 15 | `--image` file does not exist | E_IMAGE_NOT_FOUND | |
| 16 | `--image` extension not in valid set | E_BAD_IMAGE_EXT | |
| 17 | `--image` file size == 0 | E_IMAGE_EMPTY | Zero-byte files pass all other checks silently. |
| 18 | `--image` file size > 15 MB raw | E_IMAGE_TOO_LARGE | 15 MB raw → ~20 MB base64, staying under Gemini's documented inline cap. |
| 19 | `--image` magic-byte check fails vs declared extension | E_IMAGE_MIME_MISMATCH | A JPEG renamed to `.png` would 400 at the API with an opaque error; we catch it early. Magic bytes: `PNG=89 50 4E 47`, `JPEG=FF D8 FF`, `WEBP=RIFF....WEBP`. |
| 20 | `--image` count > 14 | E_TOO_MANY_IMAGES | Soft upper bound; per-model caps (Pro ≈ 11) may surface as API 400. |
| 21 | Unknown flag | E_UNKNOWN_FLAG | Catch-all (e.g. `--promptt`). |

**Error JSON shape (stable public contract — renaming `code` values is
a breaking change that future sub-plans must NOT do):**
```json
{"success":false,"code":"E_...","error":"human-readable message"}
```

**`--help` free-form text structure** (test asserts first line matches
`/^Usage: nanogen /`):

```
Usage: nanogen --prompt "<text>" --output <path> [options]
...
```

**Stderr warnings (pinned exact strings — tests assert `.includes(…)`
on stderr):**

- Duplicate `--safety` category (fires once per category regardless of
  how many times it duplicates):
  `nanogen: --safety <CATEGORY> specified multiple times; using last value`
- Using `GOOGLE_API_KEY` fallback (Phase 4):
  `nanogen: using GOOGLE_API_KEY. Prefer GEMINI_API_KEY to match Gemini docs.`
- Unknown `--history-parent` (Phase 5):
  `nanogen: --history-parent "<value>" not found in .nanogen-history.jsonl; continuing anyway.`
- Output extension vs returned MIME mismatch (Phase 5):
  `nanogen: output extension ".png" but API returned image/<x>; bytes written as-is.`

**14 valid aspect ratios (exhaustive):** `1:1, 2:3, 3:2, 3:4, 4:3, 4:5,
5:4, 9:16, 16:9, 21:9, 1:4, 4:1, 1:8, 8:1`.

**Test helper convention:** Each test file begins with `function
withCleanEnv(fn)` that (a) snapshots `process.env`, (b) **DELETES
`GEMINI_API_KEY`, `GOOGLE_API_KEY`, `NANOGEN_API_BASE`,
`NANOGEN_RETRY_BASE_MS`, `NANOGEN_FETCH_TIMEOUT_MS`,
`NANOGEN_MAX_RETRIES` from `process.env`** (then tests set what they
need), (c) runs `fn()`, (d) restores the original env. Tests that
invoke the CLI as a subprocess pass `env: {...withoutKeys}` to
`spawnSync` — they do NOT inherit the outer shell's env. This
isolates test runs from the user's `~/.bashrc` (so `GEMINI_API_KEY`
exported there does not leak into `test_env.cjs` cases that expect
no key). Each `fs.mkdtempSync`-using test wraps in try/finally with
`fs.rmSync(dir, {recursive: true, force: true})`.

### Acceptance Criteria
- [ ] `build/nanogen/generate.cjs` exists, is executable.
- [ ] Runtime-env check: simulating absent `process.loadEnvFile`
      surfaces `E_NODE_TOO_OLD`. **Test method:** spawn node with
      `--experimental-no-loadenv` flag emulation OR manually delete
      `process.loadEnvFile` in a child test and re-exec — whichever
      the implementing agent finds tractable. At minimum assert the
      check EXISTS at the top of `generate.cjs` via string match.
- [ ] `node build/nanogen/generate.cjs --help` prints help, exits 0;
      stdout starts with `Usage: nanogen `; stdout is NOT JSON.
- [ ] Baseline: `--prompt X --output foo.png --dry-run` emits
      `{"dryRun":true,...}` to stdout with
      `headers["x-goog-api-key"]==="<redacted>"`, `body.contents[0].
      parts[0].text==="X"`, exit 0.
- [ ] `GEMINI_API_KEY=""` does NOT cause dry-run failure.
- [ ] `tests/test_parse_args.cjs` has ≥ 21 tests: one per validation
      code 1–21 (negative assertion), one success baseline, one
      `--help` test. All pass.
- [ ] No external npm packages under `dependencies`/`devDependencies`.
- [ ] `package.json.engines.node === ">=20.12"`.

### Dependencies
None (foundation phase).

## Phase 2 — Style Catalog (`styles.json` + loader + `--style` validation)

### Goal
Ship `build/nanogen/styles.json` with **72 presets across 10 categories**
— final count written into the plan to avoid arithmetic drift. Wire
`--style <slug>` validation and the `applyStyles()` prompt transformer.

### Work Items
- [ ] Write `build/nanogen/styles.json` as a JSON array. **Entry count ==
      72.** (Plan enforces via AC `length === 72`.)
- [ ] Each preset:
      ```jsonc
      {
        "slug": "kebab-case-unique",
        "name": "Human Readable Name",
        "category": "<one of the 10 categories>",
        "promptFragment": "Plain-language description: palette, medium/technique, composition/lighting. 1-3 sentences."
      }
      ```
      `compatibleAspects` and `notes` are **intentionally dropped** —
      specified-but-unused fields are a maintenance hazard. Sub-plan 2
      or 3 may reintroduce them with explicit semantics.
- [ ] **Preset-authoring policy** (design constraint — enforced by
      review of the `styles.json` PR, not by code):
      - Slugs MAY reference an inspiration name (e.g. `fft-yoshida`,
        `moebius-clear-line`) because slugs are never sent to the API.
      - `name` MAY include the inspiration (e.g. "FFT (Yoshida)").
      - `promptFragment` MUST NOT name living or trademarked-estate
        artists, studios, or franchises. It describes visual
        attributes (palette, technique, composition, lighting) so that
        the Gemini model receives a neutral style description and does
        not soft-refuse on named-likeness grounds.
      - Example (from FFT/Yoshida):
        `"Isometric tactical RPG, chibi proportions (1:2
        head-to-body), muted earth-tone palette of aged parchment
        beiges, warm ambers, olive greens, dark grey outlines,
        medieval manuscript aesthetic, diorama quality."`
- [ ] Implement `loadStyles()`: reads `styles.json` via
      `fs.readFileSync` + `JSON.parse`. Returns `{byKey: Map<slug,
      preset>, list: preset[]}`.
- [ ] Implement `validateStyleCatalog(styles)` called at startup BEFORE
      any user-arg handling. Checks:
      1. Every entry has required fields (slug, name, category,
         promptFragment).
      2. Slug matches `/^[a-z0-9][a-z0-9-]*$/`.
      3. Slugs are unique.
      4. Category ∈ the fixed 10.
      5. Total `list.length >= 72`.
      6. Distinct categories == 10.
      7. Every `promptFragment` is a non-empty string ≤ 800 chars.
      On failure: emit
      `{"success":false,"code":"E_BAD_STYLES_CATALOG","error":"<detail>"}`
      and exit 1. **This runs BEFORE arg parsing** so a broken catalog
      fails deterministically regardless of user flags.
- [ ] Implement `applyStyles(promptText, styleSlugs, stylesIndex)`:
      ```
      if styleSlugs.length === 0: return promptText
      fragments = styleSlugs.map(slug => stylesIndex.byKey.get(slug).promptFragment)
      return promptText + " Style: " + fragments.join(" ") + "."
      ```
      Called by `buildGenerateRequestFromMaterials` (Phase 3).
- [ ] Add Validation Matrix entry **5b** (between model and aspect):
      - `5b` `--style` slug not in catalog → `E_UNKNOWN_STYLE`.
- [ ] Update `--help`: add `--style <slug>` note + pointer to
      `styles.json`.
- [ ] Write `tests/test_styles.cjs` with ≥ 14 tests:
      - Catalog loads & validates.
      - Duplicate-slug rejection (fixture with injected duplicate).
      - Unknown-category rejection.
      - Non-kebab-case slug rejection.
      - Missing-field rejection.
      - `length < 72` rejection.
      - `distinct categories < 10` rejection.
      - `applyStyles` with empty slugs → unchanged prompt.
      - `applyStyles` with one slug → prompt has ` Style: <fragment>.`
      - `applyStyles` with two slugs → fragments joined with a space.
      - CLI `--style unknown-slug` → exit 1, `E_UNKNOWN_STYLE`.
      - CLI `--style pixel-16bit --dry-run` → body prompt contains
        verbatim the `pixel-16bit` promptFragment.
      - Catalog author-policy spot-check: assert no promptFragment in
        `styles.json` contains any of the forbidden tokens (list
        below, case-insensitive regex).
      - `list.length === 72` exactly.
- [ ] Forbidden-tokens list (tested against all `promptFragment` values,
      case-insensitive; failing match emits `E_STYLE_AUTHOR_POLICY` with
      the offending slug):
      `studio ghibli`, `ghibli`, `pixar`, `dreamworks`, `disney`,
      `mike mignola`, `mignola`, `bruce timm`, `moebius` (by itself — the
      token is allowed only inside the slug/name), `akira kurosawa`,
      `rembrandt`, `picasso`, `van gogh`.
      (This protects against future edits that inadvertently name an
      artist. The slug/name field is exempt.)

### Design & Constraints

**Fixed category set (10, locked — do not add/rename without updating
the plan):**
1. `pixel-art`
2. `flat-vector`
3. `painterly`
4. `drawing-ink`
5. `photographic`
6. `animation-cartoon`
7. `fine-art-historical`
8. `game-style`   *(renamed from `game-srpg` because entries include
                   non-SRPG game aesthetics like PSX low-poly and
                   metroidvania.)*
9. `design-technical`
10. `speculative-niche`

**72 preset slugs (exact inventory; implementing agent must ship ALL
of these — no substitutions without updating the plan):**

- **`pixel-art`** (5): `pixel-8bit`, `pixel-16bit`, `pixel-32bit`,
  `pixel-modern-highdetail`, `pixel-isometric-tile`
- **`flat-vector`** (5): `flat-minimalist`, `flat-material-design`,
  `flat-glassmorphism`, `flat-neumorphism`, `isometric-infographic`
- **`painterly`** (5): `oil-painting`, `acrylic-impasto`, `gouache`,
  `watercolor`, `digital-painting-concept`
- **`drawing-ink`** (7): `charcoal`, `pencil-sketch`,
  `pen-ink-crosshatch`, `moebius-clear-line`, `mignola-noir`,
  `ink-wash-sumi-e`, `ukiyo-e`
- **`photographic`** (10): `hyperreal-portrait`, `studio-product`,
  `street-photography`, `macro`, `astrophotography`,
  `film-grain-35mm`, `tilt-shift`, `polaroid`, `cyanotype`, `infrared`
- **`animation-cartoon`** (7): `studio-ghibli-esque`, `pixar-cg-esque`,
  `dreamworks-cg-esque`, `cel-shaded-3d`, `anime-key-visual`,
  `saturday-morning-retro`, `bruce-timm-dcau-esque`
- **`fine-art-historical`** (9): `art-nouveau`, `art-deco`, `bauhaus`,
  `impressionism`, `cubism`, `surrealism`, `fauvism`, `expressionism`,
  `baroque-chiaroscuro`
- **`game-style`** (10): `fft-yoshida`, `tactics-ogre-dark`,
  `shining-force-16bit`, `fire-emblem-gba`, `disgaea-chibi`,
  `hd2d-modern-tactics`, `metroidvania-painterly`, `low-poly-psx`,
  `ps2-era-character`, `modern-indie-platformer`
- **`design-technical`** (5): `blueprint`, `architectural-hyperreal`,
  `architectural-sketch`, `schematic-diagram`, `exploded-view-diagram`
- **`speculative-niche`** (9): `vaporwave`, `synthwave`, `solarpunk`,
  `cottagecore`, `dark-academia`, `cyberpunk-neon`, `atompunk`,
  `dieselpunk`, `brutalist-scifi`

**Total: 5+5+5+7+10+7+9+10+5+9 = 72. AC is `length === 72`.**

### Acceptance Criteria
- [ ] `styles.json` exists, is valid JSON, `length === 72`.
- [ ] `validateStyleCatalog(loadStyles())` passes.
- [ ] Distinct categories count == 10; matches the fixed set exactly.
- [ ] Every slug in the above inventory is present; no extras.
- [ ] `tests/test_styles.cjs` passes all ≥ 14 tests.
- [ ] Forbidden-tokens test passes — no promptFragment contains a
      forbidden token.
- [ ] `--style unknown-slug` → exit 1, `E_UNKNOWN_STYLE`.
- [ ] `--style pixel-16bit --dry-run` embeds the `pixel-16bit` fragment
      verbatim in `body.contents[0].parts[0].text`.
- [ ] Malformed catalog (test fixture injecting duplicate slug) →
      startup exit with `E_BAD_STYLES_CATALOG` BEFORE arg parsing
      runs.

### Dependencies
Phase 1.

## Phase 3 — Pure Request Builder + Response Parser

### Goal
Provide pure, golden-testable functions for request construction (no
filesystem I/O inside the "pure" layer) and response parsing with
explicit refusal detection. This phase replaces Phase 1's stub but
does not initiate any HTTP call.

### Work Items

- [ ] Split request construction into two functions:

  1. **`readImageMaterials(args)`** — I/O wrapper:
     ```js
     // returns: { imageMaterials: [{buffer: Buffer, mimeType: string, path: string}, ...] }
     ```
     Reads each `--image` path, attaches MIME from extension, returns
     in invocation order. Throws on any read failure (should not happen
     — Phase 1's validation already confirmed existence).

  2. **`buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex)`** — **pure**:
     ```js
     // returns: { url: string, headers: object, body: object }
     ```
     No filesystem access. Takes pre-read buffers. This is the
     golden-test target.

- [ ] URL construction (inside pure builder):
  ```js
  const base = process.env.NANOGEN_API_BASE || "https://generativelanguage.googleapis.com";
  const url = `${base}/v1beta/models/${args.model}:generateContent`;
  ```
  **The pure builder reads `process.env.NANOGEN_API_BASE` — the SINGLE
  documented env read inside an otherwise pure function. Golden tests
  UNSET this variable explicitly in `withCleanEnv`. Retry tests set it
  to `http://127.0.0.1:<port>`.**

- [ ] Headers: `{"x-goog-api-key": <from resolveApiKey() in Phase 4>,
      "Content-Type": "application/json"}`. For `--dry-run`, the CLI
      wrapper replaces `x-goog-api-key` with `"<redacted>"`; the pure
      builder ALWAYS uses a placeholder `"<resolved-at-send-time>"`
      and a separate CLI step overwrites it. Golden tests pin the
      placeholder.

- [ ] Body shape (camelCase):
  ```jsonc
  {
    "contents": [{
      "parts": [
        { "text": "<composed prompt>" },
        // zero or more inlineData parts from imageMaterials:
        { "inlineData": {
            "mimeType": "image/png",
            "data": "<base64>"    // precomputed via Buffer.toString("base64")
        }}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "imageConfig": {
        "aspectRatio": "<args.aspect>",
        "imageSize": "<args.size>"
      },
      "candidateCount": 1,
      // optional fields — OMIT entirely if not set:
      "thinkingConfig": { "thinkingLevel": "<args.thinking>" },
      "seed": <args.seed>,
      "temperature": <args.temperature>
    }
    // safetySettings — OMITTED ENTIRELY when no --safety flag; otherwise emit an array of entries (at least one). NEVER emit [].
  }
  ```

  **Prompt composition order (deterministic, matches goldens):**
  1. Start with `args.prompt`.
  2. If `args.styles.length > 0`:
     `promptText += " Style: " + fragments.join(" ") + "."`
  3. If `args.negative.length > 0`:
     `promptText += " Avoid: " + args.negative.join("; ") + "."`

  **Fields explicitly OMITTED (in-code comment documents why):**
  `response_format` (DALL-E only — 400s on Gemini), `output_format`
  (OpenAI), `n` (unreliable on Gemini — use multiple calls),
  `quality` (OpenAI), `background` (no alpha on Gemini),
  `negativePrompt` (not a first-class Gemini param).

- [ ] `parseResponse(json)` returns:
  ```js
  {
    image: Buffer|null,
    text: string|null,
    finishReason: string|null,
    thoughtSignature: string|null,
    refusalReason: string|null,     // null on success
    promptBlockReason: string|null,
    responseMimeType: string|null,  // from inlineData.mimeType — for Phase 5 extension-mismatch warnings
    unknownParts: string[]          // array of unknown keys encountered
  }
  ```

  **Decision tree (MUST match this exactly — no ad-hoc heuristics):**
  ```
  1. result = { all fields null, unknownParts: [] }
  2. if json.promptFeedback?.blockReason:
        result.promptBlockReason = blockReason
        result.refusalReason = "prompt-blocked:" + blockReason
        // DO NOT return — still parse candidates[0] so we capture any
        // thoughtSignature or text the model included
  3. candidate = json.candidates?.[0]
     if candidate missing AND refusalReason still null:
        result.refusalReason = "no-candidates"; return result
     if candidate missing:
        return result
  4. result.finishReason = candidate.finishReason ?? null
  5. if finishReason in {SAFETY, PROHIBITED_CONTENT, IMAGE_SAFETY, RECITATION}:
        if result.refusalReason === null:
            result.refusalReason = "finish:" + finishReason
     (step 5 does NOT return — continue to collect signatures)
  6. for part in (candidate.content?.parts ?? []):
        if typeof part === "object":
          if "thoughtSignature" in part: result.thoughtSignature = part.thoughtSignature
          if part.inlineData?.data:
              buf = Buffer.from(part.inlineData.data, "base64")
              if buf.length > 0 AND matches magic number for
                 {PNG, JPEG, WEBP}:
                 result.image = buf
                 result.responseMimeType = part.inlineData.mimeType ?? null
              else:
                 result.refusalReason = result.refusalReason ?? "bad-image-bytes"
          if typeof part.text === "string":
              result.text = result.text ? result.text + "\n" + part.text : part.text
          for key in Object.keys(part):
              if key NOT in {text, inlineData, thoughtSignature}:
                  result.unknownParts.push(key)
  7. if result.image === null AND result.refusalReason === null:
        result.refusalReason = "soft-refusal:no-image"
  8. return result
  ```

  **Magic-byte checks** (4 constants in code):
  - PNG: first 4 bytes `[0x89, 0x50, 0x4E, 0x47]`
  - JPEG: first 3 bytes `[0xFF, 0xD8, 0xFF]`
  - WEBP: bytes 0..3 `[0x52, 0x49, 0x46, 0x46]` AND bytes 8..11
    `[0x57, 0x45, 0x42, 0x50]`
  These constants are also used for input-image validation in Phase 1
  (validation code 19) — share via a `magicBytes.cjs` helper module.

- [ ] Create `tests/fixtures/` with:
  - Request goldens (8+): `request-default.json`,
    `request-style-and-negative.json`, `request-all-safety-off.json`,
    `request-4k-pro-high-thinking.json`, `request-seed-and-temp.json`,
    `request-flash-minimal-512.json`, `request-one-image.json`,
    `request-no-thinking.json` (thinking unset → no thinkingConfig).
  - Response fixtures (7+): `response-success.json`,
    `response-finish-safety.json`, `response-finish-prohibited.json`,
    `response-finish-image-safety.json`,
    `response-finish-recitation.json`, `response-prompt-blocked.json`,
    `response-soft-refusal-text-only.json`,
    `response-unknown-part-shape.json`, `response-bad-image-bytes.json`
    (inlineData.data is "not-base64!@#$%"), `response-with-thought-sig.json`.
  - Image fixture `tiny-1x1.png` (checked-in as a 67-byte canonical
    PNG; SHA-256 pinned in a comment in `test_request_builder.cjs`
    to detect corruption). Generate once with `node -e 'const
    zlib=require("zlib"); ...'` (or check in via hex). Used for
    `request-one-image.json`.

- [ ] `tests/test_request_builder.cjs` — ≥ 10 tests comparing
      `buildGenerateRequestFromMaterials` output to each request
      golden via **structural equality** (`assert.deepStrictEqual`),
      NOT byte equality. Tests run inside `withCleanEnv` with
      `NANOGEN_API_BASE` explicitly deleted.

- [ ] `tests/test_response_parser.cjs` — ≥ 12 tests covering all
      response fixtures plus synthetic edge cases:
      - Empty candidates array.
      - `candidates[0].content.parts` missing (no parts key).
      - `parts` is `null`.
      - Unknown part shape (`{ "weirdNewField": 42 }`) → does not
        throw; `unknownParts` array contains `"weirdNewField"`.
      - `inlineData.data` is garbage base64 → `refusalReason ===
        "bad-image-bytes"`.

### Design & Constraints

**What tests lock in (the 7 refusal paths MUST be asserted at least
once each in `test_response_parser.cjs`):**
`prompt-blocked:SAFETY`, `finish:SAFETY`, `finish:PROHIBITED_CONTENT`,
`finish:IMAGE_SAFETY`, `finish:RECITATION`, `soft-refusal:no-image`,
`no-candidates`. Plus `bad-image-bytes` as an 8th case.

**Body-parse (JSON.parse on response) failures:** surfaced as
`E_UNEXPECTED_HTTP` with the raw body snippet. **Not retried** — if
the API returned unparseable JSON, retrying likely repeats the failure.
Documented in a source comment in Phase 4's HTTP client.

**`NANOGEN_API_BASE` documentation (README Testing section):**
```
NANOGEN_API_BASE (test-only):
    Override the Gemini API base URL. Used by the test suite to
    point at http://127.0.0.1:<mock-port>. Not documented in --help.
```

### Acceptance Criteria
- [ ] `tests/fixtures/` has ≥ 8 request goldens and ≥ 9 response
      fixtures, all valid JSON.
- [ ] `tiny-1x1.png` exists; first 4 bytes match PNG magic.
- [ ] `test_request_builder.cjs` has ≥ 10 passing tests.
- [ ] `test_response_parser.cjs` has ≥ 12 passing tests. All 8 refusal
      reasons asserted at least once.
- [ ] `--dry-run` with all flags populated emits output matching
      `request-full-featured.json` golden (structural equality).
- [ ] `thoughtSignature` extracted from `response-with-thought-sig.json`.
- [ ] Request body with `--thinking` unset has NO `thinkingConfig` key.
- [ ] Request body with no `--safety` has NO `safetySettings` key.

### Dependencies
Phase 1, Phase 2.

## Phase 4 — HTTP Client: Retry, Error Mapping, Env-Var Resolution

### Goal
Wire the real HTTP path atop Phase 3's pure functions. Implement
exponential-backoff retry with the correct split, a test-mode timing
override, an in-process HTTP mock for offline tests, and `.env`-walking
env-var resolution that **correctly handles `process.loadEnvFile`'s
quirks**.

### Work Items

- [ ] **`resolveApiKey()`** — MUST handle the two `loadEnvFile`
      pitfalls verified by adversarial review:

  1. `process.loadEnvFile(path)` throws on missing files →
     wrap in try/catch.
  2. `process.loadEnvFile(path)` does NOT overwrite already-set
     `process.env` entries. Critical: if `GEMINI_API_KEY=""` is
     pre-set (common in CI that zeros secrets), `loadEnvFile` will
     NOT replace it with a `.env` file's value.

  **Implementation (required; do not substitute a shorter version):**

  ```js
  function resolveApiKey() {
    // Step 1: check pre-set env, treating "" as unset
    const presetGemini = process.env.GEMINI_API_KEY;
    if (typeof presetGemini === "string" && presetGemini.length > 0) {
      return { key: presetGemini, source: "env:GEMINI_API_KEY" };
    }
    const presetGoogle = process.env.GOOGLE_API_KEY;
    if (typeof presetGoogle === "string" && presetGoogle.length > 0) {
      process.stderr.write(
        "nanogen: using GOOGLE_API_KEY. Prefer GEMINI_API_KEY to match Gemini docs.\n"
      );
      return { key: presetGoogle, source: "env:GOOGLE_API_KEY" };
    }

    // Step 2: walk .env — cwd upward FIRST, then __dirname upward
    const found = findDotenvFile();  // array of paths, first = closest
    for (const path of found) {
      const parsed = parseDotenvSync(path);  // hand-rolled 3-line parser, see below
      if (parsed.GEMINI_API_KEY) return { key: parsed.GEMINI_API_KEY, source: `.env:${path}:GEMINI_API_KEY` };
      if (parsed.GOOGLE_API_KEY) {
        process.stderr.write(
          "nanogen: using GOOGLE_API_KEY. Prefer GEMINI_API_KEY to match Gemini docs.\n"
        );
        return { key: parsed.GOOGLE_API_KEY, source: `.env:${path}:GOOGLE_API_KEY` };
      }
    }
    return null;
  }

  function findDotenvFile() {
    const results = [];
    const seen = new Set();
    function walk(dir) {
      while (true) {
        const p = require("path").join(dir, ".env");
        if (!seen.has(p)) { seen.add(p);
          try { if (require("fs").statSync(p).isFile()) results.push(p); }
          catch (_) {}
        }
        const parent = require("path").dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
    walk(process.cwd());
    walk(__dirname);
    return results;
  }

  function parseDotenvSync(path) {
    // Hand-rolled — zero deps. Skip comments, blank lines,
    // strip quotes, do NOT do shell-style substitution.
    const out = {};
    const txt = require("fs").readFileSync(path, "utf8");
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[k] = v;
    }
    return out;
  }
  ```

  **Rationale:** we parse `.env` manually rather than rely on
  `process.loadEnvFile` to avoid both the throw-on-missing and
  don't-overwrite behaviors. It's 3 lines of safe parsing vs. a
  built-in that bites in both common CI failure modes.

- [ ] **`fetchWithRetry(url, init)`:**

  ```
  MAX_RETRIES = Number(process.env.NANOGEN_MAX_RETRIES) || 3  // override via env; default 3 → 4 total attempts
  BASE_DELAY_MS = Number(process.env.NANOGEN_RETRY_BASE_MS) || 1000
  FETCH_TIMEOUT_MS = Number(process.env.NANOGEN_FETCH_TIMEOUT_MS) || 120000
  ```

  - Use `AbortSignal.timeout(FETCH_TIMEOUT_MS)`.
  - Retry on: status in `{429, 500, 502, 503}`, `TypeError` from
    `fetch` (network), `AbortError` from timeout.
  - If `Retry-After` header present AND numeric seconds AND value ≤ 60
    → use it verbatim as the next delay (overrides exponential).
    Non-numeric `Retry-After` → ignore, fall back to exponential.
  - Jitter: `delay = base * 2^(attempt-1); jittered = delay +
    (Math.random() - 0.5) * delay`.
  - Body-parse failure (response not JSON or missing fields) → NOT
    retryable → fail with `E_UNEXPECTED_HTTP` immediately.
  - Exhausted retries → throw with the LAST response's status + body
    snippet (first 500 chars).
  - Body is a `string` (stringified JSON) — fully replayable across
    retries. Do NOT use streams.

- [ ] **`mapHttpError(status, body)`** exact mapping:

  | HTTP | Body signal | Code |
  |------|-------------|------|
  | 400  | body contains `"INVALID_ARGUMENT"` AND (matches `/prompt/i` OR `/content/i` OR `/policy/i` OR `/safety/i`) | `E_CONTENT_POLICY` |
  | 400  | body contains `"inline_data"` OR `"image"` AND matches `/size|limit|mime/i` | `E_BAD_REQUEST_IMAGE` |
  | 400  | otherwise | `E_BAD_REQUEST` |
  | 401  | — | `E_AUTH` |
  | 403  | body matches `/admin|workspace/i` | `E_ADMIN_DISABLED` |
  | 403  | body matches `/country|region|not supported/i` | `E_REGION` |
  | 403  | otherwise | `E_FORBIDDEN` |
  | 404  | — | `E_MODEL_NOT_FOUND` |
  | 429 (post-retries) | — | `E_RATE_LIMIT` |
  | 500/502/503 (post-retries) | — | `E_UPSTREAM_5XX` |
  | other | — | `E_UNEXPECTED_HTTP` |

- [ ] **`NANOGEN_API_BASE`** — consumed by Phase 3's pure builder (see
      Phase 3 spec). Phase 4 does NOT re-apply it — it's already baked
      into the URL at request-build time.

- [ ] **Missing-key handling:** if `resolveApiKey()` returns null AND
      `--dry-run` is NOT set → exit 1 with `{"success":false,"code":
      "E_MISSING_API_KEY","error":"Set GEMINI_API_KEY (or GOOGLE_API_KEY
      as fallback). See build/nanogen/README.md."}`.

- [ ] **`tests/test_http_retry.cjs`** — in-process `node:http` mock
      server, port 0, observe via `server.address().port`, point CLI
      at it via `NANOGEN_API_BASE=http://127.0.0.1:<port>`. All tests
      set `NANOGEN_RETRY_BASE_MS=5` in env so retries complete in
      ~milliseconds, not seconds. At least 10 tests:
      - 200 success → image returned.
      - 429 × 2 then 200 → attempts observed == 3.
      - 500 × 4 → E_UPSTREAM_5XX, attempts observed == 4.
      - 401 → E_AUTH, attempts observed == 1.
      - 403 `"Workspace admin disabled"` → E_ADMIN_DISABLED.
      - 403 `"service is not supported in your country"` → E_REGION.
      - 404 → E_MODEL_NOT_FOUND.
      - `Retry-After: 2` on 429 → observe delay ≥ 2 * (test BASE_MS
        scaling multiplier — or just assert that `Retry-After` path was
        taken via a side-channel counter on the mock server).
      - Mock writes `{"candidates` then closes socket → observed as
        either retried (network error) or reported via
        E_UNEXPECTED_HTTP. Pin whichever the impl chose in the test.
      - `AbortSignal.timeout` expires before response → retried once,
        then fails with `E_UPSTREAM_5XX` if retries exhausted or
        `E_UNEXPECTED_HTTP` if non-retryable. Use
        `NANOGEN_FETCH_TIMEOUT_MS=50` in this test.
      - Body that is NOT valid JSON → E_UNEXPECTED_HTTP, attempts
        observed == 1 (not retried).

- [ ] **`tests/test_env.cjs`** — ≥ 8 tests, each using `mkdtempSync`
      + try/finally cleanup + `withCleanEnv`:
      - GEMINI_API_KEY pre-set → returned; no stderr warning.
      - GOOGLE_API_KEY pre-set (no GEMINI) → returned + stderr warning.
      - Both pre-set → GEMINI wins; no warning (even though GOOGLE
        was set, it was not used).
      - GEMINI_API_KEY pre-set to `""` (empty) → falls through to
        `.env` lookup. **This is the bug-fixed case — verified by
        reproduction in plan's research.**
      - Neither pre-set; `.env` in cwd with `GEMINI_API_KEY=foo` →
        returns `"foo"`.
      - Neither pre-set; `.env` two dirs up from cwd → returns value.
      - Neither pre-set; `.env` has `GEMINI_API_KEY=""` (empty in
        .env) → treated as absent; no key returned.
      - No `.env` anywhere; no env vars → returns null; CLI exits with
        `E_MISSING_API_KEY`.
      - `.env` with quotes: `GEMINI_API_KEY="with spaces"` → correctly
        stripped.
      - Unreadable `.env` (perm 000 after create) → does not crash;
        continues to next candidate. (May skip on non-POSIX CI.)

### Design & Constraints

**Env-var precedence deviation** (documented in README):
- `GEMINI_API_KEY` wins over `GOOGLE_API_KEY` (inverse of Google SDK).
- Rationale: Gemini is the brand; official docs instruct users to set
  `GEMINI_API_KEY`. Setting both is rare; when only one is set,
  behavior is obvious.
- `.env` file `GEMINI_API_KEY` wins over `.env` file `GOOGLE_API_KEY`.
- First `.env` found (cwd upward, then `__dirname` upward) wins.

**Why we parse `.env` manually:** `process.loadEnvFile` throws on
missing files and does NOT overwrite already-set env vars. Reproduced
in sandbox. A 10-line hand parser sidesteps both.

**Retry test timing:** `NANOGEN_RETRY_BASE_MS=5` reduces exponential
delays to 5ms / 10ms / 20ms (≈ 35ms total for exhausted retries
vs 7000ms with defaults). Entire retry test suite completes in under
2 seconds wall-clock.

### Acceptance Criteria
- [ ] `test_http_retry.cjs` has ≥ 10 passing tests, total runtime
      under 5 seconds (`time node tests/test_http_retry.cjs`).
- [ ] `test_env.cjs` has ≥ 8 passing tests.
- [ ] Mock server reports expected `attempts` count per retry
      scenario.
- [ ] No outbound requests beyond 127.0.0.1 during `npm test`.
- [ ] CLI without any key configured exits with `E_MISSING_API_KEY`.
- [ ] Reproduced-bug test (empty `GEMINI_API_KEY` + `.env` with real
      value) resolves to the `.env` value — NOT null.
- [ ] `NANOGEN_API_BASE` override flows through the pure builder in
      Phase 3; retry tests confirm the request actually lands at
      `127.0.0.1:<port>` (observed by mock server).

### Dependencies
Phase 3.

## Phase 5 — History, End-to-End Integration, Full Test Suite

### Goal
Append-only (best-effort) JSONL history with a tolerant reader,
extension-vs-returned-MIME warnings, integration tests through the mock
server, and `npm test` greening on all 8 test files (≥ 65 total tests).

### Work Items

- [ ] **`appendHistory(entry)`** — write behavior:
  - Serialize entry with `JSON.stringify(entry) + "\n"`.
  - Single `fs.appendFileSync(".nanogen-history.jsonl", data,
    {flag: "a"})` call.
  - **Atomicity note** (in source comment): POSIX O_APPEND is atomic
    only for writes ≤ `PIPE_BUF` (4096 bytes on Linux). With a long
    `thoughtSignature` one entry can exceed that, so truly concurrent
    writers may interleave. We do NOT add a lockfile — concurrent
    nanogen invocations in the same cwd is rare. Instead, the reader
    below tolerates malformed lines.
  - If `--no-history` set: skip entirely.
  - On write failure (EACCES, EROFS, etc.): emit a `historyWarning`
    field in the success JSON, do NOT fail the overall invocation.

- [ ] **`readHistory()`** — tolerant reader (used by
      `--history-parent` lookup AND by tests):
  - `fs.readFileSync` + split on `\n`.
  - For each non-empty line: try `JSON.parse`; on failure, **skip**
    (do not throw). Accumulate valid entries.
  - Return the array.

- [ ] **History entry schema:**
  ```jsonc
  {
    "id": "<see ID derivation>",
    "timestamp": "2026-04-17T14:00:00Z",   // new Date().toISOString()
    "prompt": "<FINAL composed prompt — what was actually sent>",
    "output": "<--output>",
    "params": {
      "model": "...",
      "aspectRatio": "...",
      "imageSize": "...",
      "thinkingLevel": "<value>|null",
      "seed": <number|null>,
      "temperature": <number|null>,
      "styles": ["slug1","slug2"]
    },
    "parentId": "<--history-parent>|null",
    "bytes": <output file size>,
    "outputFormat": "png|jpeg|webp",           // FROM ACTUAL MIME, not extension
    "outputExtension": "png|jpg|jpeg|webp",    // from --output path
    "inputImages": ["<path1>","<path2>"] | omitted,
    "refusalReason": "<string>|null",
    "thoughtSignature": "<string>|null"
  }
  ```

  **ID derivation:**
  - If `--history-id` provided: use it verbatim.
  - Else: `slug(output-without-ext) + "-" + sha1(absolutePath(output)).slice(0,8)`.
  - The 8-char SHA suffix avoids collisions when two different paths
    slugify to the same string (e.g. `assets/Foo.png` and
    `assets/foo.png`). `--history-parent` lookups accept either the
    full slug+sha form or a bare prefix via `startsWith`.

- [ ] **Flow on successful response:**
  1. Write output file (`mkdirSync` parent, then `writeFileSync`).
  2. If `response.responseMimeType` is present AND maps to a different
     ext than `--output`'s: emit stderr warning (pinned text in Phase
     1 design constraints).
  3. Append history (unless `--no-history`).
  4. Emit success JSON: `{"success":true,"output":"...","historyId":
     "...","bytes":N,"model":"...","aspectRatio":"...","imageSize":
     "...","refusalReason":null}`.

- [ ] **Flow on refusal:**
  1. Do NOT write output file.
  2. Append history with `refusalReason` populated AND
     `bytes:0, outputFormat:null` (unless `--no-history`).
  3. Emit `{"success":false,"code":"E_REFUSED","error":"<reason>",
     "refusalDetails": {"finishReason":"...","promptBlockReason":
     "...","text":"..."}}` with exit 1.

- [ ] **`tests/test_history.cjs`** — ≥ 8 tests using
      `mkdtempSync`+try/finally:
  - Append + read round-trip.
  - Auto-id contains SHA suffix; same output path twice → same id;
    different output paths with same slug → different ids.
  - `--no-history` skips.
  - Parent/child linkage via `--history-parent`.
  - Refusal case: no output file, history row with `refusalReason`.
  - Malformed pre-existing history file: valid lines still readable;
    new append succeeds.
  - **Append-only contract:** two invocations → `wc -l
    .nanogen-history.jsonl` == 2; first line unchanged.
  - Unknown `--history-parent` → stderr warning (pinned text).
  - History write failure (`/proc/self/fd/1` as path, or chmod 000)
    → invocation still succeeds with `historyWarning` field.

- [ ] **`tests/test_integration.cjs`** — ≥ 6 tests using the Phase 4
      mock server:
  - Successful generate → output file bytes match mock response;
    history row written; success JSON on stdout.
  - 429 × 2 then 200 → retries succeed; final bytes match; history
    reflects final params.
  - SAFETY refusal → no output file; JSON has `code=E_REFUSED`;
    history row with `refusalReason=finish:SAFETY`.
  - `--no-history` + success → no history file touched.
  - **thoughtSignature round-trip evidence:** mock server returns a
    response with `thoughtSignature: "sig-abc"`; history row contains
    `thoughtSignature: "sig-abc"`. (Sub-plan 2 uses this; we prove the
    plumbing works end-to-end in sub-plan 1.)
  - Output-ext vs returned-MIME mismatch (mock returns
    `image/jpeg`, user gave `--output foo.png`) → stderr warning
    emitted; file still written; history `outputFormat=jpeg`,
    `outputExtension=png`.

- [ ] Update `package.json` `test` script to run all 8 test files
      (already specified in Phase 1). Running `cd build/nanogen &&
      npm test` returns exit 0.

- [ ] Update `build/nanogen/README.md` to sub-plan-1-complete form:
      CLI flag table, env vars (including pinned warning about
      precedence inversion vs SDK), `NANOGEN_API_BASE` and
      `NANOGEN_RETRY_BASE_MS` in a "Testing" section, minimal usage
      example. Sub-plan 3 may rewrite.

### Design & Constraints

**Test aggregate floor:** 21 (Phase 1) + 14 (Phase 2) + 22 (Phase 3:
≥10 builder + ≥12 parser) + 18 (Phase 4: ≥10 retry + ≥8 env) + 14
(Phase 5: ≥8 history + ≥6 integration) = **89 minimum total**. The
overview claims "≥ 65 offline tests" as a floor — plan authors
pick the larger number for AC. **AC: `npm test` reports ≥ 89 passing
tests.**

**Why not a lockfile for history:** concurrent `/nanogen` invocations
in the same cwd are rare, and the tolerant reader absorbs any
interleave. Adding a lockfile adds a failure mode (stale lock after
crash) we don't need.

### Acceptance Criteria
- [ ] `test_history.cjs` ≥ 8 passing tests.
- [ ] `test_integration.cjs` ≥ 6 passing tests.
- [ ] `cd build/nanogen && npm test` → exit 0, total ≥ 89 passing
      tests across the 8 test files.
- [ ] Successful invocation writes output file with correct bytes,
      history JSONL row with correct schema (including
      `thoughtSignature` round-tripped), success JSON on stdout.
- [ ] Refusal (SAFETY or soft-refusal) writes NO output file, writes
      history row with `refusalReason`, stdout has
      `code=E_REFUSED`, exit 1.
- [ ] Append-only: 2 invocations → exactly 2 lines in history.
- [ ] Extension mismatch warning: tested against a mock response with
      `mimeType=image/jpeg` when `--output` is `.png`; stderr
      contains the pinned warning.
- [ ] No external npm packages in `build/nanogen/package.json`.

### Dependencies
Phase 4.

## Plan Quality
**Drafting process:** `/draft-plan` (via `/research-and-plan` via
`/research-and-go`) with 1 round of adversarial review.
**Convergence:** Converged at round 1. The reviewer and devil's
advocate produced 32 findings combined; after verify-before-fix, 30
were accepted and fixed in-plan; 2 were justified (compatible-aspects
field dropped rather than specified; trademarked-slug policy retained
with explicit style-author policy + forbidden-tokens test).

### Round History
| Round | Reviewer Findings | Devil's Advocate Findings | Resolved |
|-------|-------------------|---------------------------|----------|
| 1     | 18                | 14                        | 30 Fixed, 2 Justified |

### Round 1 Disposition (abbreviated — full details preserved in
`/workspaces/nanogen/plans/SUB_1_CLI_CORE.md` revision history)

| # | Finding | Evidence | Disposition |
|---|---------|----------|-------------|
| R1  | "Byte-for-byte" vs `deepStrictEqual` ambiguity | Judgment | Fixed — now "structural equality". |
| R2  | `.env` walk order unspecified | Verified (plan silent) | Fixed — cwd-first, then `__dirname`. |
| R3  | AC covers only 15/20 validation codes | Verified | Fixed — AC now requires tests for all 21 codes (added 5b E_UNKNOWN_STYLE in Phase 2). |
| R4 / M2 | `NANOGEN_API_BASE` plumbing unspecified | Verified | Fixed — pure builder reads env; tests UNSET it in withCleanEnv. |
| R5  | Refusal parser early-return ambiguity | Verified | Fixed — explicit "do NOT return" notes at steps 2 and 5. |
| R6  | `--help` JSON-exception not tested | Verified | Fixed — AC asserts stdout starts with `Usage: nanogen `. |
| R7  | `--image` count 14 vs per-model caps | Verified | Fixed — soft cap; note that API 400 may arrive for Pro@>11. |
| R8  | Unknown part shapes not logged | Verified | Fixed — parser collects `unknownParts[]` + fixture + test. |
| R9  | Phase 1 `--style` acceptance vs Phase 2 rejection | Verified | Fixed — Phase 1 does not validate `--style` AT ALL; Phase 1 tests do not assert `--style` behavior. |
| R10/m1 | Test count 40 vs summed 65+ | Verified via arithmetic | Fixed — AC states ≥ 89. |
| R11 | safetySettings omit-vs-empty undefined | Verified | Fixed — OMIT when no `--safety`. |
| R12 | Safety category case-sensitivity | Verified | Fixed — case-insensitive input, canonical uppercase body. |
| R13 | History "only grows" AC missing | Verified | Fixed — AC tests 2-invocation line count. |
| R14 | `NANOGEN_API_BASE` undocumented | Verified | Fixed — README Testing section. |
| R15 | Trademarked artist names in preset slugs/fragments | Verified | Fixed partial — slugs allowed to reference inspiration (non-API); fragments forbidden via style-author policy + forbidden-tokens test. |
| R16 | Always-emit thinkingConfig | Verified | Fixed — `--thinking` default changed to unset; thinkingConfig omitted when absent. |
| R17 | Body-parse errors not retried + untested | Verified | Fixed — explicit non-retry + test. |
| R18 | Code-size estimate too low | Judgment | Fixed — removed line-count AC. |
| C1  | `process.loadEnvFile` throws on missing | **Reproduced** | Fixed — manual `.env` parser sidesteps. |
| C2  | `loadEnvFile` does NOT overwrite env | **Reproduced** | Fixed — manual parser + explicit empty-string handling. |
| C3  | "Pure" builder does file I/O | Verified | Fixed — split into `readImageMaterials` (I/O) + `buildGenerateRequestFromMaterials` (pure). |
| C4  | O_APPEND atomicity misclaim | Verified (POSIX) | Fixed — claim downgraded to "best-effort"; tolerant reader added. |
| C5  | Zero-byte images + garbage base64 | **Reproduced** | Fixed — E_IMAGE_EMPTY + magic-byte checks on both input and decoded output. |
| C6  | 20 MB raw vs encoded ambiguity | Verified | Fixed — cap at 15 MB raw with rationale in comment. |
| M1  | Validation ordering short-circuit | Verified | Fixed — explicit "short-circuits on first failure; do not reorder". |
| M3  | `compatibleAspects` dead field | Verified | Fixed — field DROPPED from schema. Justified per "specified-but-unused is a hazard". |
| M4  | 72 presets vs plan's 67 + mis-categorized SRPG | **Counted: 72** | Fixed — category renamed to `game-style`; count stated as 72; exact inventory locked. |
| M5  | Tempdir cleanup unspecified | Verified | Fixed — tests use try/finally + `withCleanEnv`. |
| M6  | Retry tests slow | Verified | Fixed — `NANOGEN_RETRY_BASE_MS` test override. |
| M7  | Stderr warnings untested, exact text unspecified | Verified | Fixed — four warning strings pinned; tests assert `spawnSync.stderr`. |
| M8  | No `engines` field / Node version check | Verified | Fixed — engines field + runtime check with E_NODE_TOO_OLD. |
| m2  | thoughtSignature cosmetic in sub-plan 1 | Judgment | Fixed — Phase 5 integration AC asserts thoughtSignature round-trip. |
| m3  | `--history-id` slug collisions | Verified | Fixed — SHA-8 suffix. |
| m4  | `--history-parent` silent typos | Verified | Fixed — stderr warning on unknown parent. |
| m5  | output ext vs returned MIME mismatch | Verified | Fixed — `outputFormat` from actual MIME + stderr warning. |
| m6  | `--image` MIME extension-only trust | Verified | Fixed — magic-byte check = validation code 19. |

**Remaining concerns:** None. Plan is ready for `/run-plan`.
