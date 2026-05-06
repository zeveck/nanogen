"use strict";
// Sub-plan 2 Phase 1 tests: multi-image assembly + --region flag.
//
// Two test categories:
//   (a) Pure builder tests: call buildGenerateRequestFromMaterials directly
//       with a baseArgs() shape, compare structurally to a golden fixture.
//       Goldens store `"<tiny-1x1-base64>"` as a placeholder for the
//       inlineData.data field; the test substitutes the real base64 before
//       deepStrictEqual, keeping goldens diff-readable.
//   (b) CLI subprocess tests: spawnSync generate.cjs with a cleaned env and
//       assert on stdout/stderr/exit-code.
//
// All tests run under withCleanEnv (NANOGEN_API_BASE deleted) so the prod
// default URL pins into goldens.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const gen = require("../build/nanogen/generate.cjs");

// ---------------------------------------------------------------------------
// withCleanEnv — same NUKE_KEYS as sibling tests.
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

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const FIX = path.resolve(__dirname, "fixtures");
const TINY_PNG = path.join(FIX, "tiny-1x1.png");
const TINY_BASE64 = fs.readFileSync(TINY_PNG).toString("base64");
const CLI = path.resolve(__dirname, "..", "build", "nanogen", "generate.cjs");

// Load golden and substitute the "<tiny-1x1-base64>" placeholder with the
// real base64 string. We walk the body's content parts and replace any
// inlineData.data placeholder.
function loadGoldenExpanded(name) {
  const raw = fs.readFileSync(path.join(FIX, name), "utf8");
  const expanded = raw.replace(/<tiny-1x1-base64>/g, TINY_BASE64);
  return JSON.parse(expanded);
}

function baseArgs(overrides = {}) {
  return Object.assign({
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
  }, overrides);
}

const stylesIndex = gen.loadStyles();

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function runAll() {
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
  console.log(`\n${passed}/${tests.length} passed${failed ? `, ${failed} failed` : ""}`);
  if (failed) process.exit(1);
}

// ---------------------------------------------------------------------------
// (1) 6 golden structural-equality tests.
// ---------------------------------------------------------------------------

test("golden: request-edit-one-image.json — 1 image + explicit prompt", () => {
  withCleanEnv(() => {
    const args = baseArgs({
      prompt: "edit this",
      output: "o.png",
      image: [TINY_PNG],
    });
    const { imageMaterials } = gen.readImageMaterials(args);
    const actual = gen.buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex);
    assert.deepStrictEqual(actual, loadGoldenExpanded("request-edit-one-image.json"));
  });
});

test("golden: request-edit-two-images-ordered.json — 2 images, order preserved", () => {
  withCleanEnv(() => {
    const args = baseArgs({
      prompt: "use second's style",
      output: "o.png",
      image: [TINY_PNG, TINY_PNG],
    });
    const { imageMaterials } = gen.readImageMaterials(args);
    const actual = gen.buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex);
    assert.deepStrictEqual(actual, loadGoldenExpanded("request-edit-two-images-ordered.json"));
  });
});

test("golden: request-edit-five-images.json — 5 images, no truncation", () => {
  withCleanEnv(() => {
    const args = baseArgs({
      prompt: "combine these",
      output: "o.png",
      image: [TINY_PNG, TINY_PNG, TINY_PNG, TINY_PNG, TINY_PNG],
    });
    const { imageMaterials } = gen.readImageMaterials(args);
    const actual = gen.buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex);
    assert.deepStrictEqual(actual, loadGoldenExpanded("request-edit-five-images.json"));
  });
});

test("golden: request-edit-fourteen-images.json — 14 images, upper bound", () => {
  withCleanEnv(() => {
    const imgs = [];
    for (let i = 0; i < 14; i++) imgs.push(TINY_PNG);
    const args = baseArgs({
      prompt: "composite",
      output: "o.png",
      image: imgs,
    });
    const { imageMaterials } = gen.readImageMaterials(args);
    const actual = gen.buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex);
    assert.deepStrictEqual(actual, loadGoldenExpanded("request-edit-fourteen-images.json"));
  });
});

test("golden: request-edit-region-only.json — region-only, no prompt → boilerplate base", () => {
  withCleanEnv(() => {
    const args = baseArgs({
      output: "o.png",
      image: [TINY_PNG],
      region: ["remove the cat"],
    });
    const { imageMaterials } = gen.readImageMaterials(args);
    const actual = gen.buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex);
    assert.deepStrictEqual(actual, loadGoldenExpanded("request-edit-region-only.json"));
    // Pin the exact text.
    assert.equal(actual.body.contents[0].parts[0].text,
      "Edit the provided image(s). Region: remove the cat.");
  });
});

test("golden: request-edit-full-featured.json — full composition order", () => {
  withCleanEnv(() => {
    const args = baseArgs({
      prompt: "make it blue",
      output: "o.png",
      image: [TINY_PNG, TINY_PNG],
      styles: ["pixel-16bit"],
      region: ["the background"],
      negative: ["no text"],
    });
    const { imageMaterials } = gen.readImageMaterials(args);
    const actual = gen.buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex);
    assert.deepStrictEqual(actual, loadGoldenExpanded("request-edit-full-featured.json"));
    // Double-pin composition order: Prompt → Style → Region → Avoid.
    const txt = actual.body.contents[0].parts[0].text;
    const styleIdx = txt.indexOf("Style:");
    const regionIdx = txt.indexOf("Region:");
    const avoidIdx = txt.indexOf("Avoid:");
    assert.ok(styleIdx > 0 && styleIdx < regionIdx && regionIdx < avoidIdx,
      `composition order violated: ${txt}`);
  });
});

// ---------------------------------------------------------------------------
// (2) Order preservation: three distinct --image flags → parts[1..3] in order.
// ---------------------------------------------------------------------------

test("order: 3 --image flags preserved in parts[1..3]", () => {
  withCleanEnv(() => {
    // All three point to TINY_PNG (same file — the test asserts on
    // mimeType and that exactly 3 inlineData parts exist, in the given
    // order).
    const args = baseArgs({
      prompt: "combine",
      output: "o.png",
      image: [TINY_PNG, TINY_PNG, TINY_PNG],
    });
    const { imageMaterials } = gen.readImageMaterials(args);
    // Sanity: readImageMaterials preserves input order.
    assert.equal(imageMaterials.length, 3);
    for (let i = 0; i < 3; i++) {
      assert.equal(imageMaterials[i].path, TINY_PNG);
      assert.equal(imageMaterials[i].mimeType, "image/png");
    }
    const actual = gen.buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex);
    const parts = actual.body.contents[0].parts;
    assert.equal(parts.length, 4, "expected [text, inlineData x3]");
    assert.ok(parts[0].text !== undefined, "parts[0] must be text");
    for (let i = 1; i <= 3; i++) {
      assert.ok(parts[i].inlineData, `parts[${i}] must be inlineData`);
      assert.equal(parts[i].inlineData.mimeType, "image/png");
      assert.equal(parts[i].inlineData.data, TINY_BASE64);
    }
  });
});

// ---------------------------------------------------------------------------
// (3) 15 images → E_TOO_MANY_IMAGES (smoke of inherited sub-plan-1 rule).
// ---------------------------------------------------------------------------

test("validation: 15 --image flags → E_TOO_MANY_IMAGES", () => {
  const argv = ["--prompt", "too many", "--output", "o.png", "--dry-run"];
  for (let i = 0; i < 15; i++) {
    argv.push("--image", TINY_PNG);
  }
  const res = spawnSync(process.execPath, [CLI, ...argv], {
    env: cleanEnv({ GEMINI_API_KEY: "" }),
    encoding: "utf8",
  });
  assert.equal(res.status, 1, `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = JSON.parse(res.stdout.trim());
  assert.equal(j.code, "E_TOO_MANY_IMAGES");
});

// ---------------------------------------------------------------------------
// (4) --region without --image → E_REGION_WITHOUT_IMAGE (exit 1).
// ---------------------------------------------------------------------------

test("validation: --region without --image → E_REGION_WITHOUT_IMAGE", () => {
  const res = spawnSync(process.execPath, [CLI,
    "--prompt", "x",
    "--output", "o.png",
    "--region", "y",
    "--dry-run",
  ], {
    env: cleanEnv({ GEMINI_API_KEY: "" }),
    encoding: "utf8",
  });
  assert.equal(res.status, 1, `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = JSON.parse(res.stdout.trim());
  assert.equal(j.code, "E_REGION_WITHOUT_IMAGE");
});

// ---------------------------------------------------------------------------
// (5) --image with no --prompt and no --region → E_EDIT_NEEDS_INSTRUCTION.
// ---------------------------------------------------------------------------

test("validation: --image alone (no prompt, no region) → E_EDIT_NEEDS_INSTRUCTION", () => {
  const res = spawnSync(process.execPath, [CLI,
    "--image", TINY_PNG,
    "--output", "o.png",
    "--dry-run",
  ], {
    env: cleanEnv({ GEMINI_API_KEY: "" }),
    encoding: "utf8",
  });
  assert.equal(res.status, 1, `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = JSON.parse(res.stdout.trim());
  assert.equal(j.code, "E_EDIT_NEEDS_INSTRUCTION");
});

// ---------------------------------------------------------------------------
// (6) --image + --region, no --prompt → success; body matches region-only golden.
// ---------------------------------------------------------------------------

test("CLI --dry-run: --image + --region (no prompt) → region-only golden", () => {
  const res = spawnSync(process.execPath, [CLI,
    "--image", TINY_PNG,
    "--region", "remove the cat",
    "--output", "o.png",
    "--dry-run",
  ], {
    env: cleanEnv({ GEMINI_API_KEY: "" }),
    encoding: "utf8",
  });
  assert.equal(res.status, 0, `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = JSON.parse(res.stdout.trim());
  const golden = loadGoldenExpanded("request-edit-region-only.json");
  assert.deepStrictEqual(j.body, golden.body);
  assert.equal(j.url, golden.url);
  assert.equal(j.body.contents[0].parts[0].text,
    "Edit the provided image(s). Region: remove the cat.");
});

// ---------------------------------------------------------------------------
// (7) --image + --prompt, no --region → body text === prompt (no boilerplate).
// ---------------------------------------------------------------------------

test("CLI --dry-run: --image + --prompt (no region) → text is literally the prompt", () => {
  const res = spawnSync(process.execPath, [CLI,
    "--image", TINY_PNG,
    "--prompt", "P",
    "--output", "o.png",
    "--dry-run",
  ], {
    env: cleanEnv({ GEMINI_API_KEY: "" }),
    encoding: "utf8",
  });
  assert.equal(res.status, 0, `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = JSON.parse(res.stdout.trim());
  assert.equal(j.body.contents[0].parts[0].text, "P",
    "text must be bare prompt — no edit-mode boilerplate, no Region suffix");
});

// ---------------------------------------------------------------------------
// (8) Composition-order CLI end-to-end: matches full-featured golden.
// ---------------------------------------------------------------------------

test("CLI --dry-run: full-featured composition matches request-edit-full-featured.json", () => {
  const res = spawnSync(process.execPath, [CLI,
    "--prompt", "make it blue",
    "--image", TINY_PNG,
    "--image", TINY_PNG,
    "--style", "pixel-16bit",
    "--region", "the background",
    "--negative", "no text",
    "--output", "o.png",
    "--dry-run",
  ], {
    env: cleanEnv({ GEMINI_API_KEY: "" }),
    encoding: "utf8",
  });
  assert.equal(res.status, 0, `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = JSON.parse(res.stdout.trim());
  const golden = loadGoldenExpanded("request-edit-full-featured.json");
  assert.deepStrictEqual(j.body, golden.body);
});

// ---------------------------------------------------------------------------
// (9) parseArgs: --region is repeatable and accumulates.
// ---------------------------------------------------------------------------

test("parseArgs: --region is repeatable (accumulates into args.region)", () => {
  const args = gen.parseArgs([
    "--prompt", "x",
    "--image", TINY_PNG,
    "--region", "a",
    "--region", "b",
    "--region", "c",
    "--output", "o.png",
    "--dry-run",
  ]);
  assert.deepStrictEqual(args.region, ["a", "b", "c"]);
});

// ---------------------------------------------------------------------------
// (10) Multiple regions join with "; " in composed text.
// ---------------------------------------------------------------------------

test("composePromptText: multiple --region values joined with '; '", () => {
  withCleanEnv(() => {
    const args = baseArgs({
      prompt: "P",
      output: "o.png",
      image: [TINY_PNG],
      region: ["the sky", "the grass"],
    });
    const { imageMaterials } = gen.readImageMaterials(args);
    const r = gen.buildGenerateRequestFromMaterials(args, imageMaterials, stylesIndex);
    assert.equal(r.body.contents[0].parts[0].text,
      "P Region: the sky; the grass.");
  });
});

// ---------------------------------------------------------------------------
// (11) --region with no prompt, no image: E_REGION_WITHOUT_IMAGE takes
// precedence over E_MISSING_PROMPT_OR_IMAGE (rule ordering pin).
// ---------------------------------------------------------------------------

test("rule ordering: --region alone (no prompt, no image) → E_REGION_WITHOUT_IMAGE wins over E_MISSING_PROMPT_OR_IMAGE", () => {
  const res = spawnSync(process.execPath, [CLI,
    "--region", "somewhere",
    "--output", "o.png",
    "--dry-run",
  ], {
    env: cleanEnv({ GEMINI_API_KEY: "" }),
    encoding: "utf8",
  });
  assert.equal(res.status, 1, `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = JSON.parse(res.stdout.trim());
  assert.equal(j.code, "E_REGION_WITHOUT_IMAGE");
});

// ---------------------------------------------------------------------------
// (12) --help lists --region.
// ---------------------------------------------------------------------------

test("--help mentions --region and EDIT MODE", () => {
  const res = spawnSync(process.execPath, [CLI, "--help"], {
    env: cleanEnv({ GEMINI_API_KEY: "" }),
    encoding: "utf8",
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /--region/,
    "--help must document --region");
  assert.match(res.stdout, /EDIT MODE/,
    "--help must include an EDIT MODE example section");
});

// ---------------------------------------------------------------------------
// (13) Rule 2 (E_MISSING_PROMPT_OR_IMAGE) still fires when neither --prompt
// nor --image is given (sub-plan 1 forward-compatibility: no rename needed).
// ---------------------------------------------------------------------------

test("rule 2 (E_MISSING_PROMPT_OR_IMAGE) fires when both --prompt AND --image absent", () => {
  const res = spawnSync(process.execPath, [CLI,
    "--output", "o.png",
    "--dry-run",
  ], {
    env: cleanEnv({ GEMINI_API_KEY: "" }),
    encoding: "utf8",
  });
  assert.equal(res.status, 1, `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = JSON.parse(res.stdout.trim());
  assert.equal(j.code, "E_MISSING_PROMPT_OR_IMAGE");
});

runAll();
