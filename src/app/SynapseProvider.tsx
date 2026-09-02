import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "../auth/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import type { RetentionPolicy } from "../auth/authTypes";
import {
  ANALYSIS_STATUSES,
  IN_FLIGHT_STATUSES,
  INTAKE_CONFIG,
  fetchArxivMeta,
  friendlyStorageError,
  isAnalyzable,
  isIncomplete,
  isProcessable,
  makeJobId,
  makeObjectPath,
  parseArxivInput,
  validatePdfFile,
  type ArxivParse,
  type JobStatus,
  type PaperJob,
} from "./synapseCore";
import {
  classifyPipelineError,
  processPdfBytes,
  type DocumentChunkOut,
  type NormalizedDoc,
  type PipelineEvent,
  type PipelineResult,
} from "./pipeline";
import { analyzePaper } from "./analysisPipeline";
import { getProvider, type AnalysisStage, type AiUsage } from "./aiProviders";
import type { PaperAnalysis } from "./analysisSchemas";
import { hasSubstance } from "./analysisSchemas";
import type { KnowledgeGraphData } from "./graphModel";
import { extractArchitecture, type PaperArchitecture } from "./architectureModel";

/* ================= shared data shapes ================= */

export type UploadProgress = {
  phase: "upload" | "store";
  pct: number | null;
  loaded: number;
  total: number;
};

export type DocumentSummary = {
  job_id: string;
  title: string;
  authors: string[];
  page_count: number;
  word_count: number;
  char_count: number;
  chunk_count: number;
  section_count: number;
  two_column_pages: number;
  created_at: string;
};

export type DocumentDetail = {
  doc: NormalizedDoc;
  chunks: DocumentChunkOut[];
};

export type JobProgress = PipelineEvent & { error?: string };

export type SubmitOutcome =
  | { ok: true; job: PaperJob; existing?: boolean; parse?: Extract<ArxivParse, { ok: true }> }
  | { ok: false; error: string };

type SynapseValue = {
  mode: "supabase" | "demo";
  jobs: PaperJob[];
  summaries: Record<string, DocumentSummary>;
  progress: Record<string, JobProgress>;
  /** Current Phase 6 analysis stage per job (only while analyzing). */
  analysisStage: Record<string, AnalysisStage>;
  /** Cached structured analyses keyed by job id. */
  analyses: Record<string, PaperAnalysis>;
  /** Aggregate AI usage across this session's analyses (requests/tokens/cost). */
  usage: AiUsage;
  loadingJobs: boolean;
  submitting: boolean;
  submitPdf: (file: File, onProgress?: (p: UploadProgress) => void) => Promise<SubmitOutcome>;
  submitArxiv: (raw: string) => Promise<SubmitOutcome>;
  processJob: (job: PaperJob) => Promise<void>;
  runAnalysis: (job: PaperJob) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  getDetail: (jobId: string) => Promise<DocumentDetail | null>;
  getAnalysis: (jobId: string) => Promise<PaperAnalysis | null>;
  getGraph: (jobId: string) => Promise<KnowledgeGraphData | null>;
  saveGraph: (jobId: string, graph: KnowledgeGraphData) => Promise<void>;
  refresh: () => Promise<void>;
};

const SynapseContext = createContext<SynapseValue | null>(null);

/* ================= IndexedDB blob store (demo temporary storage) ================= */

const IDB_NAME = "bn-demo-intake";
const IDB_STORE = "files";
const memoryFallback = new Map<string, Blob>();

function idbOpen(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(id: string, blob: Blob): Promise<void> {
  const db = await idbOpen();
  if (!db) {
    memoryFallback.set(id, blob);
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

async function idbGet(id: string): Promise<Blob | null> {
  if (memoryFallback.has(id)) return memoryFallback.get(id) ?? null;
  const db = await idbOpen();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbDelete(id: string): Promise<void> {
  memoryFallback.delete(id);
  const db = await idbOpen();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

/* demo document store (extracted results) */
const DOCS_KEY = "bn_demo_docs_v1";
type StoredDoc = { job_id: string; user_id: string; doc: NormalizedDoc; chunks: DocumentChunkOut[]; created_at: string };

function readDocs(): StoredDoc[] {
  try {
    return JSON.parse(localStorage.getItem(DOCS_KEY) ?? "[]") as StoredDoc[];
  } catch {
    return [];
  }
}
function writeDocs(docs: StoredDoc[]): boolean {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
    return true;
  } catch {
    return false;
  }
}

/* demo analysis store (structured research representations) */
const ANALYSES_KEY = "bn_demo_analyses_v1";
type StoredAnalysis = { job_id: string; user_id: string; analysis: PaperAnalysis; usage: AiUsage; created_at: string };

function readAnalyses(): StoredAnalysis[] {
  try {
    return JSON.parse(localStorage.getItem(ANALYSES_KEY) ?? "[]") as StoredAnalysis[];
  } catch {
    return [];
  }
}
function writeAnalyses(items: StoredAnalysis[]): void {
  try {
    localStorage.setItem(ANALYSES_KEY, JSON.stringify(items));
  } catch {
    /* quota exceeded — analysis stays in memory for this session */
  }
}

/* demo knowledge-graph store (kept separate from raw analyses) */
const GRAPHS_KEY = "bn_demo_graphs_v1";
type StoredGraph = { job_id: string; user_id: string; graph: KnowledgeGraphData; created_at: string };

function readGraphs(): StoredGraph[] {
  try {
    return JSON.parse(localStorage.getItem(GRAPHS_KEY) ?? "[]") as StoredGraph[];
  } catch {
    return [];
  }
}
function writeGraphs(items: StoredGraph[]): void {
  try {
    localStorage.setItem(GRAPHS_KEY, JSON.stringify(items));
  } catch {
    /* quota exceeded — graph regenerates on demand */
  }
}

/* demo paper-architecture store (Phase 12) */
const ARCHS_KEY = "bn_demo_archs_v1";
type StoredArch = { job_id: string; user_id: string; arch: PaperArchitecture; created_at: string };

function readArchs(): StoredArch[] {
  try {
    return JSON.parse(localStorage.getItem(ARCHS_KEY) ?? "[]") as StoredArch[];
  } catch {
    return [];
  }
}
function writeArchs(items: StoredArch[]): void {
  try {
    localStorage.setItem(ARCHS_KEY, JSON.stringify(items));
  } catch {
    /* quota exceeded — architecture re-derives on demand */
  }
}

/* ================= adapter contract ================= */

interface SynapseAdapter {
  listJobs(userId: string): Promise<PaperJob[]>;
  createPdfJob(userId: string, file: File, onProgress: (p: UploadProgress) => void): Promise<PaperJob>;
  createArxivJob(userId: string, parse: Extract<ArxivParse, { ok: true }>, meta: { title: string; authors: string[] } | null): Promise<PaperJob>;
  deleteJob(userId: string, jobId: string): Promise<void>;
  setJobStatus(userId: string, jobId: string, status: JobStatus, errorMessage?: string | null): Promise<void>;
  /** Resolves the source document bytes (demo: local blob · supabase: signed URL fetch). */
  acquirePdfBytes(job: PaperJob): Promise<Uint8Array>;
  /** Attempts the server-side pipeline (Edge Function). `handled:false` → run the client pipeline. */
  runServerPipeline(userId: string, jobId: string): Promise<{ handled: boolean; detail?: string }>;
  /**
   * Persists doc + chunks and marks the job ready. Applies the user's
   * retention policy to the original PDF (Phase 15).
   */
  saveResult(userId: string, job: PaperJob, result: PipelineResult, retention: RetentionPolicy): Promise<void>;
  listSummaries(userId: string): Promise<DocumentSummary[]>;
  getDetail(userId: string, jobId: string): Promise<DocumentDetail | null>;
  /** Persists the structured analysis + usage accounting, marks the job analyzed. */
  saveAnalysis(userId: string, job: PaperJob, analysis: PaperAnalysis, usage: AiUsage): Promise<void>;
  getAnalysis(userId: string, jobId: string): Promise<PaperAnalysis | null>;
  /** Knowledge graph — stored separately from raw AI output (Phase 7). */
  getGraph(userId: string, jobId: string): Promise<KnowledgeGraphData | null>;
  saveGraph(userId: string, job: PaperJob, graph: KnowledgeGraphData): Promise<void>;
  /** Phase 12 — paper architecture detection/extraction result. */
  getArchitecture(userId: string, jobId: string): Promise<PaperArchitecture | null>;
  saveArchitecture(userId: string, job: PaperJob, arch: PaperArchitecture): Promise<void>;
}

/* ================= Supabase adapter ================= */

class SupabaseSynapseAdapter implements SynapseAdapter {
  private client = supabase!;

  async listJobs(userId: string): Promise<PaperJob[]> {
    const { data, error } = await this.client
      .from("paper_jobs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(INTAKE_CONFIG.jobListLimit);
    if (error) throw new Error("Couldn't load your intake queue.");
    return (data as unknown as PaperJob[]) ?? [];
  }

  async createPdfJob(userId: string, file: File, onProgress: (p: UploadProgress) => void): Promise<PaperJob> {
    const { data: row, error: insErr } = await this.client
      .from("paper_jobs")
      .insert({
        user_id: userId,
        source_type: "pdf",
        original_filename: file.name.slice(0, 255),
        file_size: file.size,
        status: "uploaded",
      })
      .select()
      .single();
    if (insErr || !row) throw new Error("Couldn't create the intake job. Try again.");
    const job = row as unknown as PaperJob;

    const objectPath = makeObjectPath(userId, file.name);
    try {
      await this.uploadWithProgress(objectPath, file, onProgress);
    } catch (err) {
      await this.client
        .from("paper_jobs")
        .update({ status: "failed", error_message: friendlyStorageError(err) })
        .eq("id", job.id)
        .eq("user_id", userId);
      throw err;
    }

    const { data: updated, error: upErr } = await this.client
      .from("paper_jobs")
      .update({ status: "queued", temporary_file_path: objectPath })
      .eq("id", job.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (upErr || !updated) throw new Error("The file uploaded, but the job couldn't be queued. Refresh to sync.");
    return updated as unknown as PaperJob;
  }

  private async uploadWithProgress(objectPath: string, file: File, onProgress: (p: UploadProgress) => void): Promise<void> {
    const { data: signed, error } = await this.client.storage
      .from(INTAKE_CONFIG.bucket)
      .createSignedUploadUrl(objectPath);

    if (!error && signed?.signedUrl) {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", signed.signedUrl);
        xhr.setRequestHeader("x-upsert", "false");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress({
              phase: "upload",
              pct: Math.min(100, Math.round((e.loaded / e.total) * 100)),
              loaded: e.loaded,
              total: e.total,
            });
          }
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
        xhr.onerror = () => reject(new Error("Network error during the upload."));
        xhr.send(file);
      });
      return;
    }

    onProgress({ phase: "upload", pct: null, loaded: 0, total: file.size });
    const { error: upErr } = await this.client.storage
      .from(INTAKE_CONFIG.bucket)
      .upload(objectPath, file, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(friendlyStorageError(upErr));
  }

  async createArxivJob(
    userId: string,
    parse: Extract<ArxivParse, { ok: true }>,
    meta: { title: string; authors: string[] } | null,
  ): Promise<PaperJob> {
    const { data, error } = await this.client
      .from("paper_jobs")
      .insert({
        user_id: userId,
        source_type: "arxiv",
        paper_url: parse.canonicalUrl,
        arxiv_id: parse.id,
        original_filename: meta?.title ? meta.title.slice(0, 255) : null,
        status: "queued",
      })
      .select()
      .single();
    if (error) {
      if (String(error.message).toLowerCase().includes("duplicate") || error.code === "23505") {
        throw new Error("ALREADY_EXISTS");
      }
      throw new Error("Couldn't create the import job. Try again.");
    }
    return data as unknown as PaperJob;
  }

  async deleteJob(userId: string, jobId: string): Promise<void> {
    const { data: row } = await this.client
      .from("paper_jobs")
      .select("temporary_file_path")
      .eq("id", jobId)
      .eq("user_id", userId)
      .maybeSingle();
    const path = (row as { temporary_file_path?: string | null } | null)?.temporary_file_path;
    if (path) {
      await this.client.storage.from(INTAKE_CONFIG.bucket).remove([path]).catch(() => undefined);
    }
    const { error } = await this.client.from("paper_jobs").delete().eq("id", jobId).eq("user_id", userId);
    if (error) throw new Error("Couldn't remove the job.");
  }

  async setJobStatus(userId: string, jobId: string, status: JobStatus, errorMessage: string | null = null): Promise<void> {
    await this.client
      .from("paper_jobs")
      .update({ status, error_message: errorMessage })
      .eq("id", jobId)
      .eq("user_id", userId);
  }

  async acquirePdfBytes(job: PaperJob): Promise<Uint8Array> {
    if (job.source_type === "arxiv" && job.arxiv_id) {
      const res = await fetch(`https://arxiv.org/pdf/${job.arxiv_id}`);
      if (!res.ok) throw new Error("Failed to retrieve the PDF from arXiv. You can download it there and upload it instead.");
      return new Uint8Array(await res.arrayBuffer());
    }
    if (!job.temporary_file_path) {
      throw new Error("The temporary file is missing — it may have been purged. Delete this job and re-upload the paper.");
    }
    const { data: signed, error } = await this.client.storage
      .from(INTAKE_CONFIG.bucket)
      .createSignedUrl(job.temporary_file_path, 300);
    if (error || !signed?.signedUrl) {
      throw new Error("Couldn't open the stored file. Delete this job and re-upload the paper.");
    }
    const res = await fetch(signed.signedUrl);
    if (!res.ok) throw new Error("Couldn't download the stored file. Try again.");
    return new Uint8Array(await res.arrayBuffer());
  }

  async runServerPipeline(userId: string, jobId: string): Promise<{ handled: boolean; detail?: string }> {
    try {
      const { data, error } = await this.client.functions.invoke("extract-paper", {
        body: { job_id: jobId },
      });
      if (!error && data && (data as { ok?: boolean }).ok) {
        return { handled: true, detail: (data as { detail?: string }).detail };
      }
      return { handled: false };
    } catch {
      // function not deployed (or relay error) — the client pipeline takes over
      return { handled: false };
    }
  }

  async saveResult(userId: string, job: PaperJob, result: PipelineResult, retention: RetentionPolicy): Promise<void> {
    const { doc, chunks } = result;

    const { data: docRow, error: docErr } = await this.client
      .from("extracted_documents")
      .insert({
        job_id: job.id,
        user_id: userId,
        title: doc.title,
        authors: doc.authors,
        abstract: doc.abstract,
        page_count: doc.pageCount,
        word_count: doc.wordCount,
        char_count: doc.charCount,
        sections: doc.sections.map((s) => ({
          heading: s.heading,
          page: s.page,
          order: s.order,
          paragraphs: s.paragraphs,
          is_references: s.isReferences,
        })),
        captions: doc.captions,
        stats: {
          two_column_pages: doc.twoColumnPages,
          removed_headers_footers: doc.removedHeadersFooters,
          removed_page_numbers: doc.removedPageNumbers,
          raw_segment_count: doc.rawSegmentCount,
          truncated: doc.truncated,
          references_count: doc.references.length,
        },
      })
      .select()
      .single();
    if (docErr || !docRow) throw new Error("Couldn't store the extracted document.");
    const docId = (docRow as { id: string }).id;

    if (chunks.length > 0) {
      const { error: chunkErr } = await this.client.from("document_chunks").insert(
        chunks.map((c) => ({
          document_id: docId,
          user_id: userId,
          order_index: c.order_index,
          section: c.section,
          kind: c.kind,
          page_start: c.page_start,
          page_end: c.page_end,
          text: c.text,
          char_count: c.char_count,
        })),
      );
      if (chunkErr) throw new Error("Couldn't store the document chunks.");
    }

    // Retention policy (Phase 15): structured data is always kept; the
    // original PDF is deleted only when the user's policy says so.
    const purge = retention === "purge_after_processing";
    if (purge && job.temporary_file_path) {
      await this.client.storage.from(INTAKE_CONFIG.bucket).remove([job.temporary_file_path]).catch(() => undefined);
    }
    const { error: jobErr } = await this.client
      .from("paper_jobs")
      .update({
        status: "ready_for_analysis",
        document_id: docId,
        // keep the path when retaining so the original stays re-attachable
        temporary_file_path: purge ? null : job.temporary_file_path,
        source_purged: job.source_type === "pdf" && purge,
        error_message: null,
      })
      .eq("id", job.id)
      .eq("user_id", userId);
    if (jobErr) throw new Error("Extraction finished, but the job status couldn't be saved. Refresh to sync.");
  }

  async listSummaries(userId: string): Promise<DocumentSummary[]> {
    const { data, error } = await this.client
      .from("extracted_documents")
      .select("job_id, title, authors, page_count, word_count, char_count, sections, stats, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(INTAKE_CONFIG.jobListLimit);
    if (error) return [];
    return ((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
      job_id: String(r.job_id),
      title: String(r.title ?? ""),
      authors: (r.authors as string[]) ?? [],
      page_count: Number(r.page_count ?? 0),
      word_count: Number(r.word_count ?? 0),
      char_count: Number(r.char_count ?? 0),
      chunk_count: Number((r.stats as { chunk_count?: number })?.chunk_count ?? 0),
      section_count: Array.isArray(r.sections) ? (r.sections as unknown[]).length : 0,
      two_column_pages: Number((r.stats as { two_column_pages?: number })?.two_column_pages ?? 0),
      created_at: String(r.created_at),
    }));
  }

  async getDetail(userId: string, jobId: string): Promise<DocumentDetail | null> {
    const { data: docRow } = await this.client
      .from("extracted_documents")
      .select("*")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .maybeSingle();
    if (!docRow) return null;
    const d = docRow as unknown as Record<string, unknown>;
    const { data: chunkRows } = await this.client
      .from("document_chunks")
      .select("order_index, section, kind, page_start, page_end, text, char_count")
      .eq("user_id", userId)
      .eq("document_id", String(d.id))
      .order("order_index", { ascending: true });

    const sections = ((d.sections as Record<string, unknown>[]) ?? []).map((s, i) => ({
      heading: String(s.heading ?? ""),
      page: Number(s.page ?? 1),
      order: Number(s.order ?? i + 1),
      paragraphs: (s.paragraphs as string[]) ?? [],
      isReferences: Boolean(s.is_references),
    }));
    const stats = (d.stats as Record<string, unknown>) ?? {};
    const doc: NormalizedDoc = {
      title: String(d.title ?? ""),
      authors: (d.authors as string[]) ?? [],
      abstract: String(d.abstract ?? ""),
      sections,
      captions: (d.captions as NormalizedDoc["captions"]) ?? [],
      references: sections.find((s) => s.isReferences)?.paragraphs ?? [],
      pageCount: Number(d.page_count ?? 0),
      wordCount: Number(d.word_count ?? 0),
      charCount: Number(d.char_count ?? 0),
      twoColumnPages: Number(stats.two_column_pages ?? 0),
      removedHeadersFooters: Number(stats.removed_headers_footers ?? 0),
      removedPageNumbers: Number(stats.removed_page_numbers ?? 0),
      truncated: Boolean(stats.truncated),
      rawSegmentCount: Number(stats.raw_segment_count ?? 0),
    };
    const chunks: DocumentChunkOut[] = ((chunkRows as unknown as Record<string, unknown>[]) ?? []).map((c) => ({
      chunk_id: `${String(d.id).slice(0, 8)}-${String(c.order_index).padStart(3, "0")}`,
      order_index: Number(c.order_index ?? 0),
      section: String(c.section ?? ""),
      kind: (c.kind as DocumentChunkOut["kind"]) ?? "body",
      page_start: Number(c.page_start ?? 1),
      page_end: Number(c.page_end ?? 1),
      text: String(c.text ?? ""),
      char_count: Number(c.char_count ?? 0),
      token_estimate: Math.max(1, Math.round(Number(c.char_count ?? 0) / 4)),
    }));
    return { doc, chunks };
  }

  async saveAnalysis(userId: string, job: PaperJob, analysis: PaperAnalysis, usage: AiUsage): Promise<void> {
    const { data: docRow } = await this.client
      .from("extracted_documents")
      .select("id")
      .eq("user_id", userId)
      .eq("job_id", job.id)
      .maybeSingle();

    const { error: insErr } = await this.client.from("research_analyses").upsert(
      {
        job_id: job.id,
        user_id: userId,
        document_id: docRow ? String((docRow as Record<string, unknown>).id) : null,
        research_question: analysis.research_question,
        main_problem: analysis.main_problem,
        conclusion: analysis.conclusion,
        concepts: analysis.concepts,
        claims: analysis.claims,
        methods: analysis.methods,
        results: analysis.results,
        datasets: analysis.datasets,
        experiments: analysis.experiments,
        limitations: analysis.limitations,
        relationships: analysis.relationships,
        dropped_unsupported: analysis.dropped_unsupported,
      },
      { onConflict: "job_id" },
    );
    if (insErr) throw new Error("Couldn't save the analysis. Try again.");

    // usage accounting (best effort)
    await this.client.from("ai_usage_log").insert({
      user_id: userId,
      job_id: job.id,
      provider: usage.provider,
      model: usage.model,
      requests: usage.requests,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      cost_usd: usage.cost_usd,
      failure: false,
    });

    await this.client.from("paper_jobs").update({ status: "analyzed" }).eq("id", job.id).eq("user_id", userId);
  }

  async getAnalysis(userId: string, jobId: string): Promise<PaperAnalysis | null> {
    const { data, error } = await this.client
      .from("research_analyses")
      .select("*")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as unknown as Record<string, unknown>;
    return {
      research_question: (r.research_question as string | null) ?? null,
      main_problem: (r.main_problem as string | null) ?? null,
      conclusion: (r.conclusion as string | null) ?? null,
      concepts: (r.concepts as PaperAnalysis["concepts"]) ?? [],
      claims: (r.claims as PaperAnalysis["claims"]) ?? [],
      methods: (r.methods as PaperAnalysis["methods"]) ?? [],
      results: (r.results as PaperAnalysis["results"]) ?? [],
      datasets: (r.datasets as PaperAnalysis["datasets"]) ?? [],
      experiments: (r.experiments as PaperAnalysis["experiments"]) ?? [],
      limitations: (r.limitations as PaperAnalysis["limitations"]) ?? [],
      relationships: (r.relationships as PaperAnalysis["relationships"]) ?? [],
      dropped_unsupported: Number(r.dropped_unsupported ?? 0),
    };
  }

  async getGraph(userId: string, jobId: string): Promise<KnowledgeGraphData | null> {
    const { data, error } = await this.client
      .from("knowledge_graphs")
      .select("job_id, paper_title, nodes, edges, stats, generated_at")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as unknown as Record<string, unknown>;
    return {
      job_id: String(r.job_id),
      paper_title: String(r.paper_title ?? ""),
      nodes: (r.nodes as KnowledgeGraphData["nodes"]) ?? [],
      edges: (r.edges as KnowledgeGraphData["edges"]) ?? [],
      stats: (r.stats as KnowledgeGraphData["stats"]) ?? ({} as KnowledgeGraphData["stats"]),
      generated_at: String(r.generated_at ?? new Date().toISOString()),
    };
  }

  async saveGraph(userId: string, job: PaperJob, graph: KnowledgeGraphData): Promise<void> {
    await this.client.from("knowledge_graphs").upsert(
      {
        user_id: userId,
        job_id: job.id,
        paper_title: graph.paper_title,
        nodes: graph.nodes,
        edges: graph.edges,
        stats: graph.stats,
        generated_at: graph.generated_at,
      },
      { onConflict: "job_id" },
    );
  }

  async getArchitecture(userId: string, jobId: string): Promise<PaperArchitecture | null> {
    const { data, error } = await this.client
      .from("paper_architectures")
      .select("*")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as unknown as Record<string, unknown>;
    return {
      ai_relevance: Number(r.ai_relevance ?? 0),
      ai_topics: (r.ai_topics as string[]) ?? [],
      sufficiency: (r.sufficiency as PaperArchitecture["sufficiency"]) ?? "none",
      components: (r.components as PaperArchitecture["components"]) ?? [],
      training: (r.training as PaperArchitecture["training"]) ?? {
        optimizer: null, learningRate: null, epochs: null, batchSize: null, loss: null, evidence: [],
      },
      numeric_hints: (r.numeric_hints as string[]) ?? [],
      summary: String(r.summary ?? ""),
    };
  }

  async saveArchitecture(userId: string, job: PaperJob, arch: PaperArchitecture): Promise<void> {
    await this.client.from("paper_architectures").upsert(
      {
        user_id: userId,
        job_id: job.id,
        ai_relevance: arch.ai_relevance,
        ai_topics: arch.ai_topics,
        sufficiency: arch.sufficiency,
        components: arch.components,
        training: arch.training,
        numeric_hints: arch.numeric_hints,
        summary: arch.summary,
      },
      { onConflict: "job_id" },
    );
  }
}

/* ================= Demo adapter ================= */

const JOBS_KEY = "bn_demo_jobs_v1";
const RATE_KEY = "bn_demo_rate_v1";

function readJobs(): PaperJob[] {
  try {
    return JSON.parse(localStorage.getItem(JOBS_KEY) ?? "[]") as PaperJob[];
  } catch {
    return [];
  }
}
function writeJobs(jobs: PaperJob[]) {
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
}
function patchJob(id: string, patch: Partial<PaperJob>): PaperJob | null {
  const jobs = readJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) return null;
  jobs[idx] = { ...jobs[idx], ...patch, updated_at: new Date().toISOString() };
  writeJobs(jobs);
  return jobs[idx];
}

class DemoSynapseAdapter implements SynapseAdapter {
  private delay(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  async listJobs(userId: string): Promise<PaperJob[]> {
    await this.delay(380);
    return readJobs()
      .filter((j) => j.user_id === userId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, INTAKE_CONFIG.jobListLimit);
  }

  async createPdfJob(userId: string, file: File, onProgress: (p: UploadProgress) => void): Promise<PaperJob> {
    const id = makeJobId();
    const now = new Date().toISOString();
    const job: PaperJob = {
      id,
      user_id: userId,
      source_type: "pdf",
      original_filename: file.name.slice(0, 255),
      paper_url: null,
      arxiv_id: null,
      temporary_file_path: null,
      file_size: file.size,
      status: "uploaded",
      error_message: null,
      created_at: now,
      updated_at: now,
    };
    writeJobs([job, ...readJobs()]);

    const chunkSize = 256 * 1024;
    for (let off = 0; off < Math.max(file.size, 1); off += chunkSize) {
      const end = Math.min(off + chunkSize, file.size);
      if (end > off) file.slice(off, end);
      await this.delay(file.size > 2 * 1024 * 1024 ? 32 : 18);
      onProgress({
        phase: "store",
        pct: Math.min(100, Math.round((end / Math.max(file.size, 1)) * 100)),
        loaded: end,
        total: Math.max(file.size, 1),
      });
    }
    await idbPut(id, file);

    const queued: PaperJob = {
      ...job,
      status: "queued",
      temporary_file_path: `demo://${id}`,
      updated_at: new Date().toISOString(),
    };
    writeJobs([queued, ...readJobs().filter((j) => j.id !== id)]);
    return queued;
  }

  async createArxivJob(
    userId: string,
    parse: Extract<ArxivParse, { ok: true }>,
    meta: { title: string; authors: string[] } | null,
  ): Promise<PaperJob> {
    await this.delay(420);
    const existing = readJobs().find((j) => j.user_id === userId && j.arxiv_id === parse.id);
    if (existing) throw new Error("ALREADY_EXISTS");
    const now = new Date().toISOString();
    const job: PaperJob = {
      id: makeJobId(),
      user_id: userId,
      source_type: "arxiv",
      original_filename: meta?.title ? meta.title.slice(0, 255) : null,
      paper_url: parse.canonicalUrl,
      arxiv_id: parse.id,
      temporary_file_path: null,
      file_size: null,
      status: "queued",
      error_message: null,
      created_at: now,
      updated_at: now,
    };
    writeJobs([job, ...readJobs()]);
    return job;
  }

  async deleteJob(userId: string, jobId: string): Promise<void> {
    await this.delay(220);
    writeJobs(readJobs().filter((j) => !(j.id === jobId && j.user_id === userId)));
    await idbDelete(jobId);
    writeDocs(readDocs().filter((d) => d.job_id !== jobId));
    writeAnalyses(readAnalyses().filter((a) => a.job_id !== jobId));
    writeGraphs(readGraphs().filter((g) => g.job_id !== jobId));
  }

  async setJobStatus(_userId: string, jobId: string, status: JobStatus, errorMessage: string | null = null): Promise<void> {
    patchJob(jobId, { status, error_message: errorMessage });
  }

  async acquirePdfBytes(job: PaperJob): Promise<Uint8Array> {
    if (job.source_type === "arxiv" && job.arxiv_id) {
      const res = await fetch(`https://arxiv.org/pdf/${job.arxiv_id}`);
      if (!res.ok) {
        throw new Error("Failed to retrieve the PDF from arXiv. You can download it there and upload it instead.");
      }
      return new Uint8Array(await res.arrayBuffer());
    }
    const blob = await idbGet(job.id);
    if (!blob) {
      throw new Error("The temporary file was already purged. Delete this job and re-upload the paper.");
    }
    return new Uint8Array(await blob.arrayBuffer());
  }

  async runServerPipeline(): Promise<{ handled: boolean }> {
    return { handled: false }; // demo always runs the in-browser pipeline
  }

  async saveResult(userId: string, job: PaperJob, result: PipelineResult, retention: RetentionPolicy): Promise<void> {
    await this.delay(240);
    const stored: StoredDoc = {
      job_id: job.id,
      user_id: userId,
      doc: result.doc,
      chunks: result.chunks,
      created_at: new Date().toISOString(),
    };
    const ok = writeDocs([stored, ...readDocs().filter((d) => d.job_id !== job.id)]);
    // Retention policy (Phase 15): keep structure always; drop the original
    // PDF only when the user's policy says to purge after processing.
    const purge = retention === "purge_after_processing";
    if (purge && job.source_type === "pdf") await idbDelete(job.id);
    patchJob(job.id, {
      status: "ready_for_analysis",
      temporary_file_path: purge ? null : job.temporary_file_path,
      error_message: null,
      ...(ok ? {} : { error_message: null }),
    });
    if (!ok) {
      // extraction succeeded; only the demo detail store hit a quota limit
      patchJob(job.id, { status: "ready_for_analysis" });
    }
  }

  async listSummaries(userId: string): Promise<DocumentSummary[]> {
    return readDocs()
      .filter((d) => d.user_id === userId)
      .map((d) => ({
        job_id: d.job_id,
        title: d.doc.title,
        authors: d.doc.authors,
        page_count: d.doc.pageCount,
        word_count: d.doc.wordCount,
        char_count: d.doc.charCount,
        chunk_count: d.chunks.length,
        section_count: d.doc.sections.length,
        two_column_pages: d.doc.twoColumnPages,
        created_at: d.created_at,
      }));
  }

  async getDetail(userId: string, jobId: string): Promise<DocumentDetail | null> {
    const stored = readDocs().find((d) => d.job_id === jobId && d.user_id === userId);
    return stored ? { doc: stored.doc, chunks: stored.chunks } : null;
  }

  async saveAnalysis(userId: string, job: PaperJob, analysis: PaperAnalysis, usage: AiUsage): Promise<void> {
    await this.delay(260);
    const stored: StoredAnalysis = {
      job_id: job.id,
      user_id: userId,
      analysis,
      usage,
      created_at: new Date().toISOString(),
    };
    writeAnalyses([stored, ...readAnalyses().filter((a) => a.job_id !== job.id)]);
    patchJob(job.id, { status: "analyzed", error_message: null });
  }

  async getAnalysis(userId: string, jobId: string): Promise<PaperAnalysis | null> {
    const stored = readAnalyses().find((a) => a.job_id === jobId && a.user_id === userId);
    return stored ? stored.analysis : null;
  }

  async getGraph(userId: string, jobId: string): Promise<KnowledgeGraphData | null> {
    const stored = readGraphs().find((g) => g.job_id === jobId && g.user_id === userId);
    return stored ? stored.graph : null;
  }

  async saveGraph(userId: string, job: PaperJob, graph: KnowledgeGraphData): Promise<void> {
    await this.delay(180);
    const stored: StoredGraph = { job_id: job.id, user_id: userId, graph, created_at: new Date().toISOString() };
    writeGraphs([stored, ...readGraphs().filter((g) => g.job_id !== job.id)]);
  }

  async getArchitecture(userId: string, jobId: string): Promise<PaperArchitecture | null> {
    const stored = readArchs().find((a) => a.job_id === jobId && a.user_id === userId);
    return stored ? stored.arch : null;
  }

  async saveArchitecture(userId: string, job: PaperJob, arch: PaperArchitecture): Promise<void> {
    await this.delay(120);
    const stored: StoredArch = { job_id: job.id, user_id: userId, arch, created_at: new Date().toISOString() };
    writeArchs([stored, ...readArchs().filter((a) => a.job_id !== job.id)]);
  }
}

/* ================= provider ================= */

export function SynapseProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  // Phase 15: the user's retention preference drives whether the original
  // PDF is purged after extraction. Defaults to the safe "purge" behaviour.
  const retention: RetentionPolicy = profile?.retention_policy ?? "purge_after_processing";
  const adapter = useMemo<SynapseAdapter>(
    () => (isSupabaseConfigured ? new SupabaseSynapseAdapter() : new DemoSynapseAdapter()),
    [],
  );
  const mode: SynapseValue["mode"] = isSupabaseConfigured ? "supabase" : "demo";

  const [jobs, setJobs] = useState<PaperJob[]>([]);
  const [summaries, setSummaries] = useState<Record<string, DocumentSummary>>({});
  const [progress, setProgress] = useState<Record<string, JobProgress>>({});
  const [analysisStage, setAnalysisStage] = useState<Record<string, AnalysisStage>>({});
  const [analyses, setAnalyses] = useState<Record<string, PaperAnalysis>>({});
  const [usage, setUsage] = useState<AiUsage>({
    provider: mode === "supabase" ? "edge-function" : "heuristic-local",
    model: "—",
    requests: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: 0,
    failures: 0,
  });
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const guardRef = useRef(false);
  const processingRef = useRef<Set<string>>(new Set());
  const analyzingRef = useRef<Set<string>>(new Set());
  const detailCache = useRef<Map<string, DocumentDetail | null>>(new Map());
  const analysisCache = useRef<Map<string, PaperAnalysis | null>>(new Map());
  const graphCache = useRef<Map<string, KnowledgeGraphData | null>>(new Map());
  /**
   * Only the very first load of a session should show skeletons. Background
   * refreshes (fired after upload / extraction / analysis) must update the
   * already-rendered queue in place — otherwise the results keep collapsing
   * back to blank skeletons and appear to "not show".
   */
  const hasLoadedOnceRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    if (!hasLoadedOnceRef.current) setLoadingJobs(true);
    try {
      const [rawJobs, sums] = await Promise.all([adapter.listJobs(user.id), adapter.listSummaries(user.id)]);
      // interrupted runs (tab closed mid-pipeline) surface as re-runnable
      setJobs(
        rawJobs.map((j) =>
          IN_FLIGHT_STATUSES.includes(j.status)
            ? { ...j, status: "queued" as JobStatus }
            : ANALYSIS_STATUSES.includes(j.status)
              ? { ...j, status: "ready_for_analysis" as JobStatus }
              : j,
        ),
      );
      setSummaries(Object.fromEntries(sums.map((s) => [s.job_id, s])));
      hasLoadedOnceRef.current = true;
    } catch {
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }, [adapter, user]);

  useEffect(() => {
    setJobs([]);
    setSummaries({});
    setProgress({});
    detailCache.current.clear();
    hasLoadedOnceRef.current = false; // a different user is a fresh session
    if (user) void refresh();
  }, [user?.id, refresh, user]);

  /* ---------- rate limiting (client politeness guard; documented) ---------- */
  const checkRateLimit = useCallback((): string | null => {
    try {
      const stamps: number[] = JSON.parse(localStorage.getItem(RATE_KEY) ?? "[]");
      const now = Date.now();
      const recent = stamps.filter((t) => now - t < 3_600_000);
      if (recent.length >= INTAKE_CONFIG.hourlyCap) {
        return `Intake rate limit reached (${INTAKE_CONFIG.hourlyCap} jobs/hour). Wait a little and try again.`;
      }
      if (recent.length > 0 && now - recent[recent.length - 1] < INTAKE_CONFIG.cooldownMs) {
        return "One moment — submissions are spaced a few seconds apart to keep intake healthy.";
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const recordSubmission = useCallback(() => {
    try {
      const stamps: number[] = JSON.parse(localStorage.getItem(RATE_KEY) ?? "[]");
      const now = Date.now();
      localStorage.setItem(
        RATE_KEY,
        JSON.stringify([...stamps.filter((t) => now - t < 3_600_000), now].slice(-INTAKE_CONFIG.hourlyCap * 2)),
      );
    } catch {
      /* non-fatal */
    }
  }, []);

  /* ---------- the Phase 6 analysis pipeline ---------- */
  const runAnalysis = useCallback(
    async (job: PaperJob) => {
      if (!user) return;
      if (analyzingRef.current.has(job.id)) return;
      if (!isAnalyzable(job.status)) return;

      analyzingRef.current.add(job.id);
      const setStage = (s: AnalysisStage) => setAnalysisStage((prev) => ({ ...prev, [job.id]: s }));

      try {
        const detail = await adapter.getDetail(user.id, job.id);
        if (!detail) throw new Error("Couldn't load the extracted document to analyze. Re-run extraction first.");

        const provider = getProvider(mode);
        const { analysis, usage: u } = await analyzePaper(
          { jobId: job.id, doc: detail.doc, chunks: detail.chunks },
          provider,
          (e) => {
            if (e.stage === "done" || e.stage === "failed") return;
            setStage(e.stage);
            void adapter.setJobStatus(user.id, job.id, e.stage).catch(() => undefined);
          },
        );

        if (!hasSubstance(analysis)) {
          throw new Error("Couldn't find enough evidence-backed structure in this paper to build a representation.");
        }

        await adapter.saveAnalysis(user.id, job, analysis, u);
        analysisCache.current.set(job.id, analysis);
        setAnalyses((prev) => ({ ...prev, [job.id]: analysis }));
        setUsage((prev) => ({
          provider: u.provider || prev.provider,
          model: u.model || prev.model,
          requests: prev.requests + u.requests,
          prompt_tokens: prev.prompt_tokens + u.prompt_tokens,
          completion_tokens: prev.completion_tokens + u.completion_tokens,
          cost_usd: Math.round((prev.cost_usd + u.cost_usd) * 10000) / 10000,
          failures: prev.failures + u.failures,
        }));
        setStage("done");
        await refresh();
      } catch (err) {
        const friendly = err instanceof Error ? err.message : "Analysis failed. Try again.";
        await adapter.setJobStatus(user.id, job.id, "failed", friendly).catch(() => undefined);
        setStage("failed");
        setUsage((prev) => ({ ...prev, failures: prev.failures + 1 }));
        await refresh();
      } finally {
        analyzingRef.current.delete(job.id);
      }
    },
    [adapter, user, mode, refresh],
  );

  /* ---------- the Phase 5 pipeline ---------- */
  const processJob = useCallback(
    async (job: PaperJob) => {
      if (!user) return;
      if (processingRef.current.has(job.id)) return;
      if (!isProcessable(job.status)) return;

      processingRef.current.add(job.id);
      const setP = (p: JobProgress) => setProgress((prev) => ({ ...prev, [job.id]: p }));

      try {
        setP({ stage: "extracting", page: 0, pageCount: 0, detail: "contacting storage" });
        await adapter.setJobStatus(user.id, job.id, "extracting");

        // 1) server-side pipeline first (Supabase Edge Function), fallback to in-browser
        const server = await adapter.runServerPipeline(user.id, job.id);
        if (server.handled) {
          setP({ stage: "done", detail: server.detail ?? "processed server-side" });
          await refresh();
          return;
        }

        // 2) acquire the document bytes
        const bytes = await adapter.acquirePdfBytes(job);

        // 3) run extraction → normalization → chunking with live events
        const result = await processPdfBytes(bytes, job.id.slice(0, 8), (e) => {
          if (e.stage === "normalizing") {
            void adapter.setJobStatus(user.id, job.id, "normalizing").catch(() => undefined);
          }
          if (e.stage === "chunking") {
            void adapter.setJobStatus(user.id, job.id, "chunking").catch(() => undefined);
          }
          setP(e);
        });

        // 4) persist results, mark ready, apply the retention policy to the PDF
        await adapter.saveResult(user.id, job, result, retention);
        setP({ stage: "done", detail: `${result.chunks.length} chunks · ${result.doc.wordCount.toLocaleString()} words` });
        detailCache.current.delete(job.id);
        await refresh();

        // 5) flow straight into the Phase 6 analysis pipeline
        void runAnalysis({ ...job, status: "ready_for_analysis" as JobStatus });
      } catch (err) {
        const friendly = classifyPipelineError(err);
        await adapter.setJobStatus(user.id, job.id, "failed", friendly).catch(() => undefined);
        setP({ stage: "failed", error: friendly });
        await refresh();
      } finally {
        processingRef.current.delete(job.id);
      }
    },
    [adapter, user, refresh, runAnalysis, retention],
  );

  /* ---------- intake (Phase 4, now auto-starts the pipeline) ---------- */
  const submitPdf = useCallback<SynapseValue["submitPdf"]>(
    async (file, onProgress) => {
      if (guardRef.current) return { ok: false, error: "One submission at a time — the previous upload is still in flight." };
      if (!user) return { ok: false, error: "Your session has expired. Please log in again." };
      const limited = checkRateLimit();
      if (limited) return { ok: false, error: limited };

      const validation = await validatePdfFile(file);
      if (!validation.ok) return { ok: false, error: validation.reason ?? "That file didn't pass validation." };

      guardRef.current = true;
      setSubmitting(true);
      try {
        const job = await adapter.createPdfJob(user.id, file, onProgress ?? (() => undefined));
        recordSubmission();
        await refresh();
        void processJob(job); // extraction starts immediately — Phase 5
        return { ok: true, job };
      } catch (err) {
        await refresh();
        return { ok: false, error: friendlyStorageError(err) };
      } finally {
        guardRef.current = false;
        setSubmitting(false);
      }
    },
    [adapter, user, checkRateLimit, recordSubmission, refresh, processJob],
  );

  const submitArxiv = useCallback<SynapseValue["submitArxiv"]>(
    async (raw) => {
      if (guardRef.current) return { ok: false, error: "One submission at a time — please wait a moment." };
      if (!user) return { ok: false, error: "Your session has expired. Please log in again." };
      const limited = checkRateLimit();
      if (limited) return { ok: false, error: limited };

      const parse = parseArxivInput(raw);
      if (!parse.ok) return { ok: false, error: parse.reason };

      const dupe = jobs.find((j) => j.arxiv_id === parse.id);
      if (dupe) return { ok: true, job: dupe, existing: true, parse };

      guardRef.current = true;
      setSubmitting(true);
      try {
        const meta = await fetchArxivMeta(parse.id); // metadata first, PDF via the pipeline
        const job = await adapter.createArxivJob(user.id, parse, meta);
        recordSubmission();
        await refresh();
        void processJob(job);
        return { ok: true, job, parse };
      } catch (err) {
        if (err instanceof Error && err.message === "ALREADY_EXISTS") {
          await refresh();
          const existing = jobs.find((j) => j.arxiv_id === parse.id);
          if (existing) return { ok: true, job: existing, existing: true, parse };
          return { ok: false, error: "This paper is already in your intake queue." };
        }
        return { ok: false, error: err instanceof Error ? err.message : "Couldn't create the import job." };
      } finally {
        guardRef.current = false;
        setSubmitting(false);
      }
    },
    [adapter, user, jobs, checkRateLimit, recordSubmission, refresh, processJob],
  );

  const deleteJob = useCallback<SynapseValue["deleteJob"]>(
    async (id) => {
      if (!user) return;
      await adapter.deleteJob(user.id, id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      setSummaries((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setProgress((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setAnalyses((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setAnalysisStage((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      detailCache.current.delete(id);
      analysisCache.current.delete(id);
      graphCache.current.delete(id);
    },
    [adapter, user],
  );

  const getDetail = useCallback<SynapseValue["getDetail"]>(
    async (jobId) => {
      if (!user) return null;
      if (detailCache.current.has(jobId)) return detailCache.current.get(jobId) ?? null;
      const detail = await adapter.getDetail(user.id, jobId).catch(() => null);
      detailCache.current.set(jobId, detail);
      return detail;
    },
    [adapter, user],
  );

  const getAnalysis = useCallback<SynapseValue["getAnalysis"]>(
    async (jobId) => {
      if (!user) return null;
      if (analysisCache.current.has(jobId)) return analysisCache.current.get(jobId) ?? null;
      const analysis = await adapter.getAnalysis(user.id, jobId).catch(() => null);
      analysisCache.current.set(jobId, analysis);
      if (analysis) setAnalyses((prev) => (prev[jobId] ? prev : { ...prev, [jobId]: analysis }));
      return analysis;
    },
    [adapter, user],
  );

  const getGraph = useCallback<SynapseValue["getGraph"]>(
    async (jobId) => {
      if (!user) return null;
      if (graphCache.current.has(jobId)) return graphCache.current.get(jobId) ?? null;
      const graph = await adapter.getGraph(user.id, jobId).catch(() => null);
      graphCache.current.set(jobId, graph);
      return graph;
    },
    [adapter, user],
  );

  const saveGraph = useCallback<SynapseValue["saveGraph"]>(
    async (jobId, graph) => {
      if (!user) return;
      const job = jobs.find((j) => j.id === jobId);
      if (!job) return;
      await adapter.saveGraph(user.id, job, graph);
      graphCache.current.set(jobId, graph);
    },
    [adapter, user, jobs],
  );

  const value = useMemo<SynapseValue>(
    () => ({
      mode,
      jobs,
      summaries,
      progress,
      analysisStage,
      analyses,
      usage,
      loadingJobs,
      submitting,
      submitPdf,
      submitArxiv,
      processJob,
      runAnalysis,
      deleteJob,
      getDetail,
      getAnalysis,
      getGraph,
      saveGraph,
      refresh,
    }),
    [
      mode,
      jobs,
      summaries,
      progress,
      analysisStage,
      analyses,
      usage,
      loadingJobs,
      submitting,
      submitPdf,
      submitArxiv,
      processJob,
      runAnalysis,
      deleteJob,
      getDetail,
      getAnalysis,
      getGraph,
      saveGraph,
      refresh,
    ],
  );

  return <SynapseContext.Provider value={value}>{children}</SynapseContext.Provider>;
}

export function useSynapse(): SynapseValue {
  const ctx = useContext(SynapseContext);
  if (!ctx) throw new Error("useSynapse must be used inside <SynapseProvider>");
  return ctx;
}

export { isIncomplete };
