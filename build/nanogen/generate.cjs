#!/usr/bin/env node
// nanogen — Phase 1+2: arg parser, validation, --help, --dry-run, style catalog.
// See plans/SUB_1_CLI_CORE.md for the authoritative spec.
// This is intentionally zero-dependency; Node 20.12+ built-ins only.

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const magicBytes = require("./magicBytes.cjs");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_MODELS = [
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
];
const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";
const FLASH_MODEL = "gemini-3.1-flash-image-preview";

const VALID_ASPECTS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4",
  "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1",
];
const DEFAULT_ASPECT = "1:1";

const VALID_SIZES = ["512", "1K", "2K", "4K"];
const DEFAULT_SIZE = "1K";

const VALID_THINKING = ["low", "medium", "high", "minimal"];

const VALID_OUTPUT_EXTS = [".png", ".jpg", ".jpeg", ".webp"];
const VALID_IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB raw
const MAX_IMAGE_COUNT = 14;

// Safety categories (canonical upper-case + shorthand aliases, all case-insensitive)
const SAFETY_CATEGORY_ALIASES = {
  "harassment": "HARM_CATEGORY_HARASSMENT",
  "hate_speech": "HARM_CATEGORY_HATE_SPEECH",
  "hate": "HARM_CATEGORY_HATE_SPEECH",
  "sexually_explicit": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "sexual": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "dangerous_content": "HARM_CATEGORY_DANGEROUS_CONTENT",
  "dangerous": "HARM_CATEGORY_DANGEROUS_CONTENT",
  "civic_integrity": "HARM_CATEGORY_CIVIC_INTEGRITY",
  "civic": "HARM_CATEGORY_CIVIC_INTEGRITY",
  "harm_category_harassment": "HARM_CATEGORY_HARASSMENT",
  "harm_category_hate_speech": "HARM_CATEGORY_HATE_SPEECH",
  "harm_category_sexually_explicit": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "harm_category_dangerous_content": "HARM_CATEGORY_DANGEROUS_CONTENT",
  "harm_category_civic_integrity": "HARM_CATEGORY_CIVIC_INTEGRITY",
};

const SAFETY_THRESHOLD_ALIASES = {
  "block_none": "BLOCK_NONE",
  "none": "BLOCK_NONE",
  "block_only_high": "BLOCK_ONLY_HIGH",
  "only_high": "BLOCK_ONLY_HIGH",
  "block_medium_and_above": "BLOCK_MEDIUM_AND_ABOVE",
  "medium_and_above": "BLOCK_MEDIUM_AND_ABOVE",
  "block_low_and_above": "BLOCK_LOW_AND_ABOVE",
  "low_and_above": "BLOCK_LOW_AND_ABOVE",
  "harm_block_threshold_unspecified": "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
  "off": "OFF",
};

// Flags that accept values; also lists whether they are repeatable.
const STRING_FLAGS = new Set([
  "--prompt", "--output", "--model", "--aspect", "--size",
  "--thinking", "--seed", "--temperature",
  "--history-id", "--history-parent", "--history-continue",
]);
const REPEATABLE_FLAGS = new Set([
  "--image", "--negative", "--safety", "--style", "--region",
]);
const BOOLEAN_FLAGS = new Set([
  "--dry-run", "--no-history", "--help", "-h",
]);

// ---------------------------------------------------------------------------
// Style Catalog (Phase 2)
// ---------------------------------------------------------------------------

// Fixed 10 categories — locked by plan. Do not add/rename without updating
// plans/SUB_1_CLI_CORE.md.
const FIXED_STYLE_CATEGORIES = [
  "pixel-art",
  "flat-vector",
  "painterly",
  "drawing-ink",
  "photographic",
  "animation-cartoon",
  "fine-art-historical",
  "game-style",
  "design-technical",
  "speculative-niche",
];

// Forbidden tokens enforced against every promptFragment (case-insensitive).
// Slug and name fields are exempt. Adding a new preset that names a living
// or trademarked-estate artist in its promptFragment will trip this check.
const FORBIDDEN_STYLE_TOKENS = [
  "studio ghibli",
  "ghibli",
  "pixar",
  "dreamworks",
  "disney",
  "mike mignola",
  "mignola",
  "bruce timm",
  "moebius",
  "akira kurosawa",
  "rembrandt",
  "picasso",
  "van gogh",
];

const STYLE_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_FRAGMENT_LEN = 800;
const MIN_STYLES_COUNT = 72;

function loadStyles(stylesPath) {
  const p = stylesPath || process.env.NANOGEN_STYLES_PATH ||
    path.join(__dirname, "styles.json");
  const raw = fs.readFileSync(p, "utf8");
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) {
    throw new Error("styles.json must be a JSON array");
  }
  const byKey = new Map();
  for (const entry of list) {
    if (entry && typeof entry.slug === "string") {
      byKey.set(entry.slug, entry);
    }
  }
  return { byKey, list };
}

function validateStyleCatalog(styles) {
  const { list } = styles;
  if (!Array.isArray(list)) {
    return { ok: false, error: "styles catalog is not an array" };
  }
  const seenSlugs = new Set();
  const catCounts = new Map();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || typeof e !== "object") {
      return { ok: false, error: `entry ${i}: not an object` };
    }
    // (a) required fields
    for (const field of ["slug", "name", "category", "promptFragment"]) {
      if (typeof e[field] !== "string" || e[field].length === 0) {
        return {
          ok: false,
          error: `entry ${i}: missing or empty required field "${field}"`,
        };
      }
    }
    // (b) slug shape
    if (!STYLE_SLUG_RE.test(e.slug)) {
      return {
        ok: false,
        error: `entry ${i}: slug "${e.slug}" does not match /^[a-z0-9][a-z0-9-]*$/`,
      };
    }
    // (c) slug uniqueness
    if (seenSlugs.has(e.slug)) {
      return {
        ok: false,
        error: `duplicate slug: "${e.slug}"`,
      };
    }
    seenSlugs.add(e.slug);
    // (d) category in fixed 10
    if (!FIXED_STYLE_CATEGORIES.includes(e.category)) {
      return {
        ok: false,
        error: `entry ${i} (${e.slug}): unknown category "${e.category}"`,
      };
    }
    catCounts.set(e.category, (catCounts.get(e.category) || 0) + 1);
    // (g) promptFragment length
    if (e.promptFragment.length > MAX_FRAGMENT_LEN) {
      return {
        ok: false,
        error: `entry ${i} (${e.slug}): promptFragment length ${e.promptFragment.length} exceeds ${MAX_FRAGMENT_LEN}`,
      };
    }
    // (h) forbidden tokens (case-insensitive) on promptFragment ONLY
    const lc = e.promptFragment.toLowerCase();
    for (const tok of FORBIDDEN_STYLE_TOKENS) {
      if (lc.includes(tok)) {
        return {
          ok: false,
          error: `entry ${e.slug}: promptFragment contains forbidden token "${tok}"`,
        };
      }
    }
  }
  // (e) length >= 72
  if (list.length < MIN_STYLES_COUNT) {
    return {
      ok: false,
      error: `styles catalog has ${list.length} entries; need >= ${MIN_STYLES_COUNT}`,
    };
  }
  // (f) distinct categories == 10
  if (catCounts.size !== FIXED_STYLE_CATEGORIES.length) {
    return {
      ok: false,
      error: `styles catalog has ${catCounts.size} distinct categories; need exactly ${FIXED_STYLE_CATEGORIES.length}`,
    };
  }
  return { ok: true };
}

function applyStyles(promptText, styleSlugs, stylesIndex) {
  if (!styleSlugs || styleSlugs.length === 0) return promptText;
  const fragments = [];
  for (const slug of styleSlugs) {
    const entry = stylesIndex.byKey.get(slug);
    if (!entry) {
      // Defense-in-depth; validateArgs should have caught this already.
      throw new Error(`unknown style slug: "${slug}"`);
    }
    fragments.push(entry.promptFragment);
  }
  return promptText + " Style: " + fragments.join(" ") + ".";
}

// ---------------------------------------------------------------------------
// Runtime environment check (must be called FIRST in main)
// ---------------------------------------------------------------------------

function checkRuntime() {
  if (typeof process.loadEnvFile !== "function" ||
      typeof (AbortSignal && AbortSignal.timeout) !== "function") {
    emitError("E_NODE_TOO_OLD", "nanogen requires Node.js >= 20.12");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Arg parser
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    prompt: undefined,
    output: undefined,
    model: undefined,
    aspect: undefined,
    size: undefined,
    thinking: undefined,
    seed: undefined,
    temperature: undefined,
    styles: [],
    negative: [],
    safety: [],
    image: [],
    region: [],
    historyId: undefined,
    historyParent: undefined,
    historyContinue: undefined,
    noHistory: false,
    dryRun: false,
    help: false,
    unknownFlag: undefined, // first unknown flag encountered, for E_UNKNOWN_FLAG
  };

  for (let i = 0; i < argv.length; i++) {
    let tok = argv[i];
    let inlineValue = undefined;
    // Support --flag=value
    if (tok.startsWith("--") && tok.includes("=")) {
      const eq = tok.indexOf("=");
      inlineValue = tok.slice(eq + 1);
      tok = tok.slice(0, eq);
    }

    if (tok === "--help" || tok === "-h") {
      args.help = true;
      continue;
    }
    if (tok === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (tok === "--no-history") {
      args.noHistory = true;
      continue;
    }

    if (STRING_FLAGS.has(tok)) {
      const val = inlineValue !== undefined ? inlineValue : argv[++i];
      switch (tok) {
        case "--prompt": args.prompt = val; break;
        case "--output": args.output = val; break;
        case "--model": args.model = val; break;
        case "--aspect": args.aspect = val; break;
        case "--size": args.size = val; break;
        case "--thinking": args.thinking = val; break;
        case "--seed": args.seed = val; break;
        case "--temperature": args.temperature = val; break;
        case "--history-id": args.historyId = val; break;
        case "--history-parent": args.historyParent = val; break;
        case "--history-continue": args.historyContinue = val; break;
      }
      continue;
    }

    if (REPEATABLE_FLAGS.has(tok)) {
      const val = inlineValue !== undefined ? inlineValue : argv[++i];
      switch (tok) {
        case "--image": args.image.push(val); break;
        case "--negative": args.negative.push(val); break;
        case "--safety": args.safety.push(val); break;
        case "--style": args.styles.push(val); break;
        case "--region": args.region.push(val); break;
      }
      continue;
    }

    // Unknown flag (record first only — validation emits E_UNKNOWN_FLAG).
    if (tok.startsWith("-")) {
      if (args.unknownFlag === undefined) args.unknownFlag = tok;
      continue;
    }
    // Positional — treat as unknown too.
    if (args.unknownFlag === undefined) args.unknownFlag = tok;
  }

  return args;
}

// ---------------------------------------------------------------------------
// Validation (21 rules, in stable order, short-circuit on first failure)
// ---------------------------------------------------------------------------

function validateArgs(args, stylesIndex) {
  // Rule 21 catches unknown flags; we evaluate LAST per matrix ordering.
  // But unknown-flag is rule #21 in the matrix (last); validation matrix
  // order is 1..21. We evaluate in order.

  // 1. --dry-run set without --output
  if (args.dryRun && !args.output) {
    return fail("E_MISSING_OUTPUT", "--dry-run requires --output");
  }
  // 24. --history-continue and --history-parent mutually exclusive
  // (sub-plan 2 Phase 2). Evaluated early so the relationship-conflict
  // diagnostic wins over downstream prompt/image/region checks. Matrix
  // code 24; numeric position is flexible but short-circuit order
  // matters — it runs BEFORE E_MISSING_PROMPT_OR_IMAGE so a user
  // continuing a prior turn with --history-continue (which legitimately
  // may omit --prompt) is not told "prompt missing".
  if (args.historyContinue !== undefined && args.historyParent !== undefined) {
    return fail("E_CONTINUE_WITH_PARENT",
      "--history-continue implies a parent relationship; do not also specify --history-parent.");
  }
  // In continuation mode (--history-continue set), the prior entry's
  // output image is implicitly the "image" for this turn. Rules 22/2/23
  // therefore relax: --region is allowed without --image (prior image
  // satisfies it), --prompt is allowed without --image, and a bare
  // --history-continue with --prompt or --region is sufficient. We still
  // require SOME instruction (--prompt or --region) for continuation —
  // otherwise the current user turn would be empty, which Gemini 400s.
  const inContinuation = args.historyContinue !== undefined;
  // 22. --region set but --image absent (sub-plan 2). Evaluated BEFORE
  // rule 2 so the more-specific region diagnostic wins when the user
  // forgot only --image. Matrix code 22; evaluation priority is a
  // deliberate deviation from strict numeric order and is pinned by tests.
  // Skipped in continuation mode — the prior model-turn image acts as
  // the image the region refers to.
  if (!inContinuation &&
      args.region && args.region.length > 0 &&
      (!args.image || args.image.length === 0)) {
    return fail("E_REGION_WITHOUT_IMAGE",
      "--region requires at least one --image");
  }
  // 2. --prompt missing AND --image absent (sub-plan 2 tightens the
  // predicate; the code name was chosen forward-compatibly in sub-plan 1
  // so no rename is needed). In continuation mode we accept --prompt OR
  // --region as the instruction and do not require --image.
  if (inContinuation) {
    if (!args.prompt &&
        (!args.region || args.region.length === 0)) {
      return fail("E_EDIT_NEEDS_INSTRUCTION",
        "--history-continue requires --prompt or --region to describe the next turn");
    }
  } else if (!args.prompt && (!args.image || args.image.length === 0)) {
    return fail("E_MISSING_PROMPT_OR_IMAGE",
      "--prompt is required (or provide --image with --region/instruction)");
  }
  // 23. --image present but no --prompt AND no --region → model has
  // nothing to do (sub-plan 2). Still applies in continuation mode when
  // the user adds current-turn --image references.
  if (args.image && args.image.length > 0 &&
      (!args.prompt) &&
      (!args.region || args.region.length === 0)) {
    return fail("E_EDIT_NEEDS_INSTRUCTION",
      "--image requires --prompt or --region to describe the edit");
  }
  // 3. --output missing
  if (!args.output) {
    return fail("E_MISSING_OUTPUT", "--output is required");
  }
  // 4. --output extension not in valid set
  {
    const ext = path.extname(args.output).toLowerCase();
    if (!VALID_OUTPUT_EXTS.includes(ext)) {
      return fail("E_BAD_OUTPUT_EXT",
        `--output extension "${ext}" not in {${VALID_OUTPUT_EXTS.join(",")}}`);
    }
  }
  // 5. --model not in known set
  const model = args.model || DEFAULT_MODEL;
  if (!VALID_MODELS.includes(model)) {
    return fail("E_UNKNOWN_MODEL",
      `--model "${model}" not in {${VALID_MODELS.join(",")}}`);
  }
  // 5b. --style slug not in catalog (Phase 2)
  if (stylesIndex && args.styles && args.styles.length > 0) {
    for (const slug of args.styles) {
      if (!stylesIndex.byKey.has(slug)) {
        return fail("E_UNKNOWN_STYLE",
          `--style "${slug}" is not a known style slug; see styles.json`);
      }
    }
  }
  // 6. --aspect not in 14-valid set
  const aspect = args.aspect || DEFAULT_ASPECT;
  if (!VALID_ASPECTS.includes(aspect)) {
    return fail("E_BAD_ASPECT",
      `--aspect "${aspect}" not in {${VALID_ASPECTS.join(",")}}`);
  }
  // 7. --size not in valid set
  const size = args.size || DEFAULT_SIZE;
  if (!VALID_SIZES.includes(size)) {
    return fail("E_BAD_SIZE",
      `--size "${size}" not in {${VALID_SIZES.join(",")}} (uppercase K required)`);
  }
  // 8. --size 512 with non-flash-3.1 model
  if (size === "512" && model !== FLASH_MODEL) {
    return fail("E_SIZE_MODEL_MISMATCH",
      `--size 512 only valid with --model ${FLASH_MODEL}`);
  }
  // 9. --thinking not in valid set (only if set)
  if (args.thinking !== undefined && !VALID_THINKING.includes(args.thinking)) {
    return fail("E_BAD_THINKING",
      `--thinking "${args.thinking}" not in {${VALID_THINKING.join(",")}}`);
  }
  // 10. --thinking minimal with non-flash model
  if (args.thinking === "minimal" && model !== FLASH_MODEL) {
    return fail("E_THINKING_MODEL_MISMATCH",
      `--thinking minimal only valid with --model ${FLASH_MODEL}`);
  }
  // 11. --seed not integer
  if (args.seed !== undefined) {
    const n = Number(args.seed);
    if (!Number.isFinite(n) || !Number.isInteger(n) || args.seed.trim() === "") {
      return fail("E_BAD_SEED", `--seed "${args.seed}" is not an integer`);
    }
  }
  // 12. --temperature not finite
  if (args.temperature !== undefined) {
    const n = Number(args.temperature);
    if (!Number.isFinite(n) || args.temperature.trim() === "") {
      return fail("E_BAD_TEMP", `--temperature "${args.temperature}" is not a finite number`);
    }
  }
  // 13-14. --safety validation (category unknown / threshold unknown).
  // Also detect duplicates and emit stderr warning (once per category).
  {
    const seen = new Map(); // canonical category → last threshold
    const warned = new Set();
    for (const entry of args.safety) {
      const eq = entry.indexOf("=");
      if (eq < 0) {
        return fail("E_BAD_SAFETY_CAT",
          `--safety "${entry}" must be CATEGORY=THRESHOLD`);
      }
      const rawCat = entry.slice(0, eq).trim().toLowerCase();
      const rawThr = entry.slice(eq + 1).trim().toLowerCase();
      const cat = SAFETY_CATEGORY_ALIASES[rawCat];
      if (!cat) {
        return fail("E_BAD_SAFETY_CAT",
          `--safety category "${entry.slice(0, eq)}" is not recognized`);
      }
      const thr = SAFETY_THRESHOLD_ALIASES[rawThr];
      if (!thr) {
        return fail("E_BAD_SAFETY_THRESHOLD",
          `--safety threshold "${entry.slice(eq + 1)}" is not recognized`);
      }
      if (seen.has(cat) && !warned.has(cat)) {
        process.stderr.write(
          `nanogen: --safety ${cat} specified multiple times; using last value\n`
        );
        warned.add(cat);
      }
      seen.set(cat, thr);
    }
  }
  // 15-19. --image checks
  for (const imgPath of args.image) {
    // 15. file does not exist
    let stat;
    try {
      stat = fs.statSync(imgPath);
    } catch (_) {
      return fail("E_IMAGE_NOT_FOUND",
        `--image "${imgPath}" does not exist`);
    }
    // 16. extension not in valid set
    const ext = path.extname(imgPath).toLowerCase();
    if (!VALID_IMAGE_EXTS.includes(ext)) {
      return fail("E_BAD_IMAGE_EXT",
        `--image "${imgPath}" extension "${ext}" not in {${VALID_IMAGE_EXTS.join(",")}}`);
    }
    // 17. file size == 0
    if (stat.size === 0) {
      return fail("E_IMAGE_EMPTY",
        `--image "${imgPath}" is empty`);
    }
    // 18. file size > 15 MB raw
    if (stat.size > MAX_IMAGE_BYTES) {
      return fail("E_IMAGE_TOO_LARGE",
        `--image "${imgPath}" size ${stat.size} exceeds ${MAX_IMAGE_BYTES} bytes`);
    }
    // 19. magic-byte check vs declared extension
    let fd, head;
    try {
      fd = fs.openSync(imgPath, "r");
      head = Buffer.alloc(12);
      fs.readSync(fd, head, 0, 12, 0);
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {}
    }
    if (!magicMatches(head, ext)) {
      return fail("E_IMAGE_MIME_MISMATCH",
        `--image "${imgPath}" magic bytes do not match declared extension "${ext}"`);
    }
  }
  // 20. --image count > 14
  if (args.image.length > MAX_IMAGE_COUNT) {
    return fail("E_TOO_MANY_IMAGES",
      `--image count ${args.image.length} exceeds ${MAX_IMAGE_COUNT}`);
  }
  // 21. Unknown flag
  if (args.unknownFlag !== undefined) {
    return fail("E_UNKNOWN_FLAG",
      `unknown flag: ${args.unknownFlag}`);
  }

  return { ok: true };
}

function fail(code, error) {
  return { ok: false, code, error };
}

// Thin wrapper over magicBytes.matchesExt; kept here so rule-19 validation
// code remains readable at its call site. Input validation (rule 19) and
// output validation (parseResponse) share the underlying helper.
function magicMatches(head, ext) {
  return magicBytes.matchesExt(head, ext);
}

// ---------------------------------------------------------------------------
// --help free-form text
// ---------------------------------------------------------------------------

function printHelp() {
  const lines = [
    "Usage: nanogen --prompt \"<text>\" --output <path> [options]",
    "",
    "Generate images via Google's Gemini Nano Banana models.",
    "",
    "Required flags:",
    "  --prompt <str>           Text prompt. Required unless --image + (--region or explicit edit instruction) provided.",
    "  --output <path>          Output file path. Ext ∈ {.png,.jpg,.jpeg,.webp}.",
    "",
    "Optional flags:",
    "  --model <id>             Model id. Default: " + DEFAULT_MODEL + ".",
    "                           Valid: " + VALID_MODELS.join(", "),
    "  --aspect <ratio>         Aspect ratio. Default: " + DEFAULT_ASPECT + ".",
    "                           Valid: " + VALID_ASPECTS.join(", "),
    "  --size <level>           Image size. Default: " + DEFAULT_SIZE + ".",
    "                           Valid: " + VALID_SIZES.join(", ") + " (UPPERCASE K required).",
    "                           512 is flash-3.1 only.",
    "  --thinking <level>       Thinking level. Omitted → API default.",
    "                           Valid: " + VALID_THINKING.join(", ") + ".",
    "                           'minimal' is flash-3.1 only.",
    "  --seed <int>             Integer seed.",
    "  --temperature <float>    Sampling temperature.",
    "  --style <slug>           Style preset (repeatable). See styles.json.",
    "  --negative <str>         Negative prompt fragment (repeatable).",
    "  --safety <cat=thr>       Safety override (repeatable).",
    "                           Categories: harassment, hate_speech, sexually_explicit,",
    "                                       dangerous_content, civic_integrity",
    "                           Thresholds: block_none, block_only_high,",
    "                                       block_medium_and_above, block_low_and_above, off",
    "  --image <path>           Input image (repeatable, up to 14).",
    "                           Ext ∈ {.png,.jpg,.jpeg,.webp}.",
    "  --region <description>   Natural-language region guidance (repeatable).",
    "                           Requires --image. Prose only (no bitmap masks).",
    "  --history-id <str>       Override auto-derived history id.",
    "  --history-parent <str>   Link this generation to a parent entry.",
    "  --history-continue <id>  Continue an earlier generation as a",
    "                           multi-turn edit (round-trips the prior",
    "                           thoughtSignature). Mutually exclusive",
    "                           with --history-parent.",
    "  --no-history             Skip history append.",
    "  --dry-run                Print would-be request as JSON, exit 0.",
    "  --help, -h               Show this help.",
    "",
    "Examples:",
    "  nanogen --prompt \"a red apple on a marble table\" --output apple.png",
    "",
    "EDIT MODE (one or more --image; --prompt OR --region required):",
    "  nanogen --image cat.png --region \"replace the background with a beach\" --output cat-beach.png",
    "  nanogen --image orig.png --image ref.png --prompt \"apply the lighting from the second image to the first\" --output lit.png",
    "",
    "Get a key at https://aistudio.google.com/app/apikey; set GEMINI_API_KEY",
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// Phase 3 — Pure Request Builder + Response Parser
// ---------------------------------------------------------------------------
//
// Two-layer split:
//
//   readImageMaterials(args)
//     — I/O wrapper: reads each --image path from disk, returns buffers.
//
//   buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex)
//     — PURE (no filesystem I/O). Takes pre-read buffers. Produces the
//       {url, headers, body} tuple used by --dry-run and (Phase 4) the
//       real HTTP call. Golden-testable via structural equality.
//
// The pure builder DOES read one env var — NANOGEN_API_BASE — which is the
// single documented exception (see plan Phase 3). Golden tests unset it in
// withCleanEnv so the production default pins into the goldens.
//
// Fields EXPLICITLY OMITTED from the body (documented here so nobody adds
// them "just in case"): response_format, output_format, n, quality,
// background, negativePrompt. All are OpenAI-only; Gemini either ignores
// or 400s on them. See plan Phase 3 "Fields explicitly OMITTED" block.

// Map from --image file extension (lowercase, with leading dot) to MIME type.
function mimeTypeForExt(ext) {
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  // .jpg and .jpeg both map to image/jpeg
  return "image/jpeg";
}

// I/O wrapper: reads each --image path into a Buffer and attaches a MIME
// type derived from the file extension. Invocation order is preserved so
// callers can feed the resulting array directly to the pure builder.
//
// Throws on any read failure; Phase 1's validateArgs has already confirmed
// existence and size, so a failure here is unusual (permissions, race).
function readImageMaterials(args) {
  const imageMaterials = [];
  for (const p of args.image) {
    const buffer = fs.readFileSync(p);
    const ext = path.extname(p).toLowerCase();
    imageMaterials.push({
      buffer,
      mimeType: mimeTypeForExt(ext),
      path: p,
    });
  }
  return { imageMaterials };
}

// Compose the final prompt text per the plan's deterministic order:
//   1. base text
//        - In sub-plan 2 EDIT MODE (args.image.length > 0 AND
//          args.prompt is empty/undefined AND args.region.length > 0)
//          the base is the pinned boilerplate "Edit the provided image(s)."
//          Goldens pin this exact string — do NOT reword.
//        - Otherwise base = args.prompt || "".
//   2. styles (applyStyles appends " Style: <frags joined by space>.")
//   3. region (" Region: <regions joined by '; '>.") — sub-plan 2
//   4. negative (" Avoid: <neg joined by '; '>.")
// Pure — no I/O. Composition order is load-bearing for request goldens;
// any reorder breaks tests loudly.
function composePromptText(args, stylesIndex) {
  const hasImage = Array.isArray(args.image) && args.image.length > 0;
  const hasRegion = Array.isArray(args.region) && args.region.length > 0;
  const hasContinuation = args.historyContinue !== undefined &&
                          args.historyContinue !== null;
  const promptEmpty = !args.prompt;
  let promptText;
  // Edit-mode boilerplate when: there IS an implicit image (either
  // current --image OR a prior model-turn image via --history-continue)
  // AND no explicit --prompt AND a --region instruction. Sub-plan 2
  // Phase 1 defines this for --image; Phase 2 extends it to continuation
  // so "--history-continue X --region Y" composes coherent text rather
  // than the accidental " Region: Y." with a leading space.
  if ((hasImage || hasContinuation) && promptEmpty && hasRegion) {
    promptText = "Edit the provided image(s).";
  } else {
    promptText = args.prompt || "";
  }
  if (stylesIndex && args.styles && args.styles.length > 0) {
    promptText = applyStyles(promptText, args.styles, stylesIndex);
  }
  if (hasRegion) {
    promptText = promptText + " Region: " + args.region.join("; ") + ".";
  }
  if (args.negative && args.negative.length > 0) {
    promptText = promptText + " Avoid: " + args.negative.join("; ") + ".";
  }
  return promptText;
}

// Canonicalize a parsed --safety entry into {category, threshold}. This
// relies on validateArgs having already confirmed both sides are valid,
// so missing-alias is not a runtime concern here. Duplicate categories
// collapse with last-wins semantics (matches the stderr warning).
function canonicalSafetySettings(safetyEntries) {
  const byCat = new Map();
  for (const entry of safetyEntries) {
    const eq = entry.indexOf("=");
    const rawCat = entry.slice(0, eq).trim().toLowerCase();
    const rawThr = entry.slice(eq + 1).trim().toLowerCase();
    const category = SAFETY_CATEGORY_ALIASES[rawCat];
    const threshold = SAFETY_THRESHOLD_ALIASES[rawThr];
    byCat.set(category, threshold);
  }
  const out = [];
  for (const [category, threshold] of byCat.entries()) {
    out.push({ category, threshold });
  }
  return out;
}

// PURE: builds {url, headers, body}. No filesystem I/O. Reads
// NANOGEN_API_BASE from process.env (sole documented env access inside the
// pure layer) — golden tests explicitly UNSET it via withCleanEnv so the
// default prod host pins into the goldens.
function buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex) {
  const base = process.env.NANOGEN_API_BASE ||
               "https://generativelanguage.googleapis.com";
  const model = args.model || DEFAULT_MODEL;
  const url = `${base}/v1beta/models/${model}:generateContent`;

  // The builder emits a placeholder that the CLI entrypoint overwrites at
  // send time (real key) or dry-run time (redacted). Golden tests pin the
  // placeholder text, so NEVER change this string without regenerating
  // every request golden.
  const headers = {
    "x-goog-api-key": "<resolved-at-send-time>",
    "Content-Type": "application/json",
  };

  // Prompt + zero-or-more inlineData parts, in invocation order.
  const promptText = composePromptText(args, stylesIndex);
  const parts = [{ text: promptText }];
  if (imageMaterials && imageMaterials.length > 0) {
    for (const m of imageMaterials) {
      parts.push({
        inlineData: {
          mimeType: m.mimeType,
          data: m.buffer.toString("base64"),
        },
      });
    }
  }

  const generationConfig = {
    responseModalities: ["IMAGE"],
    imageConfig: {
      aspectRatio: args.aspect || DEFAULT_ASPECT,
      imageSize: args.size || DEFAULT_SIZE,
    },
    candidateCount: 1,
  };

  // Optional fields — only present when the user set them. The plan pins
  // goldens for both the present and absent cases.
  if (args.thinking !== undefined) {
    generationConfig.thinkingConfig = { thinkingLevel: args.thinking };
  }
  if (args.seed !== undefined) {
    generationConfig.seed = Number(args.seed);
  }
  if (args.temperature !== undefined) {
    generationConfig.temperature = Number(args.temperature);
  }

  const body = {
    contents: [{ parts }],
    generationConfig,
  };

  // safetySettings: OMIT entirely when no --safety flag. NEVER emit [].
  if (args.safety && args.safety.length > 0) {
    body.safetySettings = canonicalSafetySettings(args.safety);
  }

  return { url, headers, body };
}

// ---------------------------------------------------------------------------
// Sub-plan 2 Phase 2 — --history-continue (multi-turn + thoughtSignature)
// ---------------------------------------------------------------------------
//
// resolveContinuation(args, cwd) — I/O wrapper. Loads history, locates the
// entry matching args.historyContinue, reads the prior output bytes from
// disk, maps the MIME, and emits a pinned stderr warning on model
// mismatch. Returns {priorEntry, priorBytes, priorMime} OR
// {code, error} on any of the six E_CONTINUE_* failure paths.
//
// buildContinuationRequestFromMaterials(args, imageMaterials, stylesIndex,
//   priorEntry, priorBytes, priorMime) — PURE. Assembles the 3-turn
// {role:user, role:model, role:user} contents body, round-tripping
// priorEntry.thoughtSignature verbatim.

// Map from history-row outputFormat string to MIME. History rows record
// the FORMAT only (one of "png"/"jpeg"/"webp"), derived from the API's
// returned mimeType at write time.
const OUTPUT_FORMAT_TO_MIME = {
  "png": "image/png",
  "jpeg": "image/jpeg",
  "webp": "image/webp",
};

function resolveContinuation(args, cwd) {
  // 1. Load history (tolerant reader).
  const entries = readHistory(cwd);
  // 2. Exact-match lookup. We deliberately do NOT prefix-match here
  // (unlike --history-parent): an ambiguous continuation would round-trip
  // the wrong thoughtSignature and the model would 400 in a confusing way.
  let priorEntry = null;
  for (const e of entries) {
    if (e && typeof e.id === "string" && e.id === args.historyContinue) {
      priorEntry = e;
      break;
    }
  }
  if (!priorEntry) {
    return fail("E_CONTINUE_UNKNOWN_ID",
      `--history-continue id "${args.historyContinue}" not found in .nanogen-history.jsonl`);
  }
  // 3. Refused entries have no signature and often no valid image — cannot continue.
  if (priorEntry.refusalReason !== null && priorEntry.refusalReason !== undefined) {
    return fail("E_CONTINUE_REFUSED_ENTRY",
      `--history-continue entry "${priorEntry.id}" was refused (${priorEntry.refusalReason}); cannot continue`);
  }
  // 4. No thoughtSignature on prior entry → cannot round-trip a sig.
  if (priorEntry.thoughtSignature === null || priorEntry.thoughtSignature === undefined) {
    return fail("E_CONTINUE_NO_SIGNATURE",
      `--history-continue entry "${priorEntry.id}" has no thoughtSignature; cannot continue (pre-Gemini-3 or non-continuable response)`);
  }
  // 5. Read the prior output file. History stores output as the path the
  // user gave; we resolve relative to cwd here (matching how appendHistory
  // ran).
  const outPath = path.isAbsolute(priorEntry.output)
    ? priorEntry.output
    : path.join(cwd || process.cwd(), priorEntry.output);
  let priorBytes;
  try {
    priorBytes = fs.readFileSync(outPath);
  } catch (err) {
    return fail("E_CONTINUE_MISSING_OUTPUT",
      `--history-continue output file "${priorEntry.output}" is missing or unreadable: ${err && err.message || String(err)}`);
  }
  // 6. MIME resolution: outputFormat map, then magic-byte fallback.
  let priorMime = null;
  if (priorEntry.outputFormat && OUTPUT_FORMAT_TO_MIME[priorEntry.outputFormat]) {
    priorMime = OUTPUT_FORMAT_TO_MIME[priorEntry.outputFormat];
  } else {
    const kind = magicBytes.detectMagic(priorBytes);
    if (kind && OUTPUT_FORMAT_TO_MIME[kind]) {
      priorMime = OUTPUT_FORMAT_TO_MIME[kind];
    }
  }
  if (!priorMime) {
    return fail("E_CONTINUE_UNKNOWN_MIME",
      `--history-continue entry "${priorEntry.id}" has unknown outputFormat and magic-byte probe did not identify the bytes`);
  }
  // 7. Model mismatch → pinned stderr warning (does NOT block).
  const priorModel = (priorEntry.params && priorEntry.params.model) || null;
  const currentModel = args.model || DEFAULT_MODEL;
  if (priorModel && priorModel !== currentModel) {
    process.stderr.write(
      `nanogen: --history-continue source used model "${priorModel}"; continuing with model "${currentModel}". Gemini may 400 on thoughtSignature format mismatch.\n`
    );
  }
  return { ok: true, priorEntry, priorBytes, priorMime };
}

// PURE. Builds the 3-turn continuation {url, headers, body}. Same generationConfig
// and safetySettings rules as single-turn. No filesystem I/O.
//
// Shape (load-bearing — pinned by goldens):
//   contents[0] = { role: "user",  parts: [ { text: priorEntry.prompt } ] }
//   contents[1] = { role: "model", parts: [ inlineData(priorBytes),
//                                            { thoughtSignature } ] }
//   contents[2] = { role: "user",  parts: [ { text: composedCurrent },
//                                            ...current inlineData... ] }
//
// We do NOT replay prior user images: the model's output already reflects
// them. This is documented in the sub-plan 2 Design & Constraints.
function buildContinuationRequestFromMaterials(
  args, imageMaterials, stylesIndex, priorEntry, priorBytes, priorMime
) {
  const base = process.env.NANOGEN_API_BASE ||
               "https://generativelanguage.googleapis.com";
  const model = args.model || DEFAULT_MODEL;
  const url = `${base}/v1beta/models/${model}:generateContent`;

  const headers = {
    "x-goog-api-key": "<resolved-at-send-time>",
    "Content-Type": "application/json",
  };

  // Turn 1 (historical user). We reconstruct the prior user turn with
  // JUST its prompt text. Prior user images are NOT replayed — see
  // Design & Constraints in SUB_2_EDIT_FLOW.md.
  const userTurn1 = {
    role: "user",
    parts: [{ text: priorEntry.prompt || "" }],
  };

  // Turn 2 (historical model). inlineData (prior output bytes) +
  // thoughtSignature verbatim. This is the critical Gemini-3 gotcha:
  // the sig must be byte-for-byte identical to what the API returned.
  //
  // Gemini requires the thoughtSignature to live ON the SAME part object
  // as the inlineData, not as a sibling part. Splitting them yields:
  //   400: "Image part is missing a thought_signature in content
  //         position 2, part position 1"
  // (per the live API, 2026-04-17 — Flash 3.1). The parseResponse
  // reader handles the field appearing anywhere on the part, so merging
  // here is safe for round-trip.
  const modelTurn = {
    role: "model",
    parts: [
      {
        inlineData: {
          mimeType: priorMime,
          data: priorBytes.toString("base64"),
        },
        thoughtSignature: priorEntry.thoughtSignature,
      },
    ],
  };

  // Turn 3 (current user). Composed prompt (current --prompt/--style/
  // --region/--negative) + current-turn inlineData parts in order.
  const currentText = composePromptText(args, stylesIndex);
  const currentParts = [{ text: currentText }];
  if (imageMaterials && imageMaterials.length > 0) {
    for (const m of imageMaterials) {
      currentParts.push({
        inlineData: {
          mimeType: m.mimeType,
          data: m.buffer.toString("base64"),
        },
      });
    }
  }
  const userTurn2 = { role: "user", parts: currentParts };

  const generationConfig = {
    responseModalities: ["IMAGE"],
    imageConfig: {
      aspectRatio: args.aspect || DEFAULT_ASPECT,
      imageSize: args.size || DEFAULT_SIZE,
    },
    candidateCount: 1,
  };
  if (args.thinking !== undefined) {
    generationConfig.thinkingConfig = { thinkingLevel: args.thinking };
  }
  if (args.seed !== undefined) {
    generationConfig.seed = Number(args.seed);
  }
  if (args.temperature !== undefined) {
    generationConfig.temperature = Number(args.temperature);
  }

  const body = {
    contents: [userTurn1, modelTurn, userTurn2],
    generationConfig,
  };
  if (args.safety && args.safety.length > 0) {
    body.safetySettings = canonicalSafetySettings(args.safety);
  }

  return { url, headers, body };
}

// ---------------------------------------------------------------------------
// parseResponse — PURE. Implements the plan's exact 8-step decision tree.
//
// Input: the parsed JSON object from a Gemini generateContent response.
// Output:
//   {
//     image:             Buffer|null,
//     text:              string|null,
//     finishReason:      string|null,
//     thoughtSignature:  string|null,
//     refusalReason:     string|null,
//     promptBlockReason: string|null,
//     responseMimeType:  string|null,
//     unknownParts:      string[]
//   }
//
// Refusal taxonomy (all 8 paths must be producible):
//   prompt-blocked:<blockReason>  (e.g. prompt-blocked:SAFETY)
//   finish:SAFETY
//   finish:PROHIBITED_CONTENT
//   finish:IMAGE_SAFETY
//   finish:RECITATION
//   soft-refusal:no-image         (finishReason=STOP, only text parts)
//   no-candidates                 (candidates array missing / empty)
//   bad-image-bytes               (base64 decoded but failed magic check)
// ---------------------------------------------------------------------------

const REFUSAL_FINISH_REASONS = new Set([
  "SAFETY",
  "PROHIBITED_CONTENT",
  "IMAGE_SAFETY",
  "RECITATION",
]);
const KNOWN_PART_KEYS = new Set(["text", "inlineData", "thoughtSignature"]);

function parseResponse(json) {
  // 1. init
  const result = {
    image: null,
    text: null,
    finishReason: null,
    thoughtSignature: null,
    refusalReason: null,
    promptBlockReason: null,
    responseMimeType: null,
    unknownParts: [],
  };
  if (!json || typeof json !== "object") {
    // Be defensive; treat non-object as missing candidates.
    result.refusalReason = "no-candidates";
    return result;
  }

  // 2. promptFeedback.blockReason — capture + mark refusal, but do NOT
  //    early-return: the model may still have returned a thoughtSignature
  //    or text in candidates[0] that we want to surface.
  const pf = json.promptFeedback;
  if (pf && typeof pf === "object" && pf.blockReason) {
    result.promptBlockReason = pf.blockReason;
    result.refusalReason = "prompt-blocked:" + pf.blockReason;
  }

  // 3. candidate extraction
  const candidates = json.candidates;
  const candidate = Array.isArray(candidates) ? candidates[0] : undefined;
  if (!candidate) {
    if (result.refusalReason === null) {
      result.refusalReason = "no-candidates";
    }
    return result;
  }

  // 4. finishReason
  result.finishReason = (candidate.finishReason !== undefined &&
                         candidate.finishReason !== null)
    ? candidate.finishReason : null;

  // 5. refusal-by-finishReason. Does NOT early-return; we still collect
  //    signatures and text.
  if (result.finishReason && REFUSAL_FINISH_REASONS.has(result.finishReason)) {
    if (result.refusalReason === null) {
      result.refusalReason = "finish:" + result.finishReason;
    }
  }

  // 6. walk parts
  const content = candidate.content;
  const parts = (content && Array.isArray(content.parts)) ? content.parts : [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;

    // thoughtSignature — capture if present on any part. Last-wins.
    if ("thoughtSignature" in part && part.thoughtSignature !== undefined) {
      result.thoughtSignature = part.thoughtSignature;
    }

    // inlineData — attempt base64 decode + magic-byte validation.
    if (part.inlineData && typeof part.inlineData === "object" &&
        typeof part.inlineData.data === "string") {
      const buf = Buffer.from(part.inlineData.data, "base64");
      if (buf.length > 0 && magicBytes.detectMagic(buf) !== null) {
        result.image = buf;
        result.responseMimeType = (part.inlineData.mimeType !== undefined &&
                                   part.inlineData.mimeType !== null)
          ? part.inlineData.mimeType : null;
      } else if (result.refusalReason === null) {
        result.refusalReason = "bad-image-bytes";
      }
    }

    // text — accumulate with \n separator.
    if (typeof part.text === "string") {
      result.text = result.text === null
        ? part.text
        : (result.text + "\n" + part.text);
    }

    // unknownParts — any key outside the known trio is recorded for
    // forward-compat observability.
    for (const key of Object.keys(part)) {
      if (!KNOWN_PART_KEYS.has(key)) {
        result.unknownParts.push(key);
      }
    }
  }

  // 7. soft refusal: model finished cleanly but emitted no valid image.
  if (result.image === null && result.refusalReason === null) {
    result.refusalReason = "soft-refusal:no-image";
  }

  // 8. done.
  return result;
}

// ---------------------------------------------------------------------------
// Phase 4 — Env-Var Resolution (hand-rolled .env parser)
// ---------------------------------------------------------------------------
//
// We deliberately do NOT call process.loadEnvFile. Two verified pitfalls:
//   (1) It throws on missing files. We'd need a try/catch anyway.
//   (2) It does NOT overwrite already-set env vars. Critical: if
//       GEMINI_API_KEY="" (common in CI zeroing) the .env's real value
//       will NOT replace it. Our manual parser handles this by treating
//       empty pre-set values as absent (step 1 of resolveApiKey).
//
// The hand-rolled parser is 10 lines, zero deps, no shell substitution —
// simpler than fighting loadEnvFile's quirks.

function parseDotenvSync(p) {
  // Treat empty values as absent: callers assume `parsed.KEY` is truthy
  // only when there's actually a value. This matches the spec's
  // E_MISSING_API_KEY path when .env has `GEMINI_API_KEY=""`.
  const out = {};
  let txt;
  try {
    txt = fs.readFileSync(p, "utf8");
  } catch (_) {
    // Unreadable (perm 000, race-deletion) → act like empty.
    return out;
  }
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
      (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
    ) {
      v = v.slice(1, -1);
    }
    // Empty values are NOT added to the map → treated as absent by callers.
    if (v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

function findDotenvFile() {
  const results = [];
  const seen = new Set();
  function walk(dir) {
    while (true) {
      const p = path.join(dir, ".env");
      if (!seen.has(p)) {
        seen.add(p);
        try {
          if (fs.statSync(p).isFile()) results.push(p);
        } catch (_) {
          // statSync throws if missing or unreadable; swallow and continue.
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  walk(process.cwd());
  walk(__dirname);
  return results;
}

function resolveApiKey() {
  // Step 1: check pre-set env; treat "" as unset (loadEnvFile pitfall #2).
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
  // Step 2: .env lookup. If NANOGEN_DOTENV_PATH is set, consult ONLY that
  // path (no walking). This is a test-isolation hook: tests working in a
  // tempdir pin the path to their controlled .env and bypass the walker
  // entirely, preventing the production walker from reaching the repo's
  // real .env via __dirname. In production (env var unset) the walker
  // runs normally: cwd upward first, then __dirname upward.
  const explicit = process.env.NANOGEN_DOTENV_PATH;
  const candidates = (typeof explicit === "string" && explicit.length > 0)
    ? [explicit]
    : findDotenvFile();
  for (const p of candidates) {
    let parsed;
    try {
      parsed = parseDotenvSync(p);
    } catch (_) {
      // Missing file or unreadable — skip. Matches findDotenvFile's silent
      // behavior. For NANOGEN_DOTENV_PATH=/nonexistent this returns null,
      // which is what the "no .env anywhere" test wants.
      continue;
    }
    if (parsed.GEMINI_API_KEY) {
      return { key: parsed.GEMINI_API_KEY, source: `.env:${p}:GEMINI_API_KEY` };
    }
    if (parsed.GOOGLE_API_KEY) {
      process.stderr.write(
        "nanogen: using GOOGLE_API_KEY. Prefer GEMINI_API_KEY to match Gemini docs.\n"
      );
      return { key: parsed.GOOGLE_API_KEY, source: `.env:${p}:GOOGLE_API_KEY` };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phase 4 — HTTP Client (retry, error mapping)
// ---------------------------------------------------------------------------
//
// Retry policy:
//   - Retryable: HTTP 429/500/502/503, network TypeError, AbortError (timeout).
//   - Non-retryable: any other HTTP status, body-parse failures (body
//     claimed JSON but wasn't — retrying likely repeats the failure).
//   - Retry-After header: integer seconds, honored when 1..60 inclusive
//     AND the response is retryable. Non-numeric or out-of-range → ignore
//     and fall back to exponential.
//   - Jitter: delay = base * 2^(attempt-1); jittered = delay + (rand-0.5)*delay.
//   - Body passed as string to fetch(), so the payload is fully replayable
//     across retries (no streams).
//   - Exhausted retries → throw with LAST status + first 500 chars of body.

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);

function getRetryConfig() {
  return {
    MAX_RETRIES: Number(process.env.NANOGEN_MAX_RETRIES) || 3,
    BASE_DELAY_MS: Number(process.env.NANOGEN_RETRY_BASE_MS) || 1000,
    FETCH_TIMEOUT_MS: Number(process.env.NANOGEN_FETCH_TIMEOUT_MS) || 120000,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoff(attempt, baseMs) {
  const delay = baseMs * Math.pow(2, attempt - 1);
  return delay + (Math.random() - 0.5) * delay;
}

// Returns a numeric millisecond delay if Retry-After is present, numeric,
// and within 1..60 seconds (inclusive). Otherwise returns null so the
// caller falls back to exponential backoff.
function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const trimmed = String(headerValue).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > 60) return null;
  return n * 1000;
}

// Thrown when the response body cannot be parsed. Non-retryable by design.
class BodyParseError extends Error {
  constructor(message, bodySnippet) {
    super(message);
    this.name = "BodyParseError";
    this.bodySnippet = bodySnippet;
    this.nonRetryable = true;
  }
}

// Thrown when all retries are exhausted.
class HttpRetryError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "HttpRetryError";
    this.status = status;
    this.body = body;
  }
}

// Thrown when all retries exhaust on network/abort errors.
class NetworkRetryError extends Error {
  constructor(message, lastError) {
    super(message);
    this.name = "NetworkRetryError";
    this.lastError = lastError;
  }
}

// fetchWithRetry — issues an HTTP request and retries on transient errors.
// Returns `{status, headers, bodyText}` on a final non-retryable response
// (including 2xx, 4xx non-429, etc.). Throws on exhausted retries or
// body-parse failure.
async function fetchWithRetry(url, init) {
  const cfg = getRetryConfig();
  const totalAttempts = cfg.MAX_RETRIES + 1;

  let lastStatus = null;
  let lastBody = "";
  let lastError = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    let res;
    try {
      const signal = AbortSignal.timeout(cfg.FETCH_TIMEOUT_MS);
      res = await fetch(url, Object.assign({}, init, { signal }));
    } catch (err) {
      // TypeError from fetch → network. AbortError from timeout → retry.
      lastError = err;
      const isTimeout = err && (err.name === "AbortError" ||
                                err.name === "TimeoutError" ||
                                (err.code === "ABORT_ERR"));
      const isNetwork = err && err.name === "TypeError";
      if (!isTimeout && !isNetwork) {
        // Non-retryable fetch-phase error (programming bug, etc.).
        throw err;
      }
      if (attempt < totalAttempts) {
        await sleep(computeBackoff(attempt, cfg.BASE_DELAY_MS));
        continue;
      }
      // Exhausted retries on network/timeout — surface as generic upstream.
      throw new NetworkRetryError(
        `fetch failed after ${totalAttempts} attempts: ${err && err.message || err}`,
        err
      );
    }

    // Read body as text. Surface read failures as body-parse errors — not
    // retried because repeating likely fails the same way.
    let bodyText;
    try {
      bodyText = await res.text();
    } catch (err) {
      throw new BodyParseError(
        `response body read failed: ${err && err.message || err}`,
        ""
      );
    }

    lastStatus = res.status;
    lastBody = bodyText;

    // If the server declared JSON content-type but the body doesn't parse,
    // surface as non-retryable E_UNEXPECTED_HTTP per plan.
    const contentType = (res.headers && res.headers.get
      ? res.headers.get("content-type")
      : null) || "";
    const claimsJson = /\bjson\b/i.test(contentType);

    if (RETRYABLE_STATUSES.has(res.status)) {
      if (attempt < totalAttempts) {
        const retryAfterMs = parseRetryAfter(
          res.headers && res.headers.get ? res.headers.get("retry-after") : null
        );
        const delay = retryAfterMs !== null
          ? retryAfterMs
          : computeBackoff(attempt, cfg.BASE_DELAY_MS);
        await sleep(delay);
        continue;
      }
      // Retries exhausted; throw.
      throw new HttpRetryError(
        `HTTP ${res.status} after ${totalAttempts} attempts`,
        res.status,
        bodyText
      );
    }

    // Success or non-retryable error status. If the server claimed JSON
    // but the body is unparseable AND the status is 2xx, treat as body-parse
    // failure (the plan note: retrying body-parse failure likely repeats).
    if (res.status >= 200 && res.status < 300 && claimsJson) {
      try {
        JSON.parse(bodyText);
      } catch (err) {
        throw new BodyParseError(
          `response JSON parse failed: ${err && err.message || err}`,
          bodyText.slice(0, 500)
        );
      }
    }

    return {
      status: res.status,
      headers: res.headers,
      bodyText,
    };
  }

  // Unreachable, but keep exhaustive.
  throw new HttpRetryError(
    `HTTP retry loop exhausted`,
    lastStatus,
    lastBody
  );
}

// mapHttpError — map a final (post-retry) HTTP status + body to a stable
// error code per the plan's 11-row table. Body matching is case-insensitive.
function mapHttpError(status, body) {
  const b = String(body || "");
  const bLower = b.toLowerCase();

  if (status === 400) {
    const hasInvalidArgument = b.includes("INVALID_ARGUMENT");
    const matchesPolicy = /prompt|content|policy|safety/i.test(b);
    if (hasInvalidArgument && matchesPolicy) return "E_CONTENT_POLICY";
    const mentionsImage = /inline_data|image/i.test(b);
    const mentionsSize = /size|limit|mime/i.test(b);
    if (mentionsImage && mentionsSize) return "E_BAD_REQUEST_IMAGE";
    return "E_BAD_REQUEST";
  }
  if (status === 401) return "E_AUTH";
  if (status === 403) {
    if (/admin|workspace/i.test(bLower)) return "E_ADMIN_DISABLED";
    if (/country|region|not supported/i.test(bLower)) return "E_REGION";
    return "E_FORBIDDEN";
  }
  if (status === 404) return "E_MODEL_NOT_FOUND";
  if (status === 429) return "E_RATE_LIMIT";
  if (status === 500 || status === 502 || status === 503) return "E_UPSTREAM_5XX";
  return "E_UNEXPECTED_HTTP";
}

// ---------------------------------------------------------------------------
// Phase 5 — History JSONL (append-only, best-effort) + ID derivation
// ---------------------------------------------------------------------------
//
// History file: .nanogen-history.jsonl in the CALLER'S cwd. One JSON entry
// per line, terminated by \n. We never rewrite prior lines.
//
// POSIX O_APPEND atomicity only applies to writes <= PIPE_BUF (4096 bytes on
// Linux). A long thoughtSignature can push one entry past that, so truly
// concurrent nanogen invocations in the same cwd may interleave bytes. We
// do NOT introduce a lockfile by design — concurrent invocations are rare
// and the tolerant reader below absorbs any interleave.
//
// On write failure (EACCES/EROFS/etc.) we return a {warning} from
// appendHistory rather than fail the whole invocation.

const HISTORY_FILE = ".nanogen-history.jsonl";

// Derive a deterministic history id from --output. Same output path → same
// id. Distinct paths that slugify to the same string get different ids
// thanks to the sha-8 suffix (which hashes the ABSOLUTE path).
function deriveHistoryId(args) {
  if (args.historyId) return args.historyId;
  const outputNoExt = path.basename(args.output, path.extname(args.output));
  const slug = outputNoExt
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  const sha = crypto.createHash("sha1")
    .update(path.resolve(args.output))
    .digest("hex")
    .slice(0, 8);
  return (slug.length > 0 ? slug + "-" : "") + sha;
}

// Best-effort append. Returns {ok: true} on success or
// {warning: "..."} on EACCES/EROFS/etc — never throws.
function appendHistory(entry, cwd) {
  const dir = cwd || process.cwd();
  const line = JSON.stringify(entry) + "\n";
  try {
    fs.appendFileSync(path.join(dir, HISTORY_FILE), line, { flag: "a" });
    return { ok: true };
  } catch (err) {
    return {
      warning: "could not append: " + (err && err.message || String(err)),
    };
  }
}

// Tolerant reader: missing file → []; malformed lines silently skipped.
function readHistory(cwd) {
  const dir = cwd || process.cwd();
  const p = path.join(dir, HISTORY_FILE);
  let txt;
  try {
    txt = fs.readFileSync(p, "utf8");
  } catch (_) {
    return [];
  }
  const out = [];
  for (const line of txt.split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch (_) {
      // Skip malformed line — interleaved writes or legacy formats.
    }
  }
  return out;
}

// Build a history entry. `composedPrompt` is what was actually sent
// (post-style/post-negative). `responseMimeType` comes from parseResponse
// (may be null on refusal). `bytesWritten` is the size of the output file
// on disk (0 on refusal).
function buildHistoryEntry(args, composedPrompt, parsed, bytesWritten) {
  const declaredExt = path.extname(args.output || "").slice(1).toLowerCase();
  // Map the actual API MIME type to a canonical format name.
  const mimeToFmt = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/webp": "webp",
  };
  let outputFormat = null;
  if (parsed && parsed.image && parsed.responseMimeType &&
      mimeToFmt[parsed.responseMimeType]) {
    outputFormat = mimeToFmt[parsed.responseMimeType];
  }
  const entry = {
    id: deriveHistoryId(args),
    timestamp: new Date().toISOString(),
    prompt: composedPrompt,
    output: args.output,
    params: {
      model: args.model || DEFAULT_MODEL,
      aspectRatio: args.aspect || DEFAULT_ASPECT,
      imageSize: args.size || DEFAULT_SIZE,
      thinkingLevel: args.thinking !== undefined ? args.thinking : null,
      seed: args.seed !== undefined ? Number(args.seed) : null,
      temperature: args.temperature !== undefined ? Number(args.temperature) : null,
      styles: Array.isArray(args.styles) ? args.styles.slice() : [],
    },
    parentId: args.historyParent || null,
    bytes: bytesWritten,
    outputFormat,
    outputExtension: declaredExt || null,
    refusalReason: parsed && parsed.refusalReason ? parsed.refusalReason : null,
    thoughtSignature: parsed && parsed.thoughtSignature
      ? parsed.thoughtSignature : null,
  };
  if (Array.isArray(args.image) && args.image.length > 0) {
    entry.inputImages = args.image.slice();
  }
  return entry;
}

// Emit the pinned stderr warning when --history-parent does not match any
// existing history id. We do NOT fail the invocation.
function warnIfUnknownParent(args, cwd) {
  if (!args.historyParent) return;
  const entries = readHistory(cwd);
  const match = entries.some((e) =>
    e && typeof e.id === "string" && (
      e.id === args.historyParent ||
      e.id.startsWith(args.historyParent)
    )
  );
  if (!match) {
    process.stderr.write(
      `nanogen: --history-parent "${args.historyParent}" not found in .nanogen-history.jsonl; continuing anyway.\n`
    );
  }
}

// Map a declared file extension to its canonical format name for comparison
// with the API's returned mimeType. ".jpg" normalizes to "jpeg".
function normalizedExtFormat(ext) {
  const e = (ext || "").toLowerCase();
  if (e === "jpg" || e === "jpeg") return "jpeg";
  if (e === "png") return "png";
  if (e === "webp") return "webp";
  return null;
}

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

function emitError(code, error) {
  process.stdout.write(JSON.stringify({
    success: false,
    code,
    error,
  }) + "\n");
}

function emitDryRun(url, headers, body) {
  const redactedHeaders = Object.assign({}, headers, {
    "x-goog-api-key": "<redacted>",
  });
  process.stdout.write(JSON.stringify({
    dryRun: true,
    url,
    headers: redactedHeaders,
    body,
  }) + "\n");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  checkRuntime();

  // Phase 2: load + validate the style catalog BEFORE arg parsing so a
  // broken catalog fails deterministically regardless of user flags.
  let stylesIndex;
  try {
    stylesIndex = loadStyles();
    const cv = validateStyleCatalog(stylesIndex);
    if (!cv.ok) {
      emitError("E_BAD_STYLES_CATALOG", cv.error);
      process.exit(1);
    }
  } catch (e) {
    emitError("E_BAD_STYLES_CATALOG",
      "failed to load styles catalog: " + String(e && e.message || e));
    process.exit(1);
  }

  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const v = validateArgs(args, stylesIndex);
  if (!v.ok) {
    emitError(v.code, v.error);
    process.exit(1);
  }

  if (args.dryRun) {
    let imageMaterials;
    try {
      ({ imageMaterials } = readImageMaterials(args));
    } catch (e) {
      emitError("E_IMAGE_NOT_FOUND", String(e && e.message || e));
      process.exit(1);
    }
    // ONE decision point (sub-plan 2 Phase 2): --history-continue swaps
    // in the 3-turn continuation builder. All downstream flow (emit,
    // success JSON, history append) is the same. resolveContinuation is
    // also invoked in the HTTP path at runHttpFlow.
    let req;
    if (args.historyContinue !== undefined) {
      const resolved = resolveContinuation(args, process.cwd());
      if (!resolved.ok) {
        emitError(resolved.code, resolved.error);
        process.exit(1);
      }
      req = buildContinuationRequestFromMaterials(
        args, imageMaterials, stylesIndex,
        resolved.priorEntry, resolved.priorBytes, resolved.priorMime
      );
    } else {
      req = buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex);
    }
    emitDryRun(req.url, req.headers, req.body);
    process.exit(0);
  }

  // Phase 4 — real HTTP path. Phase 5 will add file writing + history;
  // this intermediate wiring is just enough to exercise fetchWithRetry +
  // mapHttpError + resolveApiKey end-to-end in the test harness.
  runHttpFlow(args, stylesIndex).then(
    (exitCode) => process.exit(exitCode),
    (err) => {
      // Unexpected error escaping the flow — emit as E_UNEXPECTED_HTTP.
      emitError("E_UNEXPECTED_HTTP",
        "unexpected error: " + (err && err.message || String(err)));
      process.exit(1);
    }
  );
}

async function runHttpFlow(args, stylesIndex) {
  // 1. API key resolution.
  const resolved = resolveApiKey();
  if (!resolved) {
    emitError("E_MISSING_API_KEY",
      "Set GEMINI_API_KEY (or GOOGLE_API_KEY as fallback). " +
      "See build/nanogen/README.md.");
    return 1;
  }

  // 2. Read input images (I/O) + build request (pure).
  let imageMaterials;
  try {
    ({ imageMaterials } = readImageMaterials(args));
  } catch (e) {
    emitError("E_IMAGE_NOT_FOUND", String(e && e.message || e));
    return 1;
  }
  // ONE decision point (sub-plan 2 Phase 2): --history-continue selects
  // the 3-turn continuation builder. Everything else (send, parse,
  // write, history) is unchanged.
  let url, headers, body;
  let continuationParentId = null;
  if (args.historyContinue !== undefined) {
    const resolved = resolveContinuation(args, process.cwd());
    if (!resolved.ok) {
      emitError(resolved.code, resolved.error);
      return 1;
    }
    const r = buildContinuationRequestFromMaterials(
      args, imageMaterials, stylesIndex,
      resolved.priorEntry, resolved.priorBytes, resolved.priorMime
    );
    url = r.url; headers = r.headers; body = r.body;
    continuationParentId = resolved.priorEntry.id;
  } else {
    const r = buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex);
    url = r.url; headers = r.headers; body = r.body;
  }

  // 3. Replace the pure builder's placeholder with the real key.
  const realHeaders = Object.assign({}, headers, {
    "x-goog-api-key": resolved.key,
  });

  // 4. Fire with retry.
  let res;
  try {
    res = await fetchWithRetry(url, {
      method: "POST",
      headers: realHeaders,
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof BodyParseError) {
      const snippet = err.bodySnippet || "";
      emitError("E_UNEXPECTED_HTTP",
        "upstream returned unparseable body: " + snippet.slice(0, 500));
      return 1;
    }
    if (err instanceof HttpRetryError) {
      const code = mapHttpError(err.status, err.body || "");
      const snippet = String(err.body || "").slice(0, 500);
      emitError(code,
        `HTTP ${err.status}${snippet ? ": " + snippet : ""}`);
      return 1;
    }
    if (err instanceof NetworkRetryError) {
      emitError("E_UPSTREAM_5XX",
        "upstream unreachable: " +
        (err.lastError && err.lastError.message || err.message));
      return 1;
    }
    // Unrecognized error — surface as unexpected.
    emitError("E_UNEXPECTED_HTTP",
      "unexpected error: " + (err && err.message || String(err)));
    return 1;
  }

  // 5. Non-2xx is already handled by fetchWithRetry (it throws HttpRetryError
  // on retryable exhaustion). For non-retryable non-2xx, we get here with
  // the response; map it.
  if (res.status < 200 || res.status >= 300) {
    const code = mapHttpError(res.status, res.bodyText || "");
    const snippet = String(res.bodyText || "").slice(0, 500);
    emitError(code, `HTTP ${res.status}${snippet ? ": " + snippet : ""}`);
    return 1;
  }

  // 6. 2xx — parse body JSON. Body-parse failures on 2xx are already
  // surfaced by fetchWithRetry via BodyParseError, so we can parse here
  // optimistically. If parse fails, treat as E_UNEXPECTED_HTTP.
  let json;
  try {
    json = JSON.parse(res.bodyText);
  } catch (e) {
    emitError("E_UNEXPECTED_HTTP",
      "response JSON parse failed: " + String(res.bodyText).slice(0, 500));
    return 1;
  }

  const parsed = parseResponse(json);
  const composedPrompt = composePromptText(args, stylesIndex);
  const historyId = deriveHistoryId(args);
  const cwd = process.cwd();
  // In continuation mode, the prior entry's id becomes this entry's
  // parentId. Validation already guarantees args.historyParent is unset.
  if (continuationParentId !== null) {
    args.historyParent = continuationParentId;
  }

  // Warn once if --history-parent is unknown — BEFORE appending our own
  // entry, so the parent check can only see pre-existing lines.
  if (!args.noHistory) warnIfUnknownParent(args, cwd);

  if (parsed.refusalReason) {
    // Refusal: do NOT write the output file. Still record the attempt
    // (with refusalReason + bytes: 0) in history unless --no-history.
    let historyWarning = null;
    if (!args.noHistory) {
      const entry = buildHistoryEntry(args, composedPrompt, parsed, 0);
      const r = appendHistory(entry, cwd);
      if (r.warning) historyWarning = r.warning;
    }
    const payload = {
      success: false,
      code: "E_REFUSED",
      error: parsed.refusalReason,
      refusalDetails: {
        finishReason: parsed.finishReason,
        promptBlockReason: parsed.promptBlockReason,
        text: parsed.text,
      },
    };
    if (historyWarning) payload.historyWarning = historyWarning;
    process.stdout.write(JSON.stringify(payload) + "\n");
    return 1;
  }

  // Success path. parseResponse guarantees parsed.image is a valid Buffer
  // whose magic bytes match a supported format, so writeFileSync is safe.
  try {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(args.output, parsed.image);
  } catch (err) {
    emitError("E_UNEXPECTED_HTTP",
      "failed to write output: " + (err && err.message || String(err)));
    return 1;
  }

  // Extension-vs-returned-MIME mismatch warning. We pass through the bytes
  // as-is regardless — renaming or transcoding would be surprising.
  const mimeToFmt = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/webp": "webp",
  };
  const actualFmt = mimeToFmt[parsed.responseMimeType] || null;
  const declaredExt = path.extname(args.output).slice(1).toLowerCase();
  const normalizedExt = normalizedExtFormat(declaredExt);
  if (actualFmt && normalizedExt && actualFmt !== normalizedExt) {
    process.stderr.write(
      `nanogen: output extension ".${declaredExt}" but API returned image/${actualFmt}; bytes written as-is.\n`
    );
  }

  let bytesWritten = 0;
  try {
    bytesWritten = fs.statSync(args.output).size;
  } catch (_) {
    bytesWritten = parsed.image ? parsed.image.length : 0;
  }

  let historyWarning = null;
  if (!args.noHistory) {
    const entry = buildHistoryEntry(args, composedPrompt, parsed, bytesWritten);
    const r = appendHistory(entry, cwd);
    if (r.warning) historyWarning = r.warning;
  }

  const payload = {
    success: true,
    output: args.output,
    historyId,
    bytes: bytesWritten,
    model: args.model || DEFAULT_MODEL,
    aspectRatio: args.aspect || DEFAULT_ASPECT,
    imageSize: args.size || DEFAULT_SIZE,
    refusalReason: null,
  };
  if (historyWarning) payload.historyWarning = historyWarning;
  process.stdout.write(JSON.stringify(payload) + "\n");
  return 0;
}

// Export for in-process testing.
module.exports = {
  parseArgs,
  validateArgs,
  readImageMaterials,
  buildGenerateRequestFromMaterials,
  // Phase 2:
  loadStyles,
  validateStyleCatalog,
  applyStyles,
  FIXED_STYLE_CATEGORIES,
  FORBIDDEN_STYLE_TOKENS,
  // Phase 3:
  parseResponse,
  composePromptText,
  canonicalSafetySettings,
  mimeTypeForExt,
  // Phase 4:
  resolveApiKey,
  findDotenvFile,
  parseDotenvSync,
  fetchWithRetry,
  mapHttpError,
  parseRetryAfter,
  computeBackoff,
  BodyParseError,
  HttpRetryError,
  NetworkRetryError,
  // Phase 5:
  appendHistory,
  readHistory,
  buildHistoryEntry,
  deriveHistoryId,
  normalizedExtFormat,
  HISTORY_FILE,
  // Sub-plan 2 Phase 2:
  resolveContinuation,
  buildContinuationRequestFromMaterials,
  OUTPUT_FORMAT_TO_MIME,
};

if (require.main === module) {
  main();
}
