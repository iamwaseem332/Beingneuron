import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useSynapse,
  isIncomplete,
  type DocumentDetail,
  type JobProgress,
} from "./SynapseProvider";
import {
  ANALYSIS_STATUSES,
  IN_FLIGHT_STATUSES,
  STATUS_META,
  formatBytes,
  isAnalyzable,
  isProcessable,
  timeAgo,
  type JobStatus,
  type PaperJob,
} from "./synapseCore";
import { PanelHead, RowSkeleton } from "./states";
import { IconAlert, IconArrowUpRight, IconCheck, IconChevron, IconDoc, IconInbox, IconLink, IconTrash } from "../icons";

/* Live analysis stage — job.status only syncs on refresh, so during the
   analysis run we read the provider's stage stream to show real progress. */
function AnalysisLiveChip({ stage }: { stage: string }) {
  const meta = STATUS_META[stage as JobStatus];
  if (!meta || meta.tone !== "live") return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-signal-500/45 bg-signal-300/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-signal-600">
      <span className="anim-breathe inline-block h-1.5 w-1.5 rounded-full bg-signal-400" />
      {meta.label}
    </span>
  );
}

/* ================= status chip (single source of truth: STATUS_META) ================= */

function StatusChip({ job }: { job: PaperJob }) {
  if (isIncomplete(job)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-900/20 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-500">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-400" />
        incomplete upload
      </span>
    );
  }
  const meta = STATUS_META[job.status];
  const tones = {
    idle: "border-ink-900/20 text-ink-500",
    live: "border-signal-500/45 bg-signal-300/10 text-signal-600",
    done: "border-pulse-500/40 bg-pulse-100/50 text-pulse-700",
    err: "border-signal-500/50 bg-signal-300/15 text-signal-600",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${tones[meta.tone]}`}>
      {meta.tone === "live" ? (
        <span className="anim-breathe inline-block h-1.5 w-1.5 rounded-full bg-signal-400" />
      ) : meta.tone === "err" ? (
        <IconAlert size={10} />
      ) : (
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.tone === "done" ? "bg-pulse-500" : "bg-ink-400"}`} />
      )}
      {meta.label}
    </span>
  );
}

/* ================= pipeline stepper ================= */

const STAGES = [
  { key: "extracting", label: "Extract" },
  { key: "normalizing", label: "Normalize" },
  { key: "chunking", label: "Chunk" },
  { key: "ready", label: "Ready" },
] as const;

function stageIndex(status: PaperJob["status"], prog?: JobProgress): number {
  if (status === "ready_for_analysis" || status === "completed") return 4;
  if (status === "extracting" || prog?.stage === "extracting") return 0;
  if (status === "normalizing" || prog?.stage === "normalizing") return 1;
  if (status === "chunking" || prog?.stage === "chunking") return 2;
  return -1;
}

function PipelineStepper({ job, prog }: { job: PaperJob; prog?: JobProgress }) {
  const failed = job.status === "failed";
  const current = stageIndex(job.status, prog);
  const failedAt = failed ? Math.max(current, 0) : -1;

  return (
    <ol className="flex items-center gap-0" aria-label="Processing pipeline stages">
      {STAGES.map((s, i) => {
        const done = current > i || (current === 4 && i < 4);
        const active = current === i && !failed;
        const isFailed = failedAt === i || (failed && current === -1 && i === 0);
        const liveDetail =
          active && prog?.stage === "extracting" && prog.pageCount
            ? `page ${prog.page}/${prog.pageCount}`
            : active
              ? (prog?.detail ?? "…")
              : null;
        return (
          <li key={s.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border font-mono text-[9px] transition-all duration-500 ${
                  isFailed
                    ? "border-signal-500 bg-signal-400 text-ink-950"
                    : done
                      ? "border-pulse-500 bg-pulse-500 text-paper-card"
                      : active
                        ? "border-signal-500 bg-paper-card text-signal-600"
                        : "border-ink-900/15 bg-paper-card text-ink-300"
                }`}
              >
                {isFailed ? <IconAlert size={11} /> : done ? <IconCheck size={11} /> : i + 1}
              </span>
              <span
                className={`whitespace-nowrap font-mono text-[8.5px] uppercase tracking-[0.16em] ${
                  isFailed ? "text-signal-600" : done ? "text-pulse-700" : active ? "text-signal-600" : "text-ink-300"
                }`}
              >
                {s.label}
              </span>
              <span className={`h-3 font-mono text-[8.5px] tracking-wide ${active ? "text-ink-500" : "text-transparent"}`}>
                {liveDetail ?? "·"}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <span
                aria-hidden
                className={`mx-2 mb-6 h-px flex-1 transition-colors duration-500 ${
                  current > i ? "bg-pulse-500" : "bg-ink-900/12"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ================= expanded document panel (real extraction output) ================= */

function DocumentPanel({ job }: { job: PaperJob }) {
  const { getDetail, summaries } = useSynapse();
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready"; detail: DocumentDetail | null }>({
    status: "idle",
    detail: null,
  });
  const summary = summaries[job.id];

  const load = async () => {
    if (state.status !== "idle") return;
    setState({ status: "loading", detail: null });
    const detail = await getDetail(job.id);
    setState({ status: "ready", detail });
  };

  if (state.status === "idle") {
    return (
      <div className="mt-4 rounded-lg border border-pulse-500/25 bg-pulse-100/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-[14px] font-semibold text-ink-900">
              {summary?.title ?? "Structured document stored"}
            </p>
            <p className="mt-0.5 font-mono text-[10.5px] tracking-wide text-ink-500">
              {summary
                ? `${summary.page_count} pages · ${summary.word_count.toLocaleString()} words · ${summary.section_count} sections · ${summary.chunk_count} chunks`
                : "normalized text + analysis-ready chunks · original PDF purged"}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="shrink-0 rounded-full bg-ink-900 px-4 py-2 font-display text-[12px] font-semibold text-paper transition-colors hover:bg-ink-700"
          >
            View structure
          </button>
        </div>
        <p className="mt-3 border-t border-pulse-500/20 pt-3 font-mono text-[9.5px] uppercase tracking-[0.16em] text-pulse-700">
          prepared for the analysis engine · phase 6
        </p>
      </div>
    );
  }

  if (state.status === "loading") return <div className="mt-4"><RowSkeleton rows={2} /></div>;

  const detail = state.detail;
  if (!detail) {
    return (
      <p className="mt-4 rounded-lg border border-ink-900/10 bg-paper-card p-4 text-[12px] text-ink-500">
        The extraction summary is stored, but the full detail isn't available in this browser's
        demo storage (quota). The job itself is intact.
      </p>
    );
  }

  const { doc, chunks } = detail;
  const firstChunk = chunks[0];

  return (
    <div className="drop-in mt-4 overflow-hidden rounded-lg border border-ink-900/12 bg-paper-card">
      <div className="grid grid-cols-2 gap-px bg-ink-900/[0.08] sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["pages", String(doc.pageCount)],
          ["words", doc.wordCount.toLocaleString()],
          ["sections", String(doc.sections.length)],
          ["chunks", String(chunks.length)],
          ["two-column p.", String(doc.twoColumnPages)],
          ["noise removed", String(doc.removedHeadersFooters + doc.removedPageNumbers)],
        ].map(([k, v]) => (
          <div key={k} className="bg-paper-card px-3.5 py-3">
            <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-ink-400">{k}</p>
            <p className="tnum mt-1 font-display text-[17px] font-bold text-ink-900">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 border-t border-ink-900/[0.08] p-4 lg:grid-cols-2">
        {/* sections — traceable to pages */}
        <div>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">Detected structure</p>
          <ul className="app-scroll mt-2.5 max-h-44 space-y-1 overflow-y-auto pr-1">
            {doc.abstract && (
              <li className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-pulse-100/50">
                <span className="font-display text-[12.5px] font-semibold text-ink-800">Abstract</span>
                <span className="font-mono text-[9.5px] text-ink-400">p.1 · front matter</span>
              </li>
            )}
            {doc.sections.map((s) => (
              <li key={s.order} className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-pulse-100/50">
                <span className="truncate font-display text-[12.5px] font-semibold text-ink-800">
                  {s.heading || "(untitled section)"}
                </span>
                <span className="shrink-0 font-mono text-[9.5px] text-ink-400">
                  p.{s.page} · {s.paragraphs.length} ¶
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* chunk specimen */}
        <div>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">Chunk specimen</p>
          {firstChunk ? (
            <div className="mt-2.5 rounded-md border border-ink-900/10 bg-ink-950 p-3.5">
              <p className="flex items-center justify-between font-mono text-[9px] tracking-[0.14em] text-pulse-300">
                <span>{firstChunk.chunk_id}</span>
                <span className="text-paper/40">
                  {firstChunk.kind} · p.{firstChunk.page_start}–{firstChunk.page_end} · ~{firstChunk.token_estimate} tok
                </span>
              </p>
              <p className="mt-2 line-clamp-5 font-mono text-[10.5px] leading-relaxed text-paper/70">
                {firstChunk.text.slice(0, 420)}
                {firstChunk.text.length > 420 ? "…" : ""}
              </p>
            </div>
          ) : (
            <p className="mt-2.5 text-[12px] text-ink-400">No chunks were produced.</p>
          )}
          <p className="mt-3 font-mono text-[9.5px] leading-relaxed tracking-wide text-ink-400">
            chunks keep section context + page spans — raw extraction and normalized text are
            stored separately; the original PDF was purged after extraction.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================= pipeline card ================= */

function PipelineCard({
  job,
  onDelete,
  onProcess,
  deleting,
  processing,
}: {
  job: PaperJob;
  onDelete: (id: string) => void;
  onProcess: (job: PaperJob) => void;
  deleting: boolean;
  processing: boolean;
}) {
  const { progress, summaries, analysisStage, runAnalysis } = useSynapse();
  const prog = progress[job.id];
  const isPdf = job.source_type === "pdf";
  const ready = job.status === "ready_for_analysis" || job.status === "completed";
  const inFlight = IN_FLIGHT_STATUSES.includes(job.status) || (prog && prog.stage !== "done" && prog.stage !== "failed" && processing);
  const liveStage = analysisStage[job.id];
  const analyzing = Boolean(liveStage && ANALYSIS_STATUSES.includes(liveStage as JobStatus));

  return (
    <li className="group relative overflow-hidden rounded-lg border border-ink-900/10 bg-paper-card p-4 transition-all duration-300 hover:border-ink-900/25 hover:shadow-[0_16px_34px_-24px_rgba(6,15,24,0.55)]">
      {/* live edge while processing / analyzing */}
      {(inFlight || analyzing) && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-signal-400" />}
      {ready && !analyzing && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-pulse-500" />}

      <div className="flex items-start gap-3.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
            isPdf ? "border-pulse-500/25 bg-pulse-100/70 text-pulse-700" : "border-ink-900/15 bg-paper-deep text-ink-600"
          }`}
        >
          {isPdf ? <IconDoc size={17} /> : <IconLink size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[14px] font-semibold tracking-tight text-ink-900">
            {isPdf ? job.original_filename : `arXiv:${job.arxiv_id}`}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10.5px] tracking-wide text-ink-400">
            {isPdf
              ? `${formatBytes(job.file_size)} · job #${job.id.slice(0, 8)} · ${timeAgo(job.created_at)}`
              : `${job.paper_url} · job #${job.id.slice(0, 8)} · ${timeAgo(job.created_at)}`}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <StatusChip job={job} />
            {analyzing && <AnalysisLiveChip stage={liveStage as string} />}
            {isProcessable(job.status) && !isIncomplete(job) && (
              <button
                type="button"
                onClick={() => onProcess(job)}
                disabled={processing}
                className="inline-flex items-center gap-1.5 rounded-full border border-pulse-500/40 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-pulse-700 transition-all hover:bg-pulse-500 hover:text-paper-card disabled:cursor-not-allowed disabled:opacity-40"
              >
                {job.status === "failed" ? "retry extraction" : "process now"}
              </button>
            )}
            {isAnalyzable(job.status) && !analyzing && (
              <button
                type="button"
                onClick={() => void runAnalysis(job)}
                className="inline-flex items-center gap-1.5 rounded-full border border-signal-500/45 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-signal-600 transition-all hover:bg-signal-400 hover:text-ink-950"
              >
                analyze now
              </button>
            )}
            {inFlight && prog?.detail && (
              <span className="font-mono text-[9.5px] tracking-wide text-ink-500">
                {prog.detail}
                <span className="anim-blink ml-1 text-signal-500">▍</span>
              </span>
            )}
          </div>

          {job.status === "failed" && (
            <p className="mt-2.5 rounded-md border border-signal-500/30 bg-signal-300/10 px-3 py-2 text-[11.5px] leading-relaxed text-signal-600">
              {prog?.error ?? job.error_message ?? "Extraction failed. Retry, or try a different copy of the paper."}
            </p>
          )}
          {isIncomplete(job) && (
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-400">
              The upload didn't finish (likely a refresh mid-transfer). Safe to delete, then re-upload.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(job.id)}
          disabled={deleting || processing}
          aria-label={`Delete job ${job.id.slice(0, 8)}`}
          title="Delete job"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-300 opacity-60 transition-all hover:bg-signal-300/20 hover:text-signal-600 group-hover:opacity-100 disabled:opacity-30"
        >
          {deleting ? (
            <span className="spinner spinner-sm" style={{ borderColor: "rgba(11,26,38,0.15)", borderTopColor: "var(--color-signal-500)" }} />
          ) : (
            <IconTrash size={15} />
          )}
        </button>
      </div>

      {(inFlight || ready) && (
        <div className="mt-4 border-t border-dashed border-ink-900/10 pt-4">
          <PipelineStepper job={job} prog={prog} />
          {ready && <DocumentPanel job={job} />}
        </div>
      )}
      {job.status === "analyzed" && (
        <div className="mt-4 border-t border-dashed border-pulse-500/30 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-display text-[14px] font-semibold text-ink-900">
                {summaries[job.id]?.title ?? "Analysis complete"}
              </p>
              <p className="mt-0.5 font-mono text-[10.5px] tracking-wide text-ink-500">
                structured research extracted · knowledge graph generated
              </p>
            </div>
            <Link
              to={`/app/synapse/${job.id}`}
              className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-pulse-400 px-4 py-2 font-display text-[12.5px] font-semibold text-ink-950 transition-all duration-300 hover:bg-pulse-300"
            >
              Open workspace
              <IconArrowUpRight size={13} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}

/* ================= queue ================= */

export default function PipelineQueue() {
  const { jobs, loadingJobs, deleteJob, processJob } = useSynapse();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const readyCount = jobs.filter((j) => j.status === "ready_for_analysis").length;
  const liveCount = jobs.filter((j) => IN_FLIGHT_STATUSES.includes(j.status)).length;

  const onDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteJob(id);
    } finally {
      setDeletingId(null);
    }
  };

  const onProcess = async (job: PaperJob) => {
    setProcessingId(job.id);
    try {
      await processJob(job);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <section aria-labelledby="intake-queue" className="rounded-xl border border-ink-900/12 bg-paper-deep/60 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelHead title="Intake & extraction" tag={`live · ${jobs.length}`} />
        <div className="flex items-center gap-2">
          {liveCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-signal-500/40 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-signal-600">
              <span className="anim-breathe inline-block h-1.5 w-1.5 rounded-full bg-signal-400" />
              {liveCount} processing
            </span>
          )}
          {readyCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-pulse-500/40 bg-pulse-100/50 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-pulse-700">
              <IconCheck size={10} />
              {readyCount} ready for analysis
            </span>
          )}
        </div>
      </div>

      <div className="mt-5">
        {loadingJobs ? (
          <RowSkeleton rows={3} />
        ) : jobs.length === 0 ? (
          <div className="relative rounded-lg border border-dashed border-ink-900/20 px-5 py-8 text-center">
            <span aria-hidden className="absolute left-2 top-2 h-3 w-3 border-l-2 border-t-2 border-pulse-500/60" />
            <span aria-hidden className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2 border-pulse-500/60" />
            <IconInbox size={22} className="mx-auto text-ink-300" />
            <p className="mt-3 font-display text-[14.5px] font-semibold text-ink-800">No papers in the pipeline</p>
            <p className="mx-auto mt-1 max-w-[30ch] text-[12px] leading-relaxed text-ink-400">
              Upload a PDF or import an arXiv paper — extraction, normalization and chunking run
              the moment it lands.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {jobs.map((j) => (
              <PipelineCard
                key={j.id}
                job={j}
                onDelete={onDelete}
                onProcess={onProcess}
                deleting={deletingId === j.id}
                processing={processingId === j.id}
              />
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 flex items-center gap-2 font-mono text-[9.5px] tracking-wide text-ink-400">
        <IconChevron size={11} className="text-pulse-600" />
        extraction runs locally in this preview build · with Supabase configured it runs in the
        extract-paper Edge Function
      </p>
    </section>
  );
}
