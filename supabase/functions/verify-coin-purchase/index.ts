// Verifies a Google Play in-app purchase with Google's Play Developer API and,
// if it is genuine, credits the coins — so a tampered client can neither invent
// a purchase nor decide what one is worth.
//
// Deploy: supabase functions deploy verify-coin-purchase
//
// Secrets (supabase secrets set ...):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   service account with Play Developer access
//   GOOGLE_SERVICE_ACCOUNT_KEY     its PEM private key (\n escapes are handled)
//   ANDROID_PACKAGE_NAME           e.g. com.example.footballtriviabattle
//
// Request:  POST { productId: string, purchaseToken: string }
//           Authorization: Bearer <the player's Supabase JWT>
// Response: 200 { status: "ok" | "already_redeemed", coins: number }
//           200 { status: "pending" }            payment not final; retry later
//           400 { status: "bad_request" }
//           401 { status: "unauthorized" }
//           402 { status: "not_purchased" }      cancelled / refunded / bogus
//           500 { status: "error" }
//
// The client must NOT consume the Play purchase until this returns ok or
// already_redeemed — consuming first would destroy the only proof of payment.
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@6";
import { isWellFormedRequest, verifyPurchase, isNonRevenuePurchase } from "./verify.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SA_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")!;
const SA_KEY = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")!;
const PACKAGE_NAME = Deno.env.get("ANDROID_PACKAGE_NAME")!;

// Same reasoning as login-with-username: the anon key already gates this
// endpoint and no cookies are involved, so a wildcard origin costs nothing.
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

// Google's OAuth token endpoint caps assertions at an hour; cache the access
// token just short of that so a burst of purchases doesn't re-mint one per
// request. Module scope survives across invocations on a warm instance.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function googleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;

  // Supabase secrets store the PEM with literal \n sequences rather than real
  // newlines; importPKCS8 needs the real thing.
  const key = await importPKCS8(SA_KEY.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/androidpublisher",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(SA_EMAIL)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status}`);

  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: now + body.expires_in };
  return body.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ status: "bad_request" }, 405);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // The user comes from the JWT, never from the body: a client that could name
  // its own user_id could credit someone else's account (or be credited from
  // someone else's purchase).
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) {
    return jsonResponse({ status: "unauthorized" }, 401);
  }

  let body: { productId?: unknown; purchaseToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ status: "bad_request" }, 400);
  }

  const { productId, purchaseToken } = body;
  if (!isWellFormedRequest(productId, purchaseToken)) {
    return jsonResponse({ status: "bad_request" }, 400);
  }

  let purchase;
  try {
    const accessToken = await googleAccessToken();
    // The product id in the path is what binds the token to the product: Google
    // rejects a token that was not issued for this exact product, so a client
    // cannot claim a cheap purchase was an expensive pack.
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${encodeURIComponent(PACKAGE_NAME)}/purchases/products/` +
      `${encodeURIComponent(productId as string)}/tokens/` +
      `${encodeURIComponent(purchaseToken as string)}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 404 || res.status === 400) {
      // Unknown token for this product — treat as a forged or mismatched claim.
      return jsonResponse({ status: "not_purchased" }, 402);
    }
    if (!res.ok) {
      console.error("[verify-coin-purchase] play api error", res.status, await res.text());
      return jsonResponse({ status: "error" }, 500);
    }
    purchase = await res.json();
  } catch (err) {
    console.error("[verify-coin-purchase] verification failed", err);
    return jsonResponse({ status: "error" }, 500);
  }

  const verdict = verifyPurchase(purchase);
  if (verdict === "pending") {
    // Not an error: a deferred payment may still complete. The client keeps the
    // purchase unconsumed and retries.
    return jsonResponse({ status: "pending" }, 200);
  }
  if (verdict !== "purchased") {
    return jsonResponse({ status: "not_purchased" }, 402);
  }
  if (isNonRevenuePurchase(purchase)) {
    console.log("[verify-coin-purchase] test/promo grant", { userId, productId });
  }

  // redeem_coin_pack owns the payout amount and the replay guard; it is revoked
  // from anon/authenticated, so this service-role call is the only way in.
  const { data, error } = await admin.rpc("redeem_coin_pack", {
    p_user_id: userId,
    p_product_id: productId,
    p_purchase_token: purchaseToken,
  });
  if (error || data == null) {
    console.error("[verify-coin-purchase] redeem failed", error);
    return jsonResponse({ status: "error" }, 500);
  }

  const result = data as { status: string; coins: number };
  if (result.status !== "ok" && result.status !== "already_redeemed") {
    console.error("[verify-coin-purchase] redeem rejected", result);
    return jsonResponse({ status: "error" }, 500);
  }
  return jsonResponse(result, 200);
});
