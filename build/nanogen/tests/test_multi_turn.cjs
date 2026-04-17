"use strict";
// Sub-plan 2 Phase 2 tests: --history-continue + multi-turn + thoughtSignature.
//
// Two test categories:
//   (a) Pure builder tests: call buildContinuationRequestFromMaterials
//       directly, compare structurally to a golden fixture. Goldens use
//       the "<tiny-1x1-base64>" placeholder pattern established in Phase 1.
//   (b) CLI subprocess tests: spawnSync generate.cjs with a cleaned env +
//       a temp cwd containing a pre-seeded .nanogen-history.jsonl. Assert
//       on stdout/stderr/exit-code.
//
// All tests run under withCleanEnv (NANOGEN_API_BASE deleted) so the prod
// default URL pins into goldens.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const gen = require("../generate.cjs");

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
const TINY_PNG_BYTES = fs.readFileSync(TINY_PNG);
const TINY_BASE64 = TINY_PNG_BYTES.toString("base64");
const CLI = path.resolve(__dirname, "..", "generate.cjs");

function loadGoldenExpanded(name) {
  const raw = fs.readFileSync(path.join(FIX, name), "utf8");
  const expanded = raw.replace(/<tiny-1x1-base64>/g, TINY_BASE64);
  return JSON.parse(expanded);
}

function loadHistoryFixture(name) {
  return fs.readFileSync(path.join(FIX, name), "utf8");
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
    historyId: undefined,
    historyParent: undefined,
    historyContinue: undefined,
    noHistory: false,
    dryRun: false,
  }, overrides);
}

// Make a scratch cwd with:
//   - .nanogen-history.jsonl populated from the given fixture
//   - cat.png / dog.png / bad.png populated with tiny-1x1.png bytes
//     (unless the test requests "skipOutput" for a given path)
function makeScratchCwd(historyFixtureName, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nanogen-mt-"));
  if (historyFixtureName) {
    fs.writeFileSync(
      path.join(dir, ".nanogen-history.jsonl"),
      loadHistoryFixture(historyFixtureName)
    );
  }
  const prepare = opts.prepareOutputs !== false;
  if (prepare) {
    fs.writeFileSync(path.join(dir, "cat.png"), TINY_PNG_BYTES);
    fs.writeFileSync(path.join(dir, "dog.png"), TINY_PNG_BYTES);
    // bad.png intentionally not written (refused entry carries no file).
  }
  return dir;
}

function rmScratch(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
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
// (1) Pure-builder golden: request-continue-basic.json.
// ---------------------------------------------------------------------------

test("golden: request-continue-basic.json (prompt-only current turn)", () => {
  withCleanEnv(() => {
    const args = baseArgs({
      prompt: "add a hat",
      output: "out.png",
      historyContinue: "cat-abc12345",
    });
    const priorEntry = {
      id: "cat-abc12345",
      prompt: "cat",
      output: "cat.png",
      params: { model: "gemini-3.1-flash-image-preview" },
      outputFormat: "png",
      refusalReason: null,
      thoughtSignature: "sig-abc",
    };
    const actual = gen.buildContinuationRequestFromMaterials(
      args, [], stylesIndex, priorEntry, TINY_PNG_BYTES, "image/png"
    );
    assert.deepStrictEqual(
      actual,
      loadGoldenExpanded("request-continue-basic.json")
    );
  });
});

// ---------------------------------------------------------------------------
// (2) thoughtSignature preserved verbatim.
// ---------------------------------------------------------------------------

test("thoughtSignature preserved byte-for-byte in contents[1].parts[1]", () => {
  withCleanEnv(() => {
    const sig = "sig-abc\n\u0000weird\t\"quoted\"chars";
    const args = baseArgs({
      prompt: "next",
      output: "out.png",
      historyContinue: "x",
    });
    const priorEntry = {
      id: "x",
      prompt: "p",
      output: "cat.png",
      params: { model: "gemini-3.1-flash-image-preview" },
      outputFormat: "png",
      refusalReason: null,
      thoughtSignature: sig,
    };
    const r = gen.buildContinuationRequestFromMaterials(
      args, [], stylesIndex, priorEntry, TINY_PNG_BYTES, "image/png"
    );
    assert.equal(
      r.body.contents[1].parts[1].thoughtSignature,
      sig,
      "thoughtSignature must be preserved byte-for-byte"
    );
  });
});

// ---------------------------------------------------------------------------
// (3) Role annotations user/model/user are mandatory and in order.
// ---------------------------------------------------------------------------

test("role annotations: user, model, user", () => {
  withCleanEnv(() => {
    const args = baseArgs({
      prompt: "next",
      output: "out.png",
      historyContinue: "x",
    });
    const priorEntry = {
      id: "x", prompt: "p", output: "cat.png",
      params: { model: "gemini-3.1-flash-image-preview" },
      outputFormat: "png", refusalReason: null, thoughtSignature: "s",
    };
    const r = gen.buildContinuationRequestFromMaterials(
      args, [], stylesIndex, priorEntry, TINY_PNG_BYTES, "image/png"
    );
    assert.equal(r.body.contents.length, 3, "must have exactly 3 turns");
    assert.equal(r.body.contents[0].role, "user");
    assert.equal(r.body.contents[1].role, "model");
    assert.equal(r.body.contents[2].role, "user");
  });
});

// ---------------------------------------------------------------------------
// (4) Current-turn images append AFTER the new user text part.
// ---------------------------------------------------------------------------

test("golden: request-continue-with-current-image.json (current --image appended to last user turn)", () => {
  withCleanEnv(() => {
    const args = baseArgs({
      prompt: "apply this style",
      output: "out.png",
      image: [TINY_PNG],
      historyContinue: "cat-abc12345",
    });
    const { imageMaterials } = gen.readImageMaterials(args);
    const priorEntry = {
      id: "cat-abc12345", prompt: "cat", output: "cat.png",
      params: { model: "gemini-3.1-flash-image-preview" },
      outputFormat: "png", refusalReason: null, thoughtSignature: "sig-abc",
    };
    const actual = gen.buildContinuationRequestFromMaterials(
      args, imageMaterials, stylesIndex, priorEntry, TINY_PNG_BYTES, "image/png"
    );
    assert.deepStrictEqual(
      actual,
      loadGoldenExpanded("request-continue-with-current-image.json")
    );
    // Verify: first part of the 3rd turn is text, then the image.
    const turn3Parts = actual.body.contents[2].parts;
    assert.equal(turn3Parts.length, 2);
    assert.ok(turn3Parts[0].text !== undefined);
    assert.ok(turn3Parts[1].inlineData);
  });
});

// ---------------------------------------------------------------------------
// (5) --region appends to the CURRENT turn's prompt text, not the historical one.
// ---------------------------------------------------------------------------

test("golden: request-continue-with-region.json (--region composes into current turn)", () => {
  withCleanEnv(() => {
    const args = baseArgs({
      output: "out.png",
      region: ["the cat's head"],
      historyContinue: "cat-abc12345",
    });
    const priorEntry = {
      id: "cat-abc12345", prompt: "cat", output: "cat.png",
      params: { model: "gemini-3.1-flash-image-preview" },
      outputFormat: "png", refusalReason: null, thoughtSignature: "sig-abc",
    };
    const actual = gen.buildContinuationRequestFromMaterials(
      args, [], stylesIndex, priorEntry, TINY_PNG_BYTES, "image/png"
    );
    assert.deepStrictEqual(
      actual,
      loadGoldenExpanded("request-continue-with-region.json")
    );
    // Historical user turn MUST NOT have a Region suffix.
    assert.equal(actual.body.contents[0].parts[0].text, "cat");
    // Current user turn MUST have the Region suffix + edit-mode boilerplate.
    assert.equal(
      actual.body.contents[2].parts[0].text,
      "Edit the provided image(s). Region: the cat's head."
    );
  });
});

// ---------------------------------------------------------------------------
// (6) Unknown id → E_CONTINUE_UNKNOWN_ID.
// ---------------------------------------------------------------------------

test("E_CONTINUE_UNKNOWN_ID when id not in history", () => {
  const dir = makeScratchCwd("fixture-history-continuable.jsonl");
  try {
    const res = spawnSync(process.execPath, [CLI,
      "--history-continue", "does-not-exist",
      "--prompt", "anything",
      "--output", "out.png",
      "--dry-run",
    ], {
      cwd: dir,
      env: cleanEnv({ GEMINI_API_KEY: "" }),
      encoding: "utf8",
    });
    assert.equal(res.status, 1, `stdout=${res.stdout} stderr=${res.stderr}`);
    const j = JSON.parse(res.stdout.trim());
    assert.equal(j.code, "E_CONTINUE_UNKNOWN_ID");
  } finally {
    rmScratch(dir);
  }
});

// ---------------------------------------------------------------------------
// (7) Refused entry → E_CONTINUE_REFUSED_ENTRY.
// ---------------------------------------------------------------------------

test("E_CONTINUE_REFUSED_ENTRY when prior entry was refused", () => {
  const dir = makeScratchCwd("fixture-history-refused.jsonl");
  try {
    const res = spawnSync(process.execPath, [CLI,
      "--history-continue", "refused-ff998877",
      "--prompt", "retry",
      "--output", "out.png",
      "--dry-run",
    ], {
      cwd: dir,
      env: cleanEnv({ GEMINI_API_KEY: "" }),
      encoding: "utf8",
    });
    assert.equal(res.status, 1, `stdout=${res.stdout} stderr=${res.stderr}`);
    const j = JSON.parse(res.stdout.trim());
    assert.equal(j.code, "E_CONTINUE_REFUSED_ENTRY");
  } finally {
    rmScratch(dir);
  }
});

// ---------------------------------------------------------------------------
// (8) No-signature entry → E_CONTINUE_NO_SIGNATURE.
// ---------------------------------------------------------------------------

test("E_CONTINUE_NO_SIGNATURE when prior entry has thoughtSignature=null", () => {
  const dir = makeScratchCwd("fixture-history-no-sig.jsonl");
  try {
    const res = spawnSync(process.execPath, [CLI,
      "--history-continue", "nosig-def67890",
      "--prompt", "refine",
      "--output", "out.png",
      "--dry-run",
    ], {
      cwd: dir,
      env: cleanEnv({ GEMINI_API_KEY: "" }),
      encoding: "utf8",
    });
    assert.equal(res.status, 1, `stdout=${res.stdout} stderr=${res.stderr}`);
    const j = JSON.parse(res.stdout.trim());
    assert.equal(j.code, "E_CONTINUE_NO_SIGNATURE");
  } finally {
    rmScratch(dir);
  }
});

// ---------------------------------------------------------------------------
// (9) Missing output file → E_CONTINUE_MISSING_OUTPUT.
// ---------------------------------------------------------------------------

test("E_CONTINUE_MISSING_OUTPUT when output file on disk is missing", () => {
  // Seed history but DON'T create cat.png.
  const dir = makeScratchCwd("fixture-history-continuable.jsonl",
    { prepareOutputs: false });
  try {
    const res = spawnSync(process.execPath, [CLI,
      "--history-continue", "cat-abc12345",
      "--prompt", "tweak",
      "--output", "out.png",
      "--dry-run",
    ], {
      cwd: dir,
      env: cleanEnv({ GEMINI_API_KEY: "" }),
      encoding: "utf8",
    });
    assert.equal(res.status, 1, `stdout=${res.stdout} stderr=${res.stderr}`);
    const j = JSON.parse(res.stdout.trim());
    assert.equal(j.code, "E_CONTINUE_MISSING_OUTPUT");
  } finally {
    rmScratch(dir);
  }
});

// ---------------------------------------------------------------------------
// (10) Mismatched model → success + pinned stderr warning.
// ---------------------------------------------------------------------------

test("model mismatch: continuation proceeds + emits pinned stderr warning", () => {
  const dir = makeScratchCwd("fixture-history-continuable.jsonl");
  try {
    // Prior entry is recorded under "gemini-3.1-flash-image-preview";
    // specify a different model on the current turn.
    const res = spawnSync(process.execPath, [CLI,
      "--history-continue", "cat-abc12345",
      "--model", "gemini-3-pro-image-preview",
      "--prompt", "upscale",
      "--output", "out.png",
      "--dry-run",
    ], {
      cwd: dir,
      env: cleanEnv({ GEMINI_API_KEY: "" }),
      encoding: "utf8",
    });
    assert.equal(res.status, 0, `stdout=${res.stdout} stderr=${res.stderr}`);
    const expectedWarning = 'nanogen: --history-continue source used model "gemini-3.1-flash-image-preview"; continuing with model "gemini-3-pro-image-preview". Gemini may 400 on thoughtSignature format mismatch.';
    assert.ok(
      res.stderr.includes(expectedWarning),
      `stderr must include pinned warning; got: ${JSON.stringify(res.stderr)}`
    );
    // Dry-run body still emitted.
    const j = JSON.parse(res.stdout.trim());
    assert.equal(j.dryRun, true);
    assert.equal(j.body.contents.length, 3);
  } finally {
    rmScratch(dir);
  }
});

// ---------------------------------------------------------------------------
// (11) Unknown MIME (outputFormat missing + no magic match) → E_CONTINUE_UNKNOWN_MIME.
// ---------------------------------------------------------------------------

test("E_CONTINUE_UNKNOWN_MIME when outputFormat missing and bytes aren't PNG/JPEG/WEBP", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nanogen-mt-"));
  try {
    // Seed history with an entry that has outputFormat=null AND an
    // output file full of garbage bytes (not PNG/JPEG/WEBP).
    const entry = {
      id: "garb-11223344",
      timestamp: "2026-04-17T12:00:00.000Z",
      prompt: "p",
      output: "garbage.bin",
      params: {
        model: "gemini-3.1-flash-image-preview",
        aspectRatio: "1:1", imageSize: "1K",
        thinkingLevel: null, seed: null, temperature: null, styles: [],
      },
      parentId: null, bytes: 4,
      outputFormat: null, outputExtension: null,
      refusalReason: null,
      thoughtSignature: "sig-garb",
    };
    fs.writeFileSync(path.join(dir, ".nanogen-history.jsonl"),
      JSON.stringify(entry) + "\n");
    // 4 random non-magic bytes.
    fs.writeFileSync(path.join(dir, "garbage.bin"),
      Buffer.from([0x00, 0x01, 0x02, 0x03]));
    const res = spawnSync(process.execPath, [CLI,
      "--history-continue", "garb-11223344",
      "--prompt", "retry",
      "--output", "out.png",
      "--dry-run",
    ], {
      cwd: dir,
      env: cleanEnv({ GEMINI_API_KEY: "" }),
      encoding: "utf8",
    });
    assert.equal(res.status, 1, `stdout=${res.stdout} stderr=${res.stderr}`);
    const j = JSON.parse(res.stdout.trim());
    assert.equal(j.code, "E_CONTINUE_UNKNOWN_MIME");
  } finally {
    rmScratch(dir);
  }
});

// ---------------------------------------------------------------------------
// (12) --history-continue + --history-parent → E_CONTINUE_WITH_PARENT.
// ---------------------------------------------------------------------------

test("E_CONTINUE_WITH_PARENT when both --history-continue and --history-parent set", () => {
  const res = spawnSync(process.execPath, [CLI,
    "--history-continue", "x",
    "--history-parent", "y",
    "--prompt", "p",
    "--output", "out.png",
    "--dry-run",
  ], {
    env: cleanEnv({ GEMINI_API_KEY: "" }),
    encoding: "utf8",
  });
  assert.equal(res.status, 1, `stdout=${res.stdout} stderr=${res.stderr}`);
  const j = JSON.parse(res.stdout.trim());
  assert.equal(j.code, "E_CONTINUE_WITH_PARENT");
});

// ---------------------------------------------------------------------------
// (13) Tolerant reader: malformed line mixed in → still finds the valid entry.
// ---------------------------------------------------------------------------

test("tolerant reader: malformed lines are skipped, valid entry is found", () => {
  const dir = makeScratchCwd("fixture-history-continuable.jsonl");
  try {
    // Append a garbage line + a half-line before the file's valid line.
    const existing = fs.readFileSync(
      path.join(dir, ".nanogen-history.jsonl"), "utf8");
    const rewritten =
      "this is not json at all\n" +
      '{"id":"half","incomplete\n' +  // truncated JSON
      existing;
    fs.writeFileSync(
      path.join(dir, ".nanogen-history.jsonl"), rewritten);
    const res = spawnSync(process.execPath, [CLI,
      "--history-continue", "cat-abc12345",
      "--prompt", "tweak",
      "--output", "out.png",
      "--dry-run",
    ], {
      cwd: dir,
      env: cleanEnv({ GEMINI_API_KEY: "" }),
      encoding: "utf8",
    });
    assert.equal(res.status, 0, `stdout=${res.stdout} stderr=${res.stderr}`);
    const j = JSON.parse(res.stdout.trim());
    assert.equal(j.dryRun, true);
    assert.equal(j.body.contents[1].parts[1].thoughtSignature, "sig-abc");
  } finally {
    rmScratch(dir);
  }
});

// ---------------------------------------------------------------------------
// (14) --dry-run end-to-end: continuation body emitted; exit 0; no HTTP.
// ---------------------------------------------------------------------------

test("CLI --dry-run end-to-end: continuation emits body, exit 0", () => {
  const dir = makeScratchCwd("fixture-history-continuable.jsonl");
  try {
    const res = spawnSync(process.execPath, [CLI,
      "--history-continue", "cat-abc12345",
      "--prompt", "add a hat",
      "--output", "result.png",
      "--dry-run",
    ], {
      cwd: dir,
      env: cleanEnv({ GEMINI_API_KEY: "" }),
      encoding: "utf8",
    });
    assert.equal(res.status, 0, `stdout=${res.stdout} stderr=${res.stderr}`);
    const j = JSON.parse(res.stdout.trim());
    assert.equal(j.dryRun, true);
    const golden = loadGoldenExpanded("request-continue-basic.json");
    assert.deepStrictEqual(j.body, golden.body);
    assert.equal(j.url, golden.url);
  } finally {
    rmScratch(dir);
  }
});

// ---------------------------------------------------------------------------
// (15) Bonus: parseArgs parses --history-continue into args.historyContinue.
// ---------------------------------------------------------------------------

test("parseArgs: --history-continue assigns historyContinue", () => {
  const args = gen.parseArgs([
    "--history-continue", "abc-12345",
    "--prompt", "x",
    "--output", "o.png",
  ]);
  assert.equal(args.historyContinue, "abc-12345");
  assert.equal(args.historyParent, undefined);
});

// ---------------------------------------------------------------------------
// (16) Bonus: MIME magic-byte fallback when outputFormat is missing but bytes are PNG.
// ---------------------------------------------------------------------------

test("magic-byte fallback: outputFormat=null but bytes are PNG → continuation succeeds", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nanogen-mt-"));
  try {
    const entry = {
      id: "fallback-99887766",
      timestamp: "2026-04-17T12:00:00.000Z",
      prompt: "cat",
      output: "cat.png",
      params: {
        model: "gemini-3.1-flash-image-preview",
        aspectRatio: "1:1", imageSize: "1K",
        thinkingLevel: null, seed: null, temperature: null, styles: [],
      },
      parentId: null, bytes: 67,
      outputFormat: null, outputExtension: "png",
      refusalReason: null,
      thoughtSignature: "sig-fb",
    };
    fs.writeFileSync(path.join(dir, ".nanogen-history.jsonl"),
      JSON.stringify(entry) + "\n");
    fs.writeFileSync(path.join(dir, "cat.png"), TINY_PNG_BYTES);
    const res = spawnSync(process.execPath, [CLI,
      "--history-continue", "fallback-99887766",
      "--prompt", "next",
      "--output", "out.png",
      "--dry-run",
    ], {
      cwd: dir,
      env: cleanEnv({ GEMINI_API_KEY: "" }),
      encoding: "utf8",
    });
    assert.equal(res.status, 0, `stdout=${res.stdout} stderr=${res.stderr}`);
    const j = JSON.parse(res.stdout.trim());
    assert.equal(j.body.contents[1].parts[0].inlineData.mimeType, "image/png");
    assert.equal(j.body.contents[1].parts[1].thoughtSignature, "sig-fb");
  } finally {
    rmScratch(dir);
  }
});

runAll();
