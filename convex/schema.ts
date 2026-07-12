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
    userId: v.id("users"),
    tier: v.union(v.literal("teaser"), v.literal("trailer"), v.literal("pack")),
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
    productName: v.string(),
    oneLiner: v.string(),
    url: v.optional(v.string()),
    assetRefs: v.optional(v.array(v.string())), // R2 keys for logo/screenshots
    videoUrl: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_user", ["userId"]),

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
