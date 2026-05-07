# nanogen

Generate and edit images via Google's Gemini / Nano Banana models, from
[Claude Code](https://github.com/anthropics/claude-code) or a terminal.
Style presets, natural-language edits, multi-image composition, and
multi-turn refinement. Zero npm deps; just Node 20.12+ and a Gemini API
key.

---

## Choosing a Skill

`nanogen` is one of three sibling image-generation skills. They are not
interchangeable; each one exposes different strengths from its underlying
API.

| Skill | Back end | Good fit | Tradeoffs |
|-------|----------|----------|-----------|
| [`imagegen`](https://github.com/zeveck/imagegen) | OpenAI `gpt-image-1` | Classic game assets, direct transparent PNG/WebP sprites and icons | Older OpenAI image model, legacy size set |
| [`imagegen2`](https://github.com/zeveck/imagegen2) | OpenAI `gpt-image-2` | Current OpenAI image path, flexible sizes up to 4K-class outputs, high-fidelity edits | Transparent PNG sprites should use local chroma-key cleanup; true native alpha requires explicit `gpt-image-1.5` fallback |
| `nanogen` | Google Gemini / Nano Banana image models | Rich style catalog, natural-language edits, multi-image composition, multi-turn refinement | No native alpha output; often returns JPEG and uses chromakey/post-processing for transparent-style assets |

For sprite-sheet animation built on top of `imagegen2`, see
[`anim8gen`](https://github.com/zeveck/anim8gen). For game audio, see
[`audiogen`](https://github.com/zeveck/audiogen).

---

## Requirements

- Node.js 20.12+.
- A Google Gemini API key (free at
  <https://aistudio.google.com/app/apikey>). `GOOGLE_API_KEY` works as a
  fallback.

---

## Gallery

Every image below is paired with the `/nanogen` prompt that produced it.
Type the prompt into Claude Code; the skill handles the rest.

```
/nanogen a misty Scottish highland cliff at sunrise overlooking the sea, dramatic cinematic concept art, 16:9
```

<img src="docs/images/highland-cliff.jpg" alt="misty Scottish highland cliff at sunrise" width="100%">

### Text-to-image

```
/nanogen a single red apple on a white marble table
```

<img src="docs/images/apple.jpg" alt="red apple on a white marble table" width="45%">

```
/nanogen a 16-bit warrior with a huge sword on a white background
```

<img src="docs/images/warrior-16bit.jpg" alt="16-bit pixel art warrior with huge sword" width="33%">

```
/nanogen a medieval knight in silver plate armor in a grassy clearing, holding a straight sword, bright daylight, photorealistic, full body centered pose
```

<img src="docs/images/knight.jpg" alt="photorealistic medieval knight in silver plate armor" width="33%">

Short, casual prompts work too — the skill picks style, aspect, and size
from your phrasing:

```
/nanogen A picture of a cute spider with fuzzy legs and eight eyes. 16-bit. large.
```

<img src="docs/images/cute-spider.jpg" alt="16-bit pixel art cute spider with fuzzy legs and eight eyes" width="45%">

### Same prompt, three styles

Add `--style <slug>` to steer the aesthetic. The catalog has 72 presets
across 10 categories; here's the same lighthouse in three of them.

```
/nanogen --style watercolor a solitary stone lighthouse on a rocky point, crashing waves at its base, an overcast sky, a single gull overhead
```
```
/nanogen --style cyanotype a solitary stone lighthouse on a rocky point, crashing waves at its base, an overcast sky, a single gull overhead
```
```
/nanogen --style art-deco a solitary stone lighthouse on a rocky point, crashing waves at its base, an overcast sky, a single gull overhead
```

| watercolor | cyanotype | art-deco |
|:---:|:---:|:---:|
| <img src="docs/images/lighthouse-watercolor.jpg" width="260"> | <img src="docs/images/lighthouse-cyanotype.jpg" width="260"> | <img src="docs/images/lighthouse-art-deco.jpg" width="260"> |

### Readable text inside an image

Quote the literal string you want rendered.

```
/nanogen a vintage French coffee-shop chalkboard sign reading exactly "CAFÉ DU MATIN — OUVERT" in hand-drawn cursive chalk lettering
```

<img src="docs/images/cafe-sign.jpg" alt="French chalkboard sign reading CAFÉ DU MATIN OUVERT" width="40%">

### Edit — change part of an image

Point at an existing image and describe the change in plain English. No
bitmap mask needed.

```
/nanogen --image apple.jpg change the apple to bright green
```

| Before | After |
|:---:|:---:|
| <img src="docs/images/apple.jpg" width="350"> | <img src="docs/images/apple-green.jpg" width="350"> |

### Edit — replace an object

Same mechanism, bigger transform. Pose, composition, and armor are
preserved.

```
/nanogen --image knight.jpg replace the sword with a heavy battle axe, same pose and hand position
```

| Before | After |
|:---:|:---:|
| <img src="docs/images/knight.jpg" width="350"> | <img src="docs/images/knight-axe.jpg" width="350"> |

### Edit — style transfer

Combine `--image` with a style slug. The composition stays; the
aesthetic is rewritten.

```
/nanogen --image knight.jpg --style pixel-16bit convert this to 16-bit SNES-era pixel art while preserving composition and pose
```

| Before | After |
|:---:|:---:|
| <img src="docs/images/knight.jpg" width="350"> | <img src="docs/images/knight-16bit.jpg" width="350"> |

### Edit — amplify a user-supplied asset

The frog on the left is a user-supplied sprite (not AI-generated). The
frog on the right is what the skill returned.

```
/nanogen --image frog-boss.png an even bigger and meaner version of this frog boss
```

| Input (user asset) | Amplified |
|:---:|:---:|
| <img src="docs/images/frog-boss.png" width="350"> | <img src="docs/images/frog-boss-meaner.jpg" width="350"> |

### Multi-image composition

Pass multiple `--image` references and Gemini composites them into one
scene. The first image is the primary reference.

```
/nanogen --image knight.jpg --image apple.jpg the knight triumphantly holding the red apple overhead
```

| Knight | Apple | Composite |
|:---:|:---:|:---:|
| <img src="docs/images/knight.jpg" width="240"> | <img src="docs/images/apple.jpg" width="240"> | <img src="docs/images/knight-with-apple.jpg" width="240"> |

### Multi-turn refinement

Each follow-up `/nanogen` refines the prior image in place rather than
regenerating from scratch. The skill spots the continuation
automatically — you just keep talking.

```
/nanogen a single red apple on a white marble table
```
```
/nanogen change the apple to bright green
```
```
/nanogen add a stem and a leaf
```

| Turn 1 | Turn 2 | Turn 3 |
|:---:|:---:|:---:|
| <img src="docs/images/apple.jpg" width="240"> | <img src="docs/images/apple-green.jpg" width="240"> | <img src="docs/images/apple-green-leaf.jpg" width="240"> |

---

## Install

You can probably just **ask your agent**: "install the nanogen skill
from `github.com/zeveck/nanogen` into this project." It will follow the
manual steps below.

To do it yourself, drop the skill files into `.claude/skills/nanogen/`:

```bash
mkdir -p .claude/skills/nanogen
cd .claude/skills/nanogen
for f in SKILL.md reference.md generate.cjs styles.json magicBytes.cjs; do
  curl -O "https://raw.githubusercontent.com/zeveck/nanogen/main/.claude/skills/nanogen/$f"
done
```

Confirm:

```bash
node .claude/skills/nanogen/generate.cjs --help
```

---

## Configure

```bash
# Option A — export in your shell
export GEMINI_API_KEY='...'

# Option B — .env at project root (auto-loaded)
echo 'GEMINI_API_KEY=...' > .env
```

Get a key at <https://aistudio.google.com/app/apikey>.

---

## Use

### From Claude Code

The slash command accepts natural language. The skill picks style,
aspect, size, and output path from your phrasing.

```
/nanogen a cozy cabin in a snowy pine forest at dusk
/nanogen --image apple.jpg change the apple to bright green
/nanogen --image knight.jpg --style pixel-16bit convert to 16-bit pixel art
/nanogen --image knight.jpg --image apple.jpg the knight holding the apple overhead
```

Override defaults with `--style`, `--aspect`, `--size`, or `--output`.
Use `--region "<description>"` to scope an edit to part of an image.

### From the shell

`generate.cjs` is a self-contained Node CLI. Same flags, no agent
required:

```bash
node .claude/skills/nanogen/generate.cjs \
  --prompt "a cozy cabin in a snowy pine forest at dusk" \
  --output assets/cabin.jpg

node .claude/skills/nanogen/generate.cjs \
  --prompt "change the apple to bright green" \
  --image apple.jpg \
  --output apple-green.jpg
```

`--dry-run` validates the request without an API call and reports
whether a key would resolve.

---

## Good Fits

- Concept art and reference imagery
- Style exploration across 72 presets in 10 categories
- Natural-language edits to existing images, including regional edits
- Multi-image composition (up to 14 references per call)
- Iterative refinement of a single image across turns

Not a good fit for true transparent PNG sprites (use
[`imagegen`](https://github.com/zeveck/imagegen) for native alpha) or
sprite-sheet animation (see
[`anim8gen`](https://github.com/zeveck/anim8gen)).

---

## Credits

- Shape and spirit borrowed from [zeveck/imagegen](https://github.com/zeveck/imagegen).
- Uses [Google Gemini](https://ai.google.dev/gemini-api/docs/image-generation).
- Built with [Claude Code](https://claude.com/claude-code).

## License

MIT.
