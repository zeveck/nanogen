"use strict";
// Phase 3: parseResponse() tests. Covers all 9 fixture responses plus
// synthetic edge cases. Asserts all 8 refusal paths at least once:
//
//   prompt-blocked:SAFETY         (prompt-feedback block)
//   finish:SAFETY                 (candidate finishReason SAFETY)
//   finish:PROHIBITED_CONTENT
//   finish:IMAGE_SAFETY
//   finish:RECITATION
//   soft-refusal:no-image         (STOP but only text parts)
//   no-candidates                 (candidates missing / empty)
//   bad-image-bytes               (base64 decoded but magic-check failed)

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const gen = require("../generate.cjs");

const FIX = path.resolve(__dirname, "fixtures");
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIX, name), "utf8"));
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const refusalPathsSeen = new Set();
function markRefusal(reason) { refusalPathsSeen.add(reason); }

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
  // Assert all 8 refusal paths observed across the test run.
  const required = [
    "prompt-blocked:SAFETY",
    "finish:SAFETY",
    "finish:PROHIBITED_CONTENT",
    "finish:IMAGE_SAFETY",
    "finish:RECITATION",
    "soft-refusal:no-image",
    "no-candidates",
    "bad-image-bytes",
  ];
  const missing = required.filter(r => !refusalPathsSeen.has(r));
  if (missing.length > 0) {
    failed++;
    console.log("FAIL refusal path coverage (missing: " + missing.join(", ") + ")");
  } else {
    passed++;
    console.log("ok  all 8 refusal paths asserted");
  }
  console.log(`\n${passed}/${tests.length + 1} passed${failed ? `, ${failed} failed` : ""}`);
  if (failed) process.exit(1);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// 1. Successful response: image decoded, finishReason=STOP, no refusal.
test("response-success.json: image extracted, finishReason=STOP, no refusal", () => {
  const r = gen.parseResponse(loadFixture("response-success.json"));
  assert.ok(Buffer.isBuffer(r.image), "image should be a Buffer");
  assert.equal(r.image.length, 67, "decoded image should be 67 bytes (tiny-1x1.png)");
  // PNG magic check
  assert.equal(r.image[0], 0x89);
  assert.equal(r.image[1], 0x50);
  assert.equal(r.image[2], 0x4E);
  assert.equal(r.image[3], 0x47);
  assert.equal(r.finishReason, "STOP");
  assert.equal(r.refusalReason, null);
  assert.equal(r.promptBlockReason, null);
  assert.equal(r.responseMimeType, "image/png");
  assert.equal(r.thoughtSignature, null);
  assert.deepStrictEqual(r.unknownParts, []);
});

// 2. finish:SAFETY
test("response-finish-safety.json: refusalReason = finish:SAFETY", () => {
  const r = gen.parseResponse(loadFixture("response-finish-safety.json"));
  assert.equal(r.image, null);
  assert.equal(r.finishReason, "SAFETY");
  assert.equal(r.refusalReason, "finish:SAFETY");
  markRefusal("finish:SAFETY");
});

// 3. finish:PROHIBITED_CONTENT
test("response-finish-prohibited.json: refusalReason = finish:PROHIBITED_CONTENT", () => {
  const r = gen.parseResponse(loadFixture("response-finish-prohibited.json"));
  assert.equal(r.image, null);
  assert.equal(r.finishReason, "PROHIBITED_CONTENT");
  assert.equal(r.refusalReason, "finish:PROHIBITED_CONTENT");
  markRefusal("finish:PROHIBITED_CONTENT");
});

// 4. finish:IMAGE_SAFETY
test("response-finish-image-safety.json: refusalReason = finish:IMAGE_SAFETY", () => {
  const r = gen.parseResponse(loadFixture("response-finish-image-safety.json"));
  assert.equal(r.image, null);
  assert.equal(r.finishReason, "IMAGE_SAFETY");
  assert.equal(r.refusalReason, "finish:IMAGE_SAFETY");
  markRefusal("finish:IMAGE_SAFETY");
});

// 5. finish:RECITATION
test("response-finish-recitation.json: refusalReason = finish:RECITATION", () => {
  const r = gen.parseResponse(loadFixture("response-finish-recitation.json"));
  assert.equal(r.image, null);
  assert.equal(r.finishReason, "RECITATION");
  assert.equal(r.refusalReason, "finish:RECITATION");
  markRefusal("finish:RECITATION");
});

// 6. prompt-blocked:SAFETY (no candidates → parse still returns,
// promptBlockReason set, refusal = prompt-blocked:SAFETY).
test("response-prompt-blocked.json: refusalReason = prompt-blocked:SAFETY", () => {
  const r = gen.parseResponse(loadFixture("response-prompt-blocked.json"));
  assert.equal(r.promptBlockReason, "SAFETY");
  assert.equal(r.refusalReason, "prompt-blocked:SAFETY");
  // This fixture has no candidates array at all → finishReason should stay null.
  assert.equal(r.finishReason, null);
  assert.equal(r.image, null);
  markRefusal("prompt-blocked:SAFETY");
});

// 7. soft-refusal:no-image
test("response-soft-refusal-text-only.json: refusalReason = soft-refusal:no-image", () => {
  const r = gen.parseResponse(loadFixture("response-soft-refusal-text-only.json"));
  assert.equal(r.image, null);
  assert.equal(r.finishReason, "STOP");
  assert.equal(r.refusalReason, "soft-refusal:no-image");
  assert.ok(r.text && r.text.length > 0, "text should be present");
  markRefusal("soft-refusal:no-image");
});

// 8. Unknown part shape: parser collects unknown keys, does not throw,
// image is still extracted successfully.
test("response-unknown-part-shape.json: unknownParts collected, image extracted", () => {
  const r = gen.parseResponse(loadFixture("response-unknown-part-shape.json"));
  assert.ok(Buffer.isBuffer(r.image));
  assert.equal(r.refusalReason, null);
  // Both unknown keys should have been accumulated.
  assert.ok(r.unknownParts.includes("someNewField"),
    `unknownParts should include 'someNewField'; got ${JSON.stringify(r.unknownParts)}`);
  assert.ok(r.unknownParts.includes("anotherUnknown"),
    `unknownParts should include 'anotherUnknown'; got ${JSON.stringify(r.unknownParts)}`);
});

// 9. bad-image-bytes
test("response-bad-image-bytes.json: refusalReason = bad-image-bytes", () => {
  const r = gen.parseResponse(loadFixture("response-bad-image-bytes.json"));
  assert.equal(r.image, null);
  assert.equal(r.refusalReason, "bad-image-bytes");
  markRefusal("bad-image-bytes");
});

// 10. thoughtSignature extracted
test("response-with-thought-sig.json: thoughtSignature = 'sig-abc'", () => {
  const r = gen.parseResponse(loadFixture("response-with-thought-sig.json"));
  assert.equal(r.thoughtSignature, "sig-abc");
  assert.ok(Buffer.isBuffer(r.image), "image should still be extracted");
  assert.equal(r.refusalReason, null);
});

// 11. Empty candidates array → no-candidates
test("empty candidates array: refusalReason = no-candidates", () => {
  const r = gen.parseResponse({ candidates: [] });
  assert.equal(r.refusalReason, "no-candidates");
  assert.equal(r.image, null);
  markRefusal("no-candidates");
});

// 12. candidates missing → no-candidates
test("missing candidates key: refusalReason = no-candidates", () => {
  const r = gen.parseResponse({});
  assert.equal(r.refusalReason, "no-candidates");
});

// 13. candidates[0].content.parts missing entirely → soft-refusal:no-image
test("candidates[0].content has no parts key: refusalReason = soft-refusal:no-image", () => {
  const r = gen.parseResponse({
    candidates: [ { content: {}, finishReason: "STOP" } ],
  });
  assert.equal(r.image, null);
  assert.equal(r.finishReason, "STOP");
  assert.equal(r.refusalReason, "soft-refusal:no-image");
});

// 14. parts is null → soft-refusal
test("candidates[0].content.parts is null: refusalReason = soft-refusal:no-image", () => {
  const r = gen.parseResponse({
    candidates: [ { content: { parts: null }, finishReason: "STOP" } ],
  });
  assert.equal(r.image, null);
  assert.equal(r.refusalReason, "soft-refusal:no-image");
});

// 15. Synthetic unknown-part-shape edge: a single weirdNewField,
// no other parts → unknownParts captured, soft refusal.
test("synthetic { weirdNewField: 42 } part: unknownParts captured, does not throw", () => {
  const r = gen.parseResponse({
    candidates: [ {
      content: { parts: [ { weirdNewField: 42 } ] },
      finishReason: "STOP",
    } ],
  });
  assert.deepStrictEqual(r.unknownParts, ["weirdNewField"]);
  assert.equal(r.image, null);
  assert.equal(r.refusalReason, "soft-refusal:no-image");
});

// 16. Synthetic garbage base64 → bad-image-bytes
test("synthetic inlineData.data = 'not-base64!@#$%' → refusalReason = bad-image-bytes", () => {
  const r = gen.parseResponse({
    candidates: [ {
      content: { parts: [ {
        inlineData: { mimeType: "image/png", data: "not-base64!@#$%" },
      } ] },
      finishReason: "STOP",
    } ],
  });
  assert.equal(r.image, null);
  assert.equal(r.refusalReason, "bad-image-bytes");
});

// 17. Prompt-blocked with a candidate that also carries a thoughtSignature
// → refusalReason stays prompt-blocked:SAFETY (not overwritten), but
// thoughtSignature still captured (step 2 does NOT early-return).
test("prompt-blocked response + candidate with thoughtSignature: refusal sticks, sig captured", () => {
  const r = gen.parseResponse({
    promptFeedback: { blockReason: "SAFETY" },
    candidates: [ {
      content: { parts: [ { thoughtSignature: "sig-xyz" } ] },
      finishReason: "STOP",
    } ],
  });
  assert.equal(r.refusalReason, "prompt-blocked:SAFETY");
  assert.equal(r.promptBlockReason, "SAFETY");
  assert.equal(r.thoughtSignature, "sig-xyz");
});

// 18. Text accumulation across multiple parts (\n separator).
test("multiple text parts accumulate with \\n separator", () => {
  const r = gen.parseResponse({
    candidates: [ {
      content: { parts: [
        { text: "hello" },
        { text: "world" },
      ] },
      finishReason: "STOP",
    } ],
  });
  assert.equal(r.text, "hello\nworld");
});

// 19. Non-object input → no-candidates defensively.
test("parseResponse(null) returns no-candidates defensively", () => {
  const r = gen.parseResponse(null);
  assert.equal(r.refusalReason, "no-candidates");
});

// 20. JPEG-magic inlineData payload is accepted.
test("inlineData with JPEG magic bytes is accepted as a valid image", () => {
  // Minimal JPEG SOI (FF D8 FF) + some padding bytes.
  const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
  const b64 = buf.toString("base64");
  const r = gen.parseResponse({
    candidates: [ {
      content: { parts: [ {
        inlineData: { mimeType: "image/jpeg", data: b64 },
      } ] },
      finishReason: "STOP",
    } ],
  });
  assert.ok(Buffer.isBuffer(r.image));
  assert.equal(r.responseMimeType, "image/jpeg");
  assert.equal(r.refusalReason, null);
});

runAll();
