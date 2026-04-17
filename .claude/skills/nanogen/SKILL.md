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

# /nanogen — Image generation and editing via Gemini Nano Banana

## 0. Top rule — read this first

**Do NOT invoke the CLI unless `GEMINI_API_KEY` (or `GOOGLE_API_KEY`
as a fallback) is set in the environment. A dry-run (`--dry-run`) is
always safe and requires no API key.**

Before any real invocation, verify:

```bash
printenv GEMINI_API_KEY >/dev/null || printenv GOOGLE_API_KEY >/dev/null \
  || echo "no key"
```

If neither is set, STOP. Point the user to
`reports/nanogen-api-key-setup.md`, which covers getting a key,
exporting it, and verifying it works. Do not burn tokens retrying an
`E_MISSING_API_KEY` dance — the CLI fails fast and gives no
interactive prompt.

## 1. Two modes

The CLI has exactly two modes, selected by whether any `--image`
flag is present:

- **Generate mode** — no `--image`. Text-to-image. `--prompt` is
  required.
- **Edit mode** — one or more `--image` (up to 14). Either
  `--prompt` or `--region` must be supplied (or both).

Decision tree:

- User already has an image they want modified? → **Edit mode**
  (`--image <path>` + describe the change in `--prompt` or
  `--region`).
- User wants a new image from a description alone? → **Generate
  mode** (`--prompt "..." --output out.png`).

Output format is determined by the extension of `--output`:
`.png`, `.jpg`/`.jpeg`, or `.webp`.

## 2. Picking styles

The catalog has **72 preset slugs** across **10 categories**:
`pixel-art`, `flat-vector`, `painterly`, `drawing-ink`,
`photographic`, `animation-cartoon`, `fine-art-historical`,
`game-style`, `design-technical`, `speculative-niche`. See
`reference.md` for the full catalog.

Rules:

1. Skim the 10-category summary in `reference.md`.
2. Match user intent to 1–3 relevant categories.
3. Pick **1–2 style slugs** (rarely more — excessive stacking
   produces muddy output).
4. If the user's request is already highly specified
   ("photorealistic studio shot of X with 85mm f/1.4 lens"), default
   to **no** style — the prompt itself is doing the work.

Pass styles via `--style <slug>` (repeatable). Each resolves to a
preset prompt fragment appended as ` Style: ...` to the base text.

## 3. Asset-type defaults

Table of sensible defaults when the user hasn't pinned model / size
/ aspect:

| Asset type | Default model | Default aspect | Default size | Style category hints |
|---|---|---|---|---|
| Characters / sprites | `gemini-3.1-flash-image-preview` | 2:3 or 3:4 | 1K | `pixel-art`, `animation-cartoon`, `fine-art-historical` |
| Tilesets / terrain | `gemini-3.1-flash-image-preview` | 1:1 | 1K | `pixel-art`, `painterly` |
| Items / icons | `gemini-3.1-flash-image-preview` | 1:1 | 1K | `flat-vector`, `pixel-art` |
| UI elements | `gemini-3.1-flash-image-preview` | varies | 1K | `flat-vector` |
| Backgrounds / scenes | `gemini-3-pro-image-preview` | 16:9 or 21:9 | 2K | `painterly`, `photographic` |
| Portraits | `gemini-3-pro-image-preview` | 2:3 or 3:4 | 2K | `painterly`, `photographic` |
| Concept art | `gemini-3-pro-image-preview` | 16:9 | 2K | `painterly`, `drawing-ink` |
| Diagrams / schematics | `gemini-3.1-flash-image-preview` | 16:9 | 1K | `design-technical` |
| Text-heavy images (logos, posters) | `gemini-3-pro-image-preview` | varies | **2K minimum** | `design-technical` |

Text-in-image rendered below 2K is frequently garbled; if the user
wants readable text in the image, default to 2K+ and
`--thinking high`.

## 4. Iteration verbs

Map user intent → CLI action:

| User says | CLI action |
|---|---|
| "try again" / "one more try" | Rerun the same command (new `--seed` or unset). |
| "go back to v1" / "use the first one" | `--history-parent <id-of-v1>` + same prompt; parent links but does not replay. |
| "make it bluer" / "adjust X" | `--history-continue <id>` + short delta prompt. |
| "apply this style to my photo" | Edit mode: `--image <photo> --style <slug>`. |
| "remove the background" / "change the sky" | Edit mode: `--image <src> --region "<description>"`. |
| "show me 3 variants" | Run the CLI 3× with different `--seed`. |

History ids come from `.nanogen-history.jsonl` in the caller's cwd
(one JSONL row per successful or refused invocation).
`--history-continue` is exactly one turn deep; longer chains happen
by continuing from the newly-created row.

## 5. Refusal recovery

On exit 1 with `code=E_REFUSED` or `code=E_CONTENT_POLICY`:

- **Do NOT retry the same prompt.** The model already declined;
  identical text will decline again.
- **Rephrase away from the flagged concept.** Common triggers:
  named real people, violent subjects, copyrighted characters,
  real public figures, minors in sensitive contexts.
- **Tell the user what you changed and why.** Transparency matters
  — don't silently swap in a watered-down prompt.

Mixed `IMAGE+TEXT` output is sometimes returned as a pure-text
refusal even when the user expects pixels; same recovery applies.

## 6. Error code reference

One-line recovery hints. Longer root-cause paragraphs live in
`reference.md`. Grouped by category.

### Arg validation

| Code | Recovery |
|---|---|
| `E_MISSING_OUTPUT` | Add `--output <path>`. |
| `E_MISSING_PROMPT_OR_IMAGE` | Add `--prompt "..."` or `--image <path>`. |
| `E_EDIT_NEEDS_INSTRUCTION` | With `--image`, add `--prompt` or `--region`. |
| `E_BAD_OUTPUT_EXT` | Use `.png`, `.jpg`, `.jpeg`, or `.webp`. |
| `E_UNKNOWN_MODEL` | Pick `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`, or `gemini-2.5-flash-image`. |
| `E_BAD_ASPECT` | Use one of the 14 valid ratios (`1:1`, `16:9`, `4:3`, `3:4`, `2:3`, `3:2`, `4:5`, `5:4`, `9:16`, `21:9`, `1:4`, `4:1`, `1:8`, `8:1`). |
| `E_BAD_SIZE` | Use `512`, `1K`, `2K`, or `4K` (uppercase `K`). |
| `E_SIZE_MODEL_MISMATCH` | `512` is flash-3.1 only; drop `--size 512` or switch model. |
| `E_BAD_THINKING` | Use `low`, `medium`, `high`, or `minimal`. |
| `E_THINKING_MODEL_MISMATCH` | `minimal` is flash-3.1 only. |
| `E_BAD_SEED` | `--seed` must be an integer. |
| `E_BAD_TEMP` | `--temperature` must be a finite number. |
| `E_BAD_SAFETY_CAT` | See the valid `HARM_CATEGORY_*` list in `reference.md`. |
| `E_BAD_SAFETY_THRESHOLD` | Use `OFF`, `BLOCK_NONE`, `BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE`, or `BLOCK_LOW_AND_ABOVE`. |
| `E_IMAGE_NOT_FOUND` | Check the `--image` path. |
| `E_BAD_IMAGE_EXT` | Input must be `.png`, `.jpg`, `.jpeg`, or `.webp`. |
| `E_IMAGE_EMPTY` | The image file is zero bytes — replace it. |
| `E_IMAGE_TOO_LARGE` | Max 15 MB per input image. |
| `E_IMAGE_MIME_MISMATCH` | File magic bytes disagree with extension — rename or re-export. |
| `E_TOO_MANY_IMAGES` | Max 14 `--image` references per invocation. |
| `E_UNKNOWN_FLAG` | Check the help output (`--help`) for valid flags. |
| `E_UNKNOWN_STYLE` | Slug not in `styles.json`; see `reference.md` for the 72 slugs. |
| `E_REGION_WITHOUT_IMAGE` | `--region` requires `--image`. |

### Env

| Code | Recovery |
|---|---|
| `E_NODE_TOO_OLD` | Upgrade Node to >= 20.12. |
| `E_MISSING_API_KEY` | `export GEMINI_API_KEY=...` — see the setup doc. |
| `E_BAD_STYLES_CATALOG` | `styles.json` failed schema validation — reinstall the skill. |
| `E_STYLE_AUTHOR_POLICY` | A preset contains a trademarked-artist token — reinstall a clean catalog. |

### Continuation

| Code | Recovery |
|---|---|
| `E_CONTINUE_UNKNOWN_ID` | Id not in `.nanogen-history.jsonl`; `tail -1` the file for a valid id. |
| `E_CONTINUE_NO_SIGNATURE` | Prior entry has no `thoughtSignature` (legacy row or non-Gemini-3 model) — re-generate fresh and continue from that. |
| `E_CONTINUE_REFUSED_ENTRY` | The prior entry was refused; there is nothing to continue. Generate a successful turn first. |
| `E_CONTINUE_MISSING_OUTPUT` | Prior output file was deleted; re-run the prior turn, then continue from the fresh id. |
| `E_CONTINUE_UNKNOWN_MIME` | Prior output bytes are unrecognizable; re-generate the prior turn. |
| `E_CONTINUE_WITH_PARENT` | Don't combine `--history-continue` with `--history-parent`; continuation implies a parent already. |

### HTTP

| Code | Recovery |
|---|---|
| `E_CONTENT_POLICY` | Prompt blocked server-side — rephrase away from flagged concepts. |
| `E_BAD_REQUEST` | Malformed request; check the stderr detail. |
| `E_BAD_REQUEST_IMAGE` | Image too big or wrong size for the model; resize. |
| `E_AUTH` | Bad key (401) — regenerate at https://aistudio.google.com/app/apikey. |
| `E_ADMIN_DISABLED` | Google Workspace admin has disabled image gen — ask IT or use a personal Google account. |
| `E_REGION` | API not available in the caller's region. |
| `E_FORBIDDEN` | Generic 403; read the stderr detail. |
| `E_MODEL_NOT_FOUND` | 404 on the model id — check `--model` spelling. |
| `E_RATE_LIMIT` | 429 after retries — wait or upgrade tier. |
| `E_UPSTREAM_5XX` | Google had a 5xx after retries — try again later. |
| `E_UNEXPECTED_HTTP` | Unexpected status or parse failure; see stderr for detail. |
| `E_REFUSED` | Soft refusal from the model — rephrase; do not retry verbatim. |

## 7. Multi-turn editing (`--history-continue`)

Use `--history-continue <id>` to iteratively refine a prior
generation. The CLI round-trips the prior entry's
`thoughtSignature` automatically — **this signature must be
byte-for-byte identical** to what Gemini returned last time, or
the API rejects the follow-up with a 400. nanogen handles this
correctly; do not try to reconstruct the signature by hand.

`--history-continue` vs `--history-parent`:

- `--history-continue <id>` sends a full two-turn conversation
  (prior user prompt + prior model output + your new prompt). The
  model can directly refine its prior image.
- `--history-parent <id>` is a **metadata link only** — the prior
  row is not replayed; it just records that this generation is a
  child of the parent row for history bookkeeping.

Continuation is exactly one step deep. For longer chains, continue
from the newly-created row each turn.

If the prior row was generated with a different `--model`, nanogen
will warn on stderr and continue anyway. Gemini may 400 on format
mismatch — if it does, re-run with the original model.

## 8. Cost awareness

| Model | Size | $/image |
|---|---|---|
| `gemini-3-pro-image-preview` | 1K / 2K | $0.134 |
| `gemini-3-pro-image-preview` | 4K | $0.24 |
| `gemini-3.1-flash-image-preview` | 512 | $0.022 |
| `gemini-3.1-flash-image-preview` | 1K | $0.034 |
| `gemini-3.1-flash-image-preview` | 2K | $0.050 |
| `gemini-3.1-flash-image-preview` | 4K | $0.076 |

Rule of thumb: 10 images at pro-4K is ≈ $2.40. Favor flash-3.1 at
1K for iteration; escalate to pro for finals or text-heavy output.

## 9. SynthID

Every image produced by the Gemini image API carries an invisible
Google **SynthID** watermark embedded in the pixel data. This is
NOT the visible logo overlay that the consumer Gemini app adds —
API outputs have no visible overlay. The watermark identifies
images as Gemini-generated and cannot be disabled through the CLI.
It survives light editing but can be degraded by aggressive
re-encoding. Assume any image produced via this skill is
identifiable as AI-generated.

## 10. Troubleshooting pointers

When things go wrong, consult the matching section in
`reference.md`:

- **Text in the image is garbled.** `reference.md` → "Known
  gotchas" — upgrade to 2K+ with `--thinking high`.
- **Model switching mid-conversation 400s.** `reference.md` →
  "Pinned stderr-warning strings" (the model-mismatch warning) +
  "Known gotchas" (thoughtSignature is per-model).
- **The image has white bars / was centered in a non-square
  canvas.** `reference.md` → "Aspect ratio guidance".
- **Region edit did the wrong part of the image.**
  `reference.md` → Asset templates / region phrasing tips; Gemini
  has no bitmap mask, so prose must be spatially unambiguous.
- **Refusals that feel over-broad.** `reference.md` → "Error code
  reference" (E_REFUSED / E_CONTENT_POLICY root causes).
