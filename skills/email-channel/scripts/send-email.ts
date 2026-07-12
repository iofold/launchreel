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

// Autonomous feedback loop: the customer asked for a tweak, the agent recut the
// trailer, and this ships the new cut with a one-line "what changed" summary.
function revisionReady(d: Data): Rendered {
  const product = d.productName || "your launch";
  const video = d.videoUrl || "";
  const dash = d.dashboardUrl || d.statusUrl || "";
  const poster = d.posterUrl || "";
  const changed = d.whatChanged || "We applied your notes and re-rendered the trailer.";
  const subject = `🎬 Your ${product} trailer — new cut is ready`;

  const posterBlock = poster
    ? `<a href="${esc(video || dash)}" style="text-decoration:none;">
         <img src="${esc(poster)}" alt="${esc(product)} trailer" width="500"
           style="width:100%;max-width:500px;border-radius:12px;border:1px solid ${BRAND.border};display:block;margin:4px 0 2px;"></a>`
    : "";

  const body = `
    <h1 style="margin:0 0 8px;font:800 24px/1.25 'Trebuchet MS',Verdana,sans-serif;color:${BRAND.ink};">
      Recut & ready. 🎬</h1>
    <p style="margin:0 0 14px;font:400 15px/1.7 Verdana,sans-serif;color:${BRAND.ink};">
      We heard you and reworked your <b>${esc(product)}</b> trailer.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
      style="margin:6px 0 4px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;">
      <tr><td style="padding:14px 16px;font:400 13px/1.6 Verdana,sans-serif;color:${BRAND.muted};">
        <b style="color:${BRAND.ink};">What changed</b><br>
        ${esc(changed)}
      </td></tr>
    </table>
    ${posterBlock}
    ${video ? button(video, "▶ Watch the new cut") : (dash ? button(dash, "▶ Open your trailer") : "")}
    <p style="margin:18px 0 0;font:400 13px/1.6 Verdana,sans-serif;color:${BRAND.muted};">
      That was your one free revision. Need another change? Just reply — a human
      director on our team will take it from here.</p>
  `;

  const text = [
    `Recut & ready.`,
    ``,
    `We heard you and reworked your ${product} trailer.`,
    ``,
    `What changed: ${changed}`,
    video ? `\nWatch the new cut: ${video}` : (dash ? `\nOpen it: ${dash}` : ""),
    ``,
    `That was your one free revision. Need another change? Reply and a human director will take it from here.`,
    ``,
    `— LaunchReel`,
  ].filter((l) => l !== null && l !== undefined).join("\n");

  return { subject, html: shell(`Your ${product} trailer — new cut`, body), text };
}

// Quality gate held the cut: the vision rig auto-failed BOTH the first render and
// the auto-fix re-render, so we escalate to a human director instead of shipping a
// visibly broken trailer. Honest, no fake ETA (see eval/rubric.md auto-fail rule).
function qualityHold(d: Data): Rendered {
  const product = d.productName || "your launch";
  const dash = d.dashboardUrl || d.statusUrl || "";
  const subject = `🎬 A quick hold on your ${product} trailer`;

  const body = `
    <h1 style="margin:0 0 8px;font:800 24px/1.25 'Trebuchet MS',Verdana,sans-serif;color:${BRAND.ink};">
      We're polishing your cut. 🎬</h1>
    <p style="margin:0 0 14px;font:400 15px/1.7 Verdana,sans-serif;color:${BRAND.ink};">
      Quick, honest update on <b>${esc(product)}</b>: our automated quality gate flagged
      the first cut, and the auto-fix pass didn't clear our bar either — so rather than
      send you something we're not proud of, a human director on the LaunchReel team is
      taking it the rest of the way.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
      style="margin:6px 0 4px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;">
      <tr><td style="padding:14px 16px;font:400 13px/1.6 Verdana,sans-serif;color:${BRAND.muted};">
        <b style="color:${BRAND.ink};">Why the hold</b><br>
        We render every trailer through a vision quality gate that checks text legibility,
        real-product truthfulness, and brand fidelity frame by frame. This one didn't pass
        cleanly, so we won't auto-ship it. No action needed from you.
      </td></tr>
    </table>
    ${dash ? button(dash, "Track your trailer →") : ""}
    <p style="margin:16px 0 0;font:400 13px/1.6 Verdana,sans-serif;color:${BRAND.muted};">
      We'll follow up personally the moment it's ready. Thanks for your patience.</p>
  `;

  const text = [
    `We're polishing your cut.`,
    ``,
    `Quick, honest update on ${product}: our automated quality gate flagged the first`,
    `cut, and the auto-fix pass didn't clear our bar either. Rather than send something`,
    `we're not proud of, a human director on the LaunchReel team is taking it the rest`,
    `of the way. No action needed from you.`,
    ``,
    `Why the hold: every trailer runs through a vision quality gate (text legibility,`,
    `real-product truthfulness, brand fidelity). This one didn't pass cleanly, so we`,
    `won't auto-ship it.`,
    dash ? `\nTrack your trailer: ${dash}` : "",
    ``,
    `We'll follow up personally the moment it's ready. — LaunchReel`,
  ].filter((l) => l !== null && l !== undefined).join("\n");

  return { subject, html: shell(`A quick hold on your ${product} trailer`, body), text };
}

// Two-video comparison: a client emailed us two trailers; the agent scored BOTH on
// the LaunchReel rubric and this ships the per-criterion breakdown + overall winner.
// Data: { labelA, labelB, winner ("A"|"B"|"tie"), scoreA, scoreB, summary,
//         perDimension:[{dimension,a,b,winner,why}], brandNote? }.
function videoCompare(d: Data): Rendered {
  const labelA = d.labelA || "Video A";
  const labelB = d.labelB || "Video B";
  const winner = String(d.winner || "tie").toUpperCase();
  const scoreA = d.scoreA != null ? Number(d.scoreA).toFixed(2) : "—";
  const scoreB = d.scoreB != null ? Number(d.scoreB).toFixed(2) : "—";
  const summary = d.summary || "We scored both trailers against the LaunchReel rubric.";
  const rows: Data[] = Array.isArray(d.perDimension) ? d.perDimension : [];
  const winnerLabel = winner === "A" ? labelA : winner === "B" ? labelB : "It's a tie";
  const subject = `🎬 Trailer face-off: ${labelA} vs ${labelB}`;

  const prettyDim = (s: string) =>
    String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const cell = (v: any) => (v == null || v === "" ? "—" : esc(v));

  const headRow = `
    <tr style="background:${BRAND.bg};">
      <th align="left" style="padding:9px 12px;font:700 12px/1.3 Verdana,sans-serif;color:${BRAND.ink};border-bottom:1px solid ${BRAND.border};">Criterion</th>
      <th align="center" style="padding:9px 8px;font:700 12px/1.3 Verdana,sans-serif;color:${BRAND.ink};border-bottom:1px solid ${BRAND.border};">${esc(labelA)}</th>
      <th align="center" style="padding:9px 8px;font:700 12px/1.3 Verdana,sans-serif;color:${BRAND.ink};border-bottom:1px solid ${BRAND.border};">${esc(labelB)}</th>
      <th align="left" style="padding:9px 12px;font:700 12px/1.3 Verdana,sans-serif;color:${BRAND.ink};border-bottom:1px solid ${BRAND.border};">Edge</th>
    </tr>`;
  const bodyRows = rows
    .map((r) => {
      const w = String(r.winner || "").toUpperCase();
      const edge = w === "A" ? esc(labelA) : w === "B" ? esc(labelB) : "Tie";
      return `<tr>
        <td style="padding:9px 12px;font:600 12px/1.4 Verdana,sans-serif;color:${BRAND.ink};border-bottom:1px solid ${BRAND.border};">${prettyDim(r.dimension)}</td>
        <td align="center" style="padding:9px 8px;font:400 12px/1.4 Verdana,sans-serif;color:${BRAND.ink};border-bottom:1px solid ${BRAND.border};">${cell(r.a)}</td>
        <td align="center" style="padding:9px 8px;font:400 12px/1.4 Verdana,sans-serif;color:${BRAND.ink};border-bottom:1px solid ${BRAND.border};">${cell(r.b)}</td>
        <td style="padding:9px 12px;font:400 12px/1.4 Verdana,sans-serif;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};">${cell(r.why || edge)}</td>
      </tr>`;
    })
    .join("\n");

  const body = `
    <h1 style="margin:0 0 8px;font:800 24px/1.25 'Trebuchet MS',Verdana,sans-serif;color:${BRAND.ink};">
      The verdict is in. 🏆</h1>
    <p style="margin:0 0 14px;font:400 15px/1.7 Verdana,sans-serif;color:${BRAND.ink};">
      We ran both trailers through the LaunchReel quality rubric. <b style="color:${BRAND.accent};">
      Winner: ${esc(winnerLabel)}</b> (${esc(labelA)} ${scoreA} vs ${esc(labelB)} ${scoreB}, mean of scored dimensions).</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
      style="margin:6px 0 10px;border:1px solid ${BRAND.border};border-radius:12px;border-collapse:separate;overflow:hidden;">
      ${headRow}
      ${bodyRows}
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
      style="margin:6px 0 4px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;">
      <tr><td style="padding:14px 16px;font:400 13px/1.6 Verdana,sans-serif;color:${BRAND.muted};">
        <b style="color:${BRAND.ink};">Summary</b><br>${esc(summary)}
      </td></tr>
    </table>
    ${d.brandNote ? `<p style="margin:14px 0 0;font:400 12px/1.5 Verdana,sans-serif;color:${BRAND.muted};">${esc(d.brandNote)}</p>` : ""}
    <p style="margin:14px 0 0;font:400 12px/1.5 Verdana,sans-serif;color:${BRAND.muted};">
      Scored 1-5 per criterion by the same vision rig that gates every LaunchReel delivery.</p>
  `;

  const textRows = rows
    .map((r) => {
      const w = String(r.winner || "").toUpperCase();
      const edge = w === "A" ? labelA : w === "B" ? labelB : "Tie";
      return `  - ${prettyDim(r.dimension)}: ${labelA}=${r.a ?? "—"}  ${labelB}=${r.b ?? "—"}  edge: ${edge}${r.why ? ` (${r.why})` : ""}`;
    })
    .join("\n");
  const text = [
    `The verdict is in.`,
    ``,
    `Winner: ${winnerLabel}  (${labelA} ${scoreA} vs ${labelB} ${scoreB})`,
    ``,
    `Per-criterion:`,
    textRows,
    ``,
    `Summary: ${summary}`,
    d.brandNote ? `\n${d.brandNote}` : "",
    ``,
    `Scored 1-5 per criterion by the LaunchReel vision rig. — LaunchReel`,
  ].filter((l) => l !== null && l !== undefined).join("\n");

  return { subject, html: shell(`Trailer face-off: ${labelA} vs ${labelB}`, body), text };
}

// Intake gate: the site gave the pipeline too little to make a truthful trailer,
// so we ask the customer 2-4 specific questions before storyboarding. Data:
// { productName, questions: string[], dashboardUrl?, jobId? }.
function needInfo(d: Data): Rendered {
  const product = d.productName || "your launch";
  const dash = d.dashboardUrl || d.statusUrl || "";
  const questions: string[] = Array.isArray(d.questions)
    ? d.questions.map((q) => String(q ?? "").trim()).filter(Boolean).slice(0, 4)
    : [];
  const subject = "Quick questions before we roll camera 🎬";

  const qList = questions.length
    ? `<ul style="margin:8px 0 6px;padding:0 0 0 20px;">${questions
        .map(
          (q) =>
            `<li style="margin:0 0 10px;font:400 15px/1.6 Verdana,sans-serif;color:${BRAND.ink};">${esc(
              q
            )}</li>`
        )
        .join("")}</ul>`
    : "";

  const body = `
    <h1 style="margin:0 0 8px;font:800 24px/1.25 'Trebuchet MS',Verdana,sans-serif;color:${BRAND.ink};">
      Two quick things and we're rolling.</h1>
    <p style="margin:0 0 14px;font:400 15px/1.7 Verdana,sans-serif;color:${BRAND.ink};">
      We started on your <b>${esc(product)}</b> trailer — but your site didn't give our
      agents quite enough to make something you'll be proud to launch with. A couple of
      quick answers and we'll cut it right away:</p>
    ${qList}
    <p style="margin:14px 0 0;font:400 15px/1.7 Verdana,sans-serif;color:${BRAND.ink};">
      Just hit <b>reply</b> — a sentence each is plenty. You can also paste 2-3 product
      screenshots or your logo and we'll use them.</p>
    ${dash ? button(dash, "See your order →") : ""}
    ${d.jobId ? `<p style="margin:14px 0 0;font:400 11px/1.5 Verdana,sans-serif;color:${BRAND.muted};">
      Order ref: ${esc(d.jobId)}</p>` : ""}
  `;

  const text = [
    `Two quick things and we're rolling.`,
    ``,
    `We started on your ${product} trailer, but your site didn't give our agents`,
    `quite enough to make something you'll be proud to launch with. A couple of quick`,
    `answers and we'll cut it right away:`,
    ``,
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    ``,
    `Just reply — a sentence each is plenty. You can also attach 2-3 product`,
    `screenshots or your logo and we'll use them.`,
    dash ? `\nSee your order: ${dash}` : "",
    d.jobId ? `\nOrder ref: ${d.jobId}` : "",
    ``,
    `— LaunchReel`,
  ].filter((l) => l !== null && l !== undefined).join("\n");

  return { subject, html: shell(`A couple of quick questions about ${product}`, body), text };
}

// Pre-delivery storyline preview: after the storyboard is written (before render
// finishes) we show the customer the cut we're about to make and invite tweaks.
// Data: { productName, tier?, scenes: {type,headline}[], voOpening?, dashboardUrl? }.
function storyline(d: Data): Rendered {
  const product = d.productName || "your launch";
  const dash = d.dashboardUrl || d.statusUrl || "";
  const voOpening = String(d.voOpening ?? "").trim();
  const scenes: Array<{ type?: string; headline?: string }> = Array.isArray(d.scenes)
    ? d.scenes
    : [];
  const subject = `🎬 Your ${product} storyline — a look before we render`;

  const SCENE_LABEL: Record<string, string> = {
    hook: "Hook",
    problem: "Problem",
    tour_a: "Product tour",
    tour_b: "Product tour",
    social_proof: "Social proof",
    cta: "Call to action",
  };

  const rows = scenes
    .map((s, i) => {
      const label = SCENE_LABEL[String(s?.type)] || String(s?.type || `Scene ${i + 1}`);
      const line = String(s?.headline ?? "").trim();
      if (!line) return "";
      return `<tr>
        <td style="padding:8px 10px 8px 0;vertical-align:top;font:700 12px/1.5 Verdana,sans-serif;color:${BRAND.accent};white-space:nowrap;">${esc(
          label
        )}</td>
        <td style="padding:8px 0;vertical-align:top;font:400 14px/1.5 Verdana,sans-serif;color:${BRAND.ink};">${esc(
          line
        )}</td>
      </tr>`;
    })
    .filter(Boolean)
    .join("");

  const scenesBlock = rows
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
        style="margin:8px 0 6px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;">
        <tr><td style="padding:12px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>
        </td></tr></table>`
    : "";

  const voBlock = voOpening
    ? `<p style="margin:12px 0 0;font:400 14px/1.7 Verdana,sans-serif;color:${BRAND.muted};">
        <b style="color:${BRAND.ink};">Opening voiceover:</b> "${esc(voOpening)}"</p>`
    : "";

  const body = `
    <h1 style="margin:0 0 8px;font:800 24px/1.25 'Trebuchet MS',Verdana,sans-serif;color:${BRAND.ink};">
      Here's the cut we're about to make.</h1>
    <p style="margin:0 0 14px;font:400 15px/1.7 Verdana,sans-serif;color:${BRAND.ink};">
      Your <b>${esc(product)}</b> trailer just got its storyboard. Six scenes, thirty
      seconds — here's the beat sheet:</p>
    ${scenesBlock}
    ${voBlock}
    <p style="margin:16px 0 0;font:400 15px/1.7 Verdana,sans-serif;color:${BRAND.ink};">
      <b>Reply with any tweaks</b> — a different hook, a sharper CTA, a color — and we'll
      fold them in. Otherwise this is rendering right now and lands in your inbox shortly.</p>
    ${dash ? button(dash, "Watch it build live →") : ""}
  `;

  const text = [
    `Here's the cut we're about to make.`,
    ``,
    `Your ${product} trailer just got its storyboard. Six scenes, thirty seconds:`,
    ``,
    ...scenes
      .map((s, i) => {
        const label = SCENE_LABEL[String(s?.type)] || String(s?.type || `Scene ${i + 1}`);
        const line = String(s?.headline ?? "").trim();
        return line ? `${i + 1}. ${label}: ${line}` : "";
      })
      .filter(Boolean),
    voOpening ? `\nOpening voiceover: "${voOpening}"` : "",
    ``,
    `Reply with any tweaks — a different hook, a sharper CTA, a color — and we'll fold`,
    `them in. Otherwise this is rendering right now and lands in your inbox shortly.`,
    dash ? `\nWatch it build live: ${dash}` : "",
    ``,
    `— LaunchReel`,
  ].filter((l) => l !== null && l !== undefined).join("\n");

  return { subject, html: shell(`Your ${product} storyline`, body), text };
}

// Approval-gate preview: the cut is rendered and at awaiting_approval (final QA).
// Shows the customer their trailer with the poster + watch link, and invites a
// pre-delivery tweak (which the stage-aware feedback loop folds in before ship).
// Data: { productName, videoUrl, posterUrl?, dashboardUrl?, tier? }.
function previewReady(d: Data): Rendered {
  const product = d.productName || "your launch";
  const video = d.videoUrl || "";
  const dash = d.dashboardUrl || d.statusUrl || "";
  const poster = d.posterUrl || "";
  const subject = `🎬 Your ${product} cut is ready`;

  const posterBlock = poster
    ? `<a href="${esc(video || dash)}" style="text-decoration:none;">
         <img src="${esc(poster)}" alt="${esc(product)} trailer" width="500"
           style="width:100%;max-width:500px;border-radius:12px;border:1px solid ${BRAND.border};display:block;margin:4px 0 2px;"></a>`
    : "";

  const body = `
    <h1 style="margin:0 0 8px;font:800 24px/1.25 'Trebuchet MS',Verdana,sans-serif;color:${BRAND.ink};">
      Your cut is ready. 🎬</h1>
    <p style="margin:0 0 14px;font:400 15px/1.7 Verdana,sans-serif;color:${BRAND.ink};">
      Here's your <b>${esc(product)}</b> launch trailer, fresh off the render. Take a look —
      we're doing a quick final QA pass and it ships to you shortly.</p>
    ${posterBlock}
    ${video ? button(video, "▶ Watch your trailer") : (dash ? button(dash, "▶ Open your trailer") : "")}
    <p style="margin:18px 0 0;font:400 13px/1.6 Verdana,sans-serif;color:${BRAND.muted};">
      Want a change before it goes out? <b>Reply to this email</b> with any tweak — a hook,
      the CTA, a color — and we'll fold it into the cut.</p>
    ${dash ? `<p style="margin:12px 0 0;font:400 12px/1.6 Verdana,sans-serif;color:${BRAND.muted};">
      Track it live: <a href="${esc(dash)}" style="color:${BRAND.accent};">${esc(dash)}</a></p>` : ""}
  `;

  const text = [
    `Your cut is ready.`,
    ``,
    `Here's your ${product} launch trailer, fresh off the render. We're doing a quick`,
    `final QA pass and it ships to you shortly.`,
    video ? `\nWatch it: ${video}` : (dash ? `\nOpen it: ${dash}` : ""),
    ``,
    `Want a change before it goes out? Reply to this email with any tweak — a hook,`,
    `the CTA, a color — and we'll fold it into the cut.`,
    dash ? `\nTrack it live: ${dash}` : "",
    ``,
    `— LaunchReel`,
  ].filter((l) => l !== null && l !== undefined).join("\n");

  return { subject, html: shell(`Your ${product} cut is ready`, body), text };
}

// Generic branded reply — used for the feedback-loop edge cases (no matching
// order, or an escalation to a human). Caller supplies subject/heading/body.
function reply(d: Data): Rendered {
  const subject = d.subject || "Re: your LaunchReel trailer";
  const heading = d.heading || "Thanks for the note";
  const raw = String(d.body ?? "");
  const paras = raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const htmlBody = paras
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font:400 15px/1.7 Verdana,sans-serif;color:${BRAND.ink};">${esc(
          p
        ).replace(/\n/g, "<br>")}</p>`
    )
    .join("\n");

  const body = `
    <h1 style="margin:0 0 12px;font:800 22px/1.25 'Trebuchet MS',Verdana,sans-serif;color:${BRAND.ink};">
      ${esc(heading)}</h1>
    ${htmlBody}
  `;

  const text = [heading, ``, raw.trim(), ``, `— LaunchReel`].join("\n");
  return { subject, html: shell(heading, body), text };
}

const TEMPLATES: Record<string, (d: Data) => Rendered> = {
  order_confirmation: orderConfirmation,
  delivered,
  revision_ready: revisionReady,
  quality_hold: qualityHold,
  video_compare: videoCompare,
  need_info: needInfo,
  storyline,
  preview_ready: previewReady,
  reply,
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
