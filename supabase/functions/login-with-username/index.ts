// Resolves a username to its account email server-side, then performs a
// password grant — so the client never needs a public username->email
// lookup (which would let anyone harvest emails by probing usernames).
// Deploy: supabase functions deploy login-with-username
//
// Request:  POST { username: string, password: string }
// Response: 200 { session: Session } | 401 { error: "invalid_credentials" }
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Browsers preflight every cross-origin POST with an OPTIONS request; without
// these headers on both the preflight and the real response, the browser
// blocks the call before it ever reaches this function (curl/server-to-server
// calls aren't subject to CORS at all, which is why this can look "broken
// only in the browser"). The anon key already gates this endpoint and no
// cookies are involved, so a wildcard origin doesn't weaken anything.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_credentials" }, 401);
  }

  const { username, password } = body;
  if (typeof username !== "string" || typeof password !== "string") {
    return jsonResponse({ error: "invalid_credentials" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  // Always attempt a sign-in (even with a dummy email) so response timing
  // doesn't reveal whether the username exists.
  const { data: userRes } = profile
    ? await admin.auth.admin.getUserById(profile.id)
    : { data: null };
  const email = userRes?.user?.email ?? `nonexistent-${crypto.randomUUID()}@invalid.local`;

  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { data: signInData, error } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !signInData.session) {
    return jsonResponse({ error: "invalid_credentials" }, 401);
  }

  return jsonResponse({ session: signInData.session }, 200);
});
