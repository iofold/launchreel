#!/usr/bin/env bun
/**
 * send-email.ts — LaunchReel transactional email via Resend (dependency-free).
 *
 * Outbound customer email for LaunchReel. Uses Resend's REST API directly; no
 * SDK, no npm install. Templates are inline (HTML + plain-text fallback) so this
 * file is the whole channel.
 *
 * Why Resend (not Cloudflare native sending): the verified sending domain
 * `updates.iofold.com` sends to ANY inbox reliably. Cloudflare's Workers
 * `send_email` binding only reaches *verified destination addresses*, and the
 * broad Cloudflare Email Service is private beta — neither can email arbitrary
 * customers today. See ../SKILL.md.
 *
 * Usage:
 *   bun run send-email.ts \
 *     --to yash@hypermodel.ai \
 *     --template order_confirmation \
 *     --data '{"productName":"Acme","tier":"trailer","jobId":"abc","dashboardUrl":"https://launchreel.app/j/abc"}'
 *
 *   bun run send-email.ts --to a@b.com --template delivered \
 *     --data '{"productName":"Acme","videoUrl":"https://.../v.mp4","dashboardUrl":"https://..."}'
 *
 * Flags:
 *   --to           recipient email (required)
 *   --template     order_confirmation | delivered (required)
 *   --data         JSON string of template fields (required)
 *   --subject      override the template's default subject (optional)
 *   --from         override the From header (optional; default below)
 *   --reply-to     override Reply-To (optional; default below)
 *   --dry-run      render + print the payload, do NOT call Resend
 *
 * Env:
 *   RESEND_API_KEY       required unless --dry-run
 *   LAUNCHREEL_FROM      default From (default: "LaunchReel <reel@updates.iofold.com>")
 *   LAUNCHREEL_REPLY_TO  default Reply-To (default: "reel@ctxmill.com" — the
 *                        Cloudflare inbound address, so replies re-enter the pipeline)
 *
 * Prints a JSON line to stdout: {"ok":true,"id":"<resend-message-id>","to":...}
 * Exit code is non-zero on failure.
 */

// ---- config ---------------------------------------------------------------

// updates.iofold.com is the Resend-verified sending domain (sending enabled).
// Any local-part on a verified domain is allowed, so `reel@` is fine.
const DEFAULT_FROM = process.env.LAUNCHREEL_FROM || "LaunchReel <reel@updates.iofold.com>";
// reel@ctxmill.com is the Cloudflare Email Routing inbound address (worker-backed).
// Setting it as Reply-To means a customer hitting "reply" flows back into intake.
const DEFAULT_REPLY_TO = process.env.LAUNCHREEL_REPLY_TO || "reel@ctxmill.com";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// ---- pop branding ---------------------------------------------------------

const BRAND = {
  ink: "#160f1f",
  bg: "#fff8fb",
  card: "#ffffff",
  border: "#f3d9e8",
  grad1: "#ff2d78", // hot pink
  grad2: "#ff7a1a", // orange
  accent: "#7b2ff7", // electric purple
  muted: "#6b6472",
};

const TIER_LABEL: Record<string, string> = {
  teaser: "Free Teaser",
  trailer: "Launch Trailer",
  pack: "Content Pack",
};

type Data = Record<string, any>;

// A shell that renders acceptably across Gmail/Apple Mail/Outlook: table layout,
// inline styles, no external assets. The wordmark is CSS text (no image deps).
function shell(previewText: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 6px 18px;">
        <span style="font:800 22px/1 'Trebuchet MS',Verdana,sans-serif;letter-spacing:-0.5px;
          background:linear-gradient(90deg,${BRAND.grad1},${BRAND.grad2});-webkit-background-clip:text;
          background-clip:text;color:${BRAND.grad1};">LaunchReel</span>
        <span style="font:600 12px/1 Verdana,sans-serif;color:${BRAND.muted};"> &nbsp;· AI launch trailers</span>
      </td></tr>
      <tr><td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:18px;
        padding:30px 30px 26px;box-shadow:0 8px 30px rgba(255,45,120,0.07);">
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:18px 8px 0;font:400 12px/1.6 Verdana,sans-serif;color:${BRAND.muted};">
        You're getting this because you started a trailer at LaunchReel.
        Reply to this email and a human will pick it up.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;">
    <tr><td style="border-radius:999px;background:linear-gradient(90deg,${BRAND.grad1},${BRAND.grad2});">
      <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font:700 15px/1 'Trebuchet MS',Verdana,sans-serif;
        color:#fff;text-decoration:none;border-radius:999px;">${esc(label)}</a>
    </td></tr></table>`;
}

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

// ---- templates ------------------------------------------------------------

type Rendered = { subject: string; html: string; text: string };

function orderConfirmation(d: Data): Rendered {
  const product = d.productName || "your launch";
  const tier = TIER_LABEL[d.tier] || "Launch Trailer";
  const dash = d.dashboardUrl || d.statusUrl || "";
  const paid = d.tier && d.tier !== "teaser";
  const subject = `🎬 Your ${product} trailer is in production`;

  const body = `
    <h1 style="margin:0 0 8px;font:800 24px/1.25 'Trebuchet MS',Verdana,sans-serif;color:${BRAND.ink};">
      We're rolling on your trailer.</h1>
    <p style="margin:0 0 14px;font:400 15px/1.7 Verdana,sans-serif;color:${BRAND.ink};">
      Nice — <b>${esc(product)}</b> just entered the LaunchReel pipeline as a
      <b style="color:${BRAND.accent};">${esc(tier)}</b>. Our agent org is already
      scraping your site, writing the storyboard, cutting voiceover, and rendering
      the motion graphics. No work needed from you.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
      style="margin:6px 0 4px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;">
      <tr><td style="padding:14px 16px;font:400 13px/1.5 Verdana,sans-serif;color:${BRAND.muted};">
        <b style="color:${BRAND.ink};">What happens next</b><br>
        Research → Storyboard → Voiceover → Render → a quick human check, then your
        trailer lands in your inbox. Usually minutes, not days.
      </td></tr>
    </table>
    ${dash ? button(dash, "Watch it build live →") : ""}
    ${!paid ? `<p style="margin:16px 0 0;font:400 13px/1.6 Verdana,sans-serif;color:${BRAND.muted};">
      This is the free watermarked teaser. Want the clean, full-length cut? You'll
      get an upgrade link with your delivery.</p>` : ""}
    ${d.jobId ? `<p style="margin:14px 0 0;font:400 11px/1.5 Verdana,sans-serif;color:${BRAND.muted};">
      Order ref: ${esc(d.jobId)}</p>` : ""}
  `;

  const text = [
    `We're rolling on your trailer.`,
    ``,
    `${product} just entered the LaunchReel pipeline as a ${tier}.`,
    `Our agent org is scraping your site, writing the storyboard, cutting`,
    `voiceover, and rendering the motion graphics — no work needed from you.`,
    ``,
    `What happens next: Research -> Storyboard -> Voiceover -> Render -> a quick`,
    `human check, then your trailer lands in your inbox. Usually minutes.`,
    dash ? `\nWatch it build live: ${dash}` : "",
    !paid ? `\nThis is the free watermarked teaser. A clean full-length upgrade link ships with delivery.` : "",
    d.jobId ? `\nOrder ref: ${d.jobId}` : "",
    ``,
    `Reply to this email and a human will pick it up. — LaunchReel`,
  ].filter((l) => l !== null && l !== undefined).join("\n");

  return { subject, html: shell(`Your ${product} trailer is in production`, body), text };
}

function delivered(d: Data): Rendered {
  const product = d.productName || "your launch";
  const video = d.videoUrl || "";
  const dash = d.dashboardUrl || d.statusUrl || "";
  const poster = d.posterUrl || "";
  const paid = d.tier && d.tier !== "teaser";
  const subject = `🍿 Your ${product} launch trailer is ready`;

  const posterBlock = poster
    ? `<a href="${esc(video || dash)}" style="text-decoration:none;">
         <img src="${esc(poster)}" alt="${esc(product)} trailer" width="500"
           style="width:100%;max-width:500px;border-radius:12px;border:1px solid ${BRAND.border};display:block;margin:4px 0 2px;"></a>`
    : "";

  const body = `
    <h1 style="margin:0 0 8px;font:800 24px/1.25 'Trebuchet MS',Verdana,sans-serif;color:${BRAND.ink};">
      It's cut. 🎬</h1>
    <p style="margin:0 0 14px;font:400 15px/1.7 Verdana,sans-serif;color:${BRAND.ink};">
      Your <b>${esc(product)}</b> launch trailer is rendered and ready to ship.
      Press play, then drop it on your launch tweet, your site hero, or Product Hunt.</p>
    ${posterBlock}
    ${video ? button(video, "▶ Watch your trailer") : (dash ? button(dash, "▶ Open your trailer") : "")}
    ${!paid ? `<p style="margin:18px 0 0;font:400 13px/1.6 Verdana,sans-serif;color:${BRAND.muted};">
      This teaser carries a small LaunchReel watermark. Reply <b>"upgrade"</b> and we'll
      send the clean full-length cut + the Content Pack (square + vertical + stills).</p>`
      : `<p style="margin:18px 0 0;font:400 13px/1.6 Verdana,sans-serif;color:${BRAND.muted};">
      Want a tweak? You get one free revision — just reply and tell us what to change.</p>`}
  `;

  const text = [
    `It's cut.`,
    ``,
    `Your ${product} launch trailer is rendered and ready to ship.`,
    video ? `\nWatch it: ${video}` : (dash ? `\nOpen it: ${dash}` : ""),
    !paid
      ? `\nThis teaser carries a small LaunchReel watermark. Reply "upgrade" for the clean full-length cut + Content Pack.`
      : `\nWant a tweak? You get one free revision — reply and tell us what to change.`,
    ``,
    `— LaunchReel`,
  ].filter(Boolean).join("\n");

  return { subject, html: shell(`Your ${product} trailer is ready`, body), text };
}

const TEMPLATES: Record<string, (d: Data) => Rendered> = {
  order_confirmation: orderConfirmation,
  delivered,
};

// ---- arg parsing ----------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const to = args.to as string;
  const template = args.template as string;
  const dataRaw = (args.data as string) || "{}";
  const dryRun = !!args["dry-run"];

  if (!to) fail("--to is required");
  if (!template || !TEMPLATES[template]) fail(`--template must be one of: ${Object.keys(TEMPLATES).join(", ")}`);

  let data: Data;
  try { data = JSON.parse(dataRaw); }
  catch (e) { return fail(`--data is not valid JSON: ${(e as Error).message}`); }

  const rendered = TEMPLATES[template](data);
  const subject = (args.subject as string) || rendered.subject;
  const from = (args.from as string) || DEFAULT_FROM;
  const replyTo = (args["reply-to"] as string) || DEFAULT_REPLY_TO;

  const payload = {
    from,
    to: [to],
    subject,
    html: rendered.html,
    text: rendered.text,
    reply_to: replyTo,
    tags: [{ name: "app", value: "launchreel" }, { name: "template", value: template }],
  };

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, from, to, subject, replyTo, htmlBytes: rendered.html.length }, null, 2));
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return fail("RESEND_API_KEY is not set (source your Resend env, or use --dry-run)");

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const bodyText = await res.text();
  if (!res.ok) return fail(`Resend ${res.status}: ${bodyText}`);

  let id = "";
  try { id = JSON.parse(bodyText).id ?? ""; } catch {}
  console.log(JSON.stringify({ ok: true, id, to, template, subject }));
}

function fail(msg: string): never {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(1);
}

main().catch((e) => fail(e?.message || String(e)));
