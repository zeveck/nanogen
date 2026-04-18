# /nanogen — reference

## Intro

This is the deep reference for the `/nanogen` skill. `SKILL.md` is
the concise top-of-context playbook the agent loads up-front on
every invocation; this file is the long reference consulted on
demand. Jump here when you need the full style catalog, the
asset-prompt templates, the aspect-ratio table, pricing, error
root-causes, environment variables, the verbatim stderr warnings
the CLI emits, or documentation of known Nano Banana gotchas.

Current as of **2026-04-17**. Preview-tier models (`gemini-3.x`)
may change shape; if the CLI starts logging unknown response
parts, this file may be stale.

## Complete style catalog

72 presets across 10 categories. Each preset is identified by its
`slug` (pass via `--style <slug>` — repeatable) and expands to a
descriptive prompt fragment appended to the composed prompt.

**Slug/name identifiers in this catalog are data, not claims of
likeness.** The prose sections of this file avoid naming
trademarked studios or artists; if you see a trademark-adjacent
token in a slug/name line here, it is an identifier referring to a
documented visual aesthetic and not an endorsement or imitation
claim.

### Pixel Art (`pixel-art`)

- **pixel-8bit** — 8-bit Pixel Art
  > 8-bit pixel art with a strictly limited palette of 16 or fewer colors, large visible square pixels, dithered shading, sprite-sheet aesthetic, flat backgrounds, no anti-aliasing, CRT-era home-console look.
- **pixel-16bit** — 16-bit Pixel Art
  > 16-bit pixel art with a 32-to-64 color palette, crisp square pixels, selective dithering, parallax-ready layered backgrounds, cel-style character sprites, saturated yet balanced colors evoking early-1990s cartridge graphics.
- **pixel-32bit** — 32-bit Pixel Art
  > 32-bit pixel art with a large 128-plus color palette, soft anti-aliased edges on select elements, detailed hand-pixeled shading, pre-rendered backdrop feel, painterly sprite highlights, rich late-1990s console aesthetic.
- **pixel-modern-highdetail** — Modern High-Detail Pixel Art
  > Modern high-detail pixel art with hundreds of hand-placed colors, careful sub-pixel shading, animated-looking frames, volumetric lighting suggested through palette choice, intricate micro-detail on characters and props, crisp and readable at 1:1 scale.
- **pixel-isometric-tile** — Isometric Tile Pixel Art
  > Isometric pixel art on a strict 2:1 tile grid, diorama-style scenes, consistent top-left light source, clean stair-stepped diagonals, pastel-to-medium saturated palette, tile-based architecture with readable depth cues.

### Flat / Vector (`flat-vector`)

- **flat-minimalist** — Flat Minimalist
  > Flat minimalist vector illustration with solid color fills, no gradients, no texture, geometric primitives, strong silhouette, generous negative space, confident two-to-four color palette, editorial magazine feel.
- **flat-material-design** — Flat Material Design
  > Flat material-design vector illustration with soft directional drop shadows, elevated card layers suggesting paper depth, bold primary-plus-accent palette, rounded geometry, crisp edges, subtle ink-spill ripple motifs.
- **flat-glassmorphism** — Glassmorphism
  > Glassmorphism aesthetic with frosted translucent panels, subtle backdrop blur, thin white borders, vibrant pastel gradients behind the glass, floating layered UI cards, modern product-landing-page polish.
- **flat-neumorphism** — Neumorphism
  > Neumorphism aesthetic with soft extruded shapes, dual-light inset and outset shadows on a muted monochrome background, matte plastic feel, low contrast, tactile button-like forms, soft shape language throughout.
- **isometric-infographic** — Isometric Infographic
  > Isometric infographic illustration on a 30-degree projection, flat shading with two-tone ambient occlusion, clean vector outlines, saturated corporate palette, exploded miniature cityscape or device cutaway, explanatory diagram feel.

### Painterly (`painterly`)

- **oil-painting** — Oil Painting
  > Traditional oil painting with visible brushwork, layered glazes, warm chiaroscuro lighting, muted earth-tone palette of ochres, umbers and deep greens, canvas weave faintly visible, classical portraiture atmosphere.
- **acrylic-impasto** — Acrylic Impasto
  > Acrylic impasto painting with thick raised paint strokes casting their own micro-shadows, palette-knife textures, saturated modern palette, energetic directional marks, semi-abstract contemporary-gallery mood.
- **gouache** — Gouache
  > Gouache painting with opaque matte color fields, soft paper-grain texture, muted pastel palette with occasional saturated accents, flat layered shapes, picture-book storybook sensibility.
- **watercolor** — Watercolor
  > Watercolor painting with wet-on-wet bleeds, visible paper grain, soft blooming edges, translucent washes over loose pencil underdrawing, limited cool palette with ink accents, delicate botanical-study feel.
- **digital-painting-concept** — Digital Concept Painting
  > Digital concept painting with confident broad brush strokes, cinematic wide-lens composition, atmospheric perspective, moody volumetric light shafts, dramatic rim lighting, rich film-like color grade suitable for pre-production art.

### Drawing / Ink (`drawing-ink`)

- **charcoal** — Charcoal Drawing
  > Charcoal drawing with smudged black-to-grey tonal washes, visible fingertip blending, white-chalk highlights, toothy rag-paper texture, dramatic chiaroscuro, life-drawing studio atmosphere.
- **pencil-sketch** — Pencil Sketch
  > Graphite pencil sketch with layered hatching, soft 2B-to-6B tonal range, visible construction lines kept as part of the finish, light cold-press paper grain, study-book observational feel.
- **pen-ink-crosshatch** — Pen and Ink Crosshatch
  > Pen-and-ink illustration with dense crosshatching, confident contour lines, pure black on off-white paper, varying line weight for depth, no grey tones, nineteenth-century engraving feel.
- **moebius-clear-line** — Clear Line (Moebius-esque)
  > Clear-line comics illustration with uniform black outlines at a single weight, no hatching, flat pastel color fills, wide-open European-bande-dessinee compositions, sun-bleached desert palette, surreal science-fantasy mood.
- **mignola-noir** — Ink Noir (Mignola-esque)
  > High-contrast ink noir comics art with massive solid-black shadow shapes, minimal line detail inside lit areas, blocky geometric silhouettes, limited spot-color palette of sickly greens and dried-blood reds, occult pulp-horror atmosphere.
- **ink-wash-sumi-e** — Ink Wash (Sumi-e)
  > East Asian ink-wash painting with a loaded bamboo brush, swift tonal gradients from jet black to silver grey, abundant negative space, a single focal subject, rice-paper texture, meditative minimalist composition.
- **ukiyo-e** — Ukiyo-e Woodblock
  > Edo-period Japanese woodblock-print aesthetic with flat registered color blocks, confident black keyline, subtle bokashi gradient in the sky, muted indigo and vermilion palette, decorative stylized waves and clouds, kimono-pattern detail.

### Photographic (`photographic`)

- **hyperreal-portrait** — Hyperreal Portrait Photograph
  > Hyperreal studio portrait photograph, 85mm prime lens at f/1.4, soft key light with subtle rim, shallow depth of field, visible skin-pore detail and individual eyelashes, neutral color grade, magazine-cover polish.
- **studio-product** — Studio Product Photograph
  > Commercial studio product photograph with softbox lighting, seamless white or gradient backdrop, subtle contact shadow, crisp reflective highlights, color-accurate neutral grade, centered hero composition.
- **street-photography** — Street Photograph
  > Candid street photograph in 35mm black-and-white with grainy high-ISO film look, decisive-moment composition, deep Zone-System contrast, urban geometry, available-light chiaroscuro, documentary honesty.
- **macro** — Macro Photograph
  > Macro photograph at 1:1 magnification, razor-thin depth of field, jewel-like subject detail, soft diffused ring light, creamy bokeh background, saturated natural colors, nature-journal scientific clarity.
- **astrophotography** — Astrophotography
  > Long-exposure astrophotograph of a star-strewn sky, visible Milky Way core, deep ink-blue and magenta nebular tones, sharp foreground silhouette, subtle star trails, calibrated low-noise color grade.
- **film-grain-35mm** — 35mm Film Grain
  > 35mm color-negative film photograph with organic grain, warm highlights with soft roll-off, slight halation around light sources, gentle magenta-leaning shadows, dated-but-romantic analog snapshot feel.
- **tilt-shift** — Tilt-Shift Miniature
  > Tilt-shift photograph simulating a miniature-model look, extreme depth-of-field falloff at top and bottom, saturated toy-like color boost, high-angle elevated viewpoint, city-street or model-railway composition.
- **polaroid** — Instant Polaroid
  > Instant-film snapshot with white border, square frame, soft vignetting, lifted blacks, warm chemical color shift, mild focus softness, nostalgic pre-digital family-album atmosphere.
- **cyanotype** — Cyanotype
  > Cyanotype print with a signature Prussian-blue and white tonal range, soft tonal gradients from botanical contact-print exposure, fibrous hand-coated paper texture, ghostly silhouette subject, nineteenth-century scientific-illustration feel.
- **infrared** — Infrared Photograph
  > Infrared photograph with surreal white foliage, near-black sky, glowing skin highlights, heightened cloud contrast, soft dreamlike haze, monochrome or false-color swapped-channel palette.

### Animation / Cartoon (`animation-cartoon`)

- **studio-ghibli-esque** — Hand-Drawn Animated Film (Ghibli-esque)
  > Hand-drawn 2D animated-film aesthetic with soft watercolor backgrounds, gentle cel-shaded characters on two tones, pastoral skies with layered painted clouds, warm golden-hour light, whimsical countryside or steampunk-town atmosphere.
- **pixar-cg-esque** — Family-Friendly 3D CG (Pixar-esque)
  > Family-friendly 3D computer-graphics look with slightly stylized proportions, squash-and-stretch-ready forms, soft subsurface-scattered skin, glossy specular highlights, warm cinematic three-point lighting, uplifting feature-film mood.
- **dreamworks-cg-esque** — Adventurous 3D CG (DreamWorks-esque)
  > Adventurous 3D computer-graphics style with slightly angular stylized characters, expressive raised eyebrows, rich detailed textures on fabrics and fur, dynamic wide-lens cinematic camera, saturated action-adventure color grade.
- **cel-shaded-3d** — Cel-Shaded 3D
  > Cel-shaded 3D render with hard-banded two-tone lighting, bold black outlines via inverse-hull, flat textured surfaces with limited gradients, anime-inspired shape language, game-cinematic composition.
- **anime-key-visual** — Anime Key Visual
  > Anime-style promotional key-visual illustration with sharp character linework, soft airbrushed skin shading, detailed hair highlights, painted atmospheric background, slight bloom on light sources, emotional cinematic composition.
- **saturday-morning-retro** — Retro Saturday-Morning Cartoon
  > Retro 1980s Saturday-morning cartoon look with thick black outlines, flat cel-painted colors, slightly registered-off color fills, limited animation held poses, saturated hero-team palette, cheerful action-adventure vibe.
- **bruce-timm-dcau-esque** — Deco Superhero Animation
  > Streamlined deco-influenced superhero animation aesthetic, bold geometric character shapes, strong square jawlines, black-and-limited-color shading, noir-leaning saturated palette against dark skies, mid-1990s animated-series mood.

### Fine Art / Historical (`fine-art-historical`)

- **art-nouveau** — Art Nouveau
  > Art Nouveau decorative illustration with sinuous organic whiplash lines, botanical floral borders, flat muted jewel-tone palette, gold leaf accents, elongated elegant figures, belle-epoque poster-print sensibility.
- **art-deco** — Art Deco
  > Art Deco illustration with symmetrical geometric composition, stepped zigzag motifs, streamlined stylized figures, metallic gold and black palette against deep teal or cream, 1920s-and-1930s luxury-poster sensibility.
- **bauhaus** — Bauhaus
  > Bauhaus composition of primary-color geometric primitives, perfect circles, triangles and rectangles, thick black constructivist lines, grid-based layout, sans-serif typographic mood, early-twentieth-century design-school clarity.
- **impressionism** — Impressionism
  > Impressionist painting with short broken brushstrokes, unblended complementary colors vibrating against each other, plein-air outdoor light, softened edges, emphasis on the impression of shifting daylight over precise detail.
- **cubism** — Cubism
  > Analytical cubist composition with a subject fragmented into overlapping faceted planes, multiple simultaneous viewpoints, muted ochre-and-grey palette, flattened picture-plane depth, early-twentieth-century avant-garde feel.
- **surrealism** — Surrealism
  > Surrealist dreamscape painting with impossible juxtapositions, melting or floating objects, hyper-clear focus across a vast depth of field, muted earth palette under uncanny clear light, tiny distant figures, dream-logic composition.
- **fauvism** — Fauvism
  > Fauvist painting with wildly non-naturalistic saturated color, flat broad brushed planes, bold arbitrary hues for skin and landscape, simplified drawing, joyful early-twentieth-century rebellious palette.
- **expressionism** — Expressionism
  > Expressionist painting with distorted exaggerated forms, jarring clashing colors, swirling turbulent brush strokes, raw emotional charge, thick outlines, early-twentieth-century anxious psychological mood.
- **baroque-chiaroscuro** — Baroque Chiaroscuro
  > Baroque tenebrist painting with a single dramatic warm light source, deep velvety shadow occupying most of the frame, theatrically posed figures, rich ochre-to-crimson palette, seventeenth-century old-master gravitas.

### Game Style (`game-style`)

- **fft-yoshida** — Isometric Tactical RPG (FFT/Yoshida)
  > Isometric tactical RPG aesthetic with chibi 1:2 head-to-body proportions, muted earth-tone palette of aged parchment beiges, warm ambers and olive greens, dark grey outlines, medieval manuscript decorative feel, diorama-quality tiled terrain.
- **tactics-ogre-dark** — Dark Tactical RPG (Tactics Ogre)
  > Dark tactical RPG aesthetic with grounded adult-proportioned character sprites, grim overcast palette of slate blues, oxidized bronzes and blood reds, detailed armored figures, weathered battlefield tiles, somber political-war mood.
- **shining-force-16bit** — 16-bit Tactical RPG (Shining Force)
  > 16-bit tactical RPG sprite aesthetic with cheerful saturated primary-plus-pastel palette, expressive oversized-head character proportions, clean pixel outlines, cartoony hand-painted battlefield tiles, early-1990s console-RPG warmth.
- **fire-emblem-gba** — GBA Tactical RPG (Fire Emblem)
  > Handheld-era tactical RPG aesthetic with compact pixel sprites, vivid jewel-tone palette, expressive map animations, crisp tile-based terrain, anime-styled portrait cut-ins, early-2000s portable-console clarity.
- **disgaea-chibi** — Chibi Strategy RPG (Disgaea)
  > Chibi strategy RPG aesthetic with exaggerated super-deformed proportions, oversized heads, hyper-saturated candy-colored palette, sparkle and flame particle effects, comedic expressive poses, Prinny-plush energy.
- **hd2d-modern-tactics** — HD-2D Modern Tactics
  > HD-2D modern tactics aesthetic combining crisp pixel-art sprites with painterly 3D environments, tilt-shift depth-of-field blur, rich god rays, warm cinematic color grade, diorama-like tilted camera, nostalgic-yet-contemporary mood.
- **metroidvania-painterly** — Painterly Metroidvania
  > Painterly 2D metroidvania aesthetic with hand-painted parallax backgrounds, silhouetted foreground characters, moody cool palette pierced by warm lantern accents, crumbling gothic ruins, melancholy indie-game atmosphere.
- **low-poly-psx** — Low-Poly PSX Era
  > Low-polygon late-1990s console aesthetic with angular untextured-looking meshes, vertex-snapping jitter, warped affine-mapped textures, limited 256-color dithered palette, fog in the distance, raw original-PlayStation rendering charm.
- **ps2-era-character** — PS2-Era Character Rendering
  > Early-2000s sixth-console-generation character rendering with modestly detailed meshes, soft baked-lighting textures, slightly plasticky specular highlights, limited shadow resolution, nostalgic pre-HD action-adventure presentation.
- **modern-indie-platformer** — Modern Indie Platformer
  > Modern indie platformer aesthetic with chunky hand-drawn vector characters, gently animated squash-and-stretch, saturated cheerful palette, layered parallax foliage, subtle post-process bloom, contemporary digital-storefront polish.

### Design / Technical (`design-technical`)

- **blueprint** — Blueprint
  > Technical blueprint drawing with white line work on deep cyan paper, orthographic projections, dimension lines with arrowheads, fine dashed hidden lines, handwritten annotation lettering, early-twentieth-century engineering-office feel.
- **architectural-hyperreal** — Hyperreal Architectural Render
  > Hyperreal architectural rendering with physically-based materials, accurate sun-study lighting, realistic glass reflections, lifestyle people and vegetation at human scale, shallow-to-medium depth of field, high-end property-marketing polish.
- **architectural-sketch** — Architectural Concept Sketch
  > Architectural concept sketch drawn in confident pen outline with loose marker wash, one-or-two-point perspective, soft grey shadow layers, a wash of a single accent color, visible construction guidelines, design-studio charette feel.
- **schematic-diagram** — Schematic Diagram
  > Clean schematic diagram on a neutral-grey grid, standardized electrical-or-mechanical symbols, labeled components, crisp thin black linework, color-coded signal paths, didactic textbook-figure clarity.
- **exploded-view-diagram** — Exploded-View Diagram
  > Exploded-view technical illustration with axonometric projection, components spaced along dashed assembly lines, clean airbrush-style cel shading, neutral muted palette with one accent color, numbered callouts, workshop-manual clarity.

### Speculative / Niche (`speculative-niche`)

- **vaporwave** — Vaporwave
  > Vaporwave aesthetic with a pink-and-cyan neon gradient sky, Roman plaster busts on checkerboard floors, glitching CRT-scanline overlays, Japanese half-width katakana typography, dreamy 1990s-mall nostalgia.
- **synthwave** — Synthwave
  > Synthwave aesthetic with a neon magenta-to-indigo gradient sunset, infinite chrome grid horizon, silhouetted palm trees, chrome wireframe mountains, VHS chromatic aberration, 1980s retro-future arcade mood.
- **solarpunk** — Solarpunk
  > Solarpunk illustration with verdant plant-covered architecture, integrated solar panels and wind turbines, warm optimistic midday light, lush biodiverse palette of greens and sunflower yellows, community rooftop gardens, hopeful ecological-futurism feel.
- **cottagecore** — Cottagecore
  > Cottagecore illustration with a thatched stone cottage amid wildflower meadows, hand-knit textiles, baskets of sourdough and herbs, soft natural daylight, muted sage-and-butter palette, pastoral hand-drawn storybook warmth.
- **dark-academia** — Dark Academia
  > Dark academia illustration with gothic stone university corridors, candlelit leather-bound tomes, wool tartan and tweed textiles, muted ochre-and-oxblood palette, overcast northern-European autumn light, introspective literary mood.
- **cyberpunk-neon** — Cyberpunk Neon
  > Cyberpunk neon-drenched megacity at night, rain-slicked streets reflecting saturated magenta and cyan signage, dense holographic kanji and katakana advertising, volumetric fog, chrome-and-leather cybernetic characters, gritty high-tech-low-life mood.
- **atompunk** — Atompunk
  > Atompunk mid-century-futurist illustration with chrome-finned rockets, atomic orbital logos, pastel turquoise-and-tangerine palette, sweeping googie architecture, starburst accents, 1950s-and-1960s World's Fair optimism.
- **dieselpunk** — Dieselpunk
  > Dieselpunk interwar-futurist illustration with riveted steel hulls, bulbous prop-driven aircraft, smoke-belching exhaust stacks, sepia-and-gunmetal palette, art-deco industrial architecture, 1930s-and-1940s alternate-history mood.
- **brutalist-scifi** — Brutalist Science Fiction
  > Brutalist science-fiction architecture with massive raw concrete megastructures, harsh angular geometry, tiny human figures for scale, overcast diffuse light, desaturated grey-and-rust palette, oppressive retro-future-totalitarian mood.

## Asset-type prompt templates

Templates for common game-dev and illustration assets. Fill in the
bracketed fields. These templates assume Nano Banana output — they
do **not** use "transparent background" wording anywhere, because
the Gemini image API has no alpha channel. If the user needs a
transparent asset, generate on a solid flat background (matching
the target canvas) and key it out in post, or use a dedicated
background-removal tool after the fact.

### Characters / sprites

```
[Style]. [Character description] in [pose]. Facing [direction].
[Outfit / armor / accessories]. [Color palette]. Scene features:
[background context]. For a [genre] game.
```

### Tilesets / terrain

```
[Style]. [Terrain type] tile, seamlessly tileable. Top-down view.
[Lighting direction]. [Color palette]. [Texture details].
```

### Items / icons

```
[Style]. [Item name / type], [key visual details]. Centered on
canvas, small detail zone. [Size context — e.g. "fills 60% of
frame"].
```

### UI elements

```
[Style]. [UI element type] for a [game genre] game. State:
[normal / hover / pressed]. [Color scheme]. [Shape details].
```

### Backgrounds / scenes

```
[Style]. [Scene description]. [Time of day / lighting].
[Mood / atmosphere]. [Perspective]. [Dimensions context — what the
image will be used for].
```

### Portraits

```
[Style]. [Character description], [emotion / expression], [lighting
setup], [background treatment].
```

### Concept art

```
[Style]. [Subject], [environmental context], [mood / theme],
[compositional notes], [lighting].
```

### Transparency workflow (the chromakey pattern)

**Nano Banana does not produce alpha output natively.** Google's
docs (https://ai.google.dev/gemini-api/docs/image-generation)
explicitly state: *"The model does not support generating a
transparent background."* Every generation returns a solid-
background RGB image.

That's not a dealbreaker for sprite work — the community-standard
workflow is generate-then-strip:

1. **Generate on a chromakey background.** Prompt for a
   pure solid color the subject doesn't contain, e.g.
   `"on a pure chromakey green (#00FF00) background, no
   scenery, no shadows, no ground plane"`. Green is preferred
   because fewer subjects contain pure `#00FF00`; magenta
   (`#FF00FF`) is the common alternative. Avoid white if the
   subject has any white details (armor highlights, teeth,
   paper, text) — they'll get erased.

2. **Strip the key color with any off-the-shelf tool.** nanogen
   does not ship image-processing dependencies; use ImageMagick
   (ubiquitous, pre-installed on most dev containers):

   ```bash
   # Strip chromakey green to transparent alpha
   convert sprite.jpg -fuzz 10% -transparent '#00FF00' sprite.png

   # Or strip a white background (only safe for subjects without white)
   convert sprite.jpg -fuzz 5% -transparent white sprite.png
   ```

   The `-fuzz` tolerance handles JPEG compression's edge smearing.
   Tune 5-15% depending on how clean the key is.

3. **Verify the result.** Open the resulting PNG in an editor
   with a checkerboard background; the subject should have clean
   edges and the key color should be fully gone. If you see
   green fringing around the subject, raise `-fuzz` slightly;
   if subject detail is being erased, lower it.

Alternative workflows for specific scenarios:

- **Dual-generation alpha recovery** — generate the same subject
  on white, then again on black, diff the two to recover a mask.
  Relies on cross-generation consistency; less reliable than
  chromakey.
- **Gemini 3 Code Execution** — ask Gemini 3 Flash (separate
  invocation, NOT nanogen) to "remove the background" and it
  will write + run its own Python (PIL/OpenCV) to strip the
  key color. Fully automatic but adds a second API call.

The `/nanogen` skill's pixel-art / sprite / icon asset-type
defaults suggest `.jpg` output — which is fine for the chromakey
workflow since ImageMagick re-encodes losslessly into PNG on
strip. For hard-edged pixel art where JPEG compression would
damage edges, consider `--size 2K` to give ImageMagick more
pixels to work with before the key removal.

## Aspect ratio guidance

nanogen accepts 14 aspect ratios via `--aspect <r>`. Pick based on
target canvas:

| Ratio | Suggested uses |
|---|---|
| `1:1` | Square avatars, items, icons, tiles, social-media posts. |
| `4:3` | Classic display, illustrated book spreads, older monitors. |
| `3:4` | Portrait illustrations, character portraits, tall items. |
| `3:2` | 35mm-film-style photographs, wide landscape postcards. |
| `2:3` | Portrait photography, book covers, character sheets. |
| `16:9` | Widescreen backgrounds, YouTube thumbnails, cinematic scenes. |
| `9:16` | Phone wallpapers, vertical short-form video, story panels. |
| `21:9` | Ultrawide cinematic backdrops, panoramic scenes. |
| `4:5` | Instagram-portrait native crop, modern magazine portraits. |
| `5:4` | Medium-format-photo look, slightly wider square. |
| `1:4` | Tall banner, vertical sidebar artwork. |
| `4:1` | Wide banner, letterhead, title-card strip. |
| `1:8` | Extreme vertical banner (rare; test first). |
| `8:1` | Extreme horizontal banner (rare; test first). |

For text-heavy output (posters, logos), prefer the widest aspect
that fits the text — narrow aspects tend to produce cramped
typography.

## Pricing

Nano Banana per-image costs as of April 2026 (USD):

| Model | Size | $/image |
|---|---|---|
| `gemini-3-pro-image-preview` | 1K | $0.134 |
| `gemini-3-pro-image-preview` | 2K | $0.134 |
| `gemini-3-pro-image-preview` | 4K | $0.24 |
| `gemini-3.1-flash-image-preview` | 512 | $0.022 |
| `gemini-3.1-flash-image-preview` | 1K | $0.034 |
| `gemini-3.1-flash-image-preview` | 2K | $0.050 |
| `gemini-3.1-flash-image-preview` | 4K | $0.076 |
| `gemini-2.5-flash-image` (GA; shutdown 2026-10-02) | 1024 | $0.039 |

Batch API (not used by this CLI): 50% off output tokens, 24h
turnaround.

Free-tier quota exists on `gemini-3.1-flash-image-preview` in AI
Studio; specifics change per account. Check
https://aistudio.google.com/rate-limit for your account's limits.

## Error code reference

Each `E_*` code with a root-cause paragraph. Grouped the same as
SKILL.md's table.

### Arg validation

- **E_MISSING_OUTPUT** — `--output <path>` is required on every
  invocation (including `--dry-run`). The CLI refuses to infer a
  default path because silently writing to `nanogen-out.png` in
  the current directory is rarely what the user wanted.
- **E_MISSING_PROMPT_OR_IMAGE** — Neither `--prompt` nor
  `--image` was provided. Generate mode needs `--prompt`; edit
  mode needs at least one `--image` (and an instruction — see
  `E_EDIT_NEEDS_INSTRUCTION`).
- **E_EDIT_NEEDS_INSTRUCTION** — `--image` was supplied but
  neither `--prompt` nor `--region` describes the edit. Gemini
  needs either a full prompt or a region description to know what
  to do with the image.
- **E_BAD_OUTPUT_EXT** — `--output` must end in `.png`, `.jpg`,
  `.jpeg`, or `.webp`. The CLI uses the extension to pick the
  `responseMimeType`.
- **E_UNKNOWN_MODEL** — `--model` is not one of the three
  supported ids. Preview-tier models change names; check
  `--help` output.
- **E_BAD_ASPECT** — Aspect ratio not one of the 14 valid
  strings. Gemini will reject anything else server-side, so the
  CLI guards client-side.
- **E_BAD_SIZE** — `--size` must be `512`, `1K`, `2K`, or `4K`
  with the literal capital `K`. `"1k"` (lowercase) is rejected
  so config drift doesn't silently fall through to the API.
- **E_SIZE_MODEL_MISMATCH** — `512` is flash-3.1 only. The pro
  model has no 512 option; the 2.5 GA flash model has no 512
  option.
- **E_BAD_THINKING** — `--thinking` must be `low`, `medium`,
  `high`, or `minimal`.
- **E_THINKING_MODEL_MISMATCH** — `minimal` is flash-3.1 only.
  Pro rejects `minimal`; it only knows `low`/`medium`/`high`.
- **E_BAD_SEED** — `--seed` must parse as an integer. Floats,
  NaN, and empty strings are rejected.
- **E_BAD_TEMP** — `--temperature` must parse as a finite float.
- **E_BAD_SAFETY_CAT** — `--safety <CATEGORY>=<THRESHOLD>` with
  an unrecognized `<CATEGORY>`. The five valid categories are in
  "Env vars" below.
- **E_BAD_SAFETY_THRESHOLD** — Invalid `<THRESHOLD>`. Valid
  values: `OFF`, `BLOCK_NONE`, `BLOCK_ONLY_HIGH`,
  `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_LOW_AND_ABOVE`.
- **E_IMAGE_NOT_FOUND** — Path passed to `--image` does not exist
  or is unreadable. Check for typos / permissions.
- **E_BAD_IMAGE_EXT** — Input images must be `.png`, `.jpg`,
  `.jpeg`, or `.webp`. HEIC, AVIF, and others are not accepted.
- **E_IMAGE_EMPTY** — The image file is zero bytes. The CLI
  refuses to upload empty bytes even though the API would
  technically accept them.
- **E_IMAGE_TOO_LARGE** — Max 15 MB per input image. Gemini's own
  limits are higher, but this CLI caps at 15 MB for latency and
  base64-overhead reasons.
- **E_IMAGE_MIME_MISMATCH** — The file's magic bytes do not
  match its extension (e.g. a `.png` that's actually a JPEG).
  Rename or re-export the file.
- **E_TOO_MANY_IMAGES** — Max 14 `--image` refs per invocation.
  Pro and flash-3.1 accept multi-image composition; 14 is a
  documented ceiling.
- **E_UNKNOWN_FLAG** — The CLI hit a `--flag` it doesn't
  recognize. Run `--help` to see the full surface.
- **E_UNKNOWN_STYLE** — The slug passed to `--style` is not in
  `styles.json`. See the catalog above for the 72 valid slugs.
- **E_REGION_WITHOUT_IMAGE** — `--region` is edit-mode-only. It
  has no effect in generate mode; passing it without `--image`
  is almost certainly a bug.

### Env

- **E_NODE_TOO_OLD** — The CLI requires Node >= 20.12 for
  `process.loadEnvFile` and `AbortSignal.timeout`. Upgrade Node
  or use `nvm`.
- **E_MISSING_API_KEY** — Neither `GEMINI_API_KEY` nor
  `GOOGLE_API_KEY` is set in the environment, and no `.env`
  file containing either was found when walking upward from
  `cwd` or the CLI's own directory. See the setup doc for how
  to fix.
- **E_BAD_STYLES_CATALOG** — `styles.json` failed schema
  validation at startup (missing fields, duplicate slugs, bad
  types, wrong category count). Reinstall the skill or restore
  `styles.json` from the build tree.
- **E_STYLE_AUTHOR_POLICY** — A preset in `styles.json` contains
  a trademarked-studio-or-artist token in a field where it isn't
  allowed. Same fix: reinstall from the canonical tree.

### Continuation

- **E_CONTINUE_UNKNOWN_ID** — `--history-continue <id>` didn't
  match any entry in `.nanogen-history.jsonl` (exact match only,
  no prefix search, because an ambiguous continuation would
  round-trip the wrong `thoughtSignature` and Gemini would 400).
- **E_CONTINUE_NO_SIGNATURE** — The prior entry has
  `thoughtSignature: null`. This happens if it was produced by a
  non-Gemini-3 model, a legacy CLI version, or a refusal path.
  Regenerate the prior turn with a Gemini-3 model and continue
  from the fresh row.
- **E_CONTINUE_REFUSED_ENTRY** — The prior entry was a refusal
  (`refusalReason` non-null). There's no image and no
  `thoughtSignature` to continue from. Generate a successful
  turn first, then continue.
- **E_CONTINUE_MISSING_OUTPUT** — The prior entry points at an
  `output` path that no longer exists on disk. The CLI needs the
  actual bytes to re-send; it does not cache them separately.
  Re-run the prior turn, then use the fresh id.
- **E_CONTINUE_UNKNOWN_MIME** — The prior entry's `outputFormat`
  field is missing AND a magic-byte probe on the file couldn't
  identify it. Re-generate the prior turn.
- **E_CONTINUE_WITH_PARENT** — You passed both
  `--history-continue` and `--history-parent`. Continuation
  already implies a parent relationship; providing both is
  nonsensical and almost certainly a mistake.

### HTTP

- **E_CONTENT_POLICY** — Gemini returned a 400 whose body
  indicates a content-policy block. Rephrase the prompt away
  from named real people, violent subjects, copyrighted
  characters, or minors in sensitive contexts. Do not retry
  verbatim.
- **E_BAD_REQUEST** — Generic 400 from Gemini with no image-size
  hint. Read the stderr body for detail — it's often a
  malformed safety category or an unsupported flag combo.
- **E_BAD_REQUEST_IMAGE** — 400 whose body references image
  size or count. Usually an input image is too big, too small,
  or in an unsupported format. Re-export and retry.
- **E_AUTH** — 401. The key is invalid, revoked, or has a typo.
  Regenerate at https://aistudio.google.com/app/apikey.
- **E_ADMIN_DISABLED** — 403 from a Google Workspace account
  whose admin has disabled image generation at the tenant level.
  Ask IT or use a personal Google account.
- **E_REGION** — 403 from a country or region where the Gemini
  image API is not available (sanctioned countries, or
  occasionally new preview-model rollouts that haven't reached
  the caller's region).
- **E_FORBIDDEN** — Generic 403. Read stderr body — could be
  billing disabled, quota not enabled for this project, etc.
- **E_MODEL_NOT_FOUND** — 404 on the model id. Preview models
  get renamed; double-check `--model` spelling.
- **E_RATE_LIMIT** — 429 after the retry budget was exhausted.
  Either wait for your quota window to reset, or upgrade tier.
- **E_UPSTREAM_5XX** — Gemini returned 5xx after the retry
  budget. Usually transient; try again in a few minutes.
- **E_UNEXPECTED_HTTP** — Anything else: an unrecognized status
  code, a parse failure on the response body, or a timeout
  before the first byte. Stderr has the detail.
- **E_REFUSED** — The model returned a "soft refusal" — a
  success-shaped response with no image data and an explanatory
  text. Rephrase the prompt; same rules as `E_CONTENT_POLICY`.

## Environment variables

### Required

| Var | Purpose |
|---|---|
| `GEMINI_API_KEY` | **Preferred.** The official Gemini key env var. |
| `GOOGLE_API_KEY` | Fallback. Using it emits a stderr warning. |

**Precedence note (deviates from the Google SDK):** nanogen
prefers `GEMINI_API_KEY` over `GOOGLE_API_KEY`. The Google SDK
does the inverse. Rationale: Gemini is the brand and the official
docs tell users to set `GEMINI_API_KEY`. If both are set,
`GEMINI_API_KEY` wins.

The CLI also reads `.env` files: it walks upward from `cwd` first,
then from `__dirname`, and uses the first `.env` it finds that
declares either key. The reader is a hand-rolled parser; it does
NOT call `process.loadEnvFile`, because that API throws on missing
files and does not overwrite an already-set empty value (common
CI failure mode: `GEMINI_API_KEY=""` silently blocks `.env` from
supplying a real value).

### Test-only

These are used by the test suite and not intended for end-user
configuration:

| Var | Purpose |
|---|---|
| `NANOGEN_API_BASE` | Override the Gemini API base URL. Tests point at an in-process mock (`http://127.0.0.1:<port>`). |
| `NANOGEN_RETRY_BASE_MS` | Base exponential-backoff delay in ms. Default 1000; tests set 5. |
| `NANOGEN_FETCH_TIMEOUT_MS` | Per-attempt fetch timeout in ms. Default 120000. |
| `NANOGEN_MAX_RETRIES` | Retry count. Default 3 (→ 4 total attempts). |
| `NANOGEN_DOTENV_PATH` | Pin `.env` resolution to a specific file; bypass the cwd/`__dirname` walker. Unset in production. Tests set it to a tempdir `.env` for hermetic isolation. Set to a nonexistent path to force the "no `.env` anywhere" path. |
| `NANOGEN_STYLES_PATH` | Alternate path to a `styles.json` catalog. |

### Safety categories

Valid `<CATEGORY>` values for `--safety <CATEGORY>=<THRESHOLD>`
(case-insensitive; underscores or friendly aliases both accepted):

- `HARM_CATEGORY_HARASSMENT`
- `HARM_CATEGORY_HATE_SPEECH`
- `HARM_CATEGORY_SEXUALLY_EXPLICIT`
- `HARM_CATEGORY_DANGEROUS_CONTENT`
- `HARM_CATEGORY_CIVIC_INTEGRITY`

Valid `<THRESHOLD>` values: `OFF`, `BLOCK_NONE`,
`BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE`,
`BLOCK_LOW_AND_ABOVE`.

## Pinned stderr-warning strings

The CLI emits the following warnings to stderr verbatim. Tests
assert on them; document them here so agents and users can grep
for root causes.

1. `nanogen: --safety <CATEGORY> specified multiple times; using last value`
2. `nanogen: using GOOGLE_API_KEY. Prefer GEMINI_API_KEY to match Gemini docs.`
3. `nanogen: --history-parent "<value>" not found in .nanogen-history.jsonl; continuing anyway.`
4. `nanogen: output extension ".png" but API returned image/<x>; bytes written as-is.`
5. `nanogen: --history-continue source used model "<A>"; continuing with model "<B>". Gemini may 400 on thoughtSignature format mismatch.`

`<CATEGORY>`, `<value>`, `<x>`, `<A>`, and `<B>` are placeholder
substitutions — the surrounding text is fixed and matches
byte-for-byte. None of these warnings cause the CLI to exit
non-zero; they're advisory.

## Known gotchas

The Nano Banana / Gemini 3 image API has several footguns worth
flagging:

1. **`thoughtSignature` MUST be preserved verbatim on multi-turn.**
   If you modify, shorten, or re-encode it between turns, Gemini
   400s with a confusing format-mismatch error. The CLI handles
   this automatically via `--history-continue`; do not try to
   build the `contents` array by hand.
2. **Mixed `IMAGE+TEXT` output in one call is unreliable.** If
   you ask the model to return both an image and a text
   explanation in the same response, you often get only one. The
   CLI treats any non-image part as either a refusal (if no
   image was returned) or extra context (logged, then ignored).
3. **Text-in-image below 2K is often garbled.** Logos, posters,
   UI mockups, and anything with readable typography should use
   `--size 2K` (or `4K`) + `--thinking high`. Small sizes
   regularly produce convincing-looking-but-unreadable
   "almost-text".
4. **Preview models can break without warning.** `gemini-3.x`
   image preview models are pre-GA. Response shape, pricing, and
   availability may change. The CLI logs unknown response parts
   rather than crashing, so a new part type surfaces as a warning
   rather than an outage.
5. **Google Workspace admin lockout is possible.** Enterprise
   Google accounts may have image generation disabled at the
   tenant level. If you see `E_ADMIN_DISABLED`, either ask your
   workspace admin or switch to a personal Google account.
6. **Sanctioned-country access returns `E_REGION`.** Some
   countries are entirely blocked from the Gemini image API
   regardless of key validity.
7. **EXIF orientation is NOT auto-applied.** An image exported
   with an EXIF rotation flag is uploaded in its stored
   orientation, not its visually-correct one. Pre-normalize
   inputs if orientation matters: re-save with a tool that bakes
   rotation into pixel data.
8. **Safety defaults are OFF in 2026.** If you want any
   filtering, set the thresholds explicitly via `--safety`.
   Server defaults historically flipped between restrictive and
   permissive; as of April 2026 the defaults are the most
   permissive. Do not rely on the default staying permissive
   forever.

## Version note

This reference is current as of **2026-04-17**. Preview-tier
models (`gemini-3.x` image preview) may change shape; if
`generateContent` starts returning an unexpected schema part, the
CLI will log it to stderr rather than crashing, and this file
should be updated.
