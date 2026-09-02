/**
 * Phase 10 — the NeuroSurgery lab.
 *
 * Every number on this page is computed by `nnEngine.ts` running a real
 * (small) neural network: forward propagation, BCE loss, backprop, SGD.
 * The charts plot actual training history; the architecture view reads the
 * trained weights; vitals are measured on the train set. Nothing is faked.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePrefersReducedMotion } from "../hooks";
import { IconAlert, IconCheck, IconPlay, IconChevron, IconX } from "../icons";
import {
  DIFFICULTIES,
  SUSPECTS,
  evaluateCriteria,
  getCase,
  getScenario,
  makeDatasets,
  trainNet,
  variantConfig,
  variantFault,
  type CriterionResult,
  type DiagnosisId,
  type Difficulty,
  type EpochRecord,
  type RunConfig,
  type Scenario,
  type TrainingResult,
  type Verdict,
} from "./nnEngine";
import { useNsgProgress, recordKey } from "./nsgProgress";

/* ================= formatting ================= */

const fl = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "NaN");
const fe = (v: number) => (Number.isFinite(v) ? v.toExponential(1) : "NaN");
const fp = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : "NaN");



/* ================= charts (real history, hoverable) ================= */

type Series = { name: string; color: string; values: number[] };

function TrainChart({
  series,
  yLog = false,
  unit = "",
  reduced,
}: {
  series: Series[];
  yLog?: boolean;
  unit?: string;
  reduced: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => setDrawn(true), 60);
    return () => window.clearTimeout(t);
  }, [reduced, series]);

  const W = 560;
  const H = 190;
  const padL = 46;
  const padR = 14;
  const padT = 12;
  const padB = 24;

  const lens = series.map((s) => s.values.length);
  const len = Math.max(0, ...lens);
  const t = (v: number) => (yLog ? Math.log10(Math.max(1e-9, v)) : v);

  const finite = series.flatMap((s) => s.values.filter(Number.isFinite).map(t));
  if (len < 2 || finite.length === 0) {
    return (
      <div className="flex h-[190px] items-center justify-center font-mono text-[10.5px] uppercase tracking-[0.18em] text-paper/35">
        not enough finite data to plot
      </div>
    );
  }
  let yMin = Math.min(...finite);
  let yMax = Math.max(...finite);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yPad = (yMax - yMin) * 0.08;
  yMin -= yPad;
  yMax += yPad;

  const x = (i: number) => padL + (i / (len - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (t(v) - yMin) / (yMax - yMin)) * (H - padT - padB);

  const paths = series.map((s) => {
    const runs: string[] = [];
    let run: string[] = [];
    s.values.forEach((v, i) => {
      if (Number.isFinite(v)) {
        run.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      } else if (run.length) {
        runs.push(run.join(" "));
        run = [];
      }
    });
    if (run.length) runs.push(run.join(" "));
    return runs;
  });

  const gridYs = [0, 1, 2, 3].map((k) => yMin + ((yMax - yMin) * k) / 3);
  const fmtAxis = (v: number) => {
    if (yLog) {
      const e = Math.round(v);
      return `1e${e}`;
    }
    return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((mx - padL) / (W - padL - padR)) * (len - 1));
    setHover(Math.max(0, Math.min(len - 1, idx)));
  };

  const hoverEpoch = hover !== null ? hover + 1 : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Training chart: ${series.map((s) => s.name).join(", ")}`}
      >
        {gridYs.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(yLog ? 10 ** v : v)} x2={W - padR} y2={y(yLog ? 10 ** v : v)} stroke="rgba(242,244,239,0.07)" strokeWidth="1" />
            <text x={padL - 7} y={y(yLog ? 10 ** v : v) + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize="8.5" fill="rgba(242,244,239,0.4)">
              {fmtAxis(v)}
            </text>
          </g>
        ))}
        <text x={padL} y={H - 8} fontFamily="var(--font-mono)" fontSize="8.5" fill="rgba(242,244,239,0.4)">
          epoch 1
        </text>
        <text x={W - padR} y={H - 8} textAnchor="end" fontFamily="var(--font-mono)" fontSize="8.5" fill="rgba(242,244,239,0.4)">
          {len}
        </text>

        {paths.map((runs, si) =>
          runs.map((pts, ri) => (
            <polyline
              key={`${si}-${ri}`}
              points={pts}
              fill="none"
              stroke={series[si].color}
              strokeWidth={hover !== null ? 2 : 1.6}
              strokeLinejoin="round"
              strokeDasharray={reduced ? undefined : 2400}
              strokeDashoffset={drawn ? 0 : 2400}
              style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.22,.61,.36,1)" }}
            />
          )),
        )}

        {hover !== null && (
          <g>
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB} stroke="rgba(242,244,239,0.25)" strokeWidth="1" strokeDasharray="3 3" />
            {series.map((s, si) =>
              Number.isFinite(s.values[hover]) ? (
                <circle key={si} cx={x(hover)} cy={y(s.values[hover])} r="3.4" fill={s.color} stroke="var(--color-ink-950)" strokeWidth="1.4" />
              ) : null,
            )}
          </g>
        )}
      </svg>

      {/* legend + hover readout */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-paper/55">
            <span className="inline-block h-[3px] w-4 rounded-full" style={{ background: s.color }} />
            {s.name}
            {hover !== null && Number.isFinite(s.values[hover]) && (
              <span className="tnum text-paper/90">
                {yLog ? fe(s.values[hover]) : fl(s.values[hover], 3)}
                {unit}
              </span>
            )}
          </span>
        ))}
        {hoverEpoch !== null && <span className="ml-auto font-mono text-[9px] tracking-[0.14em] text-paper/35">epoch {hoverEpoch}</span>}
      </div>
    </div>
  );
}

/* ================= architecture visualization (real weights) ================= */

function ArchViz({
  result,
  config,
  inputDim,
  selected,
  onSelect,
}: {
  result: TrainingResult | null;
  config: RunConfig;
  inputDim: number;
  selected: number | null;
  onSelect: (i: number | null) => void;
}) {
  const hidden = result ? result.layers.slice(0, result.layers.length - 1) : null;
  const cols = [{ label: "in", units: inputDim, kind: "input" as const },
    ...(result && hidden ? hidden.map((l) => ({ label: l.name, units: l.units, kind: "hidden" as const })) : config.hidden.map((u, i) => ({ label: `h${i + 1}`, units: u, kind: "hidden" as const }))),
    { label: "out", units: 1, kind: "output" as const }];
  const nCols = cols.length;
  const W = 480;
  const H = 292;
  const cap = 10;

  const xPos = (c: number) => (nCols === 1 ? W / 2 : 52 + (c * (W - 104)) / (nCols - 1));

  // weight lookup between displayed columns
  const weightBetween = (c: number, i: number, j: number): number | null => {
    if (!result) return null;
    if (c + 1 < nCols - 1) {
      // into hidden layer c+1 → result.layers[c] (when c≥0 maps col c→c+1)
      const layer = result.layers[c]; // col c (input=0) feeds hidden layer index c
      if (!layer || j >= layer.units || i >= (c === 0 ? inputDim : result.layers[c - 1].units)) return null;
      return layer.W[j]?.[i] ?? null;
    }
    // into output
    const outLayer = result.layers[result.layers.length - 1];
    const inUnits = c === 0 ? inputDim : result.layers[c - 1].units;
    if (i >= inUnits) return null;
    return outLayer.W[0]?.[i] ?? null;
  };

  const allW: number[] = [];
  if (result) {
    for (let c = 0; c < nCols - 1; c += 1)
      for (let i = 0; i < Math.min(cols[c].units, cap); i += 1)
        for (let j = 0; j < Math.min(cols[c + 1].units, cap); j += 1) {
          const w = weightBetween(c, i, j);
          if (w !== null) allW.push(Math.abs(w));
        }
  }
  const maxAbs = Math.max(1e-6, ...allW);
  const drawEdges = result !== null && allW.length <= 320;

  const yFor = (idx: number, units: number) => {
    const shown = Math.min(units, cap);
    const gap = Math.min(26, 228 / Math.max(1, shown));
    return H / 2 - ((shown - 1) * gap) / 2 + idx * gap;
  };

  const neuronFill = (c: number, i: number): { fill: string; stroke: string; dead: boolean } => {
    if (cols[c].kind !== "hidden" || !result || !hidden) {
      return { fill: "rgba(242,244,239,0.06)", stroke: "rgba(242,244,239,0.3)", dead: false };
    }
    const layer = hidden[c - 1];
    if (!layer || i >= layer.units) return { fill: "rgba(242,244,239,0.04)", stroke: "rgba(242,244,239,0.15)", dead: false };
    if (layer.deadPerUnit[i]) return { fill: "var(--color-ink-700)", stroke: "var(--color-signal-400)", dead: true };
    const actMax = Math.max(0.2, ...layer.meanActPerUnit);
    const a = 0.18 + 0.72 * Math.min(1, layer.meanActPerUnit[i] / actMax);
    return { fill: `rgba(53,196,174,${a.toFixed(2)})`, stroke: "var(--color-pulse-400)", dead: false };
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Network architecture with trained activations">
        {drawEdges &&
          Array.from({ length: nCols - 1 }, (_, c) =>
            Array.from({ length: Math.min(cols[c].units, cap) }, (_, i) =>
              Array.from({ length: Math.min(cols[c + 1].units, cap) }, (_, j) => {
                const w = weightBetween(c, i, j);
                if (w === null) return null;
                const op = 0.07 + 0.5 * Math.min(1, Math.abs(w) / maxAbs);
                return (
                  <line
                    key={`${c}-${i}-${j}`}
                    x1={xPos(c) + 10}
                    y1={yFor(i, cols[c].units)}
                    x2={xPos(c + 1) - 10}
                    y2={yFor(j, cols[c + 1].units)}
                    stroke={w > 0 ? "var(--color-pulse-300)" : "var(--color-signal-400)"}
                    strokeOpacity={op}
                    strokeWidth={0.8}
                  />
                );
              }),
            ),
          )}

        {cols.map((col, c) => {
          const shown = Math.min(col.units, cap);
          return (
            <g key={c}>
              {Array.from({ length: shown }, (_, i) => {
                const { fill, stroke, dead } = neuronFill(c, i);
                const cx = xPos(c);
                const cy = yFor(i, col.units);
                return (
                  <g key={i}>
                    <circle cx={cx} cy={cy} r="9" fill={fill} stroke={stroke} strokeWidth="1.2" style={{ transition: "fill .4s ease" }} />
                    {dead && (
                      <g stroke="var(--color-signal-300)" strokeWidth="1.4" strokeLinecap="round">
                        <line x1={cx - 3.4} y1={cy - 3.4} x2={cx + 3.4} y2={cy + 3.4} />
                        <line x1={cx + 3.4} y1={cy - 3.4} x2={cx - 3.4} y2={cy + 3.4} />
                      </g>
                    )}
                  </g>
                );
              })}
              {col.units > cap && (
                <text x={xPos(c)} y={yFor(shown - 1, col.units) + 24} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8.5" fill="rgba(242,244,239,0.4)">
                  +{col.units - cap}
                </text>
              )}
              <g
                className={col.kind === "hidden" ? "cursor-pointer" : undefined}
                onClick={() => onSelect(col.kind === "hidden" ? c - 1 : col.kind === "output" && result ? result.layers.length - 1 : null)}
              >
                <text x={xPos(c)} y={H - 26} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="1.5" fill={selected !== null && ((col.kind === "hidden" && selected === c - 1) || (col.kind === "output" && result && selected === result.layers.length - 1)) ? "var(--color-pulse-300)" : "rgba(242,244,239,0.55)"}>
                  {col.label.toUpperCase()}
                </text>
                <text x={xPos(c)} y={H - 12} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8.5" fill="rgba(242,244,239,0.35)">
                  {col.units} unit{col.units === 1 ? "" : "s"}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      {!result && (
        <p className="mt-1 px-1 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-paper/35">
          ghost architecture — run training to load real weights
        </p>
      )}
    </div>
  );
}

/* ================= console log (derived from the actual run) ================= */

type LogLine = { kind: "info" | "ok" | "warn" | "err"; text: string };

function buildLog(sc: Scenario, r: TrainingResult, verdict: Verdict): LogLine[] {
  const cfg = r.config;
  const dims = [r.inputDim, ...cfg.hidden, 1].join("·");
  const out: LogLine[] = [
    { kind: "info", text: `session ${sc.id} · seed ${cfg.seed} · ${sc.bio.toLowerCase()}` },
    { kind: "info", text: `arch ${dims} · ${cfg.activation} · lr ${cfg.lr} · wd ${cfg.weightDecay} · dropout ${cfg.dropout}` },
  ];
  const fin = r.history.filter((h) => Number.isFinite(h.trainLoss));
  const step = Math.max(1, Math.ceil(fin.length / 6));
  fin.forEach((h, i) => {
    if (i % step === 0 || i === fin.length - 1)
      out.push({ kind: "info", text: `epoch ${h.epoch} — train ${fl(h.trainLoss)} · val ${fl(h.valLoss)} · |∇| ${fe(h.gradNorm)}` });
  });
  const deadEpoch = fin.find((h) => h.deadRatio > 0.45);
  if (deadEpoch) out.push({ kind: "warn", text: `epoch ${deadEpoch.epoch}: ${(deadEpoch.deadRatio * 100).toFixed(0)}% of ReLU units silent — neuron fatigue` });
  let climb = 0;
  let maxClimb = 0;
  let climbAt = 0;
  for (let i = 1; i < fin.length; i += 1) {
    climb = fin[i].valLoss > fin[i - 1].valLoss ? climb + 1 : 0;
    if (climb > maxClimb) {
      maxClimb = climb;
      climbAt = fin[i].epoch;
    }
  }
  if (maxClimb >= 5) out.push({ kind: "warn", text: `epoch ${climbAt}: validation loss climbed ${maxClimb} epochs straight — memorization suspected` });
  const gradBoom = fin.find((h) => h.gradNorm > 1e3);
  if (gradBoom) out.push({ kind: "warn", text: `epoch ${gradBoom.epoch}: gradient norm ${fe(gradBoom.gradNorm)} — runaway signal` });
  const lastFin = fin[fin.length - 1];
  if (lastFin && lastFin.gradNorm < 1e-6) out.push({ kind: "warn", text: `gradient norm ${fe(lastFin.gradNorm)} — the error signal is nearly gone` });
  if (r.explodedAt !== null) out.push({ kind: "err", text: `epoch ${r.explodedAt}: non-finite loss — training aborted (arithmetic overflow)` });
  out.push({ kind: verdict.repaired ? "ok" : "warn", text: `verdict: ${verdict.repaired ? "repaired" : "still symptomatic"} — ${verdict.notes[0] ?? ""}` });
  return out;
}

/* ================= vitals ================= */

const VITAL_LABELS: Record<string, { tech: string; bio: string }> = {
  trainLoss: { tech: "Training loss", bio: "Metabolic cost" },
  valLoss: { tech: "Validation loss", bio: "Real-world strain" },
  trainAcc: { tech: "Train accuracy", bio: "In-sample recall" },
  valAcc: { tech: "Val accuracy", bio: "Field performance" },
  gradNorm: { tech: "Gradient norm", bio: "Signal strength" },
  dead: { tech: "Dead neuron ratio", bio: "Neuron fatigue" },
};

function Vitals({ result, bio }: { result: TrainingResult | null; bio: boolean }) {
  const fin = result?.history.filter((h) => Number.isFinite(h.trainLoss)) ?? [];
  const last = fin[fin.length - 1];
  const first = fin[0];
  const minVal = fin.length ? Math.min(...fin.map((h) => h.valLoss)) : NaN;
  const peakGrad = fin.length ? Math.max(...fin.map((h) => h.gradNorm)) : NaN;
  const hasRelu = result?.config.activation === "relu";

  const rows: { key: string; value: string; sub: string; warn?: boolean }[] = [
    { key: "trainLoss", value: last ? fl(last.trainLoss) : "—", sub: first ? `from ${fl(first.trainLoss)}` : "awaiting run" },
    { key: "valLoss", value: last ? fl(last.valLoss) : "—", sub: fin.length ? `min ${fl(minVal)}` : "awaiting run" },
    { key: "trainAcc", value: last ? fp(last.trainAcc) : "—", sub: "measured on train set" },
    { key: "valAcc", value: last ? fp(last.valAcc) : "—", sub: "measured on held-out set" },
    { key: "gradNorm", value: last ? fe(last.gradNorm) : "—", sub: fin.length ? `peak ${fe(peakGrad)}` : "full-batch, per epoch", warn: Boolean(last && last.gradNorm > 1e3) },
  ];
  if (hasRelu && result) {
    rows.push({
      key: "dead",
      value: fp(result.finalDeadRatio),
      sub: "units with pre-activation ≤ 0 on ≥98% of samples",
      warn: result.finalDeadRatio > 0.2,
    });
  }

  return (
    <div className="divide-y divide-paper/[0.07]">
      {rows.map((r) => {
        const label = VITAL_LABELS[r.key];
        return (
          <div key={r.key} className="flex items-baseline justify-between gap-3 py-2.5">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-paper/45">
                {bio ? label.bio : label.tech}
                <span className="ml-2 normal-case tracking-normal text-paper/25">{bio ? label.tech.toLowerCase() : ""}</span>
              </p>
              <p className="mt-0.5 font-mono text-[9px] tracking-wide text-paper/30">{r.sub}</p>
            </div>
            <p className={`tnum shrink-0 font-display text-[17px] font-bold ${r.warn ? "text-signal-400" : "text-paper"}`}>{r.value}</p>
          </div>
        );
      })}
      {result?.explodedAt !== null && result?.explodedAt !== undefined && (
        <p className="flex items-center gap-2 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-signal-400">
          <IconAlert size={11} /> diverged at epoch {result.explodedAt}
        </p>
      )}
    </div>
  );
}

/* ================= the lab ================= */

export default function NeurosurgeryLab() {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const scenario = getScenario(scenarioId);
  const caseFile = scenarioId ? getCase(scenarioId) : undefined;
  const reduced = usePrefersReducedMotion();
  const { records, recordRun, recordDiagnosis, mode } = useNsgProgress();

  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const variant = caseFile?.variants[difficulty];
  const record = scenarioId && variant ? records[recordKey(scenarioId, difficulty)] : undefined;

  const [config, setConfig] = useState<RunConfig | null>(
    scenario && caseFile ? variantConfig(scenario, caseFile.variants.beginner, "beginner") : null,
  );
  const [hiddenText, setHiddenText] = useState<string>(
    scenario && caseFile ? caseFile.variants.beginner.patch.hidden?.join(", ") ?? scenario.fault.hidden.join(", ") : "",
  );
  const [hiddenErr, setHiddenErr] = useState<string | null>(null);
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [criteria, setCriteria] = useState<CriterionResult[] | null>(null);
  const [criteriaPass, setCriteriaPass] = useState(false);
  const [running, setRunning] = useState(false);
  const [bio, setBio] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);
  const [mechanismOpen, setMechanismOpen] = useState(false);
  const [suspect, setSuspect] = useState<DiagnosisId | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [interventions, setInterventions] = useState(0);

  /* difficulty change re-opens the case */
  const switchDifficulty = (d: Difficulty) => {
    if (!scenario || !caseFile || d === difficulty) return;
    setDifficulty(d);
    const v = caseFile.variants[d];
    setConfig(variantConfig(scenario, v, d));
    setHiddenText(v.patch.hidden?.join(", ") ?? scenario.fault.hidden.join(", "));
    setHiddenErr(null);
    setResult(null);
    setVerdict(null);
    setCriteria(null);
    setCriteriaPass(false);
    setSuspect(null);
    setHintsShown(0);
    setInterventions(0);
    setSelectedLayer(null);
  };

  if (!scenario || !config || !caseFile || !variant) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-ink-900/12 bg-paper-card p-10 text-center">
        <IconAlert size={26} className="mx-auto text-signal-500" />
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink-900">Unknown scenario</h2>
        <p className="mt-2 text-[13.5px] text-ink-500">“{scenarioId}” isn't in the scenario registry.</p>
        <Link to="/app/neurosurgery" className="mt-6 inline-block rounded-full bg-ink-900 px-6 py-3 font-display text-[14px] font-semibold text-paper hover:bg-ink-700">
          Back to NeuroSurgery
        </Link>
      </div>
    );
  }

  const run = (cfg: RunConfig) => {
    setRunning(true);
    window.setTimeout(() => {
      const { train, val } = makeDatasets(variantFault(scenario, variant), cfg.seed);
      const res = trainNet(train, val, cfg);
      const ev = evaluateCriteria(variant, res);
      setResult(res);
      setVerdict(scenario.evaluate(res));
      setCriteria(ev.results);
      setCriteriaPass(ev.success);
      setSelectedLayer(null);
      setInterventions((n) => n + 1);

      // real measured outcome → progress store
      const fin = res.history.filter((h) => Number.isFinite(h.valLoss));
      const last = fin[fin.length - 1];
      void recordRun(scenario.id, difficulty, {
        valAcc: last ? last.valAcc : null,
        valLoss: last ? last.valLoss : null,
        success: ev.success,
      });
      setRunning(false);
    }, 90);
  };

  const patch = (p: Partial<RunConfig>) => {
    const next = { ...config, ...p };
    setConfig(next);
    if (p.hidden) setHiddenText(p.hidden.join(", "));
    return next;
  };

  const applyFixAndRun = (p: Partial<RunConfig>) => {
    const next = patch(p);
    run(next);
  };

  const resetFault = () => {
    const base = variantConfig(scenario, variant, difficulty);
    setConfig(base);
    setHiddenText(variant.patch.hidden?.join(", ") ?? scenario.fault.hidden.join(", "));
    setHiddenErr(null);
    setResult(null);
    setVerdict(null);
    setCriteria(null);
    setCriteriaPass(false);
    setInterventions(0);
  };

  const pickSuspect = (id: DiagnosisId) => {
    setSuspect(id);
    void recordDiagnosis(scenario.id, difficulty, id, caseFile.trueFault);
  };

  const rerollSeed = () => {
    const next = { ...config, seed: 1 + Math.floor(Math.random() * 2 ** 31) };
    setConfig(next);
    setResult(null);
    setVerdict(null);
    setCriteria(null);
    setCriteriaPass(false);
    setInterventions(0);
  };

  const onHiddenChange = (v: string) => {
    setHiddenText(v);
    if (v.trim() === "") {
      setHiddenErr(null);
      setConfig({ ...config, hidden: [] });
      return;
    }
    const nums = v.split(/[,×x\s]+/).filter(Boolean).map((s) => Number(s));
    if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 48)) {
      setHiddenErr("widths must be integers 1–48");
      return;
    }
    if (nums.length > 6) {
      setHiddenErr("max 6 hidden layers");
      return;
    }
    setHiddenErr(null);
    setConfig({ ...config, hidden: nums });
  };

  const lrExp = Math.log10(Math.max(1e-5, Math.min(5, config.lr)));
  const log = result && verdict ? buildLog(scenario, result, verdict) : [];
  const selLayer = result && selectedLayer !== null ? result.layers[selectedLayer] : null;

  return (
    <div className="space-y-6">
      {/* ---------- header band · the patient file ---------- */}
      <header className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-950 text-paper">
        <div className="bg-grid-dark pointer-events-none absolute inset-0 opacity-70" />
        <div className="pointer-events-none absolute -right-20 -top-28 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(217,149,31,0.14),transparent_65%)]" />
        <div className="relative p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Link to="/app/neurosurgery" className="group inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-paper/45 transition-colors hover:text-pulse-300">
                <IconChevron size={12} className="rotate-90 transition-transform group-hover:-translate-x-0.5" />
                neurosurgery · case registry
              </Link>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal-300">{caseFile.codename}</span>
                <h1 className="font-display text-2xl font-bold tracking-tight sm:text-[2rem]">{scenario.name}</h1>
                <span className="font-display text-[15px] font-medium text-signal-300/90">· {scenario.bio}</span>
              </div>
              <p className="mt-1.5 text-[13.5px] text-paper/60">
                <span className="text-paper/40">patient</span> {caseFile.patient} — “{caseFile.complaint}”
              </p>
            </div>

            <div className="flex flex-col items-start gap-2.5">
              <div className="flex items-center gap-2">
                {record?.completed && (
                  <span className="flex items-center gap-1.5 rounded-full border border-pulse-400/40 bg-pulse-400/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-pulse-300">
                    <IconCheck size={11} /> repaired
                  </span>
                )}
                <span className={`rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] ${criteriaPass ? "border-pulse-400/40 bg-pulse-400/10 text-pulse-300" : "border-signal-400/40 bg-signal-400/10 text-signal-300"}`}>
                  {criteriaPass ? "criteria met" : "fault loaded"}
                </span>
              </div>
              <span className="font-mono text-[9.5px] tracking-wide text-paper/35">
                seed {config.seed} · {record?.attempts ?? 0} attempts logged{record?.bestSteps ? ` · best repair in ${record.bestSteps}` : ""}
              </span>
            </div>
          </div>

          {/* difficulty — three real variants of the same case */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-paper/40">difficulty</span>
            <div role="group" aria-label="Difficulty" className="flex overflow-hidden rounded-full border border-paper/20">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  title={d.blurb}
                  onClick={() => switchDifficulty(d.id)}
                  aria-pressed={difficulty === d.id}
                  className={`px-4 py-2 font-display text-[12px] font-semibold transition-all duration-200 ${
                    difficulty === d.id ? "bg-paper text-ink-950" : "text-paper/60 hover:bg-paper/[0.07] hover:text-paper"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <span className="font-mono text-[9px] tracking-wide text-paper/30">{DIFFICULTIES.find((d) => d.id === difficulty)?.blurb}</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {scenario.symptoms.map((s) => (
              <span key={s} className="rounded-full border border-paper/15 px-3 py-1.5 font-mono text-[9.5px] tracking-wide text-paper/60">
                {s}
              </span>
            ))}
          </div>

          {/* discharge summary — the mechanism, revealed */}
          <div className="mt-4 rounded-lg border border-paper/10 bg-paper/[0.03]">
            <button type="button" onClick={() => setMechanismOpen((v) => !v)} aria-expanded={mechanismOpen} className="flex w-full items-center justify-between px-4 py-3 text-left">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-pulse-300">
                {criteriaPass ? "Discharge summary · why it broke" : "Why it breaks · the actual mechanism"}
              </span>
              <IconChevron size={14} className={`text-paper/50 transition-transform duration-300 ${mechanismOpen ? "rotate-180" : ""}`} />
            </button>
            {mechanismOpen && <p className="drop-in border-t border-paper/10 px-4 py-3.5 text-[12.5px] leading-relaxed text-paper/70">{scenario.mechanism}</p>}
          </div>
        </div>
      </header>

      {/* ---------- challenge row: brief · diagnosis · criteria · hints ---------- */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {/* patient brief */}
        <section aria-label="Case brief" className="rounded-xl border border-ink-900/12 bg-paper-card p-5">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-pulse-700">Case brief</p>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-600">{scenario.tagline}</p>
          <p className="mt-3 border-t border-ink-900/[0.07] pt-3 font-mono text-[9px] leading-[1.8] tracking-wide text-ink-400">
            presenting: {scenario.symptoms.length} symptom{scenario.symptoms.length === 1 ? "" : "s"}
            <br />
            tools: vitals · loss telemetry · gradient trace · anatomy scan
            <br />
            progress: {mode === "supabase" ? "saved to your account" : "demo · this browser"}
          </p>
        </section>

        {/* working diagnosis */}
        <section aria-label="Working diagnosis" className="rounded-xl border border-ink-900/12 bg-paper-card p-5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-pulse-700">Working diagnosis</p>
            {suspect && (
              <button type="button" onClick={() => setSuspect(null)} className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-300 transition-colors hover:text-signal-600" aria-label="Clear diagnosis">
                clear
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {SUSPECTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pickSuspect(s.id)}
                aria-pressed={suspect === s.id}
                className={`rounded-lg border px-2 py-2 text-left font-display text-[11px] font-semibold leading-tight transition-all duration-200 ${
                  suspect === s.id
                    ? "border-signal-500 bg-signal-300/25 text-signal-600"
                    : "border-ink-900/12 text-ink-500 hover:border-ink-900/35 hover:text-ink-800"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-3 font-mono text-[8.5px] leading-relaxed tracking-wide text-ink-400">
            {suspect
              ? criteriaPass
                ? suspect === caseFile.trueFault
                  ? "diagnosis confirmed by the metrics — well reasoned."
                  : `you suspected ${SUSPECTS.find((s) => s.id === suspect)?.label.toLowerCase()}; the metrics indicate ${SUSPECTS.find((s) => s.id === caseFile.trueFault)?.label.toLowerCase()}.`
                : "logged. Repair the model — the metrics will confirm or correct you."
              : "optional — a hypothesis focuses the reading of the vitals. Never required."}
          </p>
        </section>

        {/* success criteria — live */}
        <section aria-label="Success criteria" className="rounded-xl border border-ink-900/12 bg-paper-card p-5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-pulse-700">Success criteria</p>
            <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-300">{difficulty} thresholds</span>
          </div>
          <ul className="mt-3 space-y-2">
            {variant.criteria.map((c) => {
              const measured = criteria?.find((m) => m.id === c.id);
              return (
                <li key={c.id} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      !measured
                        ? "border-ink-900/20 text-transparent"
                        : measured.passed
                          ? "border-pulse-500 bg-pulse-500 text-paper-card"
                          : "border-signal-500 bg-signal-300/40 text-signal-600"
                    }`}
                  >
                    {measured ? (measured.passed ? <IconCheck size={9} /> : <IconX size={9} />) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-medium leading-snug text-ink-700">{c.label}</span>
                    <span className="tnum block font-mono text-[9px] tracking-wide text-ink-400">
                      {measured ? `measured ${measured.actual}` : "awaiting a training run"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* surgical hints — progressive, capped by difficulty */}
        <section aria-label="Surgical hints" className="rounded-xl border border-ink-900/12 bg-paper-card p-5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-pulse-700">Surgical hints</p>
            <span className="tnum font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-300">
              {Math.min(hintsShown, variant.hints.length)}/{variant.hints.length}
            </span>
          </div>
          {hintsShown === 0 ? (
            <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
              Stuck after a few attempts? Hints are allowed — surgeons consult references.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {variant.hints.slice(0, hintsShown).map((h, i) => (
                <li key={i} className="drop-in rounded-lg border border-pulse-500/25 bg-pulse-100/40 px-3 py-2 text-[11.5px] leading-relaxed text-ink-700">
                  <span className="mr-1.5 font-mono text-[9px] uppercase tracking-wide text-pulse-700">0{i + 1}</span>
                  {h}
                </li>
              ))}
            </ul>
          )}
          {hintsShown < variant.hints.length && (
            <button
              type="button"
              onClick={() => setHintsShown((n) => n + 1)}
              className="mt-3 rounded-full border border-pulse-500/40 px-3.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-pulse-700 transition-all hover:bg-pulse-500 hover:text-paper-card"
            >
              reveal next hint
            </button>
          )}
          <p className="mt-3 font-mono text-[8.5px] tracking-wide text-ink-400">interventions so far: <span className="tnum text-ink-600">{interventions}</span></p>
        </section>
      </div>

      {/* ---------- workspace grid ---------- */}
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_330px]">
        {/* left: architecture */}
        <div className="space-y-4">
          <div className="rounded-xl border border-ink-800 bg-ink-950 p-4 text-paper">
            <p className="px-1 font-mono text-[9.5px] uppercase tracking-[0.2em] text-paper/45">
              Architecture · {running ? "retraining" : result ? "trained weights" : "config"}
            </p>
            <div className="mt-2">
              <ArchViz result={result} config={config} inputDim={2} selected={selectedLayer} onSelect={setSelectedLayer} />
            </div>
            <p className="mt-1 px-1 font-mono text-[8.5px] leading-relaxed tracking-wide text-paper/30">
              fill = mean |activation| · × = dead unit · teal/amber edge = weight sign · click a layer for its stats
            </p>
          </div>
          {selLayer && (
            <div className="drop-in rounded-xl border border-ink-900/12 bg-paper-card p-5">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-pulse-700">
                layer {selLayer.name} · {selLayer.activation}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  ["units", String(selLayer.units)],
                  ["dead", `${selLayer.deadUnits}`],
                  ["|∇| layer", fe(selLayer.gradNorm)],
                  ["mean |a|", fl(selLayer.meanAct, 2)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-ink-900/10 bg-paper px-3 py-2.5">
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-ink-400">{k}</p>
                    <p className="tnum mt-1 font-display text-[15px] font-bold text-ink-900">{v}</p>
                  </div>
                ))}
              </div>
              {selLayer.units > 0 && selLayer.deadUnits > 0 && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-900/10">
                  <div className="h-full rounded-full bg-signal-400 transition-all duration-500" style={{ width: `${(selLayer.deadUnits / selLayer.units) * 100}%` }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* center: charts + console + verdict */}
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-ink-800 bg-ink-950 p-4 text-paper">
            <p className="px-1 font-mono text-[9.5px] uppercase tracking-[0.2em] text-paper/45">Loss curves · BCE</p>
            <div className="mt-2">
              {result ? (
                <TrainChart
                  reduced={reduced}
                  series={[
                    { name: "train", color: "var(--color-pulse-300)", values: result.history.map((h) => h.trainLoss) },
                    { name: "validation", color: "var(--color-signal-400)", values: result.history.map((h) => h.valLoss) },
                  ]}
                />
              ) : (
                <div className="flex h-[210px] items-center justify-center font-mono text-[10px] uppercase tracking-[0.18em] text-paper/30">
                  run the model to plot real loss curves
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-ink-800 bg-ink-950 p-4 text-paper">
            <p className="px-1 font-mono text-[9.5px] uppercase tracking-[0.2em] text-paper/45">Gradient norm · log scale</p>
            <div className="mt-2">
              {result ? (
                <TrainChart reduced={reduced} yLog series={[{ name: "‖∇‖ full-train", color: "#8fb0c6", values: result.history.map((h) => h.gradNorm) }]} />
              ) : (
                <div className="flex h-[210px] items-center justify-center font-mono text-[10px] uppercase tracking-[0.18em] text-paper/30">
                  gradient telemetry appears after training
                </div>
              )}
            </div>
          </div>

          {verdict && result && (
            <div
              className={`drop-in rounded-xl border p-5 ${
                verdict.repaired ? "border-pulse-500/40 bg-pulse-100/50" : "border-signal-500/40 bg-signal-300/10"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${verdict.repaired ? "bg-pulse-500 text-paper-card" : "bg-signal-400 text-ink-950"}`}>
                  {verdict.repaired ? <IconCheck size={15} /> : <IconAlert size={15} />}
                </span>
                <div>
                  <p className={`font-display text-[16px] font-bold tracking-tight ${verdict.repaired ? "text-pulse-700" : "text-signal-600"}`}>
                    {verdict.repaired ? "Model repaired" : "Still symptomatic"}
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-400">
                    verdict computed from measured metrics — not a guess
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5">
                {verdict.notes.map((n, i) => (
                  <li key={i} className="tnum text-[12.5px] leading-relaxed text-ink-700">
                    <span className="mr-2 font-mono text-[9px] text-ink-400">{String(i + 1).padStart(2, "0")}</span>
                    {n}
                  </li>
                ))}
              </ul>
              {!verdict.repaired && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {scenario.fixes.map((fx) => (
                    <button
                      key={fx.label}
                      type="button"
                      onClick={() => applyFixAndRun(fx.patch)}
                      disabled={running}
                      className="rounded-full border border-pulse-500/40 bg-paper-card px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-pulse-700 transition-all hover:bg-pulse-500 hover:text-paper-card active:scale-95 disabled:opacity-40"
                    >
                      try: {fx.label}
                    </button>
                  ))}
                </div>
              )}
              {criteriaPass && (
                <div className="mt-4 rounded-lg border border-pulse-500/30 bg-paper-card/70 px-4 py-3">
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-pulse-700">
                    case resolved · {difficulty} · {interventions} intervention{interventions === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-700">
                    {suspect
                      ? suspect === caseFile.trueFault
                        ? `Your diagnosis — ${SUSPECTS.find((s) => s.id === suspect)?.label.toLowerCase()} — was confirmed by the measurements. The discharge summary above explains the mechanism.`
                        : `The model recovered, though your working diagnosis (${SUSPECTS.find((s) => s.id === suspect)?.label.toLowerCase()}) pointed elsewhere. Compare it with the true fault in the discharge summary.`
                      : "Repaired without committing a diagnosis — the discharge summary above names the mechanism for the record."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* console */}
          <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-950 text-paper">
            <div className="flex items-center justify-between border-b border-paper/10 px-4 py-2.5">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-paper/45">Operating console</p>
              <span className="font-mono text-[9px] tracking-wide text-paper/30">{log.length} lines</span>
            </div>
            <div className="app-scroll max-h-64 overflow-y-auto p-4 font-mono text-[10.5px] leading-[1.8] tracking-wide">
              {log.length === 0 ? (
                <p className="text-paper/35">
                  {running ? "training in progress…" : "> awaiting first operation. Set interventions, then run the model."}
                  {running && <span className="anim-blink ml-1 text-pulse-300">▍</span>}
                </p>
              ) : (
                log.map((l, i) => (
                  <p key={i} className={l.kind === "err" ? "text-signal-400" : l.kind === "warn" ? "text-signal-300" : l.kind === "ok" ? "text-pulse-300" : "text-paper/55"}>
                    {l.kind === "err" ? "✕ " : l.kind === "warn" ? "! " : l.kind === "ok" ? "✓ " : "> "}
                    {l.text}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>

        {/* right: interventions + vitals */}
        <div className="space-y-4">
          <div className="rounded-xl border border-ink-900/12 bg-paper-card p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">Interventions</p>
              <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-300">real hyperparameters</span>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="flex items-baseline justify-between font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">
                  learning rate <span className="tnum text-pulse-700">{config.lr < 0.01 ? config.lr.toExponential(1) : config.lr.toFixed(2)}</span>
                </span>
                <input type="range" min={-5} max={0.7} step={0.05} value={lrExp} onChange={(e) => patch({ lr: Number((10 ** Number(e.target.value)).toPrecision(3)) })} className="mt-2 h-1 w-full cursor-pointer accent-[#12a392]" aria-label="Learning rate (log scale)" />
              </label>

              <label className="block">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">activation (hidden)</span>
                <select value={config.activation} onChange={(e) => patch({ activation: e.target.value as RunConfig["activation"] })} className="mt-2 w-full cursor-pointer rounded-lg border border-ink-900/15 bg-paper px-3 py-2 font-mono text-[11.5px] text-ink-800 outline-none focus:border-pulse-500">
                  {(["relu", "sigmoid", "tanh", "linear"] as const).map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">hidden layers</span>
                <input type="text" value={hiddenText} onChange={(e) => onHiddenChange(e.target.value)} placeholder="e.g. 16, 16 — empty = none" className={`mt-2 w-full rounded-lg border bg-paper px-3 py-2 font-mono text-[11.5px] text-ink-800 outline-none transition-colors focus:border-pulse-500 ${hiddenErr ? "border-signal-500" : "border-ink-900/15"}`} />
                {hiddenErr && <span className="mt-1 block font-mono text-[9.5px] text-signal-600">! {hiddenErr}</span>}
              </label>

              <label className="block">
                <span className="flex items-baseline justify-between font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">
                  dropout <span className="tnum text-pulse-700">{config.dropout.toFixed(2)}</span>
                </span>
                <input type="range" min={0} max={0.6} step={0.05} value={config.dropout} onChange={(e) => patch({ dropout: Number(e.target.value) })} className="mt-2 h-1 w-full cursor-pointer accent-[#12a392]" aria-label="Dropout" />
              </label>

              <label className="block">
                <span className="flex items-baseline justify-between font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">
                  weight decay (L2) <span className="tnum text-pulse-700">{config.weightDecay.toFixed(3)}</span>
                </span>
                <input type="range" min={0} max={0.05} step={0.002} value={config.weightDecay} onChange={(e) => patch({ weightDecay: Number(e.target.value) })} className="mt-2 h-1 w-full cursor-pointer accent-[#12a392]" aria-label="Weight decay" />
              </label>

              <label className="block">
                <span className="flex items-baseline justify-between font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">
                  epochs <span className="tnum text-pulse-700">{config.epochs}</span>
                </span>
                <input type="range" min={5} max={200} step={5} value={config.epochs} onChange={(e) => patch({ epochs: Number(e.target.value) })} className="mt-2 h-1 w-full cursor-pointer accent-[#12a392]" aria-label="Training epochs" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">init</span>
                  <select value={config.init} onChange={(e) => patch({ init: e.target.value as RunConfig["init"] })} className="mt-2 w-full cursor-pointer rounded-lg border border-ink-900/15 bg-paper px-3 py-2 font-mono text-[11.5px] text-ink-800 outline-none focus:border-pulse-500">
                    {(["he", "xavier", "normal"] as const).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="flex items-baseline justify-between font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">
                    σ scale <span className="tnum text-pulse-700">{config.initScale.toFixed(2)}</span>
                  </span>
                  <input type="range" min={0.05} max={3} step={0.05} value={config.initScale} onChange={(e) => patch({ initScale: Number(e.target.value) })} className="mt-3 h-1 w-full cursor-pointer accent-[#12a392]" aria-label="Initialization scale" />
                </label>
              </div>

              <label className="block">
                <span className="flex items-baseline justify-between font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">
                  bias init <span className="tnum text-pulse-700">{config.biasInit.toFixed(1)}</span>
                </span>
                <input type="range" min={-4} max={1} step={0.1} value={config.biasInit} onChange={(e) => patch({ biasInit: Number(e.target.value) })} className="mt-2 h-1 w-full cursor-pointer accent-[#12a392]" aria-label="Bias initialization" />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2.5">
              <button type="button" onClick={() => run(config)} disabled={running} className="group inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-pulse-400 px-5 py-3 font-display text-[14px] font-semibold text-ink-950 transition-all hover:bg-pulse-300 active:scale-[0.98] disabled:opacity-50">
                {running ? (<><span className="spinner spinner-sm" /> training…</>) : (<><IconPlay size={15} className="transition-transform group-hover:scale-110" /> Run training</>)}
              </button>
            </div>
            <div className="mt-2.5 flex gap-2.5">
              <button type="button" onClick={resetFault} disabled={running} className="flex-1 rounded-full border border-ink-900/20 py-2.5 font-display text-[12.5px] font-semibold text-ink-700 transition-all hover:border-signal-500 hover:text-signal-600 disabled:opacity-40">
                Reset fault
              </button>
              <button type="button" onClick={rerollSeed} disabled={running} className="flex-1 rounded-full border border-ink-900/20 py-2.5 font-mono text-[11px] tracking-wide text-ink-500 transition-all hover:border-pulse-500 hover:text-pulse-700 disabled:opacity-40" title="New random data + initialization">
                ↻ reroll seed
              </button>
            </div>
          </div>

          {/* vitals */}
          <div className="rounded-xl border border-ink-800 bg-ink-950 p-5 text-paper">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-paper/45">Model vitals</p>
              <button
                type="button"
                onClick={() => setBio((v) => !v)}
                aria-pressed={bio}
                className={`rounded-full border px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.12em] transition-all ${bio ? "border-signal-400/60 text-signal-300" : "border-paper/20 text-paper/50 hover:text-paper"}`}
                title="Toggle biological metaphor labels (technical terms stay visible)"
              >
                {bio ? "metaphor on" : "technical"}
              </button>
            </div>
            <div className="mt-3">
              <Vitals result={result} bio={bio} />
            </div>
            <p className="mt-3 border-t border-paper/10 pt-3 font-mono text-[8.5px] leading-relaxed tracking-wide text-paper/30">
              every value measured on the actual run — full-train gradient, held-out evaluation, dead-unit census.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
