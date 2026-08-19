// Turns a Play Games Services server auth code into a Supabase session, so an
// Android player gets an account without ever seeing a signup form.
// Deploy: supabase functions deploy pgs-signin
//
// Secrets (supabase secrets set ...):
//   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
//     The **web** OAuth client from the Google Cloud project linked to Play
//     Games Services — not the Android client. The Android client is what the
//     app is signed against; the web client is what redeems the code.
//
// Request:  POST { authCode: string }
// Response: 200 { session: Session } | 401 { error: "pgs_rejected" }
//           | 503 { error: "pgs_unavailable" }
//
// Why the code exchange happens here and not on the device: the auth code is
// only proof of identity once redeemed with the client *secret*, which can
// never ship inside an APK. The device holds nothing that lets it claim to be
// a player it isn't.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  parseAccessToken,
  parsePlayer,
  syntheticEmail,
  usernameCandidates,
} from "./pgs.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const PLAYER_ENDPOINT = "https://games.googleapis.com/games/v1/players/me";

// Same reasoning as login-with-username: the anon key gates the endpoint and
// no cookies are involved, so a wildcard origin costs nothing.
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

/** Four random suffixes, enough retries that a collision run is vanishingly
 * unlikely without making the caller wait on a long probe loop. */
function suffixes(): string[] {
  return Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 10000).toString().padStart(4, "0")
  );
}

async function redeemAuthCode(authCode: string): Promise<string | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: authCode,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  return parseAccessToken(await res.json().catch(() => null));
}

async function fetchPlayer(accessToken: string) {
  const res = await fetch(PLAYER_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return parsePlayer(await res.json().catch(() => null));
}

type Admin = ReturnType<typeof createClient>;

/** First candidate not already taken, or null if every one collided. */
async function pickUsername(admin: Admin, displayName: string): Promise<string | null> {
  for (const candidate of usernameCandidates(displayName, suffixes())) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return null;
}

/**
 * The account for this player, created on first sight. Returns its email —
 * the handle the session is then minted against.
 */
async function ensureUser(
  admin: Admin,
  playerId: string,
  displayName: string,
): Promise<string | null> {
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("pgs_player_id", playerId)
    .maybeSingle();

  if (existing) {
    const { data: userRes } = await admin.auth.admin.getUserById(existing.id as string);
    return userRes?.user?.email ?? null;
  }

  const username = await pickUsername(admin, displayName);
  if (!username) return null;

  const email = syntheticEmail(playerId);
  const { error } = await admin.auth.admin.createUser({
    email,
    // Nothing can ever be delivered to a .invalid address, so leaving this
    // unconfirmed would lock the account out permanently.
    email_confirm: true,
    // Never used: this account signs in by Player ID. It exists because GoTrue
    // wants a credential, and a random one is the safest thing to give it.
    password: crypto.randomUUID(),
    // handle_new_user (0013) reads both of these to build the profiles row.
    user_metadata: { username, pgs_player_id: playerId },
  });

  // A duplicate email means this player already has an account and the
  // profiles lookup above missed it — treat it as a returning player rather
  // than failing the sign-in.
  if (error && !`${error.message}`.toLowerCase().includes("already")) return null;
  return email;
}

/**
 * Mints a session without a password. `generateLink` only *generates* — it
 * sends nothing — so the emailed-link flow becomes a server-side handshake:
 * we take the hashed token straight to verifyOtp and hand the client the
 * resulting session, exactly as login-with-username does.
 */
async function mintSession(admin: Admin, email: string) {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return null;

  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  return error ? null : data.session;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let body: { authCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "pgs_rejected" }, 401);
  }
  if (typeof body.authCode !== "string" || body.authCode.length === 0) {
    return jsonResponse({ error: "pgs_rejected" }, 401);
  }

  const accessToken = await redeemAuthCode(body.authCode);
  if (!accessToken) return jsonResponse({ error: "pgs_rejected" }, 401);

  const player = await fetchPlayer(accessToken);
  if (!player) return jsonResponse({ error: "pgs_rejected" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Past this point the player is authenticated; anything that fails is our
  // side, and the client should keep the sign-in button rather than treat the
  // player as rejected.
  const email = await ensureUser(admin, player.playerId, player.displayName);
  if (!email) return jsonResponse({ error: "pgs_unavailable" }, 503);

  const session = await mintSession(admin, email);
  if (!session) return jsonResponse({ error: "pgs_unavailable" }, 503);

  return jsonResponse({ session }, 200);
});
