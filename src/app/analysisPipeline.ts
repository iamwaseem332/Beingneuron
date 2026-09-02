/**
 * Phase 6 — analysis orchestrator (long-document strategy).
 *
 *   normalized doc + chunks
 *     → analyze chunks individually (never the whole paper in one prompt)
 *     → extract candidate items
 *     → normalize & deduplicate across chunks
 *     → synthesize top-level structure
 *     → build cross-concept relationships
 *     → validate evidence (drop unsupported items)
 *     → structured research representation
 *
 * If the selected provider performs whole-document analysis server-side
 * (LLM path), its result is validated here with the same evidence rules.
 */

import type { DocumentChunkOut, NormalizedDoc } from "./pipeline";
import { validateAnalysis, type ChunkCandidates, type EvidenceReference, type PaperAnalysis } from "./analysisSchemas";
import { emptyUsage, type AiUsage, type AnalysisProvider, type AnalysisStage } from "./aiProviders";

const MAX_EVIDENCE_PER_ITEM = 4;

export type AnalysisEvent = { stage: AnalysisStage; detail?: string };

export type AnalysisOutcome = { analysis: PaperAnalysis; usage: AiUsage };

/* ================= small helpers ================= */

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]+$/g, "").trim();
}

function mergeEvidence(a: EvidenceReference[], b: EvidenceReference[]): EvidenceReference[] {
  const seen = new Set(a.map((e) => e.excerpt));
  const out = [...a];
  for (const e of b) {
    if (out.length >= MAX_EVIDENCE_PER_ITEM) break;
    if (!seen.has(e.excerpt)) {
      seen.add(e.excerpt);
      out.push(e);
    }
  }
  return out;
}

const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0));

/* ================= dedup / merge ================= */

type Named = { name: string; evidence: EvidenceReference[]; confidence: number };

function dedupeByName<T extends Named>(items: T[]): (T & { occurrences: number })[] {
  const byKey = new Map<string, T & { occurrences: number }>();
  for (const it of items) {
    const key = norm(it.name);
    if (!key) continue;
    const prev = byKey.get(key);
    if (prev) {
      prev.evidence = mergeEvidence(prev.evidence, it.evidence);
      prev.confidence = Math.max(prev.confidence, it.confidence);
      prev.occurrences += 1;
    } else {
      byKey.set(key, { ...it, occurrences: 1 });
    }
  }
  return [...byKey.values()];
}

function dedupeByText<T extends { text: string; evidence: EvidenceReference[]; confidence: number }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const it of items) {
    const key = norm(it.text).slice(0, 120);
    const prev = seen.get(key);
    if (prev) {
      prev.evidence = mergeEvidence(prev.evidence, it.evidence);
      prev.confidence = Math.max(prev.confidence, it.confidence);
    } else {
      seen.set(key, it);
    }
  }
  return [...seen.values()];
}

/* ================= relationship building (co-occurrence) ================= */

function buildRelationships(
  candidates: ChunkCandidates[],
  knownNames: Set<string>,
): { source: string; target: string; kind: string; evidence: EvidenceReference[]; confidence: number }[] {
  const pairEvidence = new Map<string, { source: string; target: string; kind: string; evidence: EvidenceReference[] }>();

  for (const cand of candidates) {
    const allItems = [...cand.concepts, ...cand.methods, ...cand.datasets];
    const names = [...new Set(allItems.map((i) => ("name" in i ? norm(i.name) : "").trim()).filter((n) => n && knownNames.has(n)))];
    for (const m of cand.methods) {
      for (const d of cand.datasets) {
        const key = [norm(m.name), norm(d.name)].sort().join("||");
        if (!pairEvidence.has(key)) {
          pairEvidence.set(key, {
            source: m.name,
            target: d.name,
            kind: "evaluates-on",
            evidence: mergeEvidence(m.evidence, d.evidence).slice(0, 2),
          });
        }
      }
    }
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const a = names[i];
        const b = names[j];
        const key = [a, b].sort().join("||");
        if (pairEvidence.has(key)) continue;
        const evA = allItems.find((x) => "name" in x && norm(x.name) === a)?.evidence ?? [];
        const evB = allItems.find((x) => "name" in x && norm(x.name) === b)?.evidence ?? [];
        pairEvidence.set(key, {
          source: a,
          target: b,
          kind: "co-occurs",
          evidence: mergeEvidence(evA, evB).slice(0, 2),
        });
      }
    }
  }

  return [...pairEvidence.values()]
    .filter((p) => p.evidence.length > 0 && p.source !== p.target)
    .map((p) => ({ ...p, confidence: Math.min(0.8, 0.4 + p.evidence.length * 0.15) }))
    .slice(0, 18);
}

/* ================= the pipeline ================= */

export async function analyzePaper(
  input: { jobId: string; doc: NormalizedDoc; chunks: DocumentChunkOut[] },
  provider: AnalysisProvider,
  onStage: (e: AnalysisEvent) => void,
): Promise<AnalysisOutcome> {
  /* ---- server-side (LLM) path: provider does the whole document ---- */
  if (provider.analyzeDocument) {
    const result = await provider.analyzeDocument(input, (s) => onStage({ stage: s }));
    if (result) {
      const { analysis } = validateAnalysis(result.analysis);
      return { analysis, usage: result.usage };
    }
    // unavailable → fall through to the client strategy
  }

  if (!provider.analyzeChunk) {
    throw new Error("The selected analysis provider has no usable analysis method.");
  }

  const analyzable = input.chunks.filter((c) => c.kind !== "references");

  /* ---- 1) analyze chunks individually ---- */
  onStage({ stage: "analyzing_concepts", detail: `${analyzable.length} chunks` });
  const candidates: ChunkCandidates[] = [];
  for (const chunk of analyzable) {
    candidates.push(await provider.analyzeChunk(chunk, input.doc));
  }
  await yieldTick();

  /* ---- 2) methodology: merge methods & models ---- */
  onStage({ stage: "analyzing_methodology" });
  const methods = dedupeByName(candidates.flatMap((c) => c.methods));
  await yieldTick();

  /* ---- 3) claims: merge claims, results, limitations ---- */
  onStage({ stage: "extracting_claims" });
  const claims = dedupeByText(candidates.flatMap((c) => c.claims));
  const results = dedupeByText(
    candidates.flatMap((c) => c.results).map((r) => ({ ...r, text: r.statement })),
  ).map(({ text, ...rest }) => ({ ...rest, statement: text }));
  const limitations = dedupeByText(candidates.flatMap((c) => c.limitations));
  const datasets = dedupeByName(candidates.flatMap((c) => c.datasets));
  const experiments = dedupeByName(candidates.flatMap((c) => c.experiments).map((e) => ({ ...e, name: e.name })));
  await yieldTick();

  /* ---- 4) evidence mapping: dedupe concepts, consolidate evidence ---- */
  onStage({ stage: "mapping_evidence" });
  const concepts = dedupeByName(candidates.flatMap((c) => c.concepts))
    .map((c) => ({
      name: c.name,
      type: "concept" as const,
      kind: c.kind,
      explanation: c.evidence[0]?.excerpt ?? "",
      evidence: c.evidence,
      confidence: c.confidence,
      uncertain: c.confidence < 0.45,
      occurrences: c.occurrences,
    }))
    .sort((a, b) => b.occurrences - a.occurrences || b.confidence - a.confidence)
    .slice(0, 24);
  await yieldTick();

  /* ---- 5) finalize: relationships + top-level synthesis + validation ---- */
  onStage({ stage: "finalizing" });
  const knownNames = new Set([
    ...concepts.map((c) => norm(c.name)),
    ...methods.map((m) => norm(m.name)),
    ...datasets.map((d) => norm(d.name)),
  ]);
  const relationships = buildRelationships(candidates, knownNames);

  const firstNonNull = (pick: (c: ChunkCandidates) => string | null): string | null => {
    for (const c of candidates) {
      const v = pick(c);
      if (v) return v;
    }
    return null;
  };

  const raw = {
    research_question: firstNonNull((c) => c.researchQuestion),
    main_problem: firstNonNull((c) => c.mainProblem),
    conclusion: firstNonNull((c) => c.conclusion),
    concepts,
    claims,
    methods,
    results,
    datasets,
    experiments,
    limitations,
    relationships,
  };

  const { analysis } = validateAnalysis(raw);

  /* ---- usage accounting (local provider: no model, real request count) ---- */
  const chars = analyzable.reduce((n, c) => n + c.char_count, 0);
  const usage: AiUsage = {
    ...emptyUsage(provider.id, "lexical-v1"),
    requests: analyzable.length,
    prompt_tokens: Math.round(chars / 4),
    completion_tokens: 0,
    cost_usd: 0,
  };

  onStage({ stage: "done" });
  return { analysis, usage };
}
