# /nanogen — Examples

Worked examples for every feature, with both the raw CLI form and the
Claude-Code `/nanogen` form where applicable. Assumes `GEMINI_API_KEY` is
set in `/workspaces/nanogen/.env` — see
[`reports/nanogen-api-key-setup.md`](../reports/nanogen-api-key-setup.md).

CLI path is abbreviated as `nanogen` below; the real invocation is
`node .claude/skills/nanogen/generate.cjs` (same for all examples).

Cost column is per-call at the defaults unless noted. Prices are April
2026 rates; see [`reference.md`](../.claude/skills/nanogen/reference.md)
for the full pricing table.

---

## Contents

1. [Text-to-image (generate mode)](#1-text-to-image-generate-mode)
2. [Styles from the built-in catalog](#2-styles-from-the-built-in-catalog)
3. [Aspect ratios and sizes](#3-aspect-ratios-and-sizes)
4. [Seed + temperature for reproducibility / variation](#4-seed--temperature-for-reproducibility--variation)
5. [Thinking levels (quality knob)](#5-thinking-levels-quality-knob)
6. [Negative prompts — things to avoid](#6-negative-prompts--things-to-avoid)
7. [Safety thresholds](#7-safety-thresholds)
8. [Picking a model (Flash vs Pro)](#8-picking-a-model-flash-vs-pro)
9. [Text rendered inside images](#9-text-rendered-inside-images)
10. [Edit mode — `--region` for natural-language inpainting](#10-edit-mode----region-for-natural-language-inpainting)
11. [Edit mode — object replacement](#11-edit-mode--object-replacement)
12. [Edit mode — style transfer](#12-edit-mode--style-transfer)
13. [Edit mode — background replacement](#13-edit-mode--background-replacement)
14. [Multi-image composition](#14-multi-image-composition)
15. [Multi-turn continuation via `--history-continue`](#15-multi-turn-continuation-via---history-continue)
16. [Iterating without continuation — `--history-parent`](#16-iterating-without-continuation----history-parent)
17. [Skipping history — `--no-history`](#17-skipping-history----no-history)
18. [Custom history IDs — `--history-id`](#18-custom-history-ids----history-id)
19. [Preview requests without spending — `--dry-run`](#19-preview-requests-without-spending----dry-run)
20. [Getting help — `--help`](#20-getting-help----help)
21. [Via Claude Code — `/nanogen`](#21-via-claude-code--nanogen)

---

## 1. Text-to-image (generate mode)

The simplest flow: text in, image out. No styles, no edits.

```bash
nanogen --prompt "a single red apple on a white marble table" \
        --output apple.png
```

| | |
|---|---|
| Default model | `gemini-3.1-flash-image-preview` |
| Default aspect | `1:1` |
| Default size | `1K` |
| Cost | $0.034 |

**What you get back** (on stdout): one JSON line.

```json
{"success":true,"output":"apple.png","historyId":"apple-f9c4a2b1","bytes":469308,"model":"gemini-3.1-flash-image-preview","aspectRatio":"1:1","imageSize":"1K","refusalReason":null}
```

**What's on disk:** `apple.png` plus an append to
`./.nanogen-history.jsonl`. The history id (`apple-f9c4a2b1`) is the
key you'd use for `--history-continue` later.

---

## 2. Styles from the built-in catalog

72 presets across 10 categories. Slugs are stable identifiers —
`pixel-16bit`, `watercolor`, `fft-yoshida`, `cyanotype`, etc. List them
with:

```bash
node -e 'const s=require("./.claude/skills/nanogen/styles.json"); for (const x of s) console.log(x.category.padEnd(22), x.slug)'
```

Single style:

```bash
nanogen --prompt "a knight drawing a sword" \
        --style pixel-16bit --output knight.png
```

Multiple styles (rarely needed; easy to muddy the output):

```bash
nanogen --prompt "a lighthouse on a cliff at dusk" \
        --style watercolor --style film-grain-35mm \
        --output lighthouse.png
```

Unknown slug → `E_UNKNOWN_STYLE`.

---

## 3. Aspect ratios and sizes

14 supported ratios: `1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9,
21:9, 1:4, 4:1, 1:8, 8:1`. 4 sizes: `512, 1K, 2K, 4K`. **Size strings
are case-sensitive — `"1K"` works, `"1k"` is rejected with
`E_BAD_SIZE`.**

Landscape 16:9 hero image at 2K:

```bash
nanogen --prompt "a misty mountain range at sunrise" \
        --aspect 16:9 --size 2K \
        --output hero.png
```

Tall 9:16 for a phone wallpaper:

```bash
nanogen --prompt "a neon-lit Tokyo street scene, rainy night" \
        --aspect 9:16 --size 2K \
        --output wallpaper.png
```

Cheapest usable size (Flash-only):

```bash
nanogen --prompt "a stylised coffee mug icon" \
        --size 512 --output icon.png
```

| Size | Flash $/image | Pro $/image | Notes |
|---|---|---|---|
| `512` | $0.022 | (not supported) | Cheapest; Flash only |
| `1K` | $0.034 | $0.134 | Default |
| `2K` | $0.050 | $0.134 | Text-in-image works here |
| `4K` | $0.076 | $0.24 | Biggest; use for wall art / prints |

---

## 4. Seed + temperature for reproducibility / variation

Same seed → similar (though not byte-identical) outputs across calls.
Useful for A/B'ing prompt tweaks without starting from a new creative.

```bash
nanogen --prompt "a brass pocket watch on a velvet cloth" \
        --seed 42 --output watch-v1.png

# same prompt + seed → close to the same composition
nanogen --prompt "a brass pocket watch on a velvet cloth" \
        --seed 42 --output watch-v2.png
```

Temperature widens creative variance. Defaults work for most cases;
drop toward `0.2` for tight briefs, push toward `1.2` for surreal.

```bash
nanogen --prompt "a castle in the clouds" \
        --temperature 1.1 --output dreamy.png
```

For generating N distinct variants of the same prompt, use N different
seeds in parallel rather than relying on temperature:

```bash
for s in 101 202 303; do
  nanogen --prompt "an art-deco poster for a coffee shop" \
          --seed $s --output "poster-$s.png" &
done; wait
```

---

## 5. Thinking levels (quality knob)

`--thinking low|medium|high|minimal`. Higher = slower + more expensive
(Gemini bills thinking tokens separately) but better at tricky layouts
and legible text-in-image. `minimal` is Flash-only.

```bash
# Default (thinking unset) — no thinkingConfig sent; API picks
nanogen --prompt "a cozy cabin in winter" --output cabin.png

# Explicit high — good for text or complex scenes
nanogen --prompt "a vintage travel poster for Kyoto reading 'KYOTO 1952'" \
        --thinking high --size 2K \
        --output kyoto.png

# Flash-only minimal — fastest/cheapest; simple prompts only
nanogen --prompt "a red dot on a white background" \
        --thinking minimal --size 512 \
        --output dot.png
```

Cross-model rules the validator enforces:
- `--thinking minimal` requires a Flash model
- `--size 512` requires `gemini-3.1-flash-image-preview`

---

## 6. Negative prompts — things to avoid

Gemini has no first-class `negativePrompt` field; we fold it into the
composed prompt as `" Avoid: <joined>."`.

```bash
nanogen --prompt "a portrait of a person in a red coat" \
        --negative "text" --negative "watermarks" --negative "extra limbs" \
        --output portrait.png
```

Repeat the flag per item; the builder joins them with `"; "`. The
final prompt text stored in history is the composed form —
introspectable:

```bash
node -e 'const last=require("fs").readFileSync(".nanogen-history.jsonl","utf8").trim().split("\n").pop(); console.log(JSON.parse(last).prompt)'
# → "a portrait of a person in a red coat Avoid: text; watermarks; extra limbs."
```

---

## 7. Safety thresholds

Gemini's safety settings default to `OFF` for most categories in 2026;
pass `--safety` to raise or lower specifically.

```bash
# Block more aggressively on a single category
nanogen --prompt "a dramatic battle scene" \
        --safety HARM_CATEGORY_DANGEROUS_CONTENT=BLOCK_MEDIUM_AND_ABOVE \
        --output battle.png

# Short aliases are case-insensitive
nanogen --prompt "..." --safety hate=block_only_high --output out.png

# Multiple categories — one flag each
nanogen --prompt "..." \
        --safety harassment=OFF \
        --safety dangerous=BLOCK_LOW_AND_ABOVE \
        --output out.png
```

Valid categories: `HARASSMENT`, `HATE_SPEECH`, `SEXUALLY_EXPLICIT`,
`DANGEROUS_CONTENT`, `CIVIC_INTEGRITY` (with or without the
`HARM_CATEGORY_` prefix). Valid thresholds: `OFF`, `BLOCK_NONE`,
`BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_LOW_AND_ABOVE`.

Duplicate category → last wins; stderr warning fires once.

---

## 8. Picking a model (Flash vs Pro)

| Model ID | Tier | Use when |
|---|---|---|
| `gemini-3.1-flash-image-preview` | Flash (default) | General gen + edit, iterative work, most prompts |
| `gemini-3-pro-image-preview` | Pro | Text-in-image, 4K output, complex multi-object scenes, reliability matters |
| `gemini-2.5-flash-image` | GA legacy | Budget fallback ONLY. **Shutdown 2026-10-02.** Avoid for new work. |

```bash
# Pro at 4K for a wall print
nanogen --prompt "a minimalist geometric pattern in navy and gold" \
        --model gemini-3-pro-image-preview --size 4K --aspect 3:2 \
        --output print.png

# Budget fallback (will stop working in October)
nanogen --prompt "..." \
        --model gemini-2.5-flash-image --size 1K \
        --output cheap.png
```

Unknown model → `E_UNKNOWN_MODEL` (fails fast rather than 404'ing at
Gemini).

---

## 9. Text rendered inside images

Gemini models are notoriously hit-or-miss at text rendering. Rule of
thumb that works: **Pro model + 2K minimum + `--thinking high` + quote
the literal string in the prompt.**

```bash
nanogen --prompt "a vintage French coffee-shop chalkboard sign reading 'CAFÉ DU MATIN — OUVERT'" \
        --model gemini-3-pro-image-preview \
        --size 2K --thinking high \
        --output sign.png
```

Even so, expect 1 in 3 outputs to mangle something. For production-
critical text, use a design tool; the models are best at evocative
text-ish shapes, not editorial copy.

---

## 10. Edit mode — `--region` for natural-language inpainting

Passing `--image <path>` switches to edit mode. `--region <desc>`
describes the area to change in plain language; there's no bitmap
mask.

```bash
nanogen --image apple.png \
        --region "change the apple from red to bright green" \
        --output apple-green.png
```

Edit mode relaxations vs generate mode:
- `--prompt` is optional if `--region` is provided (boilerplate text
  `"Edit the provided image(s)."` fills in).
- But you need SOMETHING to do — `--image` with no `--prompt` AND no
  `--region` errors with `E_EDIT_NEEDS_INSTRUCTION`.

Prompt + region together:

```bash
nanogen --image kitchen.png \
        --prompt "keep the existing composition and lighting" \
        --region "replace the fruit bowl with a potted basil plant" \
        --output kitchen-herbs.png
```

---

## 11. Edit mode — object replacement

Same as §10 but with a replacement instruction. Gemini handles pose /
framing preservation surprisingly well when you describe the constraint
explicitly.

```bash
# Change the weapon
nanogen --image knight.jpg \
        --region "replace the sword with a heavy battle axe, same pose and hand position" \
        --output knight-axe.jpg

# Change an element while keeping the scene
nanogen --image cafe.png \
        --region "change the customer's red mug to a blue teapot" \
        --output cafe-tea.png
```

Tip: naming the *preservation constraint* ("same pose", "same
lighting", "same composition") inside `--region` reduces drift.

---

## 12. Edit mode — style transfer

Combine `--image` with a `--prompt` that asks for a restyle. Optionally
layer a catalog style on top.

```bash
# Free-form: a photograph rendered as 16-bit pixel art
nanogen --image photo.jpg \
        --prompt "convert this to 16-bit SNES-era pixel art, preserve composition and pose" \
        --style pixel-16bit \
        --output photo-16bit.png

# Free-form: a colour photo as a pencil sketch
nanogen --image cityscape.png \
        --prompt "rerender as a graphite pencil sketch, cross-hatched shading" \
        --style pencil-sketch \
        --output cityscape-sketch.png

# Catalog-only, no explicit instruction: terser prompt via boilerplate
nanogen --image portrait.jpg \
        --region "apply the style to the full image" \
        --style watercolor \
        --output portrait-wc.png
```

---

## 13. Edit mode — background replacement

A common special case of region-based edit.

```bash
nanogen --image dog.jpg \
        --region "replace the background with a seaside cliff at golden hour, keep the dog exactly as-is" \
        --output dog-cliff.jpg
```

Explicit "keep the [subject] exactly as-is" helps Gemini preserve the
subject; without it, the model sometimes recomposes.

---

## 14. Multi-image composition

Up to **14** `--image` flags per call. Order matters: the FIRST image
is treated as the primary subject; subsequent images are references
(style, palette, lighting).

```bash
# Apply one image's style to another
nanogen --image portrait.jpg --image art-ref.png \
        --prompt "apply the palette and brushwork of the second image to the first" \
        --output portrait-styled.png

# Composite multiple assets into a scene
nanogen --image character.png --image weapon.png --image armour.png \
        --prompt "compose a full-body character illustration using all three reference images" \
        --output composed.png
```

Model limits: Flash 3.1 allows up to 10 objects + 4 characters across
refs; Pro allows 6+5. >14 total triggers `E_TOO_MANY_IMAGES` in the
CLI; per-model caps are enforced by the API and may surface as
`E_BAD_REQUEST_IMAGE`.

---

## 15. Multi-turn continuation via `--history-continue`

The critical Gemini 3 capability: the model reuses its prior
`thoughtSignature` so follow-up edits stay in-context.

```bash
# Turn 1 — generate
nanogen --prompt "a cozy mountain cabin at dusk" \
        --output cabin-v1.png
# → historyId e.g. "cabin-v1-7a3c9e02"

# Turn 2 — continue that conversation
nanogen --history-continue cabin-v1-7a3c9e02 \
        --prompt "add a wisp of smoke from the chimney" \
        --output cabin-v2.png

# Turn 3 — keep going from v2
nanogen --history-continue cabin-v2-<suffix> \
        --prompt "add a warm glow to the windows" \
        --output cabin-v3.png
```

Gotchas:
- `--history-continue` requires an entry with a non-null
  `thoughtSignature` → `E_CONTINUE_NO_SIGNATURE` on legacy rows or
  non-Gemini-3 models.
- If the prior output file was deleted from disk → `E_CONTINUE_MISSING_OUTPUT`.
- The prior entry's model and the current `--model` should match, or
  the API may 400 on signature format. The CLI emits a stderr warning
  if you mismatch.
- A refused prior turn → `E_CONTINUE_REFUSED_ENTRY` (can't continue
  from nothing).
- `--history-continue` + `--history-parent` both set →
  `E_CONTINUE_WITH_PARENT` (mutually exclusive — continuation IS a
  parent relationship).

### Region on a continuation

You can use `--region` inside a continuation too:

```bash
nanogen --history-continue cabin-v1-7a3c9e02 \
        --region "add falling snow but don't touch the cabin itself" \
        --output cabin-snow.png
```

### Chain depth

We support N turns by chaining invocations (each continues from the
prior). In a SINGLE invocation we send exactly 2 turns (user-prompt,
model-response, user-prompt) — extending to N-turn single-invocation
chains is future work.

---

## 16. Iterating without continuation — `--history-parent`

`--history-parent <id>` is a **metadata-only** link: records "this
output is descended from that id" in history, but does NOT round-trip
a thoughtSignature. Useful for branching:

```bash
# Generate v1
nanogen --prompt "a knight drawing a sword" --output knight-v1.png
# → historyId "knight-v1-abc12345"

# Branch A — different style, tagged as descended from v1
nanogen --prompt "a knight drawing a sword, more dramatic lighting" \
        --history-parent knight-v1-abc12345 \
        --output knight-v1a.png

# Branch B — different composition, also tagged
nanogen --prompt "a knight drawing a sword, low-angle shot" \
        --history-parent knight-v1-abc12345 \
        --output knight-v1b.png
```

Each branch call is a fresh generation — no continuation, different
seed/composition — but `parentId` in history lets you grep a lineage.

Stderr warns on unknown parent id (doesn't fail):

```text
nanogen: --history-parent "knight-v1-typo" not found in .nanogen-history.jsonl; continuing anyway.
```

---

## 17. Skipping history — `--no-history`

Don't append to `.nanogen-history.jsonl`. Useful for one-offs,
CI jobs, or keeping the history file focused.

```bash
nanogen --prompt "disposable thumbnail" \
        --no-history --output thumb.png
```

The output file is still written; only the JSONL append is skipped.

---

## 18. Custom history IDs — `--history-id`

Override the auto-derived id (which is
`<slug-of-output>-<sha8-of-abspath>`):

```bash
nanogen --prompt "campaign hero image v3" \
        --history-id campaign-hero-v3 \
        --output out.png
```

Custom ids are useful for short memorable handles when you know you'll
continue from them.

---

## 19. Preview requests without spending — `--dry-run`

Print the exact HTTP request body the CLI would send, redact the key,
and exit 0. No API call.

```bash
nanogen --prompt "test" --output /tmp/x.png --dry-run
```

Output (one JSON line, pretty-printed here):

```json
{
  "dryRun": true,
  "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
  "headers": {
    "x-goog-api-key": "<redacted>",
    "Content-Type": "application/json"
  },
  "body": { "contents": [{"parts": [{"text": "test"}]}], "generationConfig": {...} }
}
```

Dry-run works with empty `GEMINI_API_KEY` — useful for smoke-testing
installs.

---

## 20. Getting help — `--help`

Prints the flag table and a short example. Only stdout-not-JSON case.

```bash
nanogen --help
```

---

## 21. Via Claude Code — `/nanogen`

The raw CLI gives you total control; the `/nanogen` skill gives you
the agent layer that picks styles, infers asset-type defaults, and
maps natural iteration language to the right flags.

```text
/nanogen a cozy mountain cabin in late afternoon light
```

Claude reads the installed `SKILL.md` + `reference.md`, picks a style
from the 10-category catalog (probably `digital-painting-concept` or
`watercolor` for this prompt), picks an aspect (probably 16:9 for a
scene), runs the CLI, reports back with the file path.

Explicit style override:

```text
/nanogen --style pixel-16bit a knight drawing a sword
```

Edit mode:

```text
/nanogen edit /tmp/cabin.png: add snow on the roof
```

Claude resolves "cabin.png", invokes with
`--image /tmp/cabin.png --region "add snow on the roof"`.

Iteration verbs:

| You say | Claude does |
|---|---|
| "try again" / "one more try" | rerun with a new seed (or unset) |
| "go back to v1" | `--history-parent <v1-id>` + same prompt |
| "make it bluer" / "adjust X" | `--history-continue <id>` + delta prompt |
| "apply this style to my photo" | edit mode: `--image <photo> --style <slug>` |
| "remove the background" / "change the sky" | edit mode: `--image <src> --region "<desc>"` |
| "show me 3 variants" | CLI × 3 with different `--seed` |

If Claude's choice is wrong, override with explicit flags in the
prompt: `/nanogen --aspect 21:9 --size 4K a cinematic panorama of ...`.
Everything after the `--flag value` pairs is treated as the prompt.
