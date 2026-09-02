import { useState } from "react";
import type { Paper, ResearchCollection } from "../types";
import { EmptyState, PageHeader, PanelHead } from "./states";
import { IconGraph, IconLibrary, IconSearch } from "../icons";

/* ============================================================
 * Phase 4-ready card primitives.
 * Typed against the future entity model, intentionally NOT
 * rendered with invented data in Phase 3.
 * ============================================================ */

export function PaperCard({ paper }: { paper: Paper }) {
  return (
    <article className="card-lift rounded-xl border border-ink-900/12 bg-paper-card p-5">
      <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-pulse-600">{paper.domain}</p>
      <h3 className="mt-2 line-clamp-2 font-display text-[15.5px] font-semibold leading-snug tracking-tight text-ink-900">
        {paper.title}
      </h3>
      <p className="mt-1.5 truncate text-[12.5px] text-ink-500">{paper.authors.join(", ")}</p>
      <p className="mt-4 font-mono text-[10px] tracking-wide text-ink-400">
        {paper.source === "arxiv" ? `arXiv · ${paper.arxiv_id}` : "uploaded PDF"}
      </p>
    </article>
  );
}

export function CollectionCard({ collection }: { collection: ResearchCollection }) {
  return (
    <article className="card-lift rounded-xl border border-ink-900/12 bg-paper-card p-5">
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-pulse-500/25 bg-pulse-100/70 text-pulse-700">
          <IconLibrary size={17} />
        </span>
        <span className="tnum font-mono text-[10px] tracking-wide text-ink-400">
          {collection.analysis_ids.length} items
        </span>
      </div>
      <h3 className="mt-4 font-display text-[15.5px] font-semibold tracking-tight text-ink-900">{collection.name}</h3>
      <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-500">{collection.description}</p>
    </article>
  );
}

/* ================= filter toolbar (future-ready, honestly disabled) ================= */

const FILTERS = ["All", "Papers", "Collections", "Graphs"];

function Toolbar({ explainOpen, onToggleExplain }: { explainOpen: boolean; onToggleExplain: () => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-ink-900/12 bg-paper-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-full max-w-sm items-center gap-3 rounded-lg border border-ink-900/12 bg-paper px-4 py-2.5 opacity-70">
        <IconSearch size={15} className="shrink-0 text-ink-400" />
        <input
          type="text"
          disabled
          placeholder="Search your library — arrives with your data"
          className="w-full bg-transparent text-[13.5px] text-ink-900 placeholder:text-ink-300 focus:outline-none"
          aria-label="Search library (disabled until data exists)"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Library filters (inactive)">
        {FILTERS.map((f, i) => (
          <span
            key={f}
            aria-disabled="true"
            title="Filters activate when your library has content"
            className={`cursor-not-allowed rounded-full border px-3.5 py-1.5 font-display text-[12px] font-semibold ${
              i === 0 ? "border-ink-900/30 text-ink-500" : "border-ink-900/12 text-ink-300"
            }`}
          >
            {f}
          </span>
        ))}
        <button
          type="button"
          onClick={onToggleExplain}
          aria-expanded={explainOpen}
          className="link-line ml-1 font-display text-[12.5px] font-semibold text-pulse-700"
        >
          {explainOpen ? "Hide details" : "How it will work"}
        </button>
      </div>
    </div>
  );
}

/* ================= page ================= */

export default function ResearchPage() {
  const [explainOpen, setExplainOpen] = useState(false);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Research · Library"
        title={[<>Your research, kept</>, <>and connected.</>]}
        lede="Saved papers, curated collections, and the knowledge graphs between them — one workspace for everything Synapse produces."
      />

      <Toolbar explainOpen={explainOpen} onToggleExplain={() => setExplainOpen((v) => !v)} />

      {explainOpen && (
        <div className="drop-in grid gap-px overflow-hidden rounded-xl border border-ink-800 bg-ink-800 md:grid-cols-3">
          {[
            {
              t: "Papers you analyze",
              d: "Every Synapse analysis stays attached to its source paper — title, authors, domain, origin.",
            },
            {
              t: "Collections you curate",
              d: "Group analyses around a question: a thesis chapter, a literature review, a debate.",
            },
            {
              t: "Graphs you can reopen",
              d: "Knowledge graphs persist, so a map you built in March is still walkable in December.",
            },
          ].map((c) => (
            <div key={c.t} className="bg-ink-950 p-6">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-pulse-300/70">{c.t}</p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-paper/60">{c.d}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-ink-900/12 bg-paper-card p-7">
        <PanelHead title="Library" tag="empty" />
        <div className="mt-6">
          <EmptyState
            icon={IconLibrary}
            title="Your research library is empty."
            desc="Analyze a paper with Synapse to start building your research workspace. Saved analyses, collections and graphs will appear here — nothing is invented in the meantime."
            action={{ label: "Go to Synapse", to: "/app/synapse" }}
          />
        </div>
      </div>

      <p className="flex items-center gap-2.5 font-mono text-[10.5px] tracking-wide text-ink-400">
        <IconGraph size={13} className="text-pulse-600" />
        multi-paper projects and cross-paper graphs are planned for the same release as the analysis engine.
      </p>
    </div>
  );
}
