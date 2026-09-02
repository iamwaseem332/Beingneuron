/**
 * Phase 15 — account deletion.
 *
 * The caller must present a valid Supabase access token; the function
 * resolves the user from that token (never from a client-supplied id) and
 * then, with the service role, removes every row that belongs to them plus
 * their temporary storage objects, and finally deletes the auth user.
 *
 * A deletion receipt is written first so an interrupted run is never silent.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("CORS_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TABLES = [
  "usage_events",
  "billing_events",
  "account_deletion_requests",
  "nsg_progress",
  "collection_members",
  "research_collections",
  "paper_architectures",
  "knowledge_graphs",
  "document_chunks",
  "extracted_documents",
  "research_analyses",
  "ai_usage_log",
  "paper_jobs",
  "subscriptions",
  "profiles",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: cors });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");

  // resolve the caller from their token — the only identity we trust
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid or expired session." }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // receipt first — if anything below fails, the request row still exists
  await admin.from("account_deletion_requests").insert({ user_id: userId, status: "requested" });

  try {
    // 1) remove temporary intake objects owned by this user
    const { data: objects } = await admin.storage
      .from("paper-intake")
      .list(userId, { limit: 1000 });
    if (objects && objects.length > 0) {
      await admin.storage
        .from("paper-intake")
        .remove(objects.map((o) => `${userId}/${o.name}`))
        .catch(() => undefined);
    }

    // 2) delete every row in user-scoped tables (belt & braces alongside FK cascades)
    for (const table of TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error && !String(error.message).includes("does not exist")) {
        throw new Error(`delete failed on ${table}: ${error.message}`);
      }
    }

    // 3) delete the auth user itself
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw new Error(`auth deletion failed: ${delErr.message}`);

    await admin
      .from("account_deletion_requests")
      .insert({ user_id: userId, status: "completed", detail: "account and data removed" });

    return new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    await admin
      .from("account_deletion_requests")
      .insert({ user_id: userId, status: "failed", detail: String(err).slice(0, 240) })
      .catch(() => undefined);
    return new Response(
      JSON.stringify({ error: "Deletion could not be completed. Support has a receipt to follow up." }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
