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
    const { from, subject, text } = body ?? {};
    if (!from || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from))
      return json({ error: "valid from required" }, 400);
    const result = await ctx.runMutation(api.orders.emailInbound, {
      from: String(from).slice(0, 200),
      subject: subject ? String(subject).slice(0, 200) : undefined,
      text: text ? String(text).slice(0, 5000) : undefined,
    });
    return json(result);
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

export default http;
