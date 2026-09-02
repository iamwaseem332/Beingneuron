import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LogoMark, IconEye, IconEyeOff, IconCheck } from "../icons";
import { useAuth } from "./AuthContext";
import { sanitizeNext } from "./RequireAuth";

/* ---------- shared shell (Phase 1 design, preserved) ---------- */

export function AuthShell({
  kicker,
  title,
  sub,
  children,
  footerNote,
}: {
  kicker: string;
  title: ReactNode;
  sub: ReactNode;
  children: ReactNode;
  footerNote: ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-2">
      {/* brand panel */}
      <aside className="relative hidden overflow-hidden bg-ink-950 text-paper lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-grid-dark absolute inset-0" />
        <div className="absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.16),transparent_62%)]" />

        <svg viewBox="0 0 400 300" className="absolute -right-10 top-1/3 w-[420px] opacity-50" aria-hidden>
          {[
            [60, 60, 150, 30],
            [150, 30, 250, 90],
            [150, 30, 180, 160],
            [60, 60, 180, 160],
            [250, 90, 330, 170],
            [180, 160, 290, 240],
            [330, 170, 290, 240],
          ].map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(124,228,208,0.25)" strokeWidth="1" />
          ))}
          {[
            [60, 60, 7],
            [150, 30, 5],
            [250, 90, 6],
            [180, 160, 8],
            [330, 170, 5],
            [290, 240, 6],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="none" stroke="var(--color-pulse-400)" strokeWidth="1.2" />
          ))}
          <circle cx="180" cy="160" r="3.4" fill="var(--color-pulse-300)" className="anim-breathe" />
        </svg>

        <div className="relative">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark className="text-pulse-400" />
            <span className="font-display text-lg font-medium tracking-tight">
              Being<span className="font-bold">Neuron</span>
            </span>
          </Link>
        </div>

        <div className="relative max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-pulse-300">{kicker}</p>
          <h2 className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-tight">
            Research is a graph.
            <br />
            Learning is a <span className="text-pulse-300">loop</span>.
          </h2>
          <div className="mt-8 rounded-lg border border-paper/12 bg-ink-900/80 p-4 font-mono text-[11px] leading-[1.9] tracking-wide text-paper/55">
            <p>
              <span className="text-pulse-300">$</span> beingneuron status
            </p>
            <p>▸ synapse.engine ······ standby (phase 4)</p>
            <p>▸ neurosurgery.lab ··· standby (phase 4)</p>
            <p>
              ▸ auth.service ········ <span className="text-pulse-300">online</span>{" "}
              <span className="anim-blink text-pulse-300">▍</span>
            </p>
          </div>
        </div>

        <p className="relative font-mono text-[10.5px] tracking-wide text-paper/35">
          © 2026 BeingNeuron — phase 02 accounts
        </p>
      </aside>

      {/* form panel */}
      <section className="flex items-center justify-center px-5 py-24 sm:px-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-10 flex items-center gap-2.5 text-ink-900 lg:hidden">
            <LogoMark className="text-pulse-500" />
            <span className="font-display text-lg font-medium tracking-tight">
              Being<span className="font-bold">Neuron</span>
            </span>
          </Link>
          <h1 className="font-display text-[2rem] font-bold tracking-tight text-ink-900">{title}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-600">{sub}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 border-t border-ink-900/10 pt-6 text-[13.5px] text-ink-500">
            {footerNote}
          </div>
        </div>
      </section>
    </main>
  );
}

/* ---------- shared primitives ---------- */

export function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-400">{label}</span>
      <div className="mt-2">{children}</div>
      {error ? (
        <span role="alert" className="mt-1.5 block font-mono text-[10.5px] tracking-wide text-signal-600">
          ! {error}
        </span>
      ) : null}
      {!error && hint ? <span className="mt-1.5 block text-[12px] text-ink-400">{hint}</span> : null}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-ink-900/15 bg-paper-card px-4 py-3 text-[14.5px] text-ink-900 placeholder:text-ink-300 outline-none transition-all duration-300 focus:border-pulse-500 focus:ring-2 focus:ring-pulse-400/25 disabled:cursor-not-allowed disabled:opacity-60";

export function FormError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="drop-in rounded-lg border border-signal-500/40 bg-signal-300/15 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal-600">Couldn't continue</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-700">{children}</p>
    </div>
  );
}

export function FormSuccess({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="status" className="drop-in rounded-lg border border-pulse-500/40 bg-pulse-100/60 p-4">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-pulse-700">
        <IconCheck size={12} /> {title}
      </p>
      <div className="mt-1.5 text-[13px] leading-relaxed text-ink-700">{children}</div>
    </div>
  );
}

export function DemoNotice() {
  const { mode } = useAuth();
  if (mode !== "demo") return null;
  return (
    <p className="rounded-lg border border-ink-900/12 bg-paper-deep p-3 font-mono text-[10.5px] leading-relaxed tracking-wide text-ink-500">
      <span className="uppercase tracking-[0.18em] text-signal-600">demo mode</span> — no Supabase
      keys configured, so accounts are stored only in this browser. Set{" "}
      <span className="text-pulse-700">VITE_SUPABASE_URL</span> +{" "}
      <span className="text-pulse-700">VITE_SUPABASE_ANON_KEY</span> for real auth.
    </p>
  );
}

function SubmitButton({ loading, children }: { loading: boolean; children: ReactNode }) {
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

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pr-12`}
        autoComplete={autoComplete}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 transition-colors hover:text-ink-900"
        aria-label={show ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
      </button>
    </div>
  );
}

/* ---------- validation helpers ---------- */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function passwordChecks(pw: string) {
  return [
    { label: "At least 8 characters", ok: pw.length >= 8 },
    { label: "One number", ok: /\d/.test(pw) },
    { label: "One letter", ok: /[a-zA-Z]/.test(pw) },
  ];
}

/* ---------- Login ---------- */

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const destination = sanitizeNext(params.get("next")) ?? "/dashboard";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return; // prevent double submission
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email)) next.email = "enter a valid email address";
    if (!password) next.password = "enter your password";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (result.status === "signed_in") {
      navigate(destination, { replace: true });
    } else if (result.status === "error") {
      setFormError(result.message);
    } else {
      setFormError("Unexpected response from the auth service. Please try again.");
    }
  };
  return (
    <AuthShell
      kicker="Login · secure session"
      title="Welcome back to the lab."
      sub="Sign in to reach your dashboard, saved research, and workspace."
      footerNote={
        <>
          No account yet?{" "}
          <Link to={`/signup${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`} className="link-line font-semibold text-pulse-700">
            Create one
          </Link>{" "}
          ·{" "}
          <Link to="/" className="link-line text-ink-600 hover:text-ink-900">
            Back to home
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <DemoNotice />
        {params.get("next") && (
          <p className="rounded-lg border border-pulse-500/30 bg-pulse-100/50 p-3 font-mono text-[10.5px] tracking-wide text-pulse-700">
            ▸ log in to continue to <span className="font-semibold">{destination}</span>
          </p>
        )}
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <Field label="Email" error={errors.email}>
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
          <Field label="Password" error={errors.password}>
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={loading}
            />
          </Field>
          <div className="flex items-center justify-end">
            <Link to="/forgot-password" className="link-line text-[13px] text-ink-500 hover:text-ink-900">
              Forgot password?
            </Link>
          </div>
          {formError && <FormError>{formError}</FormError>}
          <SubmitButton loading={loading}>Continue</SubmitButton>
        </form>
      </div>
    </AuthShell>
  );
}

/* ---------- Signup ---------- */

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);

  const destination = sanitizeNext(params.get("next")) ?? "/dashboard";
  const checks = passwordChecks(password);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const next: typeof errors = {};
    if (fullName.trim().length < 2) next.fullName = "tell us what to call you";
    if (!EMAIL_RE.test(email)) next.email = "enter a valid email address";
    if (!checks.every((c) => c.ok)) next.password = "password doesn't meet the requirements yet";
    if (confirm !== password || !confirm) next.confirm = "passwords don't match";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    const result = await signUp({ fullName: fullName.trim(), email: email.trim(), password });
    setLoading(false);

    if (result.status === "signed_in") {
      navigate(destination, { replace: true });
    } else if (result.status === "verify_email") {
      setVerifyEmail(result.email);
    } else {
      setFormError(result.message);
    }
  };

  if (verifyEmail) {
    return (
      <AuthShell
        kicker="Signup · verification"
        title="Check your inbox."
        sub={
          <>
            We sent a confirmation link to <strong className="text-ink-900">{verifyEmail}</strong>.
            Verify your address, then log in to open your workspace.
          </>
        }
        footerNote={
          <>
            Already confirmed?{" "}
            <Link to="/login" className="link-line font-semibold text-pulse-700">
              Log in
            </Link>{" "}
            ·{" "}
            <Link to="/" className="link-line text-ink-600 hover:text-ink-900">
              Back to home
            </Link>
          </>
        }
      >
        <div className="space-y-5">
          <FormSuccess title="Verification sent">
            The link stays valid for a while — if it expires, request a fresh login and we'll
            resend it. (If email confirmation is disabled on the Supabase project, you would have
            been signed straight in.)
          </FormSuccess>
          <Link
            to="/login"
            className="group flex w-full items-center justify-center gap-2.5 rounded-full border border-ink-900/25 py-3.5 font-display text-[15px] font-semibold text-ink-900 transition-all duration-300 hover:border-ink-900 hover:bg-ink-900 hover:text-paper"
          >
            Go to login
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      kicker="Signup · create workspace"
      title="Claim your workspace."
      sub="One account for both instruments — Synapse for research, NeuroSurgery for models."
      footerNote={
        <>
          Already exploring?{" "}
          <Link to={`/login${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`} className="link-line font-semibold text-pulse-700">
            Login
          </Link>{" "}
          ·{" "}
          <Link to="/" className="link-line text-ink-600 hover:text-ink-900">
            Back to home
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <DemoNotice />
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <Field label="Full name" error={errors.fullName}>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ada Lovelace"
              className={inputCls}
              autoComplete="name"
              disabled={loading}
            />
          </Field>
          <Field label="Email" error={errors.email}>
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
          <Field label="Password" error={errors.password}>
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder="min. 8 characters"
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
          <Field label="Confirm password" error={errors.confirm}>
            <PasswordInput
              value={confirm}
              onChange={setConfirm}
              placeholder="repeat password"
              autoComplete="new-password"
              disabled={loading}
            />
          </Field>
          {formError && <FormError>{formError}</FormError>}
          <SubmitButton loading={loading}>Create account</SubmitButton>
          <p className="text-center text-[12px] leading-relaxed text-ink-400">
            By continuing you accept the provisional{" "}
            <Link to="/terms" className="text-pulse-700 underline decoration-pulse-500/40 underline-offset-2">terms</Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-pulse-700 underline decoration-pulse-500/40 underline-offset-2">privacy notes</Link>.
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
