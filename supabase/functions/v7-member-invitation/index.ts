import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type JsonMap = Record<string, unknown>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const serviceKey = (() => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const bundle = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (bundle) {
    try {
      const parsed = JSON.parse(bundle);
      return parsed.default || Object.values(parsed).find(Boolean);
    } catch { /* fall through */ }
  }
  throw new Error("Service role key is not configured");
})();
const publishableKey = (() => {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  const bundle = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (bundle) {
    try {
      const parsed = JSON.parse(bundle);
      return parsed.default || Object.values(parsed).find(Boolean);
    } catch { /* fall through */ }
  }
  throw new Error("Publishable key is not configured");
})();

const admin = createClient(SUPABASE_URL, String(serviceKey), {
  auth: { persistSession: false, autoRefreshToken: false }
});

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const cleanEmail = (value: unknown) => {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Invalid email address");
  return email;
};

const cleanUuid = (value: unknown, label: string) => {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(400, `Invalid ${label}`);
  return id;
};

const cleanName = (value: unknown, email: string) => {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 160);
  return name || email.split("@")[0];
};

const boundedExpiry = (value: unknown) => {
  const hours = Number(value || 168);
  if (!Number.isFinite(hours) || hours < 1 || hours > 720) throw new HttpError(400, "Invalid invitation expiry");
  return Math.round(hours);
};

const isLocalOrigin = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
const configuredOrigins = new Set([
  ...(Deno.env.get("OPTIMUM_ALLOWED_ORIGINS") || "").split(","),
  Deno.env.get("OPTIMUM_APP_URL") || ""
].map(x => x.trim().replace(/\/$/, "")).filter(Boolean));

const isAllowedOrigin = (origin: string) => isLocalOrigin(origin) || configuredOrigins.has(origin);

function resolveOrigin(req: Request, requested: unknown) {
  const headerOrigin = (req.headers.get("Origin") || "").trim().replace(/\/$/, "");
  const value = String(requested || headerOrigin || [...configuredOrigins][0] || "").trim().replace(/\/$/, "");
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(400, "Invalid application origin"); }
  if (url.origin !== value || (url.protocol !== "https:" && !isLocalOrigin(value))) throw new HttpError(400, "Invalid application origin");
  if (headerOrigin && value !== headerOrigin) throw new HttpError(403, "Redirect origin must match the calling application");
  if (!isAllowedOrigin(value)) {
    if (!configuredOrigins.size && !isLocalOrigin(value)) throw new HttpError(503, "Application origin is not configured");
    throw new HttpError(403, "Application origin is not allowed");
  }
  return value;
}

function corsFor(req: Request) {
  const origin = (req.headers.get("Origin") || "").trim().replace(/\/$/, "");
  const base = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
  if (!origin || !isAllowedOrigin(origin)) return base;
  return { ...base, "Access-Control-Allow-Origin": origin };
}

const reply = (body: unknown, status: number, cors: Record<string, string>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function revokeInvitationToken(token: string) {
  const tokenHash = await sha256Hex(token);
  await admin.from("company_invitations")
    .update({ status: "revoked" })
    .eq("token_hash", tokenHash)
    .eq("status", "pending");
}

async function getCaller(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "Authentication required");
  const token = authorization.slice(7);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Invalid or expired session");
  const client = createClient(SUPABASE_URL, String(publishableKey), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } }
  });
  return { user: data.user, client };
}

async function findAuthUser(email: string) {
  const { data: lookup, error: lookupError } = await admin.rpc("service_find_auth_user_by_email", { p_email: email });
  if (lookupError) throw lookupError;
  if (!lookup?.id) return null;
  const { data, error } = await admin.auth.admin.getUserById(String(lookup.id));
  if (error) throw error;
  return data.user || null;
}

function activationTarget(origin: string, companyToken: string, existing = false) {
  const url = new URL("/v7/invite", origin);
  url.searchParams.set("invite", companyToken);
  if (existing) url.searchParams.set("existing", "1");
  return url.toString();
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  try {
    if (req.method === "OPTIONS") {
      const preflightOrigin = (req.headers.get("Origin") || "").trim().replace(/\/$/, "");
      if (preflightOrigin && !isAllowedOrigin(preflightOrigin)) return new Response("Forbidden origin", { status: 403, headers: cors });
      return new Response("ok", { headers: cors });
    }
    if (req.method !== "POST") return reply({ ok: false, error: "Method not allowed" }, 405, cors);

    const { user: caller, client } = await getCaller(req);
    const body = await req.json() as JsonMap;
    const companyId = cleanUuid(body.company_id, "company id");
    const roleId = cleanUuid(body.role_id, "role id");
    const email = cleanEmail(body.email);
    const fullName = cleanName(body.full_name, email);
    const expiryHours = boundedExpiry(body.expires_in_hours);
    const origin = resolveOrigin(req, body.redirect_origin);

    let companyToken = "";
    try {
      const { data, error } = await client.rpc("create_company_invitation", {
        p_company_id: companyId,
        p_email: email,
        p_role_id: roleId,
        p_expires_in_hours: expiryHours
      });
      if (error) throw error;
      companyToken = String(data || "");
      if (companyToken.length < 32) throw new Error("Company invitation token was not generated");

      const existingUser = await findAuthUser(email);
      if (existingUser?.confirmed_at || existingUser?.email_confirmed_at) {
        return reply({
          ok: true,
          existing_account: true,
          email,
          activation_url: activationTarget(origin, companyToken, true),
          company_invitation_expires_in_hours: expiryHours
        }, 200, cors);
      }

      const redirectTo = activationTarget(origin, companyToken, false);
      const linkType = existingUser ? "magiclink" : "invite";
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: linkType,
        email,
        options: {
          redirectTo,
          data: {
            full_name: fullName,
            preferred_locale: body.locale === "en" ? "en" : "ar",
            timezone: "Africa/Cairo",
            provisioned_source: "v7_invitation"
          }
        }
      } as any);
      if (linkError) throw linkError;
      const actionLink = linkData?.properties?.action_link;
      if (!actionLink) throw new Error("Auth activation link was not generated");

      return reply({
        ok: true,
        existing_account: false,
        resumed_unconfirmed_account: Boolean(existingUser),
        email,
        activation_url: actionLink,
        redirect_to: redirectTo,
        company_invitation_expires_in_hours: expiryHours
      }, 200, cors);
    } catch (error) {
      if (companyToken) await revokeInvitationToken(companyToken).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error("v7-member-invitation", error);
    const message = error instanceof Error ? error.message : "Could not create invitation";
    return reply({ ok: false, error: message }, error instanceof HttpError ? error.status : 400, cors);
  }
});
