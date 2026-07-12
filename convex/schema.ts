import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    company: v.optional(v.string()),
    source: v.string(), // "landing" | "qr_claim" | "telegram"
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  jobs: defineTable({
    // Optional: batch-seeded jobs (source "yc_batch") have no owner until a
    // founder claims them. Patched in on claim.
    userId: v.optional(v.id("users")),
    tier: v.union(v.literal("teaser"), v.literal("trailer"), v.literal("pack")),
    status: v.union(
      v.literal("queued"),
      v.literal("research"),
      // Parked: intake too thin to make a truthful trailer; we emailed the owner
      // clarifying questions and are waiting on their reply (feedback.py re-queues).
      v.literal("awaiting_info"),
      v.literal("storyboard"),
      v.literal("voiceover"),
      v.literal("rendering"),
      v.literal("awaiting_approval"),
      v.literal("delivered"),
      v.literal("failed")
    ),
    productName: v.string(),
    oneLiner: v.string(),
    url: v.optional(v.string()),
    brief: v.optional(v.any()), // Scout's structured strategist brief (brief.json)
    source: v.optional(v.string()), // "landing" | "yc_batch" | ...
    assetRefs: v.optional(v.array(v.string())), // R2 keys for logo/screenshots
    videoUrl: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
    // Autonomous email feedback loop: how many customer-requested revisions have
    // been applied. One is allowed; the next reply escalates to a human.
    revisionCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_user", ["userId"])
    .index("by_source", ["source"]),

  events: defineTable({
    type: v.string(), // "signup" | "first_use_started" | "job_created" | "payment_recorded" | "teaser_claimed" | "shared"
    userId: v.optional(v.id("users")),
    jobId: v.optional(v.id("jobs")),
    meta: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_type", ["type"]),

  payments: defineTable({
    userId: v.id("users"),
    jobId: v.optional(v.id("jobs")),
    amountInr: v.number(),
    method: v.union(v.literal("razorpay"), v.literal("upi_qr")),
    evidence: v.optional(v.string()), // txn id or screenshot ref — mentors verify against this
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});
