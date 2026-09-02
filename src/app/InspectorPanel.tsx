/**
 * Phase 8 — selection inspector.
 * Light "lab paper" panel that renders whatever is selected in the graph:
 * a node (concept · claim · method …) or a typed relationship.
 * Every fact shown comes from stored analysis/graph data — the evidence
 * list only ever renders real excerpts with page, section and chunk.
 */

import { useState } from "react";
import {
  NODE_META,
  RELATION_META,
  nodeSignificance,
  type GraphEdge,
  type GraphNode,
} from "./graphModel";
import type { EvidenceReference } from "./analysisSchemas";
import { IconAlert, IconCheck, IconChevron, IconDoc, IconX } from "../icons";

/* ================= evidence ================= */

export function EvidenceList({
  evidence,
  tone = "light",
  search,
}: {
  evidence: EvidenceReference[];
  tone?: "light" | "dark";
  search?: string;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set([0]));
  if (evidence.length === 0) {
    return (
      <p className={`rounded-lg border border-dashed px-3.5 py-3 text-[11.5px] italic ${tone === "light" ? "border-ink-900/15 text-ink-400" : "border-paper/15 text-paper/40"}`}>
        No direct evidence was recorded for this item.
      </p>
    );
  }

  const highlight = (text: string) => {
    if (!search || search.trim().length < 2) return text;
    const q = search.trim().toLowerCase();
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded-sm bg-signal-300/60 px-0.5 text-ink-900">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <ul className="space-y-2">
      {evidence.map((e, i) => {
        const expanded = open.has(i);
        return (
          <li
            key={`${e.chunk_id}-${i}`}
            className={`group/ev overflow-hidden rounded-lg border transition-all duration-300 ${
              tone === "light"
                ? "border-ink-900/12 bg-paper-card hover:border-pulse-500/50"
                : "border-paper/12 bg-ink-900/70 hover:border-pulse-400/50"
            }`}
          >
            <button
              type="button"
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
              aria-expanded={expanded}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-pulse-100 font-mono text-[9px] font-semibold text-pulse-700">
                {e.page ? `p${e.page}` : "fm"}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-mono text-[9px] uppercase tracking-[0.14em] ${tone === "light" ? "text-ink-400" : "text-paper/45"}`}>
                  {e.chunk_id}{e.section ? ` · ${e.section}` : " · front matter"}
                </span>
                <span className={`block truncate text-[12px] ${tone === "light" ? "text-ink-700" : "text-paper/75"}`}>
                  “{e.excerpt.slice(0, 72)}{e.excerpt.length > 72 ? "…" : ""}”
                </span>
              </span>
              <IconChevron size={13} className={`shrink-0 text-ink-300 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
            </button>
            <div className={`grid transition-all duration-300 ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <div className={`border-t px-3.5 py-3 ${tone === "light" ? "border-ink-900/[0.08]" : "border-paper/10"}`}>
                  <p className={`text-[12.5px] leading-relaxed ${tone === "light" ? "text-ink-800" : "text-paper/80"}`}>
                    “{highlight(e.excerpt)}”
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] ${tone === "light" ? "border-ink-900/15 text-ink-500" : "border-paper/20 text-paper/55"}`}>
                      page {e.page ?? "—"}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] ${tone === "light" ? "border-ink-900/15 text-ink-500" : "border-paper/20 text-paper/55"}`}>
                      {e.section || "front matter"}
                    </span>
                    <span className="rounded-full border border-pulse-500/40 bg-pulse-100/60 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-pulse-700">
                      src {e.chunk_id}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ================= confidence ================= */

export function ConfidenceBar({ value, tone = "light" }: { value: number; tone?: "light" | "dark" }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-2" title={`Confidence ${pct}%`}>
      <span className={`h-1 w-16 overflow-hidden rounded-full ${tone === "light" ? "bg-ink-900/10" : "bg-paper/12"}`}>
        <span
          className={`block h-full rounded-full transition-all duration-500 ${value < 0.5 ? "bg-signal-400" : "bg-pulse-500"}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className={`tnum font-mono text-[10px] ${tone === "light" ? "text-ink-500" : "text-paper/60"}`}>{pct}%</span>
    </span>
  );
}

/* ================= node details ================= */

function NodeDetails({
  node,
  edges,
  nodes,
  onPickNode,
  onPickEdge,
  onClose,
}: {
  node: GraphNode;
  edges: GraphEdge[];
  nodes: GraphNode[];
  onPickNode: (id: string) => void;
  onPickEdge: (id: string) => void;
  onClose?: () => void;
}) {
  const meta = NODE_META[node.type];
  const connections = edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => {
      const outward = e.source === node.id;
      const otherId = outward ? e.target : e.source;
      return { edge: e, outward, other: nodes.find((n) => n.id === otherId) ?? null };
    })
    .filter((c) => c.other);

  return (
    <div className="drop-in">
      <div className="flex items-start justify-between gap-3">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em]"
          style={{ borderColor: meta.color, color: node.type === "claim" ? "var(--color-ink-700)" : meta.color }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
          {meta.label}
        </span>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close inspector" className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-900/[0.06] hover:text-ink-900">
            <IconX size={15} />
          </button>
        )}
      </div>

      <h3 className="mt-3 font-display text-[1.35rem] font-semibold leading-snug tracking-tight text-ink-900">{node.label}</h3>

      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        <ConfidenceBar value={node.confidence} />
        {node.uncertain && (
          <span className="inline-flex items-center gap-1 rounded-full border border-signal-500/40 bg-signal-300/15 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-signal-600">
            <IconAlert size={10} /> uncertain
          </span>
        )}
        {typeof node.metadata.kind === "string" && node.metadata.kind && (
          <span className="rounded-full border border-ink-900/12 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-500">
            {String(node.metadata.kind)}
          </span>
        )}
      </div>

      <p className="mt-3.5 text-[13px] leading-relaxed text-ink-600">{node.detailed_explanation || node.short_description}</p>

      <div className="mt-4 rounded-lg border border-pulse-500/25 bg-pulse-100/45 p-3.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-pulse-700">Why it matters</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-700">
          {nodeSignificance(node, connections.length, edges.length)}
        </p>
      </div>

      <p className="mt-5 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">
        Supporting evidence · {node.evidence_references.length}
      </p>
      <div className="mt-2.5">
        <EvidenceList evidence={node.evidence_references} />
      </div>

      <p className="mt-5 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">
        Connected · {connections.length}
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {connections.slice(0, 9).map(({ edge, outward, other }) => (
          <li key={edge.id} className="flex items-stretch gap-1.5">
            <button
              type="button"
              onClick={() => onPickEdge(edge.id)}
              title="Inspect this relationship"
              className="flex shrink-0 items-center rounded-md border border-ink-900/10 px-2 py-1.5 font-mono text-[9px] uppercase tracking-wide transition-all hover:border-ink-900/30 hover:bg-paper-deep"
              style={{ color: RELATION_META[edge.kind].color.includes("242,244,239") ? "var(--color-ink-400)" : RELATION_META[edge.kind].color }}
            >
              {outward ? RELATION_META[edge.kind].label : `← ${RELATION_META[edge.kind].label}`}
            </button>
            <button
              type="button"
              onClick={() => onPickNode(other!.id)}
              className="min-w-0 flex-1 truncate rounded-md border border-transparent px-2 py-1.5 text-left font-display text-[12px] font-medium text-ink-800 transition-all hover:border-pulse-500/40 hover:bg-pulse-100/40"
            >
              {other!.label}
            </button>
          </li>
        ))}
        {connections.length > 9 && (
          <li className="px-1 font-mono text-[9.5px] text-ink-400">+{connections.length - 9} more visible in the graph</li>
        )}
        {connections.length === 0 && (
          <li className="rounded-md border border-dashed border-ink-900/15 px-3 py-2.5 text-[11.5px] italic text-ink-400">
            No typed relationships survived graph pruning for this node.
          </li>
        )}
      </ul>
    </div>
  );
}

/* ================= edge details ================= */

function EdgeDetails({
  edge,
  nodes,
  onPickNode,
  onClose,
}: {
  edge: GraphEdge;
  nodes: GraphNode[];
  onPickNode: (id: string) => void;
  onClose?: () => void;
}) {
  const meta = RELATION_META[edge.kind];
  const source = nodes.find((n) => n.id === edge.source);
  const target = nodes.find((n) => n.id === edge.target);

  return (
    <div className="drop-in">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-ink-900/15 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-600">
          Relationship
        </span>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close inspector" className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-900/[0.06] hover:text-ink-900">
            <IconX size={15} />
          </button>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-ink-900/10 bg-paper-deep/70 p-3.5">
        <div className="flex flex-col items-start gap-2">
          <button type="button" onClick={() => source && onPickNode(source.id)} className="max-w-full truncate rounded-md px-1.5 py-0.5 font-display text-[13.5px] font-semibold text-ink-900 transition-colors hover:bg-pulse-100/60 hover:text-pulse-700">
            {source?.label ?? edge.source}
          </button>
          <span className="flex items-center gap-2 pl-1 font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: meta.color.includes("242,244,239") ? "var(--color-ink-400)" : meta.color }}>
            <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden>
              <line x1="0" y1="4" x2="20" y2="4" stroke="currentColor" strokeWidth="1.4" strokeDasharray={meta.dash ?? undefined} />
              <path d="M20 1 L26 4 L20 7 Z" fill="currentColor" />
            </svg>
            {meta.label}
          </span>
          <button type="button" onClick={() => target && onPickNode(target.id)} className="max-w-full truncate rounded-md px-1.5 py-0.5 font-display text-[13.5px] font-semibold text-ink-900 transition-colors hover:bg-pulse-100/60 hover:text-pulse-700">
            {target?.label ?? edge.target}
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        <ConfidenceBar value={edge.confidence} />
        {edge.uncertain && (
          <span className="inline-flex items-center gap-1 rounded-full border border-signal-500/40 bg-signal-300/15 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-signal-600">
            <IconAlert size={10} /> inferred
          </span>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-pulse-500/25 bg-pulse-100/45 p-3.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-pulse-700">Why this relationship exists</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-700">{meta.meaning}</p>
      </div>

      <p className="mt-5 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">
        Evidence for the link · {edge.evidence.length}
      </p>
      <div className="mt-2.5">
        <EvidenceList evidence={edge.evidence} />
      </div>
    </div>
  );
}

/* ================= shell ================= */

export default function InspectorPanel({
  node,
  edge,
  nodes,
  edges,
  onPickNode,
  onPickEdge,
  onClose,
}: {
  node: GraphNode | null;
  edge: GraphEdge | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onPickNode: (id: string) => void;
  onPickEdge: (id: string) => void;
  onClose?: () => void;
}) {
  if (!node && !edge) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-ink-900/20 text-ink-300">
          <IconDoc size={20} />
        </span>
        <p className="mt-4 font-display text-[15px] font-semibold text-ink-800">Nothing selected</p>
        <p className="mt-1.5 max-w-[26ch] text-[12px] leading-relaxed text-ink-400">
          Click a node or a relationship in the graph to see its explanation, significance and
          supporting evidence.
        </p>
        <div className="mt-5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-300">
          <IconCheck size={10} className="text-pulse-600" /> evidence-first · nothing unsourced
        </div>
      </div>
    );
  }

  if (node) {
    return <NodeDetails node={node} edges={edges} nodes={nodes} onPickNode={onPickNode} onPickEdge={onPickEdge} onClose={onClose} />;
  }
  return <EdgeDetails edge={edge!} nodes={nodes} onPickNode={onPickNode} onClose={onClose} />;
}
