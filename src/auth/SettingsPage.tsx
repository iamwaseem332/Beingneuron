import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import Avatar from "./Avatar";
import { Reveal, Eyebrow } from "../ui";
import { FormError, FormSuccess, inputCls, passwordChecks } from "./AuthPages";
import { IconAlert, IconCheck, IconKey, IconLogout, IconShield, IconTrash, IconUser } from "../icons";
import type { RetentionPolicy } from "./authTypes";

const FUTURE_SECTIONS = [
  { name: "Notifications", note: "Digests, analysis alerts, session events" },
  { name: "Billing", note: "Plans and usage — finalized with the engines" },
  { name: "API keys", note: "Programmatic access to your research" },
  { name: "Research preferences", note: "Domains, citation style, defaults" },
];

function SectionCard({
  id,
  icon,
  title,
  desc,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 rounded-xl border border-ink-900/12 bg-paper-card p-7">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-pulse-500/25 bg-pulse-100/70 text-pulse-700">
          {icon}
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{desc}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { user, profile, profileLoading, updateProfile, changePassword, signOut, deleteAccount, mode } = useAuth();
  const navigate = useNavigate();

  /* profile form */
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  /* password form */
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pwFieldErr, setPwFieldErr] = useState<{ pw?: string; pw2?: string }>({});

  const [signingOut, setSigningOut] = useState(false);

  /* data & privacy (Phase 15) */
  const [retention, setRetention] = useState<RetentionPolicy>("purge_after_processing");
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionMsg, setRetentionMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  useEffect(() => {
    setName(profile?.full_name ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
    setRetention(profile?.retention_policy ?? "purge_after_processing");
  }, [profile?.full_name, profile?.avatar_url, profile?.retention_policy]);

  const checks = passwordChecks(pw);
  const profileDirty =
    name.trim() !== (profile?.full_name ?? "") || (avatarUrl.trim() || null) !== (profile?.avatar_url ?? null);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (profileSaving) return;
    if (name.trim().length < 2) {
      setProfileMsg({ kind: "err", text: "Your name needs at least 2 characters." });
      return;
    }
    if (avatarUrl.trim() && !/^https?:\/\//.test(avatarUrl.trim())) {
      setProfileMsg({ kind: "err", text: "Avatar URL must start with http:// or https:// — or leave it empty for initials." });
      return;
    }
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      await updateProfile({ full_name: name, avatar_url: avatarUrl.trim() || null });
      setProfileMsg({ kind: "ok", text: "Profile updated." });
    } catch (err) {
      setProfileMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Couldn't save your profile. Please try again.",
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pwSaving) return;
    const errs: typeof pwFieldErr = {};
    if (!checks.every((c) => c.ok)) errs.pw = "password doesn't meet the requirements yet";
    if (pw2 !== pw || !pw2) errs.pw2 = "passwords don't match";
    setPwFieldErr(errs);
    setPwMsg(null);
    if (Object.keys(errs).length > 0) return;

    setPwSaving(true);
    try {
      await changePassword(pw);
      setPw("");
      setPw2("");
      setPwMsg({ kind: "ok", text: "Password changed. Use it the next time you log in." });
    } catch (err) {
      setPwMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Couldn't change the password. Please try again.",
      });
    } finally {
      setPwSaving(false);
    }
  };

  const onLogout = async () => {
    setSigningOut(true);
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <main className="relative min-h-screen bg-paper pb-24 pt-28 lg:pt-32">
      <div className="bg-grid-light absolute inset-x-0 top-0 h-[360px] opacity-60" />
      <div className="relative mx-auto max-w-5xl px-5 sm:px-8">
        <Reveal>
          <div className="flex items-end justify-between gap-4">
            <div>
              <Eyebrow className="text-pulse-600">Account · settings</Eyebrow>
              <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                Tune the instrument.
              </h1>
            </div>
            <Link to="/dashboard" className="link-line shrink-0 font-mono text-[11px] tracking-wide text-pulse-700">
              ← dashboard
            </Link>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-4">
          {/* section index */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24 space-y-1">
              {[
                ["account", "Account"],
                ["security", "Security"],
                ["session", "Session"],
                ["future", "Coming later"],
              ].map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="block rounded-lg px-3.5 py-2 font-display text-[13.5px] font-semibold text-ink-500 transition-colors hover:bg-paper-card hover:text-ink-900"
                >
                  {label}
                </a>
              ))}
            </div>
          </aside>

          <div className="space-y-6 lg:col-span-3">
            {/* Account */}
            <Reveal delay={100}>
              <SectionCard
                id="account"
                icon={<IconUser size={19} />}
                title="Update profile"
                desc="Your display name and avatar across BeingNeuron."
              >
                <div className="flex items-center gap-4">
                  <Avatar
                    profile={profileLoading ? null : { ...(profile ?? { id: user?.id ?? "", full_name: name, email: user?.email ?? "", avatar_url: avatarUrl || null, created_at: "", updated_at: "" }) }}
                    user={user}
                    size={56}
                  />
                  <p className="font-mono text-[10.5px] leading-relaxed tracking-wide text-ink-400">
                    preview — initials are generated automatically
                    <br />
                    until avatar uploads ship.
                  </p>
                </div>
                <form onSubmit={saveProfile} noValidate className="mt-6 space-y-4">
                  <label className="block">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-400">Full name</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`${inputCls} mt-2`}
                      maxLength={120}
                      disabled={profileSaving || profileLoading}
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-400">
                      Avatar URL <span className="normal-case tracking-normal">(optional)</span>
                    </span>
                    <input
                      type="url"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      className={`${inputCls} mt-2`}
                      placeholder="https://…"
                      disabled={profileSaving || profileLoading}
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-400">Email</span>
                    <input type="text" value={profile?.email || user?.email || ""} className={`${inputCls} mt-2 opacity-60`} readOnly />
                    <span className="mt-1.5 block text-[11.5px] text-ink-400">
                      The login email is fixed in Phase 2 — changing it arrives later.
                    </span>
                  </label>
                  {profileMsg?.kind === "err" && <FormError>{profileMsg.text}</FormError>}
                  {profileMsg?.kind === "ok" && <FormSuccess title="Saved">{profileMsg.text}</FormSuccess>}
                  <button
                    type="submit"
                    disabled={!profileDirty || profileSaving}
                    className="inline-flex items-center gap-2.5 rounded-full bg-pulse-400 px-6 py-3 font-display text-[14px] font-semibold text-ink-950 transition-all duration-300 hover:bg-pulse-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {profileSaving ? (
                      <>
                        <span className="spinner spinner-sm" /> Saving…
                      </>
                    ) : (
                      "Save profile"
                    )}
                  </button>
                </form>
              </SectionCard>
            </Reveal>

            {/* Security */}
            <Reveal delay={160}>
              <SectionCard
                id="security"
                icon={<IconKey size={19} />}
                title="Change password"
                desc="Applies to your next login. This session stays active."
              >
                <form onSubmit={savePassword} noValidate className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-400">New password</span>
                      <input
                        type="password"
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        className={`${inputCls} mt-2`}
                        autoComplete="new-password"
                        disabled={pwSaving}
                      />
                      {pwFieldErr.pw && (
                        <span className="mt-1.5 block font-mono text-[10.5px] tracking-wide text-signal-600">! {pwFieldErr.pw}</span>
                      )}
                    </label>
                    <label className="block">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-400">Confirm</span>
                      <input
                        type="password"
                        value={pw2}
                        onChange={(e) => setPw2(e.target.value)}
                        className={`${inputCls} mt-2`}
                        autoComplete="new-password"
                        disabled={pwSaving}
                      />
                      {pwFieldErr.pw2 && (
                        <span className="mt-1.5 block font-mono text-[10.5px] tracking-wide text-signal-600">! {pwFieldErr.pw2}</span>
                      )}
                    </label>
                  </div>
                  <ul className="flex flex-wrap gap-x-5 gap-y-1">
                    {checks.map((c) => (
                      <li
                        key={c.label}
                        className={`flex items-center gap-1.5 font-mono text-[10.5px] tracking-wide ${c.ok ? "text-pulse-600" : "text-ink-300"}`}
                      >
                        <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${c.ok ? "border-pulse-500 bg-pulse-500 text-paper-card" : "border-ink-900/20"}`}>
                          {c.ok && <IconCheck size={8} />}
                        </span>
                        {c.label}
                      </li>
                    ))}
                  </ul>
                  {pwMsg?.kind === "err" && <FormError>{pwMsg.text}</FormError>}
                  {pwMsg?.kind === "ok" && <FormSuccess title="Password changed">{pwMsg.text}</FormSuccess>}
                  <button
                    type="submit"
                    disabled={pwSaving || !pw}
                    className="inline-flex items-center gap-2.5 rounded-full bg-ink-900 px-6 py-3 font-display text-[14px] font-semibold text-paper transition-all duration-300 hover:bg-ink-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {pwSaving ? (
                      <>
                        <span className="spinner spinner-light spinner-sm" /> Updating…
                      </>
                    ) : (
                      "Update password"
                    )}
                  </button>
                </form>
              </SectionCard>
            </Reveal>

            {/* Session */}
            <Reveal delay={220}>
              <SectionCard
                id="session"
                icon={<IconShield size={19} />}
                title="Session & logout"
                desc="Your session persists across refreshes via secure auth tokens."
              >
                <div className="rounded-lg border border-ink-900/10 bg-paper p-4 font-mono text-[11px] leading-[1.9] tracking-wide text-ink-500">
                  <p>
                    <span className="text-ink-400">provider</span> ··· {mode === "supabase" ? "supabase auth" : "demo · local browser"}
                  </p>
                  <p>
                    <span className="text-ink-400">user id</span> ··· <span className="tnum">{user?.id.slice(0, 18)}…</span>
                  </p>
                  <p>
                    <span className="text-ink-400">status</span> ···· <span className="text-pulse-600">active</span>{" "}
                    <span className="ping-dot ml-1 inline-block h-1.5 w-1.5 rounded-full bg-pulse-400" />
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  disabled={signingOut}
                  className="mt-5 inline-flex items-center gap-2.5 rounded-full border border-signal-500/50 px-6 py-3 font-display text-[14px] font-semibold text-signal-600 transition-all duration-300 hover:bg-signal-400 hover:text-ink-950 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {signingOut ? <span className="spinner spinner-sm" style={{ borderColor: "rgba(217,149,31,0.3)", borderTopColor: "currentColor" }} /> : <IconLogout size={16} />}
                  {signingOut ? "Ending session…" : "Log out"}
                </button>
              </SectionCard>
            </Reveal>

            {/* future sections */}
            <Reveal delay={280}>
              <div id="future" className="scroll-mt-28 rounded-xl border border-dashed border-ink-900/20 bg-paper-deep/60 p-7">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-ink-400">Coming in later phases</p>
                <ul className="mt-4 divide-y divide-ink-900/[0.07]">
                  {FUTURE_SECTIONS.map((s) => (
                    <li key={s.name} className="flex items-center justify-between gap-4 py-3.5">
                      <div>
                        <p className="font-display text-[14.5px] font-semibold text-ink-600">{s.name}</p>
                        <p className="text-[12.5px] text-ink-400">{s.note}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-ink-900/12 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-400">
                        staged
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </main>
  );
}
