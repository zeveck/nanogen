"use strict";
// Phase 5 — end-to-end integration tests via the in-process mock server.
// Exercises the full CLI flow: argument parsing → fetchWithRetry →
// parseResponse → file write → history append → stdout/stderr contract.
//
// Uses async spawn (NOT spawnSync). spawnSync deadlocks in-process mocks
// because it blocks the parent's event loop.

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const CLI = path.resolve(__dirname, "..", "generate.cjs");

// ---------------------------------------------------------------------------
// withCleanEnv + subprocess env helpers
// ---------------------------------------------------------------------------

const NUKE_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "NANOGEN_API_BASE",
  "NANOGEN_RETRY_BASE_MS",
  "NANOGEN_FETCH_TIMEOUT_MS",
  "NANOGEN_MAX_RETRIES",
];

function cleanSubprocessEnv(extra = {}) {
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
// Mock server (mirrors test_http_retry.cjs pattern).
// ---------------------------------------------------------------------------

const TINY_PNG_BYTES = fs.readFileSync(
  path.resolve(__dirname, "fixtures", "tiny-1x1.png")
);
const TINY_PNG_B64 = TINY_PNG_BYTES.toString("base64");

// 1x1 JPEG (canonical minimal JPEG). Constructed here so we can test
// the ext-vs-MIME mismatch warning without depending on a new fixture.
// Source: https://github.com/mathiasbynens/small (public domain).
const TINY_JPEG_B64 =
  "/9j/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB" +
  "AQEBAQEBAQEBAQEBAQEB/9sAQwEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB" +
  "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEB" +
  "AQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNR" +
  "YQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldY" +
  "WVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TF" +
  "xsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAAwDAQACEQMRAD8A/v4ooooA//2Q==";

function successBody(opts = {}) {
  const mimeType = opts.mimeType || "image/png";
  const data = opts.data || (mimeType === "image/jpeg" ? TINY_JPEG_B64 : TINY_PNG_B64);
  const candidate = {
    finishReason: "STOP",
    content: {
      parts: [{ inlineData: { mimeType, data } }],
    },
  };
  if (opts.thoughtSignature !== undefined) {
    candidate.content.parts.push({ thoughtSignature: opts.thoughtSignature });
  }
  return { candidates: [candidate] };
}

function refusalBody(reason) {
  return {
    candidates: [{
      finishReason: reason,
      content: { parts: [{ text: "refusing" }] },
    }],
  };
}

function makeMock(script) {
  const state = { attempts: 0, server: null, port: 0, requests: [] };
  const server = http.createServer((req, res) => {
    state.attempts++;
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      state.requests.push({
        method: req.method,
        url: req.url,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      const idx = Math.min(state.attempts - 1, script.length - 1);
      try { script[idx](req, res, state); }
      catch (e) {
        try { res.statusCode = 500; res.end("handler threw: " + e.message); } catch (_) {}
      }
    });
    req.on("error", () => {});
    res.on("error", () => {});
  });
  state.server = server;
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      state.port = server.address().port;
      resolve(state);
    });
  });
}

function closeMock(mock) {
  return new Promise((resolve) => {
    if (!mock || !mock.server) return resolve();
    mock.server.closeAllConnections && mock.server.closeAllConnections();
    mock.server.close(() => resolve());
  });
}

function respondJson(res, status, bodyObj, headers = {}) {
  const body = typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

// ---------------------------------------------------------------------------
// CLI runner + tempdir helpers.
// ---------------------------------------------------------------------------

function runCLI(args, envExtra = {}, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: cleanSubprocessEnv({
        GEMINI_API_KEY: "test-key",
        NANOGEN_RETRY_BASE_MS: "5",
        ...envExtra,
      }),
      cwd: cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString("utf8"); });
    child.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
    child.on("close", (code, signal) => {
      resolve({ status: code, signal, stdout, stderr });
    });
  });
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nanogen-int-"));
}

function rmTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function parseLastJsonLine(stdout) {
  const lines = stdout.trim().split("\n").filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

function readHistoryFile(cwd) {
  const p = path.join(cwd, ".nanogen-history.jsonl");
  if (!fs.existsSync(p)) return [];
  const txt = fs.readFileSync(p, "utf8");
  return txt.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function runAll() {
  let passed = 0, failed = 0;
  const start = Date.now();
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
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`\n${passed}/${tests.length} passed${failed ? `, ${failed} failed` : ""} (${elapsed}s)`);
  if (failed) process.exit(1);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// 1. Successful generate: output file bytes match mock response; history row
// written with correct fields; stdout success JSON has bytes > 0.
test("success: file written with correct bytes; history row; success JSON", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 200, successBody()),
  ]);
  const tmp = mkTmp();
  try {
    const outPath = path.join(tmp, "sub", "gen.png");
    const r = await runCLI(
      ["--prompt", "a cat on a hat", "--output", outPath],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r.status, 0,
      `exit 0 expected; stderr=${r.stderr}; stdout=${r.stdout}`);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.success, true);
    assert.ok(out.bytes > 0, `expected bytes > 0; got ${out.bytes}`);
    assert.equal(out.output, outPath);
    assert.ok(typeof out.historyId === "string" && out.historyId.length > 0);
    assert.equal(out.refusalReason, null);

    // File exists and bytes match the fixture PNG.
    assert.ok(fs.existsSync(outPath), "output file should exist");
    const onDisk = fs.readFileSync(outPath);
    assert.deepEqual(onDisk, TINY_PNG_BYTES, "on-disk bytes must match fixture");

    // History row present.
    const rows = readHistoryFile(tmp);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].output, outPath);
    assert.equal(rows[0].refusalReason, null);
    assert.equal(rows[0].outputFormat, "png");
    assert.equal(rows[0].outputExtension, "png");
    assert.equal(rows[0].bytes, onDisk.length);
    assert.equal(rows[0].prompt, "a cat on a hat");
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 2. 429 × 2 then 200 → final bytes written; history reflects final params.
test("retries: 429 × 2 then 200 → final bytes; history reflects final params", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 429, { error: "slow" }),
    (req, res) => respondJson(res, 429, { error: "slow" }),
    (req, res) => respondJson(res, 200, successBody()),
  ]);
  const tmp = mkTmp();
  try {
    const outPath = path.join(tmp, "retried.png");
    const r = await runCLI(
      ["--prompt", "resilient", "--output", outPath,
       "--aspect", "16:9", "--size", "2K"],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r.status, 0,
      `exit 0 expected; stderr=${r.stderr}; stdout=${r.stdout}`);
    assert.equal(mock.attempts, 3);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.success, true);
    assert.equal(out.aspectRatio, "16:9");
    assert.equal(out.imageSize, "2K");
    assert.ok(fs.existsSync(outPath));
    const rows = readHistoryFile(tmp);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].params.aspectRatio, "16:9");
    assert.equal(rows[0].params.imageSize, "2K");
    assert.equal(rows[0].prompt, "resilient");
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 3. SAFETY refusal → no output file; stdout code=E_REFUSED; history row
// with refusalReason=finish:SAFETY.
test("SAFETY refusal: no output; E_REFUSED; history row records finish:SAFETY", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 200, refusalBody("SAFETY")),
  ]);
  const tmp = mkTmp();
  try {
    const outPath = path.join(tmp, "nope.png");
    const r = await runCLI(
      ["--prompt", "blocked content", "--output", outPath],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r.status, 1);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.success, false);
    assert.equal(out.code, "E_REFUSED");
    assert.equal(out.error, "finish:SAFETY");
    assert.ok(!fs.existsSync(outPath), "output file must NOT exist on refusal");
    const rows = readHistoryFile(tmp);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].refusalReason, "finish:SAFETY");
    assert.equal(rows[0].bytes, 0);
    assert.equal(rows[0].outputFormat, null);
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 4. --no-history + success → no .nanogen-history.jsonl created; file written.
test("--no-history + success → no history file created, file still written", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 200, successBody()),
  ]);
  const tmp = mkTmp();
  try {
    const outPath = path.join(tmp, "nohist.png");
    const r = await runCLI(
      ["--prompt", "no history please", "--output", outPath, "--no-history"],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r.status, 0, `stderr=${r.stderr}; stdout=${r.stdout}`);
    assert.ok(fs.existsSync(outPath));
    assert.ok(!fs.existsSync(path.join(tmp, ".nanogen-history.jsonl")));
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 5. thoughtSignature round-trip: mock returns sig-abc; history row contains it.
test("thoughtSignature round-trip: history row contains sig-abc", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 200,
      successBody({ thoughtSignature: "sig-abc" })
    ),
  ]);
  const tmp = mkTmp();
  try {
    const outPath = path.join(tmp, "sig.png");
    const r = await runCLI(
      ["--prompt", "think carefully", "--output", outPath],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r.status, 0, `stderr=${r.stderr}; stdout=${r.stdout}`);
    const rows = readHistoryFile(tmp);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].thoughtSignature, "sig-abc");
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 6. Output ext vs MIME mismatch: mock returns image/jpeg when --output is .png.
// Expect pinned stderr warning; file still written; history row has
// outputFormat=jpeg, outputExtension=png.
test("ext-vs-MIME mismatch: stderr warning; file written; history reflects actual MIME", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 200,
      successBody({ mimeType: "image/jpeg", data: TINY_JPEG_B64 })
    ),
  ]);
  const tmp = mkTmp();
  try {
    const outPath = path.join(tmp, "actually-jpeg.png");
    const r = await runCLI(
      ["--prompt", "portrait", "--output", outPath],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r.status, 0,
      `exit 0 expected; stderr=${r.stderr}; stdout=${r.stdout}`);
    assert.ok(
      r.stderr.includes(
        'nanogen: output extension ".png" but API returned image/jpeg; bytes written as-is.'
      ),
      `expected pinned ext-vs-MIME warning; got stderr: ${r.stderr}`
    );
    assert.ok(fs.existsSync(outPath), "file should be written despite mismatch");
    const rows = readHistoryFile(tmp);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].outputFormat, "jpeg",
      "outputFormat should reflect actual MIME, not extension");
    assert.equal(rows[0].outputExtension, "png");
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

runAll();
