// Runs every Monday morning: asks the background function to re-research stale role maps,
// so study plans keep up with new technology and changing interview formats.
import type { Config } from "@netlify/functions";

export default async () => {
  const site = process.env.URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!site || !key) return new Response("not configured", { status: 500 });
  await fetch(`${site}/.netlify/functions/ai-job-background`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal": key },
    body: JSON.stringify({ refresh: true }),
  });
  return new Response("ok");
};

export const config: Config = { schedule: "0 5 * * 1" };
