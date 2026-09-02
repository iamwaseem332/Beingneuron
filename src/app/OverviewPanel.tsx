/**
 * Phase 8 — workspace left rail: the paper itself.
 * Overview (title/authors/meta), the extracted document structure with page
 * traceability, a clickable node-type index that doubles as a filter, and an
 * evidence ledger computed only from stored data.
 */

import { useMemo, useState } from "react";
import {
  NODE_META,
  type GraphNode,
  type GraphNodeType,
  type KnowledgeGraphData,
} from "./graphModel";
import type { NormalizedDoc } from "./pipeline";
import type { DocumentSummary } from "./SynapseProvider";
import { IconChevron, IconDoc } from "../icons";

const TYPE_ORDER: GraphNodeType[] = [
  "research_question", "problem", "concept", "method", "model", "dataset",
  "experiment", "result", "claim", "limitation", "conclusion",
];

export default function OverviewPanel({
  graph,
  summary,
  doc,
  hiddenTypes,
  onToggleType,
}: {
  graph: KnowledgeGraphData;
  summary: DocumentSummary | undefined;
  doc: NormalizedDoc | null;
  hiddenTypes: Set<GraphNodeType>;
  onToggleType: (t: GraphNodeType) => void;
}) {
  const [structureOpen, setStructureOpen] = useState(true);

  const typeCounts = useMemo(() => {
    const counts = new Map<GraphNodeType, number>();
    for (const n of graph.nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
    return counts;
  }, [graph]);

  const evidenceStats = useMemo(() => {
    let refs = 0;
    let uncertain = 0;
    const chunks = new Set<string>();
    for (const n of graph.nodes) {
      refs += n.evidence_references.length;
      if (n.uncertain) uncertain += 1;
      n.evidence_references.forEach((e) => chunks.add(e.chunk_id));
    }
    for (const e of graph.edges) {
      refs += e.evidence.length;
      e.evidence.forEach((ev) => chunks.add(ev.chunk_id));
    }
    return { refs, uncertain, chunks: chunks.size };
  }, [graph]);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto app-scroll pr-1">
      {/* paper block */}
      <div className="rounded-xl border border-ink-900/12 bg-paper-card p-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-pulse-700">Paper</p>
        <h3 className="mt-2 font-display text-[15px] font-semibold leading-snug tracking-tight text-ink-900">
          {summary?.title || graph.paper_title}
        </h3>
        {summary && summary.authors.length > 0 && (
          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink-500">
            {summary.authors.slice(0, 6).join(", ")}
            {summary.authors.length > 6 ? ` +${summary.authors.length - 6} more` : ""}
          </p>
        )}
        {summary && (
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-ink-900/[0.08] pt-3.5">
            {[
              ["pages", summary.page_count],
              ["words", summary.word_count.toLocaleString()],
              ["sections", summary.section_count],
              ["chunks", summary.chunk_count],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-ink-400">{k}</dt>
                <dd className="tnum mt-0.5 font-display text-[15px] font-bold text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* graph index — click to filter */}
      <div className="rounded-xl border border-ink-900/12 bg-paper-card p-5">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-pulse-700">Graph index</p>
          <p className="font-mono text-[9px] tracking-wide text-ink-400">
            {graph.stats.node_count} nodes · {graph.stats.edge_count} edges
          </p>
        </div>
        <ul className="mt-3 space-y-0.5">
          {TYPE_ORDER.filter((t) => (typeCounts.get(t) ?? 0) > 0).map((t) => {
            const hidden = hiddenTypes.has(t);
            const meta = NODE_META[t];
            return (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => onToggleType(t)}
                  aria-pressed={!hidden}
                  title={hidden ? `Show ${meta.label} nodes` : `Hide ${meta.label} nodes`}
                  className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-200 hover:bg-ink-900/[0.045] ${
                    hidden ? "opacity-40" : ""
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 transition-all duration-300 ${hidden ? "scale-75 rounded-full border border-current bg-transparent" : "rounded-[3px]"}`}
                    style={{ color: meta.color.includes("242,244,239") ? "var(--color-ink-400)" : meta.color, background: hidden ? "transparent" : meta.color.includes("242,244,239") ? "var(--color-ink-400)" : meta.color }}
                  />
                  <span className={`flex-1 font-display text-[12.5px] font-medium ${hidden ? "text-ink-400 line-through decoration-ink-300" : "text-ink-800"}`}>
                    {meta.label}
                  </span>
                  <span className={`tnum font-mono text-[10px] ${hidden ? "text-ink-300" : "text-ink-500"}`}>
                    {typeCounts.get(t)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {hiddenTypes.size > 0 && (
          <p className="mt-2.5 border-t border-dashed border-ink-900/10 pt-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-signal-600">
            {hiddenTypes.size} type{hiddenTypes.size === 1 ? "" : "s"} filtered out
          </p>
        )}
      </div>

      {/* extracted structure */}
      <div className="rounded-xl border border-ink-900/12 bg-paper-card p-5">
        <button
          type="button"
          onClick={() => setStructureOpen((v) => !v)}
          aria-expanded={structureOpen}
          className="flex w-full items-center justify-between"
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-pulse-700">Document structure</span>
          <IconChevron size={14} className={`text-ink-400 transition-transform duration-300 ${structureOpen ? "rotate-180" : ""}`} />
        </button>
        {structureOpen && (
          <div className="mt-3">
            {doc ? (
              <>
                <ul className="app-scroll max-h-56 space-y-0.5 overflow-y-auto pr-1">
                  {doc.abstract && (
                    <li className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-pulse-100/50">
                      <span className="font-display text-[12px] font-semibold text-ink-800">Abstract</span>
                      <span className="shrink-0 font-mono text-[9px] text-ink-400">p.1</span>
                    </li>
                  )}
                  {doc.sections.filter((s) => !s.isReferences).map((s) => (
                    <li key={s.order} className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-pulse-100/50">
                      <span className="truncate font-display text-[12px] font-medium text-ink-700">
                        {s.heading || "(untitled)"}
                      </span>
                      <span className="shrink-0 font-mono text-[9px] text-ink-400">
                        p.{s.page} · {s.paragraphs.length}¶
                      </span>
                    </li>
                  ))}
                </ul>
                {doc.twoColumnPages > 0 && (
                  <p className="mt-2.5 border-t border-dashed border-ink-900/10 pt-2 font-mono text-[9px] tracking-wide text-ink-400">
                    {doc.twoColumnPages} two-column page{doc.twoColumnPages === 1 ? "" : "s"} re-ordered during normalization
                  </p>
                )}
              </>
            ) : (
              <p className="flex items-center gap-2 text-[11.5px] italic text-ink-400">
                <IconDoc size={14} /> Full structure isn't cached in this browser's demo storage.
              </p>
            )}
          </div>
        )}
      </div>

      {/* evidence ledger */}
      <div className="rounded-xl border border-ink-800 bg-ink-950 p-5 text-paper">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-pulse-300">Evidence ledger</p>
        <div className="mt-3.5 grid grid-cols-3 gap-2">
          {[
            [evidenceStats.refs, "excerpts"],
            [evidenceStats.chunks, "chunks cited"],
            [evidenceStats.uncertain, "uncertain"],
          ].map(([v, k]) => (
            <div key={k as string} className="rounded-lg bg-paper/[0.05] px-2 py-2.5 text-center">
              <p className="tnum font-display text-[17px] font-bold text-paper">{v}</p>
              <p className="mt-0.5 font-mono text-[7.5px] uppercase tracking-[0.12em] text-paper/45">{k}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 font-mono text-[8.5px] leading-relaxed tracking-wide text-paper/40">
          every node and edge above is traceable to at least one stored excerpt — unsupported items
          were dropped during validation ({graph.stats.dropped_relations} weak relations pruned).
        </p>
      </div>
    </div>
  );
}
