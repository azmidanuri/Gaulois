import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function makeTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  // Ensure complexity requirements without using a shared/default password.
  chars[0] = "G";
  chars[1] = "a";
  chars[2] = "7";
  chars[3] = "!";
  return chars.join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "The Supabase function is missing required environment settings." }, 500);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "You must be signed in as an administrator." }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const accessToken = authorization.slice("Bearer ".length);
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(accessToken);
  if (callerError || !callerData.user) {
    return jsonResponse({ error: "Your session is invalid. Please log in again." }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", callerData.user.id)
    .single();

  if (profileError || callerProfile?.role !== "admin") {
    return jsonResponse({ error: "Only an administrator can create staff accounts." }, 403);
  }

  let payload: { fullName?: string; email?: string; role?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const fullName = String(payload.fullName || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const role = String(payload.role || "");

  if (!fullName || fullName.length > 100 || !email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    return jsonResponse({ error: "Enter a valid name and email address." }, 400);
  }
  if (!["admin", "coach"].includes(role)) {
    return jsonResponse({ error: "The selected staff role is not allowed." }, 400);
  }

  const temporaryPassword = makeTemporaryPassword();
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    return jsonResponse({ error: createError?.message || "The authentication account could not be created." }, 400);
  }

  const { error: insertError } = await adminClient.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    role,
    must_change_password: true,
  });

  if (insertError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: "The account profile could not be created: " + insertError.message }, 500);
  }

  return jsonResponse({
    success: true,
    email,
    role,
    temporaryPassword,
  });
});
