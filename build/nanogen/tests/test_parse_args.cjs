"use strict";
// Phase 1 acceptance: at least one negative test per validation code 1-21,
// one success baseline with --dry-run, and one --help test.

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CLI = path.resolve(__dirname, "..", "generate.cjs");

// ---------------------------------------------------------------------------
// withCleanEnv: snapshot process.env, DELETE relevant vars, run fn, restore.
// Subprocess invocations pass an explicit cleaned env dict (see cleanEnv()).
// ---------------------------------------------------------------------------

const NUKE_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "NANOGEN_API_BASE",
  "NANOGEN_RETRY_BASE_MS",
  "NANOGEN_FETCH_TIMEOUT_MS",
  "NANOGEN_MAX_RETRIES",
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
  // Build a minimal env for subprocess: inherit PATH so node resolves, but
  // drop all nanogen/Gemini vars; callers can override.
  const env = { PATH: process.env.PATH || "/usr/bin:/bin" };
  // keep HOME / TMPDIR so Node behaves normally
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  for (const k of NUKE_KEYS) delete env[k];
  // Caller overrides
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

function runCLI(args, { env = cleanEnv(), input } = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    env,
    encoding: "utf8",
    input,
  });
  return res;
}

function parseStdoutJson(out) {
  // CLI emits one JSON line on stdout; --help is the only exception.
  const line = out.trim();
  return JSON.parse(line);
}

// ---------------------------------------------------------------------------
// Fixtures (temp dir with good/bad images)
// ---------------------------------------------------------------------------

let tmpDir;
let goodPng;       // valid PNG magic
let jpegAsPng;     // JPEG bytes with .png extension (magic mismatch)
let emptyPng;      // zero-byte PNG
let bogusExt;      // file with ext .bmp (invalid)
let goodWebp;      // valid WEBP magic
let bigPng;        // > 15 MB

function setupFixtures() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nanogen-phase1-"));

  // Canonical 1x1 PNG (67 bytes, standard).
  const ONE_PX_PNG = Buffer.from(
    "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4" +
    "890000000D49444154789C63000100000005000100" +
    "0D0A2DB40000000049454E44AE426082",
    "hex"
  );
  goodPng = path.join(tmpDir, "good.png");
  fs.writeFileSync(goodPng, ONE_PX_PNG);

  // JPEG SOI bytes but named .png → magic mismatch.
  const JPEG_BYTES = Buffer.from("FFD8FFE000104A46494600010100000100010000", "hex");
  jpegAsPng = path.join(tmpDir, "jpeg-as-png.png");
  fs.writeFileSync(jpegAsPng, JPEG_BYTES);

  // Zero-byte PNG.
  emptyPng = path.join(tmpDir, "empty.png");
  fs.writeFileSync(emptyPng, Buffer.alloc(0));

  // .bmp — not in {png,jpg,jpeg,webp}. Content is valid (PNG bytes) —
  // extension check (rule 16) fires before any magic check.
  bogusExt = path.join(tmpDir, "file.bmp");
  fs.writeFileSync(bogusExt, ONE_PX_PNG);

  // WEBP "RIFF....WEBP"
  const WEBP_HEADER = Buffer.alloc(12);
  WEBP_HEADER.write("RIFF", 0, "ascii");
  WEBP_HEADER.writeUInt32LE(4, 4); // dummy length
  WEBP_HEADER.write("WEBP", 8, "ascii");
  goodWebp = path.join(tmpDir, "good.webp");
  fs.writeFileSync(goodWebp, Buffer.concat([WEBP_HEADER, Buffer.alloc(100)]));

  // Big PNG — >15 MB. Only needed for rule 18.
  bigPng = path.join(tmpDir, "big.png");
  // Start with a valid PNG header, pad out past 15 MB.
  const big = Buffer.alloc(15 * 1024 * 1024 + 32);
  ONE_PX_PNG.copy(big, 0, 0, 8); // PNG magic + IHDR length prefix
  // Ensure first 4 bytes are PNG magic
  big[0] = 0x89; big[1] = 0x50; big[2] = 0x4E; big[3] = 0x47;
  fs.writeFileSync(bigPng, big);
}

function teardownFixtures() {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Test runner
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

function assertErrorJson(res, expectedCode) {
  assert.equal(res.status, 1,
    `expected exit 1, got ${res.status}; stdout=${res.stdout} stderr=${res.stderr}`);
  const j = parseStdoutJson(res.stdout);
  assert.equal(j.success, false, `success should be false, got ${JSON.stringify(j)}`);
  assert.equal(j.code, expectedCode,
    `code should be ${expectedCode}, got ${j.code}; error=${j.error}`);
  assert.equal(typeof j.error, "string");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Baseline: success with --dry-run
test("baseline --dry-run success", () => {
  const res = runCLI(["--prompt", "X", "--output", "foo.png", "--dry-run"],
    { env: cleanEnv({ GEMINI_API_KEY: "" }) });
  assert.equal(res.status, 0, `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = parseStdoutJson(res.stdout);
  assert.equal(j.dryRun, true);
  assert.equal(j.headers["x-goog-api-key"], "<redacted>");
  assert.equal(j.headers["Content-Type"], "application/json");
  assert.equal(j.body.contents[0].parts[0].text, "X");
  assert.equal(typeof j.url, "string");
  assert.ok(j.url.includes(":generateContent"));
});

// --help
test("--help prints free-form help starting with 'Usage: nanogen ' (not JSON)", () => {
  const res = runCLI(["--help"]);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /^Usage: nanogen /);
  // Assert it's NOT JSON
  let isJson = true;
  try { JSON.parse(res.stdout.trim()); } catch (_) { isJson = false; }
  assert.equal(isJson, false, "help output must not parse as JSON");
  // Enum value lists present
  assert.ok(res.stdout.includes("1:1"));
  assert.ok(res.stdout.includes("16:9"));
  assert.ok(res.stdout.includes("512"));
  assert.ok(res.stdout.includes("minimal"));
  // Footer
  assert.ok(res.stdout.includes("aistudio.google.com/app/apikey"));
  assert.ok(res.stdout.includes("GEMINI_API_KEY"));
});

test("-h alias prints help", () => {
  const res = runCLI(["-h"]);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /^Usage: nanogen /);
});

// Rule 1: E_MISSING_OUTPUT (dry-run without --output)
test("rule 1: E_MISSING_OUTPUT when --dry-run set without --output", () => {
  const res = runCLI(["--prompt", "X", "--dry-run"]);
  assertErrorJson(res, "E_MISSING_OUTPUT");
});

// Rule 2: E_MISSING_PROMPT_OR_IMAGE (no prompt)
test("rule 2: E_MISSING_PROMPT_OR_IMAGE when --prompt missing", () => {
  const res = runCLI(["--output", "foo.png"]);
  assertErrorJson(res, "E_MISSING_PROMPT_OR_IMAGE");
});

// Rule 3: E_MISSING_OUTPUT (not dry-run, no output)
test("rule 3: E_MISSING_OUTPUT when --output missing (non dry-run)", () => {
  // With prompt set but no --output and no --dry-run.
  // Rule 1 requires --dry-run, so this hits rule 3.
  const res = runCLI(["--prompt", "X"]);
  assertErrorJson(res, "E_MISSING_OUTPUT");
});

// Rule 4: E_BAD_OUTPUT_EXT
test("rule 4: E_BAD_OUTPUT_EXT for unsupported output extension", () => {
  const res = runCLI(["--prompt", "X", "--output", "foo.gif", "--dry-run"]);
  assertErrorJson(res, "E_BAD_OUTPUT_EXT");
});

// Rule 5: E_UNKNOWN_MODEL
test("rule 5: E_UNKNOWN_MODEL for unknown --model", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--model", "not-a-model",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_UNKNOWN_MODEL");
});

// Rule 6: E_BAD_ASPECT
test("rule 6: E_BAD_ASPECT for unknown --aspect", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--aspect", "7:3",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_BAD_ASPECT");
});

// Rule 7: E_BAD_SIZE (lowercase k rejected)
test("rule 7: E_BAD_SIZE for lowercase '1k'", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--size", "1k",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_BAD_SIZE");
});

// Rule 8: E_SIZE_MODEL_MISMATCH (--size 512 with non-flash-3.1)
test("rule 8: E_SIZE_MODEL_MISMATCH for --size 512 with non-flash-3.1 model", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--model", "gemini-3-pro-image-preview",
    "--size", "512",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_SIZE_MODEL_MISMATCH");
});

// Rule 9: E_BAD_THINKING
test("rule 9: E_BAD_THINKING for unknown --thinking", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--thinking", "extreme",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_BAD_THINKING");
});

// Rule 10: E_THINKING_MODEL_MISMATCH
test("rule 10: E_THINKING_MODEL_MISMATCH for --thinking minimal on non-flash", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--model", "gemini-3-pro-image-preview",
    "--thinking", "minimal",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_THINKING_MODEL_MISMATCH");
});

// Rule 11: E_BAD_SEED
test("rule 11: E_BAD_SEED for non-integer --seed", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--seed", "not-a-number",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_BAD_SEED");
});

test("rule 11: E_BAD_SEED for fractional --seed", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--seed", "3.14",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_BAD_SEED");
});

// Rule 12: E_BAD_TEMP
test("rule 12: E_BAD_TEMP for non-finite --temperature", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--temperature", "not-a-number",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_BAD_TEMP");
});

// Rule 13: E_BAD_SAFETY_CAT
test("rule 13: E_BAD_SAFETY_CAT for unknown category", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--safety", "FAKE_CATEGORY=BLOCK_NONE",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_BAD_SAFETY_CAT");
});

// Rule 14: E_BAD_SAFETY_THRESHOLD
test("rule 14: E_BAD_SAFETY_THRESHOLD for unknown threshold", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--safety", "harassment=FAKE_THRESHOLD",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_BAD_SAFETY_THRESHOLD");
});

// Rule 15: E_IMAGE_NOT_FOUND
test("rule 15: E_IMAGE_NOT_FOUND for non-existent --image", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--image", "/does/not/exist/really.png",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_IMAGE_NOT_FOUND");
});

// Rule 16: E_BAD_IMAGE_EXT
test("rule 16: E_BAD_IMAGE_EXT for existing file with unsupported ext", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--image", bogusExt,
    "--dry-run",
  ]);
  assertErrorJson(res, "E_BAD_IMAGE_EXT");
});

// Rule 17: E_IMAGE_EMPTY
test("rule 17: E_IMAGE_EMPTY for zero-byte --image", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--image", emptyPng,
    "--dry-run",
  ]);
  assertErrorJson(res, "E_IMAGE_EMPTY");
});

// Rule 18: E_IMAGE_TOO_LARGE
test("rule 18: E_IMAGE_TOO_LARGE for >15 MB --image", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--image", bigPng,
    "--dry-run",
  ]);
  assertErrorJson(res, "E_IMAGE_TOO_LARGE");
});

// Rule 19: E_IMAGE_MIME_MISMATCH
test("rule 19: E_IMAGE_MIME_MISMATCH for JPEG bytes with .png extension", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--image", jpegAsPng,
    "--dry-run",
  ]);
  assertErrorJson(res, "E_IMAGE_MIME_MISMATCH");
});

// Rule 20: E_TOO_MANY_IMAGES
test("rule 20: E_TOO_MANY_IMAGES when --image count > 14", () => {
  const args = ["--prompt", "X", "--output", "foo.png"];
  for (let i = 0; i < 15; i++) {
    args.push("--image", goodPng);
  }
  args.push("--dry-run");
  const res = runCLI(args);
  assertErrorJson(res, "E_TOO_MANY_IMAGES");
});

// Rule 21: E_UNKNOWN_FLAG
test("rule 21: E_UNKNOWN_FLAG for misspelled flag", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--promptt", "oops",
    "--dry-run",
  ]);
  assertErrorJson(res, "E_UNKNOWN_FLAG");
});

// E_NODE_TOO_OLD: assert the runtime check string exists in generate.cjs
test("E_NODE_TOO_OLD check exists at top of generate.cjs", () => {
  const src = fs.readFileSync(CLI, "utf8");
  assert.ok(src.includes("E_NODE_TOO_OLD"),
    "generate.cjs must reference E_NODE_TOO_OLD");
  assert.ok(src.includes("process.loadEnvFile"),
    "generate.cjs must check process.loadEnvFile");
  assert.ok(src.includes("AbortSignal"),
    "generate.cjs must check AbortSignal.timeout");
});

// --dry-run with all flags populated (exercises the happy path more thoroughly)
test("--dry-run with styles, negative, safety, and image succeeds", () => {
  const res = runCLI([
    "--prompt", "A test prompt",
    "--output", "out.png",
    "--model", "gemini-3.1-flash-image-preview",
    "--aspect", "16:9",
    "--size", "2K",
    "--thinking", "medium",
    "--seed", "42",
    "--temperature", "0.7",
    "--style", "pixel-16bit",
    "--style", "oil-painting",
    "--negative", "blurry",
    "--negative", "low quality",
    "--safety", "harassment=BLOCK_NONE",
    "--image", goodPng,
    "--image", goodWebp,
    "--dry-run",
  ], { env: cleanEnv({ GEMINI_API_KEY: "" }) });
  assert.equal(res.status, 0,
    `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = parseStdoutJson(res.stdout);
  assert.equal(j.dryRun, true);
  assert.equal(j.headers["x-goog-api-key"], "<redacted>");
});

// --dry-run succeeds with GEMINI_API_KEY explicitly empty
test("--dry-run succeeds with empty GEMINI_API_KEY", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png", "--dry-run",
  ], { env: cleanEnv({ GEMINI_API_KEY: "" }) });
  assert.equal(res.status, 0,
    `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = parseStdoutJson(res.stdout);
  assert.equal(j.dryRun, true);
});

// Stderr warning: duplicate --safety category
test("duplicate --safety category emits pinned stderr warning (once per cat)", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png",
    "--safety", "harassment=BLOCK_NONE",
    "--safety", "harassment=BLOCK_ONLY_HIGH",
    "--safety", "harassment=BLOCK_MEDIUM_AND_ABOVE",
    "--dry-run",
  ], { env: cleanEnv({ GEMINI_API_KEY: "" }) });
  assert.equal(res.status, 0,
    `stdout=${res.stdout} stderr=${res.stderr}`);
  // Pinned text
  assert.ok(
    res.stderr.includes(
      "nanogen: --safety HARM_CATEGORY_HARASSMENT specified multiple times; using last value"
    ),
    `stderr: ${JSON.stringify(res.stderr)}`
  );
  // "once per category" — warning should appear exactly once, not twice
  const count = res.stderr.split(
    "nanogen: --safety HARM_CATEGORY_HARASSMENT specified multiple times"
  ).length - 1;
  assert.equal(count, 1, "warning should fire once per category");
});

// URL uses NANOGEN_API_BASE when set
test("--dry-run URL respects NANOGEN_API_BASE override", () => {
  const res = runCLI([
    "--prompt", "X", "--output", "foo.png", "--dry-run",
  ], { env: cleanEnv({
    GEMINI_API_KEY: "",
    NANOGEN_API_BASE: "http://127.0.0.1:9999",
  })});
  assert.equal(res.status, 0);
  const j = parseStdoutJson(res.stdout);
  assert.ok(
    j.url.startsWith("http://127.0.0.1:9999/"),
    `url=${j.url}`
  );
});

// ---------------------------------------------------------------------------

runAll();
