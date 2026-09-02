import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { LogoMark } from "../icons";

/**
 * Only internal paths are ever accepted as post-login destinations.
 * Rejects protocol-relative URLs, backslashes, schemes, and anything
 * that doesn't look like a plain app route — no open redirects.
 */
export function sanitizeNext(raw: string | null): string | null {
  if (!raw) return null;
  let v = raw.trim();
  try {
    v = decodeURIComponent(v);
  } catch {
    /* keep raw */
  }
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return null;
  if (v.includes("://") || /[<>"']/.test(v)) return null;
  if (!/^\/[a-zA-Z0-9_\-./?=&% ]*$/.test(v)) return null;
  // never bounce between auth pages
  if (v.startsWith("/login") || v.startsWith("/signup")) return "/dashboard";
  return v;
}

/** Full-screen session restore state — prevents protected-page flicker. */
export function AuthGate({ label = "Restoring session" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950">
      <div className="flex flex-col items-center gap-5 text-paper/60">
        <LogoMark className="anim-breathe text-pulse-400" size={40} />
        <div className="spinner" />
        <p className="font-mono text-[10.5px] uppercase tracking-[0.24em]">
          {label}
          <span className="anim-blink ml-1 text-pulse-300">▍</span>
        </p>
      </div>
    </div>
  );
}

/** Wraps protected routes: waits for the session check, then gates. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <AuthGate />;

  if (!user) {
    const next = sanitizeNext(location.pathname + location.search);
    return (
      <Navigate
        to={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
        replace
      />
    );
  }
  return <>{children}</>;
}

/** Keeps signed-in users out of login/signup (returns them to their target). */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();

  if (initializing) return <AuthGate label="Checking session" />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
