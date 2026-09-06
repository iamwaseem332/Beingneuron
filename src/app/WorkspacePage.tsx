/**
 * Phase 8 — the interactive research workspace for one analyzed paper.
 *
 *   /app/synapse/:jobId
 *
 * Header (title · authors · processing metadata)
 *   ├─ left   · paper overview / structure / graph index / evidence ledger
 *   ├─ center · interactive knowledge graph (ForceGraph)
 *   ├─ right  · selected node / relationship inspector (bottom sheet on mobile)
 *   └─ bottom · analysis tabs (Overview · Concepts · Methodology · Claims · Results · Limitations)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSynapse, type DocumentSummary } from "./SynapseProvider";
import ForceGraph from "./ForceGraph";
import OverviewPanel from "./OverviewPanel";
import InspectorPanel from "./InspectorPanel";
import AnalysisTabs from "./AnalysisTabs";
import {
  NODE_META,
  RELATION_META,
  buildKnowledgeGraph,
  nodesForLevel,
  type GraphEdge,
  type GraphLevel,
  type GraphNode,
  type GraphNodeType,
  type KnowledgeGraphData,
  type RelationKind,
} from "./graphModel";
import type { PaperAnalysis } from "./analysisSchemas";
import type { NormalizedDoc } from "./pipeline";
import { isAnalyzing, isProcessable, timeAgo, type PaperJob } from "./synapseCore";
import { RowSkeleton } from "./states";
import { usePrefersReducedMotion } from "../hooks";
import { IconAlert, IconChevron, IconDoc, IconGraph, IconSearch, IconX } from "../icons";

const LEVELS: { key: GraphLevel; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "detailed", label: "Detailed" },
  { key: "full", label: "Full" },
];

/* ================= header ================= */

function MetaChip({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full border border-paper/15 px-3 py-1.5">
      <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-paper/40">{k}</span>
      <span className="tnum font-mono text-[10.5px] text-paper/85">{v}</span>
    </span>
  );
}

/* ================= workspace ================= */

export default function WorkspacePage() {
  const { jobId } = useParams<{ jobId: string }>();
  const reduced = usePrefersReducedMotion();
  const {
    jobs,
    loadingJobs,
    summaries,
    getGraph,
    saveGraph,
    getAnalysis,
    getDetail,
    runAnalysis,
    processJob,
    mode,
  } = useSynapse();

  const [state, setState] = useState<{
    status: "loading" | "missing" | "unanalyzed" | "analyzing" | "ready" | "error";
    graph: KnowledgeGraphData | null;
    analysis: PaperAnalysis | null;
    doc: NormalizedDoc | null;
    error?: string;
  }>({ status: "loading", graph: null, analysis: null, doc: null });

  const [rerunning, setRerunning] = useState(false);

  const job: PaperJob | undefined = jobs.find((j) => j.id === jobId);
  const summary: DocumentSummary | undefined = jobId ? summaries[jobId] : undefined;

  /* ---------- load graph + analysis (+ optional extraction detail) ---------- */
  useEffect(() => {
    let active = true;
    if (!jobId) return;
    if (loadingJobs) return;
    if (!job) {
      setState({ status: "missing", graph: null, analysis: null, doc: null });
      return;
    }
    if (isAnalyzing(job.status)) {
      setState({ status: "analyzing", graph: null, analysis: null, doc: null });
      return;
    }
    if (job.status !== "analyzed" && job.status !== "completed") {
      setState({ status: "unanalyzed", graph: null, analysis: null, doc: null });
      return;
    }

    setState((s) => ({ ...s, status: "loading" }));
    (async () => {
      try {
        const analysis = await getAnalysis(jobId);
        if (!analysis) {
          if (active) setState({ status: "unanalyzed", graph: null, analysis: null, doc: null });
          return;
        }
        let graph = await getGraph(jobId);
        if (!graph) {
          graph = buildKnowledgeGraph(analysis, jobId, summary?.title ?? job.original_filename ?? "Untitled paper");
          await saveGraph(jobId, graph).catch(() => undefined);
        }
        const detail = await getDetail(jobId).catch(() => null);
        if (active) {
          setState({ status: "ready", graph, analysis, doc: detail?.doc ?? null });
        }
      } catch {
        if (active) setState({ status: "error", graph: null, analysis: null, doc: null, error: "The workspace data couldn't be loaded. Go back and try again." });
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, job?.id, job?.status, loadingJobs]);

  /* ---------- interaction state ---------- */
  const [level, setLevel] = useState<GraphLevel>("overview");
  const [hiddenTypes, setHiddenTypes] = useState<Set<GraphNodeType>>(new Set());
  const [hiddenKinds, setHiddenKinds] = useState<Set<RelationKind>>(new Set());
  const [minImportance, setMinImportance] = useState(0);
  const [strictEvidence, setStrictEvidence] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [zoomRequest, setZoomRequest] = useState<{ factor: number; nonce: number } | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const focusNonce = useRef(0);

  const graph = state.graph;
  const analysis = state.analysis;

  /* ---------- derived visible graph ---------- */
  const { visibleNodes, visibleEdges, highlightIds, presentKinds, typeCounts } = useMemo(() => {
    if (!graph) {
      return {
        visibleNodes: [] as GraphNode[],
        visibleEdges: [] as GraphEdge[],
        highlightIds: null as Set<string> | null,
        presentKinds: [] as RelationKind[],
        typeCounts: new Map<GraphNodeType, number>(),
      };
    }
    const levelIds = nodesForLevel(graph, level);
    const q = query.trim().toLowerCase();
    const matchIds = new Set<string>();

    const keptNodes = graph.nodes.filter((n) => {
      if (!levelIds.has(n.id)) return false;
      if (hiddenTypes.has(n.type)) return false;
      if (n.importance < minImportance) return false;
      if (strictEvidence && n.uncertain) return false;
      if (q && (n.label.toLowerCase().includes(q) || n.detailed_explanation.toLowerCase().includes(q))) {
        matchIds.add(n.id);
      }
      return true;
    });
    const keptIds = new Set(keptNodes.map((n) => n.id));
    const keptEdges = graph.edges.filter((e) => {
      if (!keptIds.has(e.source) || !keptIds.has(e.target)) return false;
      if (hiddenKinds.has(e.kind)) return false;
      if (strictEvidence && e.uncertain) return false;
      return true;
    });
    const kinds = [...new Set(graph.edges.map((e) => e.kind))];
    const counts = new Map<GraphNodeType, number>();
    for (const n of graph.nodes) if (levelIds.has(n.id)) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);

    return {
      visibleNodes: keptNodes,
      visibleEdges: keptEdges,
      highlightIds: q ? matchIds : null,
      presentKinds: kinds,
      typeCounts: counts,
    };
  }, [graph, level, hiddenTypes, hiddenKinds, minImportance, strictEvidence, query]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? visibleNodes.find((n) => n.id === selectedNodeId) ?? graph?.nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [selectedNodeId, visibleNodes, graph],
  );
  const selectedEdge = useMemo(
    () => (selectedEdgeId ? visibleEdges.find((e) => e.id === selectedEdgeId) ?? graph?.edges.find((e) => e.id === selectedEdgeId) ?? null : null),
    [selectedEdgeId, visibleEdges, graph],
  );

  /* ---------- handlers ---------- */
  const focusNode = useCallback(
    (id: string) => {
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      focusNonce.current += 1;
      setFocusRequest({ id, nonce: focusNonce.current });
      setSheetOpen(true);
    },
    [],
  );

  const onSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    if (id === null) setSelectedEdgeId(null);
    setSheetOpen(Boolean(id));
  }, []);

  const onSelectEdge = useCallback((id: string | null) => {
    setSelectedEdgeId(id);
    if (id === null) setSelectedNodeId(null);
    setSheetOpen(Boolean(id));
  }, []);

  const toggleType = useCallback((t: GraphNodeType) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const toggleKind = useCallback((k: RelationKind) => {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const clearFilters = () => {
    setHiddenTypes(new Set());
    setHiddenKinds(new Set());
    setMinImportance(0);
    setStrictEvidence(false);
    setQuery("");
  };

  const filtersActive = hiddenTypes.size > 0 || hiddenKinds.size > 0 || minImportance > 0 || strictEvidence || query.trim().length > 0;

  /* Escape clears the selection */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setSheetOpen(false);
        setLeftOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* lock body scroll while a sheet is open on mobile */
  useEffect(() => {
    document.body.style.overflow = sheetOpen || leftOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sheetOpen, leftOpen]);

  /* Self-heal: run whatever stage the job is actually stuck at. A job reset to
     "queued" (interrupted extraction) needs the extraction pipeline; a job at
     "ready_for_analysis" needs the analysis run. */
  const rerun = async () => {
    if (!job || rerunning) return;
    setRerunning(true);
    try {
      if (isProcessable(job.status)) await processJob(job);
      else await runAnalysis(job);
    } finally {
      setRerunning(false);
    }
  };

  /* ================= non-ready states ================= */

  if (state.status === "loading" || loadingJobs) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-ink-800 bg-ink-950 p-7">
          <div className="skeleton-bar h-4 w-40" style={{ opacity: 0.25 }} />
          <div className="skeleton-bar mt-4 h-8 w-3/4" style={{ opacity: 0.25 }} />
          <div className="mt-4 flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton-bar h-6 w-24" style={{ opacity: 0.2 }} />
            ))}
          </div>
        </div>
        <RowSkeleton rows={4} />
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-ink-900/12 bg-paper-card p-10 text-center">
        <IconAlert size={26} className="mx-auto text-signal-500" />
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink-900">Workspace not found</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
          No paper job matches this address — it may have been deleted, or the link is from another
          account.
        </p>
        <Link to="/app/synapse" className="mt-6 inline-block rounded-full bg-ink-900 px-6 py-3 font-display text-[14px] font-semibold text-paper transition-colors hover:bg-ink-700">
          Back to Synapse
        </Link>
      </div>
    );
  }

  if (state.status === "unanalyzed" || state.status === "analyzing") {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-ink-900/12 bg-paper-card p-10 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-pulse-500/30 bg-pulse-100/60 text-pulse-700">
          <IconDoc size={22} />
        </span>
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink-900">
          {state.status === "analyzing" ? "Analysis in progress…" : "Not analyzed yet"}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
          {state.status === "analyzing"
            ? "The analysis pipeline is working through this paper. Give it a moment, then reload."
            : "This paper has been extracted and chunked, but the structured analysis hasn't run. The workspace unlocks the moment it has."}
        </p>
        {state.status === "unanalyzed" && job && (
          <button
            type="button"
            onClick={rerun}
            disabled={rerunning}
            className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-pulse-400 px-6 py-3 font-display text-[14px] font-semibold text-ink-950 transition-all hover:bg-pulse-300 active:scale-[0.98] disabled:opacity-50"
          >
            {rerunning && <span className="spinner spinner-sm" />}
            {rerunning
              ? "Working…"
              : isProcessable(job.status)
                ? "Resume pipeline"
                : "Run analysis now"}
          </button>
        )}
        <div className="mt-5">
          <Link to="/app/synapse" className="link-line font-mono text-[11px] tracking-wide text-pulse-700">
            ← back to the pipeline
          </Link>
        </div>
      </div>
    );
  }

  if (state.status === "error" || !graph || !analysis) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-signal-500/35 bg-signal-300/10 p-10 text-center">
        <IconAlert size={26} className="mx-auto text-signal-500" />
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink-900">Workspace failed to load</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">{state.error ?? "Something went wrong while assembling the workspace."}</p>
        <Link to="/app/synapse" className="mt-6 inline-block rounded-full bg-ink-900 px-6 py-3 font-display text-[14px] font-semibold text-paper transition-colors hover:bg-ink-700">
          Back to Synapse
        </Link>
      </div>
    );
  }

  /* ================= ready ================= */

  const levelMeta = graph.stats.levels[level];
  const title = summary?.title || graph.paper_title;

  return (
    <div className="space-y-6">
      {/* ---------- header band ---------- */}
      <header className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-950 text-paper">
        <div className="bg-grid-dark pointer-events-none absolute inset-0 opacity-70" />
        <div className="pointer-events-none absolute -right-24 -top-32 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.16),transparent_65%)]" />
        <div className="relative p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-3xl">
              <Link to="/app/synapse" className="group inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-paper/45 transition-colors hover:text-pulse-300">
                <IconChevron size={12} className="rotate-90 transition-transform group-hover:-translate-x-0.5" />
                synapse intake
              </Link>
              <h1 className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight sm:text-[2rem]">
                {title}
              </h1>
              {summary && summary.authors.length > 0 && (
                <p className="mt-2 text-[12.5px] text-paper/60">
                  {summary.authors.slice(0, 8).join(", ")}
                  {summary.authors.length > 8 ? ` +${summary.authors.length - 8} more` : ""}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="flex items-center gap-2 rounded-full border border-pulse-400/40 bg-pulse-400/10 px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-pulse-300">
                <span className="ping-dot inline-block h-1.5 w-1.5 rounded-full bg-pulse-400" />
                analyzed
              </span>
              <button
                type="button"
                onClick={() => setLeftOpen(true)}
                className="rounded-full border border-paper/20 px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-paper/60 transition-colors hover:border-paper/50 hover:text-paper xl:hidden"
                aria-label="Open paper overview"
              >
                overview
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ---------- workspace body ---------- */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        {/* center column - full width graph area */}
        <div className="min-w-0 space-y-4">
          {/* graph canvas */}
          <div className="relative h-[520px] overflow-hidden rounded-xl border border-ink-800 bg-ink-950 sm:h-[600px] lg:h-[680px]">
            {visibleNodes.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                <IconGraph size={26} className="text-paper/25" />
                <p className="font-display text-[15px] font-semibold text-paper/70">Nothing matches these filters</p>
                <p className="max-w-[34ch] font-mono text-[10px] leading-relaxed text-paper/40">
                  loosen the importance threshold or re-enable some node and relation types.
                </p>
                <button type="button" onClick={clearFilters} className="mt-1 rounded-full border border-pulse-400/50 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-pulse-300 transition-all hover:bg-pulse-400 hover:text-ink-950">
                  clear filters
                </button>
              </div>
            ) : (
              <ForceGraph
                nodes={visibleNodes}
                edges={visibleEdges}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                highlightIds={highlightIds}
                focusRequest={focusRequest}
                resetNonce={resetNonce}
                zoomRequest={zoomRequest}
                onSelectNode={onSelectNode}
                onSelectEdge={onSelectEdge}
              />
            )}
            {/* canvas caption */}
            <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-paper/12 bg-ink-950/80 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-paper/50 backdrop-blur-sm">
              {level} · {levelMeta.nodes} nodes · {visibleEdges.length} edges shown
            </div>
            {highlightIds && highlightIds.size > 0 && (
              <button
                type="button"
                onClick={() => focusNode([...highlightIds][0])}
                className="absolute right-3 top-3 rounded-md border border-signal-400/50 bg-ink-950/85 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-signal-300 backdrop-blur-sm transition-all hover:bg-signal-400 hover:text-ink-950"
              >
                focus first match
              </button>
            )}
          </div>

          {/* control deck - moved to right side below graph */}
          <div className="rounded-xl border border-ink-900/12 bg-paper-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* search */}
              <label className="relative min-w-[210px] flex-1">
                <IconSearch size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search concepts, claims, methods…"
                  aria-label="Search the graph"
                  className="w-full rounded-full border border-ink-900/15 bg-paper py-2.5 pl-10 pr-4 text-[13px] text-ink-900 placeholder:text-ink-300 outline-none transition-all focus:border-pulse-500 focus:ring-2 focus:ring-pulse-400/25"
                />
                {highlightIds && (
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-[9.5px] text-pulse-700">
                    {highlightIds.size} match{highlightIds.size === 1 ? "" : "es"}
                  </span>
                )}
              </label>

              {/* levels */}
              <div role="group" aria-label="Graph level" className="flex overflow-hidden rounded-full border border-ink-900/15">
                {LEVELS.map((l) => {
                  const active = level === l.key;
                  const count = graph.stats.levels[l.key].nodes;
                  return (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => setLevel(l.key)}
                      aria-pressed={active}
                      className={`px-3.5 py-2 font-display text-[12px] font-semibold transition-all duration-200 ${
                        active ? "bg-ink-900 text-paper" : "text-ink-500 hover:bg-ink-900/[0.05] hover:text-ink-900"
                      }`}
                    >
                      {l.label}
                      <span className={`tnum ml-1.5 font-mono text-[9px] ${active ? "text-pulse-300" : "text-ink-300"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* view tools */}
              <div className="flex items-center gap-1.5" role="group" aria-label="View controls">
                <button type="button" onClick={() => setZoomRequest({ factor: 1.3, nonce: Date.now() })} aria-label="Zoom in" title="Zoom in" className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-900/15 font-mono text-[15px] text-ink-600 transition-all hover:border-ink-900 hover:bg-ink-900 hover:text-paper active:scale-95">+</button>
                <button type="button" onClick={() => setZoomRequest({ factor: 0.75, nonce: Date.now() })} aria-label="Zoom out" title="Zoom out" className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-900/15 font-mono text-[15px] text-ink-600 transition-all hover:border-ink-900 hover:bg-ink-900 hover:text-paper active:scale-95">−</button>
                <button
                  type="button"
                  onClick={() => setResetNonce((n) => n + 1)}
                  className="rounded-full border border-ink-900/15 px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-600 transition-all hover:border-ink-900 hover:bg-ink-900 hover:text-paper active:scale-95"
                >
                  reset view
                </button>
                <button
                  type="button"
                  onClick={() => selectedNodeId && focusNode(selectedNodeId)}
                  disabled={!selectedNodeId}
                  className="rounded-full border border-pulse-500/40 bg-pulse-100/60 px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-pulse-700 transition-all hover:bg-pulse-400 hover:text-ink-950 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  focus selected
                </button>
              </div>
            </div>

            {/* filter row */}
            <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-dashed border-ink-900/10 pt-3.5">
              <span className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-ink-400">relations</span>
              {presentKinds.map((k) => {
                const hidden = hiddenKinds.has(k);
                const meta = RELATION_META[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleKind(k)}
                    aria-pressed={!hidden}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] transition-all duration-200 ${
                      hidden ? "border-ink-900/15 text-ink-300 opacity-60" : "border-ink-900/20 text-ink-700 hover:border-ink-900/50"
                    }`}
                  >
                    <svg width="16" height="4" viewBox="0 0 16 4" aria-hidden>
                      <line x1="0" y1="2" x2="16" y2="2" stroke={meta.color.includes("242,244,239") ? "var(--color-ink-400)" : meta.color} strokeWidth="1.6" strokeDasharray={meta.dash ?? undefined} />
                    </svg>
                    <span className={hidden ? "line-through" : ""}>{meta.label}</span>
                  </button>
                );
              })}

              <label className="ml-auto flex items-center gap-2.5">
                <span className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-ink-400">
                  importance ≥ <span className="tnum text-pulse-700">{Math.round(minImportance * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={90}
                  value={Math.round(minImportance * 100)}
                  onChange={(e) => setMinImportance(Number(e.target.value) / 100)}
                  className="h-1 w-28 cursor-pointer accent-[#12a392]"
                  aria-label="Minimum importance"
                />
              </label>

              <button
                type="button"
                onClick={() => setStrictEvidence((v) => !v)}
                aria-pressed={strictEvidence}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] transition-all ${
                  strictEvidence ? "border-pulse-500 bg-pulse-400 text-ink-950" : "border-ink-900/20 text-ink-600 hover:border-ink-900/50"
                }`}
              >
                evidence-backed only
              </button>

              {filtersActive && (
                <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-signal-600 transition-colors hover:text-signal-500">
                  <IconX size={10} /> clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* right inspector (desktop) */}
        <aside className="hidden xl:block" aria-label="Selection inspector">
          <div className="app-scroll sticky top-20 h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border border-ink-900/12 bg-paper-deep/70 p-5">
            <InspectorPanel
              node={selectedNode}
              edge={selectedEdge}
              nodes={visibleNodes}
              edges={visibleEdges}
              onPickNode={focusNode}
              onPickEdge={(id) => {
                setSelectedEdgeId(id);
                setSelectedNodeId(null);
              }}
            />
          </div>
        </aside>
      </div>

      {/* ---------- analysis tabs ---------- */}
      <AnalysisTabs analysis={analysis} graph={graph} onSelectNode={focusNode} />

      {/* ---------- mobile: left overview sheet ---------- */}
      {leftOpen && (
        <div className="fixed inset-0 z-[76] xl:hidden">
          <div className="fade-in absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={() => setLeftOpen(false)} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label="Paper overview" className={`${reduced ? "" : "drawer-in"} absolute inset-y-0 left-0 w-[320px] border-r border-ink-900/10 bg-paper p-5 shadow-2xl`}>
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">Paper overview</p>
              <button type="button" onClick={() => setLeftOpen(false)} aria-label="Close overview" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-900/[0.06] hover:text-ink-900">
                <IconX size={17} />
              </button>
            </div>
            <OverviewPanel graph={graph} summary={summary} doc={state.doc} hiddenTypes={hiddenTypes} onToggleType={toggleType} />
          </div>
        </div>
      )}

      {/* ---------- mobile: inspector bottom sheet ---------- */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[76] transition-transform duration-300 ease-[cubic-bezier(.22,.61,.36,1)] xl:hidden ${
          sheetOpen && (selectedNode || selectedEdge) ? "translate-y-0" : "translate-y-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Selection details"
        aria-hidden={!(sheetOpen && (selectedNode || selectedEdge))}
      >
        <div className="mx-auto max-h-[72vh] overflow-hidden rounded-t-2xl border-t border-x border-ink-900/12 bg-paper shadow-[0_-20px_60px_-20px_rgba(6,15,24,0.4)]">
          <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close details" className="flex w-full items-center justify-center pb-1 pt-3">
            <span className="h-1.5 w-12 rounded-full bg-ink-900/20" />
          </button>
          <div className="app-scroll max-h-[calc(72vh-2.5rem)] overflow-y-auto p-5">
            <InspectorPanel
              node={selectedNode}
              edge={selectedEdge}
              nodes={visibleNodes}
              edges={visibleEdges}
              onPickNode={focusNode}
              onPickEdge={(id) => {
                setSelectedEdgeId(id);
                setSelectedNodeId(null);
              }}
              onClose={() => setSheetOpen(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
