import { useEffect, useMemo, useRef, useState } from "react";
import { NEUROSURGERY_FAULTS } from "./content";
import { usePrefersReducedMotion } from "./hooks";
import { ButtonLink, Eyebrow, Reveal, Tag } from "./ui";

type Phase = "idle" | "diagnosing" | "faulty" | "repairing" | "repaired";

const LAYER_X = [48, 170, 292, 378];
const LAYER_N = [3, 5, 4, 2];
const DEAD = { layer: 1, idx: 2 };

function ny(layer: number, idx: number) {
  const n = LAYER_N[layer];
  return n === 1 ? 150 : 32 + (236 / (n - 1)) * idx;
}

const BOOT_LOG = [
  "> neurosurgery session 0041",
  "> model mlp-4l loaded — 3,482 params",
  "> checkpoint flagged by trainer · loss diverging",
  "> awaiting diagnosis …",
];

export default function NeuroSurgerySection() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<string[]>(BOOT_LOG);
  const timers = useRef<number[]>([]);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const schedule = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const push = (line: string) => setLog((l) => [...l, line]);

  const runDiagnosis = () => {
    if (phase === "diagnosing" || phase === "repairing") return;
    if (phase === "repaired") {
      setPhase("diagnosing");
      push("> rescan requested …");
      schedule(700, () => push("✓ rescan clean — 0 faults, gradients nominal"));
      schedule(900, () => setPhase("repaired"));
      return;
    }
    setPhase("diagnosing");
    setLog(["> diagnosis started"]);
    schedule(300, () => push("> loading checkpoint mlp-4l.pt"));
    schedule(900, () => push("> forward pass complete — loss 2.31 (expected ≈ 0.42)"));
    schedule(1500, () => push("> backward scan — gradient flow 34%"));
    schedule(2100, () => push("! fault: dead unit l1·n3 — zero activation across batches"));
    schedule(2700, () => push("! fault: exploding weight l2→l3 — grad norm 41.7"));
    schedule(3300, () => {
      push("✓ diagnosis complete — 2 faults isolated");
      setPhase("faulty");
    });
  };

  const runRepair = () => {
    if (phase !== "faulty") return;
    setPhase("repairing");
    push("> repair plan accepted");
    schedule(400, () => push("→ reinitializing l1·n3 (he-normal)"));
    schedule(1000, () => push("→ applying gradient clipping (max-norm 1.0)"));
    schedule(1600, () => push("→ rerunning training loop … loss 0.39 ↓"));
    schedule(2200, () => {
      push("✓ model health restored — gradients stable");
      setPhase("repaired");
    });
  };

  const reset = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    setPhase("idle");
    setLog(BOOT_LOG);
  };

  /* ---- network geometry ---- */
  const neurons = useMemo(
    () =>
      LAYER_N.flatMap((count, l) =>
        Array.from({ length: count }, (_, i) => ({ id: `${l}-${i}`, l, i, x: LAYER_X[l], y: ny(l, i) })),
      ),
    [],
  );
  const byId = useMemo(() => Object.fromEntries(neurons.map((n) => [n.id, n])), [neurons]);

  const edges = useMemo(() => {
    const out: { a: string; b: string; explode: boolean }[] = [];
    for (let l = 0; l < LAYER_N.length - 1; l += 1) {
      for (let i = 0; i < LAYER_N[l]; i += 1) {
        for (let j = 0; j < LAYER_N[l + 1]; j += 1) {
          out.push({
            a: `${l}-${i}`,
            b: `${l + 1}-${j}`,
            explode: l === DEAD.layer && i === DEAD.idx - 1 && j === DEAD.idx,
          });
        }
      }
    }
    return out;
  }, []);

  const showFaults = phase === "faulty" || phase === "repairing";
  const healthy = phase === "repaired";
  const deadId = `${DEAD.layer}-${DEAD.idx}`;

  const pulsePaths = useMemo(() => {
    const chain = (ids: string[]) =>
      ids
        .map((id, i) => `${i === 0 ? "M" : "L"}${byId[id].x} ${byId[id].y}`)
        .join(" ");
    return [
      chain(["0-0", "1-0", "2-0", "3-0"]),
      chain(["0-1", "1-1", "2-1", "3-0"]),
      chain(["0-2", "1-3", "2-3", "3-1"]),
      chain(["0-1", "1-2", "2-2", "3-1"]),
    ];
  }, [byId]);

  const metrics = {
    grad: phase === "faulty" || phase === "repairing" ? 34 : healthy ? 92 : null,
    integ: phase === "faulty" || phase === "repairing" ? 47 : healthy ? 96 : null,
    dead: showFaults ? 1 : healthy ? 0 : null,
  };

  return (
    <section id="neurosurgery" className="relative scroll-mt-20 bg-paper pb-10 lg:pb-14">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-10">
          {/* lab visual */}
          <div className="order-2 lg:order-1 lg:col-span-7">
            <Reveal delay={160}>
              <div className="overflow-hidden rounded-md border border-ink-800 bg-ink-950 text-paper shadow-[0_25px_60px_-25px_rgba(6,15,24,0.6)]">
                <div className="flex items-center justify-between border-b border-paper/10 px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-ink-600" />
                    <span className="h-1.5 w-1.5 rounded-full bg-signal-400/80" />
                    <span className="h-1.5 w-1.5 rounded-full bg-ink-600" />
                  </div>
                  <p className="font-mono text-[8.5px] tracking-[0.16em] text-paper/50">
                    NEUROSURGERY — SESSION 0041
                  </p>
                  <p className="font-mono text-[8.5px] text-paper/40">model: mlp-4l</p>
                </div>

                <div className="grid gap-2.5 p-2.5 sm:p-3 md:grid-cols-5">
                  {/* network */}
                  <div className="relative rounded-sm border border-paper/10 bg-ink-900/70 md:col-span-3">
                    <svg viewBox="0 0 420 300" className="h-auto w-full" role="img" aria-label="Neural network with diagnosable faults">
                      {edges.map((e) => {
                        const a = byId[e.a];
                        const b = byId[e.b];
                        const deadTouching = showFaults && (e.a === deadId || e.b === deadId);
                        const hot = e.explode && showFaults;
                        return (
                          <line
                            key={`${e.a}_${e.b}`}
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke={
                              hot
                                ? "var(--color-signal-400)"
                                : healthy && !deadTouching
                                  ? "rgba(124,228,208,0.22)"
                                  : deadTouching
                                    ? "rgba(139,164,180,0.12)"
                                    : "rgba(139,164,180,0.18)"
                            }
                            strokeWidth={hot ? 2.4 : 1}
                            className={hot && !reduced ? "edge-flow" : ""}
                            style={{ transition: "stroke .4s ease" }}
                          />
                        );
                      })}

                      {!reduced &&
                        pulsePaths.slice(0, showFaults ? 2 : 4).map((p, i) => (
                          <circle
                            key={i}
                            r="2.6"
                            fill={healthy ? "var(--color-pulse-300)" : "rgba(242,244,239,0.75)"}
                            opacity="0.85"
                          >
                            <animateMotion dur={`${3.2 + i * 0.7}s`} begin={`${i * 0.8}s`} repeatCount="indefinite" path={p} />
                          </circle>
                        ))}

                      {neurons.map((n) => {
                        const isDead = n.id === deadId;
                        const deadVisible = isDead && showFaults;
                        const revived = isDead && healthy;
                        return (
                          <g key={n.id}>
                            {deadVisible && (
                              <circle
                                cx={n.x}
                                cy={n.y}
                                r="17"
                                fill="none"
                                stroke="var(--color-signal-400)"
                                strokeWidth="1"
                                strokeDasharray="3 5"
                                className={reduced ? "" : "anim-breathe"}
                              />
                            )}
                            <circle
                              cx={n.x}
                              cy={n.y}
                              r="10"
                              fill={
                                deadVisible
                                  ? "var(--color-ink-700)"
                                  : revived
                                    ? "var(--color-pulse-500)"
                                    : "var(--color-ink-800)"
                              }
                              stroke={
                                deadVisible
                                  ? "var(--color-signal-400)"
                                  : revived
                                    ? "var(--color-pulse-300)"
                                    : "rgba(139,164,180,0.5)"
                              }
                              strokeWidth="1.3"
                              style={{ transition: "all .45s ease" }}
                            />
                            {deadVisible && (
                              <g stroke="var(--color-signal-300)" strokeWidth="1.4" strokeLinecap="round">
                                <path d={`M${n.x - 3.5} ${n.y - 3.5} L${n.x + 3.5} ${n.y + 3.5}`} />
                                <path d={`M${n.x + 3.5} ${n.y - 3.5} L${n.x - 3.5} ${n.y + 3.5}`} />
                              </g>
                            )}
                            {revived && <circle cx={n.x} cy={n.y} r="3.2" fill="var(--color-pulse-200)" />}
                          </g>
                        );
                      })}

                      {/* layer labels */}
                      {LAYER_X.map((x, l) => (
                        <text
                          key={l}
                          x={x}
                          y="292"
                          textAnchor="middle"
                          fontFamily="var(--font-mono)"
                          fontSize="9"
                          letterSpacing="1.5"
                          fill="rgba(139,164,180,0.55)"
                        >
                          {["IN", "H1", "H2", "OUT"][l]}
                        </text>
                      ))}
                    </svg>
                    <p className="absolute left-1.5 top-1.5 font-mono text-[8px] tracking-[0.18em] text-paper/35">
                      TOPOLOGY 3·5·4·2
                    </p>
                  </div>

                  {/* console */}
                  <div className="flex flex-col md:col-span-2">
                    <div
                      ref={consoleRef}
                      className="h-28 flex-1 overflow-y-auto rounded-sm border border-paper/10 bg-ink-900 p-2 font-mono text-[9.5px] leading-[1.6] tracking-wide"
                      aria-live="polite"
                    >
                      {log.map((line, i) => (
                        <p
                          key={i}
                          className={
                            line.startsWith("!")
                              ? "text-signal-400"
                              : line.startsWith("✓")
                                ? "text-pulse-300"
                                : line.startsWith("→")
                                  ? "text-pulse-200/90"
                                  : "text-paper/55"
                          }
                        >
                          {line}
                        </p>
                      ))}
                      {(phase === "diagnosing" || phase === "repairing") && (
                        <p className="anim-blink text-pulse-300">▍</p>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={runDiagnosis}
                        disabled={phase === "diagnosing" || phase === "repairing"}
                        className="rounded-full bg-pulse-400 px-3 py-1.5 font-display text-[10.5px] font-semibold text-ink-950 transition-all hover:bg-pulse-300 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {phase === "repaired" ? "Rescan" : "Run diagnosis"}
                      </button>
                      <button
                        type="button"
                        onClick={runRepair}
                        disabled={phase !== "faulty"}
                        className="rounded-full border border-signal-400/60 px-3 py-1.5 font-display text-[10.5px] font-semibold text-signal-300 transition-all hover:bg-signal-400 hover:text-ink-950 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-signal-300"
                      >
                        Apply repair
                      </button>
                      <button
                        type="button"
                        onClick={reset}
                        disabled={phase === "idle"}
                        className="rounded-full px-2 py-1.5 font-mono text-[9.5px] tracking-wide text-paper/50 transition-colors hover:text-paper disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        reset
                      </button>
                    </div>
                  </div>
                </div>

                {/* metrics */}
                <div className="grid grid-cols-2 divide-x divide-paper/10 border-t border-paper/10 md:grid-cols-4">
                  {[
                    { label: "gradient flow", value: metrics.grad, unit: "%", invert: false },
                    { label: "signal integrity", value: metrics.integ, unit: "%", invert: false },
                  ].map((m) => (
                    <div key={m.label} className="px-2.5 py-2">
                      <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-paper/40">
                        {m.label}
                      </p>
                      <p className="tnum mt-0.5 font-display text-base font-semibold">
                        {m.value === null ? <span className="text-paper/30">—</span> : (
                          <>
                            <span className={m.value < 50 ? "text-signal-400" : "text-pulse-300"}>
                              {m.value}
                            </span>
                            <span className="text-[9.5px] text-paper/40">{m.unit}</span>
                          </>
                        )}
                      </p>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-paper/10">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${
                            m.value !== null && m.value < 50 ? "bg-signal-400" : "bg-pulse-400"
                          }`}
                          style={{ width: `${m.value ?? 0}%` }}
                        />
                      </div>
                    </div>
                  ))}

                  <div className="px-2.5 py-2">
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-paper/40">
                      dead units
                    </p>
                    <p className="tnum mt-1 font-display text-lg font-semibold">
                      {metrics.dead === null ? (
                        <span className="text-paper/30">—</span>
                      ) : (
                        <span className={metrics.dead > 0 ? "text-signal-400" : "text-pulse-300"}>
                          {metrics.dead}
                        </span>
                      )}
                    </p>
                    <p className="mt-1.5 font-mono text-[8.5px] tracking-wide text-paper/35">
                      {metrics.dead === null ? "scan to inspect" : metrics.dead > 0 ? "l1·n3 silent" : "all firing"}
                    </p>
                  </div>

                  <div className="px-3 py-2.5">
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-paper/40">
                      loss trend
                    </p>
                    <svg viewBox="0 0 120 34" className="mt-1.5 h-7 w-full" aria-hidden>
                      <path
                        d="M2 22 C 30 20, 55 14, 80 9 S 112 4, 118 3"
                        fill="none"
                        stroke="var(--color-signal-400)"
                        strokeWidth="1.6"
                        opacity={showFaults ? 1 : 0}
                        style={{ transition: "opacity .5s ease" }}
                      />
                      <path
                        d="M2 4 C 30 24, 60 30, 118 31"
                        fill="none"
                        stroke="var(--color-pulse-300)"
                        strokeWidth="1.6"
                        opacity={healthy ? 1 : 0}
                        style={{ transition: "opacity .5s ease" }}
                      />
                      <path
                        d="M2 16 H 118"
                        stroke="rgba(139,164,180,0.25)"
                        strokeWidth="1"
                        strokeDasharray="2 4"
                        opacity={metrics.grad === null ? 1 : 0}
                        style={{ transition: "opacity .5s ease" }}
                      />
                    </svg>
                    <p className="font-mono text-[8.5px] tracking-wide text-paper/35">
                      {showFaults ? "diverging" : healthy ? "converging" : "no data"}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* copy */}
          <div className="order-1 lg:order-2 lg:col-span-5">
            <Reveal>
              <Eyebrow className="text-signal-600 text-sm">NeuroSurgery · Debug Lab</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-4xl">
                Break an AI model.
                <br />
                Diagnose it. <span className="text-pulse-600">Fix it.</span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-4 text-base leading-relaxed text-ink-600">
                NeuroSurgery turns machine-learning debugging into an interactive experience.
                Diagnose overfitting, dead neurons, vanishing gradients, exploding gradients, poor
                learning rates, and other model failures.
              </p>
            </Reveal>
            <Reveal delay={200}>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {NEUROSURGERY_FAULTS.map((f) => (
                  <Tag key={f} tone="dark" className="hover:border-signal-500 hover:text-signal-600 text-xs">
                    {f}
                  </Tag>
                ))}
              </div>
            </Reveal>
            <Reveal delay={280}>
              <p className="mt-5 font-mono text-[10px] tracking-wide text-ink-400">
                focused on ML · deep learning · neural networks
              </p>
              <div className="mt-5">
                <ButtonLink to="/neurosurgery" variant="dark" arrow className="text-sm px-4 py-2">
                  Explore NeuroSurgery
                </ButtonLink>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
