# nanogen

> A Claude Code skill (and standalone CLI) for image generation and
> editing via Google's Nano Banana / Gemini image models.

> `/nanogen a misty Scottish highland cliff at sunrise overlooking the sea, dramatic cinematic concept art, 16:9`

<img src="docs/images/highland-cliff.jpg" alt="misty Scottish highland cliff at sunrise" width="100%">

Install `/nanogen` into your repo, drop a Gemini API key into `.env`,
and talk to Claude Code in plain English. The skill picks a style
from its 72-preset catalog, chooses sensible defaults for model /
aspect / size, and calls the Gemini image API. No SDK, no npm
install — just Node 20.12+ and `fetch`.

---

## Gallery

Every image below is paired with the `/nanogen` prompt that produced
it. Type the prompt into Claude Code; the skill handles the rest.

### Text-to-image

> `/nanogen a single red apple on a white marble table`

<img src="docs/images/apple.jpg" alt="red apple on a white marble table" width="45%">

> `/nanogen a 16-bit warrior with a huge sword on a white background`

<img src="docs/images/warrior-16bit.jpg" alt="16-bit pixel art warrior with huge sword" width="33%">

### Same prompt, three styles

Add `--style <slug>` to steer the aesthetic. The catalog has 72
presets across 10 categories; here's the same lighthouse in three of
them:

> `/nanogen --style watercolor a solitary stone lighthouse on a rocky point, crashing waves at its base, an overcast sky, a single gull overhead`
>
> `/nanogen --style cyanotype a solitary stone lighthouse on a rocky point, crashing waves at its base, an overcast sky, a single gull overhead`
>
> `/nanogen --style art-deco a solitary stone lighthouse on a rocky point, crashing waves at its base, an overcast sky, a single gull overhead`

| watercolor | cyanotype | art-deco |
|:---:|:---:|:---:|
| <img src="docs/images/lighthouse-watercolor.jpg" width="260"> | <img src="docs/images/lighthouse-cyanotype.jpg" width="260"> | <img src="docs/images/lighthouse-art-deco.jpg" width="260"> |

### Readable text inside an image

Quote the literal string you want rendered. Text-in-image is
hit-or-miss at small sizes; the skill routes text-heavy prompts to
Pro at 2K automatically.

> `/nanogen a vintage French coffee-shop chalkboard sign reading exactly "CAFÉ DU MATIN — OUVERT" in hand-drawn cursive chalk lettering`

<img src="docs/images/cafe-sign.jpg" alt="French chalkboard sign reading CAFÉ DU MATIN OUVERT" width="40%">

### Edit — change part of an image

Point at an existing image and describe the change in plain English.
No bitmap mask needed.

> `/nanogen --image apple.jpg change the apple to bright green`

| Before | After |
|:---:|:---:|
| <img src="docs/images/apple.jpg" width="350"> | <img src="docs/images/apple-green.jpg" width="350"> |

### Edit — replace an object

Same mechanism, bigger transform. Pose, composition, and armor are
preserved.

> `/nanogen --image knight.jpg replace the sword with a heavy battle axe, same pose and hand position`

| Before | After |
|:---:|:---:|
| <img src="docs/images/knight.jpg" width="350"> | <img src="docs/images/knight-axe.jpg" width="350"> |

### Edit — style transfer

Combine `--image` with a style slug. The composition stays; the
aesthetic is rewritten.

> `/nanogen --image knight.jpg --style pixel-16bit convert this to 16-bit SNES-era pixel art while preserving composition and pose`

| Before | After |
|:---:|:---:|
| <img src="docs/images/knight.jpg" width="350"> | <img src="docs/images/knight-16bit.jpg" width="350"> |

### Edit — amplify a user-supplied asset

The frog on the left is a user-supplied sprite (not AI-generated).
The frog on the right is what the skill returned:

> `/nanogen --image frog-boss.png an even bigger and meaner version of frog_large_boss.png`

| Input (user asset) | Amplified |
|:---:|:---:|
| <img src="docs/images/frog-boss.png" width="350"> | <img src="docs/images/frog-boss-meaner.jpg" width="350"> |

### Multi-image composition

Pass up to 14 `--image` flags and Gemini composites them into one
scene. The first image is the primary reference.

> `/nanogen --image knight.jpg --image apple.jpg the knight triumphantly holding the red apple overhead`

| Knight | Apple | Composite |
|:---:|:---:|:---:|
| <img src="docs/images/knight.jpg" width="240"> | <img src="docs/images/apple.jpg" width="240"> | <img src="docs/images/knight-with-apple.jpg" width="240"> |

### Multi-turn refinement

Chain edits by just talking to Claude. The skill remembers the
prior turn and refines in place rather than regenerating from
scratch:

> Turn 1 — `/nanogen a single red apple on a white marble table`
>
> Turn 2 — *"now change the apple to bright green"*
>
> Turn 3 — *"add a stem and a leaf"*

| Turn 1 | Turn 2 | Turn 3 |
|:---:|:---:|:---:|
| <img src="docs/images/apple.jpg" width="240"> | <img src="docs/images/apple-green.jpg" width="240"> | <img src="docs/images/apple-green-leaf.jpg" width="240"> |

---

## Quickstart

1. **Install the skill** into your repo (see below).
2. **Get a Gemini API key** at <https://aistudio.google.com/app/apikey>
   and put it in `.env` at your repo root:
   ```bash
   echo 'GEMINI_API_KEY=<paste-your-key>' > .env
   ```
3. **Talk to Claude Code** in plain English:
   ```text
   /nanogen a cozy cabin in a snowy pine forest at dusk
   ```

That's it. The skill picks style, aspect, size, and output path from
your request. Pass `--style`, `--aspect`, `--size`, or `--output`
when you want to override.

---

## Install into your repo

**Recommended: ask your agent.** Paste this into Claude Code (or any
coding agent) in your target repo:

> Install the nanogen skill from github.com/zeveck/nanogen into
> `.claude/skills/nanogen/`. Fetch the files via
> raw.githubusercontent.com — don't clone the whole repo. Then
> remind me to put a Gemini API key in `.env`.

The agent handles permissions, config wiring, and the directory
layout.

**Or do it by hand:**

```bash
cd your-repo-root
mkdir -p .claude/skills/nanogen
BASE=https://raw.githubusercontent.com/zeveck/nanogen/main/.claude/skills/nanogen
for f in generate.cjs magicBytes.cjs styles.json SKILL.md reference.md README.md package.json; do
  curl -sSL "$BASE/$f" -o ".claude/skills/nanogen/$f"
done
chmod +x .claude/skills/nanogen/generate.cjs
```

Then add to `.claude/settings.local.json` under `permissions.allow`:

```
"Bash(node /abs/path/to/your/repo/.claude/skills/nanogen/generate.cjs:*)"
```

Smoke-test with `node .claude/skills/nanogen/generate.cjs --help`.

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
