# nanogen

> A Claude Code skill (and standalone CLI) for image generation and
> editing via Google's Nano Banana / Gemini image models.

```
/nanogen a misty Scottish highland cliff at sunrise overlooking the sea, dramatic cinematic concept art, 16:9
```

<img src="docs/images/highland-cliff.jpg" alt="misty Scottish highland cliff at sunrise" width="100%">

Install `/nanogen` into your repo, drop a Gemini API key into `.env`,
and talk to Claude Code in plain English. The skill picks a style
from its 72-preset catalog, chooses sensible defaults for model /
aspect / size, and calls the Gemini image API. No SDK, no npm
install — just Node 20.12+ and `fetch`.

---

## Choosing a Skill

`nanogen` is one of three sibling image-generation skills. They are not
interchangeable; each one exposes different strengths from its underlying API.

| Skill | Back end | Good fit | Tradeoffs |
|-------|----------|----------|-----------|
| [`imagegen`](https://github.com/zeveck/imagegen) | OpenAI `gpt-image-1` | Classic game assets, direct transparent PNG/WebP sprites and icons | Older OpenAI image model, legacy size set |
| [`imagegen2`](https://github.com/zeveck/imagegen2) | OpenAI `gpt-image-2` | Current OpenAI image path, flexible sizes up to 4K-class outputs, high-fidelity edits | No native transparent backgrounds; uses an explicit `gpt-image-1.5` fallback only when requested |
| `nanogen` | Google Gemini / Nano Banana image models | Rich style catalog, natural-language edits, multi-image composition, multi-turn refinement | No native alpha output; often returns JPEG and uses chromakey/post-processing for transparent-style assets |

Use `nanogen` when you want the Gemini/Nano Banana editing workflow: style
presets, natural-language regional edits, multi-image composition, and
multi-turn refinement. Use `imagegen` when true transparent PNG/WebP output is
the primary requirement.

---

## Getting started

1. **Install the skill.** Paste this into Claude Code (or any coding
   agent) in your target repo:

   ```
   Install the nanogen skill from github.com/zeveck/nanogen.
   ```

2. **Add a Gemini API key** to `.env` at your repo root (get one at
   <https://aistudio.google.com/app/apikey>):

   ```
   GEMINI_API_KEY=<paste-your-key>
   ```

3. **Talk to Claude Code:**

   ```
   /nanogen a cozy cabin in a snowy pine forest at dusk
   ```

That's it. The skill picks style, aspect, size, and output path from
your request. Pass `--style`, `--aspect`, `--size`, or `--output`
when you want to override.

---

## Gallery

Every image below is paired with the `/nanogen` prompt that produced
it. Type the prompt into Claude Code; the skill handles the rest.

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

Short, casual prompts work too — the skill expands them. Below,
"16-bit" routed to `--style pixel-16bit` and "large" upgraded the
output to 2K automatically:

```
/nanogen A picture of a cute spider with fuzzy legs and eight eyes. 16-bit. large.
```

<img src="docs/images/cute-spider.jpg" alt="16-bit pixel art cute spider with fuzzy legs and eight eyes" width="45%">

### Same prompt, three styles

Add `--style <slug>` to steer the aesthetic. The catalog has 72
presets across 10 categories; here's the same lighthouse in three of
them:

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

Quote the literal string you want rendered. Text-in-image is
hit-or-miss at small sizes; the skill routes text-heavy prompts to
Pro at 2K automatically.

```
/nanogen a vintage French coffee-shop chalkboard sign reading exactly "CAFÉ DU MATIN — OUVERT" in hand-drawn cursive chalk lettering
```

<img src="docs/images/cafe-sign.jpg" alt="French chalkboard sign reading CAFÉ DU MATIN OUVERT" width="40%">

### Edit — change part of an image

Point at an existing image and describe the change in plain English.
No bitmap mask needed.

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

The frog on the left is a user-supplied sprite (not AI-generated).
The frog on the right is what the skill returned:

```
/nanogen --image frog-boss.png an even bigger and meaner version of this frog boss
```

| Input (user asset) | Amplified |
|:---:|:---:|
| <img src="docs/images/frog-boss.png" width="350"> | <img src="docs/images/frog-boss-meaner.jpg" width="350"> |

### Multi-image composition

Pass up to 14 `--image` flags and Gemini composites them into one
scene. The first image is the primary reference.

```
/nanogen --image knight.jpg --image apple.jpg the knight triumphantly holding the red apple overhead
```

| Knight | Apple | Composite |
|:---:|:---:|:---:|
| <img src="docs/images/knight.jpg" width="240"> | <img src="docs/images/apple.jpg" width="240"> | <img src="docs/images/knight-with-apple.jpg" width="240"> |

### Multi-turn refinement

Each follow-up `/nanogen` refines the prior image in place rather
than regenerating from scratch. The skill spots the continuation
automatically from its history log — you just keep talking:

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

## A couple of things to know

- **Gemini returns JPEG most of the time**, even when you ask for
  `.png`. If you pass `--output foo.png` and the API returns JPEG,
  the CLI saves it as `foo.jpg` and warns you. Pass `--output foo.jpg`
  up front to silence the warning.
- **Text rendered inside images is hit-or-miss.** For legible text,
  the skill picks Pro at 2K with high thinking automatically — but
  expect ~1 in 3 to mangle a letter.

---

## Credits

- Inspired by [zeveck/imagegen](https://github.com/zeveck/imagegen).
- Uses [Google Gemini](https://ai.google.dev/gemini-api/docs/image-generation).
- Built with [Claude Code](https://claude.com/claude-code).

## License

MIT.
