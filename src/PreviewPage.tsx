import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Reveal, Eyebrow, ButtonLink } from "./ui";
import { usePrefersReducedMotion, useScramble } from "./hooks";
import {
  IconArrowUpRight,
  IconCheck,
  IconArrowRight,
  LogoMark,
} from "./icons";

/* ================= data (all real — nothing invented) ================= */

type RouteChip = { to: string; label: string; protectedRoute?: boolean };

type Phase = {
  n: string;
  id: string;
  code: string;
  title: string;
  status: string;
  desc: string;
  bullets: string[];
  routes: RouteChip[];
  deferred: string;
};

const PHASES: Phase[] = [
  {
    n: "01",
    id: "phase-01",
    code: "FOUNDATION · PUBLIC WEBSITE",
    title: "The scientific front door.",
    status: "shipped",
    desc: "BeingNeuron's public identity — a research-instrument aesthetic with an interactive knowledge-graph hero, a working NeuroSurgery demo lab, pricing, and a full design system.",
    bullets: [
      "Landing page with live graph + debug-lab instrument panels",
      "Domain-agnostic positioning — Synapse is never “AI papers only”",
      "Pricing preview + comparison table + honest FAQ",
      "Design tokens, type system, motion & reduced-motion support",
    ],
    routes: [
      { to: "/", label: "Home" },
      { to: "/pricing", label: "Pricing" },
      { to: "/about", label: "Standby pages" },
    ],
    deferred: "No fake stats, testimonials, or research claims — deferred honesty over invented proof.",
  },
  {
    n: "02",
    id: "phase-02",
    code: "ACCOUNTS · AUTHENTICATION",
    title: "Real users, real sessions.",
    status: "shipped",
    desc: "A production-shaped auth layer on Supabase — with a clearly labelled browser demo adapter so every flow runs even without keys. Profiles, RLS, password reset, protected routes.",
    bullets: [
      "Signup + login with validation, loading & error states",
      "Neutral forgot-password, recovery-aware reset page",
      "profiles table + RLS + auto-provision trigger (migration 0001)",
      "Session persistence, safe internal redirects, account menu",
    ],
    routes: [
      { to: "/login", label: "Login" },
      { to: "/signup", label: "Signup" },
      { to: "/forgot-password", label: "Reset flow" },
      { to: "/profile", label: "Profile", protectedRoute: true },
      { to: "/settings", label: "Settings", protectedRoute: true },
    ],
    deferred: "Email change, OAuth, avatar uploads — staged for later.",
  },
  {
    n: "03",
    id: "phase-03",
    code: "WORKSPACE · APPLICATION SHELL",
    title: "Inside the instrument.",
    status: "shipped",
    desc: "The authenticated application takes over from the marketing site: dark console sidebar, workspace header with ⌘K stub, mobile drawer, and honest empty states everywhere.",
    bullets: [
      "App shell — sidebar, header, drawer, standby module views",
      "Mission-console dashboard with live local clock strip",
      "Synapse / Research Library / NeuroSurgery entry workspaces",
      "Reusable EmptyState · ErrorState · skeleton primitives + entity types",
    ],
    routes: [
      { to: "/dashboard", label: "Dashboard", protectedRoute: true },
      { to: "/app/research", label: "Library", protectedRoute: true },
      { to: "/app/neurosurgery", label: "NeuroSurgery", protectedRoute: true },
      { to: "/usage", label: "Usage", protectedRoute: true },
    ],
    deferred: "Engines & data deliberately absent — the shell says so.",
  },
  {
    n: "04",
    id: "phase-04",
    code: "SYNAPSE · INPUT SYSTEM",
    title: "Papers cross the threshold.",
    status: "shipped",
    desc: "The real intake pipeline: validated PDF uploads with byte-level progress, arXiv URL normalization, persistent job records, and a live queue that surfaces in three places.",
    bullets: [
      "PDF validation — extension, MIME, size, real %PDF header bytes",
      "arXiv parsing (modern + old-style IDs) with duplicate guards",
      "paper_jobs table + RLS + private intake bucket (migration 0002)",
      "Signed-URL uploads with true progress; demo adapter offline",
    ],
    routes: [
      { to: "/app/synapse", label: "Synapse intake", protectedRoute: true },
      { to: "/dashboard", label: "Queue on dashboard", protectedRoute: true },
      { to: "/usage", label: "Queue on usage", protectedRoute: true },
    ],
    deferred: "Analysis itself — extraction & graph generation are Phase 5. Jobs park at “queued”, honestly.",
  },
  {
    n: "05–17",
    id: "phase-05",
    code: "ENGINES · GRAPH · LAB · LAUNCH",
    title: "From extraction to launch day.",
    status: "shipped",
    desc: "The instruments turned on: real PDF extraction, evidence-backed AI analysis, interactive knowledge graphs, a full research workspace, a genuine NeuroSurgery simulation engine, multi-paper graphs with per-paper attribution, plan-aware metering, Stripe billing, privacy controls — closed out by a deployment architecture and production checklist.",
    bullets: [
      "Extract → normalize → chunk → analyze, every fact tied to a page + section (5–6)",
      "Knowledge graphs: levels, filters, inspector, evidence panel, multi-paper attribution (7–9, 12)",
      "Real neural-network simulations — 7 scenarios, verdicts computed from measured metrics (10–11)",
      "Usage caps enforced in the DB, Stripe billing, retention & deletion controls, launch prep (13–17)",
    ],
    routes: [
      { to: "/app/synapse", label: "Synapse pipeline", protectedRoute: true },
      { to: "/app/neurosurgery/overfitting", label: "Surgery lab", protectedRoute: true },
      { to: "/usage", label: "Usage & billing", protectedRoute: true },
      { to: "/settings", label: "Data & privacy", protectedRoute: true },
    ],
    deferred: "Phase 18 candidates: OAuth, per-route SEO via BrowserRouter, admin aggregates, graph export.",
  },
];

const TREE: { line: string; status?: "live" | "preview" | "phase"; to?: string }[] = [
  { line: "BeingNeuron" },
  { line: "├── Public Website", status: "phase" },
  { line: "│   ├── Home", status: "live", to: "/" },
  { line: "│   ├── Pricing", status: "live", to: "/pricing" },
  { line: "│   ├── Login · Signup", status: "live", to: "/login" },
  { line: "│   └── Standby modules", status: "preview", to: "/about" },
  { line: "├── Authentication", status: "phase" },
  { line: "│   ├── User accounts", status: "live", to: "/signup" },
  { line: "│   ├── Profiles + RLS", status: "live", to: "/profile" },
  { line: "│   ├── Password reset", status: "live", to: "/forgot-password" },
  { line: "│   └── Protected routes", status: "live", to: "/dashboard" },
  { line: "└── SaaS Application", status: "phase" },
  { line: "    ├── Dashboard", status: "live", to: "/dashboard" },
  { line: "    ├── Research" },
  { line: "    │   ├── Synapse · intake", status: "live", to: "/app/synapse" },
  { line: "    │   └── Research Library", status: "live", to: "/app/research" },
  { line: "    ├── Learn & Experiment" },
  { line: "    │   └── NeuroSurgery", status: "live", to: "/app/neurosurgery" },
  { line: "    ├── Usage", status: "live", to: "/usage" },
  { line: "    └── Settings", status: "live", to: "/settings" },
];

const ROUTE_MAP: { route: string; area: string; access: string }[] = [
  { route: "/", area: "Public", access: "open" },
  { route: "/pricing", area: "Public", access: "open" },
  { route: "/preview", area: "Meta", access: "open" },
  { route: "/login · /signup", area: "Authentication", access: "open" },
  { route: "/forgot-password · /reset-password", area: "Authentication", access: "open" },
  { route: "/dashboard", area: "Workspace", access: "protected" },
  { route: "/app/synapse", area: "Research · intake", access: "protected" },
  { route: "/app/research", area: "Research · library", access: "protected" },
  { route: "/app/neurosurgery", area: "Learn & experiment", access: "protected" },
  { route: "/usage", area: "Account", access: "protected" },
  { route: "/profile · /settings", area: "Account", access: "protected" },
  { route: "/:slug", area: "Standby modules", access: "open" },
];

const TOUR = [
  { n: "01", t: "Read the public site", d: "Landing, pricing, and the two instrument demos.", to: "/", cta: "Open home" },
  { n: "02", t: "Create a demo account", d: "No keys needed — the demo adapter runs in your browser.", to: "/signup", cta: "Sign up" },
  { n: "03", t: "Land on the dashboard", d: "The mission console, with your real intake count.", to: "/dashboard", cta: "Open dashboard" },
  { n: "04", t: "Feed Synapse a paper", d: "Upload a PDF or paste an arXiv link — watch it validate.", to: "/app/synapse", cta: "Start intake" },
  { n: "05", t: "See it counted", d: "Intake, analyses, repairs, tokens and cost — all measured, nothing invented.", to: "/usage", cta: "Check usage" },
];

const MANIFEST = [
  { k: "phase 01", v: "foundation", s: "shipped" },
  { k: "phase 02", v: "accounts", s: "shipped" },
  { k: "phase 03", v: "workspace", s: "shipped" },
  { k: "phase 04", v: "synapse intake", s: "shipped" },
  { k: "phase 05", v: "analysis engine", s: "scheduled" },
];

/* ================= scroll spy + progress ================= */

function usePhaseSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-38% 0px -52% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

function useLedgerProgress(ref: React.RefObject<HTMLElement | null>) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight * 0.6;
      const passed = Math.min(Math.max(-rect.top + window.innerHeight * 0.2, 0), Math.max(total, 1));
      setP(total > 0 ? passed / total : 1);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ref]);
  return p;
}

/* ================= small pieces ================= */

function StatusChip({ status }: { status?: "live" | "preview" | "phase" }) {
  if (!status) return null;
  const map = {
    live: "border-pulse-500/35 text-pulse-700 bg-pulse-100/50",
    preview: "border-signal-500/40 text-signal-600 bg-signal-300/10",
    phase: "border-ink-900/15 text-ink-400",
  } as const;
  const label = { live: "live", preview: "preview", phase: "shipped" } as const;
  return (
    <span className={`ml-auto shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function BigNumber({ n, active }: { n: string; active: boolean }) {
  return (
    <span
      aria-hidden
      className="tnum select-none font-display text-[5.6rem] font-bold leading-[0.8] transition-all duration-500 sm:text-[7.5rem]"
      style={{
        color: active ? "rgba(18,163,146,0.1)" : "transparent",
        WebkitTextStroke: active ? "1.5px var(--color-pulse-600)" : "1.5px rgba(11,26,38,0.16)",
      }}
    >
      {n}
    </span>
  );
}

/* ================= page ================= */

export default function PreviewPage() {
  const phaseIds = useMemo(() => PHASES.map((p) => p.id), []);
  const active = usePhaseSpy(phaseIds);
  const ledgerRef = useRef<HTMLDivElement | null>(null);
  const progress = useLedgerProgress(ledgerRef);
  const reduced = usePrefersReducedMotion();
  const title = useScramble("Four phases. One platform.", 250);

  return (
    <main className="relative overflow-hidden bg-paper pb-28 pt-32 lg:pt-40">
      <div className="bg-grid-light absolute inset-0 opacity-60" />
      <div className="absolute -right-56 -top-44 h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.12),transparent_62%)]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        {/* ---------- opener: ledger + build manifest ---------- */}
        <div className="grid items-start gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Reveal>
              <Eyebrow className="text-pulse-600">Project preview · build v0.4</Eyebrow>
            </Reveal>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.03] tracking-tight text-ink-900 sm:text-6xl">
              {title}
            </h1>
            <Reveal delay={150}>
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-600">
                Everything BeingNeuron ships through <strong className="text-ink-900">Phase 4</strong> — the public
                site, real accounts, the workspace, and Synapse's intake pipeline — assembled, linked, and honest
                about what the engines will add next.
              </p>
            </Reveal>
            <Reveal delay={260}>
              <div className="mt-8 flex flex-wrap gap-4">
                <ButtonLink to="/signup" variant="primary" arrow>
                  Start the hands-on tour
                </ButtonLink>
                <ButtonLink to="/app/synapse" variant="outline-dark">
                  Go straight to Synapse
                </ButtonLink>
              </div>
            </Reveal>
            <Reveal delay={360}>
              <dl className="mt-10 grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-900/12 bg-ink-900/12 sm:grid-cols-4">
                {[
                  { k: "routes", v: "17" },
                  { k: "migrations", v: "2" },
                  { k: "adapters", v: "4" },
                  { k: "phases live", v: "4 / 4" },
                ].map((s) => (
                  <div key={s.k} className="bg-paper-card px-4 py-4">
                    <dt className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">{s.k}</dt>
                    <dd className="tnum mt-1 font-display text-2xl font-bold tracking-tight text-ink-900">{s.v}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          {/* build manifest console */}
          <div className="lg:col-span-5">
            <Reveal delay={200}>
              <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-950 text-paper shadow-[0_35px_80px_-40px_rgba(6,15,24,0.6)]">
                <div className="flex items-center justify-between border-b border-paper/10 px-5 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-ink-600" />
                    <span className="h-2 w-2 rounded-full bg-ink-600" />
                    <span className="h-2 w-2 rounded-full bg-pulse-400/80" />
                  </div>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-paper/45">BUILD MANIFEST</p>
                </div>
                <div className="bg-grid-dark p-6 font-mono text-[11.5px] leading-[2.1] tracking-wide">
                  <p className="text-paper/60">
                    <span className="text-pulse-300">$</span> beingneuron build --phases 1..4
                  </p>
                  {MANIFEST.map((m, i) => (
                    <Reveal key={m.k} delay={350 + i * 160}>
                      <p className="flex items-baseline gap-3">
                        <span className={m.s === "shipped" ? "text-pulse-300" : "text-paper/35"}>
                          {m.s === "shipped" ? "✓" : "○"}
                        </span>
                        <span className="text-paper/75">{m.k}</span>
                        <span className="flex-1 border-b border-dotted border-paper/15" />
                        <span className="text-paper/55">{m.v}</span>
                        <span
                          className={`ml-3 rounded-full border px-2 py-0.5 text-[8.5px] uppercase tracking-[0.16em] ${
                            m.s === "shipped"
                              ? "border-pulse-400/40 text-pulse-300"
                              : "border-signal-400/40 text-signal-300"
                          }`}
                        >
                          {m.s}
                        </span>
                      </p>
                    </Reveal>
                  ))}
                  <p className="mt-2 text-paper/40">
                    artifacts · dist/ ready <span className="anim-blink ml-1 text-pulse-300">▍</span>
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        {/* ---------- phase ledger (sticky spy + progress) ---------- */}
        <div ref={ledgerRef} className="mt-24 grid gap-10 lg:mt-28 lg:grid-cols-12 lg:gap-14">
          <aside className="hidden lg:col-span-3 lg:block">
            <div className="sticky top-28">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-400">Phase index</p>
              <div className="relative mt-5 space-y-1 pl-6">
                <span aria-hidden className="absolute left-[7px] top-2 h-[calc(100%-16px)] w-px bg-ink-900/12" />
                <span
                  aria-hidden
                  className="absolute left-[7px] top-0 w-px bg-pulse-500 transition-all duration-300"
                  style={{ height: `${Math.round(progress * 100)}%`, maxHeight: "calc(100% - 8px)" }}
                />
                {PHASES.map((p) => {
                  const isActive = active === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        document.getElementById(p.id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })
                      }
                      aria-current={isActive ? "true" : undefined}
                      className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left font-display text-[13.5px] font-semibold transition-all duration-300 ${
                        isActive ? "bg-ink-950 text-paper" : "text-ink-500 hover:bg-paper-card hover:text-ink-900"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`absolute -left-6 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 transition-all duration-300 ${
                          isActive ? "border-pulse-500 bg-pulse-400" : "border-ink-900/25 bg-paper"
                        }`}
                      />
                      <span className={`tnum font-mono text-[10px] ${isActive ? "text-pulse-300" : "text-ink-300"}`}>{p.n}</span>
                      {p.title.replace(".", "")}
                    </button>
                  );
                })}
              </div>
              <div className="mt-8 rounded-xl border border-ink-900/12 bg-paper-card p-5">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">Legend</p>
                <div className="mt-3 space-y-2">
                  {[
                    ["bg-pulse-400", "live — working today"],
                    ["bg-signal-400", "preview — staged, labelled"],
                    ["bg-ink-300", "standby — phase 5"],
                  ].map(([c, l]) => (
                    <p key={l} className="flex items-center gap-2.5 font-mono text-[10.5px] tracking-wide text-ink-500">
                      <span className={`inline-block h-2 w-2 rounded-full ${c}`} /> {l}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <div className="space-y-14 lg:col-span-9 lg:space-y-20">
            {PHASES.map((p, i) => (
              <Reveal key={p.id} delay={i === 0 ? 0 : 60}>
                <article id={p.id} className="scroll-mt-32">
                  <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
                    <BigNumber n={p.n} active={active === p.id} />
                    <div className="max-w-md pt-2 lg:pt-5">
                      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-pulse-600">{p.code}</p>
                      <h2 className="mt-2.5 font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
                        {p.title}
                      </h2>
                    </div>
                    <span className="mt-3 flex items-center gap-2 rounded-full border border-pulse-500/35 bg-pulse-100/50 px-3.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-pulse-700">
                      <span className="ping-dot inline-block h-1.5 w-1.5 rounded-full bg-pulse-400" />
                      {p.status}
                    </span>
                  </div>

                  <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-600">{p.desc}</p>

                  <div className="mt-7 grid gap-5 lg:grid-cols-5">
                    <ul className="space-y-3 lg:col-span-3">
                      {p.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-3 text-[14px] leading-snug text-ink-700">
                          <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-pulse-100 text-pulse-600">
                            <IconCheck size={11} />
                          </span>
                          {b}
                        </li>
                      ))}
                    </ul>
                    <div className="lg:col-span-2">
                      <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">Try it</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {p.routes.map((r) => (
                          <Link
                            key={r.to + r.label}
                            to={r.to}
                            className="group inline-flex items-center gap-1.5 rounded-full border border-ink-900/15 px-3.5 py-1.5 font-mono text-[10.5px] tracking-wide text-ink-600 transition-all duration-300 hover:border-pulse-500 hover:text-pulse-700"
                          >
                            {r.label}
                            {r.protectedRoute && <span className="text-[9px] uppercase tracking-[0.1em] text-signal-600">·auth</span>}
                            <IconArrowUpRight size={11} className="text-ink-300 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-pulse-600" />
                          </Link>
                        ))}
                      </div>
                      <p className="mt-5 rounded-lg border border-signal-500/30 bg-signal-300/10 px-4 py-3 font-mono text-[10.5px] leading-relaxed tracking-wide text-ink-600">
                        <span className="uppercase tracking-[0.18em] text-signal-600">deferred · </span>
                        {p.deferred}
                      </p>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>

        {/* ---------- architecture tree + route map ---------- */}
        <div className="mt-24 grid gap-6 lg:mt-28 lg:grid-cols-12">
          <Reveal className="lg:col-span-6">
            <div className="h-full overflow-hidden rounded-xl border border-ink-800 bg-ink-950 text-paper">
              <div className="flex items-center justify-between border-b border-paper/10 px-6 py-4">
                <p className="font-mono text-[10px] tracking-[0.22em] text-paper/45">PLATFORM MAP · LIVE STATUS</p>
                <LogoMark size={16} className="text-pulse-400/70" />
              </div>
              <div className="bg-grid-dark p-6 font-mono text-[12px] leading-relaxed">
                {TREE.map((row, i) => (
                  <div
                    key={i}
                    className={`group relative flex items-center gap-3 whitespace-pre rounded px-2 py-[3px] transition-all duration-200 ${
                      row.to ? "cursor-pointer hover:translate-x-1 hover:bg-paper/[0.05]" : ""
                    }`}
                  >
                    <span className={row.to ? "text-paper/80 group-hover:text-pulse-200" : "text-paper/65"}>{row.line}</span>
                    {row.line.startsWith("BeingNeuron") || (!row.line.includes("──") && row.line !== "BeingNeuron") ? null : (
                      <span className="flex-1 border-b border-dotted border-paper/12" />
                    )}
                    {row.line === "BeingNeuron" && <span className="flex-1 border-b border-dotted border-paper/12" />}
                    <StatusChip status={row.status} />
                    {row.to && (
                      <Link to={row.to} className="absolute inset-0" aria-label={`Open ${row.line.replace(/[│├└─\s]/g, "")}`} />
                    )}
                  </div>
                ))}
                <p className="mt-4 px-2 text-[10px] tracking-wide text-paper/35">
                  ● every clickable branch is real and routed
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={140} className="lg:col-span-6">
            <div className="h-full rounded-xl border border-ink-900/12 bg-paper-card">
              <div className="flex items-center justify-between border-b border-ink-900/10 px-6 py-4">
                <p className="font-mono text-[10px] tracking-[0.22em] text-ink-400">ROUTE TABLE</p>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-300">hash router</span>
              </div>
              <ul className="divide-y divide-ink-900/[0.06]">
                {ROUTE_MAP.map((r) => (
                  <li
                    key={r.route}
                    className="group flex items-center gap-4 px-6 py-3 transition-colors duration-200 hover:bg-pulse-100/40"
                  >
                    <span className="tnum font-mono text-[12px] text-ink-800">{r.route}</span>
                    <span className="flex-1 border-b border-dotted border-ink-900/15" />
                    <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400 sm:inline">
                      {r.area}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] ${
                        r.access === "protected"
                          ? "border-pulse-500/35 bg-pulse-100/60 text-pulse-700"
                          : "border-ink-900/15 text-ink-400"
                      }`}
                    >
                      {r.access}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        {/* ---------- guided tour ---------- */}
        <Reveal className="mt-24 lg:mt-28">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow className="text-pulse-600">Guided tour · ~5 minutes</Eyebrow>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                Walk the whole build.
              </h2>
            </div>
            <p className="max-w-sm text-[13.5px] leading-relaxed text-ink-500">
              Five stops, in order. Demo mode needs no keys — the tour works the moment you sign up.
            </p>
          </div>
        </Reveal>
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {TOUR.map((t, i) => (
            <Reveal key={t.n} delay={i * 110}>
              <li className="h-full">
                <Link
                  to={t.to}
                  className="card-lift group flex h-full flex-col rounded-xl border border-ink-900/12 bg-paper-card p-6 hover:border-pulse-500/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="tnum font-display text-3xl font-bold text-ink-900/15 transition-colors duration-300 group-hover:text-pulse-600/40">
                      {t.n}
                    </span>
                    <IconArrowRight size={16} className="text-ink-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-pulse-600" />
                  </div>
                  <h3 className="mt-4 font-display text-[15.5px] font-semibold tracking-tight text-ink-900">{t.t}</h3>
                  <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-ink-500">{t.d}</p>
                  <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-pulse-700">{t.cta} →</p>
                </Link>
              </li>
            </Reveal>
          ))}
        </ol>

        {/* ---------- what's next (informational only) ---------- */}
        <Reveal className="mt-24 lg:mt-28">
          <div className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-950 px-8 py-10 text-paper sm:px-12">
            <div className="bg-grid-dark absolute inset-0" />
            <div className="absolute -right-28 -top-28 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.16),transparent_65%)]" />
            <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
              <div className="max-w-xl">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-signal-300">Phase 05 · scheduled</p>
                <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  The engines wake up next.
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed text-paper/60">
                  Extraction, concept analysis, knowledge-graph generation, and the NeuroSurgery simulation will
                  consume exactly the jobs Phase 4 parks in the queue. Nothing on this page pretends otherwise.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-4">
                <ButtonLink to="/" variant="outline-light">
                  Public site
                </ButtonLink>
                <ButtonLink to="/dashboard" variant="primary" arrow>
                  Open the workspace
                </ButtonLink>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
