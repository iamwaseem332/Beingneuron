/**
 * Phase 10 — NeuroSurgery simulation engine.
 *
 * REAL MATHEMATICS ONLY. This is a genuine (small) neural network:
 * dense layers, ReLU/sigmoid/tanh/linear activations, binary cross-entropy,
 * mini-batch SGD with weight decay + inverted dropout, and full backprop.
 * Every metric the lab displays — losses, accuracies, gradient norms,
 * activation statistics, dead-neuron ratios — is computed from actual runs
 * of this code. Nothing is animated, sampled, or invented.
 */

/* ================= types ================= */

export type Activation = "relu" | "sigmoid" | "tanh" | "linear";
export type InitScheme = "he" | "xavier" | "normal";
export type DatasetKind = "moons" | "spirals" | "blobs";

export type RunConfig = {
  hidden: number[]; // widths of hidden layers (0 layers = logistic regression)
  activation: Activation; // applied to every hidden layer
  lr: number;
  epochs: number;
  batchSize: number;
  weightDecay: number; // L2
  dropout: number; // inverted dropout, hidden layers
  init: InitScheme;
  initScale: number; // σ for normal; multiplier for he/xavier
  biasInit: number;
  seed: number;
};

export type Dataset = { X: number[][]; y: number[]; inputDim: number };

export type EpochRecord = {
  epoch: number;
  trainLoss: number;
  valLoss: number;
  trainAcc: number;
  valAcc: number;
  gradNorm: number; // global L2 norm of full-train gradient
  layerGradNorms: number[]; // per hidden layer + output (last)
  layerMeanAct: number[]; // mean |activation| per hidden layer
  deadRatio: number; // fraction of silent ReLU units (0 when no ReLU)
};

export type LayerStat = {
  name: string;
  units: number;
  activation: Activation | "sigmoid-out";
  gradNorm: number;
  meanAct: number;
  deadUnits: number;
  meanActPerUnit: number[];
  deadPerUnit: boolean[];
  W: number[][]; // out×in (for edge rendering)
  b: number[];
};

export type TrainingResult = {
  config: RunConfig;
  history: EpochRecord[];
  explodedAt: number | null; // epoch where loss/weights became non-finite
  finalDeadRatio: number;
  layers: LayerStat[]; // hidden + output, with real final weights
  inputDim: number;
};

export type Verdict = { repaired: boolean; notes: string[] };

export type ScenarioFault = {
  dataset: DatasetKind;
  train: number;
  val: number;
  noise: number;
};

export type Scenario = {
  id: string;
  name: string;
  bio: string; // biological metaphor — presentation only, technical terms kept
  tagline: string;
  fault: ScenarioFault & Omit<RunConfig, "seed">;
  symptoms: string[];
  mechanism: string;
  fixes: { label: string; patch: Partial<RunConfig> }[];
  evaluate: (r: TrainingResult) => Verdict;
};

/* ================= deterministic PRNG ================= */

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ================= datasets (synthetic, standardized, seeded) ================= */

function standardize(X: number[][], mu: number[], sd: number[]): number[][] {
  return X.map((row) => row.map((v, j) => (v - mu[j]) / (sd[j] || 1)));
}

function moments(X: number[][]): { mu: number[]; sd: number[] } {
  const d = X[0].length;
  const mu = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j += 1) mu[j] += row[j] / X.length;
  const sd = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j += 1) sd[j] += (row[j] - mu[j]) ** 2 / X.length;
  return { mu, sd: sd.map((v) => Math.sqrt(v)) };
}

function genMoons(n: number, noise: number, rng: () => number): { X: number[][]; y: number[] } {
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const cls = i % 2;
    const t = Math.PI * rng();
    let px = cls === 0 ? Math.cos(t) : 1 - Math.cos(t);
    let py = cls === 0 ? Math.sin(t) : 0.5 - Math.sin(t);
    px += gauss(rng) * noise;
    py += gauss(rng) * noise;
    X.push([px, py]);
    y.push(cls);
  }
  return { X, y };
}

function genSpirals(n: number, noise: number, rng: () => number): { X: number[][]; y: number[] } {
  const X: number[][] = [];
  const y: number[] = [];
  const per = Math.ceil(n / 2);
  for (let c = 0; c < 2; c += 1) {
    for (let i = 0; i < per; i += 1) {
      const frac = (i + rng() * 0.35) / per;
      const r = frac;
      const theta = frac * 3.6 * Math.PI + c * Math.PI;
      X.push([r * Math.sin(theta) + gauss(rng) * noise, r * Math.cos(theta) + gauss(rng) * noise]);
      y.push(c);
    }
  }
  return { X, y };
}

function genBlobs(n: number, noise: number, rng: () => number): { X: number[][]; y: number[] } {
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const cls = i % 2;
    const cx = cls === 0 ? -1.15 : 1.15;
    const cy = cls === 0 ? -1.15 : 1.15;
    X.push([cx + gauss(rng) * noise, cy + gauss(rng) * noise]);
    y.push(cls);
  }
  return { X, y };
}

export function makeDatasets(
  fault: ScenarioFault,
  seed: number,
): { train: Dataset; val: Dataset } {
  const rng = mulberry32(seed >>> 0);
  const gen = fault.dataset === "moons" ? genMoons : fault.dataset === "spirals" ? genSpirals : genBlobs;
  const tr = gen(fault.train, fault.noise, rng);
  const va = gen(fault.val, fault.noise, rng);
  const { mu, sd } = moments(tr.X); // fit on train only — honest statistics
  return {
    train: { X: standardize(tr.X, mu, sd), y: tr.y, inputDim: tr.X[0].length },
    val: { X: standardize(va.X, mu, sd), y: va.y, inputDim: va.X[0].length },
  };
}

/* ================= network math ================= */

type Mat = number[][];

const clampZ = (z: number) => Math.max(-500, Math.min(500, z));

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-clampZ(z)));
}

function applyAct(z: number, a: Activation): number {
  switch (a) {
    case "relu":
      return z > 0 ? z : 0;
    case "sigmoid":
      return sigmoid(z);
    case "tanh":
      return Math.tanh(z);
    default:
      return z;
  }
}

/** aVal = applyAct(z, a) must be passed for sigmoid/tanh. */
function actDeriv(z: number, aVal: number, a: Activation): number {
  switch (a) {
    case "relu":
      return z > 0 ? 1 : 0;
    case "sigmoid":
      return aVal * (1 - aVal);
    case "tanh":
      return 1 - aVal * aVal;
    default:
      return 1;
  }
}

function sigmaFor(scheme: InitScheme, fanIn: number, scale: number): number {
  if (scheme === "he") return scale * Math.sqrt(2 / Math.max(1, fanIn));
  if (scheme === "xavier") return scale * Math.sqrt(1 / Math.max(1, fanIn));
  return scale;
}

type Net = {
  Ws: Mat[]; // hidden: [out][in]
  bs: number[][];
  Wout: number[]; // 1×last
  bout: number;
  dims: number[]; // [input, h1, h2, ...]
};

function initNet(inputDim: number, cfg: RunConfig, rng: () => number): Net {
  const dims = [inputDim, ...cfg.hidden];
  const Ws: Mat[] = [];
  const bs: number[][] = [];
  for (let l = 0; l < cfg.hidden.length; l += 1) {
    const sigma = sigmaFor(cfg.init, dims[l], cfg.initScale);
    const rows = cfg.hidden[l];
    const W: Mat = [];
    for (let o = 0; o < rows; o += 1) {
      const row: number[] = [];
      for (let k = 0; k < dims[l]; k += 1) row.push(gauss(rng) * sigma);
      W.push(row);
    }
    Ws.push(W);
    bs.push(new Array(rows).fill(cfg.biasInit));
  }
  const last = dims[dims.length - 1];
  const sigmaOut = Math.sqrt(1 / Math.max(1, last));
  const Wout: number[] = [];
  for (let k = 0; k < last; k += 1) Wout.push(gauss(rng) * sigmaOut);
  return { Ws, bs, Wout, bout: 0, dims };
}

type Caches = { As: Mat[]; Zs: Mat[]; masks: (Mat | null)[] };

function forward(net: Net, X: Mat, cfg: RunConfig, training: boolean, rng: () => number): { p: number[]; caches: Caches } {
  const caches: Caches = { As: [X], Zs: [], masks: [] };
  let A = X;
  for (let l = 0; l < net.Ws.length; l += 1) {
    const W = net.Ws[l];
    const b = net.bs[l];
    const out = W.length;
    const Z: Mat = [];
    const Aa: Mat = [];
    for (let i = 0; i < A.length; i += 1) {
      const zRow: number[] = [];
      const aRow: number[] = [];
      for (let o = 0; o < out; o += 1) {
        let s = b[o];
        const Wrow = W[o];
        const Arow = A[i];
        for (let k = 0; k < Wrow.length; k += 1) s += Wrow[k] * Arow[k];
        zRow.push(s);
        aRow.push(applyAct(s, cfg.activation));
      }
      Z.push(zRow);
      Aa.push(aRow);
    }
    let mask: Mat | null = null;
    if (training && cfg.dropout > 0) {
      const scale = 1 / (1 - cfg.dropout);
      mask = Aa.map((row) => row.map(() => (rng() < cfg.dropout ? 0 : scale)));
      for (let i = 0; i < Aa.length; i += 1)
        for (let o = 0; o < out; o += 1) Aa[i][o] *= (mask as Mat)[i][o];
    }
    caches.Zs.push(Z);
    caches.masks.push(mask);
    caches.As.push(Aa);
    A = Aa;
  }
  // output: single sigmoid unit, BCE
  const p: number[] = [];
  for (let i = 0; i < A.length; i += 1) {
    let s = net.bout;
    const Arow = A[i];
    for (let k = 0; k < net.Wout.length; k += 1) s += net.Wout[k] * Arow[k];
    p.push(sigmoid(s));
  }
  return { p, caches };
}

function bce(p: number[], y: number[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i += 1) {
    const pc = Math.min(1 - 1e-9, Math.max(1e-9, p[i]));
    s += -(y[i] * Math.log(pc) + (1 - y[i]) * Math.log(1 - pc));
  }
  return s / p.length;
}

function accuracy(p: number[], y: number[]): number {
  let c = 0;
  for (let i = 0; i < p.length; i += 1) if ((p[i] >= 0.5 ? 1 : 0) === y[i]) c += 1;
  return c / p.length;
}

type Grads = { dWs: Mat[]; dbs: number[][]; dWout: number[]; dbout: number; norm: number; layerNorms: number[] };

function backward(net: Net, caches: Caches, p: number[], y: number[], cfg: RunConfig): Grads {
  const n = p.length;
  const L = net.Ws.length;
  const Alast = caches.As[L];
  // output layer (BCE + sigmoid): dZ_out = p - y
  const dWout: number[] = new Array(net.Wout.length).fill(0);
  let dbout = 0;
  for (let i = 0; i < n; i += 1) {
    const dz = p[i] - y[i];
    dbout += dz / n;
    for (let k = 0; k < net.Wout.length; k += 1) dWout[k] += (dz * Alast[i][k]) / n;
  }
  for (let k = 0; k < net.Wout.length; k += 1) dWout[k] += cfg.weightDecay * net.Wout[k];
  // gradient w.r.t. the last hidden activation: dA[i][k] = (p[i] - y[i]) · Wout[k]
  let dA: Mat = Alast.map((_, i) => net.Wout.map((w) => (p[i] - y[i]) * w));

  const dWs: Mat[] = new Array(L);
  const dbs: number[][] = new Array(L);
  const layerNorms: number[] = new Array(L + 1).fill(0);
  let sumSq = 0;
  for (let k = 0; k < dWout.length; k += 1) sumSq += dWout[k] ** 2;
  sumSq += dbout ** 2;
  layerNorms[L] = Math.sqrt(sumSq);

  for (let l = L - 1; l >= 0; l -= 1) {
    const mask = caches.masks[l];
    const Z = caches.Zs[l];
    const Aprev = caches.As[l];
    const out = net.Ws[l].length;
    if (mask) {
      for (let i = 0; i < dA.length; i += 1)
        for (let o = 0; o < out; o += 1) dA[i][o] *= mask[i][o];
    }
    const dZ: Mat = dA.map((row, i) => row.map((v, o) => v * actDeriv(Z[i][o], applyAct(Z[i][o], cfg.activation), cfg.activation)));
    const dW: Mat = [];
    const db: number[] = [];
    let lSq = 0;
    for (let o = 0; o < out; o += 1) {
      const row: number[] = [];
      let s = 0;
      for (let i = 0; i < n; i += 1) s += dZ[i][o];
      db.push(s / n);
      lSq += (s / n) ** 2;
      for (let k = 0; k < Aprev[0].length; k += 1) {
        let g = 0;
        for (let i = 0; i < n; i += 1) g += dZ[i][o] * Aprev[i][k];
        g = g / n + cfg.weightDecay * net.Ws[l][o][k];
        row.push(g);
        lSq += g * g;
      }
      dW.push(row);
    }
    dWs[l] = dW;
    dbs[l] = db;
    layerNorms[l] = Math.sqrt(lSq);
    sumSq += lSq;
    if (l > 0) {
      const ndA: Mat = Aprev.map((_, i) => {
        const row: number[] = new Array(net.Ws[l - 1].length).fill(0);
        return row.map((_, o) => {
          let s = 0;
          for (let oo = 0; oo < out; oo += 1) s += dZ[i][oo] * net.Ws[l][oo][o];
          return s;
        });
      });
      dA = ndA;
    }
  }
  return { dWs, dbs, dWout, dbout, norm: Math.sqrt(sumSq), layerNorms };
}

function applySgd(net: Net, g: Grads, lr: number) {
  for (let l = 0; l < net.Ws.length; l += 1) {
    for (let o = 0; o < net.Ws[l].length; o += 1) {
      for (let k = 0; k < net.Ws[l][o].length; k += 1) net.Ws[l][o][k] -= lr * g.dWs[l][o][k];
      net.bs[l][o] -= lr * g.dbs[l][o];
    }
  }
  for (let k = 0; k < net.Wout.length; k += 1) net.Wout[k] -= lr * g.dWout[k];
  net.bout -= lr * g.dbout;
}

function finiteNet(net: Net): boolean {
  for (const W of net.Ws) for (const r of W) for (const v of r) if (!Number.isFinite(v)) return false;
  for (const b of net.bs) for (const v of b) if (!Number.isFinite(v)) return false;
  for (const v of net.Wout) if (!Number.isFinite(v)) return false;
  return Number.isFinite(net.bout);
}

/** dead = pre-activation ≤ 0 on ≥ 98% of the samples */
function deadUnits(Z: Mat, units: number): boolean[] {
  const n = Z.length;
  const silent: number[] = new Array(units).fill(0);
  for (let i = 0; i < n; i += 1)
    for (let o = 0; o < units; o += 1) if (Z[i][o] <= 0) silent[o] += 1;
  return silent.map((c) => c >= 0.98 * n);
}

function meanAbsActs(A: Mat, units: number): number[] {
  const out: number[] = new Array(units).fill(0);
  for (let i = 0; i < A.length; i += 1)
    for (let o = 0; o < units; o += 1) out[o] += Math.abs(A[i][o]) / A.length;
  return out;
}

/* ================= training loop ================= */

export function trainNet(trainD: Dataset, valD: Dataset, cfg: RunConfig): TrainingResult {
  const rng = mulberry32(cfg.seed >>> 0);
  const net = initNet(trainD.inputDim, cfg, rng);
  const history: EpochRecord[] = [];
  let explodedAt: number | null = null;
  const n = trainD.X.length;
  const idx = Array.from({ length: n }, (_, i) => i);

  for (let epoch = 1; epoch <= cfg.epochs; epoch += 1) {
    // shuffle (Fisher–Yates)
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const bs = Math.min(cfg.batchSize, n);
    for (let start = 0; start < n; start += bs) {
      const Xb = idx.slice(start, start + bs).map((i) => trainD.X[i]);
      const yb = idx.slice(start, start + bs).map((i) => trainD.y[i]);
      const { p, caches } = forward(net, Xb, cfg, true, rng);
      const g = backward(net, caches, p, yb, cfg);
      applySgd(net, g, cfg.lr);
    }
    if (!finiteNet(net)) {
      explodedAt = epoch;
      history.push({
        epoch, trainLoss: NaN, valLoss: NaN, trainAcc: NaN, valAcc: NaN,
        gradNorm: NaN, layerGradNorms: [], layerMeanAct: [], deadRatio: NaN,
      });
      break;
    }

    // ---- measurement pass: full-train gradient + activation statistics ----
    const mF = forward(net, trainD.X, cfg, false, rng);
    const mG = backward(net, mF.caches, mF.p, trainD.y, cfg);
    const trainLoss = bce(mF.p, trainD.y);
    const trainAcc = accuracy(mF.p, trainD.y);
    const vF = forward(net, valD.X, cfg, false, rng);
    const valLoss = bce(vF.p, valD.y);
    const valAcc = accuracy(vF.p, valD.y);

    const layerMeanAct: number[] = [];
    let deadTotal = 0;
    let reluUnits = 0;
    for (let l = 0; l < net.Ws.length; l += 1) {
      const acts = meanAbsActs(mF.caches.As[l + 1], net.Ws[l].length);
      layerMeanAct.push(acts.reduce((a, b) => a + b, 0) / Math.max(1, acts.length));
      if (cfg.activation === "relu") {
        const dead = deadUnits(mF.caches.Zs[l], net.Ws[l].length);
        deadTotal += dead.filter(Boolean).length;
        reluUnits += net.Ws[l].length;
      }
    }
    const deadRatio = reluUnits > 0 ? deadTotal / reluUnits : 0;

    history.push({
      epoch, trainLoss, valLoss, trainAcc, valAcc,
      gradNorm: mG.norm, layerGradNorms: mG.layerNorms, layerMeanAct, deadRatio,
    });
    if (!Number.isFinite(trainLoss) || !Number.isFinite(valLoss)) {
      explodedAt = epoch;
      break;
    }
  }

  // final layer statistics (real weights from the trained net)
  const finalF = forward(net, trainD.X, cfg, false, rng);
  const finalG = backward(net, finalF.caches, finalF.p, trainD.y, cfg);
  const layers: LayerStat[] = [];
  for (let l = 0; l < net.Ws.length; l += 1) {
    const acts = meanAbsActs(finalF.caches.As[l + 1], net.Ws[l].length);
    const dead = cfg.activation === "relu" ? deadUnits(finalF.caches.Zs[l], net.Ws[l].length) : net.Ws[l].map(() => false);
    layers.push({
      name: `h${l + 1}`,
      units: net.Ws[l].length,
      activation: cfg.activation,
      gradNorm: finalG.layerNorms[l] ?? 0,
      meanAct: acts.reduce((a, b) => a + b, 0) / Math.max(1, acts.length),
      deadUnits: dead.filter(Boolean).length,
      meanActPerUnit: acts,
      deadPerUnit: dead,
      W: net.Ws[l],
      b: net.bs[l],
    });
  }
  layers.push({
    name: "out",
    units: 1,
    activation: "sigmoid-out",
    gradNorm: finalG.layerNorms[net.Ws.length] ?? 0,
    meanAct: finalF.p.reduce((a, b) => a + b, 0) / Math.max(1, finalF.p.length),
    deadUnits: 0,
    meanActPerUnit: [0],
    deadPerUnit: [false],
    W: [net.Wout],
    b: [net.bout],
  });

  const lastGood = [...history].reverse().find((h) => Number.isFinite(h.trainLoss));
  return {
    config: cfg,
    history,
    explodedAt,
    finalDeadRatio: lastGood?.deadRatio ?? 0,
    layers,
    inputDim: trainD.inputDim,
  };
}

/* ================= scenarios ================= */

const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "∞/NaN");

export const SCENARIOS: Scenario[] = [
  {
    id: "overfitting",
    name: "Overfitting",
    bio: "Memorization Fever",
    tagline: "The model aces its notes and fails the exam.",
    fault: {
      dataset: "moons", train: 56, val: 240, noise: 0.22,
      hidden: [24, 24], activation: "relu", lr: 0.12, epochs: 90, batchSize: 16,
      weightDecay: 0, dropout: 0, init: "he", initScale: 1, biasInit: 0,
    },
    symptoms: [
      "Training loss collapses toward zero",
      "Validation loss bottoms early, then climbs",
      "Train–val accuracy gap widens every epoch",
    ],
    mechanism:
      "With only 56 noisy training points and 576 free parameters, SGD happily memorizes label noise. The decision boundary twists around every outlier — perfect in-sample, brittle out-of-sample.",
    fixes: [
      { label: "weight decay 0.02", patch: { weightDecay: 0.02 } },
      { label: "dropout 0.3", patch: { dropout: 0.3 } },
      { label: "shrink → 8×8", patch: { hidden: [8, 8] } },
    ],
    evaluate: (r) => {
      const fin = r.history.filter((h) => Number.isFinite(h.valLoss));
      if (fin.length === 0) return { repaired: false, notes: ["Training diverged before any usable measurement."] };
      const minVal = Math.min(...fin.map((h) => h.valLoss));
      const finalVal = fin[fin.length - 1].valLoss;
      const finalTrain = fin[fin.length - 1].trainLoss;
      const gap = finalVal - minVal;
      const repaired = minVal < 0.5 && gap < 0.08 && finalTrain < 0.62 && r.explodedAt === null;
      return {
        repaired,
        notes: [
          `min validation loss ${f(minVal)} · final ${f(finalVal)} (drift +${f(gap)})`,
          `final train loss ${f(finalTrain)} · gap-to-val ${f(finalVal - finalTrain)}`,
          repaired
            ? "Validation loss holds steady after its minimum — generalization recovered."
            : gap >= 0.08
              ? "Validation loss still drifts upward after its minimum — memorization ongoing."
              : "The net now underfits — it lost the signal along with the noise.",
        ],
      };
    },
  },
  {
    id: "underfitting",
    name: "Underfitting",
    bio: "Blunted Reflexes",
    tagline: "The model never learns the task at all.",
    fault: {
      dataset: "spirals", train: 220, val: 220, noise: 0.05,
      hidden: [3], activation: "linear", lr: 0.15, epochs: 60, batchSize: 16,
      weightDecay: 0, dropout: 0, init: "xavier", initScale: 1, biasInit: 0,
    },
    symptoms: [
      "Training loss plateaus near 0.69 (chance)",
      "Accuracy hovers around 50–60% everywhere",
      "More epochs change almost nothing",
    ],
    mechanism:
      "Three linear units are a logistic regression in disguise — a straight-line boundary facing two intertwined spirals. The hypothesis class simply cannot express the task, so no amount of training helps.",
    fixes: [
      { label: "widen → 16×16", patch: { hidden: [16, 16] } },
      { label: "activation → relu", patch: { activation: "relu" } },
      { label: "120 epochs", patch: { epochs: 120 } },
    ],
    evaluate: (r) => {
      const fin = r.history.filter((h) => Number.isFinite(h.trainAcc));
      if (fin.length === 0) return { repaired: false, notes: ["Training diverged before measurement."] };
      const last = fin[fin.length - 1];
      const repaired = last.trainAcc > 0.82 && last.valAcc > 0.72;
      return {
        repaired,
        notes: [
          `final train acc ${(last.trainAcc * 100).toFixed(0)}% · val acc ${(last.valAcc * 100).toFixed(0)}%`,
          `final train loss ${f(last.trainLoss)}`,
          repaired
            ? "Capacity and non-linearity restored — the spirals are separable now."
            : "The boundary is still too weak or too rigid for the data geometry.",
        ],
      };
    },
  },
  {
    id: "lr-high",
    name: "Learning Rate Too High",
    bio: "Tachycardia",
    tagline: "Every update overshoots — the heart races.",
    fault: {
      dataset: "blobs", train: 160, val: 160, noise: 0.6,
      hidden: [10], activation: "relu", lr: 4.0, epochs: 30, batchSize: 16,
      weightDecay: 0, dropout: 0, init: "he", initScale: 1, biasInit: 0,
    },
    symptoms: [
      "Loss oscillates violently or diverges to NaN",
      "Gradient norm spikes by orders of magnitude",
      "Accuracy never leaves chance level",
    ],
    mechanism:
      "With lr = 4.0 each gradient step leaps far past the loss minimum, landing on the opposite slope with even higher loss. Updates ping-pong and amplify until the arithmetic overflows.",
    fixes: [{ label: "lr → 0.1", patch: { lr: 0.1 } }, { label: "lr → 0.3", patch: { lr: 0.3 } }],
    evaluate: (r) => {
      const fin = r.history.filter((h) => Number.isFinite(h.valLoss));
      if (fin.length === 0 || r.explodedAt !== null)
        return { repaired: false, notes: [`Loss went non-finite at epoch ${r.explodedAt ?? "—"} — updates are still diverging.`] };
      const last = fin[fin.length - 1];
      const maxGrad = Math.max(...fin.map((h) => h.gradNorm));
      const repaired = last.valLoss < 0.3 && last.valAcc > 0.8 && maxGrad < 20;
      return {
        repaired,
        notes: [
          `final val loss ${f(last.valLoss)} · val acc ${(last.valAcc * 100).toFixed(0)}%`,
          `peak gradient norm ${maxGrad.toExponential(1)}`,
          repaired ? "Steps now land inside the basin — stable convergence." : "Updates are still overshooting the minimum.",
        ],
      };
    },
  },
  {
    id: "lr-low",
    name: "Learning Rate Too Low",
    bio: "Bradycardia",
    tagline: "A pulse so slow the patient never wakes.",
    fault: {
      dataset: "blobs", train: 160, val: 160, noise: 0.6,
      hidden: [10], activation: "relu", lr: 2e-5, epochs: 30, batchSize: 16,
      weightDecay: 0, dropout: 0, init: "he", initScale: 1, biasInit: 0,
    },
    symptoms: [
      "Loss barely moves from 0.69 across all epochs",
      "Gradient norm is tiny but healthy",
      "The curve is flat — not unstable, just frozen",
    ],
    mechanism:
      "At lr = 2×10⁻⁵ each weight update is a fraction of a percent of what the gradient asks for. Thirty epochs cover almost no distance along the loss surface — the model is healthy but motionless.",
    fixes: [{ label: "lr → 0.2", patch: { lr: 0.2 } }, { label: "lr → 0.5", patch: { lr: 0.5 } }],
    evaluate: (r) => {
      const fin = r.history.filter((h) => Number.isFinite(h.valLoss));
      if (fin.length === 0) return { repaired: false, notes: ["No measurable training occurred."] };
      const first = fin[0];
      const last = fin[fin.length - 1];
      const moved = first.trainLoss - last.trainLoss;
      const repaired = last.valLoss < 0.3 && last.valAcc > 0.8;
      return {
        repaired,
        notes: [
          `loss moved ${f(moved, 3)} over ${fin.length} epochs (start ${f(first.trainLoss)} → ${f(last.trainLoss)})`,
          `final val acc ${(last.valAcc * 100).toFixed(0)}%`,
          repaired ? "Learning rate restored — the loss now descends in earnest." : "The net is still crawling; updates remain negligible.",
        ],
      };
    },
  },
  {
    id: "dead-relus",
    name: "Dead ReLUs",
    bio: "Neuron Fatigue",
    tagline: "Most units went silent and never woke up.",
    fault: {
      dataset: "moons", train: 140, val: 200, noise: 0.15,
      hidden: [16, 16], activation: "relu", lr: 0.08, epochs: 60, batchSize: 16,
      weightDecay: 0, dropout: 0, init: "normal", initScale: 1.3, biasInit: -3.0,
    },
    symptoms: [
      "Dead-neuron ratio above ~70% from the first epochs",
      "Activations are nearly zero everywhere",
      "Learning crawls through the few surviving units",
    ],
    mechanism:
      "Biases initialized at −3.0 push almost every pre-activation below zero, where ReLU's gradient is exactly 0. Those units can never receive an update — gradient descent can't revive what it can't reach.",
    fixes: [
      { label: "activation → tanh", patch: { activation: "tanh" } },
      { label: "bias → 0, he init", patch: { biasInit: 0, init: "he", initScale: 1 } },
    ],
    evaluate: (r) => {
      const fin = r.history.filter((h) => Number.isFinite(h.valAcc));
      if (fin.length === 0) return { repaired: false, notes: ["Training diverged before measurement."] };
      const last = fin[fin.length - 1];
      const dead = r.finalDeadRatio;
      const repaired = dead < 0.12 && last.valAcc > 0.78;
      return {
        repaired,
        notes: [
          `dead ReLU ratio ${(dead * 100).toFixed(0)}% at the end of training`,
          `final val acc ${(last.valAcc * 100).toFixed(0)}% · val loss ${f(last.valLoss)}`,
          repaired ? "Units are firing again — signal flows through the whole layer." : dead >= 0.12
            ? "Too many units remain permanently silent (pre-activation stuck ≤ 0)."
            : "Units fire, but accuracy is still weak — keep tuning.",
        ],
      };
    },
  },
  {
    id: "vanishing-gradients",
    name: "Vanishing Gradients",
    bio: "Signal Atrophy",
    tagline: "The deeper layers never hear the error.",
    fault: {
      dataset: "moons", train: 200, val: 200, noise: 0.15,
      hidden: [8, 8, 8, 8, 8], activation: "sigmoid", lr: 0.3, epochs: 60, batchSize: 16,
      weightDecay: 0, dropout: 0, init: "xavier", initScale: 0.8, biasInit: 0,
    },
    symptoms: [
      "Early-layer gradient norm orders of magnitude below the output layer",
      "Training accuracy stalls just above chance",
      "Saturating sigmoid activations near 0 or 1",
    ],
    mechanism:
      "Backprop multiplies by σ′(z) ≤ 0.25 at every sigmoid layer. Across five layers the error signal reaching h1 is ~10⁻³ of what the output sees, so the early layers effectively stop learning.",
    fixes: [
      { label: "activation → tanh", patch: { activation: "tanh" } },
      { label: "activation → relu", patch: { activation: "relu" } },
    ],
    evaluate: (r) => {
      const fin = r.history.filter((h) => Number.isFinite(h.valAcc) && h.layerGradNorms.length > 1);
      if (fin.length === 0) return { repaired: false, notes: ["No gradient measurements available."] };
      const last = fin[fin.length - 1];
      const first = last.layerGradNorms[0];
      const out = last.layerGradNorms[last.layerGradNorms.length - 1] || 1e-12;
      const ratio = first / out;
      const repaired = last.valAcc > 0.72 && ratio > 0.02;
      return {
        repaired,
        notes: [
          `∇h1 / ∇out = ${ratio.toExponential(1)} (healthy is > 10⁻²)`,
          `final val acc ${(last.valAcc * 100).toFixed(0)}%`,
          repaired ? "Gradient reaches the early layers with usable strength." : "The early layers are still starved of gradient signal.",
        ],
      };
    },
  },
  {
    id: "exploding-gradients",
    name: "Exploding Gradients",
    bio: "Runaway Excitation",
    tagline: "Each layer amplifies the signal until it blows.",
    fault: {
      dataset: "blobs", train: 160, val: 160, noise: 0.6,
      hidden: [10, 10, 10, 10], activation: "relu", lr: 0.05, epochs: 30, batchSize: 16,
      weightDecay: 0, dropout: 0, init: "normal", initScale: 2.4, biasInit: 0,
    },
    symptoms: [
      "Gradient norm ≥ 10³ within a few epochs",
      "Loss jumps to astronomical values, then NaN",
      "Weights grow multiplicatively layer over layer",
    ],
    mechanism:
      "With σ = 2.4 and fan-in 10, each ReLU layer multiplies activation magnitude by ~σ·√(fan/2) ≈ 5.4. Four layers compound to ~10³ amplification — forward values and backward gradients explode together.",
    fixes: [
      { label: "init → he", patch: { init: "he", initScale: 1 } },
      { label: "σ → 0.4", patch: { initScale: 0.4 } },
    ],
    evaluate: (r) => {
      const fin = r.history.filter((h) => Number.isFinite(h.gradNorm));
      if (fin.length === 0 || r.explodedAt !== null)
        return { repaired: false, notes: [`Gradients exploded — training aborted at epoch ${r.explodedAt ?? "—"} with non-finite loss.`] };
      const maxGrad = Math.max(...fin.map((h) => h.gradNorm));
      const last = fin[fin.length - 1];
      const repaired = maxGrad < 100 && last.valAcc > 0.7;
      return {
        repaired,
        notes: [
          `peak gradient norm ${maxGrad.toExponential(1)} across the run`,
          `final val acc ${(last.valAcc * 100).toFixed(0)}% · val loss ${f(last.valLoss)}`,
          repaired ? "Signal stays bounded end-to-end — the cascade is tamed." : "Gradient norm is still runaway; shrink the initialization further.",
        ],
      };
    },
  },
];

export function getScenario(id: string | undefined): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function scenarioSeed(id: string): number {
  return hashSeed(`neurosurgery::${id}`);
}

/* ================= Phase 11 — challenge layer =================
 * Cases wrap the Phase 10 scenarios with patient files, three difficulty
 * variants, measurable success criteria and educational hints. Success is
 * still decided exclusively by `evaluateCriteria` on a real TrainingResult.
 */

export type Difficulty = "beginner" | "intermediate" | "advanced";

export const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "beginner", label: "Beginner", blurb: "generous budget · milder fault · three hints" },
  { id: "intermediate", label: "Intermediate", blurb: "standard budget · two hints" },
  { id: "advanced", label: "Advanced", blurb: "tight budget · harsher fault · one hint" },
];

export const SUSPECTS: { id: string; label: string }[] = [
  { id: "overfitting", label: "Overfitting" },
  { id: "underfitting", label: "Underfitting" },
  { id: "dead-relus", label: "Dead ReLUs" },
  { id: "vanishing-gradients", label: "Vanishing gradients" },
  { id: "exploding-gradients", label: "Exploding gradients" },
  { id: "lr-problem", label: "Learning rate problem" },
];
export type DiagnosisId = (typeof SUSPECTS)[number]["id"];

export type Criterion = {
  id: string;
  label: string;
  measure: (r: TrainingResult) => { passed: boolean; actual: string };
};

export type CriterionResult = { id: string; label: string; passed: boolean; actual: string };

export type ScenarioVariant = {
  difficulty: Difficulty;
  /** merged over the scenario's fault config (seed and epochs handled separately) */
  patch: Partial<Omit<RunConfig, "seed" | "epochs">>;
  /** optional dataset severity overrides (train size, noise…) */
  dataPatch?: Partial<ScenarioFault>;
  epochs: number;
  criteria: Criterion[];
  hints: string[];
};

export type ScenarioCase = {
  codename: string;
  patient: string;
  complaint: string;
  trueFault: DiagnosisId;
  variants: Record<Difficulty, ScenarioVariant>;
};

/* ---------- measurement helpers (all derived from the actual run) ---------- */

const finiteTail = (r: TrainingResult): EpochRecord[] => r.history.filter((h) => Number.isFinite(h.valLoss));
const lastRec = (r: TrainingResult): EpochRecord | null => {
  const t = finiteTail(r);
  return t.length ? t[t.length - 1] : null;
};
const minValLoss = (r: TrainingResult): number => {
  const t = finiteTail(r);
  return t.length ? Math.min(...t.map((h) => h.valLoss)) : NaN;
};
const valDrift = (r: TrainingResult): number => {
  const t = finiteTail(r);
  return t.length ? t[t.length - 1].valLoss - Math.min(...t.map((h) => h.valLoss)) : NaN;
};
const peakGrad = (r: TrainingResult): number => {
  const t = r.history.filter((h) => Number.isFinite(h.gradNorm));
  return t.length ? Math.max(...t.map((h) => h.gradNorm)) : NaN;
};
const gradRatio = (r: TrainingResult): number => {
  const t = r.history.filter((h) => Number.isFinite(h.valLoss) && h.layerGradNorms.length > 1);
  if (!t.length) return NaN;
  const l = t[t.length - 1];
  const out = l.layerGradNorms[l.layerGradNorms.length - 1] || 1e-12;
  return l.layerGradNorms[0] / out;
};
const lossDrop = (r: TrainingResult): number => {
  const t = finiteTail(r);
  return t.length > 1 ? t[0].trainLoss - t[t.length - 1].trainLoss : NaN;
};

const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "—");
const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : "—");
const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : "—");
const ex = (v: number) => (Number.isFinite(v) ? v.toExponential(1) : "—");

const crit = (
  id: string,
  label: string,
  get: (r: TrainingResult) => number,
  op: "<" | ">",
  thr: number,
  fmt: (v: number) => string,
): Criterion => ({
  id,
  label,
  measure: (r) => {
    const v = get(r);
    if (!Number.isFinite(v)) return { passed: false, actual: "no finite run" };
    return { passed: op === "<" ? v < thr : v > thr, actual: fmt(v) };
  },
});

const stable = (): Criterion => ({
  id: "stable",
  label: "Training stays finite (no NaN)",
  measure: (r) => ({ passed: r.explodedAt === null, actual: r.explodedAt === null ? "stable" : `blew up @ ep ${r.explodedAt}` }),
});

const acc = (key: "trainAcc" | "valAcc") => (r: TrainingResult) => {
  const l = lastRec(r);
  return l ? l[key] : NaN;
};
const vLoss = (r: TrainingResult) => {
  const l = lastRec(r);
  return l ? l.valLoss : NaN;
};
const tLoss = (r: TrainingResult) => {
  const l = lastRec(r);
  return l ? l.trainLoss : NaN;
};

/* ---------- the case files ---------- */

export const CASES: Record<string, ScenarioCase> = {
  overfitting: {
    codename: "NSG·07-A",
    patient: "MLP-576 “Cassandra”",
    complaint: "Aces every rehearsal, bombs every performance.",
    trueFault: "overfitting",
    variants: {
      beginner: {
        difficulty: "beginner",
        patch: {},
        dataPatch: { train: 72 },
        epochs: 120,
        criteria: [
          stable(),
          crit("train", "Train loss < 0.60", tLoss, "<", 0.6, f2),
          crit("val", "Validation loss < 0.55", vLoss, "<", 0.55, f2),
          crit("drift", "Val-loss drift after minimum < 0.12", valDrift, "<", 0.12, f3),
        ],
        hints: [
          "Watch what validation loss does after its minimum — that climb is the disease.",
          "56 noisy points vs 576 parameters. Which side of that ratio would you change?",
          "Regularize before you shrink: weight decay or dropout first, architecture second.",
        ],
      },
      intermediate: {
        difficulty: "intermediate",
        patch: {},
        epochs: 90,
        criteria: [
          stable(),
          crit("train", "Train loss < 0.55", tLoss, "<", 0.55, f2),
          crit("val", "Validation loss < 0.50", vLoss, "<", 0.5, f2),
          crit("drift", "Val-loss drift after minimum < 0.08", valDrift, "<", 0.08, f3),
        ],
        hints: [
          "The minimum of the val curve is your target — hold the final loss near it.",
          "Too much regularization and you'll slide into underfitting. Balance the two.",
        ],
      },
      advanced: {
        difficulty: "advanced",
        patch: {},
        dataPatch: { train: 40, noise: 0.28 },
        epochs: 60,
        criteria: [
          stable(),
          crit("train", "Train loss < 0.50", tLoss, "<", 0.5, f2),
          crit("val", "Validation loss < 0.45", vLoss, "<", 0.45, f2),
          crit("drift", "Val-loss drift after minimum < 0.06", valDrift, "<", 0.06, f3),
          crit("vacc", "Validation accuracy > 72%", acc("valAcc"), ">", 0.72, pct),
        ],
        hints: ["40 points, more noise, fewer epochs. You'll need two regularizers working together."],
      },
    },
  },
  underfitting: {
    codename: "NSG·02-U",
    patient: "LogReg-3 “Wallflower”",
    complaint: "Gives up before it has even tried.",
    trueFault: "underfitting",
    variants: {
      beginner: {
        difficulty: "beginner",
        patch: {},
        epochs: 100,
        criteria: [
          stable(),
          crit("tacc", "Train accuracy > 72%", acc("trainAcc"), ">", 0.72, pct),
          crit("vacc", "Validation accuracy > 68%", acc("valAcc"), ">", 0.68, pct),
        ],
        hints: [
          "Three linear units against two intertwined spirals — what can't this boundary express?",
          "Non-linearity is the missing ingredient. Then width. Then patience.",
          "Try relu activations with at least 8 units per hidden layer.",
        ],
      },
      intermediate: {
        difficulty: "intermediate",
        patch: {},
        epochs: 60,
        criteria: [
          stable(),
          crit("tacc", "Train accuracy > 82%", acc("trainAcc"), ">", 0.82, pct),
          crit("vacc", "Validation accuracy > 72%", acc("valAcc"), ">", 0.72, pct),
        ],
        hints: ["Capacity first — but spirals don't need huge nets. Two hidden layers of ~16 will do.", "If accuracy plateaus low, the activation is still the bottleneck."],
      },
      advanced: {
        difficulty: "advanced",
        patch: { hidden: [2] },
        epochs: 45,
        criteria: [
          stable(),
          crit("tacc", "Train accuracy > 85%", acc("trainAcc"), ">", 0.85, pct),
          crit("vacc", "Validation accuracy > 75%", acc("valAcc"), ">", 0.75, pct),
          crit("tloss", "Train loss < 0.35", tLoss, "<", 0.35, f2),
        ],
        hints: ["Two units, 45 epochs. Rebuild the hypothesis class from almost nothing."],
      },
    },
  },
  "lr-high": {
    codename: "NSG·04-H",
    patient: "SGD-4 “Hummingbird”",
    complaint: "Heart racing at 4.0 — going nowhere fast.",
    trueFault: "lr-problem",
    variants: {
      beginner: {
        difficulty: "beginner",
        patch: { lr: 2.0 },
        epochs: 40,
        criteria: [
          stable(),
          crit("val", "Validation loss < 0.45", vLoss, "<", 0.45, f2),
          crit("vacc", "Validation accuracy > 70%", acc("valAcc"), ">", 0.7, pct),
        ],
        hints: [
          "Open the gradient chart. Those spikes are updates leaping over the minimum.",
          "Cut the learning rate by orders of magnitude, not by percentages.",
          "Something between 0.05 and 0.5 will land inside the basin.",
        ],
      },
      intermediate: {
        difficulty: "intermediate",
        patch: {},
        epochs: 30,
        criteria: [
          stable(),
          crit("val", "Validation loss < 0.30", vLoss, "<", 0.3, f2),
          crit("vacc", "Validation accuracy > 80%", acc("valAcc"), ">", 0.8, pct),
          crit("grad", "Peak gradient norm < 20", peakGrad, "<", 20, ex),
        ],
        hints: ["lr = 4.0 is the poison. Find the largest rate that still converges — you'll learn more than picking 0.01.", "Peak gradient norm tells you when the overshooting stops."],
      },
      advanced: {
        difficulty: "advanced",
        patch: { lr: 6.0 },
        epochs: 25,
        criteria: [
          stable(),
          crit("val", "Validation loss < 0.25", vLoss, "<", 0.25, f2),
          crit("vacc", "Validation accuracy > 82%", acc("valAcc"), ">", 0.82, pct),
          crit("grad", "Peak gradient norm < 10", peakGrad, "<", 10, ex),
        ],
        hints: ["lr = 6.0, 25 epochs. The window of stable rates is narrow — bisect for it."],
      },
    },
  },
  "lr-low": {
    codename: "NSG·04-L",
    patient: "SGD-4 “Sloth”",
    complaint: "Vitals stable. Patient unresponsive.",
    trueFault: "lr-problem",
    variants: {
      beginner: {
        difficulty: "beginner",
        patch: { lr: 1e-4 },
        epochs: 60,
        criteria: [
          stable(),
          crit("drop", "Loss moved > 0.10 from start", lossDrop, ">", 0.1, f3),
          crit("vacc", "Validation accuracy > 70%", acc("valAcc"), ">", 0.7, pct),
        ],
        hints: [
          "Nothing is broken — nothing is moving. Compare the gradient norm to the step size.",
          "The gradient is healthy; the updates are a rounding error. Raise lr substantially.",
          "Try 0.1–0.5 and watch the curve actually descend.",
        ],
      },
      intermediate: {
        difficulty: "intermediate",
        patch: {},
        epochs: 30,
        criteria: [
          stable(),
          crit("val", "Validation loss < 0.30", vLoss, "<", 0.3, f2),
          crit("vacc", "Validation accuracy > 80%", acc("valAcc"), ">", 0.8, pct),
        ],
        hints: ["lr = 2×10⁻⁵ over 30 epochs covers almost no loss-surface distance.", "You want the highest rate that descends smoothly — that's the sweet spot."],
      },
      advanced: {
        difficulty: "advanced",
        patch: { lr: 5e-6 },
        epochs: 24,
        criteria: [
          stable(),
          crit("drop", "Loss moved > 0.40 from start", lossDrop, ">", 0.4, f3),
          crit("val", "Validation loss < 0.25", vLoss, "<", 0.25, f2),
          crit("vacc", "Validation accuracy > 83%", acc("valAcc"), ">", 0.83, pct),
        ],
        hints: ["5×10⁻⁶, 24 epochs. You must recover four orders of magnitude of step size."],
      },
    },
  },
  "dead-relus": {
    codename: "NSG·09-D",
    patient: "ReLU-256 “Dormouse”",
    complaint: "Three quarters of the staff on permanent leave.",
    trueFault: "dead-relus",
    variants: {
      beginner: {
        difficulty: "beginner",
        patch: { biasInit: -2 },
        epochs: 90,
        criteria: [
          stable(),
          crit("dead", "Dead neuron ratio < 25%", (r) => r.finalDeadRatio, "<", 0.25, pct),
          crit("vacc", "Validation accuracy > 70%", acc("valAcc"), ">", 0.7, pct),
        ],
        hints: [
          "Open a layer's stats. Units with pre-activation ≤ 0 can never receive gradient.",
          "What pushes every pre-activation negative before training even starts?",
          "Fix the initialization (biases → 0) or swap the activation to tanh.",
        ],
      },
      intermediate: {
        difficulty: "intermediate",
        patch: {},
        epochs: 60,
        criteria: [
          stable(),
          crit("dead", "Dead neuron ratio < 12%", (r) => r.finalDeadRatio, "<", 0.12, pct),
          crit("vacc", "Validation accuracy > 78%", acc("valAcc"), ">", 0.78, pct),
        ],
        hints: ["Biases at −3.0 silence the layer from epoch 0. Gradient descent can't revive what it can't reach.", "He-initialized weights with zero bias keep pre-activations centered."],
      },
      advanced: {
        difficulty: "advanced",
        patch: { biasInit: -3.5 },
        epochs: 45,
        criteria: [
          stable(),
          crit("dead", "Dead neuron ratio < 5%", (r) => r.finalDeadRatio, "<", 0.05, pct),
          crit("vacc", "Validation accuracy > 80%", acc("valAcc"), ">", 0.8, pct),
        ],
        hints: ["−3.5 biases, 45 epochs. Resuscitate nearly the whole layer — initialization is the defibrillator."],
      },
    },
  },
  "vanishing-gradients": {
    codename: "NSG·11-V",
    patient: "Sig-5 “Whisper”",
    complaint: "The back rows can't hear the lecture.",
    trueFault: "vanishing-gradients",
    variants: {
      beginner: {
        difficulty: "beginner",
        patch: { hidden: [8, 8, 8, 8] },
        epochs: 90,
        criteria: [
          stable(),
          crit("ratio", "∇h1 / ∇out > 10⁻³", gradRatio, ">", 1e-3, ex),
          crit("vacc", "Validation accuracy > 60%", acc("valAcc"), ">", 0.6, pct),
        ],
        hints: [
          "Compare per-layer gradient norms. How much smaller is h1 than the output?",
          "σ′(z) ≤ 0.25 at every sigmoid layer — the error is multiplied down the chain.",
          "Swap the activation for tanh or relu and watch h1's gradient return.",
        ],
      },
      intermediate: {
        difficulty: "intermediate",
        patch: {},
        epochs: 60,
        criteria: [
          stable(),
          crit("ratio", "∇h1 / ∇out > 2×10⁻²", gradRatio, ">", 0.02, ex),
          crit("vacc", "Validation accuracy > 72%", acc("valAcc"), ">", 0.72, pct),
        ],
        hints: ["Five sigmoid layers compound σ′ into near-nothing. The activation is the culprit.", "Tanh keeps gradients ~4× healthier per layer than sigmoid."],
      },
      advanced: {
        difficulty: "advanced",
        patch: { hidden: [8, 8, 8, 8, 8, 8], initScale: 0.6 },
        epochs: 45,
        criteria: [
          stable(),
          crit("ratio", "∇h1 / ∇out > 5×10⁻²", gradRatio, ">", 0.05, ex),
          crit("vacc", "Validation accuracy > 76%", acc("valAcc"), ">", 0.76, pct),
        ],
        hints: ["Six layers, weak init, 45 epochs. Restore a usable signal all the way to layer one."],
      },
    },
  },
  "exploding-gradients": {
    codename: "NSG·13-E",
    patient: "Net-4 “Amplifier”",
    complaint: "Whisper in, earthquake out.",
    trueFault: "exploding-gradients",
    variants: {
      beginner: {
        difficulty: "beginner",
        patch: { hidden: [10, 10, 10], initScale: 2.0 },
        epochs: 40,
        criteria: [
          stable(),
          crit("grad", "Peak gradient norm < 10³", peakGrad, "<", 1e3, ex),
          crit("vacc", "Validation accuracy > 65%", acc("valAcc"), ">", 0.65, pct),
        ],
        hints: [
          "The gradient chart is your ECG — watch where the runaway starts.",
          "Each layer multiplies activations by ~σ·√(fan/2). What does σ = 2.0 compound to?",
          "Re-initialize sensibly (He, scale 1) and the cascade collapses back to health.",
        ],
      },
      intermediate: {
        difficulty: "intermediate",
        patch: {},
        epochs: 30,
        criteria: [
          stable(),
          crit("grad", "Peak gradient norm < 10²", peakGrad, "<", 100, ex),
          crit("vacc", "Validation accuracy > 70%", acc("valAcc"), ">", 0.7, pct),
        ],
        hints: ["σ = 2.4 across four ReLU layers ≈ 10³ amplification. Initialization is the disease.", "Shrink σ until the forward pass stays bounded — then accuracy follows."],
      },
      advanced: {
        difficulty: "advanced",
        patch: { initScale: 3.0 },
        epochs: 24,
        criteria: [
          stable(),
          crit("grad", "Peak gradient norm < 20", peakGrad, "<", 20, ex),
          crit("vacc", "Validation accuracy > 78%", acc("valAcc"), ">", 0.78, pct),
        ],
        hints: ["σ = 3.0, 24 epochs. Tame a 10⁴-scale cascade into single-digit gradients."],
      },
    },
  },
};

export function getCase(scenarioId: string): ScenarioCase | undefined {
  return CASES[scenarioId];
}

export function variantConfig(sc: Scenario, variant: ScenarioVariant, difficulty: Difficulty): RunConfig {
  const { dataset: _d, train: _t, val: _v, noise: _n, epochs: _e, ...base } = sc.fault;
  return {
    ...base,
    ...variant.patch,
    epochs: variant.epochs,
    seed: scenarioSeed(`${sc.id}::${difficulty}`),
  };
}

/** The scenario's fault spec merged with the variant's dataset overrides. */
export function variantFault(sc: Scenario, variant: ScenarioVariant): ScenarioFault {
  const { epochs: _e, ...rest } = sc.fault;
  return { ...rest, ...(variant.dataPatch ?? {}) };
}

export function evaluateCriteria(variant: ScenarioVariant, r: TrainingResult): { results: CriterionResult[]; success: boolean } {
  const results = variant.criteria.map((c) => {
    const m = c.measure(r);
    return { id: c.id, label: c.label, passed: m.passed, actual: m.actual };
  });
  return { results, success: results.length > 0 && results.every((c) => c.passed) };
}
