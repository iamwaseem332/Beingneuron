import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthShell, Field, inputCls, FormError, FormSuccess, DemoNotice, EMAIL_RE, passwordChecks, } from "./AuthPages";
import { useAuth } from "./AuthContext";
import { supabase } from "./supabaseClient";
import { IconCheck, IconMail } from "../icons";

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="group flex w-full items-center justify-center gap-2.5 rounded-full bg-pulse-400 py-3.5 font-display text-[15px] font-semibold text-ink-950 transition-all duration-300 hover:bg-pulse-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <>
          <span className="spinner spinner-sm" />
          Working…
        </>
      ) : (
        <>
          {children}
          <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
        </>
      )}
    </button>
  );
}

/* ================= FORGOT PASSWORD ================= */

export function ForgotPasswordPage() {
  const { requestPasswordReset, mode } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!EMAIL_RE.test(email)) {
      setFieldError("enter a valid email address");
      return;
    }
    setFieldError(undefined);
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        kicker="Reset · request received"
        title="Check your inbox."
        sub="If an account exists for this email address, you will receive password reset instructions shortly."
        footerNote={
          <>
            Remembered it after all?{" "}
            <Link to="/login" className="link-line font-semibold text-pulse-700">
              Back to login
            </Link>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-lg border border-pulse-500/30 bg-pulse-100/50 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pulse-500/15 text-pulse-600">
              <IconMail size={20} />
            </span>
            <p className="text-[13px] leading-relaxed text-ink-700">
              For security, we don't reveal whether an address has an account. The link expires —
              use it soon.
            </p>
          </div>
          {mode === "demo" && (
            <div className="rounded-lg border border-signal-500/35 bg-signal-300/15 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal-600">Demo mode</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-700">
                No email is actually sent. Simulate the link from your inbox:
              </p>
              <Link
                to={`/reset-password?email=${encodeURIComponent(email.trim())}`}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2 font-display text-[13px] font-semibold text-paper transition-colors hover:bg-ink-700"
              >
                Open demo reset link <span>→</span>
              </Link>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="link-line text-[13px] text-ink-500 hover:text-ink-900"
          >
            Use a different email
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      kicker="Reset · step 1 of 2"
      title="Recover access."
      sub="Enter the email on your account and we'll send instructions to choose a new password."
      footerNote={
        <>
          Remembered it?{" "}
          <Link to="/login" className="link-line font-semibold text-pulse-700">
            Back to login
          </Link>{" "}
          ·{" "}
          <Link to="/" className="link-line text-ink-600 hover:text-ink-900">
            Home
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <DemoNotice />
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <Field label="Email" error={fieldError}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@institution.edu"
              className={inputCls}
              autoComplete="email"
              disabled={loading}
            />
          </Field>
          {error && <FormError>{error}</FormError>}
          <SubmitButton loading={loading}>Send reset instructions</SubmitButton>
        </form>
      </div>
    </AuthShell>
  );
}

/* ================= RESET PASSWORD ================= */

type ResetState = "checking" | "ready" | "invalid";

export function ResetPasswordPage() {
  const { completePasswordReset, mode } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<ResetState>(mode === "demo" ? "ready" : "checking");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  /* Supabase mode: detect the recovery session created by the emailed link. */
  useEffect(() => {
    if (mode !== "demo") {
      let timer: number | undefined;
      let unsub: (() => void) | undefined;
      if (supabase) {
        const { data } = supabase.auth.onAuthStateChange((event) => {
          if (event === "PASSWORD_RECOVERY") setState("ready");
        });
        unsub = () => data.subscription.unsubscribe();
        supabase.auth.getSession().then(({ data }) => {
          const recoveryUser = data.session?.user as unknown as
            | { recovery_sent_at?: string }
            | null;
          if (recoveryUser?.recovery_sent_at) setState("ready");
        });
        timer = window.setTimeout(() => setState((s) => (s === "checking" ? "invalid" : s)), 1800);
      } else {
        setState("invalid");
      }
      return () => {
        unsub?.();
        if (timer) window.clearTimeout(timer);
      };
    }
  }, [mode]);

  const checks = passwordChecks(password);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const next: typeof errors = {};
    if (mode === "demo" && !EMAIL_RE.test(email)) next.email = "enter the account email";
    if (!checks.every((c) => c.ok)) next.password = "password doesn't meet the requirements yet";
    if (confirm !== password || !confirm) next.confirm = "passwords don't match";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      await completePasswordReset({ email: email.trim() || undefined, newPassword: password });
      setDone(true);
      window.setTimeout(() => navigate(mode === "demo" ? "/login" : "/dashboard", { replace: true }), 1600);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't update the password. Request a fresh link.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell
        kicker="Reset · complete"
        title="Password updated."
        sub="Your credentials are fresh — taking you to your workspace now."
        footerNote={
          <Link to="/login" className="link-line font-semibold text-pulse-700">
            Go to login
          </Link>
        }
      >
        <FormSuccess title="Saved">
          <span className="flex items-center gap-2">
            <IconCheck size={14} /> Redirecting…
          </span>
        </FormSuccess>
      </AuthShell>
    );
  }

  if (state === "checking") {
    return (
      <AuthShell
        kicker="Reset · verifying link"
        title="Verifying your reset link…"
        sub="One moment — we're checking that this link is still valid."
        footerNote={<span className="font-mono text-[11px] text-ink-400">auth.verify(token)</span>}
      >
        <div className="flex items-center gap-4 rounded-lg border border-ink-900/10 bg-paper-deep p-5">
          <span className="spinner" style={{ borderTopColor: "var(--color-pulse-500)", borderColor: "rgba(11,26,38,0.15)" }} />
          <p className="font-mono text-[11px] tracking-wide text-ink-500">
            validating recovery session…
          </p>
        </div>
      </AuthShell>
    );
  }

  if (state === "invalid") {
    return (
      <AuthShell
        kicker="Reset · link problem"
        title="This link has expired."
        sub="Reset links are single-use and time-limited. Request a new one and try again — it takes a moment."
        footerNote={
          <Link to="/" className="link-line text-ink-600 hover:text-ink-900">
            Back to home
          </Link>
        }
      >
        <div className="space-y-5">
          <FormError>
            We couldn't find a valid recovery session for this link. Common causes: the link
            expired, was already used, or was opened in a different browser.
          </FormError>
          <Link
            to="/forgot-password"
            className="group flex w-full items-center justify-center gap-2.5 rounded-full bg-pulse-400 py-3.5 font-display text-[15px] font-semibold text-ink-950 transition-all duration-300 hover:bg-pulse-300"
          >
            Request a new link
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      kicker="Reset · step 2 of 2"
      title="Choose a new password."
      sub={
        mode === "demo"
          ? "Demo mode — enter the account email plus the new password."
          : "Link verified. Set a strong password you haven't used here before."
      }
      footerNote={
        <Link to="/login" className="link-line font-semibold text-pulse-700">
          Back to login
        </Link>
      }
    >
      <div className="space-y-5">
        <DemoNotice />
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {mode === "demo" && (
            <Field label="Account email" error={errors.email}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@institution.edu"
                className={inputCls}
                disabled={loading}
              />
            </Field>
          )}
          <Field label="New password" error={errors.password}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min. 8 characters"
              className={inputCls}
              autoComplete="new-password"
              disabled={loading}
            />
            <ul className="mt-2.5 space-y-1">
              {checks.map((c) => (
                <li
                  key={c.label}
                  className={`flex items-center gap-2 font-mono text-[10.5px] tracking-wide transition-colors ${
                    c.ok ? "text-pulse-600" : "text-ink-300"
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                      c.ok ? "border-pulse-500 bg-pulse-500 text-paper-card" : "border-ink-900/20"
                    }`}
                  >
                    {c.ok && <IconCheck size={8} />}
                  </span>
                  {c.label}
                </li>
              ))}
            </ul>
          </Field>
          <Field label="Confirm new password" error={errors.confirm}>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="repeat password"
              className={inputCls}
              autoComplete="new-password"
              disabled={loading}
            />
          </Field>
          {formError && <FormError>{formError}</FormError>}
          <SubmitButton loading={loading}>Update password</SubmitButton>
        </form>
      </div>
    </AuthShell>
  );
}
