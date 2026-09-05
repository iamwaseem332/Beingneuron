import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { AccountMenu } from "../Nav";
import { useAuth } from "../auth/AuthContext";
import { PLACEHOLDERS } from "../content";
import { APP_BOTTOM, APP_GROUPS, APP_TOP, PAGE_META, type AppNavItem } from "./appData";
import { ErrorBoundary } from "./states";
import { usePrefersReducedMotion } from "../hooks";
import {
  IconArrowUpRight,
  IconGauge,
  IconLogout,
  IconMenu,
  IconSearch,
  IconX,
  LogoMark,
} from "../icons";

/* ================= nav item ================= */

function Item({
  item,
  onNavigate,
  compact = false,
}: {
  item: AppNavItem;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const { pathname } = useLocation();
  const active = pathname === item.to;
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-lg px-3.5 py-2.5 font-display text-[13.5px] font-medium transition-all duration-200 ${
        active
          ? "bg-paper/[0.08] font-semibold text-paper"
          : "text-paper/60 hover:bg-paper/[0.04] hover:text-paper"
      } ${compact ? "py-2" : ""}`}
    >
      {/* active indicator — shape, not just color */}
      <span
        aria-hidden
        className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-pulse-400 transition-all duration-300 ${
          active ? "opacity-100 scale-y-100" : "opacity-0 scale-y-0"
        }`}
      />
      <Icon size={17} className={active ? "text-pulse-300" : "text-paper/45 group-hover:text-paper/80"} />
      <span className="flex-1">{item.label}</span>
      {item.code && (
        <span className={`font-mono text-[9px] tracking-[0.16em] ${active ? "text-pulse-300/80" : "text-paper/25"}`}>
          {item.code}
        </span>
      )}
    </Link>
  );
}

/* ================= sidebar content (shared desktop + drawer) ================= */

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const name = profile?.full_name || user?.email || "researcher";

  const onLogout = async () => {
    onNavigate?.();
    setSigningOut(true);
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      {/* brand */}
      <div className="flex items-center justify-between px-5 pb-5 pt-6">
        <Link to="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 text-paper">
          <LogoMark size={28} className="text-pulse-400" />
          <span className="font-display text-[16px] font-medium tracking-tight">
            Being<span className="font-bold">Neuron</span>
          </span>
        </Link>
        <span className="rounded-full border border-paper/15 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.18em] text-paper/40">
          workspace
        </span>
      </div>

      <div className="app-scroll flex-1 overflow-y-auto px-3">
        <nav aria-label="Application">
          <Item item={APP_TOP} onNavigate={onNavigate} />

          {APP_GROUPS.map((g) => (
            <div key={g.label} className="mt-6">
              <p className="px-3.5 pb-2 font-mono text-[9.5px] uppercase tracking-[0.22em] text-paper/30">
                {g.label}
              </p>
              <div className="space-y-0.5">
                {g.items.map((item) => (
                  <Item key={item.to} item={item} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          ))}

          <div className="mt-6 border-t border-paper/10 pt-5">
            <p className="px-3.5 pb-2 font-mono text-[9.5px] uppercase tracking-[0.22em] text-paper/30">Account</p>
            <div className="space-y-0.5">
              {APP_BOTTOM.map((item) => (
                <Item key={item.to} item={item} onNavigate={onNavigate} />
              ))}
              <Link
                to="/profile"
                onClick={onNavigate}
                className="group flex items-center gap-3 rounded-lg px-3.5 py-2.5 font-display text-[13.5px] font-medium text-paper/60 transition-all hover:bg-paper/[0.04] hover:text-paper"
              >
                <span className="flex h-[17px] w-[17px] items-center justify-center">
                  <IconArrowUpRight size={15} className="text-paper/45 transition-colors group-hover:text-paper/80" />
                </span>
                <span className="flex-1">Public site</span>
              </Link>
            </div>
          </div>
        </nav>
      </div>

      {/* user card */}
      <div className="border-t border-paper/10 p-3">
        <div className="flex items-center gap-3 rounded-lg bg-paper/[0.04] p-3">
          <Link
            to="/profile"
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label="Open profile"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-pulse-400/45 bg-pulse-400/15 font-display text-[12px] font-semibold text-pulse-300">
              {(name.trim()[0] || "?").toUpperCase()}
              {(name.trim().split(/\s+/)[1]?.[0] || "").toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[13px] font-semibold text-paper">{name}</span>
              <span className="block truncate font-mono text-[10px] tracking-wide text-paper/40">{user?.email}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onLogout}
            disabled={signingOut}
            aria-label="Log out"
            title="Log out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-paper/45 transition-all hover:bg-paper/[0.08] hover:text-signal-300 disabled:opacity-50"
          >
            {signingOut ? (
              <span className="spinner spinner-sm" style={{ borderColor: "rgba(242,244,239,0.15)", borderTopColor: "var(--color-paper)" }} />
            ) : (
              <IconLogout size={16} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= search overlay (future-ready stub) ================= */

function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const quick = [
    { label: "Synapse", to: "/app/synapse" },
    { label: "Research Library", to: "/app/research" },
    { label: "NeuroSurgery", to: "/app/neurosurgery" },
    { label: "Usage", to: "/usage" },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Workspace search"
      className="fade-in fixed inset-0 z-[80] flex items-start justify-center bg-ink-950/70 px-5 pt-[16vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drop-in w-full max-w-lg overflow-hidden rounded-xl border border-paper/15 bg-ink-900 shadow-[0_50px_120px_-40px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-3 border-b border-paper/10 px-5 py-4">
          <IconSearch size={17} className="text-pulse-300" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search papers, graphs, challenges…"
            className="flex-1 bg-transparent font-display text-[15px] text-paper placeholder:text-paper/30 focus:outline-none"
            aria-label="Search workspace"
          />
          <button
            type="button"
            onClick={onClose}
            className="keycap"
            aria-label="Close search"
          >
            esc
          </button>
        </div>
        <div className="px-5 py-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/35">Future-ready</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-paper/60">
            Global search activates with the data layer — your analyses, saved graphs, and sessions
            become searchable in Phase 4. Nothing is indexed yet.
          </p>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/35">Jump to</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {quick.map((q) => (
              <button
                key={q.to}
                type="button"
                onClick={() => {
                  onClose();
                  navigate(q.to);
                }}
                className="flex items-center justify-between rounded-lg border border-paper/12 px-3.5 py-2.5 font-display text-[13px] font-medium text-paper/75 transition-all hover:border-pulse-400/50 hover:text-pulse-300"
              >
                {q.label}
                <IconArrowUpRight size={13} className="text-paper/30" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= header ================= */

function Header({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const meta =
    PAGE_META[pathname] ??
    (() => {
      if (pathname.startsWith("/app/synapse/graph/")) {
        return { crumbs: ["Workspace", "Research", "Synapse"], title: "Knowledge Graph" };
      }
      if (pathname.startsWith("/app/synapse/")) {
        return { crumbs: ["Workspace", "Research", "Synapse"], title: "Research Workspace" };
      }
      if (pathname.startsWith("/app/neurosurgery/")) {
        return { crumbs: ["Workspace", "Learn & Experiment", "NeuroSurgery"], title: "Surgery Lab" };
      }
      if (/^\/app\/synapse\/[^/]+$/.test(pathname)) {
        return { crumbs: ["Workspace", "Research", "Synapse"], title: "Research Workspace" };
      }
      const slug = pathname.split("/")[2];
      const copy = slug ? PLACEHOLDERS[slug] : undefined;
      return { crumbs: ["Workspace", "Modules"], title: copy?.name ?? "Module" };
    })();

  /* ⌘K / Ctrl+K opens search anywhere in the workspace */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-paper/10 bg-ink-950/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-4 px-5 sm:px-8">
        <button
          type="button"
          onClick={onMenu}
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-paper/70 transition-colors hover:bg-paper/[0.06] hover:text-paper lg:hidden"
          aria-label="Open workspace menu"
        >
          <IconMenu size={20} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.2em] text-paper/35">
            {meta.crumbs.map((c, i) => (
              <span key={c} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden className="text-pulse-400/60">/</span>}
                {c}
              </span>
            ))}
          </p>
          <h1 className="truncate font-display text-[17px] font-semibold tracking-tight text-paper">
            {meta.title}
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden items-center gap-3 rounded-full border border-paper/15 py-2 pl-4 pr-2.5 text-[12.5px] text-paper/50 transition-all hover:border-paper/35 hover:text-paper/80 md:flex"
          aria-label="Open workspace search"
        >
          <IconSearch size={14} />
          <span>Search workspace</span>
          <span className="flex items-center gap-1">
            <span className="keycap">⌘</span>
            <span className="keycap">K</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-paper/60 transition-colors hover:bg-paper/[0.06] hover:text-paper md:hidden"
          aria-label="Open workspace search"
        >
          <IconSearch size={17} />
        </button>

        <Link
          to="/usage"
          className="hidden items-center gap-2 rounded-full border border-paper/15 px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/55 transition-all hover:border-pulse-400/50 hover:text-pulse-300 sm:flex"
        >
          <IconGauge size={13} />
          usage · 0
        </Link>

        <AccountMenu />
      </div>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

/* ================= layout ================= */

export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const reduced = usePrefersReducedMotion();

  /* close drawer on navigation + lock body scroll while open */
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="h-screen bg-paper">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[248px] border-r border-paper/10 bg-ink-950 lg:block">
        <SidebarContent />
      </aside>

      {/* mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[75] lg:hidden">
          <div
            className="fade-in absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Workspace menu"
            className={`${reduced ? "" : "drawer-in"} absolute inset-y-0 left-0 w-[290px] border-r border-paper/10 bg-ink-950 shadow-2xl`}
          >
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-5 flex h-9 w-9 items-center justify-center rounded-lg text-paper/60 hover:bg-paper/[0.06] hover:text-paper"
              aria-label="Close workspace menu"
            >
              <IconX size={19} />
            </button>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex flex-col lg:pl-[248px]">
        <Header onMenu={() => setDrawerOpen(true)} />

        <main id="workspace-main" className="relative flex-1 overflow-y-auto">
          {/* ambient workspace backdrop */}
          <div aria-hidden className="bg-grid-light pointer-events-none absolute inset-0 opacity-70" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[340px] bg-[radial-gradient(ellipse_at_top,rgba(18,163,146,0.08),transparent_65%)]"
          />
          <div className="relative mx-auto w-full max-w-[1240px] px-5 py-8 sm:px-8 lg:py-10">
            <ErrorBoundary label="application view">
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>

        <footer className="relative border-t border-ink-900/[0.08] py-4">
          <p className="mx-auto flex max-w-[1240px] items-center gap-2.5 px-5 font-mono text-[10px] tracking-wide text-ink-400 sm:px-8">
            <span className="ping-dot inline-block h-1.5 w-1.5 rounded-full bg-pulse-400" />
            BeingNeuron workspace · production build
            <span className="ml-auto hidden items-center gap-3 text-ink-300 sm:flex">
              v1.0 · engines live
              <Link to="/preview" className="link-line text-pulse-700">
                project preview
              </Link>
            </span>
          </p>
        </footer>
      </div>
    </div>
  );
}

/* ================= standby view for not-yet-built modules ================= */

export function AppStandby({ children }: { children?: ReactNode }) {
  const { module } = useParams<{ module: string }>();
  const copy = module ? PLACEHOLDERS[module] : undefined;

  if (!copy) {
    return (
      <div className="rounded-xl border border-ink-900/12 bg-paper-card p-10 text-center">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-signal-600">Unmapped module</p>
        <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink-900">
          “{module}” isn't a workspace yet.
        </h2>
        <Link
          to="/dashboard"
          className="mt-6 inline-block rounded-full bg-ink-900 px-6 py-3 font-display text-[14px] font-semibold text-paper transition-colors hover:bg-ink-700"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-950 text-paper">
      <div className="flex items-center justify-between border-b border-paper/10 px-6 py-3.5">
        <p className="font-mono text-[10.5px] tracking-[0.2em] text-paper/45">MODULE REGISTRY — {copy.code}</p>
        <span className="flex items-center gap-2 rounded-full border border-signal-400/40 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-signal-300">
          <span className="anim-breathe inline-block h-1.5 w-1.5 rounded-full bg-signal-400" />
          standby
        </span>
      </div>
      <div className="bg-grid-dark p-8 sm:p-10">
        <LogoMark size={32} className="text-pulse-400" />
        <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {copy.name} <span className="text-pulse-300">workspace.</span>
        </h2>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-paper/65">{copy.desc}</p>
        <div className="mt-7 space-y-2 border-t border-paper/10 pt-6 font-mono text-[11.5px] tracking-wide text-paper/50">
          <p>
            <span className="text-pulse-300">scope</span> ··· {copy.scope}
          </p>
          <p>
            <span className="text-pulse-300">phase</span> ··· 05 — engines &amp; data
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
