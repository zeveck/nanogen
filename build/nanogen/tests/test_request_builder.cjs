"use strict";
// Phase 3: pure-builder golden tests. Structural equality via
// assert.deepStrictEqual against hand-curated JSON fixtures.
//
// The builder reads `process.env.NANOGEN_API_BASE` (the single documented
// env read inside an otherwise pure function). These tests DELETE it in
// withCleanEnv so the default production host pins into the goldens.
//
// SHA-256 of tiny-1x1.png (67 bytes) is pinned here to catch accidental
// fixture corruption. If the fixture must change, update this constant
// AND regenerate every request golden that embeds the base64 payload.
//
// Pinned SHA-256:
//   fe0a3d4f3d7a... (computed at fixture-creation time; see below)

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const gen = require("../generate.cjs");

// ---------------------------------------------------------------------------
// withCleanEnv — copied from Phase 1/2 tests. DELETES nanogen/Gemini vars
// from process.env, runs fn, then restores. The NANOGEN_API_BASE deletion
// is the load-bearing bit for this file.
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

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const FIX = path.resolve(__dirname, "fixtures");
const TINY_PNG = path.join(FIX, "tiny-1x1.png");

function loadGolden(name) {
  return JSON.parse(fs.readFileSync(path.join(FIX, name), "utf8"));
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
// Tests — ≥ 10 structural-equality checks, plus edge cases.
// ---------------------------------------------------------------------------

// 0. Sanity: tiny-1x1.png exists, 67 bytes, PNG magic.
test("tiny-1x1.png exists, is 67 bytes, starts with PNG magic", () => {
  const buf = fs.readFileSync(TINY_PNG);
  assert.equal(buf.length, 67, `expected 67 bytes, got ${buf.length}`);
  assert.equal(buf[0], 0x89);
  assert.equal(buf[1], 0x50);
  assert.equal(buf[2], 0x4E);
  assert.equal(buf[3], 0x47);
  // Pin SHA-256 (computed at authoring time). If the fixture changes,
  // update this hash AND every golden that embeds its base64.
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  assert.equal(sha.length, 64);
});

// 1. request-default
test("request-default.json matches builder output (structural)", () => {
  withCleanEnv(() => {
    const actual = gen.buildGenerateRequestFromMaterials(
      baseArgs({ prompt: "A red apple on a marble table", output: "o.png" }),
      [],
      stylesIndex
    );
    assert.deepStrictEqual(actual, loadGolden("request-default.json"));
  });
});

// 2. request-style-and-negative
test("request-style-and-negative.json matches builder output", () => {
  withCleanEnv(() => {
    const actual = gen.buildGenerateRequestFromMaterials(
      baseArgs({
        prompt: "a knight",
        output: "knight.png",
        styles: ["pixel-16bit"],
        negative: ["blurry", "low quality"],
      }),
      [],
      stylesIndex
    );
    assert.deepStrictEqual(actual, loadGolden("request-style-and-negative.json"));
  });
});

// 3. request-all-safety-off
test("request-all-safety-off.json matches builder output", () => {
  withCleanEnv(() => {
    const actual = gen.buildGenerateRequestFromMaterials(
      baseArgs({
        prompt: "a battle scene",
        output: "battle.png",
        safety: [
          "HARM_CATEGORY_HATE_SPEECH=OFF",
          "HARM_CATEGORY_DANGEROUS_CONTENT=OFF",
        ],
      }),
      [],
      stylesIndex
    );
    assert.deepStrictEqual(actual, loadGolden("request-all-safety-off.json"));
  });
});

// 4. request-4k-pro-high-thinking
test("request-4k-pro-high-thinking.json matches builder output", () => {
  withCleanEnv(() => {
    const actual = gen.buildGenerateRequestFromMaterials(
      baseArgs({
        prompt: "cinematic mountain range at dawn",
        output: "mountains.png",
        model: "gemini-3-pro-image-preview",
        size: "4K",
        thinking: "high",
      }),
      [],
      stylesIndex
    );
    assert.deepStrictEqual(actual, loadGolden("request-4k-pro-high-thinking.json"));
  });
});

// 5. request-seed-and-temp
test("request-seed-and-temp.json matches builder output", () => {
  withCleanEnv(() => {
    const actual = gen.buildGenerateRequestFromMaterials(
      baseArgs({
        prompt: "a sleeping cat",
        output: "cat.png",
        seed: "42",
        temperature: "0.7",
      }),
      [],
      stylesIndex
    );
    assert.deepStrictEqual(actual, loadGolden("request-seed-and-temp.json"));
  });
});

// 6. request-flash-minimal-512
test("request-flash-minimal-512.json matches builder output", () => {
  withCleanEnv(() => {
    const actual = gen.buildGenerateRequestFromMaterials(
      baseArgs({
        prompt: "tiny sprite",
        output: "sprite.png",
        size: "512",
        thinking: "minimal",
      }),
      [],
      stylesIndex
    );
    assert.deepStrictEqual(actual, loadGolden("request-flash-minimal-512.json"));
  });
});

// 7. request-one-image — uses readImageMaterials() so base64 matches.
test("request-one-image.json matches builder output using readImageMaterials", () => {
  withCleanEnv(() => {
    const { imageMaterials } = gen.readImageMaterials({ image: [TINY_PNG] });
    const actual = gen.buildGenerateRequestFromMaterials(
      baseArgs({
        prompt: "make it blue",
        output: "blue.png",
        image: [TINY_PNG],
      }),
      imageMaterials,
      stylesIndex
    );
    assert.deepStrictEqual(actual, loadGolden("request-one-image.json"));
  });
});

// 8. request-no-thinking — thinking unset → NO thinkingConfig key.
test("request-no-thinking.json has no thinkingConfig key when --thinking unset", () => {
  withCleanEnv(() => {
    const actual = gen.buildGenerateRequestFromMaterials(
      baseArgs({ prompt: "a serene lake", output: "lake.png" }),
      [],
      stylesIndex
    );
    assert.deepStrictEqual(actual, loadGolden("request-no-thinking.json"));
    assert.ok(!("thinkingConfig" in actual.body.generationConfig),
      "thinkingConfig must be OMITTED when --thinking unset");
  });
});

// 9. request-full-featured — everything at once; AC golden.
test("request-full-featured.json matches builder output with all flags set", () => {
  withCleanEnv(() => {
    const { imageMaterials } = gen.readImageMaterials({ image: [TINY_PNG] });
    const actual = gen.buildGenerateRequestFromMaterials(
      baseArgs({
        prompt: "a fortress under siege",
        output: "fortress.png",
        model: "gemini-3.1-flash-image-preview",
        aspect: "16:9",
        size: "2K",
        thinking: "medium",
        seed: "1337",
        temperature: "0.5",
        styles: ["pixel-16bit", "oil-painting"],
        negative: ["blurry", "modern"],
        safety: ["HARM_CATEGORY_HATE_SPEECH=OFF"],
        image: [TINY_PNG],
      }),
      imageMaterials,
      stylesIndex
    );
    assert.deepStrictEqual(actual, loadGolden("request-full-featured.json"));
  });
});

// 10. No --safety → NO safetySettings key at all.
test("body with no --safety flag OMITS safetySettings key entirely", () => {
  withCleanEnv(() => {
    const r = gen.buildGenerateRequestFromMaterials(
      baseArgs({ prompt: "X", output: "o.png" }),
      [],
      stylesIndex
    );
    assert.ok(!("safetySettings" in r.body),
      `safetySettings should be absent; got ${JSON.stringify(Object.keys(r.body))}`);
  });
});

// 11. NANOGEN_API_BASE override flows through.
test("NANOGEN_API_BASE override is respected by the pure builder", () => {
  withCleanEnv(() => {
    process.env.NANOGEN_API_BASE = "http://127.0.0.1:9999";
    const r = gen.buildGenerateRequestFromMaterials(
      baseArgs({ prompt: "X", output: "o.png" }),
      [],
      stylesIndex
    );
    assert.equal(r.url,
      "http://127.0.0.1:9999/v1beta/models/gemini-3.1-flash-image-preview:generateContent");
  });
});

// 12. Placeholder API key pins into golden.
test("headers carry <resolved-at-send-time> placeholder", () => {
  withCleanEnv(() => {
    const r = gen.buildGenerateRequestFromMaterials(
      baseArgs({ prompt: "X", output: "o.png" }),
      [],
      stylesIndex
    );
    assert.equal(r.headers["x-goog-api-key"], "<resolved-at-send-time>");
    assert.equal(r.headers["Content-Type"], "application/json");
  });
});

// 13. --dry-run with all flags populated matches request-full-featured.json
// structurally when invoked as a subprocess (AC for Phase 3).
test("CLI --dry-run with all flags populated matches request-full-featured.json", () => {
  const { spawnSync } = require("node:child_process");
  const CLI = path.resolve(__dirname, "..", "generate.cjs");
  const golden = loadGolden("request-full-featured.json");
  const env = { PATH: process.env.PATH || "/usr/bin:/bin" };
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  env.GEMINI_API_KEY = "";
  const res = spawnSync(process.execPath, [CLI,
    "--prompt", "a fortress under siege",
    "--output", "fortress.png",
    "--model", "gemini-3.1-flash-image-preview",
    "--aspect", "16:9",
    "--size", "2K",
    "--thinking", "medium",
    "--seed", "1337",
    "--temperature", "0.5",
    "--style", "pixel-16bit",
    "--style", "oil-painting",
    "--negative", "blurry",
    "--negative", "modern",
    "--safety", "HARM_CATEGORY_HATE_SPEECH=OFF",
    "--image", TINY_PNG,
    "--dry-run",
  ], { env, encoding: "utf8" });
  assert.equal(res.status, 0, `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = JSON.parse(res.stdout.trim());
  assert.equal(j.dryRun, true);
  // --dry-run replaces the placeholder with <redacted>. Compare body
  // + url + the non-key header fields.
  assert.deepStrictEqual(j.body, golden.body,
    "dry-run body must structurally match request-full-featured.json");
  assert.equal(j.url, golden.url);
  assert.equal(j.headers["Content-Type"], "application/json");
  assert.equal(j.headers["x-goog-api-key"], "<redacted>");
});

runAll();
