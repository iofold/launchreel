/**
 * LaunchReel inbound Email Worker.
 *
 * Cloudflare Email Routing delivers mail sent to reel@ctxmill.com here. We parse
 * the sender, subject, a plain-text body, and any VIDEO attachments, then POST
 * { from, subject, text, attachmentUrls } to Convex (/api/email/inbound), which
 * upserts the sender (source "email") and logs an email_inbound event for the
 * gateway/agent to triage as a new order, a reply, or a two-video comparison.
 *
 * Parsing uses postal-mime (bundled) for robust multipart + attachment handling.
 * Video attachments (video/* or *.mp4/webm/mov/m4v) are streamed into the public
 * launchreel-renders R2 bucket under inbound/<hash>/, and their public r2.dev URLs
 * are sent to Convex as attachmentUrls[] so the compare agent can score them.
 *
 * Backward-compatible + fail-safe: if postal-mime can't parse, we fall back to the
 * old dependency-free text extraction; if the R2 binding is missing, attachments
 * are skipped. The core { from, subject, text } POST always fires so the existing
 * intake/revision flow never regresses.
 *
 * Env (wrangler vars/secrets/bindings):
 *   CONVEX_SITE_URL     https://<deployment>.convex.site      (var)
 *   R2_PUBLIC_BASE      https://pub-....r2.dev                (var)
 *   EMAIL_WEBHOOK_KEY   shared secret matching the Convex env (secret)
 *   RENDERS             R2 bucket binding -> launchreel-renders (binding)
 *   FORWARD_TO          optional: also forward raw mail to a verified address (var)
 */
import PostalMime from "postal-mime";

const MAX_RAW = 25 * 1024 * 1024; // 25 MB: enough for typical video attachments
const MAX_TEXT = 5000;
const MAX_ATTACHMENTS = 4; // only ever need 2 for a compare; cap to bound cost
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

export default {
  async email(message, env, ctx) {
    const from = (message.from || "").trim().toLowerCase();
    const subject = message.headers.get("subject") || "";

    let text = "";
    let attachmentUrls = [];

    let rawBytes = null;
    try {
      rawBytes = await streamToBytes(message.raw, MAX_RAW);
    } catch (e) {
      console.error("raw read failed", e && e.message);
    }

    // Primary path: postal-mime (robust multipart + attachment decode).
    let parsed = null;
    if (rawBytes) {
      try {
        parsed = await PostalMime.parse(rawBytes);
      } catch (e) {
        console.error("postal-mime parse failed; falling back", e && e.message);
      }
    }

    if (parsed) {
      text = (parsed.text || htmlToText(parsed.html) || "").slice(0, MAX_TEXT);
      const videos = (parsed.attachments || []).filter(isVideoAttachment).slice(0, MAX_ATTACHMENTS);
      if (videos.length) {
        if (env.RENDERS && env.R2_PUBLIC_BASE) {
          const hash = await shortHash(`${from}|${subject}|${parsed.messageId || Date.now()}`);
          for (let i = 0; i < videos.length; i++) {
            try {
              const url = await uploadAttachment(env, hash, i, videos[i]);
              if (url) attachmentUrls.push(url);
            } catch (e) {
              console.error("attachment upload failed", i, e && e.message);
            }
          }
        } else {
          console.error("video attachments present but no RENDERS/R2_PUBLIC_BASE — skipping upload");
        }
      }
    } else if (rawBytes) {
      // Fallback: dependency-free best-effort text extraction (attachments skipped).
      try {
        text = extractPlainText(new TextDecoder("utf-8").decode(rawBytes)).slice(0, MAX_TEXT);
      } catch (e) {
        text = `(body parse failed: ${e && e.message})`;
      }
    }

    const base = (env.CONVEX_SITE_URL || "").replace(/\/+$/, "");
    if (base && env.EMAIL_WEBHOOK_KEY) {
      try {
        const res = await fetch(base + "/api/email/inbound", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Email-Key": env.EMAIL_WEBHOOK_KEY },
          body: JSON.stringify({ from, subject, text, attachmentUrls }),
        });
        if (!res.ok) console.error("convex inbound non-2xx", res.status, await res.text());
      } catch (e) {
        console.error("convex inbound POST failed", e && e.message);
      }
    } else {
      console.error("missing CONVEX_SITE_URL or EMAIL_WEBHOOK_KEY — not posting");
    }

    if (env.FORWARD_TO) {
      try {
        await message.forward(env.FORWARD_TO);
      } catch (e) {
        console.error("forward failed", e && e.message);
      }
    }
    // Accept everything and log it (no setReject).
  },
};

// ---- attachments ----------------------------------------------------------

function isVideoAttachment(a) {
  if (!a) return false;
  const mime = (a.mimeType || a.contentType || "").toLowerCase();
  const name = a.filename || "";
  // Ignore inline images/logos; we only lift real video files.
  if (mime.startsWith("video/")) return true;
  return VIDEO_EXT.test(name);
}

function sanitizeName(name, i) {
  const cleaned = String(name || "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_");
  if (cleaned && VIDEO_EXT.test(cleaned)) return cleaned;
  return `video-${i}${cleaned && cleaned.includes(".") ? "" : ".mp4"}${cleaned ? "-" + cleaned : ""}`.slice(0, 80);
}

async function uploadAttachment(env, hash, i, a) {
  const key = `inbound/${hash}/${sanitizeName(a.filename, i)}`;
  const body = toArrayBuffer(a.content);
  if (!body || body.byteLength === 0) {
    console.error("empty attachment content", key);
    return null;
  }
  await env.RENDERS.put(key, body, {
    httpMetadata: { contentType: a.mimeType || a.contentType || "video/mp4" },
  });
  const baseUrl = env.R2_PUBLIC_BASE.replace(/\/+$/, "");
  return `${baseUrl}/${key}`;
}

// postal-mime gives attachment.content as ArrayBuffer (or base64 string for some
// encodings) — normalize to an ArrayBuffer for R2.put.
function toArrayBuffer(content) {
  if (!content) return null;
  if (content instanceof ArrayBuffer) return content;
  if (ArrayBuffer.isView(content)) return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
  if (typeof content === "string") {
    // base64 string
    const bin = atob(content.replace(/[^A-Za-z0-9+/=]/g, ""));
    const u8 = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j);
    return u8.buffer;
  }
  return null;
}

async function shortHash(s) {
  try {
    const data = new TextEncoder().encode(s);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < 6; i++) hex += bytes[i].toString(16).padStart(2, "0");
    return hex; // 12 hex chars
  } catch {
    return Date.now().toString(36);
  }
}

function htmlToText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---- raw stream -----------------------------------------------------------

async function streamToBytes(stream, maxBytes) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total >= maxBytes) break;
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return buf;
}

// ---- dependency-free fallback text extraction (unchanged) ------------------

function extractPlainText(raw) {
  const norm = raw.replace(/\r\n/g, "\n");
  const headerEnd = norm.indexOf("\n\n");
  const topHeaders = (headerEnd >= 0 ? norm.slice(0, headerEnd) : norm).toLowerCase();
  const boundaryMatch = topHeaders.match(/boundary="?([^";\n]+)"?/);

  if (boundaryMatch) {
    const boundary = boundaryMatch[1].trim();
    const parts = norm.split("--" + boundary);
    for (const part of parts) {
      const pEnd = part.indexOf("\n\n");
      if (pEnd < 0) continue;
      const ph = part.slice(0, pEnd).toLowerCase();
      if (ph.includes("text/plain")) {
        let body = part.slice(pEnd + 2);
        if (ph.includes("quoted-printable")) body = decodeQuotedPrintable(body);
        else if (ph.includes("base64")) body = decodeBase64(body);
        return cleanBody(body);
      }
    }
  }

  const body = headerEnd >= 0 ? norm.slice(headerEnd + 2) : norm;
  if (topHeaders.includes("quoted-printable")) return cleanBody(decodeQuotedPrintable(body));
  if (/content-transfer-encoding:\s*base64/.test(topHeaders)) return cleanBody(decodeBase64(body));
  return cleanBody(body);
}

function cleanBody(s) {
  return s.split(/\n--[-\w]+--?\s*$/)[0].replace(/\n{3,}/g, "\n\n").trim();
}

function decodeQuotedPrintable(s) {
  return s
    .replace(/=\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function decodeBase64(s) {
  try {
    const clean = s.replace(/[^A-Za-z0-9+/=]/g, "");
    return typeof atob === "function" ? atob(clean) : Buffer.from(clean, "base64").toString("utf-8");
  } catch {
    return s;
  }
}

// Named exports for local unit tests only — Cloudflare's runtime uses the default
// export's `email` handler and ignores these.
export {
  isVideoAttachment,
  sanitizeName,
  toArrayBuffer,
  shortHash,
  htmlToText,
  extractPlainText,
};
