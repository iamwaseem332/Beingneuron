/**
 * Phase 7 — knowledge graph model.
 *
 * ResearchAnalysis (Phase 6, raw structured AI output)
 *   → KnowledgeGraph (nodes + typed relationships optimized for visualization)
 *
 * Generation rules:
 *  · deduplicate nodes by normalized label (evidence merged, never invented)
 *  · cap node degree and total size so graphs stay readable
 *  · every edge keeps evidence references from its source items
 *  · three levels — Overview (core ideas), Detailed, Full
 */

import type { EvidenceReference, PaperAnalysis } from "./analysisSchemas";

/* ================= schema ================= */

export type GraphNodeType =
  | "research_question"
  | "problem"
  | "concept"
  | "method"
  | "model"
  | "dataset"
  | "experiment"
  | "result"
  | "claim"
  | "limitation"
  | "conclusion";

export type RelationKind =
  | "solves"
  | "uses"
  | "depends_on"
  | "improves"
  | "compares_with"
  | "evaluated_on"
  | "supports"
  | "contradicts"
  | "causes"
  | "related_to"
  | "produces"
  | "limits";

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  label: string;
  short_description: string;
  detailed_explanation: string;
  evidence_references: EvidenceReference[];
  confidence: number;
  /** 0–1 composite of confidence, connectivity and type weight. */
  importance: number;
  uncertain: boolean;
  metadata: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: RelationKind;
  evidence: EvidenceReference[];
  confidence: number;
  uncertain: boolean;
};

export type GraphLevel = "overview" | "detailed" | "full";

export type GraphStats = {
  node_count: number;
  edge_count: number;
  levels: Record<GraphLevel, { nodes: number; edges: number; threshold: number }>;
  dropped_relations: number;
  generator: string;
};

export type KnowledgeGraphData = {
  job_id: string;
  paper_title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
  generated_at: string;
};

/* ================= visual language ================= */

export type NodeShape = "circle" | "diamond" | "hex" | "tri" | "square" | "ring";

export const NODE_META: Record<GraphNodeType, { label: string; color: string; shape: NodeShape }> = {
  research_question: { label: "Research Question", color: "var(--color-signal-300)", shape: "ring" },
  problem: { label: "Problem", color: "var(--color-signal-400)", shape: "tri" },
  concept: { label: "Concept", color: "var(--color-pulse-300)", shape: "circle" },
  method: { label: "Method", color: "#8fb0c6", shape: "diamond" },
  model: { label: "Model / System", color: "#a9c4d6", shape: "diamond" },
  dataset: { label: "Dataset", color: "#6b8fa8", shape: "hex" },
  experiment: { label: "Experiment", color: "#8ba4b4", shape: "square" },
  result: { label: "Result", color: "var(--color-pulse-400)", shape: "circle" },
  claim: { label: "Claim", color: "#e8ece2", shape: "circle" },
  limitation: { label: "Limitation", color: "var(--color-signal-500)", shape: "tri" },
  conclusion: { label: "Conclusion", color: "var(--color-pulse-500)", shape: "ring" },
};

export const RELATION_META: Record<
  RelationKind,
  { label: string; color: string; dash: string | null; meaning: string }
> = {
  solves: { label: "solves", color: "var(--color-signal-300)", dash: null, meaning: "The method or system directly addresses the problem it is linked to." },
  uses: { label: "uses", color: "#8fb0c6", dash: "2 5", meaning: "The method builds on, consumes or incorporates the linked resource." },
  depends_on: { label: "depends on", color: "#8ba4b4", dash: "7 3 2 3", meaning: "The source only works, or is only valid, given the target." },
  improves: { label: "improves", color: "var(--color-pulse-300)", dash: null, meaning: "The source reports a measurable gain over the target." },
  compares_with: { label: "compares with", color: "rgba(242,244,239,0.55)", dash: "8 4", meaning: "Both items are evaluated side by side in the paper." },
  evaluated_on: { label: "evaluated on", color: "#6b8fa8", dash: "2 5", meaning: "The experiment or method is tested on the linked dataset." },
  supports: { label: "supports", color: "var(--color-pulse-400)", dash: null, meaning: "The result provides evidence in favour of the claim." },
  contradicts: { label: "contradicts", color: "var(--color-signal-500)", dash: "5 4", meaning: "The paper positions the source against the target — findings or framing conflict." },
  causes: { label: "causes", color: "var(--color-signal-400)", dash: "6 4", meaning: "A causal mechanism is described from source to target." },
  related_to: { label: "related to", color: "rgba(242,244,239,0.38)", dash: "1 6", meaning: "The items co-occur in the same evidence context." },
  produces: { label: "produces", color: "var(--color-pulse-300)", dash: "7 3", meaning: "The experiment yields the linked result." },
  limits: { label: "limits", color: "var(--color-signal-400)", dash: "5 3", meaning: "The limitation constrains how far the linked conclusion or claim can be generalized." },
};

const TYPE_WEIGHT: Record<GraphNodeType, number> = {
  research_question: 1,
  problem: 1,
  conclusion: 1,
  claim: 0.85,
  result: 0.85,
  method: 0.8,
  model: 0.8,
  dataset: 0.7,
  experiment: 0.7,
  concept: 0.65,
  limitation: 0.62,
};

const CORE_TYPES: GraphNodeType[] = ["research_question", "problem", "conclusion"];

/* ================= helpers ================= */

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

function mergeEvidence(a: EvidenceReference[], b: EvidenceReference[]): EvidenceReference[] {
  const seen = new Set(a.map((e) => `${e.chunk_id}::${e.excerpt.slice(0, 40)}`));
  const out = [...a];
  for (const e of b) {
    const key = `${e.chunk_id}::${e.excerpt.slice(0, 40)}`;
    if (!seen.has(key) && out.length < 6) {
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

function sharesChunk(a: EvidenceReference[], b: EvidenceReference[]): boolean {
  const ids = new Set(a.map((e) => e.chunk_id));
  return b.some((e) => ids.has(e.chunk_id));
}

let counter = 0;
function eid(): string {
  counter += 1;
  return `ge-${counter.toString(36)}-${Date.now().toString(36)}`;
}

/* Phase 6 relationship kinds → typed graph relations */
const KIND_MAP: Record<string, RelationKind> = {
  uses: "uses",
  "evaluates-on": "evaluated_on",
  evaluated_on: "evaluated_on",
  supports: "supports",
  contrasts: "contradicts",
  contradicts: "contradicts",
  "co-occurs": "related_to",
  related_to: "related_to",
  improves: "improves",
  depends_on: "depends_on",
  solves: "solves",
  causes: "causes",
  produces: "produces",
  limits: "limits",
  compares_with: "compares_with",
};

/* ================= generation ================= */

const MAX_NODES = 150;
const MAX_DEGREE = 8;
const OVERVIEW_CAP = 14;
const DETAILED_CAP = 38;

export function buildKnowledgeGraph(
  analysis: PaperAnalysis,
  jobId: string,
  paperTitle: string,
): KnowledgeGraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let droppedRelations = 0;

  const addNode = (
    id: string,
    type: GraphNodeType,
    label: string,
    explanation: string,
    evidence: EvidenceReference[],
    confidence: number,
    uncertain: boolean,
    metadata: Record<string, unknown> = {},
  ) => {
    if (!label.trim() || evidence.length === 0) return null;
    const node: GraphNode = {
      id,
      type,
      label: truncate(label, 46),
      short_description: truncate(explanation || label, 110),
      detailed_explanation: truncate(explanation, 420),
      evidence_references: evidence.slice(0, 6),
      confidence: Math.min(1, Math.max(0, confidence)),
      importance: 0,
      uncertain,
      metadata: { ...metadata, sources: [id] },
    };
    nodes.push(node);
    return node;
  };

  /* ---- front-matter nodes (evidence = the paper's own words) ---- */
  const frontEvidence = (text: string): EvidenceReference[] => [
    { excerpt: truncate(text, 240), page: 1, section: "Front matter", chunk_id: "front-000" },
  ];
  if (analysis.research_question) {
    addNode("n-rq", "research_question", "Research Question", analysis.research_question, frontEvidence(analysis.research_question), 0.9, false, { origin: "synthesis" });
  }
  if (analysis.main_problem) {
    addNode("n-problem", "problem", "Core Problem", analysis.main_problem, frontEvidence(analysis.main_problem), 0.88, false, { origin: "synthesis" });
  }
  if (analysis.conclusion) {
    addNode("n-conclusion", "conclusion", "Conclusion", analysis.conclusion, frontEvidence(analysis.conclusion), 0.85, false, { origin: "synthesis" });
  }

  /* ---- item nodes ---- */
  for (const c of analysis.concepts) {
    addNode(c.id, "concept", c.name, c.explanation, c.evidence, c.confidence, c.uncertain, { kind: c.kind, occurrences: c.occurrences });
  }
  for (const m of analysis.methods) {
    addNode(m.id, m.type, m.name, m.description, m.evidence, m.confidence, m.uncertain);
  }
  for (const d of analysis.datasets) {
    addNode(d.id, "dataset", d.name, d.description, d.evidence, d.confidence, d.uncertain);
  }
  for (const e of analysis.experiments) {
    addNode(e.id, "experiment", e.name, e.description, e.evidence, e.confidence, e.uncertain);
  }
  for (const r of analysis.results) {
    addNode(r.id, "result", r.statement, r.metric ? `Measured: ${r.metric}. ${r.statement}` : r.statement, r.evidence, r.confidence, r.uncertain, { metric: r.metric });
  }
  for (const cl of analysis.claims) {
    addNode(cl.id, "claim", cl.text, `${cl.kind[0]?.toUpperCase()}${cl.kind.slice(1)} claim. ${cl.text}`, cl.evidence, cl.confidence, cl.uncertain, { kind: cl.kind });
  }
  for (const l of analysis.limitations) {
    addNode(l.id, "limitation", l.text, l.text, l.evidence, l.confidence, l.uncertain);
  }

  /* ---- deduplicate by normalized label ---- */
  const byKey = new Map<string, GraphNode>();
  const remap = new Map<string, string>();
  for (const n of nodes) {
    const key = norm(n.label);
    const prev = byKey.get(key);
    if (prev) {
      prev.evidence_references = mergeEvidence(prev.evidence_references, n.evidence_references);
      prev.confidence = Math.max(prev.confidence, n.confidence);
      prev.uncertain = prev.uncertain && n.uncertain;
      if (n.detailed_explanation.length > prev.detailed_explanation.length) {
        prev.detailed_explanation = n.detailed_explanation;
        prev.short_description = n.short_description;
      }
      const mergedSources = [
        ...((prev.metadata.sources as string[] | undefined) ?? []),
        ...((n.metadata.sources as string[] | undefined) ?? []),
      ];
      prev.metadata = { ...prev.metadata, ...n.metadata, sources: [...new Set(mergedSources)] };
      remap.set(n.id, prev.id);
    } else {
      byKey.set(key, n);
      remap.set(n.id, n.id);
    }
  }
  const deduped = [...byKey.values()];

  const nodeById = new Map(deduped.map((n) => [n.id, n]));
  const resolve = (name: string): GraphNode | null => {
    const k = norm(name);
    if (!k) return null;
    for (const n of deduped) {
      if (norm(n.label) === k) return n;
    }
    for (const n of deduped) {
      const nl = norm(n.label);
      if (nl.length > 5 && (nl.includes(k) || k.includes(nl))) return n;
    }
    return null;
  };

  const addEdge = (
    sourceId: string,
    targetId: string,
    kind: RelationKind,
    evidence: EvidenceReference[],
    confidence: number,
    uncertain = false,
  ) => {
    const s = remap.get(sourceId) ?? sourceId;
    const t = remap.get(targetId) ?? targetId;
    if (s === t || !nodeById.has(s) || !nodeById.has(t) || evidence.length === 0) {
      droppedRelations += 1;
      return;
    }
    edges.push({ id: eid(), source: s, target: t, kind, evidence: evidence.slice(0, 4), confidence: Math.min(1, Math.max(0, confidence)), uncertain });
  };

  /* ---- explicit relationships from the analysis ---- */
  for (const rel of analysis.relationships) {
    const s = resolve(rel.source);
    const t = resolve(rel.target);
    if (!s || !t) {
      droppedRelations += 1;
      continue;
    }
    addEdge(s.id, t.id, KIND_MAP[rel.kind] ?? "related_to", rel.evidence, rel.confidence, rel.uncertain);
  }

  /* ---- derived, evidence-checked relationships ---- */
  const problemNode = nodeById.get("n-problem");
  const conclusionNode = nodeById.get("n-conclusion");
  const methods = deduped.filter((n) => n.type === "method" || n.type === "model");
  const datasets = deduped.filter((n) => n.type === "dataset");
  const experiments = deduped.filter((n) => n.type === "experiment");
  const results = deduped.filter((n) => n.type === "result");
  const claims = deduped.filter((n) => n.type === "claim");
  const concepts = deduped.filter((n) => n.type === "concept");
  const limitations = deduped.filter((n) => n.type === "limitation");

  for (const m of methods) {
    if (problemNode) addEdge(m.id, problemNode.id, "solves", m.evidence_references, m.confidence * 0.9);
    for (const d of datasets) {
      if (sharesChunk(m.evidence_references, d.evidence_references) || norm(m.detailed_explanation).includes(norm(d.label))) {
        addEdge(m.id, d.id, "uses", mergeEvidence(m.evidence_references, d.evidence_references), Math.min(m.confidence, d.confidence));
      }
    }
  }
  for (const ex of experiments) {
    for (const d of datasets) {
      if (sharesChunk(ex.evidence_references, d.evidence_references) || norm(ex.detailed_explanation).includes(norm(d.label))) {
        addEdge(ex.id, d.id, "evaluated_on", mergeEvidence(ex.evidence_references, d.evidence_references), Math.min(ex.confidence, d.confidence));
      }
    }
    for (const r of results) {
      if (sharesChunk(ex.evidence_references, r.evidence_references)) {
        addEdge(ex.id, r.id, "produces", mergeEvidence(ex.evidence_references, r.evidence_references), Math.min(ex.confidence, r.confidence));
      }
    }
  }
  for (const r of results) {
    for (const cl of claims) {
      if (sharesChunk(r.evidence_references, cl.evidence_references)) {
        addEdge(r.id, cl.id, "supports", mergeEvidence(r.evidence_references, cl.evidence_references), Math.min(r.confidence, cl.confidence));
      }
    }
  }
  let claimConceptEdges = 0;
  for (const cl of claims) {
    for (const c of concepts) {
      if (claimConceptEdges >= 24) break;
      const nl = norm(c.label);
      if (nl.length > 4 && norm(cl.detailed_explanation).includes(nl)) {
        addEdge(cl.id, c.id, "related_to", cl.evidence_references, Math.min(cl.confidence, c.confidence) * 0.85, true);
        claimConceptEdges += 1;
      }
    }
  }
  const limitTarget = conclusionNode ?? [...claims].sort((a, b) => b.confidence - a.confidence)[0];
  for (const l of limitations) {
    if (limitTarget) addEdge(l.id, limitTarget.id, "limits", l.evidence_references, l.confidence * 0.9);
  }

  /* ---- prune duplicate edges (same pair + kind), keep strongest ---- */
  const bestEdge = new Map<string, GraphEdge>();
  for (const e of edges) {
    const key = `${e.source}→${e.target}::${e.kind}`;
    const prev = bestEdge.get(key);
    if (!prev || e.confidence > prev.confidence) bestEdge.set(key, e);
  }
  let pruned = [...bestEdge.values()];

  /* ---- degree cap (readability) ---- */
  pruned.sort((a, b) => b.confidence - a.confidence);
  const degree = new Map<string, number>();
  const capped: GraphEdge[] = [];
  for (const e of pruned) {
    const ds = degree.get(e.source) ?? 0;
    const dt = degree.get(e.target) ?? 0;
    if (ds >= MAX_DEGREE || dt >= MAX_DEGREE) {
      droppedRelations += 1;
      continue;
    }
    degree.set(e.source, ds + 1);
    degree.set(e.target, dt + 1);
    capped.push(e);
  }
  pruned = capped;

  /* ---- importance scoring ---- */
  const maxDegree = Math.max(1, ...[...degree.values()]);
  for (const n of deduped) {
    const d = degree.get(n.id) ?? 0;
    n.importance = Math.min(1, 0.45 * n.confidence + 0.35 * (d / maxDegree) + 0.2 * TYPE_WEIGHT[n.type]);
  }

  /* ---- size cap: keep the most important nodes ---- */
  deduped.sort((a, b) => b.importance - a.importance);
  const kept = deduped.slice(0, MAX_NODES);
  const keptIds = new Set(kept.map((n) => n.id));
  pruned = pruned.filter((e) => keptIds.has(e.source) && keptIds.has(e.target));

  /* ---- level thresholds ---- */
  const levelThreshold = (cap: number): number => {
    const core = kept.filter((n) => CORE_TYPES.includes(n.type));
    const rest = kept.filter((n) => !CORE_TYPES.includes(n.type));
    const slots = Math.max(0, cap - core.length);
    const cutoff = rest[Math.min(slots, rest.length) - 1];
    return cutoff ? Math.min(cutoff.importance, core.length > 0 ? 1 : cutoff.importance) : core.length > 0 ? 0 : 1;
  };

  const levelSet = (level: GraphLevel): { nodes: number; edges: number; threshold: number } => {
    if (level === "full") return { nodes: kept.length, edges: pruned.length, threshold: 0 };
    const cap = level === "overview" ? OVERVIEW_CAP : DETAILED_CAP;
    const threshold = levelThreshold(cap);
    const ns = kept.filter((n) => CORE_TYPES.includes(n.type) || n.importance >= threshold);
    const ids = new Set(ns.map((n) => n.id));
    const es = pruned.filter((e) => ids.has(e.source) && ids.has(e.target));
    return { nodes: ns.length, edges: es.length, threshold };
  };

  const stats: GraphStats = {
    node_count: kept.length,
    edge_count: pruned.length,
    levels: { overview: levelSet("overview"), detailed: levelSet("detailed"), full: levelSet("full") },
    dropped_relations: droppedRelations,
    generator: "synapse-graph-v1",
  };

  return {
    job_id: jobId,
    paper_title: truncate(paperTitle, 140),
    nodes: kept,
    edges: pruned,
    stats,
    generated_at: new Date().toISOString(),
  };
}

/* ================= level filtering (used by the renderer page) ================= */

export function nodesForLevel(data: KnowledgeGraphData, level: GraphLevel): Set<string> {
  if (level === "full") return new Set(data.nodes.map((n) => n.id));
  const { threshold } = data.stats.levels[level];
  const out = new Set<string>();
  for (const n of data.nodes) {
    if (CORE_TYPES.includes(n.type) || n.importance >= threshold) out.add(n.id);
  }
  return out;
}

/* ================= source traceability (Phase 8 workspace) ================= */

/**
 * Maps a Phase 6 analysis item id (or front-matter key) to the graph node
 * that absorbed it — dedupe-safe. Returns null when the item didn't make
 * it into the graph (no evidence, size cap, etc.).
 */
export function nodeIdBySource(data: KnowledgeGraphData, sourceId: string): string | null {
  for (const n of data.nodes) {
    const sources = (n.metadata.sources as string[] | undefined) ?? [n.id];
    if (sources.includes(sourceId)) return n.id;
  }
  return null;
}

/** Honest, derived "why it matters" line — computed only from stored data. */
export function nodeSignificance(node: GraphNode, degree: number, totalEdges: number): string {
  const parts: string[] = [];
  if (node.type === "research_question") parts.push("anchors the whole map — every method and result traces back to it");
  else if (node.type === "problem") parts.push("the gap this paper sets out to close");
  else if (node.type === "conclusion") parts.push("the paper's closing position, checked against its limitations");
  if (degree > 0) parts.push(`connected to ${degree} other node${degree === 1 ? "" : "s"}${totalEdges > 0 ? ` (${Math.round((degree / Math.max(1, totalEdges)) * 100)}% of visible relations)` : ""}`);
  if (node.evidence_references.length >= 3) parts.push(`corroborated by ${node.evidence_references.length} independent excerpts`);
  else if (node.evidence_references.length > 0) parts.push(`backed by ${node.evidence_references.length} source excerpt${node.evidence_references.length === 1 ? "" : "s"}`);
  if (node.uncertain) parts.push("flagged uncertain — treat as a lead, not a fact");
  return parts.length > 0 ? parts.join(" · ") : "present in the paper's extracted structure";
}
