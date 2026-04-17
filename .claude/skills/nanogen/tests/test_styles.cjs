"use strict";
// Phase 2 tests: style catalog loader, validator, applyStyles, and the
// --style CLI surface. Mixes in-process (require the module) tests with
// subprocess CLI tests. See plans/SUB_1_CLI_CORE.md Phase 2.

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CLI = path.resolve(__dirname, "..", "generate.cjs");
const REAL_STYLES = path.resolve(__dirname, "..", "styles.json");

// Load the module once for in-process validator tests.
const gen = require("../generate.cjs");

// ---------------------------------------------------------------------------
// withCleanEnv — copied from test_parse_args.cjs (plan constraint). Tests
// that invoke the CLI pass an explicit cleaned env dict via cleanEnv().
// ---------------------------------------------------------------------------

const NUKE_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "NANOGEN_API_BASE",
  "NANOGEN_RETRY_BASE_MS",
  "NANOGEN_FETCH_TIMEOUT_MS",
  "NANOGEN_MAX_RETRIES",
  "NANOGEN_STYLES_PATH",
];

function withCleanEnv(fn) {
  const snapshot = {};
  for (const k of NUKE_KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
  try {
    return fn();
  } finally {
    for (const k of NUKE_KEYS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  }
}

function cleanEnv(extra = {}) {
  const env = { PATH: process.env.PATH || "/usr/bin:/bin" };
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  for (const k of NUKE_KEYS) delete env[k];
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

function runCLI(args, { env = cleanEnv() } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env,
    encoding: "utf8",
  });
}

function parseStdoutJson(out) {
  return JSON.parse(out.trim());
}

// ---------------------------------------------------------------------------
// Helpers for writing tmp catalog fixtures + pointing the CLI at them
// ---------------------------------------------------------------------------

let tmpDir;
function setupFixtures() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nanogen-phase2-"));
}
function teardownFixtures() {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
}

function writeTmpCatalog(name, data) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, JSON.stringify(data));
  return p;
}

// Build a MINIMAL valid catalog: 72 entries across the 10 fixed categories.
// Used as a base so mutation tests can make targeted changes.
function buildValidCatalog() {
  const cats = gen.FIXED_STYLE_CATEGORIES;
  // Distribute 72 entries across 10 categories — at least one per cat.
  // 10*7 = 70, plus 2 extras in the first two cats. Any distribution works
  // as long as every cat has >= 1 entry and total is 72.
  const list = [];
  let counter = 0;
  // 2 cats get 8, the other 8 cats get 7: 2*8 + 8*7 = 16+56 = 72.
  for (let i = 0; i < cats.length; i++) {
    const n = i < 2 ? 8 : 7;
    for (let j = 0; j < n; j++) {
      list.push({
        slug: `cat${i}-entry${j}-${counter}`,
        name: `Cat${i} Entry ${j}`,
        category: cats[i],
        promptFragment: `Sample neutral prompt fragment for cat${i}-entry${j} with distinctive phrasing to aid debugging.`,
      });
      counter++;
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function runAll() {
  setupFixtures();
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`ok  ${name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${name}`);
      console.log("    " + (e && e.stack || e));
    }
  }
  teardownFixtures();
  console.log(`\n${passed}/${tests.length} passed${failed ? `, ${failed} failed` : ""}`);
  if (failed) process.exit(1);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// 1. Happy path: real catalog loads and validates.
test("real styles.json loads and validates", () => {
  const styles = gen.loadStyles();
  const v = gen.validateStyleCatalog(styles);
  assert.equal(v.ok, true, `validation failed: ${v.error}`);
  assert.ok(styles.list.length >= 72, `expected >=72 entries, got ${styles.list.length}`);
  assert.ok(styles.byKey.get("pixel-16bit"), "pixel-16bit missing from byKey");
});

// 2. Exactly 72 entries
test("real styles.json has list.length === 72", () => {
  const styles = gen.loadStyles();
  assert.equal(styles.list.length, 72, `expected exactly 72, got ${styles.list.length}`);
});

// 3. Duplicate slug rejection
test("validateStyleCatalog rejects duplicate slug", () => {
  const list = buildValidCatalog();
  // Force a duplicate — overwrite entry 1 with entry 0's slug.
  list[1].slug = list[0].slug;
  const v = gen.validateStyleCatalog({ list, byKey: new Map() });
  assert.equal(v.ok, false);
  assert.match(v.error, /duplicate slug/i);
});

// 4. Unknown category rejection
test("validateStyleCatalog rejects unknown category", () => {
  const list = buildValidCatalog();
  list[0].category = "not-a-real-category";
  const v = gen.validateStyleCatalog({ list, byKey: new Map() });
  assert.equal(v.ok, false);
  assert.match(v.error, /unknown category/i);
});

// 5. Non-kebab-case slug rejection
test("validateStyleCatalog rejects non-kebab-case slug", () => {
  const list = buildValidCatalog();
  list[3].slug = "BadSlug_With_Underscore";
  const v = gen.validateStyleCatalog({ list, byKey: new Map() });
  assert.equal(v.ok, false);
  assert.match(v.error, /slug/i);
});

// 6. Missing required field rejection
test("validateStyleCatalog rejects missing required field", () => {
  const list = buildValidCatalog();
  delete list[5].name;
  const v = gen.validateStyleCatalog({ list, byKey: new Map() });
  assert.equal(v.ok, false);
  assert.match(v.error, /required field/i);
});

// 7. length < 72 rejection
test("validateStyleCatalog rejects list shorter than 72", () => {
  const list = buildValidCatalog().slice(0, 71);
  const v = gen.validateStyleCatalog({ list, byKey: new Map() });
  assert.equal(v.ok, false);
  assert.match(v.error, />= 72/);
});

// 8. distinct categories < 10 rejection
test("validateStyleCatalog rejects fewer than 10 distinct categories", () => {
  const list = buildValidCatalog();
  // Find an entry whose category only appears once, and flip it to an
  // adjacent category so distinct drops to 9. Easiest: flip ALL entries
  // in category `speculative-niche` to `painterly`.
  for (const e of list) {
    if (e.category === "speculative-niche") e.category = "painterly";
  }
  const v = gen.validateStyleCatalog({ list, byKey: new Map() });
  assert.equal(v.ok, false);
  assert.match(v.error, /distinct categories/i);
});

// 9. applyStyles with empty slugs → unchanged prompt
test("applyStyles([]) returns prompt unchanged", () => {
  const styles = gen.loadStyles();
  const out = gen.applyStyles("hello world", [], styles);
  assert.equal(out, "hello world");
});

// 10. applyStyles with one slug
test("applyStyles with one slug appends ' Style: <fragment>.'", () => {
  const styles = gen.loadStyles();
  const frag = styles.byKey.get("pixel-16bit").promptFragment;
  const out = gen.applyStyles("hello", ["pixel-16bit"], styles);
  assert.equal(out, "hello Style: " + frag + ".");
});

// 11. applyStyles with two slugs — joined by a single space
test("applyStyles with two slugs joins fragments with single space", () => {
  const styles = gen.loadStyles();
  const f1 = styles.byKey.get("pixel-16bit").promptFragment;
  const f2 = styles.byKey.get("oil-painting").promptFragment;
  const out = gen.applyStyles("hi", ["pixel-16bit", "oil-painting"], styles);
  assert.equal(out, "hi Style: " + f1 + " " + f2 + ".");
});

// 12. CLI --style unknown-slug → E_UNKNOWN_STYLE
test("CLI --style unknown-slug → exit 1, E_UNKNOWN_STYLE", () => {
  const res = runCLI([
    "--prompt", "X",
    "--output", "foo.png",
    "--style", "not-a-real-preset",
    "--dry-run",
  ]);
  assert.equal(res.status, 1,
    `expected exit 1, got ${res.status}; stdout=${res.stdout} stderr=${res.stderr}`);
  const j = parseStdoutJson(res.stdout);
  assert.equal(j.success, false);
  assert.equal(j.code, "E_UNKNOWN_STYLE", `error=${j.error}`);
});

// 13. CLI --style pixel-16bit --dry-run → body text contains fragment verbatim
test("CLI --style pixel-16bit --dry-run embeds fragment verbatim in body.text", () => {
  const styles = gen.loadStyles();
  const frag = styles.byKey.get("pixel-16bit").promptFragment;
  const res = runCLI([
    "--prompt", "a cat",
    "--output", "foo.png",
    "--style", "pixel-16bit",
    "--dry-run",
  ], { env: cleanEnv({ GEMINI_API_KEY: "" }) });
  assert.equal(res.status, 0,
    `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = parseStdoutJson(res.stdout);
  const text = j.body.contents[0].parts[0].text;
  assert.ok(text.includes(frag),
    `text missing fragment. text=${JSON.stringify(text)}\nexpected to contain=${JSON.stringify(frag)}`);
  assert.ok(text.startsWith("a cat Style:"),
    `text should start with base prompt then Style:; got ${JSON.stringify(text)}`);
  assert.ok(text.endsWith("."),
    `text should end with '.'; got ${JSON.stringify(text)}`);
});

// 14. Forbidden-tokens audit against the real catalog
test("no promptFragment in real styles.json contains any forbidden token", () => {
  const styles = gen.loadStyles();
  const forbidden = gen.FORBIDDEN_STYLE_TOKENS;
  assert.ok(Array.isArray(forbidden) && forbidden.length === 13,
    `expected 13 forbidden tokens, got ${forbidden && forbidden.length}`);
  for (const entry of styles.list) {
    const lc = entry.promptFragment.toLowerCase();
    for (const tok of forbidden) {
      const re = new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      assert.ok(!re.test(lc),
        `entry ${entry.slug} promptFragment contains forbidden token "${tok}"`);
    }
  }
});

// 15. Startup: malformed catalog (duplicate slug) → E_BAD_STYLES_CATALOG
// This also proves the catalog is validated BEFORE arg parsing (a bogus
// --dry-run without --output still bubbles up the catalog error first).
test("startup exits E_BAD_STYLES_CATALOG when catalog has duplicate slug", () => {
  const list = buildValidCatalog();
  list[1].slug = list[0].slug; // duplicate
  const p = writeTmpCatalog("dup.json", list);
  const res = runCLI([
    "--prompt", "X",
    "--output", "foo.png",
    "--dry-run",
  ], { env: cleanEnv({ NANOGEN_STYLES_PATH: p, GEMINI_API_KEY: "" }) });
  assert.equal(res.status, 1,
    `expected exit 1, got ${res.status}; stdout=${res.stdout} stderr=${res.stderr}`);
  const j = parseStdoutJson(res.stdout);
  assert.equal(j.code, "E_BAD_STYLES_CATALOG", `got: ${JSON.stringify(j)}`);
});

// 16. Catalog validation runs BEFORE arg validation — pass an invalid flag
// AND point at a broken catalog. Catalog error must fire first.
test("catalog validation runs before arg validation (deterministic fail-fast)", () => {
  const list = buildValidCatalog().slice(0, 10); // too short (< 72)
  const p = writeTmpCatalog("short.json", list);
  const res = runCLI([
    // No --prompt, no --output — would trip rule 2 normally.
    "--bogus-flag",
  ], { env: cleanEnv({ NANOGEN_STYLES_PATH: p, GEMINI_API_KEY: "" }) });
  assert.equal(res.status, 1);
  const j = parseStdoutJson(res.stdout);
  assert.equal(j.code, "E_BAD_STYLES_CATALOG",
    `expected catalog error to fire first; got ${JSON.stringify(j)}`);
});

// 17. promptFragment > 800 chars rejection
test("validateStyleCatalog rejects promptFragment > 800 chars", () => {
  const list = buildValidCatalog();
  list[4].promptFragment = "x".repeat(801);
  const v = gen.validateStyleCatalog({ list, byKey: new Map() });
  assert.equal(v.ok, false);
  assert.match(v.error, /800|length/i);
});

// 18. promptFragment empty-string rejection
test("validateStyleCatalog rejects empty promptFragment", () => {
  const list = buildValidCatalog();
  list[6].promptFragment = "";
  const v = gen.validateStyleCatalog({ list, byKey: new Map() });
  assert.equal(v.ok, false);
  assert.match(v.error, /required field/i);
});

// 19. Forbidden-token in synthetic entry is caught by validateStyleCatalog
test("validateStyleCatalog rejects promptFragment containing a forbidden token", () => {
  const list = buildValidCatalog();
  list[7].promptFragment = "Style inspired by Picasso and saturated primaries.";
  const v = gen.validateStyleCatalog({ list, byKey: new Map() });
  assert.equal(v.ok, false);
  assert.match(v.error, /forbidden token/i);
});

// 20. Exact category counts match the plan inventory
test("real styles.json category counts match plan inventory", () => {
  const expected = {
    "pixel-art": 5,
    "flat-vector": 5,
    "painterly": 5,
    "drawing-ink": 7,
    "photographic": 10,
    "animation-cartoon": 7,
    "fine-art-historical": 9,
    "game-style": 10,
    "design-technical": 5,
    "speculative-niche": 9,
  };
  const styles = gen.loadStyles();
  const counts = {};
  for (const e of styles.list) counts[e.category] = (counts[e.category] || 0) + 1;
  for (const [cat, n] of Object.entries(expected)) {
    assert.equal(counts[cat], n,
      `category ${cat} expected ${n}, got ${counts[cat]}`);
  }
});

// 21. All 72 required slugs present (inventory lock)
test("real styles.json contains every required slug", () => {
  const required = [
    "pixel-8bit", "pixel-16bit", "pixel-32bit", "pixel-modern-highdetail", "pixel-isometric-tile",
    "flat-minimalist", "flat-material-design", "flat-glassmorphism", "flat-neumorphism", "isometric-infographic",
    "oil-painting", "acrylic-impasto", "gouache", "watercolor", "digital-painting-concept",
    "charcoal", "pencil-sketch", "pen-ink-crosshatch", "moebius-clear-line", "mignola-noir", "ink-wash-sumi-e", "ukiyo-e",
    "hyperreal-portrait", "studio-product", "street-photography", "macro", "astrophotography",
    "film-grain-35mm", "tilt-shift", "polaroid", "cyanotype", "infrared",
    "studio-ghibli-esque", "pixar-cg-esque", "dreamworks-cg-esque", "cel-shaded-3d",
    "anime-key-visual", "saturday-morning-retro", "bruce-timm-dcau-esque",
    "art-nouveau", "art-deco", "bauhaus", "impressionism", "cubism", "surrealism",
    "fauvism", "expressionism", "baroque-chiaroscuro",
    "fft-yoshida", "tactics-ogre-dark", "shining-force-16bit", "fire-emblem-gba",
    "disgaea-chibi", "hd2d-modern-tactics", "metroidvania-painterly", "low-poly-psx",
    "ps2-era-character", "modern-indie-platformer",
    "blueprint", "architectural-hyperreal", "architectural-sketch", "schematic-diagram", "exploded-view-diagram",
    "vaporwave", "synthwave", "solarpunk", "cottagecore", "dark-academia",
    "cyberpunk-neon", "atompunk", "dieselpunk", "brutalist-scifi",
  ];
  assert.equal(required.length, 72);
  const styles = gen.loadStyles();
  for (const slug of required) {
    assert.ok(styles.byKey.has(slug), `missing required slug: ${slug}`);
  }
});

// ---------------------------------------------------------------------------

runAll();
