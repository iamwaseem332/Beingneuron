/**
 * Phase 8 — analysis tabs.
 * Every row is rendered from stored PaperAnalysis data (never invented) and,
 * when the item made it into the graph, clicking it selects and focuses the
 * corresponding node.
 */

import { useState } from "react";
import type { PaperAnalysis } from "./analysisSchemas";
import { nodeIdBySource, type KnowledgeGraphData } from "./graphModel";
import { ConfidenceBar } from "./InspectorPanel";
import { IconArrowUpRight } from "../icons";

type TabKey = "overview" | "concepts" | "methodology" | "claims" | "results" | "limitations";

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      role="tab"
      className={`relative shrink-0 rounded-t-lg px-4 py-2.5 font-display text-[13px] font-semibold tracking-tight transition-colors duration-200 ${
        active ? "text-ink-900" : "text-ink-400 hover:text-ink-700"
      }`}
    >
      {label}
      {count !== null && (
        <span className={`tnum ml-2 rounded-full px-1.5 py-0.5 font-mono text-[9px] ${active ? "bg-pulse-400 text-ink-950" : "bg-ink-900/[0.07] text-ink-500"}`}>
          {count}
        </span>
      )}
      <span
        aria-hidden
        className={`absolute inset-x-2 -bottom-px h-[2.5px] rounded-full bg-pulse-500 transition-all duration-300 ${active ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0"}`}
      />
    </button>
  );
}

/* clickable item row → focuses the graph node when one exists */
function ItemRow({
  graph,
  sourceId,
  title,
  subtitle,
  body,
  confidence,
  uncertain,
  right,
  onSelect,
}: {
  graph: KnowledgeGraphData;
  sourceId: string | null;
  title: string;
  subtitle?: string;
  body?: string;
  confidence: number;
  uncertain?: boolean;
  right?: React.ReactNode;
  onSelect: (nodeId: string) => void;
}) {
  const nodeId = sourceId ? nodeIdBySource(graph, sourceId) : null;
  return (
    <li
      className={`group card-lift rounded-lg border border-ink-900/10 bg-paper-card p-4 ${nodeId ? "cursor-pointer" : ""}`}
      onClick={() => nodeId && onSelect(nodeId)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[13.5px] font-semibold leading-snug tracking-tight text-ink-900">{title}</p>
          {subtitle && <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-400">{subtitle}</p>}
        </div>
        {right ?? <ConfidenceBar value={confidence} />}
      </div>
      {body && <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-500">{body}</p>}
      <div className="mt-2.5 flex items-center justify-between">
        <span className={`flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] ${uncertain ? "text-signal-600" : "text-ink-300"}`}>
          {uncertain ? "uncertain" : "evidence-backed"}
        </span>
        {nodeId && (
          <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-pulse-700 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            locate in graph <IconArrowUpRight size={11} />
          </span>
        )}
      </div>
    </li>
  );
}

function EmptyTab({ note }: { note: string }) {
  return (
    <p className="rounded-lg border border-dashed border-ink-900/15 px-4 py-6 text-center text-[12px] italic text-ink-400">
      {note}
    </p>
  );
}

export default function AnalysisTabs({
  analysis,
  graph,
  onSelectNode,
}: {
  analysis: PaperAnalysis;
  graph: KnowledgeGraphData;
  onSelectNode: (nodeId: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("overview");

  const methods = analysis.methods.filter((m) => m.type === "method");
  const models = analysis.methods.filter((m) => m.type === "model");

  const tabs: { key: TabKey; label: string; count: number | null }[] = [
    { key: "overview", label: "Overview", count: null },
    { key: "concepts", label: "Concepts", count: analysis.concepts.length },
    { key: "methodology", label: "Methodology", count: analysis.methods.length + analysis.datasets.length + analysis.experiments.length },
    { key: "claims", label: "Claims", count: analysis.claims.length },
    { key: "results", label: "Results", count: analysis.results.length },
    { key: "limitations", label: "Limitations", count: analysis.limitations.length },
  ];

  return (
    <section aria-label="Structured analysis" className="rounded-xl border border-ink-900/12 bg-paper-deep/70">
      <div role="tablist" aria-label="Analysis sections" className="app-scroll flex gap-1 overflow-x-auto border-b border-ink-900/10 px-3 pt-2">
        {tabs.map((t) => (
          <TabButton key={t.key} active={tab === t.key} label={t.label} count={t.count} onClick={() => setTab(t.key)} />
        ))}
      </div>

      <div className="p-5" role="tabpanel">
        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              { k: "Research question", v: analysis.research_question, id: "n-rq" },
              { k: "Main problem", v: analysis.main_problem, id: "n-problem" },
              { k: "Conclusion", v: analysis.conclusion, id: "n-conclusion" },
            ].map(({ k, v, id }) => {
              const nodeId = nodeIdBySource(graph, id);
              return (
                <div
                  key={k}
                  className={`card-lift rounded-lg border border-ink-900/10 bg-paper-card p-5 ${nodeId ? "cursor-pointer" : ""}`}
                  onClick={() => nodeId && onSelectNode(nodeId)}
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-pulse-700">{k}</p>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-ink-800">
                    {v ?? <span className="italic text-ink-300">Not stated in the extracted text.</span>}
                  </p>
                  {nodeId && v && (
                    <p className="mt-3 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-pulse-700 opacity-60 transition-opacity group-hover:opacity-100">
                      node in graph <IconArrowUpRight size={10} />
                    </p>
                  )}
                </div>
              );
            })}
            <div className="rounded-lg border border-dashed border-ink-900/15 p-5 lg:col-span-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-400">Validation summary</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">
                The analyzer kept <strong className="text-ink-900">{analysis.concepts.length + analysis.claims.length + analysis.methods.length + analysis.results.length + analysis.datasets.length + analysis.experiments.length + analysis.limitations.length}</strong> structured
                items and dropped <strong className="text-signal-600">{analysis.dropped_unsupported}</strong> candidate
                {analysis.dropped_unsupported === 1 ? "" : "s"} that could not point at a source excerpt. The graph
                pruned a further <strong className="text-ink-900">{graph.stats.dropped_relations}</strong> weak relation
                {graph.stats.dropped_relations === 1 ? "" : "s"} for readability.
              </p>
            </div>
          </div>
        )}

        {tab === "concepts" &&
          (analysis.concepts.length === 0 ? (
            <EmptyTab note="No core concepts passed evidence validation for this paper." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {analysis.concepts.map((c) => (
                <ItemRow
                  key={c.id}
                  graph={graph}
                  sourceId={c.id}
                  title={c.name}
                  subtitle={`${c.kind} · ${c.occurrences} occurrence${c.occurrences === 1 ? "" : "s"}`}
                  body={c.explanation}
                  confidence={c.confidence}
                  uncertain={c.uncertain}
                  onSelect={onSelectNode}
                />
              ))}
            </ul>
          ))}

        {tab === "methodology" &&
          (methods.length + models.length + analysis.datasets.length + analysis.experiments.length === 0 ? (
            <EmptyTab note="No methods, models, datasets or experiments were extracted with supporting evidence." />
          ) : (
            <div className="space-y-5">
              {models.length > 0 && (
                <div>
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">Models & systems</p>
                  <ul className="mt-2.5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {models.map((m) => (
                      <ItemRow key={m.id} graph={graph} sourceId={m.id} title={m.name} subtitle="model / system" body={m.description} confidence={m.confidence} uncertain={m.uncertain} onSelect={onSelectNode} />
                    ))}
                  </ul>
                </div>
              )}
              {methods.length > 0 && (
                <div>
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">Methods</p>
                  <ul className="mt-2.5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {methods.map((m) => (
                      <ItemRow key={m.id} graph={graph} sourceId={m.id} title={m.name} subtitle="method" body={m.description} confidence={m.confidence} uncertain={m.uncertain} onSelect={onSelectNode} />
                    ))}
                  </ul>
                </div>
              )}
              {analysis.datasets.length > 0 && (
                <div>
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">Datasets</p>
                  <ul className="mt-2.5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {analysis.datasets.map((d) => (
                      <ItemRow key={d.id} graph={graph} sourceId={d.id} title={d.name} subtitle="dataset" body={d.description} confidence={d.confidence} uncertain={d.uncertain} onSelect={onSelectNode} />
                    ))}
                  </ul>
                </div>
              )}
              {analysis.experiments.length > 0 && (
                <div>
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">Experiments</p>
                  <ul className="mt-2.5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {analysis.experiments.map((e) => (
                      <ItemRow key={e.id} graph={graph} sourceId={e.id} title={e.name} subtitle="experiment" body={e.description} confidence={e.confidence} uncertain={e.uncertain} onSelect={onSelectNode} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

        {tab === "claims" &&
          (analysis.claims.length === 0 ? (
            <EmptyTab note="No claims with supporting evidence were extracted." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {analysis.claims.map((c) => (
                <ItemRow key={c.id} graph={graph} sourceId={c.id} title={c.text} subtitle={`${c.kind} claim`} confidence={c.confidence} uncertain={c.uncertain} onSelect={onSelectNode} />
              ))}
            </ul>
          ))}

        {tab === "results" &&
          (analysis.results.length === 0 ? (
            <EmptyTab note="No quantitative or qualitative results passed evidence validation." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {analysis.results.map((r) => (
                <ItemRow
                  key={r.id}
                  graph={graph}
                  sourceId={r.id}
                  title={r.statement}
                  subtitle={r.metric ? `measured · ${r.metric}` : "finding"}
                  confidence={r.confidence}
                  uncertain={r.uncertain}
                  right={
                    r.metric ? (
                      <span className="tnum shrink-0 rounded-md border border-pulse-500/40 bg-pulse-100/60 px-2 py-1 font-mono text-[10px] font-semibold text-pulse-700">
                        {r.metric}
                      </span>
                    ) : (
                      <ConfidenceBar value={r.confidence} />
                    )
                  }
                  onSelect={onSelectNode}
                />
              ))}
            </ul>
          ))}

        {tab === "limitations" &&
          (analysis.limitations.length === 0 ? (
            <EmptyTab note="The extraction didn't surface explicitly stated limitations." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {analysis.limitations.map((l) => (
                <ItemRow key={l.id} graph={graph} sourceId={l.id} title={l.text} subtitle="limitation" confidence={l.confidence} uncertain={l.uncertain} onSelect={onSelectNode} />
              ))}
            </ul>
          ))}
      </div>
    </section>
  );
}
