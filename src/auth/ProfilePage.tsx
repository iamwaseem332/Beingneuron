import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import Avatar from "./Avatar";
import { Reveal, Eyebrow } from "../ui";
import { FormError, FormSuccess, inputCls } from "./AuthPages";
import { IconMail } from "../icons";

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "—";
  }
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-ink-900/[0.07] py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-400">{label}</span>
      <span className="text-[14px] text-ink-800">{children}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { user, profile, profileLoading, updateProfile } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  useEffect(() => {
    setName(profile?.full_name ?? "");
  }, [profile?.full_name]);

  const dirty = name.trim() !== (profile?.full_name ?? "");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (name.trim().length < 2) {
      setFieldError("your name needs at least 2 characters");
      return;
    }
    setFieldError(undefined);
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ full_name: name });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (profileLoading || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper pt-24">
        <div className="flex items-center gap-4 text-ink-500">
          <span className="spinner" style={{ borderTopColor: "var(--color-pulse-500)", borderColor: "rgba(11,26,38,0.15)" }} />
          <p className="font-mono text-[11px] uppercase tracking-[0.2em]">loading profile…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-paper pb-24 pt-28 lg:pt-32">
      <div className="bg-grid-light absolute inset-x-0 top-0 h-[360px] opacity-60" />
      <div className="relative mx-auto max-w-3xl px-5 sm:px-8">
        <Reveal>
          <div className="flex items-end justify-between gap-4">
            <div>
              <Eyebrow className="text-pulse-600">Account · profile</Eyebrow>
              <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                Your identity.
              </h1>
            </div>
            <Link to="/dashboard" className="link-line shrink-0 font-mono text-[11px] tracking-wide text-pulse-700">
              ← dashboard
            </Link>
          </div>
        </Reveal>

        {/* identity card */}
        <Reveal delay={120}>
          <div className="mt-10 overflow-hidden rounded-xl border border-ink-800 bg-ink-950 text-paper">
            <div className="bg-grid-dark flex flex-col items-start gap-6 p-8 sm:flex-row sm:items-center">
              <Avatar profile={profile} user={user} size={84} ring />
              <div className="min-w-0">
                <p className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  {profile.full_name || "Unnamed researcher"}
                </p>
                <p className="mt-1.5 flex items-center gap-2 font-mono text-[12px] tracking-wide text-paper/55">
                  <IconMail size={14} className="text-pulse-300" />
                  <span className="truncate">{profile.email || user?.email}</span>
                </p>
                <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-paper/15 px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-paper/55">
                  <span className="ping-dot inline-block h-1.5 w-1.5 rounded-full bg-pulse-400" />
                  member since {formatDate(profile.created_at)}
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          {/* edit name */}
          <Reveal delay={180} className="lg:col-span-3">
            <div className="h-full rounded-xl border border-ink-900/12 bg-paper-card p-7">
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink-900">Display name</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
                Shown on your profile and workspace. Avatars are generated from your initials —
                upload support arrives later.
              </p>
              <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
                <label className="block">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-400">Full name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`${inputCls} mt-2`}
                    placeholder="Ada Lovelace"
                    maxLength={120}
                    disabled={saving}
                  />
                  {fieldError && (
                    <span className="mt-1.5 block font-mono text-[10.5px] tracking-wide text-signal-600">! {fieldError}</span>
                  )}
                </label>
                {error && <FormError>{error}</FormError>}
                {saved && <FormSuccess title="Saved">Your display name is updated everywhere.</FormSuccess>}
                <button
                  type="submit"
                  disabled={!dirty || saving}
                  className="inline-flex items-center gap-2.5 rounded-full bg-pulse-400 px-6 py-3 font-display text-[14px] font-semibold text-ink-950 transition-all duration-300 hover:bg-pulse-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {saving ? (
                    <>
                      <span className="spinner spinner-sm" /> Saving…
                    </>
                  ) : (
                    "Save changes"
                  )}
                </button>
              </form>
            </div>
          </Reveal>

          {/* account facts */}
          <Reveal delay={240} className="lg:col-span-2">
            <div className="h-full rounded-xl border border-ink-900/12 bg-paper-card p-7">
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink-900">Account facts</h2>
              <div className="mt-2">
                <InfoRow label="Email">
                  <span className="font-mono text-[12.5px]">{profile.email || user?.email}</span>
                  <span className="mt-1 block text-[11.5px] text-ink-400">Email changes arrive in a later phase.</span>
                </InfoRow>
                <InfoRow label="User id">
                  <span className="tnum break-all font-mono text-[11.5px] text-ink-500">{profile.id}</span>
                </InfoRow>
                <InfoRow label="Joined">{formatDate(profile.created_at)}</InfoRow>
                <InfoRow label="Last updated">{formatDate(profile.updated_at)}</InfoRow>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </main>
  );
}
