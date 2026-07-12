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
    if (!productName || !oneLiner) return json({ error: "productName and oneLiner required" }, 400);
    if (!["teaser", "trailer", "pack"].includes(tier)) return json({ error: "invalid tier" }, 400);

    const result = await ctx.runMutation(api.orders.place, {
      email,
      productName: String(productName).slice(0, 100),
      oneLiner: String(oneLiner).slice(0, 200),
      url: url ? String(url).slice(0, 300) : undefined,
      tier,
      source: "landing",
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

export default http;
