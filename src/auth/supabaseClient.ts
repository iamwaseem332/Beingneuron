import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthAdapter, AuthResult, Profile, ProfilePatch, SessionUser } from "./authTypes";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  url && anonKey && /^https:\/\//.test(url) && anonKey.length > 20,
);

/**
 * Client-safe Supabase instance (anon key only).
 * Null when env vars are missing — the app then uses the demo adapter.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null;

/* ---------- human-readable error mapping (never leaks raw server errors) ---------- */

export function friendlyAuthMessage(err: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Check your connection and try again.";
  }
  const raw =
    (err as { message?: string })?.message?.toLowerCase() ??
    (err as { code?: string })?.code?.toLowerCase() ??
    "";

  if (raw.includes("invalid login credentials") || raw.includes("invalid_credentials")) {
    return "Incorrect email or password.";
  }
  if (raw.includes("already registered") || raw.includes("already exists") || raw.includes("email_exists")) {
    return "An account already exists with this email. Try logging in instead.";
  }
  if (raw.includes("weak password") || raw.includes("password should be") || raw.includes("weak_password")) {
    return "That password is too weak — use at least 8 characters with a mix of letters and numbers.";
  }
  if (raw.includes("email not confirmed") || raw.includes("email_not_confirmed")) {
    return "Your email address is not confirmed yet — check your inbox for the verification link.";
  }
  if (raw.includes("rate limit") || raw.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (
    raw.includes("reset token") ||
    raw.includes("expired") ||
    raw.includes("invalid token") ||
    raw.includes("token has expired")
  ) {
    return "That reset link has expired or is invalid. Request a new one below.";
  }
  if (raw.includes("fetch") || raw.includes("network") || raw.includes("failed to fetch")) {
    return "Couldn't reach the authentication service. Check your connection and try again.";
  }
  return "Something went wrong on our side. Please try again in a moment.";
}

/* ---------- Supabase adapter ---------- */

function toSessionUser(user: { id: string; email?: string | null } | null): SessionUser | null {
  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
}

function rowToProfile(row: Record<string, unknown> | null): Profile | null {
  if (!row) return null;
  const retention = row.retention_policy;
  return {
    id: String(row.id),
    full_name: String(row.full_name ?? ""),
    email: String(row.email ?? ""),
    avatar_url: (row.avatar_url as string | null) ?? null,
    retention_policy:
      retention === "keep_originals" || retention === "purge_after_processing" ? retention : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export class SupabaseAdapter implements AuthAdapter {
  readonly mode = "supabase" as const;
  private client = supabase!;

  async getSession(): Promise<SessionUser | null> {
    const { data } = await this.client.auth.getSession();
    return toSessionUser(data.session?.user ?? null);
  }

  onAuthChange(cb: (user: SessionUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      cb(toSessionUser(session?.user ?? null));
    });
    return () => data.subscription.unsubscribe();
  }

  async signUp(input: { fullName: string; email: string; password: string }): Promise<AuthResult> {
    const { data, error } = await this.client.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName },
        emailRedirectTo: `${window.location.origin}${window.location.pathname}#/login`,
      },
    });
    if (error) return { status: "error", message: friendlyAuthMessage(error) };
    // Supabase quirk: signing up an existing email returns a user with no identities.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return {
        status: "error",
        message: "An account already exists with this email. Try logging in instead.",
      };
    }
    if (data.session && data.user) {
      return { status: "signed_in", user: toSessionUser(data.user)! };
    }
    return { status: "verify_email", email: input.email };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) return { status: "error", message: friendlyAuthMessage(error) };
    return { status: "signed_in", user: toSessionUser(data.user)! };
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}#/reset-password`,
    });
    if (error) throw new Error(friendlyAuthMessage(error));
  }

  async completePasswordReset(input: { email?: string; newPassword: string }): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password: input.newPassword });
    if (error) throw new Error(friendlyAuthMessage(error));
  }

  async changePassword(newPassword: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) throw new Error(friendlyAuthMessage(error));
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) return null; // RLS/availability issue — caller falls back to ensureProfile
    return rowToProfile(data as Record<string, unknown> | null);
  }

  async ensureProfile(user: SessionUser, fullName = ""): Promise<Profile> {
    // Safe fallback: the insert/update policies only allow the caller's own id,
    // so this can never touch another user's row.
    await this.client.from("profiles").upsert({
      id: user.id,
      full_name: fullName,
      email: user.email,
    });
    const { data } = await this.client.from("profiles").select("*").eq("id", user.id).maybeSingle();
    return (
      rowToProfile(data as Record<string, unknown> | null) ?? {
        id: user.id,
        full_name: fullName,
        email: user.email,
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );
  }

  async updateProfile(userId: string, patch: ProfilePatch): Promise<Profile> {
    const clean: Record<string, unknown> = {};
    if (patch.full_name !== undefined) clean.full_name = patch.full_name.trim().slice(0, 120);
    if (patch.avatar_url !== undefined) {
      clean.avatar_url = patch.avatar_url && /^https?:\/\//.test(patch.avatar_url) ? patch.avatar_url : null;
    }
    if (patch.retention_policy !== undefined) {
      clean.retention_policy = patch.retention_policy;
    }
    clean.updated_at = new Date().toISOString();

    const { data, error } = await this.client
      .from("profiles")
      .update(clean)
      .eq("id", userId)
      .select()
      .single();
    if (error) throw new Error("Couldn't save your profile. Please try again.");
    return rowToProfile(data as Record<string, unknown>)!;
  }

  async deleteAccount(): Promise<void> {
    // The Edge Function verifies the caller's JWT and removes every row the
    // user owns plus the auth user itself. A deletion receipt is stored even
    // if the run fails, so nothing is ever silently lost.
    const { error } = await this.client.functions.invoke("delete-account", { body: {} });
    if (error) {
      throw new Error("Account deletion couldn't be completed. A receipt was logged for follow-up.");
    }
  }
}
