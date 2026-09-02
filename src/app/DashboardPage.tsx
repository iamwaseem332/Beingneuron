import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePrefersReducedMotion } from "../hooks";
import { LEARNING_PATHS, QUICK_START } from "./appData";
import ChallengeCard from "./ChallengeCard";
import { EmptyState, GreetingSkeleton, MaskLines, PanelHead, PanelSkeleton } from "./states";
import { useSynapse } from "./SynapseProvider";
import { useNsgProgress } from "./nsgProgress";
import {
  IconArrowRight,
  IconArrowUpRight,
  IconClock,
  IconGauge,
  IconGraph,
  IconWrench,
} from "../icons";

/* ---------- live local clock (real data, no fakery) ---------- */

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function ConsoleStrip({ name, email }: { name: string; email: string }) {
  const now = useClock();
  const time = now.toLocaleTimeString(undefined, { hour12: false });
  const date = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-ink-800 bg-ink-800 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { k: "operator", v: name, sub: email },
        { k: "local time", v: time, sub: date },
        { k: "engines", v: "synapse · nsg", sub: "live" },
        { k: "session", v: "secure", sub: "persisted" },
      ].map((cell, i) => (
        <div key={cell.k} className="relative bg-ink-950 px-5 py-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-paper/35">{cell.k}</p>
          <p className="tnum mt-1.5 truncate font-display text-[15px] font-semibold tracking-tight text-paper">
            {i === 1 ? cell.v : cell.v}
            {i === 1 && <span className="anim-blink ml-0.5 text-pulse-300">▍</span>}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] tracking-wide text-paper/40">{cell.sub}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- mini knowledge graph (Synapse panel visual) ---------- */

function MiniGraph() {
  const reduced = usePrefersReducedMotion();
  const nodes = [
    { x: 60, y: 60, r: 7 },
    { x: 165, y: 30, r: 5 },
    { x: 250, y: 85, r: 6 },
    { x: 120, y: 130, r: 5 },
    { x: 215, y: 155, r: 7 },
    { x: 45, y: 155, r: 4 },
  ];
  const edges: [number, number][] = [
    [0, 1],
    [0, 3],
    [1, 2],
    [2, 4],
    [3, 4],
    [3, 5],
    [0, 2],
  ];
  return (
    <svg viewBox="0 0 300 190" className="h-auto w-full max-w-[300px]" aria-hidden>
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x}
          y1={nodes[a].y}
          x2={nodes[b].x}
          y2={nodes[b].y}
          stroke="rgba(124,228,208,0.3)"
          strokeWidth="1"
          className={reduced ? "" : "edge-flow"}
          style={{ animationDuration: `${2.6 + (i % 3) * 0.7}s` }}
        />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={n.r + 5} fill="none" stroke="rgba(124,228,208,0.18)" strokeWidth="1" />
          <circle cx={n.x} cy={n.y} r={n.r} fill={i === 4 ? "var(--color-pulse-300)" : "rgba(124,228,208,0.75)"} />
        </g>
      ))}
      <text x="10" y="182" fontFamily="var(--font-mono)" fontSize="8.5" letterSpacing="2" fill="rgba(124,228,208,0.5)">
        PAPER → GRAPH
      </text>
    </svg>
  );
}

/* ---------- mini fault network (NeuroSurgery panel visual) ---------- */

function MiniNet() {
  const cols = [
    [30, 50, 120, 190],
    [150, 20, 75, 120, 165],
    [260, 70, 170],
  ];
  const reduced = usePrefersReducedMotion();
  return (
    <svg viewBox="0 0 300 210" className="h-auto w-full max-w-[300px]" aria-hidden>
      {cols.slice(0, -1).map((col, li) =>
        col.map((y, ni) =>
          cols[li + 1].map((y2, nj) => (
            <line
              key={`${li}-${ni}-${nj}`}
              x1={col[0]}
              y1={y}
              x2={cols[li + 1][0]}
              y2={y2}
              stroke={li === 0 && ni === 2 ? "rgba(236,171,66,0.45)" : "rgba(11,26,38,0.13)"}
              strokeWidth="1"
            />
          )),
        ),
      )}
      {cols.map((col, li) =>
        col.slice(1).map((y, ni) => {
          const dead = li === 1 && ni === 1;
          return (
            <g key={`${li}-${ni}`}>
              {dead && (
                <circle
                  cx={col[0]}
                  cy={y}
                  r="14"
                  fill="none"
                  stroke="var(--color-signal-500)"
                  strokeWidth="1"
                  strokeDasharray="3 4"
                  className={reduced ? "" : "anim-breathe"}
                />
              )}
              <circle
                cx={col[0]}
                cy={y}
                r="7"
                fill={dead ? "var(--color-ink-300)" : "var(--color-ink-800)"}
                stroke={dead ? "var(--color-signal-500)" : "rgba(18,163,146,0.55)"}
                strokeWidth="1.3"
              />
            </g>
          );
        }),
      )}
      <text x="8" y="204" fontFamily="var(--font-mono)" fontSize="8.5" letterSpacing="2" fill="rgba(168,111,18,0.75)">
        FAULT INJECTED · H1·N2
      </text>
    </svg>
  );
}

/* ---------- quick start journey ---------- */

function QuickStart() {
  const reduced = usePrefersReducedMotion();
  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-950 p-7 text-paper sm:p-9">
      <div className="bg-grid-dark pointer-events-none absolute inset-0" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-pulse-300">Quick start</p>
            <h2 className="mt-2 font-display text-xl font-semibold tracking-tight sm:text-2xl">
              How BeingNeuron fits together.
            </h2>
          </div>
          <p className="font-mono text-[10px] tracking-wide text-paper/40">not a wizard — just the shape of it</p>
        </div>

        <div className="relative mt-9 grid gap-8 md:grid-cols-3 md:gap-6">
          {/* connecting line */}
          <div aria-hidden className="absolute left-0 right-0 top-[13px] hidden md:block">
            <svg className="h-[2px] w-full" preserveAspectRatio="none" viewBox="0 0 100 2">
              <line
                x1="0"
                y1="1"
                x2="100"
                y2="1"
                stroke="rgba(124,228,208,0.35)"
                strokeWidth="1"
                strokeDasharray="2 3"
                className={reduced ? "" : "edge-flow"}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>

          {QUICK_START.map((s, i) => (
            <Link key={s.n} to={s.to} className="group relative block">
              <span
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border font-mono text-[10px] font-semibold ${
                  i === 2
                    ? "border-signal-400/60 bg-ink-950 text-signal-300"
                    : "border-pulse-400/60 bg-ink-950 text-pulse-300"
                } transition-transform duration-300 group-hover:scale-110`}
              >
                {s.n}
              </span>
              <h3 className="mt-4 flex items-center gap-2 font-display text-[16px] font-semibold tracking-tight">
                {s.title}
                <IconArrowUpRight
                  size={14}
                  className="text-paper/25 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-pulse-300"
                />
              </h3>
              <p className="mt-1.5 max-w-[26ch] text-[13px] leading-relaxed text-paper/50">{s.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= page ================= */

export default function DashboardPage() {
  const { user, profile, profileLoading } = useAuth();
  const { jobs, loadingJobs } = useSynapse();
  const { totals: nsgTotals } = useNsgProgress();
  const parked = jobs.filter((j) => j.status === "queued").length;
  const readyDocs = jobs.filter((j) => j.status === "ready_for_analysis").length;
  const analyzed = jobs.filter((j) => j.status === "analyzed" || j.status === "completed").length;
  const firstName =
    (profile?.full_name ?? "").trim().split(/\s+/)[0] || user?.email?.split("@")[0] || "researcher";

  return (
    <div className="space-y-10">
      {/* console strip */}
      {profileLoading ? <PanelSkeleton className="border-ink-900/10" /> : (
        <ConsoleStrip name={profile?.full_name || firstName} email={user?.email ?? ""} />
      )}

      {/* welcome */}
      <section aria-labelledby="dash-welcome">
        {profileLoading ? (
          <GreetingSkeleton />
        ) : (
          <>
            <h2 id="dash-welcome" className="font-display text-3xl font-bold leading-[1.06] tracking-tight text-ink-900 sm:text-[2.5rem]">
              <MaskLines lines={[<>Welcome back, {firstName}.</>]} />
            </h2>
            <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-ink-600">
              Continue exploring research and experimenting with AI. Your workspace is provisioned —
              the engines arrive in Phase 4.
            </p>
          </>
        )}
      </section>

      {/* primary actions */}
      <section aria-label="Primary actions" className="grid gap-5 lg:grid-cols-12">
        {/* Synapse */}
        <Link
          to="/app/synapse"
          className="card-lift group relative overflow-hidden rounded-xl border border-ink-800 bg-ink-950 p-7 text-paper sm:p-8 lg:col-span-7"
        >
          <div className="bg-grid-dark pointer-events-none absolute inset-0" />
          <div className="absolute -right-24 -top-24 h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.18),transparent_65%)]" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-pulse-400/35 bg-pulse-400/10 text-pulse-300">
                  <IconGraph size={19} />
                </span>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-pulse-300/80">
                  Synapse · any domain
                </p>
              </div>
              <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight sm:text-[1.7rem]">
                Analyze Research
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-paper/55">
                Turn a research paper into an interactive map of ideas.
              </p>
              <span className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-pulse-400 px-5 py-2.5 font-display text-[13.5px] font-semibold text-ink-950 transition-all duration-300 group-hover:bg-pulse-300">
                Explore Synapse
                <IconArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </div>
            <div className="hidden w-[260px] shrink-0 opacity-80 transition-opacity duration-500 group-hover:opacity-100 sm:block">
              <MiniGraph />
            </div>
          </div>
        </Link>

        {/* NeuroSurgery */}
        <Link
          to="/app/neurosurgery"
          className="card-lift group relative overflow-hidden rounded-xl border border-ink-900/12 bg-paper-card p-7 sm:p-8 lg:col-span-5"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xs">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-signal-500/35 bg-signal-300/20 text-signal-600">
                  <IconWrench size={19} />
                </span>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal-600/80">
                  NeuroSurgery · ML lab
                </p>
              </div>
              <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-[1.7rem]">
                Enter NeuroSurgery
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-500">
                Diagnose and experiment with neural networks.
              </p>
              <span className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-ink-900 px-5 py-2.5 font-display text-[13.5px] font-semibold text-paper transition-all duration-300 group-hover:bg-ink-700">
                Explore NeuroSurgery
                <IconArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </div>
            <div className="hidden w-[220px] shrink-0 opacity-90 transition-opacity duration-500 group-hover:opacity-100 sm:block">
              <MiniNet />
            </div>
          </div>
        </Link>
      </section>

      {/* recent activity + usage */}
      <section aria-label="Activity and usage" className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-ink-900/12 bg-paper-card p-7 lg:col-span-2">
          <PanelHead
            title="Recent Activity"
            tag="empty · honest"
            right={
              <span className="hidden items-center gap-2 font-mono text-[10px] tracking-wide text-ink-400 sm:flex">
                <IconClock size={13} /> nothing yet — by design
              </span>
            }
          />
          <div className="mt-6">
            <EmptyState
              icon={IconClock}
              title="No research analyses yet."
              desc="Start with a paper and BeingNeuron will help you explore its concepts, methods and relationships."
              action={{ label: "Analyze Your First Paper", to: "/app/synapse" }}
            />
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-ink-900/12 bg-paper-card p-7">
          <PanelHead title="Usage Overview" tag="preliminary" />
          <div className="mt-6 space-y-5">
            {[
              {
                label: "Research Analyses",
                value: loadingJobs
                  ? "syncing…"
                  : `${analyzed} analysis${analyzed === 1 ? "" : "es"} completed`,
              },
              {
                label: "NeuroSurgery",
                value: `${nsgTotals.repairs} case${nsgTotals.repairs === 1 ? "" : "s"} repaired · ${nsgTotals.attempted} attempted`,
              },
            ].map((row) => (
              <div key={row.label} className="border-b border-ink-900/[0.07] pb-5 last:border-b-0 last:pb-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">{row.label}</p>
                <p className="tnum mt-1.5 font-display text-[15px] font-semibold text-ink-900">{row.value}</p>
              </div>
            ))}
            <div className="border-b border-ink-900/[0.07] pb-5">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                Extraction pipeline
                {!loadingJobs && readyDocs > 0 && (
                  <span className="ping-dot inline-block h-1.5 w-1.5 rounded-full bg-pulse-400" />
                )}
              </p>
              <p className="tnum mt-1.5 font-display text-[15px] font-semibold text-ink-900">
                {loadingJobs
                  ? "syncing…"
                  : `${readyDocs} doc${readyDocs === 1 ? "" : "s"} extracted & ready · ${parked} in the queue`}
              </p>
            </div>
          </div>
          <p className="mt-5 text-[12.5px] leading-relaxed text-ink-500">
            Extraction and chunking are live — analyses stay at zero until the Phase 6 engine ships.
          </p>
          <Link
            to="/usage"
            className="group mt-auto inline-flex items-center gap-2 pt-5 font-display text-[13.5px] font-semibold text-pulse-700 transition-colors hover:text-pulse-600"
          >
            <IconGauge size={15} />
            View usage
            <IconArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* continue learning */}
      <section aria-labelledby="dash-learn">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-pulse-600">
              <span className="inline-block h-[7px] w-[7px] rotate-45 bg-current opacity-80" />
              Continue learning
            </p>
            <h2 id="dash-learn" className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-[1.7rem]">
              Paths into model debugging.
            </h2>
          </div>
          <Link
            to="/app/neurosurgery"
            className="link-line font-display text-[13.5px] font-semibold text-ink-700 hover:text-ink-900"
          >
            Explore NeuroSurgery →
          </Link>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {LEARNING_PATHS.map((p) => (
            <ChallengeCard
              key={p.slug}
              def={p}
              to={p.to}
              statusLabel={p.live ? "live · real simulation" : "Upcoming module"}
            />
          ))}
        </div>
      </section>

      {/* quick start */}
      <QuickStart />
    </div>
  );
}
