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
    </div>
  );
}
