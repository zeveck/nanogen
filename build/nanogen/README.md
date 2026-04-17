# nanogen

Zero-dependency Node.js CLI for generating images via Google's Gemini
Nano Banana models. Implements the `/nanogen` skill's core generation
path (CLI core, style catalog, HTTP with retry, JSONL history).
See [`plans/SUB_1_CLI_CORE.md`](../../plans/SUB_1_CLI_CORE.md) for the
authoritative spec. User-facing `SKILL.md` / `reference.md` land with
sub-plan 3.

Requires **Node.js >= 20.12** (`process.loadEnvFile` and
`AbortSignal.timeout` are both used).

## Usage

    node build/nanogen/generate.cjs \
        --prompt "a red apple on a marble table" \
        --output apple.png

Before running set your API key:

    export GEMINI_API_KEY=... # get one at https://aistudio.google.com/app/apikey

## CLI flags

| Flag | Type | Default | Notes |
|------|------|---------|-------|
| `--prompt <str>` | string | — | Required. |
| `--output <path>` | string | — | Required. Ext in `{.png,.jpg,.jpeg,.webp}`. Parent dirs auto-created. |
| `--model <id>` | string | `gemini-3.1-flash-image-preview` | One of `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`, `gemini-2.5-flash-image`. |
| `--aspect <r>` | string | `1:1` | 14 valid ratios: `1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9, 1:4, 4:1, 1:8, 8:1`. |
| `--size <l>` | string | `1K` | One of `512, 1K, 2K, 4K`. **Uppercase K required.** `512` is flash-3.1 only. |
| `--thinking <lvl>` | string | *(omitted → API default)* | One of `low, medium, high, minimal`. `minimal` is flash-3.1 only. |
| `--seed <int>` | int | — | Integer seed. |
| `--temperature <f>` | float | — | Finite float. |
| `--style <slug>` | string (repeatable) | — | Preset from `styles.json` (72 presets × 10 categories). |
| `--negative <str>` | string (repeatable) | — | Joined with `; ` and appended as ` Avoid: …`. |
| `--safety <cat=thr>` | string (repeatable) | — | Case-insensitive. Duplicates → last wins + warning. |
| `--image <path>` | string (repeatable, max 14) | — | Ext in `{.png,.jpg,.jpeg,.webp}`, non-empty, <= 15 MB raw, magic bytes match declared extension. |
| `--history-id <str>` | string | auto | Override auto-derived id (see History below). |
| `--history-parent <str>` | string | — | Links this generation to a previous entry. Unknown id → warning (no failure). |
| `--no-history` | flag | false | Skip `.nanogen-history.jsonl` append. |
| `--dry-run` | flag | false | Print would-be request body as JSON and exit 0. Does NOT require a key. |
| `--help, -h` | flag | — | Print help and exit 0. |

## Output contract

Every invocation writes **exactly one JSON line** to stdout:

- Success: `{"success":true,"output":"...","historyId":"...","bytes":N,"model":"...","aspectRatio":"...","imageSize":"...","refusalReason":null}`
- Refusal: `{"success":false,"code":"E_REFUSED","error":"<reason>","refusalDetails":{...}}`
- Validation / transport error: `{"success":false,"code":"E_...","error":"..."}`

`--help` is the sole exception (free-form text, exit 0).

When a history-write fails (EACCES/EROFS), the success JSON additionally
carries `historyWarning: "<detail>"` — the invocation still succeeds.

## History

Successful or refused invocations append one line to
`.nanogen-history.jsonl` in the **caller's cwd** unless `--no-history` is
set. The tolerant reader (`readHistory()`) silently skips malformed
lines so concurrent interleaves cannot corrupt the log.

Schema (success):

    {
      "id": "apple-deadbeef",
      "timestamp": "2026-04-17T14:00:00.000Z",
      "prompt": "<composed prompt — what was actually sent>",
      "output": "apple.png",
      "params": {
        "model": "gemini-3.1-flash-image-preview",
        "aspectRatio": "1:1",
        "imageSize": "1K",
        "thinkingLevel": null,
        "seed": null,
        "temperature": null,
        "styles": []
      },
      "parentId": null,
      "bytes": 12345,
      "outputFormat": "png",          // from actual API MIME, not extension
      "outputExtension": "png",       // from --output path
      "refusalReason": null,
      "thoughtSignature": null        // round-tripped across turns in sub-plan 2
      // "inputImages": [...]         // present only when --image given
    }

Refusal rows have `refusalReason: "finish:SAFETY" | "soft-refusal:no-image" | ...`,
`bytes: 0`, `outputFormat: null`, and NO output file is written.

**ID derivation:** `--history-id` wins verbatim. Otherwise
`slug(output-without-ext) + "-" + sha1(absolutePath(output)).slice(0,8)`.
The sha-8 suffix prevents collisions when two different paths slugify
to the same string.

**Ext-vs-MIME mismatch:** if the API returns a different format than
`--output`'s extension implies, the bytes are written as-is and a
pinned warning is emitted to stderr:

    nanogen: output extension ".png" but API returned image/jpeg; bytes written as-is.

## Environment variables

### Required

| Var | Purpose |
|-----|---------|
| `GEMINI_API_KEY` | **Preferred.** The official Gemini key env var. |
| `GOOGLE_API_KEY` | Fallback. Using it emits a stderr warning. |

**Precedence note (deviates from the Google SDK):** nanogen prefers
`GEMINI_API_KEY` over `GOOGLE_API_KEY`. The Google SDK does the inverse.
Rationale: Gemini is the brand and the official docs tell users to set
`GEMINI_API_KEY`. If both are set, `GEMINI_API_KEY` wins.

Keys may also be written to a `.env` file. Nanogen walks upward from
`cwd` first, then from `__dirname`, and uses the first `.env` it finds
that declares either key. The reader is a hand-rolled parser — we do
NOT call `process.loadEnvFile`, which (a) throws on missing files and
(b) does not overwrite an already-set empty value (common CI failure
mode: `GEMINI_API_KEY=""` blocks `.env` from supplying a real value).

### Testing / env overrides (not in `--help`)

| Var | Purpose |
|-----|---------|
| `NANOGEN_API_BASE` | Override the Gemini API base URL. Tests point at an in-process mock (`http://127.0.0.1:<port>`). |
| `NANOGEN_RETRY_BASE_MS` | Base exponential-backoff delay in ms. Default 1000. Tests set 5 so the full retry ladder completes in ~35 ms. |
| `NANOGEN_FETCH_TIMEOUT_MS` | Per-attempt fetch timeout in ms. Default 120000. |
| `NANOGEN_MAX_RETRIES` | Retry count. Default 3 (→ 4 total attempts). |
| `NANOGEN_STYLES_PATH` | Alternate path to a `styles.json` catalog. Default: `build/nanogen/styles.json`. |

These are documented here, not in `--help`, so user-facing help text
stays focused.

## Tests

From `build/nanogen/`:

    npm test

Runs all 9 test files (parse_args, styles, request_builder,
response_parser, http_retry, env, history, integration,
edit_multi_image). All tests run offline — the HTTP suites use an
in-process `node:http` mock server on `127.0.0.1`. Zero outbound
requests during `npm test`.

## Edit mode

Nanogen accepts up to **14** `--image` references per invocation. The
first `--image` is the primary subject; subsequent images are style or
composition references. Command-line order is preserved in the request
body (`parts[1..N]` of `contents[0].parts`).

    # Single-image edit with an explicit instruction
    nanogen --image orig.png --prompt "add a rainbow" --output rainbow.png

    # Multi-image composition (ordering matters — first is primary subject)
    nanogen --image subject.png --image style-ref.png \
            --prompt "apply the palette from the second image to the first" \
            --output styled.png

### `--region` (natural-language region guidance)

`--region <description>` is repeatable and describes where in the image
the edit should occur. It is **prose only** — Gemini has no bitmap mask
parameter. `--region "the upper-left quadrant"` usually works;
`--region "pixels 400-600 on X axis"` will not.

    # Region edit without an explicit prompt (boilerplate base)
    nanogen --image cat.png --region "replace the background with a beach" \
            --output cat-beach.png

When `--image` is given, `--prompt` becomes optional **if** `--region`
is supplied. In that case the composed base text is the pinned string
`"Edit the provided image(s)."`, followed by ` Region: <joined with "; ">.`.

### Prompt composition order

The composed prompt text is assembled deterministically:

1. **Base.** Either `--prompt` verbatim, or (in edit-mode-no-prompt-with-region)
   the pinned `"Edit the provided image(s)."` boilerplate.
2. **Style** — ` Style: <frags joined by space>.` when `--style` is set.
3. **Region** — ` Region: <regions joined by "; ">.` when `--region` is set.
4. **Avoid** — ` Avoid: <negatives joined by "; ">.` when `--negative` is set.

This order is pinned by golden tests; any refactor that reorders the
suffix composition breaks `tests/test_edit_multi_image.cjs` loudly.

### Edit-mode validation codes

| Code | Meaning |
|------|---------|
| `E_REGION_WITHOUT_IMAGE` | `--region` set but no `--image` given. |
| `E_EDIT_NEEDS_INSTRUCTION` | `--image` set but no `--prompt` and no `--region`. |

Sub-plan 1's `E_MISSING_PROMPT_OR_IMAGE` still fires when BOTH
`--prompt` AND `--image` are absent — the code name was chosen
forward-compatibly so no rename is needed.

`--history-continue` (multi-turn continuation) lands with sub-plan 2
Phase 2; it is not yet wired.
