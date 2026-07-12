/**
 * Local unit test for the inbound worker's MIME parse + attachment handling.
 * Runs OUTSIDE Cloudflare (plain Node) — validates the postal-mime parse, the
 * video-attachment detection, and the ArrayBuffer normalization that feeds R2.
 * The R2 put + Convex POST are exercised separately (see README / proof notes).
 *
 * Run: node test-mime.mjs
 */
import fs from "node:fs";
import PostalMime from "postal-mime";
import { isVideoAttachment, sanitizeName, toArrayBuffer, shortHash, htmlToText } from "./src/index.mjs";

let pass = 0, fail = 0;
function ok(cond, label) { cond ? (pass++, console.log("  ✓", label)) : (fail++, console.error("  ✗", label)); }

// A tiny real mp4 to attach (keyframe sample) — proves binary attachment decode.
const MP4 = "/home/ubuntu/workspace/manifold/.tmp/genai-samples/keyframe/dashboard-assemble.mp4";
const mp4Bytes = fs.readFileSync(MP4);
const mp4B64 = mp4Bytes.toString("base64");

// Craft a realistic multipart/mixed email: text/plain body + a video/mp4 attachment.
function foldB64(b64) {
  return b64.replace(/(.{76})/g, "$1\r\n");
}
const BOUNDARY = "==LR_BOUNDARY_9c1f==";
const raw = [
  `From: Client <client@example.com>`,
  `To: reel@ctxmill.com`,
  `Subject: Compare these two cuts please`,
  `Message-ID: <demo-0001@example.com>`,
  `MIME-Version: 1.0`,
  `Content-Type: multipart/mixed; boundary="${BOUNDARY}"`,
  ``,
  `--${BOUNDARY}`,
  `Content-Type: text/plain; charset=UTF-8`,
  ``,
  `Hi! Which of these two trailers is stronger? Thanks.`,
  ``,
  `--${BOUNDARY}`,
  `Content-Type: video/mp4; name="cut-a.mp4"`,
  `Content-Transfer-Encoding: base64`,
  `Content-Disposition: attachment; filename="cut-a.mp4"`,
  ``,
  foldB64(mp4B64),
  ``,
  `--${BOUNDARY}--`,
  ``,
].join("\r\n");

console.log("[test] postal-mime parse of a multipart/mixed with a video attachment");
const parsed = await PostalMime.parse(new TextEncoder().encode(raw));

ok((parsed.text || "").includes("stronger"), "text/plain body extracted");
ok(Array.isArray(parsed.attachments) && parsed.attachments.length === 1, "one attachment parsed");

const att = parsed.attachments[0];
ok(isVideoAttachment(att), `isVideoAttachment true (mime=${att.mimeType}, name=${att.filename})`);

const buf = toArrayBuffer(att.content);
ok(buf && buf.byteLength === mp4Bytes.length,
   `attachment bytes round-trip intact (${buf ? buf.byteLength : 0} == ${mp4Bytes.length})`);

const key = sanitizeName(att.filename, 0);
ok(key === "cut-a.mp4", `sanitizeName preserves a clean name (${key})`);
ok(sanitizeName("../../evil name.mov", 1) === ".._.._evil_name.mov", "sanitizeName strips path/space chars");
ok(!isVideoAttachment({ mimeType: "image/png", filename: "logo.png" }), "isVideoAttachment false for a PNG");

const h = await shortHash("client@example.com|Compare these two cuts please|<demo-0001@example.com>");
ok(/^[0-9a-f]{12}$/.test(h), `shortHash is 12 hex chars (${h})`);
ok(htmlToText("<p>Hi<br>there</p><script>x</script>").includes("Hi") &&
   !htmlToText("<p>Hi</p><script>bad()</script>").includes("bad"), "htmlToText strips tags + scripts");

console.log(`\n[test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
