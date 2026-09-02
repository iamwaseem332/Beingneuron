import { Link } from "react-router-dom";
import { CHALLENGES, VITALS } from "./appData";
import ChallengeCard from "./ChallengeCard";
import { PageHeader } from "./states";
import { useNsgProgress } from "./nsgProgress";
import { recordKey } from "./nsgProgress";
import { IconArrowUpRight, IconCheck, IconPlay } from "../icons";

/* ---------- model vitals — live in the lab ---------- */

function VitalsPanel() {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-950 text-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-paper/10 px-6 py-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal-300">Model Vitals</p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Measured, never simulated.</h2>
        </div>
        <Link
          to="/app/neurosurgery/overfitting"
          className="group flex items-center gap-2 rounded-full border border-signal-400/40 px-3.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-signal-300 transition-all hover:bg-signal-400 hover:text-ink-950"
        >
          <span className="anim-breathe inline-block h-1.5 w-1.5 rounded-full bg-signal-400 group-hover:bg-ink-950" />
          live in the lab
        </Link>
      </div>

      <div className="bg-grid-dark grid grid-cols-2 gap-px bg-paper/[0.06] sm:grid-cols-3 lg:grid-cols-5">
        {VITALS.map((v) => (
          <div key={v.label} className="group bg-ink-950 px-5 py-5 transition-colors duration-300 hover:bg-ink-900">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-paper/40">{v.label}</p>
            <p className="tnum mt-2.5 font-display text-3xl font-bold tracking-tight text-paper/25 transition-colors duration-300 group-hover:text-pulse-300/70">
              ·
            </p>
            <p className="mt-1.5 font-mono text-[9.5px] tracking-wide text-paper/35">{v.note}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-paper/10 px-6 py-3.5">
        <p className="font-mono text-[10px] tracking-wide text-paper/40">
          these are populated by real training runs — full-batch gradients, held-out evaluation, dead-unit census
        </p>
        <p className="font-mono text-[10px] tracking-wide text-pulse-300/70">engine · live</p>
      </div>
    </div>
  );
}

/* ---------- how a surgery works ---------- */

const SURGERY_STEPS = [
  { k: "load the fault", d: "a scenario ships with a seeded model + dataset that reproduce one failure mode" },
  { k: "read the vitals", d: "loss curves, gradient norms, activation stats and dead-neuron ratios from the actual run" },
  { k: "intervene", d: "learning rate, activation, widths, dropout, regularization, initialization, epochs" },
  { k: "retrain & verify", d: "the verdict is computed from measured metrics — not a thumbs-up from us" },
];

/* ---------- surgical record (your own progress, never invented) ---------- */

function SurgicalRecord() {
  const { totals, loading } = useNsgProgress();
  const cells = [
    { k: "scenarios attempted", v: totals.attempted, note: "any difficulty · ≥1 run" },
    { k: "cases repaired", v: totals.completed, note: "all criteria met, once or more" },
    {
      k: "best repair",
      v: totals.bestSteps !== null ? `${totals.bestSteps} intervention${totals.bestSteps === 1 ? "" : "s"}` : "—",
      note: "fewest runs to a repair",
    },
    { k: "difficulty levels", v: 3, note: "beginner · intermediate · advanced" },
  ];
  return (
    <section aria-label="Your surgical record" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-800 bg-ink-800 lg:grid-cols-4">
      {cells.map((c) => (
        <div key={c.k} className="group bg-ink-950 px-5 py-4 transition-colors duration-300 hover:bg-ink-900">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-paper/40">{c.k}</p>
          <p className="tnum mt-1.5 font-display text-[1.55rem] font-bold leading-none tracking-tight text-paper transition-colors duration-300 group-hover:text-pulse-300">
            {loading ? "…" : c.v}
          </p>
          <p className="mt-1.5 font-mono text-[9px] tracking-wide text-paper/35">{c.note}</p>
        </div>
      ))}
    </section>
  );
}

/* ================= page ================= */

export default function NeuroSurgeryPage() {
  const { records } = useNsgProgress();

  const statusOf = (slug: string): string => {
    // best record across difficulties for this scenario
    const recs = (["beginner", "intermediate", "advanced"] as const)
      .map((d) => records[recordKey(slug, d)])
      .filter(Boolean);
    const repaired = recs.find((r) => r?.completed);
    if (repaired) return `repaired · ${repaired.difficulty}`;
    const attempted = recs.find((r) => (r?.attempts ?? 0) > 0);
    if (attempted) return `in progress · ${attempted.attempts} run${attempted.attempts === 1 ? "" : "s"}`;
    return "live · real simulation";
  };

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Learn & Experiment · NeuroSurgery"
        title={[<>Break models. Diagnose failures.</>, <span className="text-pulse-600">Repair neural networks.</span>]}
        lede="An interactive lab for machine learning. Every scenario trains a real (small) network in your browser — forward propagation, backprop, SGD — and every metric you see is computed from that run."
      />

      <SurgicalRecord />

      <VitalsPanel />

      <section aria-labelledby="nsg-challenges">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-pulse-600">
              <span className="inline-block h-[7px] w-[7px] rotate-45 bg-current opacity-80" />
              Scenario registry
            </p>
            <h2 id="nsg-challenges" className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-[1.7rem]">
              Seven failure modes, live now.
            </h2>
          </div>
          <p className="font-mono text-[10.5px] tracking-wide text-ink-400">deterministic seeds · real gradients</p>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {CHALLENGES.map((c) => {
            const status = c.live ? statusOf(c.slug) : "arrives with the engine";
            const done = status.startsWith("repaired");
            return (
              <div key={c.slug} className="relative">
                <ChallengeCard def={c} to={c.to} statusLabel={status} />
                {done && (
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-pulse-500 text-paper-card shadow-[0_4px_12px_-4px_rgba(18,163,146,0.7)]"
                    title="Repaired — all success criteria met"
                  >
                    <IconCheck size={12} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* how a surgery works + CTA */}
      <section aria-label="How a surgery works" className="overflow-hidden rounded-xl border border-ink-900/12 bg-paper-card">
        <div className="border-b border-ink-900/[0.08] px-6 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal-600">Operating procedure</p>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-ink-900">How a surgery works.</h2>
        </div>
        <div className="grid gap-px bg-ink-900/[0.07] sm:grid-cols-2 lg:grid-cols-4">
          {SURGERY_STEPS.map((s, i) => (
            <div key={s.k} className="group bg-paper-card px-6 py-6 transition-colors duration-300 hover:bg-pulse-100/40">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-pulse-600">
                0{i + 1} · {s.k}
              </p>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-600">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-start justify-between gap-5 border-t border-ink-900/[0.08] px-6 py-6 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-display text-xl font-semibold tracking-tight text-ink-900">The lab is open.</h3>
            <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-ink-500">
              Start with overfitting — train loss collapses, validation loss climbs, and it's your
              job to regularize the model back to health.
            </p>
          </div>
          <Link
            to="/app/neurosurgery/overfitting"
            className="group inline-flex shrink-0 items-center gap-2.5 rounded-full bg-pulse-400 px-6 py-3 font-display text-[14.5px] font-semibold text-ink-950 transition-all duration-300 hover:bg-pulse-300 active:scale-[0.98]"
          >
            <IconPlay size={16} className="transition-transform duration-300 group-hover:scale-110" />
            Start a Challenge
            <IconArrowUpRight size={14} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
