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
    return jsonResponse({ error: "Only an administrator can manage staff accounts." }, 403);
  }

  let payload: {
    fullName?: string;
    email?: string;
    role?: string;
    action?: string;
    targetUserId?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  // Return coach accounts for the admin portal.
  if (payload.action === "list_coaches") {
    const { data: profiles, error: coachesError } = await adminClient
      .from("profiles")
      .select("id, full_name, is_active")
      .eq("role", "coach")
      .order("full_name");

    if (coachesError) return jsonResponse({ error: coachesError.message }, 500);

    const { data: authData, error: usersError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) return jsonResponse({ error: usersError.message }, 500);

    const usersById = new Map((authData.users || []).map((account) => [account.id, account]));
    const accounts = (profiles || []).map((coach) => ({
      id: coach.id,
      full_name: coach.full_name,
      email: usersById.get(coach.id)?.email || "",
      is_active: coach.is_active !== false,
    }));

    return jsonResponse({ success: true, accounts });
  }

  // Deactivate or restore a coach without deleting their account or records.
  if (payload.action === "deactivate_coach" || payload.action === "restore_coach") {
    const targetUserId = String(payload.targetUserId || "");
    if (!targetUserId) return jsonResponse({ error: "A coach account must be selected." }, 400);
    if (targetUserId === callerData.user.id) {
      return jsonResponse({ error: "You cannot deactivate your own administrator account." }, 400);
    }

    const { data: targetProfile, error: targetError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", targetUserId)
      .single();

    if (targetError || targetProfile?.role !== "coach") {
      return jsonResponse({ error: "The selected account is not a coach account." }, 404);
    }

    if (payload.action === "deactivate_coach") {
      const { error: banError } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: "876000h",
      });
      if (banError) return jsonResponse({ error: "Coach sign-in could not be blocked: " + banError.message }, 500);

      const { error: inactiveError } = await adminClient
        .from("profiles")
        .update({ is_active: false })
        .eq("id", targetUserId);

      if (inactiveError) {
        await adminClient.auth.admin.updateUserById(targetUserId, { ban_duration: "none" });
        return jsonResponse({ error: "Coach access could not be updated: " + inactiveError.message }, 500);
      }

      return jsonResponse({ success: true, status: "deactivated" });
    }

    const { error: unbanError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: "none",
    });
    if (unbanError) return jsonResponse({ error: "Coach sign-in could not be restored: " + unbanError.message }, 500);

    const { error: activeError } = await adminClient
      .from("profiles")
      .update({ is_active: true })
      .eq("id", targetUserId);

    if (activeError) {
      await adminClient.auth.admin.updateUserById(targetUserId, { ban_duration: "876000h" });
      return jsonResponse({ error: "Coach access could not be restored: " + activeError.message }, 500);
    }

    return jsonResponse({ success: true, status: "active" });
  }

  // Create a new coach or administrator account.
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
    is_active: true,
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
