#!/usr/bin/env node
// nanogen — Phase 1+2: arg parser, validation, --help, --dry-run, style catalog.
// See plans/SUB_1_CLI_CORE.md for the authoritative spec.
// This is intentionally zero-dependency; Node 20.12+ built-ins only.

"use strict";

const fs = require("fs");
const path = require("path");
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
  "--history-id", "--history-parent",
]);
const REPEATABLE_FLAGS = new Set([
  "--image", "--negative", "--safety", "--style",
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
    historyId: undefined,
    historyParent: undefined,
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
  // 2. --prompt missing (sub-plan 1: simple check)
  if (!args.prompt) {
    return fail("E_MISSING_PROMPT_OR_IMAGE", "--prompt is required");
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
    "  --prompt <str>           Text prompt for generation.",
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
    "  --history-id <str>       Override auto-derived history id.",
    "  --history-parent <str>   Link this generation to a parent entry.",
    "  --no-history             Skip history append.",
    "  --dry-run                Print would-be request as JSON, exit 0.",
    "  --help, -h               Show this help.",
    "",
    "Examples:",
    "  nanogen --prompt \"a red apple on a marble table\" --output apple.png",
    "  nanogen --prompt \"make it blue\" --image apple.png --output apple-blue.png  # (edit mode — see sub-plan 2)",
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
//   1. base prompt
//   2. styles (applyStyles appends " Style: <frags joined by space>.")
//   3. negative (" Avoid: <neg joined by '; '>.")
// Pure — no I/O.
function composePromptText(args, stylesIndex) {
  let promptText = args.prompt || "";
  if (stylesIndex && args.styles && args.styles.length > 0) {
    promptText = applyStyles(promptText, args.styles, stylesIndex);
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
    const { url, headers, body } =
      buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex);
    emitDryRun(url, headers, body);
    process.exit(0);
  }

  // Phase 1 ends here — real HTTP lives in Phase 4.
  // No stable error code is assigned for this transitional gap; Phase 4
  // will wire up real fetch + E_MISSING_API_KEY / E_* mapping. Until then,
  // exit non-zero with a plain message so callers can detect incompleteness.
  process.stdout.write(JSON.stringify({
    success: false,
    code: "E_NOT_IMPLEMENTED",
    error: "nanogen Phase 1 only supports --help and --dry-run. " +
           "See plans/SUB_1_CLI_CORE.md.",
  }) + "\n");
  process.exit(1);
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
};

if (require.main === module) {
  main();
}
