import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useSynapse, type SubmitOutcome, type UploadProgress } from "./SynapseProvider";
import { INTAKE_CONFIG, formatBytes, parseArxivInput, validatePdfFile, type PdfCheck } from "./synapseCore";
import { SYNAPSE_PIPELINE } from "./appData";
import { PageHeader, PanelHead } from "./states";
import { Reveal } from "../ui";
import { usePrefersReducedMotion } from "../hooks";
import PipelineQueue from "./PipelineQueue";
import { IconAlert, IconCheck, IconDoc, IconLink, IconUpload, IconX } from "../icons";

/* ================= validation checklist ================= */

function Checklist({ checks, error }: { checks: PdfCheck[]; error: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [revealed, setRevealed] = useState(reduced ? checks.length : 0);

  useEffect(() => {
    if (reduced) {
      setRevealed(checks.length);
      return;
    }
    setRevealed(0);
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= checks.length) window.clearInterval(t);
    }, 240);
    return () => window.clearInterval(t);
  }, [checks, reduced]);

  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="File validation results">
      {checks.map((c, i) => {
        const shown = i < revealed;
        const failedItem = error && !c.ok;
        return (
          <li
            key={c.key}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all duration-300 ${
              !shown
                ? "border-transparent opacity-0 translate-y-1"
                : failedItem
                  ? "border-signal-500/45 bg-signal-300/10 opacity-100 translate-y-0"
                  : "border-pulse-500/25 bg-pulse-100/40 opacity-100 translate-y-0"
            }`}
          >
            <span
              className={`flex shrink-0 items-center justify-center rounded-full border ${
                failedItem ? "border-signal-500 bg-signal-400 text-ink-950" : "border-pulse-500 bg-pulse-500 text-paper-card"
              }`}
              style={{ width: 18, height: 18 }}
            >
              {failedItem ? <IconX size={10} /> : <IconCheck size={10} />}
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-400">{c.label}</span>
              <span className={`block truncate font-mono text-[11px] ${failedItem ? "text-signal-600" : "text-ink-700"}`}>
                {c.detail}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ================= progress bar ================= */

function ProgressBar({ p }: { p: UploadProgress }) {
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[10.5px] tracking-wide text-paper/60">
        <span>{p.phase === "upload" ? "uploading to temporary intake" : "storing to temporary intake"}</span>
        <span className="tnum text-pulse-300">
          {p.pct === null ? "…" : `${p.pct}%`} · {formatBytes(p.loaded)} / {formatBytes(p.total)}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper/10">
        {p.pct === null ? (
          <div
            className="h-full w-full rounded-full"
            style={{
              background:
                "linear-gradient(90deg, rgba(124,228,208,0.12) 25%, rgba(124,228,208,0.45) 50%, rgba(124,228,208,0.12) 75%)",
              backgroundSize: "200% 100%",
              animation: "bn-shimmer 1.6s linear infinite",
            }}
          />
        ) : (
          <div
            className="h-full rounded-full bg-pulse-400 transition-[width] duration-300 ease-out"
            style={{ width: `${p.pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

/* ================= success ticket ================= */

function StepRow({ state, label, detail }: { state: "done" | "active"; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      {state === "done" ? (
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pulse-400/20 text-pulse-300">
          <IconCheck size={11} />
        </span>
      ) : (
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
          <span className="ping-dot inline-block h-2.5 w-2.5 rounded-full bg-signal-400" />
        </span>
      )}
      <span>
        <span className={`block font-display text-[13.5px] font-semibold ${state === "done" ? "text-paper" : "text-signal-300"}`}>
          {label}
        </span>
        <span className="block font-mono text-[10.5px] tracking-wide text-paper/45">{detail}</span>
      </span>
    </li>
  );
}

function JobTicket({
  outcome,
  onReset,
}: {
  outcome: Extract<SubmitOutcome, { ok: true }>;
  onReset: () => void;
}) {
  const { job, existing } = outcome;
  const isPdf = job.source_type === "pdf";
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div role="status" className="drop-in rounded-lg border border-pulse-400/30 bg-ink-900/80 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-lg font-semibold tracking-tight text-paper">
          {existing ? "Already in your intake." : "Paper received."}
        </p>
        <span className="rounded-full border border-paper/15 px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-paper/55">
          job #{job.id.slice(0, 8)}
        </span>
      </div>
      <p className="mt-1 font-mono text-[11px] tracking-wide text-paper/50">
        {isPdf ? `${job.original_filename} · ${formatBytes(job.file_size)}` : `arXiv:${job.arxiv_id} · ${job.paper_url}`}
      </p>

      {existing ? (
        <p className="mt-4 rounded-lg border border-signal-500/30 bg-signal-300/10 p-3.5 text-[12.5px] leading-relaxed text-signal-200">
          This paper was already imported — no duplicate job was created. Find it in the
          pipeline below; its extracted structure is already there.
        </p>
      ) : (
        <>
          <ul className="mt-5 space-y-3.5 border-t border-paper/10 pt-4">
            <StepRow state="done" label="Validated" detail={isPdf ? "extension · type · size · %PDF- header" : "arXiv identifier normalized"} />
            <StepRow
              state="done"
              label={isPdf ? "Stored in temporary intake" : "Import recorded"}
              detail={isPdf ? "private bucket · unique user-scoped path" : "canonical link saved to your job"}
            />
            <StepRow state="done" label="Intake job created" detail={`created ${now} · tracked in your queue`} />
            <StepRow
              state="active"
              label="Extraction started"
              detail="extract → normalize → chunk — watch the pipeline in your queue below"
            />
          </ul>
          <p className="mt-4 font-mono text-[10.5px] leading-relaxed tracking-wide text-paper/45">
            extraction, normalization and chunking run now · concept analysis arrives with the
            Phase 6 engine — nothing here pretends otherwise.
          </p>
        </>
      )}

      <button
        type="button"
        onClick={onReset}
        className="mt-5 rounded-full border border-paper/25 px-5 py-2.5 font-display text-[13px] font-semibold text-paper transition-all duration-300 hover:border-paper hover:bg-paper hover:text-ink-950"
      >
        Add another paper
      </button>
    </div>
  );
}

/* ================= intake facts ================= */

function IntakeFacts() {
  const rows: [string, string][] = [
    ["formats", "PDF only · arXiv abs/pdf links"],
    ["max size", `${INTAKE_CONFIG.maxPdfMb} MB per file`],
    ["storage", "temporary · private bucket"],
    ["isolation", "per-user rows + user-scoped paths"],
    ["validation", "extension · MIME · size · %PDF- bytes"],
    ["rate limit", `${INTAKE_CONFIG.hourlyCap} jobs / hour`],
    ["retention", "originals purged after extraction · structure kept"],
  ];
  return (
    <section aria-label="Intake facts" className="rounded-xl border border-ink-900/12 bg-paper-card p-6">
      <PanelHead title="How the pipeline works" tag="phase 4–5" />
      <dl className="mt-5 space-y-2.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-dashed border-ink-900/10 pb-2.5 last:border-b-0 last:pb-0">
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">{k}</dt>
            <dd className="text-right font-mono text-[11px] tracking-wide text-ink-700">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-[12px] leading-relaxed text-ink-500">
        Papers wait in a private temporary area. The extraction pipeline reads them, stores the
        normalized text and analysis-ready chunks, then deletes the original — no permanent PDF
        archive by default. Concept analysis itself awaits the Phase 6 engine.
      </p>
    </section>
  );
}

/* ================= pipeline strip ================= */

function PipelineStrip() {
  return (
    <Reveal delay={140}>
      <section aria-label="Synapse pipeline" className="mt-10">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-ink-400">
          the document pipeline · intake → extraction → chunking → analysis
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SYNAPSE_PIPELINE.map((s) => {
            const live = s.live;
            return (
              <div
                key={s.step}
                className={`relative rounded-xl border p-5 transition-all duration-300 ${
                  live
                    ? "border-ink-800 bg-ink-950 text-paper"
                    : "border-ink-900/12 bg-paper-card hover:border-ink-900/25"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-mono text-[10px] tracking-[0.2em] ${live ? "text-pulse-300" : "text-ink-300"}`}>{s.step}</span>
                  {live ? (
                    <span className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.16em] text-pulse-300">
                      <span className="ping-dot inline-block h-1.5 w-1.5 rounded-full bg-pulse-400" />
                      live now
                    </span>
                  ) : (
                    <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-ink-300">{s.phase}</span>
                  )}
                </div>
                <p className={`mt-3 font-display text-[16px] font-semibold tracking-tight ${live ? "text-paper" : "text-ink-900"}`}>
                  {s.label}
                </p>
                <p className={`mt-1 text-[12px] leading-relaxed ${live ? "text-paper/55" : "text-ink-400"}`}>{s.desc}</p>
              </div>
            );
          })}
        </div>
      </section>
    </Reveal>
  );
}

/* ================= main page ================= */

type Tab = "pdf" | "arxiv";

export default function SynapsePage() {
  const { mode, submitPdf, submitArxiv, submitting, jobs } = useSynapse();
  const reduced = usePrefersReducedMotion();

  const [tab, setTab] = useState<Tab>("pdf");

  /* pdf state */
  const [file, setFile] = useState<File | null>(null);
  const [checks, setChecks] = useState<PdfCheck[] | null>(null);
  const [pdfValid, setPdfValid] = useState<boolean | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [pdfOutcome, setPdfOutcome] = useState<SubmitOutcome | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* arxiv state */
  const [arxivInput, setArxivInput] = useState("");
  const [arxivOutcome, setArxivOutcome] = useState<SubmitOutcome | null>(null);
  const arxivParse = arxivInput.trim() ? parseArxivInput(arxivInput) : null;
  const arxivDupe =
    arxivParse?.ok && jobs.some((j) => j.arxiv_id === arxivParse.id)
      ? jobs.find((j) => j.arxiv_id === (arxivParse.ok ? arxivParse.id : null))
      : undefined;

  /* pdf duplicate (soft, non-blocking) */
  const pdfDupe =
    file && pdfValid ? jobs.some((j) => j.source_type === "pdf" && j.original_filename === file.name && j.file_size === file.size) : false;

  const resetPdf = useCallback(() => {
    setFile(null);
    setChecks(null);
    setPdfValid(null);
    setValidationError(null);
    setBannerVisible(false);
    setProgress(null);
    setPdfOutcome(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleFile = useCallback(
    async (f: File | undefined | null) => {
      if (!f) return;
      setPdfOutcome(null);
      setProgress(null);
      setFile(f);
      setChecks(null);
      setPdfValid(null);
      setValidationError(null);
      setBannerVisible(false);

      const v = await validatePdfFile(f);
      setChecks(v.checks);
      setPdfValid(v.ok);
      setValidationError(v.reason);
      if (!v.ok) {
        if (reduced) setBannerVisible(true);
        else window.setTimeout(() => setBannerVisible(true), v.checks.length * 240 + 200);
      }
    },
    [reduced],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const list = Array.from(e.dataTransfer.files ?? []);
      if (list.length > 1) {
        setValidationError("One paper at a time — drop a single PDF.");
        setBannerVisible(true);
        return;
      }
      void handleFile(list[0]);
    },
    [handleFile],
  );

  const onPdfSubmit = async () => {
    if (!file || submitting || pdfOutcome?.ok) return;
    setProgress({ phase: "upload", pct: mode === "demo" ? 0 : null, loaded: 0, total: file.size });
    const outcome = await submitPdf(file, setProgress);
    setPdfOutcome(outcome);
    if (!outcome.ok) setProgress(null);
  };

  const onArxivSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || arxivOutcome?.ok) return;
    const outcome = await submitArxiv(arxivInput);
    setArxivOutcome(outcome);
  };

  const switchTab = (t: Tab) => {
    if (submitting) return;
    setTab(t);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Research · Synapse"
        title={[<>Turn a research paper into an</>, <span className="text-pulse-600">explorable map of knowledge.</span>]}
        lede="Intake and extraction are live: upload a PDF or import an arXiv paper and BeingNeuron extracts its text and structure, normalizes it, and chunks it — every segment traceable to a page. Concept analysis arrives with the Phase 6 engine."
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ============ intake console ============ */}
        <Reveal>
          <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-950 text-paper">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-paper/10 px-6 py-4">
              <PanelHeadDark />
              {mode === "demo" && (
                <span className="rounded-full border border-signal-400/40 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-signal-300">
                  demo intake · stored in this browser
                </span>
              )}
            </div>

            {/* tabs */}
            <div className="border-b border-paper/10 px-6 pt-5">
              <div role="tablist" aria-label="Intake source" className="grid max-w-sm grid-cols-2 rounded-t-lg border border-b-0 border-paper/15 bg-paper/[0.04] p-1">
                {(
                  [
                    ["pdf", "Upload PDF", IconUpload],
                    ["arxiv", "Import arXiv Paper", IconLink],
                  ] as const
                ).map(([key, label, Icon]) => {
                  const active = tab === key;
                  return (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={active}
                      aria-controls={`panel-${key}`}
                      id={`tab-${key}`}
                      type="button"
                      onClick={() => switchTab(key)}
                      disabled={submitting}
                      className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 font-display text-[13px] font-semibold transition-all duration-300 disabled:cursor-not-allowed ${
                        active ? "bg-pulse-400 text-ink-950 shadow-[0_8px_20px_-10px_rgba(53,196,174,0.8)]" : "text-paper/55 hover:text-paper"
                      }`}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-grid-dark p-6">
              {/* ================= PDF panel ================= */}
              {tab === "pdf" && (
                <div id="panel-pdf" role="tabpanel" aria-labelledby="tab-pdf" className="space-y-5">
                  {!file && !pdfOutcome?.ok && (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={onDrop}
                      aria-label="Choose a PDF file or drop it here"
                      className={`relative block w-full rounded-lg border-2 border-dashed px-6 py-12 text-center transition-all duration-300 ${
                        dragging
                          ? "border-pulse-300 bg-pulse-400/10 scale-[1.01]"
                          : "border-paper/20 hover:border-pulse-400/60 hover:bg-paper/[0.03]"
                      }`}
                    >
                      <span aria-hidden className="absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-pulse-400/70" />
                      <span aria-hidden className="absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-pulse-400/70" />
                      <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-300 ${dragging ? "border-pulse-300 text-pulse-300 scale-110" : "border-paper/25 text-paper/60"}`}>
                        <IconUpload size={20} />
                      </span>
                      <span className="mt-4 block font-display text-lg font-semibold tracking-tight">
                        {dragging ? "Release to validate" : "Drop a PDF — or click to browse"}
                      </span>
                      <span className="mt-1.5 block font-mono text-[10.5px] tracking-wide text-paper/45">
                        {INTAKE_CONFIG.maxPdfMb} MB limit · validated before it ever reaches processing
                      </span>
                    </button>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={(e) => void handleFile(e.target.files?.[0])}
                    aria-hidden
                    tabIndex={-1}
                  />

                  {/* selected file card */}
                  {file && !pdfOutcome?.ok && (
                    <div className="rounded-lg border border-paper/15 bg-ink-900/80 p-5">
                      <div className="flex items-start gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-pulse-400/30 bg-pulse-400/10 text-pulse-300">
                          <IconDoc size={20} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-[15px] font-semibold tracking-tight">{file.name}</p>
                          <p className="mt-0.5 font-mono text-[10.5px] tracking-wide text-paper/50">
                            {formatBytes(file.size)} · {file.type || "type unspecified"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={resetPdf}
                          disabled={submitting}
                          aria-label="Remove selected file"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-paper/45 transition-all hover:bg-paper/[0.08] hover:text-signal-300 disabled:opacity-40"
                        >
                          <IconX size={16} />
                        </button>
                      </div>

                      {checks && (
                        <div className="mt-4">
                          <Checklist checks={checks} error={pdfValid === false} />
                        </div>
                      )}

                      {pdfDupe && pdfValid && (
                        <p className="mt-3 rounded-md border border-signal-500/30 bg-signal-300/10 px-3 py-2 font-mono text-[10.5px] tracking-wide text-signal-300">
                          heads-up — a file with this name and size is already in your intake. Submitting creates a second job.
                        </p>
                      )}

                      {validationError && bannerVisible && (
                        <p role="alert" className="drop-in mt-4 flex items-start gap-2.5 rounded-md border border-signal-500/40 bg-signal-300/10 px-3.5 py-3 text-[12.5px] leading-relaxed text-signal-200">
                          <IconAlert size={15} className="mt-0.5 shrink-0 text-signal-400" />
                          {validationError}
                        </p>
                      )}

                      {progress && (
                        <div className="mt-5">
                          <ProgressBar p={progress} />
                        </div>
                      )}

                      {!progress && (
                        <div className="mt-5 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={onPdfSubmit}
                            disabled={!pdfValid || submitting}
                            className="inline-flex items-center gap-2.5 rounded-full bg-pulse-400 px-6 py-3 font-display text-[14px] font-semibold text-ink-950 transition-all duration-300 hover:bg-pulse-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {submitting ? (
                              <>
                                <span className="spinner spinner-sm" /> Creating job…
                              </>
                            ) : (
                              "Analyze Research Paper"
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            disabled={submitting}
                            className="rounded-full border border-paper/25 px-5 py-3 font-display text-[13px] font-semibold text-paper/75 transition-all hover:border-paper hover:text-paper disabled:opacity-40"
                          >
                            Change file
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {pdfOutcome?.ok && <JobTicket outcome={pdfOutcome} onReset={resetPdf} />}

                  {pdfOutcome && !pdfOutcome.ok && (
                    <div role="alert" className="drop-in rounded-lg border border-signal-500/40 bg-signal-300/10 p-5">
                      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-signal-300">
                        <IconAlert size={13} /> Submission failed
                      </p>
                      <p className="mt-2 text-[13px] leading-relaxed text-signal-200">{pdfOutcome.error}</p>
                      <button
                        type="button"
                        onClick={() => setPdfOutcome(null)}
                        className="mt-4 rounded-full border border-signal-400/50 px-5 py-2.5 font-display text-[13px] font-semibold text-signal-300 transition-all hover:bg-signal-400 hover:text-ink-950"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ================= arXiv panel ================= */}
              {tab === "arxiv" && (
                <div id="panel-arxiv" role="tabpanel" aria-labelledby="tab-arxiv" className="space-y-5">
                  {!arxivOutcome?.ok && (
                    <form onSubmit={onArxivSubmit} className="rounded-lg border border-paper/15 bg-ink-900/80 p-5">
                      <label htmlFor="arxiv-url" className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/45">
                        arXiv paper link
                      </label>
                      <div className="mt-2.5 flex flex-col gap-3 sm:flex-row">
                        <input
                          id="arxiv-url"
                          type="text"
                          inputMode="url"
                          value={arxivInput}
                          onChange={(e) => {
                            setArxivInput(e.target.value);
                            setArxivOutcome(null);
                          }}
                          placeholder="https://arxiv.org/abs/2401.04088"
                          autoComplete="off"
                          spellCheck={false}
                          disabled={submitting}
                          className="min-w-0 flex-1 rounded-lg border border-paper/15 bg-ink-950/70 px-4 py-3 font-mono text-[13px] text-paper placeholder:text-paper/25 outline-none transition-all focus:border-pulse-400/70 focus:ring-2 focus:ring-pulse-400/20 disabled:opacity-60"
                        />
                        <button
                          type="submit"
                          disabled={submitting || !arxivInput.trim()}
                          className="inline-flex shrink-0 items-center justify-center gap-2.5 rounded-full bg-pulse-400 px-6 py-3 font-display text-[14px] font-semibold text-ink-950 transition-all duration-300 hover:bg-pulse-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {submitting ? (
                            <>
                              <span className="spinner spinner-sm" /> Importing…
                            </>
                          ) : (
                            "Create import job"
                          )}
                        </button>
                      </div>

                      {/* live parse preview */}
                      {arxivParse && (
                        <div
                          className={`drop-in mt-4 rounded-md border px-3.5 py-3 font-mono text-[11px] leading-relaxed tracking-wide ${
                            arxivParse.ok
                              ? "border-pulse-400/30 bg-pulse-400/[0.07] text-pulse-200"
                              : "border-signal-500/35 bg-signal-300/[0.07] text-signal-300"
                          }`}
                          aria-live="polite"
                        >
                          {arxivParse.ok ? (
                            <>
                              <p>
                                <span className="text-paper/40">id</span> ········ {arxivParse.id}
                                {arxivParse.version ? ` (v${arxivParse.version} detected)` : ""}
                              </p>
                              <p>
                                <span className="text-paper/40">canonical</span> · {arxivParse.canonicalUrl}
                              </p>
                              {arxivDupe && (
                                <p className="mt-1 text-signal-300">already in your intake — job #{arxivDupe.id.slice(0, 8)} · resubmitting won't duplicate it</p>
                              )}
                            </>
                          ) : (
                            <p>✕ {arxivParse.reason}</p>
                          )}
                        </div>
                      )}
                      <p className="mt-3.5 font-mono text-[10px] tracking-wide text-paper/35">
                        supported · arxiv.org/abs/… · arxiv.org/pdf/… · old-style ids like hep-th/9901001
                      </p>
                    </form>
                  )}

                  {arxivOutcome?.ok && (
                    <JobTicket
                      outcome={arxivOutcome}
                      onReset={() => {
                        setArxivInput("");
                        setArxivOutcome(null);
                      }}
                    />
                  )}

                  {arxivOutcome && !arxivOutcome.ok && (
                    <div role="alert" className="drop-in rounded-lg border border-signal-500/40 bg-signal-300/10 p-5">
                      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-signal-300">
                        <IconAlert size={13} /> Import failed
                      </p>
                      <p className="mt-2 text-[13px] leading-relaxed text-signal-200">{arxivOutcome.error}</p>
                      <button
                        type="button"
                        onClick={() => setArxivOutcome(null)}
                        className="mt-4 rounded-full border border-signal-400/50 px-5 py-2.5 font-display text-[13px] font-semibold text-signal-300 transition-all hover:bg-signal-400 hover:text-ink-950"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-paper/10 px-6 py-3.5">
              <p className="font-mono text-[10px] tracking-wide text-paper/40">
                intake + extraction live — concept analysis &amp; graphs arrive with the Phase 6 engine
              </p>
              <p className="font-mono text-[10px] tracking-wide text-pulse-300/70">jobs persist across refreshes</p>
            </div>
          </div>
        </Reveal>

        {/* ============ side column ============ */}
        <div className="space-y-6">
          <Reveal delay={120}>
            <PipelineQueue />
          </Reveal>
          <Reveal delay={200}>
            <IntakeFacts />
          </Reveal>
        </div>
      </div>

      <PipelineStrip />
    </div>
  );
}

function PanelHeadDark() {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-pulse-300">Synapse · intake &amp; extraction</p>
      <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-paper">Feed the pipeline.</h2>
    </div>
  );
}
