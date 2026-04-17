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

// ---------------------------------------------------------------------------
// Sub-plan 2 Phase 3 — integration tests that exercise the multi-turn
// continuation flow end-to-end via the in-process mock server. The two-call
// round-trip (test 7) is THE key Gemini-3 correctness proof: invocation 1
// persists `thoughtSignature` to history; invocation 2 reads it back and
// puts it in the continuation request body; the mock server verifies the
// exact byte sequence is present at contents[1].parts[1].thoughtSignature.
// ---------------------------------------------------------------------------

// Helper: make a handler that both asserts on the parsed incoming body and
// emits a success response. Assertion failures surface as 500 with body
// {"error":{"message":"MOCK ASSERT: <msg>"}}. With NANOGEN_MAX_RETRIES=0 the
// CLI exits immediately as E_UPSTREAM_5XX and we read the MOCK ASSERT marker
// from stderr.
function assertingHandler(assertFn, responseBody) {
  return (req, res, state) => {
    let parsed;
    try {
      parsed = JSON.parse(state.requests[state.requests.length - 1].body);
    } catch (e) {
      return respondJson(res, 500,
        { error: { message: "MOCK ASSERT: body was not JSON: " + e.message } });
    }
    try {
      assertFn(parsed);
    } catch (e) {
      return respondJson(res, 500,
        { error: { message: "MOCK ASSERT: " + (e && e.message || String(e)) } });
    }
    return respondJson(res, 200, responseBody);
  };
}

// 7. THE KEY TEST — two-call round-trip proving thoughtSignature is sent
// back verbatim on the continuation request body. This is the Gemini-3
// correctness proof the whole sub-plan exists to deliver.
test("round-trip: invocation 2 sends prior thoughtSignature in continuation body", async () => {
  // First call: plain generate returning an image + sig-xyz.
  // Second call: mock asserts body.contents[1].parts[1].thoughtSignature
  // equals "sig-xyz"; on success returns a new image + sig-def.
  const mock = await makeMock([
    (req, res) => respondJson(res, 200,
      successBody({ thoughtSignature: "sig-xyz" })),
    assertingHandler(
      (body) => {
        if (!Array.isArray(body.contents) || body.contents.length !== 3) {
          throw new Error("contents must be a 3-turn array; got " +
            JSON.stringify(body.contents && body.contents.length));
        }
        if (body.contents[0].role !== "user") {
          throw new Error("contents[0].role must be 'user'");
        }
        if (body.contents[1].role !== "model") {
          throw new Error("contents[1].role must be 'model'");
        }
        if (body.contents[2].role !== "user") {
          throw new Error("contents[2].role must be 'user'");
        }
        const modelParts = body.contents[1].parts;
        if (!Array.isArray(modelParts) || modelParts.length < 2) {
          throw new Error("model turn must have >= 2 parts (inlineData + sig)");
        }
        const sigPart = modelParts[1];
        if (!sigPart || sigPart.thoughtSignature !== "sig-xyz") {
          throw new Error(
            "contents[1].parts[1].thoughtSignature must equal 'sig-xyz'; got " +
            JSON.stringify(sigPart));
        }
      },
      successBody({ thoughtSignature: "sig-def" })
    ),
  ]);
  const tmp = mkTmp();
  try {
    const out1 = path.join(tmp, "t1.png");
    const out2 = path.join(tmp, "t2.png");

    // Invocation 1: plain generate.
    const r1 = await runCLI(
      ["--prompt", "cat", "--output", out1],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r1.status, 0,
      `invocation 1 must exit 0; stderr=${r1.stderr}; stdout=${r1.stdout}`);
    assert.ok(fs.existsSync(out1), "invocation 1 output file must exist");
    assert.deepEqual(fs.readFileSync(out1), TINY_PNG_BYTES,
      "invocation 1 bytes must match the mock payload");

    // Inspect history: capture the id AND verify sig persisted.
    const rowsAfter1 = readHistoryFile(tmp);
    assert.equal(rowsAfter1.length, 1, "exactly one history row after call 1");
    assert.equal(rowsAfter1[0].thoughtSignature, "sig-xyz",
      "history[0].thoughtSignature must persist the mock-returned sig");
    const firstId = rowsAfter1[0].id;
    assert.ok(typeof firstId === "string" && firstId.length > 0);

    // Invocation 2: --history-continue with the captured id.
    // NANOGEN_MAX_RETRIES=0 so any MOCK ASSERT 500 surfaces immediately.
    const r2 = await runCLI(
      ["--history-continue", firstId, "--prompt", "add a hat", "--output", out2],
      {
        NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}`,
        NANOGEN_MAX_RETRIES: "0",
      },
      tmp
    );
    assert.equal(r2.status, 0,
      `invocation 2 must exit 0; MOCK ASSERT fails 500; stderr=${r2.stderr}; stdout=${r2.stdout}`);
    // If the mock rejected the sig, stderr would contain the MOCK ASSERT
    // marker. Make this explicit for diagnosability.
    assert.ok(!r2.stderr.includes("MOCK ASSERT"),
      `mock server rejected continuation; stderr=${r2.stderr}`);
    assert.ok(fs.existsSync(out2), "invocation 2 output file must exist");

    const rowsAfter2 = readHistoryFile(tmp);
    assert.equal(rowsAfter2.length, 2, "two history rows after call 2");
    assert.equal(rowsAfter2[1].thoughtSignature, "sig-def",
      "history[1].thoughtSignature must be the second mock sig");
    assert.equal(rowsAfter2[1].parentId, firstId,
      "history[1].parentId must equal invocation 1's id");
    // Invocation 1's file must still be intact.
    assert.deepEqual(fs.readFileSync(out1), TINY_PNG_BYTES,
      "invocation 1's file must remain unmodified after continuation");

    // Mock got exactly 2 requests (no retries).
    assert.equal(mock.attempts, 2,
      "mock server must have received exactly 2 requests");
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 8. Multi-image edit end-to-end: two --image refs + --region. Mock asserts
// body.contents[0].parts shape is [text, inlineData, inlineData] in order.
test("multi-image edit: body.contents[0].parts = [text, inlineData(a), inlineData(b)] in order", async () => {
  const mock = await makeMock([
    assertingHandler(
      (body) => {
        if (!Array.isArray(body.contents) || body.contents.length !== 1) {
          throw new Error("contents must be a 1-turn array; got " +
            (body.contents && body.contents.length));
        }
        const parts = body.contents[0].parts;
        if (!Array.isArray(parts) || parts.length !== 3) {
          throw new Error("parts must have length 3 (text + 2 inlineData); got " +
            (parts && parts.length));
        }
        if (typeof parts[0].text !== "string" || parts[0].text.length === 0) {
          throw new Error("parts[0] must be a non-empty text part");
        }
        if (!parts[1].inlineData || parts[1].inlineData.mimeType !== "image/png") {
          throw new Error("parts[1] must be inlineData with PNG MIME");
        }
        if (!parts[2].inlineData || parts[2].inlineData.mimeType !== "image/png") {
          throw new Error("parts[2] must be inlineData with PNG MIME");
        }
        // Both images in this test are the same tiny-1x1.png, so their data
        // payloads must be IDENTICAL and equal the PNG's base64.
        if (parts[1].inlineData.data !== TINY_PNG_B64 ||
            parts[2].inlineData.data !== TINY_PNG_B64) {
          throw new Error("parts[1..2].inlineData.data must be the PNG base64");
        }
        if (!parts[0].text.includes("Region:")) {
          throw new Error("parts[0].text must contain 'Region:' suffix");
        }
      },
      successBody()
    ),
  ]);
  const tmp = mkTmp();
  try {
    // Copy the tiny PNG into the tmpdir twice under different names so the
    // CLI has two distinct --image paths. The bytes match, which simplifies
    // the mock assertion but still exercises the append-order path.
    const imgA = path.join(tmp, "a.png");
    const imgB = path.join(tmp, "b.png");
    fs.copyFileSync(path.resolve(__dirname, "fixtures", "tiny-1x1.png"), imgA);
    fs.copyFileSync(path.resolve(__dirname, "fixtures", "tiny-1x1.png"), imgB);

    const outPath = path.join(tmp, "edited.png");
    const r = await runCLI(
      ["--image", imgA, "--image", imgB,
       "--region", "apply ref's palette",
       "--output", outPath],
      {
        NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}`,
        NANOGEN_MAX_RETRIES: "0",
      },
      tmp
    );
    assert.equal(r.status, 0,
      `exit 0 expected; stderr=${r.stderr}; stdout=${r.stdout}`);
    assert.ok(!r.stderr.includes("MOCK ASSERT"),
      `mock assertion failed; stderr=${r.stderr}`);
    assert.ok(fs.existsSync(outPath), "output file must exist");
    const rows = readHistoryFile(tmp);
    assert.equal(rows.length, 1, "one history row");
    assert.deepEqual(rows[0].inputImages, [imgA, imgB],
      "history must record inputImages in command-line order");
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 9. Continuation refused by SAFETY on the second turn. Invocation 1
// succeeds; invocation 2 the model returns finishReason SAFETY. CLI must
// exit 1 with E_REFUSED; no output file for invocation 2; invocation 1's
// file is still intact; history gets a SECOND row whose refusalReason is
// "finish:SAFETY".
test("continuation refused by SAFETY on second turn: E_REFUSED; prior output intact", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 200,
      successBody({ thoughtSignature: "sig-ok" })),
    (req, res) => respondJson(res, 200, refusalBody("SAFETY")),
  ]);
  const tmp = mkTmp();
  try {
    const out1 = path.join(tmp, "ok.png");
    const out2 = path.join(tmp, "refused.png");

    const r1 = await runCLI(
      ["--prompt", "benign", "--output", out1],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r1.status, 0, `call 1 must exit 0; stderr=${r1.stderr}`);
    assert.ok(fs.existsSync(out1));
    const rows1 = readHistoryFile(tmp);
    assert.equal(rows1.length, 1);
    assert.equal(rows1[0].thoughtSignature, "sig-ok");
    const firstId = rows1[0].id;

    const r2 = await runCLI(
      ["--history-continue", firstId, "--prompt", "edge case", "--output", out2],
      {
        NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}`,
        NANOGEN_MAX_RETRIES: "0",
      },
      tmp
    );
    assert.equal(r2.status, 1,
      `call 2 must exit 1 on SAFETY refusal; stderr=${r2.stderr}; stdout=${r2.stdout}`);
    const out = parseLastJsonLine(r2.stdout);
    assert.equal(out.success, false);
    assert.equal(out.code, "E_REFUSED");
    assert.equal(out.error, "finish:SAFETY");
    assert.ok(!fs.existsSync(out2), "refused call must NOT write output");

    const rows2 = readHistoryFile(tmp);
    assert.equal(rows2.length, 2,
      "two history rows — refusals still append a row");
    assert.equal(rows2[1].refusalReason, "finish:SAFETY");
    assert.equal(rows2[1].parentId, firstId,
      "refused continuation still records parentId");
    // Invocation 1's file is still untouched.
    assert.deepEqual(fs.readFileSync(out1), TINY_PNG_BYTES,
      "prior output must remain intact");
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 10. --history-continue + --dry-run performs ZERO HTTP. The mock server
// sees no requests. Stdout JSON is a dry-run preview with the 3-turn shape.
test("dry-run continuation: zero HTTP traffic; stdout is a 3-turn dryRun preview", async () => {
  const mock = await makeMock([
    // Should NEVER fire — dry-run short-circuits before fetchWithRetry.
    (req, res) => respondJson(res, 500,
      { error: { message: "mock must not receive a request in dry-run" } }),
  ]);
  const tmp = mkTmp();
  try {
    // Pre-seed a continuable history row + its output file. Without these
    // the continuation fails validation (E_CONTINUE_UNKNOWN_ID).
    const priorOutput = path.join(tmp, "cat.png");
    fs.copyFileSync(path.resolve(__dirname, "fixtures", "tiny-1x1.png"),
      priorOutput);
    const historyRow = {
      id: "cat-dryrun",
      timestamp: "2026-04-17T12:00:00.000Z",
      prompt: "cat",
      output: priorOutput,
      params: {
        model: "gemini-3.1-flash-image-preview",
        aspectRatio: "1:1",
        imageSize: "1K",
        thinkingLevel: null,
        seed: null,
        temperature: null,
        styles: [],
      },
      parentId: null,
      bytes: 67,
      outputFormat: "png",
      outputExtension: "png",
      refusalReason: null,
      thoughtSignature: "sig-dry",
    };
    fs.writeFileSync(path.join(tmp, ".nanogen-history.jsonl"),
      JSON.stringify(historyRow) + "\n");

    const out2 = path.join(tmp, "hat.png");
    const r = await runCLI(
      ["--history-continue", "cat-dryrun",
       "--prompt", "add a hat",
       "--output", out2,
       "--dry-run"],
      {
        NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}`,
        NANOGEN_MAX_RETRIES: "0",
      },
      tmp
    );
    assert.equal(r.status, 0,
      `dry-run must exit 0; stderr=${r.stderr}; stdout=${r.stdout}`);
    assert.ok(r.stdout.startsWith('{"dryRun":true,'),
      `stdout must start with the dryRun preview prefix; got: ${r.stdout.slice(0, 120)}`);

    const preview = JSON.parse(r.stdout);
    assert.equal(preview.dryRun, true);
    assert.ok(preview.body && Array.isArray(preview.body.contents),
      "dry-run preview must include body.contents");
    assert.equal(preview.body.contents.length, 3,
      "continuation preview must have 3 turns");
    assert.equal(preview.body.contents[0].role, "user");
    assert.equal(preview.body.contents[1].role, "model");
    assert.equal(preview.body.contents[2].role, "user");
    // Sig must be present byte-for-byte on the model turn even in dry-run.
    assert.equal(
      preview.body.contents[1].parts[1].thoughtSignature,
      "sig-dry",
      "dry-run preview must carry thoughtSignature on contents[1].parts[1]"
    );

    // No output file on disk (dry-run does not write).
    assert.ok(!fs.existsSync(out2), "dry-run must not write output file");
    // Mock server received ZERO requests — the crux of the dry-run contract.
    assert.equal(mock.attempts, 0,
      `mock must see ZERO HTTP traffic during dry-run; got ${mock.attempts}`);
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

runAll();
