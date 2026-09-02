import { Link } from "react-router-dom";
import { PageHeader, PanelHead } from "./states";
import { IconArrowRight, IconDoc, IconGauge, IconInbox, IconLibrary, IconWrench } from "../icons";
import { useSynapse } from "./SynapseProvider";

const STATS = [
  {
    label: "Research Activity",
    value: "0",
    unit: "papers analyzed",
    desc: "Counts every Synapse analysis you run — none yet, and nothing invented.",
    icon: IconDoc,
  },
  {
    label: "Research Collections",
    value: "0",
    unit: "collections",
    desc: "Curated groups of analyses around one question. Yours appear here.",
    icon: IconLibrary,
  },
  {
    label: "NeuroSurgery Activity",
    value: "0",
    unit: "completed challenges",
    desc: "Repaired models, logged per session. The lab opens in Phase 4.",
    icon: IconWrench,
  },
];

const FUTURE_TRACKING = [
  { k: "Papers analyzed", note: "per Synapse run" },
  { k: "AI processing usage", note: "extraction + graph generation" },
  { k: "Graph storage", note: "saved knowledge graphs" },
  { k: "Experiments", note: "NeuroSurgery sessions" },
  { k: "Plan limits", note: "when billing exists" },
];

export default function UsagePage() {
  const { jobs, loadingJobs } = useSynapse();
  const parked = jobs.filter((j) => j.status === "queued").length;
  const ready = jobs.filter((j) => j.status === "ready_for_analysis").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Account · Usage"
        title={[<>Your footprint,</>, <>honestly counted.</>]}
        lede="Nothing is metered yet — usage tracking activates with the engines. Until then this page shows real zeros, not placeholders pretending to be data."
      />

      {/* stat tiles */}
      <section aria-label="Usage statistics" className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {STATS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="card-lift relative overflow-hidden rounded-xl border border-ink-900/12 bg-paper-card p-7">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-pulse-500/25 bg-pulse-100/70 text-pulse-700">
                  <Icon size={18} />
                </span>
                <span className="rounded-full border border-ink-900/12 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-400">
                  preliminary
                </span>
              </div>
              <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">{s.label}</p>
              <p className="tnum mt-2 font-display text-[2.6rem] font-bold leading-none tracking-tight text-ink-900">
                {s.value}
                <span className="ml-2 font-mono text-[11px] font-normal tracking-wide text-ink-400">{s.unit}</span>
              </p>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-500">{s.desc}</p>
            </div>
          );
        })}

        {/* live intake count — real Phase 4 data */}
        <div className="card-lift relative overflow-hidden rounded-xl border border-ink-800 bg-ink-950 p-7 text-paper">
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-pulse-400/30 bg-pulse-400/10 text-pulse-300">
              <IconInbox size={18} />
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-pulse-400/30 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-pulse-300">
              <span className="ping-dot inline-block h-1.5 w-1.5 rounded-full bg-pulse-400" />
              live
            </span>
          </div>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/40">Extraction Pipeline</p>
          <p className="tnum mt-2 font-display text-[2.6rem] font-bold leading-none tracking-tight">
            {loadingJobs ? "…" : ready}
            <span className="ml-2 font-mono text-[11px] font-normal tracking-wide text-paper/45">docs ready</span>
          </p>
          <p className="mt-3 text-[12.5px] leading-relaxed text-paper/55">
            {failed > 0
              ? `${failed} failed job${failed === 1 ? "" : "s"} — retry or delete them in Synapse.`
              : `${parked} still processing · ${ready} extracted, chunked and ready for the Phase 6 analysis engine. Real counts, not projections.`}
          </p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* future tracking */}
        <div className="rounded-xl border border-ink-900/12 bg-paper-card p-7 lg:col-span-3">
          <PanelHead title="What will be tracked" tag="phase 4" />
          <ul className="mt-5 divide-y divide-ink-900/[0.07]">
            {FUTURE_TRACKING.map((f) => (
              <li key={f.k} className="flex items-center justify-between gap-4 py-3.5">
                <div>
                  <p className="font-display text-[14px] font-semibold text-ink-800">{f.k}</p>
                  <p className="text-[12px] text-ink-400">{f.note}</p>
                </div>
                <span className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-300">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-300" />
                  idle
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[12.5px] leading-relaxed text-ink-500">
            No fake limits are displayed. Quotas and ceilings appear only when the quota system
            actually exists.
          </p>
        </div>

        {/* plan context */}
        <div className="flex flex-col rounded-xl border border-ink-800 bg-ink-950 p-7 text-paper lg:col-span-2">
          <div className="bg-grid-dark pointer-events-none absolute" />
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-pulse-300">Current plan</p>
          <p className="mt-3 font-display text-3xl font-bold tracking-tight">
            Free <span className="font-mono text-[11px] font-normal tracking-wide text-paper/45">· preliminary</span>
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-paper/55">
            Phase 3 has no billing. Plan tiers on the pricing page are conceptual and will be
            finalized before launch.
          </p>
          <div className="mt-6 space-y-2 border-t border-paper/10 pt-5 font-mono text-[10.5px] tracking-wide text-paper/45">
            <p className="flex items-center gap-2.5">
              <IconGauge size={13} className="text-pulse-300" /> metering engine · standby
            </p>
            <p className="flex items-center gap-2.5">
              <span className="ping-dot inline-block h-1.5 w-1.5 rounded-full bg-pulse-400" /> account · active
            </p>
          </div>
          <Link
            to="/pricing"
            className="group mt-auto inline-flex items-center gap-2 pt-6 font-display text-[13.5px] font-semibold text-pulse-300 transition-colors hover:text-pulse-200"
          >
            Review preliminary pricing
            <IconArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}
