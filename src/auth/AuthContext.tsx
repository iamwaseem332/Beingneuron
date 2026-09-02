import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthAdapter, AuthMode, AuthResult, Profile, ProfilePatch, SessionUser } from "./authTypes";
import { SupabaseAdapter, isSupabaseConfigured } from "./supabaseClient";
import { DemoAdapter } from "./demoAuth";

type AuthContextValue = {
  mode: AuthMode;
  user: SessionUser | null;
  profile: Profile | null;
  /** True while the persisted session is being restored on boot. */
  initializing: boolean;
  profileLoading: boolean;
  signUp: (input: { fullName: string; email: string; password: string }) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (input: { email?: string; newPassword: string }) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<Profile>;
  /** Permanently delete the account and all its data (Phase 15). */
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const adapter = useMemo<AuthAdapter>(
    () => (isSupabaseConfigured ? new SupabaseAdapter() : new DemoAdapter()),
    [],
  );

  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const userRef = useRef<SessionUser | null>(null);
  userRef.current = user;

  /* boot: restore persisted session + subscribe to changes */
  useEffect(() => {
    let active = true;
    adapter
      .getSession()
      .then((session) => {
        if (active) setUser(session);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setInitializing(false);
      });
    const unsubscribe = adapter.onAuthChange((next) => {
      if (active) setUser(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [adapter]);

  /* load (or lazily provision) the profile for the signed-in user */
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    let active = true;
    setProfileLoading(true);
    (async () => {
      let p = await adapter.getProfile(user.id).catch(() => null);
      if (!p) {
        // covers first-login races and providers where the trigger didn't run
        p = await adapter.ensureProfile(user).catch(() => ({
          id: user.id,
          full_name: "",
          email: user.email,
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
      }
      if (active) {
        setProfile(p);
        setProfileLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [adapter, user?.id, user?.email]);

  const signUp: AuthContextValue["signUp"] = useCallback(
    async (input) => {
      const result = await adapter.signUp(input);
      // set the session eagerly so guards never bounce a fresh login
      if (result.status === "signed_in") setUser(result.user);
      return result;
    },
    [adapter],
  );
  const signIn: AuthContextValue["signIn"] = useCallback(
    async (email, password) => {
      const result = await adapter.signIn(email, password);
      if (result.status === "signed_in") setUser(result.user);
      return result;
    },
    [adapter],
  );
  const signOut = useCallback(async () => {
    await adapter.signOut().catch(() => undefined);
    setUser(null);
    setProfile(null);
  }, [adapter]);
  const requestPasswordReset = useCallback(
    (email: string) => adapter.requestPasswordReset(email),
    [adapter],
  );
  const completePasswordReset = useCallback(
    (input: { email?: string; newPassword: string }) => adapter.completePasswordReset(input),
    [adapter],
  );
  const changePassword = useCallback(
    (newPassword: string) => adapter.changePassword(newPassword),
    [adapter],
  );
  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      const current = userRef.current;
      if (!current) throw new Error("Your session has expired. Please log in again.");
      const next = await adapter.updateProfile(current.id, patch);
      setProfile(next);
      return next;
    },
    [adapter],
  );
  const deleteAccount = useCallback(async () => {
    const current = userRef.current;
    if (!current) throw new Error("Your session has expired. Please log in again.");
    await adapter.deleteAccount(current.id);
    setUser(null);
    setProfile(null);
  }, [adapter]);

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: adapter.mode,
      user,
      profile,
      initializing,
      profileLoading,
      signUp,
      signIn,
      signOut,
      requestPasswordReset,
      completePasswordReset,
      changePassword,
      updateProfile,
      deleteAccount,
    }),
    [
      adapter.mode,
      user,
      profile,
      initializing,
      profileLoading,
      signUp,
      signIn,
      signOut,
      requestPasswordReset,
      completePasswordReset,
      changePassword,
      updateProfile,
      deleteAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
