import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { NAV_LINKS } from "./content";
import { usePrefersReducedMotion } from "./hooks";
import { useAuth } from "./auth/AuthContext";
import Avatar from "./auth/Avatar";
import { IconMenu, IconX, IconChevron, IconGrid, IconUser, IconSettings, IconLogout, LogoMark } from "./icons";

export function scrollToSection(id: string, smooth: boolean) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
}

export function AccountMenu() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || user?.email?.split("@")[0] || "";

  const onLogout = async () => {
    setOpen(false);
    setBusy(true);
    await signOut(); // ends the real session (Supabase or demo), clears state
    navigate("/", { replace: true });
  };

  const itemCls =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left font-display text-[13.5px] font-medium text-paper/75 transition-colors hover:bg-paper/[0.06] hover:text-paper";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-3.5 transition-all duration-300 ${
          open ? "border-pulse-400/60 bg-paper/[0.06]" : "border-paper/20 hover:border-paper/45"
        }`}
      >
        <Avatar profile={profile} user={user} size={28} />
        {firstName && <span className="hidden max-w-[110px] truncate text-[13px] font-medium text-paper xl:inline">{firstName}</span>}
        <IconChevron size={13} className={`text-paper/50 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="drop-in absolute right-0 top-[calc(100%+10px)] w-60 overflow-hidden rounded-xl border border-paper/12 bg-ink-900/98 p-2 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.8)] backdrop-blur-md">
          <div className="border-b border-paper/10 px-3 pb-3 pt-2">
            <p className="truncate font-display text-[14px] font-semibold text-paper">{profile?.full_name || "Unnamed"}</p>
            <p className="truncate font-mono text-[10.5px] tracking-wide text-paper/45">{user?.email}</p>
          </div>
          <div className="pt-2">
            <Link to="/dashboard" role="menuitem" className={itemCls} onClick={() => setOpen(false)}>
              <IconGrid size={16} className="text-pulse-300" /> Dashboard
            </Link>
            <Link to="/profile" role="menuitem" className={itemCls} onClick={() => setOpen(false)}>
              <IconUser size={16} className="text-pulse-300" /> Profile
            </Link>
            <Link to="/settings" role="menuitem" className={itemCls} onClick={() => setOpen(false)}>
              <IconSettings size={16} className="text-pulse-300" /> Settings
            </Link>
          </div>
          <div className="mt-1 border-t border-paper/10 pt-2">
            <button type="button" role="menuitem" onClick={onLogout} disabled={busy} className={`${itemCls} text-signal-300 hover:text-signal-200 disabled:opacity-50`}>
              {busy ? <span className="spinner spinner-sm spinner-light" /> : <IconLogout size={16} />}
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = usePrefersReducedMotion();
  const { user, profile, signOut } = useAuth();
  const [mobileLogoutBusy, setMobileLogoutBusy] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const goSection = (id: string) => {
    setOpen(false);
    if (location.pathname !== "/") {
      navigate("/", { state: { scrollTo: id } });
    } else {
      scrollToSection(id, !reduced);
    }
  };

  const onMobileLogout = async () => {
    setMobileLogoutBusy(true);
    await signOut();
    setOpen(false);
    navigate("/", { replace: true });
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled || open
          ? "border-b border-paper/10 bg-ink-950/88 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link
          to="/"
          className="group flex items-center gap-2.5 text-paper"
          aria-label="BeingNeuron home"
        >
          <LogoMark className="text-pulse-400 transition-transform duration-500 group-hover:rotate-[18deg]" />
          <span className="font-display text-[17px] font-medium tracking-tight">
            Being<span className="font-bold">Neuron</span>
          </span>
        </Link>

        <div className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((l) =>
            l.section ? (
              <button
                key={l.label}
                type="button"
                onClick={() => goSection(l.section!)}
                className="link-line text-[13.5px] font-medium text-paper/70 transition-colors hover:text-paper"
              >
                {l.label}
              </button>
            ) : (
              <Link
                key={l.label}
                to={l.to!}
                className={`link-line text-[13.5px] font-medium transition-colors hover:text-paper ${
                  location.pathname === l.to ? "text-pulse-300" : "text-paper/70"
                }`}
              >
                {l.label}
              </Link>
            ),
          )}
        </div>

        <div className="hidden items-center gap-5 lg:flex">
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="link-line text-[13.5px] font-medium text-paper/70 transition-colors hover:text-paper"
              >
                Dashboard
              </Link>
              <AccountMenu />
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="link-line text-[13.5px] font-medium text-paper/70 transition-colors hover:text-paper"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="rounded-full bg-pulse-400 px-5 py-2.5 font-display text-[13.5px] font-semibold text-ink-950 transition-all duration-300 hover:bg-pulse-300 active:scale-[0.97]"
              >
                Get Started
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="text-paper lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <IconX size={24} /> : <IconMenu size={24} />}
        </button>
      </nav>

      {/* mobile panel */}
      <div
        className={`overflow-hidden border-b border-paper/10 bg-ink-950/95 backdrop-blur-md transition-all duration-400 lg:hidden ${
          open ? "max-h-[560px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-1 px-5 py-5">
          {user && (
            <div className="mb-4 rounded-xl border border-paper/12 bg-paper/[0.04] p-4">
              <div className="flex items-center gap-3">
                <Avatar profile={profile} user={user} size={40} />
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-semibold text-paper">
                    {profile?.full_name || "Unnamed"}
                  </p>
                  <p className="truncate font-mono text-[10.5px] tracking-wide text-paper/45">{user.email}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Link to="/dashboard" className="rounded-lg border border-paper/15 py-2 text-center font-display text-[12px] font-semibold text-paper/85">
                  Dashboard
                </Link>
                <Link to="/profile" className="rounded-lg border border-paper/15 py-2 text-center font-display text-[12px] font-semibold text-paper/85">
                  Profile
                </Link>
                <Link to="/settings" className="rounded-lg border border-paper/15 py-2 text-center font-display text-[12px] font-semibold text-paper/85">
                  Settings
                </Link>
              </div>
            </div>
          )}
          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              to={l.to!}
              className="block rounded-lg px-3 py-2.5 font-display text-lg text-paper/85 transition-colors hover:bg-paper/5 hover:text-pulse-300"
            >
              {l.label}
            </Link>
          ))}
          <div className="flex gap-3 pt-3">
            {user ? (
              <button
                type="button"
                onClick={onMobileLogout}
                disabled={mobileLogoutBusy}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-signal-400/50 py-2.5 font-display text-sm font-semibold text-signal-300 disabled:opacity-50"
              >
                {mobileLogoutBusy ? <span className="spinner spinner-sm" style={{ borderColor: "rgba(244,197,121,0.25)", borderTopColor: "currentColor" }} /> : <IconLogout size={15} />}
                Log out
              </button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="flex-1 rounded-full border border-paper/25 py-2.5 text-center font-display text-sm font-semibold text-paper"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="flex-1 rounded-full bg-pulse-400 py-2.5 text-center font-display text-sm font-semibold text-ink-950"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
