/**
 * Phase 6 — structured analysis schemas.
 *
 * Every item BeingNeuron extracts from a paper is one of these typed records.
 * The pipeline NEVER stores free-form paragraphs as primary data, and NEVER
 * stores an item that cannot point at a short evidence excerpt with a page,
 * section and source chunk. That invariant is enforced by `validateAnalysis`.
 */

/* ================= evidence — the non-negotiable link ================= */

export type EvidenceReference = {
  /** Short verbatim excerpt from the paper (kept reasonably short). */
  excerpt: string;
  /** 1-based page where the excerpt appears. */
  page: number | null;
  /** Section heading the excerpt came from ("" for front matter). */
  section: string;
  /** The exact chunk the excerpt was drawn from. */
  chunk_id: string;
};

/** Confidence is always 0–1. Below `UNCERTAIN_THRESHOLD` an item is flagged. */
export const UNCERTAIN_THRESHOLD = 0.45;

export function clampConfidence(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.min(1, Math.max(0, n));
}

/* ================= item types ================= */

export type ItemType =
  | "concept"
  | "claim"
  | "method"
  | "model"
  | "result"
  | "dataset"
  | "experiment"
  | "limitation";

export type Concept = {
  id: string;
  name: string;
  type: "concept";
  /** What kind of concept: technique, theory, phenomenon, metric, field… */
  kind: string;
  explanation: string;
  evidence: EvidenceReference[];
  confidence: number;
  uncertain: boolean;
  /** Number of distinct chunks this concept was observed in. */
  occurrences: number;
};

export type Claim = {
  id: string;
  type: "claim";
  text: string;
  /** central · supporting · hypothesis · comparative */
  kind: string;
  evidence: EvidenceReference[];
  confidence: number;
  uncertain: boolean;
};

export type Method = {
  id: string;
  type: "method" | "model";
  name: string;
  description: string;
  evidence: EvidenceReference[];
  confidence: number;
  uncertain: boolean;
};

export type Result = {
  id: string;
  type: "result";
  statement: string;
  /** Extracted quantitative metric, if any (e.g. "94.2% accuracy"). */
  metric: string | null;
  evidence: EvidenceReference[];
  confidence: number;
  uncertain: boolean;
};

export type Dataset = {
  id: string;
  type: "dataset";
  name: string;
  description: string;
  evidence: EvidenceReference[];
  confidence: number;
  uncertain: boolean;
};

export type Experiment = {
  id: string;
  type: "experiment";
  name: string;
  description: string;
  evidence: EvidenceReference[];
  confidence: number;
  uncertain: boolean;
};

export type Limitation = {
  id: string;
  type: "limitation";
  text: string;
  evidence: EvidenceReference[];
  confidence: number;
  uncertain: boolean;
};

export type Relationship = {
  id: string;
  type: "relationship";
  /** Normalized concept/method/dataset name on the source side. */
  source: string;
  target: string;
  /** co-occurs · uses · evaluates-on · supports · contrasts */
  kind: string;
  evidence: EvidenceReference[];
  confidence: number;
  uncertain: boolean;
};

/* ================= per-chunk candidates ================= */

export type ChunkCandidates = {
  chunk_id: string;
  researchQuestion: string | null;
  mainProblem: string | null;
  conclusion: string | null;
  concepts: Omit<Concept, "id" | "occurrences">[];
  claims: Omit<Claim, "id">[];
  methods: Omit<Method, "id">[];
  results: Omit<Result, "id">[];
  datasets: Omit<Dataset, "id">[];
  experiments: Omit<Experiment, "id">[];
  limitations: Omit<Limitation, "id">[];
};

/* ================= the full structured representation ================= */

export type PaperAnalysis = {
  research_question: string | null;
  main_problem: string | null;
  conclusion: string | null;
  concepts: Concept[];
  claims: Claim[];
  methods: Method[];
  results: Result[];
  datasets: Dataset[];
  experiments: Experiment[];
  limitations: Limitation[];
  relationships: Relationship[];
  /** How many items were dropped during validation for lacking evidence. */
  dropped_unsupported: number;
};

/* ================= validation (hallucination guard) ================= */

function asString(v: unknown, max = 600): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function asEvidenceArray(v: unknown): EvidenceReference[] {
  if (!Array.isArray(v)) return [];
  const out: EvidenceReference[] = [];
  for (const e of v) {
    const rec = e as Partial<EvidenceReference>;
    const excerpt = asString(rec?.excerpt, 280);
    if (!excerpt) continue; // evidence is mandatory
    out.push({
      excerpt,
      page: typeof rec?.page === "number" ? rec.page : null,
      section: asString(rec?.section, 120),
      chunk_id: asString(rec?.chunk_id, 64),
    });
  }
  return out;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

function conf(rec: Record<string, unknown>): number {
  return clampConfidence(rec.confidence);
}

/**
 * Coerces raw provider output into a valid PaperAnalysis.
 * Any item that cannot supply at least one evidence reference is DROPPED
 * (counted in `dropped_unsupported`) rather than stored — BeingNeuron does
 * not persist unsupported facts.
 */
export function validateAnalysis(raw: unknown): { analysis: PaperAnalysis; dropped: number } {
  const r = (raw ?? {}) as Record<string, unknown>;
  let dropped = 0;

  const pick = <T,>(arr: unknown, map: (rec: Record<string, unknown>) => T | null): T[] => {
    if (!Array.isArray(arr)) return [];
    const out: T[] = [];
    for (const item of arr) {
      const built = map((item ?? {}) as Record<string, unknown>);
      if (built) out.push(built);
      else dropped += 1;
    }
    return out;
  };

  const needEvidence = (rec: Record<string, unknown>): EvidenceReference[] | null => {
    const ev = asEvidenceArray(rec.evidence);
    return ev.length > 0 ? ev : null;
  };

  const analysis: PaperAnalysis = {
    research_question: asString(r.research_question, 400) || null,
    main_problem: asString(r.main_problem, 400) || null,
    conclusion: asString(r.conclusion, 600) || null,

    concepts: pick<Concept>(r.concepts, (rec) => {
      const evidence = needEvidence(rec);
      const name = asString(rec.name, 120);
      if (!evidence || !name) return null;
      const confidence = conf(rec);
      return {
        id: nextId("c"),
        name,
        type: "concept" as const,
        kind: asString(rec.kind, 40) || "concept",
        explanation: asString(rec.explanation, 400),
        evidence,
        confidence,
        uncertain: confidence < UNCERTAIN_THRESHOLD,
        occurrences: typeof rec.occurrences === "number" ? rec.occurrences : evidence.length,
      };
    }),

    claims: pick<Claim>(r.claims, (rec) => {
      const evidence = needEvidence(rec);
      const text = asString(rec.text, 400);
      if (!evidence || !text) return null;
      const confidence = conf(rec);
      return {
        id: nextId("cl"),
        type: "claim" as const,
        text,
        kind: asString(rec.kind, 40) || "supporting",
        evidence,
        confidence,
        uncertain: confidence < UNCERTAIN_THRESHOLD,
      };
    }),

    methods: pick<Method>(r.methods, (rec) => {
      const evidence = needEvidence(rec);
      const name = asString(rec.name, 120);
      if (!evidence || !name) return null;
      const isModel = asString(rec.type, 12) === "model";
      const confidence = conf(rec);
      return {
        id: nextId("m"),
        type: isModel ? ("model" as const) : ("method" as const),
        name,
        description: asString(rec.description, 400),
        evidence,
        confidence,
        uncertain: confidence < UNCERTAIN_THRESHOLD,
      };
    }),

    results: pick<Result>(r.results, (rec) => {
      const evidence = needEvidence(rec);
      const statement = asString(rec.statement, 400);
      if (!evidence || !statement) return null;
      const confidence = conf(rec);
      return {
        id: nextId("r"),
        type: "result" as const,
        statement,
        metric: asString(rec.metric, 80) || null,
        evidence,
        confidence,
        uncertain: confidence < UNCERTAIN_THRESHOLD,
      };
    }),

    datasets: pick<Dataset>(r.datasets, (rec) => {
      const evidence = needEvidence(rec);
      const name = asString(rec.name, 120);
      if (!evidence || !name) return null;
      const confidence = conf(rec);
      return {
        id: nextId("d"),
        type: "dataset" as const,
        name,
        description: asString(rec.description, 300),
        evidence,
        confidence,
        uncertain: confidence < UNCERTAIN_THRESHOLD,
      };
    }),

    experiments: pick<Experiment>(r.experiments, (rec) => {
      const evidence = needEvidence(rec);
      const name = asString(rec.name, 160);
      if (!evidence || !name) return null;
      const confidence = conf(rec);
      return {
        id: nextId("e"),
        type: "experiment" as const,
        name,
        description: asString(rec.description, 300),
        evidence,
        confidence,
        uncertain: confidence < UNCERTAIN_THRESHOLD,
      };
    }),

    limitations: pick<Limitation>(r.limitations, (rec) => {
      const evidence = needEvidence(rec);
      const text = asString(rec.text, 400);
      if (!evidence || !text) return null;
      const confidence = conf(rec);
      return {
        id: nextId("l"),
        type: "limitation" as const,
        text,
        evidence,
        confidence,
        uncertain: confidence < UNCERTAIN_THRESHOLD,
      };
    }),

    relationships: pick<Relationship>(r.relationships, (rec) => {
      const evidence = needEvidence(rec);
      const source = asString(rec.source, 120);
      const target = asString(rec.target, 120);
      if (!evidence || !source || !target) return null;
      const confidence = conf(rec);
      return {
        id: nextId("rel"),
        type: "relationship" as const,
        source,
        target,
        kind: asString(rec.kind, 40) || "co-occurs",
        evidence,
        confidence,
        uncertain: confidence < UNCERTAIN_THRESHOLD,
      };
    }),

    dropped_unsupported: dropped,
  };

  return { analysis, dropped };
}

/** True when an analysis carries at least one evidence-backed item. */
export function hasSubstance(a: PaperAnalysis): boolean {
  return (
    a.concepts.length +
      a.claims.length +
      a.methods.length +
      a.results.length +
      a.datasets.length +
      a.experiments.length +
      a.limitations.length >
    0
  );
}
