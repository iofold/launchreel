import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

// Plain-fetch endpoints so the static landing page needs no Convex client bundle.
// Base URL: https://<deployment>.convex.site

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const preflight = httpAction(async () => new Response(null, { status: 204, headers: cors }));

const http = httpRouter();

http.route({ path: "/api/order", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/order",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { email, productName, oneLiner, url, tier } = body ?? {};
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return json({ error: "valid email required" }, 400);
    // URL-first: a url alone is enough (Scout fills productName/oneLiner).
    // Otherwise the classic full form (productName + oneLiner) still works.
    const hasUrl = typeof url === "string" && url.trim().length > 0;
    if (!hasUrl && (!productName || !oneLiner))
      return json({ error: "url, or productName + oneLiner, required" }, 400);
    // tier optional for URL-first public flow — defaults to the free teaser.
    const finalTier = ["teaser", "trailer", "pack"].includes(tier) ? tier : "teaser";

    const result = await ctx.runMutation(api.orders.place, {
      email,
      productName: productName ? String(productName).slice(0, 100) : undefined,
      oneLiner: oneLiner ? String(oneLiner).slice(0, 200) : undefined,
      url: hasUrl ? String(url).slice(0, 300) : undefined,
      tier: finalTier,
      source: "landing",
    });
    return json(result);
  }),
});

// Buildathon TV "claim your trailer": public (jobId is unguessable), CORS-open.
http.route({ path: "/api/claim", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/claim",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { jobId, email, source } = body ?? {};
    if (!jobId) return json({ error: "jobId required" }, 400);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return json({ error: "valid email required" }, 400);
    try {
      const result = await ctx.runMutation(api.orders.claimJob, {
        jobId,
        email,
        source: source ? String(source).slice(0, 32) : "tv_claim",
      });
      return json(result, result?.ok === false ? 404 : 200);
    } catch {
      return json({ error: "unknown job" }, 404);
    }
  }),
});

// Buildathon TV: public delivered-premieres feed (read-only, CORS-open like
// /api/job/status). Powers the on-the-wall program guide + featured player.
http.route({ path: "/api/tv", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/tv",
  method: "POST",
  handler: httpAction(async (ctx) => {
    const jobs = await ctx.runQuery(api.orders.delivered, {});
    return json({ jobs });
  }),
});

// Style Lab feedback: public (like /api/tv), CORS-open. Powers the six-style
// taste-collection artifact sent to delivered customers. Additive, no auth.
http.route({ path: "/api/style-feedback", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/style-feedback",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { email, ratings, topPick, source } = body ?? {};
    // Sanitize to the six known styles + bounded fields so the event stays clean
    // and this open endpoint can't be used to stash arbitrary payloads.
    const STYLES = [
      "01-channel-zap",
      "02-exploded-ui",
      "03-the-crew",
      "04-midnight-launch",
      "05-premium-film",
      "06-speedrun-receipt",
    ];
    const RATINGS = ["love", "like", "meh"];
    const clean: Record<string, any> = {};
    if (ratings && typeof ratings === "object") {
      for (const k of STYLES) {
        const r = (ratings as any)[k];
        if (!r || typeof r !== "object") continue;
        const entry: any = {};
        if (RATINGS.includes(r.rating)) entry.rating = r.rating;
        if (typeof r.why === "string" && r.why.trim()) entry.why = String(r.why).slice(0, 500);
        if (typeof r.wouldUse === "boolean") entry.wouldUse = r.wouldUse;
        if (Object.keys(entry).length) clean[k] = entry;
      }
    }
    const cleanTopPick = STYLES.includes(topPick) ? topPick : undefined;
    const result = await ctx.runMutation(api.orders.logStyleFeedback, {
      email: typeof email === "string" ? email.slice(0, 200) : undefined,
      ratings: clean,
      topPick: cleanTopPick,
      source: typeof source === "string" ? source.slice(0, 40) : "style_lab",
    });
    return json(result);
  }),
});

http.route({ path: "/api/signup", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/signup",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { email, source } = body ?? {};
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return json({ error: "valid email required" }, 400);
    const result = await ctx.runMutation(api.orders.signup, { email, source });
    return json(result);
  }),
});

http.route({ path: "/api/job/status", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/job/status",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    if (!body?.jobId) return json({ error: "jobId required" }, 400);
    try {
      const job = await ctx.runQuery(api.orders.jobStatus, { jobId: body.jobId });
      return json({ job });
    } catch {
      return json({ error: "unknown job" }, 404);
    }
  }),
});

// ---- Worker-pool endpoints (parallel render workers) ----------------------
// Guarded by a shared secret: set WORKER_KEY in the Convex deployment env
// (npx convex env set WORKER_KEY <value>) and send it as X-Worker-Key.

const workerAuthed = (req: Request) => {
  const key = process.env.WORKER_KEY;
  return !!key && req.headers.get("X-Worker-Key") === key;
};

http.route({ path: "/api/worker/claim", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/worker/claim",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthed(req)) return json({ error: "unauthorized" }, 401);
    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    const job = await ctx.runMutation(api.orders.claimNext, {
      workerId: String(body?.workerId ?? "unknown").slice(0, 64),
    });
    return json({ job });
  }),
});

http.route({ path: "/api/worker/update", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/worker/update",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthed(req)) return json({ error: "unauthorized" }, 401);
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { jobId, status, videoUrl, posterUrl } = body ?? {};
    const allowed = [
      "research",
      "awaiting_info",
      "storyboard",
      "voiceover",
      "rendering",
      "awaiting_approval",
      "delivered",
      "failed",
    ];
    if (!jobId || !allowed.includes(status)) return json({ error: "jobId + valid status required" }, 400);
    await ctx.runMutation(api.orders.updateStatus, { jobId, status, videoUrl, posterUrl });
    return json({ ok: true });
  }),
});

// Batch seeder (scripts/seed-yc-batch.ts) -> orders.seedBatch. No users, no
// signup events — the scoreboard stays honest.
http.route({ path: "/api/worker/seed", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/worker/seed",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthed(req)) return json({ error: "unauthorized" }, 401);
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const companies = Array.isArray(body?.companies) ? body.companies : null;
    if (!companies || !companies.length) return json({ error: "companies[] required" }, 400);
    const clean = companies
      .filter((c: any) => c && typeof c.website === "string" && c.website.trim())
      .slice(0, 200)
      .map((c: any) => ({
        name: String(c.name ?? "").slice(0, 100),
        website: String(c.website).slice(0, 300),
        oneLiner: c.oneLiner ? String(c.oneLiner).slice(0, 200) : undefined,
        logoUrl: c.logoUrl ? String(c.logoUrl).slice(0, 500) : undefined,
      }));
    if (!clean.length) return json({ error: "no companies with a website" }, 400);
    const result = await ctx.runMutation(api.orders.seedBatch, {
      batch: body?.batch ? String(body.batch).slice(0, 40) : undefined,
      tier: ["teaser", "trailer", "pack"].includes(body?.tier) ? body.tier : undefined,
      companies: clean,
    });
    return json(result);
  }),
});

// ---- Inbound email (Cloudflare Email Routing -> Email Worker) --------------
// reel@ctxmill.com -> workers/email-inbound -> here. Guarded by EMAIL_WEBHOOK_KEY
// (set it in the Convex deployment env; falls back to WORKER_KEY if unset). The
// Email Worker sends the key as X-Email-Key.
const emailAuthed = (req: Request) => {
  const key = process.env.EMAIL_WEBHOOK_KEY || process.env.WORKER_KEY;
  return !!key && req.headers.get("X-Email-Key") === key;
};

http.route({ path: "/api/email/inbound", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/email/inbound",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!emailAuthed(req)) return json({ error: "unauthorized" }, 401);
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { from, subject, text, attachmentUrls } = body ?? {};
    if (!from || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from))
      return json({ error: "valid from required" }, 400);
    // Accept only well-formed http(s) attachment URLs (additive/optional).
    const cleanAttachments = Array.isArray(attachmentUrls)
      ? attachmentUrls
          .filter((u: unknown) => typeof u === "string" && /^https?:\/\//.test(u))
          .slice(0, 6)
          .map((u: string) => u.slice(0, 500))
      : undefined;
    const result = await ctx.runMutation(api.orders.emailInbound, {
      from: String(from).slice(0, 200),
      subject: subject ? String(subject).slice(0, 200) : undefined,
      text: text ? String(text).slice(0, 5000) : undefined,
      attachmentUrls: cleanAttachments && cleanAttachments.length ? cleanAttachments : undefined,
    });
    return json(result);
  }),
});

// Worker/operator lookup: full job + owner email (approve.py needs the email to
// send the `delivered` message). Key-guarded, same shared secret as the pool.
http.route({ path: "/api/worker/job", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/worker/job",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthed(req)) return json({ error: "unauthorized" }, 401);
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    if (!body?.jobId) return json({ error: "jobId required" }, 400);
    try {
      const job = await ctx.runQuery(api.orders.jobForWorker, { jobId: body.jobId });
      return json({ job });
    } catch {
      return json({ error: "unknown job" }, 404);
    }
  }),
});

// Worker research stage -> orders.attachBrief (Scout's brief.json onto the job).
http.route({ path: "/api/worker/brief", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/worker/brief",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthed(req)) return json({ error: "unauthorized" }, 401);
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { jobId, brief } = body ?? {};
    if (!jobId || typeof brief !== "object" || brief === null)
      return json({ error: "jobId + brief object required" }, 400);
    const result = await ctx.runMutation(api.orders.attachBrief, { jobId, brief });
    return json(result);
  }),
});

// ---- Autonomous email feedback loop (feedback.py) -------------------------
// Same shared secret as the worker pool (X-Worker-Key).

// List unprocessed inbound emails + the sender's latest job-with-video.
http.route({ path: "/api/worker/inbox", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/worker/inbox",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthed(req)) return json({ error: "unauthorized" }, 401);
    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    const limit = typeof body?.limit === "number" ? body.limit : undefined;
    const items = await ctx.runQuery(api.orders.unprocessedInbound, { limit });
    return json({ items });
  }),
});

// Ack an inbound event as processed (resolution: revised|no_job|escalated_human|failed).
http.route({ path: "/api/worker/inbox/ack", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/worker/inbox/ack",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthed(req)) return json({ error: "unauthorized" }, 401);
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { eventId, resolution } = body ?? {};
    if (!eventId || typeof resolution !== "string")
      return json({ error: "eventId + resolution required" }, 400);
    const result = await ctx.runMutation(api.orders.markInboundProcessed, { eventId, resolution });
    return json(result, result?.ok === false ? 404 : 200);
  }),
});

// Apply the one allowed revision (bump revisionCount, new URLs, re-deliver).
http.route({ path: "/api/worker/revision", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/worker/revision",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthed(req)) return json({ error: "unauthorized" }, 401);
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { jobId, videoUrl, posterUrl } = body ?? {};
    if (!jobId || !videoUrl || !posterUrl)
      return json({ error: "jobId + videoUrl + posterUrl required" }, 400);
    const result = await ctx.runMutation(api.orders.applyRevision, { jobId, videoUrl, posterUrl });
    return json(result, result?.ok === false ? (result.error === "job not found" ? 404 : 409) : 200);
  }),
});

// Resume an awaiting_info job after the customer answered our questions (feedback.py
// sends the folded brief here). 409 if the job already moved out of awaiting_info.
http.route({ path: "/api/worker/resume-info", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/worker/resume-info",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthed(req)) return json({ error: "unauthorized" }, 401);
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { jobId, brief } = body ?? {};
    if (!jobId || typeof brief !== "object" || brief === null)
      return json({ error: "jobId + brief object required" }, 400);
    const result = await ctx.runMutation(api.orders.resumeFromInfo, { jobId, brief });
    return json(result, result?.ok === false ? (result.error === "job not found" ? 404 : 409) : 200);
  }),
});

// Pre-delivery storyline feedback: append the note to brief.feedbackNotes and
// re-queue the job. 409 if the job is no longer pre-delivery (e.g. just delivered).
http.route({ path: "/api/worker/requeue-feedback", method: "OPTIONS", handler: preflight });
http.route({
  path: "/api/worker/requeue-feedback",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthed(req)) return json({ error: "unauthorized" }, 401);
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const { jobId, feedback } = body ?? {};
    if (!jobId || typeof feedback !== "string" || !feedback.trim())
      return json({ error: "jobId + feedback required" }, 400);
    const result = await ctx.runMutation(api.orders.requeueForFeedback, { jobId, feedback });
    return json(result, result?.ok === false ? (result.error === "job not found" ? 404 : 409) : 200);
  }),
});

export default http;
