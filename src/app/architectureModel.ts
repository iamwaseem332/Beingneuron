/**
 * Phase 12 — AI-architecture detection & extraction.
 *
 * When Synapse analyzes a paper, this module decides whether the paper is
 * AI/ML-related and — only when the text actually supports it — extracts an
 * architecture description. Every component carries real evidence excerpts
 * (page · section · chunk). Nothing here reconstructs an exact architecture;
 * the output is explicitly graded (detailed / partial / insufficient / none)
 * and the educational representation is derived separately, clearly labelled.
 */

import type { EvidenceReference } from "./analysisSchemas";
import type { DocumentChunkOut, NormalizedDoc } from "./pipeline";

/* ================= types ================= */

export type ArchKind =
  | "embedding"
  | "attention"
  | "conv"
  | "feedforward"
  | "recurrent"
  | "normalization"
  | "pooling"
  | "output";

export type ArchComponent = {
  kind: ArchKind;
  label: string;
  /** What the paper actually says (verbatim-anchored). */
  detail: string;
  evidence: EvidenceReference[];
};

export type TrainingNotes = {
  optimizer: string | null;
  learningRate: string | null;
  epochs: string | null;
  batchSize: string | null;
  loss: string | null;
  evidence: EvidenceReference[];
};

export type Sufficiency = "detailed" | "partial" | "insufficient" | "none";

export type PaperArchitecture = {
  /** 0–1 · how strongly the paper is about ML / DL / neural nets. */
  ai_relevance: number;
  ai_topics: string[];
  sufficiency: Sufficiency;
  components: ArchComponent[];
  training: TrainingNotes;
  /** Numeric architecture hints found verbatim ("12 layers", "hidden 512"…). */
  numeric_hints: string[];
  /** Honest one-line summary of what could (not) be extracted. */
  summary: string;
};

/* ================= detection vocabulary ================= */

type TopicDef = {
  topic: string;
  weight: number;
  pattern: RegExp;
  kinds: { kind: ArchKind; label: string }[];
};

const TOPICS: TopicDef[] = [
  {
    topic: "transformer",
    weight: 3,
    pattern: /\btransformer(s| architecture| model| encoder| decoder)?\b/i,
    kinds: [
      { kind: "attention", label: "Transformer attention blocks" },
      { kind: "feedforward", label: "Position-wise feed-forward blocks" },
    ],
  },
  {
    topic: "attention",
    weight: 2,
    pattern: /\b(self[- ]attention|multi[- ]head attention|attention mechanism|attention layer|cross[- ]attention)\b/i,
    kinds: [{ kind: "attention", label: "Attention mechanism" }],
  },
  {
    topic: "convolution",
    weight: 2,
    pattern: /\b(convolutional|convolution(s)?|CNN|conv\d|conv layer)\b/i,
    kinds: [{ kind: "conv", label: "Convolutional layers" }],
  },
  {
    topic: "feed-forward",
    weight: 2,
    pattern: /\b(feed[- ]?forward (network|block|layer)s?|MLP|fully[- ]connected layer|dense layer)\b/i,
    kinds: [{ kind: "feedforward", label: "Feed-forward / dense layers" }],
  },
  {
    topic: "recurrent",
    weight: 2,
    pattern: /\b(RNN|LSTM|GRU|recurrent (neural )?network)\b/i,
    kinds: [{ kind: "recurrent", label: "Recurrent layers" }],
  },
  {
    topic: "embedding",
    weight: 1,
    pattern: /\b(token|word|sentence|learned)? ?embeddings?\b/i,
    kinds: [{ kind: "embedding", label: "Embedding layer" }],
  },
  {
    topic: "normalization",
    weight: 1,
    pattern: /\b(layer ?norm|batch ?norm|normalization layer)\b/i,
    kinds: [{ kind: "normalization", label: "Normalization" }],
  },
  {
    topic: "pooling",
    weight: 1,
    pattern: /\b(max[- ]?pooling|average pooling|global pooling|pooling layer)\b/i,
    kinds: [{ kind: "pooling", label: "Pooling" }],
  },
  {
    topic: "output head",
    weight: 1,
    pattern: /\b(softmax|sigmoid output|output layer|classification head|linear head)\b/i,
    kinds: [{ kind: "output", label: "Output / prediction head" }],
  },
];

const GENERIC_AI = /\b(neural network|deep learning|deep neural|machine learning|gradient descent|backpropagation)\b/i;
export const AI_RELEVANCE_THRESHOLD = 0.3;

/* ================= evidence helpers ================= */

function evidenceFromChunk(chunk: DocumentChunkOut, pattern: RegExp): EvidenceReference | null {
  const m = chunk.text.match(pattern);
  if (!m || m.index === undefined) return null;
  // take the sentence around the match — short, verbatim, traceable
  const start = chunk.text.lastIndexOf(". ", m.index) + 2;
  let end = chunk.text.indexOf(". ", m.index + m[0].length);
  if (end === -1) end = chunk.text.length;
  else end += 1;
  const excerpt = chunk.text.slice(Math.max(0, start), Math.min(chunk.text.length, end)).trim().slice(0, 220);
  return {
    excerpt,
    page: chunk.page_start,
    section: chunk.section,
    chunk_id: chunk.chunk_id,
  };
}

function firstEvidence(chunks: DocumentChunkOut[], pattern: RegExp): EvidenceReference | null {
  // body chunks first — that's where architecture is described
  const ordered = [...chunks.filter((c) => c.kind === "body"), ...chunks.filter((c) => c.kind !== "body")];
  for (const c of ordered) {
    const ev = evidenceFromChunk(c, pattern);
    if (ev) return ev;
  }
  return null;
}

/* ================= training-methodology notes ================= */

const TRAINING_PATTERNS: { key: keyof Omit<TrainingNotes, "evidence">; pattern: RegExp }[] = [
  { key: "optimizer", pattern: /\b(AdamW?|SGD|RMSProp|AdaGrad|LAMB)\b(?![-\w])/ },
  { key: "learningRate", pattern: /learning rate (?:of )?([\d.eE××10⁻⁻-]+)|lr[=\s:]+([\d.eE-]+)/i },
  { key: "epochs", pattern: /(\d+)\s*(?:training )?epochs|trained for (\d+) epochs/i },
  { key: "batchSize", pattern: /batch (?:size )?(?:of )?(\d+)|(\d+)[\s-]?(?:per[\s-]?)?batch/i },
  { key: "loss", pattern: /\b(cross[- ]entropy|binary cross[- ]entropy|mean squared error|MSE|contrastive loss|BCE)\b/i },
];

function extractTraining(chunks: DocumentChunkOut[]): TrainingNotes {
  const notes: TrainingNotes = {
    optimizer: null,
    learningRate: null,
    epochs: null,
    batchSize: null,
    loss: null,
    evidence: [],
  };
  const seen = new Set<string>();
  for (const def of TRAINING_PATTERNS) {
    for (const c of chunks) {
      if (c.kind === "references") continue;
      const ev = evidenceFromChunk(c, def.pattern);
      if (!ev) continue;
      const m = ev.excerpt.match(def.pattern);
      const value = m ? (m[1] ?? m[2] ?? m[0]).trim().slice(0, 24) : ev.excerpt.slice(0, 24);
      if (!notes[def.key]) (notes[def.key] as string | null) = value;
      if (!seen.has(ev.chunk_id + def.key)) {
        seen.add(ev.chunk_id + def.key);
        if (notes.evidence.length < 6) notes.evidence.push(ev);
      }
      break;
    }
  }
  return notes;
}

/* ================= numeric hints ================= */

function extractNumericHints(chunks: DocumentChunkOut[]): string[] {
  const hints = new Set<string>();
  const patterns = [
    /(\d+)\s*(?:hidden )?layers/gi,
    /hidden (?:size|dim(?:ension)?) (?:of |is |= )?(\d+)/gi,
    /(\d+)\s*attention heads/gi,
    /d_?model[=\s:]+(\d+)/gi,
    /(\d+)[\s-]?(?:unit|neuron)s/gi,
    /(\d+)\s*channels/gi,
  ];
  for (const c of chunks) {
    if (c.kind === "references") continue;
    for (const p of patterns) {
      p.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = p.exec(c.text)) && hints.size < 8) {
        const from = Math.max(0, m.index - 20);
        hints.add(c.text.slice(from, m.index + m[0].length + 8).replace(/\s+/g, " ").trim().slice(0, 60));
      }
    }
  }
  return [...hints];
}

/* ================= the extraction itself ================= */

export function extractArchitecture(doc: NormalizedDoc, chunks: DocumentChunkOut[]): PaperArchitecture {
  const topics: string[] = [];
  let weight = 0;
  if (GENERIC_AI.test(doc.abstract + " " + doc.title)) weight += 1;

  const kindMap = new Map<ArchKind, { label: string; evidence: EvidenceReference[] }>();

  for (const t of TOPICS) {
    const ev = firstEvidence(chunks, t.pattern);
    if (!ev) continue;
    weight += t.weight;
    topics.push(t.topic);
    for (const k of t.kinds) {
      const prev = kindMap.get(k.kind);
      if (prev) {
        if (prev.evidence.length < 3) prev.evidence.push(ev);
      } else {
        kindMap.set(k.kind, { label: k.label, evidence: [ev] });
      }
    }
  }

  const ai_relevance = Math.min(1, Math.round((weight / 9) * 100) / 100);
  const components: ArchComponent[] = [...kindMap.entries()]
    .slice(0, 8)
    .map(([kind, v]) => ({
      kind,
      label: v.label,
      detail: v.evidence[0]?.excerpt ?? "",
      evidence: v.evidence.slice(0, 3),
    }));

  const training = extractTraining(chunks);
  const numeric_hints = extractNumericHints(chunks);

  /* ---- sufficiency: only what the text actually supports ---- */
  const distinctKinds = components.length;
  let sufficiency: Sufficiency;
  if (ai_relevance < AI_RELEVANCE_THRESHOLD) sufficiency = "none";
  else if (distinctKinds >= 3 && numeric_hints.length >= 1) sufficiency = "detailed";
  else if (distinctKinds >= 2 || (distinctKinds >= 1 && numeric_hints.length >= 1)) sufficiency = "partial";
  else sufficiency = "insufficient";

  const summary =
    sufficiency === "none"
      ? "This paper is not AI/ML-related — no architecture extraction applies."
      : sufficiency === "detailed"
        ? `Architecture described with ${distinctKinds} component types and ${numeric_hints.length} numeric detail(s).`
        : sufficiency === "partial"
          ? `Some architecture detail found (${distinctKinds} component type${distinctKinds === 1 ? "" : "s"}) — not enough for an exact reconstruction.`
          : "The paper mentions AI models but gives too little architectural detail to represent anything.";

  return { ai_relevance, ai_topics: topics, sufficiency, components, training, numeric_hints, summary };
}

/* ================= educational representation (clearly separate) ================= */

export type EducationalModel = {
  hidden: number[];
  activation: "relu" | "tanh" | "sigmoid";
  rationale: string[]; // honest mapping notes — paper fact → educational analogue
};

const KIND_ACTIVATION: Partial<Record<ArchKind, EducationalModel["activation"]>> = {
  attention: "tanh",
  recurrent: "tanh",
  conv: "relu",
  feedforward: "relu",
};

/**
 * Maps paper-defined structure onto the small educational network used by
 * NeuroSurgery. Returns null when the paper doesn't justify even an
 * approximation. Every mapping is reported so the user sees exactly what was
 * assumed.
 */
export function toEducationalModel(arch: PaperArchitecture): EducationalModel | null {
  if (arch.sufficiency === "none" || arch.sufficiency === "insufficient") return null;

  const rationale: string[] = [];
  let activation: EducationalModel["activation"] = "relu";
  let actSet = false;
  let width = 8;
  let depth = 2;

  for (const c of arch.components) {
    if (!actSet && KIND_ACTIVATION[c.kind]) {
      activation = KIND_ACTIVATION[c.kind] as EducationalModel["activation"];
      actSet = true;
      rationale.push(`${c.label} → ${activation} hidden units (educational analogue)`);
    }
    if (c.kind === "conv") {
      width = Math.max(width, 24);
      depth = 2;
      rationale.push("convolutional feature extraction → wider first hidden layer (24)");
    }
    if (c.kind === "attention" || c.kind === "feedforward") {
      depth = Math.max(depth, 2);
      rationale.push(`${c.label.toLowerCase()} → stacked hidden blocks`);
    }
    if (c.kind === "recurrent") {
      width = Math.max(width, 12);
      rationale.push("recurrent state → 12-unit hidden layers");
    }
  }

  // honor an explicit numeric hint when the paper gives one (scaled down)
  const widthHint = arch.numeric_hints.find((h) => /hidden|unit|neuron|d_?model/i.test(h));
  if (widthHint) {
    const m = widthHint.match(/(\d+)/);
    if (m) {
      const n = Number(m[1]);
      if (n >= 4) {
        width = Math.min(32, Math.max(8, Math.round(Math.log2(Math.max(8, n)))));
        rationale.push(`paper states ~${n} units → scaled to ${width} for the sandbox`);
      }
    }
  }

  rationale.push("trained on a synthetic 2-D dataset — the paper's data is NOT used");
  return { hidden: Array(depth).fill(width), activation, rationale };
}
