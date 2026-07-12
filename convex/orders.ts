import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// "linear.app" / "https://www.linear.app/x" -> "Linear". Placeholder product
// name for URL-first orders until Scout backfills the real one from the brief.
function domainPlaceholder(url?: string): string {
  if (!url) return "Untitled";
  let host = url.trim().replace(/^[a-z]+:\/\//i, "").split("/")[0].split(":")[0];
  if (host.startsWith("www.")) host = host.slice(4);
  const stem = host.includes(".") ? host.split(".")[0] : host;
  if (!stem) return "Untitled";
  return stem.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Single entry point for the landing page: upsert user, create job,
// log signup (new user) + first_use_started (first job) events.
//
// URL-first: productName/oneLiner are optional. When missing, productName is a
// placeholder derived from the URL domain and oneLiner is left empty (""), a
// marker attachBrief uses to backfill both from Scout's brief.
export const place = mutation({
  args: {
    email: v.string(),
    productName: v.optional(v.string()),
    oneLiner: v.optional(v.string()),
    url: v.optional(v.string()),
    tier: v.union(v.literal("teaser"), v.literal("trailer"), v.literal("pack")),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const email = args.email.trim().toLowerCase();
    const source = args.source ?? "landing";
    const productName = (args.productName?.trim() || domainPlaceholder(args.url)).slice(0, 100);
    const oneLiner = (args.oneLiner?.trim() ?? "").slice(0, 200);

    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      const userId = await ctx.db.insert("users", {
        email,
        company: productName,
        source,
        createdAt: now,
      });
      user = (await ctx.db.get(userId))!;
      await ctx.db.insert("events", {
        type: "signup",
        userId,
        meta: { source },
        createdAt: now,
      });
    }

    const priorJobs = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const jobId = await ctx.db.insert("jobs", {
      userId: user._id,
      tier: args.tier,
      status: "queued",
      productName,
      oneLiner,
      url: args.url,
      source,
      createdAt: now,
      updatedAt: now,
    });

    if (!priorJobs) {
      await ctx.db.insert("events", {
        type: "first_use_started",
        userId: user._id,
        jobId,
        createdAt: now,
      });
    }
    await ctx.db.insert("events", {
      type: "job_created",
      userId: user._id,
      jobId,
      meta: { tier: args.tier, source },
      createdAt: now,
    });

    return { jobId, userId: user._id, isNewUser };
  },
});

// Email-only capture for the QR → teaser claim flow.
export const signup = mutation({
  args: { email: v.string(), source: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) return { userId: existing._id, isNewUser: false };

    const userId = await ctx.db.insert("users", {
      email,
      source: args.source ?? "qr_claim",
      createdAt: now,
    });
    await ctx.db.insert("events", {
      type: "signup",
      userId,
      meta: { source: args.source ?? "qr_claim" },
      createdAt: now,
    });
    return { userId, isNewUser: true };
  },
});

export const updateStatus = mutation({
  args: {
    jobId: v.id("jobs"),
    status: v.union(
      v.literal("queued"),
      v.literal("research"),
      v.literal("awaiting_info"),
      v.literal("storyboard"),
      v.literal("voiceover"),
      v.literal("rendering"),
      v.literal("awaiting_approval"),
      v.literal("delivered"),
      v.literal("failed")
    ),
    videoUrl: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, status, videoUrl, posterUrl }) => {
    await ctx.db.patch(jobId, {
      status,
      updatedAt: Date.now(),
      ...(videoUrl ? { videoUrl } : {}),
      ...(posterUrl ? { posterUrl } : {}),
    });
  },
});

export const recordPayment = mutation({
  args: {
    userId: v.id("users"),
    jobId: v.optional(v.id("jobs")),
    amountInr: v.number(),
    method: v.union(v.literal("razorpay"), v.literal("upi_qr")),
    evidence: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const paymentId = await ctx.db.insert("payments", { ...args, createdAt: now });
    await ctx.db.insert("events", {
      type: "payment_recorded",
      userId: args.userId,
      jobId: args.jobId,
      meta: { amountInr: args.amountInr, method: args.method },
      createdAt: now,
    });
    return { paymentId };
  },
});

// Render worker + ops board: next queued job.
export const nextQueued = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();
  },
});

// Atomic claim for the worker pool: Convex mutations are transactional, so two
// workers can never claim the same job — the second one sees status != queued
// and gets the next job (or null). workerId is recorded in events for the trace.
export const claimNext = mutation({
  args: { workerId: v.string() },
  handler: async (ctx, { workerId }) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();
    if (!job) return null;
    await ctx.db.patch(job._id, { status: "research", updatedAt: Date.now() });
    // Seeded (yc_batch) jobs have no userId yet — events.userId is optional, so
    // only attach it when present.
    await ctx.db.insert("events", {
      type: "job_claimed",
      jobId: job._id,
      ...(job.userId ? { userId: job.userId } : {}),
      meta: { workerId, source: job.source },
      createdAt: Date.now(),
    });
    // Owner email drives the order-confirmation send (email is the primary
    // channel). Seeded/unclaimed jobs have no user -> null, and the worker skips
    // the confirmation for those (a seeded trailer is not yet a customer contact).
    const email = job.userId ? (await ctx.db.get(job.userId))?.email ?? null : null;
    return {
      jobId: job._id,
      email,
      tier: job.tier,
      productName: job.productName,
      oneLiner: job.oneLiner,
      url: job.url,
      source: job.source,
      assetRefs: job.assetRefs,
      // Carried so a re-queued job (awaiting_info resume / pre-delivery feedback) keeps
      // its customerNotes/feedbackNotes even when a fresh box re-runs Scout over them.
      brief: job.brief ?? null,
    };
  },
});

// ---- Launch stunt: pre-render the current YC batch ------------------------

// Seed jobs for a batch of companies with NO user row and NO signup event —
// integrity rule so the scoreboard stays honest (a seeded trailer is not a
// conversion). The conversion is claimJob: a founder enters their email later.
// Key-guarded at the HTTP layer (/api/worker/seed, X-Worker-Key); this mutation
// is not exposed publicly on the landing page.
export const seedBatch = mutation({
  args: {
    batch: v.optional(v.string()), // e.g. "summer-2026" — recorded in meta
    tier: v.optional(v.union(v.literal("teaser"), v.literal("trailer"), v.literal("pack"))),
    companies: v.array(
      v.object({
        name: v.string(),
        website: v.string(),
        oneLiner: v.optional(v.string()),
        logoUrl: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const tier = args.tier ?? "teaser";
    const jobIds: string[] = [];
    for (const c of args.companies) {
      const website = c.website.trim();
      if (!website) continue;
      // Idempotent-ish: skip a company already seeded with the same URL.
      const dupe = await ctx.db
        .query("jobs")
        .withIndex("by_source", (q) => q.eq("source", "yc_batch"))
        .filter((q) => q.eq(q.field("url"), website))
        .first();
      if (dupe) {
        jobIds.push(dupe._id);
        continue;
      }
      const jobId = await ctx.db.insert("jobs", {
        // no userId — unclaimed
        tier,
        status: "queued",
        productName: (c.name?.trim() || domainPlaceholder(website)).slice(0, 100),
        oneLiner: (c.oneLiner?.trim() ?? "").slice(0, 200),
        url: website,
        source: "yc_batch",
        assetRefs: c.logoUrl ? [c.logoUrl] : undefined,
        createdAt: now,
        updatedAt: now,
      });
      jobIds.push(jobId);
    }
    // No signup / first_use / user events — only a batch-scoped job_seeded
    // trace event (never counted by the scoreboard funnel).
    if (jobIds.length) {
      await ctx.db.insert("events", {
        type: "job_seeded",
        meta: { batch: args.batch ?? "unknown", count: jobIds.length },
        createdAt: now,
      });
    }
    return { seeded: jobIds.length, jobIds };
  },
});

// Worker writes Scout's structured brief onto the job. For URL-first jobs
// (empty oneLiner placeholder) it also backfills productName/oneLiner from the
// brief so the dashboard/TV show the real name; full-form orders (user-typed
// oneLiner) keep their own copy.
export const attachBrief = mutation({
  args: { jobId: v.id("jobs"), brief: v.any() },
  handler: async (ctx, { jobId, brief }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return { ok: false, error: "job not found" };
    const patch: Record<string, unknown> = { brief, updatedAt: Date.now() };
    if (!job.oneLiner) {
      if (typeof brief?.productName === "string" && brief.productName.trim())
        patch.productName = String(brief.productName).slice(0, 100);
      if (typeof brief?.oneLiner === "string" && brief.oneLiner.trim())
        patch.oneLiner = String(brief.oneLiner).slice(0, 200);
    }
    await ctx.db.patch(jobId, patch);
    return { ok: true };
  },
});

// Buildathon TV "claim your trailer": a founder enters their email against a
// seeded (or any) job. THIS is the conversion — create/find the user, log
// signup (new) + teaser_claimed, and link the job to the user.
export const claimJob = mutation({
  args: { jobId: v.id("jobs"), email: v.string(), source: v.optional(v.string()) },
  handler: async (ctx, { jobId, email, source }) => {
    const now = Date.now();
    const clean = email.trim().toLowerCase();
    const job = await ctx.db.get(jobId);
    if (!job) return { ok: false, error: "job not found" };

    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", clean))
      .unique();
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      const userId = await ctx.db.insert("users", {
        email: clean,
        company: job.productName,
        source: source ?? "tv_claim",
        createdAt: now,
      });
      user = (await ctx.db.get(userId))!;
      await ctx.db.insert("events", {
        type: "signup",
        userId,
        meta: { source: source ?? "tv_claim" },
        createdAt: now,
      });
    }

    // Link the job to the claiming founder (only if unclaimed).
    if (!job.userId) await ctx.db.patch(jobId, { userId: user._id, updatedAt: now });

    await ctx.db.insert("events", {
      type: "teaser_claimed",
      userId: user._id,
      jobId,
      meta: { source: source ?? "tv_claim", batchSeeded: job.source === "yc_batch" },
      createdAt: now,
    });

    return { ok: true, userId: user._id, jobId, isNewUser };
  },
});

// Inbound email (Cloudflare Email Routing -> Email Worker -> /api/email/inbound).
// Email is the primary channel, so a message from a new sender is a real contact:
// upsert them as a user (source "email") + signup event, then log an
// email_inbound event carrying the parsed subject/body so the gateway/operator
// can triage it as a new order or a reply on an existing job.
export const emailInbound = mutation({
  args: {
    from: v.string(),
    subject: v.optional(v.string()),
    text: v.optional(v.string()),
    // Public R2 URLs of video attachments the inbound Email Worker uploaded
    // (used by the two-video comparison flow). Additive/optional.
    attachmentUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { from, subject, text, attachmentUrls }) => {
    const now = Date.now();
    const email = from.trim().toLowerCase();

    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      const userId = await ctx.db.insert("users", { email, source: "email", createdAt: now });
      user = (await ctx.db.get(userId))!;
      await ctx.db.insert("events", {
        type: "signup",
        userId,
        meta: { source: "email" },
        createdAt: now,
      });
    }

    await ctx.db.insert("events", {
      type: "email_inbound",
      userId: user._id,
      meta: {
        subject: (subject ?? "").slice(0, 200),
        text: (text ?? "").slice(0, 2000),
        // Carry attachment URLs so the compare agent can score them. Kept only
        // when present so existing events are unaffected.
        ...(attachmentUrls && attachmentUrls.length
          ? { attachmentUrls: attachmentUrls.slice(0, 6).map((u) => String(u).slice(0, 500)) }
          : {}),
      },
      createdAt: now,
    });

    return { ok: true, userId: user._id, isNewUser };
  },
});

// ---- Style Lab feedback (public artifact) ---------------------------------
// The LaunchReel Style Lab artifact (artifacts.iofold.com/.../launchreel-style-lab)
// lets a delivered customer react to six candidate trailer styles. Additive and
// public: one "style_feedback" event per submit, last-write-informal (multiple
// submits from one person are fine). No user is created — if the email matches a
// known user we link it, otherwise the event stands on its own.
// meta: { email?, ratings: { <styleId>: { rating, why?, wouldUse? } }, topPick?, source }
export const logStyleFeedback = mutation({
  args: {
    email: v.optional(v.string()),
    ratings: v.optional(v.any()),
    topPick: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { email, ratings, topPick, source }) => {
    const now = Date.now();
    const cleanEmail =
      email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
        ? email.trim().toLowerCase().slice(0, 200)
        : undefined;

    // Best-effort link to a known user; never create one from this surface.
    let userId = undefined;
    if (cleanEmail) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", cleanEmail))
        .first();
      userId = user?._id;
    }

    await ctx.db.insert("events", {
      type: "style_feedback",
      userId,
      meta: {
        ...(cleanEmail ? { email: cleanEmail } : {}),
        ratings: ratings ?? {},
        ...(topPick ? { topPick: String(topPick).slice(0, 40) } : {}),
        source: source ? String(source).slice(0, 40) : "style_lab",
      },
      createdAt: now,
    });

    return { ok: true };
  },
});

// ---- Autonomous email feedback loop ---------------------------------------
// A customer replies to their trailer email with feedback. feedback.py polls
// these unprocessed email_inbound events, matches the sender to their latest
// delivered trailer, applies at most one minimal revision, then acks the event.

// List unprocessed inbound emails, each joined to its sender and that sender's
// latest job that already has a rendered video (the trailer the reply is about).
// "Unprocessed" = the email_inbound event has no meta.processed flag yet.
export const unprocessedInbound = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_type", (q) => q.eq("type", "email_inbound"))
      .order("asc")
      .collect();
    const pending = events
      .filter((e) => !(e.meta && (e.meta as any).processed))
      .slice(0, Math.max(1, Math.min(limit ?? 25, 50)));

    const out = [];
    for (const e of pending) {
      const user = e.userId ? await ctx.db.get(e.userId) : null;
      let job = null;
      let latestJob = null;
      if (user) {
        const jobs = await ctx.db
          .query("jobs")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();
        // `job`: latest job that actually has a video to revise (the delivered-revision
        // target — kept exactly as before so an un-restarted worker behaves the same).
        const withVideo = jobs
          .filter((j) => !!j.videoUrl)
          .sort((a, b) => b.updatedAt - a.updatedAt);
        const j = withVideo[0];
        if (j) {
          job = {
            jobId: j._id,
            tier: j.tier,
            productName: j.productName,
            oneLiner: j.oneLiner,
            url: j.url ?? null,
            status: j.status,
            videoUrl: j.videoUrl ?? null,
            posterUrl: j.posterUrl ?? null,
            revisionCount: j.revisionCount ?? 0,
          };
        }
        // `latestJob`: the sender's newest job of ANY status — powers stage-aware
        // routing (awaiting_info reply / pre-delivery storyline tweak). Additive;
        // includes the stored brief so feedback.py can fold a reply into it.
        const newest = [...jobs].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (newest) {
          latestJob = {
            jobId: newest._id,
            tier: newest.tier,
            productName: newest.productName,
            oneLiner: newest.oneLiner,
            url: newest.url ?? null,
            status: newest.status,
            videoUrl: newest.videoUrl ?? null,
            posterUrl: newest.posterUrl ?? null,
            revisionCount: newest.revisionCount ?? 0,
            brief: newest.brief ?? null,
          };
        }
      }
      out.push({
        eventId: e._id,
        email: user?.email ?? null,
        subject: (e.meta as any)?.subject ?? "",
        text: (e.meta as any)?.text ?? "",
        attachmentUrls: (e.meta as any)?.attachmentUrls ?? [],
        createdAt: e.createdAt,
        job,
        latestJob,
      });
    }
    return out;
  },
});

// Mark an inbound email event handled, recording how it was resolved (revised |
// no_job | escalated_human | failed). Idempotent: acking twice is harmless.
export const markInboundProcessed = mutation({
  args: { eventId: v.id("events"), resolution: v.string() },
  handler: async (ctx, { eventId, resolution }) => {
    const e = await ctx.db.get(eventId);
    if (!e) return { ok: false, error: "event not found" };
    const meta = {
      ...((e.meta as any) ?? {}),
      processed: true,
      resolution: String(resolution).slice(0, 120),
      processedAt: Date.now(),
    };
    await ctx.db.patch(eventId, { meta });
    return { ok: true };
  },
});

// Apply the one allowed revision: bump revisionCount, swap in the recut's
// videoUrl/posterUrl, and re-deliver. Guarded at the DB level — if a revision
// was already applied (revisionCount >= 1) this refuses, so a double-processed
// inbound can never produce a second recut (belt-and-suspenders with the
// worker's single-flight + feedback.py's revisionCount check).
export const applyRevision = mutation({
  args: {
    jobId: v.id("jobs"),
    videoUrl: v.string(),
    posterUrl: v.string(),
  },
  handler: async (ctx, { jobId, videoUrl, posterUrl }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return { ok: false, error: "job not found" };
    if ((job.revisionCount ?? 0) >= 1)
      return { ok: false, error: "already revised", revisionCount: job.revisionCount };
    const revisionCount = (job.revisionCount ?? 0) + 1;
    await ctx.db.patch(jobId, {
      revisionCount,
      videoUrl,
      posterUrl,
      status: "delivered",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      type: "revision_applied",
      ...(job.userId ? { userId: job.userId } : {}),
      jobId,
      meta: { revisionCount },
      createdAt: Date.now(),
    });
    return { ok: true, revisionCount };
  },
});

// Resume a job that was parked at awaiting_info: the customer answered our
// clarifying questions, feedback.py folded the reply into the brief, and now the
// job re-enters the queue. Guarded to awaiting_info so a duplicate/raced inbound
// can't bounce a job that already moved on. NOT a revision (revisionCount untouched).
export const resumeFromInfo = mutation({
  args: { jobId: v.id("jobs"), brief: v.any() },
  handler: async (ctx, { jobId, brief }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return { ok: false, error: "job not found" };
    if (job.status !== "awaiting_info")
      return { ok: false, error: "not awaiting_info", status: job.status };
    const patch: Record<string, unknown> = {
      brief,
      status: "queued",
      updatedAt: Date.now(),
    };
    // Backfill name/one-liner from the folded brief if the order never had them
    // (same rule as attachBrief) so the dashboard/TV show the real product.
    if (!job.oneLiner) {
      if (typeof brief?.productName === "string" && brief.productName.trim())
        patch.productName = String(brief.productName).slice(0, 100);
      if (typeof brief?.oneLiner === "string" && brief.oneLiner.trim())
        patch.oneLiner = String(brief.oneLiner).slice(0, 200);
    }
    await ctx.db.patch(jobId, patch);
    await ctx.db.insert("events", {
      type: "info_received",
      ...(job.userId ? { userId: job.userId } : {}),
      jobId,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

// Pre-delivery feedback: the customer reacted to the storyline preview before the
// trailer was delivered. Append their note to brief.feedbackNotes and re-queue so
// the next pass re-runs the storyboard WITH the note. Guarded to the pre-delivery
// statuses; does NOT bump revisionCount (only post-delivery recuts count as the one
// free revision). Idempotent-ish: a job already back in queued/research is left alone.
export const requeueForFeedback = mutation({
  args: { jobId: v.id("jobs"), feedback: v.string() },
  handler: async (ctx, { jobId, feedback }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return { ok: false, error: "job not found" };
    const preDelivery = ["storyboard", "voiceover", "rendering", "awaiting_approval"];
    if (!preDelivery.includes(job.status))
      return { ok: false, error: "not pre-delivery", status: job.status };
    const note = String(feedback).slice(0, 2000).trim();
    const prevBrief = (job.brief as any) ?? {};
    const prevNotes: string[] = Array.isArray(prevBrief.feedbackNotes)
      ? prevBrief.feedbackNotes
      : prevBrief.feedbackNotes
        ? [String(prevBrief.feedbackNotes)]
        : [];
    const feedbackNotes = note ? [...prevNotes, note].slice(-8) : prevNotes;
    await ctx.db.patch(jobId, {
      brief: { ...prevBrief, feedbackNotes },
      status: "queued",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      type: "feedback_requeued",
      ...(job.userId ? { userId: job.userId } : {}),
      jobId,
      meta: { note: note.slice(0, 200) },
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

// Public job status for the live dashboard (jobId is unguessable).
export const jobStatus = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const j = await ctx.db.get(jobId);
    if (!j) return null;
    return {
      status: j.status,
      productName: j.productName,
      tier: j.tier,
      videoUrl: j.videoUrl ?? null,
      posterUrl: j.posterUrl ?? null,
      updatedAt: j.updatedAt,
    };
  },
});

// Worker/operator lookup: full job + owner email, for the approval step
// (approve.py needs the customer's email to send the `delivered` message).
// Guarded at the HTTP layer (/api/worker/job, X-Worker-Key) — never exposed to
// the public landing page. Returns null for an unknown job; email is null for a
// seeded/unclaimed job (no owner yet).
export const jobForWorker = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const j = await ctx.db.get(jobId);
    if (!j) return null;
    const email = j.userId ? (await ctx.db.get(j.userId))?.email ?? null : null;
    return {
      jobId: j._id,
      email,
      status: j.status,
      tier: j.tier,
      productName: j.productName,
      oneLiner: j.oneLiner,
      url: j.url ?? null,
      videoUrl: j.videoUrl ?? null,
      posterUrl: j.posterUrl ?? null,
      revisionCount: j.revisionCount ?? 0,
      updatedAt: j.updatedAt,
    };
  },
});

// Buildathon TV: delivered jobs, newest first.
export const delivered = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "delivered"))
      .order("desc")
      .take(50);
    return jobs.map((j) => ({
      _id: j._id,
      productName: j.productName,
      oneLiner: j.oneLiner,
      tier: j.tier,
      videoUrl: j.videoUrl,
      posterUrl: j.posterUrl,
    }));
  },
});

// Live proof-minute numbers straight from the DB — never claim a number this can't show.
export const scoreboard = query({
  args: {},
  handler: async (ctx) => {
    const [users, jobs, payments, events] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("jobs").collect(),
      ctx.db.query("payments").collect(),
      ctx.db.query("events").collect(),
    ]);
    return {
      signups: users.length,
      firstUses: events.filter((e) => e.type === "first_use_started").length,
      jobsDelivered: jobs.filter((j) => j.status === "delivered").length,
      paymentsCount: payments.length,
      revenueInr: payments.reduce((s, p) => s + p.amountInr, 0),
    };
  },
});
