#!/usr/bin/env bun
/**
 * seed-yc-batch.ts — pre-render the current YC batch (launch stunt B).
 *
 * Pulls the yc-oss static mirror of YC's directory (free, no auth), filters to
 * companies with a website, and seeds LaunchReel jobs via the key-guarded
 * /api/worker/seed endpoint. Seeded jobs create NO user row and NO signup event
 * (orders.seedBatch enforces this) — the scoreboard only counts real claims.
 *
 * Verified live 2026-07-12: summer-2026.json has 92 records, all with a
 * `website`; fields used: name, website, one_liner, small_logo_thumb_url,
 * team_size.
 *
 * Usage:
 *   bun run scripts/seed-yc-batch.ts --dry-run                 # print, seed nothing
 *   bun run scripts/seed-yc-batch.ts --limit 15                # hero set of 15
 *   bun run scripts/seed-yc-batch.ts --all                     # whole batch
 *   bun run scripts/seed-yc-batch.ts --batch spring-2026 --limit 20
 *   bun run scripts/seed-yc-batch.ts --names "baud,retail" --dry-run
 *
 * Flags:
 *   --batch <slug>   yc-oss batch slug (default summer-2026)
 *   --limit <n>      max companies to seed, hero-ordered (default 10)
 *   --all            seed the whole filtered batch (overrides --limit)
 *   --names <csv>    only companies whose name matches one of these substrings
 *   --chunk <n>      companies per POST (default 10)
 *   --dry-run        print the plan, POST nothing, spend nothing
 *
 * Env (from process.env or repo .env/.env.local):
 *   CONVEX_SITE_URL  https://<deployment>.convex.site   (required unless --dry-run)
 *   WORKER_KEY       shared secret matching the Convex deployment env (required unless --dry-run)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));

type Company = {
  name: string;
  website?: string;
  one_liner?: string;
  small_logo_thumb_url?: string;
  team_size?: number | null;
};

function loadEnv(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  for (const f of [".env.local", ".env"]) {
    const p = join(REPO, f);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      if (k !== name) continue;
      return line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const has = (flag: string) => process.argv.includes(flag);

async function main() {
  const batch = arg("--batch", "summer-2026")!;
  const limit = parseInt(arg("--limit", "10")!, 10);
  const chunk = Math.max(1, parseInt(arg("--chunk", "10")!, 10));
  const all = has("--all");
  const dryRun = has("--dry-run");
  const names = (arg("--names", "") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const url = `https://yc-oss.github.io/api/batches/${batch}.json`;
  process.stderr.write(`[seed] fetching ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[seed] batch fetch failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const raw = (await res.json()) as Company[];
  if (!Array.isArray(raw)) {
    console.error("[seed] unexpected payload (not an array)");
    process.exit(1);
  }

  // Filter: must have a website. Optional name filter.
  let companies = raw.filter((c) => typeof c.website === "string" && c.website.trim());
  if (names.length) {
    companies = companies.filter((c) => names.some((n) => c.name?.toLowerCase().includes(n)));
  }

  // Hero-first ordering: most-staffed companies first (the current batch has no
  // `top_company` flags yet), then alphabetical for a stable tie-break.
  companies.sort(
    (a, b) => (b.team_size ?? 0) - (a.team_size ?? 0) || a.name.localeCompare(b.name)
  );

  const picked = all ? companies : companies.slice(0, Math.max(0, limit));
  process.stderr.write(
    `[seed] ${raw.length} in batch, ${companies.length} with website, seeding ${picked.length}` +
      (all ? " (all)" : ` (hero set, limit ${limit})`) +
      (names.length ? ` [names: ${names.join(", ")}]` : "") +
      "\n"
  );

  const mapped = picked.map((c) => ({
    name: c.name,
    website: c.website!.trim(),
    oneLiner: c.one_liner?.trim() || undefined,
    logoUrl: c.small_logo_thumb_url?.trim() || undefined,
  }));

  if (dryRun) {
    console.log(`\nDRY RUN — would seed ${mapped.length} companies from ${batch}:\n`);
    mapped.forEach((c, i) =>
      console.log(
        `${String(i + 1).padStart(3)}. ${c.name.padEnd(24)} ${c.website}\n     ${(
          c.oneLiner ?? "(no one-liner)"
        ).slice(0, 90)}`
      )
    );
    console.log(`\n(no POST sent, no jobs created)`);
    return;
  }

  const site = loadEnv("CONVEX_SITE_URL").replace(/\/$/, "");
  const key = loadEnv("WORKER_KEY");
  if (!site || !key) {
    console.error(
      "[seed] CONVEX_SITE_URL and WORKER_KEY are required to seed (set in env or .env). Use --dry-run to preview without them."
    );
    process.exit(1);
  }

  let seeded = 0;
  for (let i = 0; i < mapped.length; i += chunk) {
    const slice = mapped.slice(i, i + chunk);
    const r = await fetch(`${site}/api/worker/seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Worker-Key": key },
      body: JSON.stringify({ batch, companies: slice }),
    });
    const out = (await r.json().catch(() => ({}))) as { seeded?: number; error?: string };
    if (!r.ok) {
      console.error(`[seed] chunk ${i / chunk + 1} failed: HTTP ${r.status} ${out.error ?? ""}`);
      process.exit(1);
    }
    seeded += out.seeded ?? slice.length;
    process.stderr.write(`[seed] chunk ${i / chunk + 1}: +${out.seeded ?? slice.length} (total ${seeded})\n`);
  }
  console.log(`[seed] done — ${seeded} jobs seeded from ${batch} (source "yc_batch").`);
}

main().catch((e) => {
  console.error("[seed] error:", e?.message ?? e);
  process.exit(1);
});
