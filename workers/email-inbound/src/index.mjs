/**
 * LaunchReel inbound Email Worker.
 *
 * Cloudflare Email Routing delivers mail sent to reel@ctxmill.com here. We parse
 * the sender, subject, and a best-effort plain-text body, then POST it to Convex
 * (/api/email/inbound), which upserts the sender (source "email") and logs an
 * email_inbound event for the gateway/operator to triage as a new order or a
 * reply on an existing job.
 *
 * Dependency-free: no postal-mime. Subject comes straight from the headers
 * (reliable); the body is a heuristic extraction of the first text/plain part
 * (good enough to triage — swap in postal-mime later if you need rich parsing).
 *
 * Env (wrangler vars/secrets):
 *   CONVEX_SITE_URL     https://<deployment>.convex.site   (var)
 *   EMAIL_WEBHOOK_KEY   shared secret matching the Convex env (secret)
 *   FORWARD_TO          optional: also forward the raw mail to a verified
 *                       destination address (var); omit to skip forwarding.
 */

const MAX_RAW = 256 * 1024; // cap the raw read; trailers/quoted history get trimmed
const MAX_TEXT = 5000;

export default {
  async email(message, env, ctx) {
    const from = (message.from || "").trim().toLowerCase();
    const subject = message.headers.get("subject") || "";

    let text = "";
    try {
      const raw = await streamToString(message.raw, MAX_RAW);
      text = extractPlainText(raw).slice(0, MAX_TEXT);
    } catch (e) {
      text = `(body parse failed: ${e && e.message})`;
    }

    const base = (env.CONVEX_SITE_URL || "").replace(/\/+$/, "");
    if (base && env.EMAIL_WEBHOOK_KEY) {
      try {
        const res = await fetch(base + "/api/email/inbound", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Email-Key": env.EMAIL_WEBHOOK_KEY },
          body: JSON.stringify({ from, subject, text }),
        });
        if (!res.ok) console.error("convex inbound non-2xx", res.status, await res.text());
      } catch (e) {
        console.error("convex inbound POST failed", e && e.message);
      }
    } else {
      console.error("missing CONVEX_SITE_URL or EMAIL_WEBHOOK_KEY — not posting");
    }

    // Optional: also forward the original mail to a human inbox (must be a
    // verified Email Routing destination address). Left off unless FORWARD_TO set.
    if (env.FORWARD_TO) {
      try {
        await message.forward(env.FORWARD_TO);
      } catch (e) {
        console.error("forward failed", e && e.message);
      }
    }
    // Not calling message.setReject(...) — we accept everything and log it.
  },
};

async function streamToString(stream, maxBytes) {
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
  return new TextDecoder("utf-8").decode(buf);
}

// Best-effort text/plain extraction from a raw MIME string. Handles the common
// cases: a simple single-part message, or a multipart body where we grab the
// first text/plain part and decode quoted-printable / base64 if declared.
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
    // no text/plain part found — fall through to the raw body below
  }

  const body = headerEnd >= 0 ? norm.slice(headerEnd + 2) : norm;
  if (topHeaders.includes("quoted-printable")) return cleanBody(decodeQuotedPrintable(body));
  if (/content-transfer-encoding:\s*base64/.test(topHeaders)) return cleanBody(decodeBase64(body));
  return cleanBody(body);
}

function cleanBody(s) {
  // Drop trailing MIME boundary noise and collapse excessive blank lines.
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
