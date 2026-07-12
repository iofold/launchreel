import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Single entry point for the landing page: upsert user, create job,
// log signup (new user) + first_use_started (first job) events.
export const place = mutation({
  args: {
    email: v.string(),
    productName: v.string(),
    oneLiner: v.string(),
    url: v.optional(v.string()),
    tier: v.union(v.literal("teaser"), v.literal("trailer"), v.literal("pack")),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const email = args.email.trim().toLowerCase();
    const source = args.source ?? "landing";

    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      const userId = await ctx.db.insert("users", {
        email,
        company: args.productName,
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
      productName: args.productName,
      oneLiner: args.oneLiner,
      url: args.url,
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
      meta: { tier: args.tier },
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
    await ctx.db.insert("events", {
      type: "job_claimed",
      jobId: job._id,
      userId: job.userId,
      meta: { workerId },
      createdAt: Date.now(),
    });
    return {
      jobId: job._id,
      tier: job.tier,
      productName: job.productName,
      oneLiner: job.oneLiner,
      url: job.url,
      assetRefs: job.assetRefs,
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
