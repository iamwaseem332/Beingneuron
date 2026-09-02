import { useMemo, useState } from "react";
import { STEPS } from "./content";
import { usePrefersReducedMotion, useScramble } from "./hooks";
import { ButtonLink, Eyebrow, Reveal, SectionHead } from "./ui";
import { scrollToSection } from "./Nav";
import { IconCompass, IconLens, IconSliders, IconGraph, IconDoc, IconPulse } from "./icons";

/* ================= HOW IT WORKS ================= */

export function HowItWorks() {
  const icons = [IconCompass, IconLens, IconSliders];
  return (
    <section id="how" className="relative scroll-mt-20 overflow-hidden bg-ink-950 py-24 text-paper lg:py-28">
      <div className="bg-grid-dark absolute inset-0 opacity-70" />
      <div className="absolute -right-52 top-0 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.12),transparent_62%)]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHead
          dark
          eyebrow="How BeingNeuron works"
          title={
            <>
              From paper to <span className="text-pulse-300">working intuition</span>.
            </>
          }
          lede="Three movements — the same loop researchers and engineers already run, made visible and interactive."
        />

        <div className="relative mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => {
            const Icon = icons[i];
            const stagger = ["md:mt-0", "md:mt-10", "md:mt-20"][i];
            return (
              <Reveal key={s.n} delay={i * 140} className={`relative ${stagger}`}>
                <div className="relative">
                  <span className="relative z-10 inline-flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-pulse-400 bg-ink-950">
                    <span className="h-[5px] w-[5px] rounded-full bg-pulse-400" />
                  </span>
                  <div className="mt-6 flex items-center gap-4">
                    <span className="font-mono text-sm tracking-[0.2em] text-pulse-300/70">{s.n}</span>
                    <Icon size={26} className="text-paper/70" />
                  </div>
                  <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-3 text-[15.5px] font-medium leading-snug text-paper/85">{s.core}</p>
                  <p className="mt-2.5 text-sm leading-relaxed text-paper/50">{s.detail}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ================= WHY BEINGNEURON ================= */

const MODES = [
  { id: "text", label: "Static text" },
  { id: "graph", label: "Knowledge graph" },
  { id: "model", label: "Live model" },
] as const;

function InteractiveDemo() {
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("graph");
  const reduced = usePrefersReducedMotion();
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`rounded-full border px-3.5 py-1.5 font-mono text-[10.5px] tracking-wide transition-all duration-300 ${
              mode === m.id
                ? "border-pulse-500 bg-pulse-500 text-paper-card"
                : "border-ink-900/15 text-ink-500 hover:border-ink-900/40 hover:text-ink-900"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="mt-4 h-[118px] overflow-hidden rounded-lg border border-ink-900/10 bg-paper p-4">
        {mode === "text" && (
          <div className="space-y-2.5">
            {[92, 100, 78, 96, 60].map((w, i) => (
              <div key={i} className="h-2 rounded-full bg-ink-900/12" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
        {mode === "graph" && (
          <svg viewBox="0 0 260 90" className="h-full w-full">
            {[
              [40, 45, 110, 20],
              [110, 20, 185, 42],
              [110, 20, 130, 72],
              [40, 45, 130, 72],
              [185, 42, 225, 70],
            ].map(([x1, y1, x2, y2], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(18,163,146,0.5)" strokeWidth="1.2" />
            ))}
            {[
              [40, 45, 9],
              [110, 20, 7],
              [185, 42, 8],
              [130, 72, 6],
              [225, 70, 5],
            ].map(([x, y, r], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={r}
                fill={i === 0 ? "var(--color-pulse-400)" : "var(--color-pulse-100)"}
                stroke="var(--color-pulse-600)"
                strokeWidth="1.2"
                className={reduced || i !== 0 ? "" : "anim-breathe"}
              />
            ))}
          </svg>
        )}
        {mode === "model" && (
          <div className="flex h-full items-end gap-1.5">
            {[38, 52, 44, 66, 58, 74, 62, 82, 70, 88].map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-sm bg-pulse-400/80 transition-all duration-500 ${reduced ? "" : "anim-breathe"}`}
                style={{ height: `${h}%`, animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LearningRateDemo() {
  const [v, setV] = useState(22);
  const lr = ((v / 100) ** 2) * 0.6;
  const diverging = lr > 0.16;

  const points = useMemo(() => {
    const pts: string[] = [];
    for (let x = 0; x <= 220; x += 10) {
      const decay = 78 * Math.exp(-x / 70);
      const osc = Math.sin(x / 13) * lr * 90;
      const blow = diverging ? (x / 220) ** 2 * lr * 380 : 0;
      const y = Math.max(6, Math.min(96, 12 + decay + osc + blow));
      pts.push(`${x},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [lr, diverging]);

  return (
    <div>
      <svg viewBox="0 0 220 100" className="h-[104px] w-full rounded-lg border border-ink-900/10 bg-paper">
        <line x1="0" y1="90" x2="220" y2="90" stroke="rgba(11,26,38,0.15)" strokeWidth="1" />
        <polyline
          points={points}
          fill="none"
          stroke={diverging ? "var(--color-signal-500)" : "var(--color-pulse-500)"}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-ink-900/12 accent-[#12a392]"
          aria-label="Learning rate"
        />
        <span
          className={`tnum w-[86px] text-right font-mono text-[11px] ${diverging ? "text-signal-600" : "text-pulse-600"}`}
        >
          lr {lr.toFixed(3)}
        </span>
      </div>
    </div>
  );
}

export function WhyBeingNeuron() {
  return (
    <section id="why" className="relative scroll-mt-20 bg-paper py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHead
            eyebrow="Why BeingNeuron"
            title="Built for working understanding."
            lede="Not a reading app, not a course player — an instrument for people who need to actually grasp how research and models behave."
          />
          <p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-400">
            04 properties
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-12">
          {/* Interactive — wide */}
          <Reveal className="md:col-span-7">
            <div className="card-lift h-full rounded-xl border border-ink-900/12 bg-paper-card p-7 hover:border-pulse-500/50">
              <div className="flex items-start justify-between">
                <Eyebrow className="text-pulse-600">01 · Interactive</Eyebrow>
                <IconPulse size={22} className="text-ink-300" />
              </div>
              <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink-900">
                Go beyond static text.
              </h3>
              <p className="mt-2.5 max-w-md text-[15px] leading-relaxed text-ink-600">
                Papers become graphs you can traverse; models become systems you can probe. Try the
                switch — same content, different instrument.
              </p>
              <div className="mt-6">
                <InteractiveDemo />
              </div>
            </div>
          </Reveal>

          {/* Evidence-backed */}
          <Reveal delay={120} className="md:col-span-5">
            <div className="card-lift group h-full rounded-xl border border-ink-900/12 bg-paper-card p-7 hover:border-pulse-500/50">
              <div className="flex items-start justify-between">
                <Eyebrow className="text-pulse-600">02 · Evidence-backed</Eyebrow>
                <IconDoc size={22} className="text-ink-300" />
              </div>
              <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink-900">
                Every insight carries its source.
              </h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-ink-600">
                Connect research insights to the exact passages they came from — hover to trace.
              </p>
              <div className="mt-6 rounded-lg border border-ink-900/10 bg-paper p-4">
                <p className="text-[13px] font-medium leading-snug text-ink-800">
                  “Eligibility traces bridge the spike–reward delay.”
                </p>
                <div className="relative my-3 h-px w-full origin-left scale-x-0 bg-pulse-500 transition-transform duration-500 group-hover:scale-x-100">
                  <span className="absolute -top-[3px] right-0 h-[7px] w-[7px] rounded-full bg-pulse-500" />
                </div>
                <div className="flex items-center justify-between font-mono text-[10px] tracking-wide">
                  <span className="text-ink-400">claim · node 04</span>
                  <span className="rounded-full border border-pulse-500/40 px-2 py-0.5 text-pulse-700">
                    §2 · p.4 · lines 11–13
                  </span>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Hands-on */}
          <Reveal className="md:col-span-5">
            <div className="card-lift h-full rounded-xl border border-ink-900/12 bg-paper-card p-7 hover:border-pulse-500/50">
              <div className="flex items-start justify-between">
                <Eyebrow className="text-pulse-600">03 · Hands-on</Eyebrow>
                <IconSliders size={22} className="text-ink-300" />
              </div>
              <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink-900">
                Learn AI by experimenting.
              </h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-ink-600">
                Push a hyperparameter and watch training respond. Drag the learning rate:
              </p>
              <div className="mt-6">
                <LearningRateDemo />
              </div>
            </div>
          </Reveal>

          {/* Research-focused — wide */}
          <Reveal delay={120} className="md:col-span-7">
            <div className="card-lift h-full rounded-xl border border-ink-900/12 bg-paper-card p-7 hover:border-pulse-500/50">
              <div className="flex items-start justify-between">
                <Eyebrow className="text-pulse-600">04 · Research-focused</Eyebrow>
                <IconGraph size={22} className="text-ink-300" />
              </div>
              <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink-900">
                Made for people who read papers and build models.
              </h3>
              <p className="mt-2.5 max-w-lg text-[15px] leading-relaxed text-ink-600">
                Designed for students, researchers, developers, and technical learners — anyone who
                wants the machinery of research and AI to be legible.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Students", "Researchers", "Developers", "Technical learners"].map((p) => (
                  <span
                    key={p}
                    className="rounded-full border border-ink-900/12 px-4 py-1.5 font-mono text-[11px] tracking-wide text-ink-600 transition-all duration-300 hover:-translate-y-0.5 hover:border-pulse-500 hover:text-pulse-700"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ================= CTA BAND ================= */

export function CTABand() {
  const reduced = usePrefersReducedMotion();
  const kicker = useScramble("PHASE 01 — OPEN PREVIEW", 200);
  return (
    <section className="relative overflow-hidden bg-ink-950 py-24 text-paper lg:py-28">
      <div className="bg-grid-dark absolute inset-0" />
      <div className="absolute left-1/2 top-1/2 h-[620px] w-[920px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(18,163,146,0.14),transparent_62%)]" />
      <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
        <p className="font-mono text-[11px] tracking-[0.28em] text-pulse-300">{kicker}</p>
        <h2 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.4rem]">
          Start with one paper.
          <br />
          Or one <span className="text-pulse-300">broken model</span>.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-paper/60">
          The foundation is live. Create a placeholder account now and be first in when Synapse and
          NeuroSurgery come online.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <ButtonLink to="/signup" variant="primary" arrow>
            Get Started
          </ButtonLink>
          <ButtonLink variant="outline-light" onClick={() => scrollToSection("synapse", !reduced)}>
            Explore Research
          </ButtonLink>
        </div>
        <p className="mt-8 font-mono text-[10.5px] tracking-wide text-paper/35">
          interface preview · no charges · no data collection
        </p>
      </div>
    </section>
  );
}
