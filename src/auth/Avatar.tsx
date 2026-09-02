import type { Profile, SessionUser } from "./authTypes";

function initialsOf(name: string | undefined, email: string | undefined): string {
  const src = (name ?? "").trim() || (email ?? "").trim();
  if (!src) return "?";
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

/** Generated-initials avatar (no storage needed in Phase 2). */
export default function Avatar({
  profile,
  user,
  size = 36,
  className = "",
  ring = false,
}: {
  profile?: Profile | null;
  user?: SessionUser | null;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const url = profile?.avatar_url;
  const initials = initialsOf(profile?.full_name, profile?.email ?? user?.email);

  const base = `inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-display font-semibold ${
    ring ? "ring-2 ring-pulse-400/50 ring-offset-2 ring-offset-ink-950" : ""
  } ${className}`;

  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={base}
        style={{ width: size, height: size, objectFit: "cover" }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${base} bg-pulse-400/15 text-pulse-300`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.38)),
        border: "1px solid rgba(53,196,174,0.45)",
      }}
    >
      {initials}
    </span>
  );
}
