
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
    .select("role, is_active")
    .eq("id", callerData.user.id)
    .single();

  if (profileError || callerProfile?.role !== "admin" || callerProfile?.is_active === false) {
    return jsonResponse({ error: "Only an active administrator can manage staff accounts." }, 403);
  }

  let payload: {
    fullName?: string;
    email?: string;
    role?: string;
    action?: string;
    targetUserId?: string;
    parentId?: string;
    playerId?: string;
  };

  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  // PARENT ACCOUNT MANAGEMENT

  if (payload.action === "list_parent_links") {
    const [
      { data: parentProfiles, error: parentsError },
      { data: playerRows, error: playersError },
      { data: linkRows, error: linksError },
      { data: authData, error: authError },
    ] = await Promise.all([
      adminClient.from("profiles").select("id, full_name").eq("role", "parent").order("full_name"),
      adminClient.from("players").select("id, name, age_group").order("name"),
      adminClient.from("parent_players").select("parent_id, player_id"),
      adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (parentsError) return jsonResponse({ error: parentsError.message }, 500);
    if (playersError) return jsonResponse({ error: playersError.message }, 500);
    if (linksError) return jsonResponse({ error: linksError.message }, 500);
    if (authError) return jsonResponse({ error: authError.message }, 500);

    const emailById = new Map((authData.users || []).map((account) => [account.id, account.email || ""]));
    const parents = (parentProfiles || []).map((parent) => ({
      ...parent,
      email: emailById.get(parent.id) || "",
    }));

    const parentById = new Map(parents.map((parent) => [parent.id, parent]));
    const links = (linkRows || []).map((link) => ({
      ...link,
      parent_email: parentById.get(link.parent_id)?.email || "",
    }));

    return jsonResponse({ success: true, parents, players: playerRows || [], links });
  }

  if (payload.action === "link_parent_player") {
    const parentId = String(payload.parentId || "");
    const playerId = String(payload.playerId || "");

    if (!parentId || !playerId) {
      return jsonResponse({ error: "Select a parent account and a player." }, 400);
    }

    const [
      { data: parent, error: parentError },
      { data: player, error: playerError },
    ] = await Promise.all([
      adminClient.from("profiles").select("id, role").eq("id", parentId).maybeSingle(),
      adminClient.from("players").select("id").eq("id", playerId).maybeSingle(),
    ]);

    if (parentError) return jsonResponse({ error: parentError.message }, 500);
    if (playerError) return jsonResponse({ error: playerError.message }, 500);
    if (parent?.role !== "parent") {
      return jsonResponse({ error: "The selected account is not a registered parent." }, 400);
    }
    if (!player) return jsonResponse({ error: "The selected player profile does not exist." }, 404);

    const { data: existing, error: existingError } = await adminClient
      .from("parent_players")
      .select("parent_id")
      .eq("parent_id", parentId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (existingError) return jsonResponse({ error: existingError.message }, 500);
    if (existing) return jsonResponse({ success: true, alreadyLinked: true });

    const { error: insertError } = await adminClient
      .from("parent_players")
      .insert({ parent_id: parentId, player_id: playerId });

    if (insertError) return jsonResponse({ error: insertError.message }, 500);
    return jsonResponse({ success: true, alreadyLinked: false });
  }

  if (payload.action === "unlink_parent_player") {
    const parentId = String(payload.parentId || "");
    const playerId = String(payload.playerId || "");

    if (!parentId || !playerId) {
      return jsonResponse({ error: "A parent account and player must be selected." }, 400);
    }

    const { error: deleteError } = await adminClient
      .from("parent_players")
      .delete()
      .eq("parent_id", parentId)
      .eq("player_id", playerId);

    if (deleteError) return jsonResponse({ error: deleteError.message }, 500);
    return jsonResponse({ success: true });
  }

  // LIST STAFF ACCOUNTS

  if (payload.action === "list_coaches" || payload.action === "list_admins") {
    const role = payload.action === "list_admins" ? "admin" : "coach";

    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, full_name, is_active")
      .eq("role", role)
      .order("full_name");

    if (profilesError) return jsonResponse({ error: profilesError.message }, 500);

    const { data: authData, error: usersError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (usersError) return jsonResponse({ error: usersError.message }, 500);

    const usersById = new Map((authData.users || []).map((account) => [account.id, account]));

    const accounts = (profiles || []).map((profile) => ({
      id: profile.id,
      full_name: profile.full_name,
      email: usersById.get(profile.id)?.email || "",
      is_active: profile.is_active !== false,
    }));

    return jsonResponse({ success: true, accounts });
  }

  // ACTIVATE / DEACTIVATE COACH OR ADMIN

  if (
    payload.action === "deactivate_coach" ||
    payload.action === "restore_coach" ||
    payload.action === "deactivate_admin" ||
    payload.action === "restore_admin"
  ) {
    const targetUserId = String(payload.targetUserId || "");

    if (!targetUserId) {
      return jsonResponse({ error: "Select an account first." }, 400);
    }

    const isAdminAction = payload.action.endsWith("_admin");
    const isDeactivate = payload.action.startsWith("deactivate_");
    const expectedRole = isAdminAction ? "admin" : "coach";

    if (targetUserId === callerData.user.id && isDeactivate) {
      return jsonResponse({ error: "You cannot deactivate your own administrator account." }, 400);
    }

    const { data: targetProfile, error: targetError } = await adminClient
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetError) return jsonResponse({ error: targetError.message }, 500);

    if (!targetProfile || targetProfile.role !== expectedRole) {
      return jsonResponse({ error: "The selected account does not match the requested staff role." }, 404);
    }

    // Prevent removal of the last active administrator.
    if (isAdminAction && isDeactivate && targetProfile.is_active !== false) {
      const { data: admins, error: adminsError } = await adminClient
        .from("profiles")
        .select("id, is_active")
        .eq("role", "admin");

      if (adminsError) return jsonResponse({ error: adminsError.message }, 500);

      const activeAdmins = (admins || []).filter((admin) => admin.is_active !== false);

      if (activeAdmins.length <= 1) {
        return jsonResponse({
          error: "You cannot deactivate the last active administrator. Create or restore another administrator first.",
        }, 400);
      }
    }

    if (isDeactivate) {
      const { error: banError } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: "876000h",
      });

      if (banError) return jsonResponse({ error: banError.message }, 500);

      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ is_active: false })
        .eq("id", targetUserId);

      if (updateError) {
        await adminClient.auth.admin.updateUserById(targetUserId, { ban_duration: "none" });
        return jsonResponse({ error: updateError.message }, 500);
      }

      return jsonResponse({ success: true, status: "deactivated" });
    }

    const { error: unbanError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: "none",
    });

    if (unbanError) return jsonResponse({ error: unbanError.message }, 500);

    const { error: activeError } = await adminClient
      .from("profiles")
      .update({ is_active: true })
      .eq("id", targetUserId);

    if (activeError) {
      await adminClient.auth.admin.updateUserById(targetUserId, { ban_duration: "876000h" });
      return jsonResponse({ error: activeError.message }, 500);
    }

    return jsonResponse({ success: true, status: "active" });
  }

  // CREATE A NEW COACH OR ADMIN ACCOUNT

  const fullName = String(payload.fullName || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const role = String(payload.role || "");

  if (
    !fullName ||
    fullName.length > 100 ||
    !email ||
    email.length > 254 ||
    !/^\S+@\S+\.\S+$/.test(email)
  ) {
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
    return jsonResponse({
      error: createError?.message || "The authentication account could not be created.",
    }, 400);
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
