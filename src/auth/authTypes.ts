/* Shared auth contracts — both the Supabase and demo adapters implement this. */

export type SessionUser = {
  id: string;
  email: string;
};

export type RetentionPolicy = "purge_after_processing" | "keep_originals";

export type ProfilePatch = {
  full_name?: string;
  avatar_url?: string | null;
  retention_policy?: RetentionPolicy;
};

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  /** Phase 15 — what happens to the original PDF after extraction. */
  retention_policy?: RetentionPolicy | null;
  created_at: string;
  updated_at: string;
};

export type SignUpInput = {
  fullName: string;
  email: string;
  password: string;
};

export type AuthResult =
  | { status: "signed_in"; user: SessionUser }
  | { status: "verify_email"; email: string }
  | { status: "error"; message: string };

export type AuthMode = "supabase" | "demo";

export interface AuthAdapter {
  readonly mode: AuthMode;

  /** Restore the persisted session (called once on boot). */
  getSession(): Promise<SessionUser | null>;

  /** Subscribe to session changes (login, logout, token refresh). */
  onAuthChange(cb: (user: SessionUser | null) => void): () => void;

  signUp(input: SignUpInput): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;

  /** Neutral reset request — never reveals whether the email exists. */
  requestPasswordReset(email: string): Promise<void>;

  /** Finish a reset: Supabase uses the recovery session; demo uses the email. */
  completePasswordReset(input: { email?: string; newPassword: string }): Promise<void>;

  /** Authenticated password change from Settings. */
  changePassword(newPassword: string): Promise<void>;

  getProfile(userId: string): Promise<Profile | null>;

  /** Safe fallback that creates the caller's own profile row (own-id only). */
  ensureProfile(user: SessionUser, fullName?: string): Promise<Profile>;

  updateProfile(userId: string, patch: ProfilePatch): Promise<Profile>;

  /**
   * Permanently delete the account and all associated data (Phase 15).
   * Supabase: invokes the `delete-account` Edge Function (service role).
   * Demo: wipes the browser-local demo stores.
   */
  deleteAccount(userId: string): Promise<void>;
}
