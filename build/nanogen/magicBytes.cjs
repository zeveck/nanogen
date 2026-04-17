"use strict";
// Shared magic-byte helpers for nanogen.
//
// Used by both:
//   (a) INPUT validation — rule 19 (E_IMAGE_MIME_MISMATCH) in generate.cjs's
//       validateArgs, which verifies a user-supplied --image path's declared
//       extension matches its real bytes.
//   (b) OUTPUT validation — parseResponse() in generate.cjs, which rejects
//       inlineData.data payloads whose decoded base64 does not begin with
//       a recognized PNG/JPEG/WEBP signature.
//
// See plans/SUB_1_CLI_CORE.md Phase 3.

const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47];
const JPEG_MAGIC = [0xFF, 0xD8, 0xFF];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]; // bytes 0..3
const WEBP_TAG  = [0x57, 0x45, 0x42, 0x50]; // bytes 8..11

function startsWith(buf, magic, offset = 0) {
  if (!buf || buf.length < offset + magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buf[offset + i] !== magic[i]) return false;
  }
  return true;
}

// Detect the format of a buffer by leading magic bytes.
// Returns "png" | "jpeg" | "webp" | null.
function detectMagic(buf) {
  if (!buf) return null;
  if (startsWith(buf, PNG_MAGIC, 0)) return "png";
  if (startsWith(buf, JPEG_MAGIC, 0)) return "jpeg";
  if (startsWith(buf, WEBP_RIFF, 0) && startsWith(buf, WEBP_TAG, 8)) return "webp";
  return null;
}

// Does `buf` have magic bytes matching a given file extension?
// `ext` should be normalized to lowercase and include the dot (e.g. ".png").
function matchesExt(buf, ext) {
  const kind = detectMagic(buf);
  if (kind === null) return false;
  if (ext === ".png") return kind === "png";
  if (ext === ".jpg" || ext === ".jpeg") return kind === "jpeg";
  if (ext === ".webp") return kind === "webp";
  return false;
}

module.exports = {
  PNG_MAGIC,
  JPEG_MAGIC,
  WEBP_RIFF,
  WEBP_TAG,
  detectMagic,
  matchesExt,
};
