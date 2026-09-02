/**
 * Synapse intake core — validation, normalization, configuration.
 * Pure functions only; shared by the Supabase adapter, the demo adapter
 * and the UI. Phase 5 (analysis engine) plugs into the same job records.
 */

export type SourceType = "pdf" | "arxiv";
/**
 * uploaded        — file stored, awaiting intake (mid-upload / interrupted)
 * queued          — source available, processing not started (or interrupted mid-run)
 * extracting      — pdf.js reading pages
 * normalizing     — structure detection, noise removal
 * chunking        — splitting into analysis-ready chunks
 * ready_for_analysis — normalized doc + chunks stored, engine (Phase 6) can run
 * processing/completed — legacy statuses kept for compatibility
 * failed          — terminal, retryable
 */
export type JobStatus =
  | "uploaded"
  | "queued"
  | "extracting"
  | "normalizing"
  | "chunking"
  | "ready_for_analysis"
  | "analyzing_concepts"
  | "analyzing_methodology"
  | "extracting_claims"
  | "mapping_evidence"
  | "finalizing"
  | "analyzed"
  | "processing"
  | "completed"
  | "failed";

export const IN_FLIGHT_STATUSES: JobStatus[] = ["extracting", "normalizing", "chunking"];
/** Analysis (Phase 6) stages — each corresponds to a real processing step. */
export const ANALYSIS_STATUSES: JobStatus[] = [
  "analyzing_concepts",
  "analyzing_methodology",
  "extracting_claims",
  "mapping_evidence",
  "finalizing",
];
export const isProcessable = (s: JobStatus): boolean =>
  s === "uploaded" || s === "queued" || s === "failed";
export const isAnalyzable = (s: JobStatus): boolean => s === "ready_for_analysis";
export const isAnalyzing = (s: JobStatus): boolean => ANALYSIS_STATUSES.includes(s);

export type PaperJob = {
  id: string;
  user_id: string;
  source_type: SourceType;
  original_filename: string | null;
  paper_url: string | null;
  arxiv_id: string | null;
  temporary_file_path: string | null;
  file_size: number | null;
  status: JobStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

/* ---------- configuration (tunable in one place) ---------- */

export const INTAKE_CONFIG = {
  /** Hard client-side cap; the storage bucket enforces the same limit server-side. */
  maxPdfBytes: 25 * 1024 * 1024,
  maxPdfMb: 25,
  bucket: "paper-intake",
  allowedExtension: ".pdf",
  allowedMime: "application/pdf",
  /** Minimum pause between submissions (client-side politeness guard). */
  cooldownMs: 5_000,
  /** Rolling cap on intake jobs per hour (client-side; server enforcement via Edge Function later). */
  hourlyCap: 10,
  jobListLimit: 30,
} as const;

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

/* ---------- PDF validation (extension + MIME + size + real header bytes) ---------- */

export type PdfCheck = {
  key: "extension" | "mime" | "size" | "signature";
  label: string;
  ok: boolean;
  detail: string;
};

export type PdfValidation = {
  checks: PdfCheck[];
  ok: boolean;
  reason: string | null;
};

/** Reads the first bytes and requires the PDF signature (%PDF-). */
async function hasPdfSignature(file: File): Promise<boolean> {
  try {
    const head = await file.slice(0, 16).arrayBuffer();
    const text = new TextDecoder("latin1").decode(new Uint8Array(head));
    return text.startsWith("%PDF-");
  } catch {
    return false;
  }
}

export async function validatePdfFile(file: File): Promise<PdfValidation> {
  const name = file.name.toLowerCase();
  const extOk = name.endsWith(INTAKE_CONFIG.allowedExtension);
  // Browsers sometimes send an octet-stream; accept a correct extension as a MIME hint,
  // the header-byte check below is the authoritative content test.
  const mimeOk =
    file.type === INTAKE_CONFIG.allowedMime || (file.type === "" && extOk) || (file.type === "application/octet-stream" && extOk);
  const sizeOk = file.size > 0 && file.size <= INTAKE_CONFIG.maxPdfBytes;
  const sigOk = extOk && sizeOk ? await hasPdfSignature(file) : false;

  const checks: PdfCheck[] = [
    {
      key: "extension",
      label: "Extension",
      ok: extOk,
      detail: extOk ? ".pdf" : name.split(".").pop() ? `.${name.split(".").pop()}` : "none",
    },
    {
      key: "mime",
      label: "File type",
      ok: mimeOk,
      detail: file.type || "unspecified",
    },
    {
      key: "size",
      label: "Size",
      ok: sizeOk,
      detail:
        file.size === 0
          ? "empty file"
          : `${formatBytes(file.size)} · limit ${INTAKE_CONFIG.maxPdfMb} MB`,
    },
    {
      key: "signature",
      label: "Header bytes",
      ok: sigOk,
      detail: sigOk ? "%PDF- signature present" : "%PDF- signature missing",
    },
  ];

  const failed = checks.find((c) => !c.ok);
  let reason: string | null = null;
  if (failed) {
    reason =
      failed.key === "extension"
        ? "Only PDF files are accepted. Convert the document to PDF and try again."
        : failed.key === "mime"
          ? "The file's declared type isn't a PDF. Re-export it as PDF and retry."
          : failed.key === "size"
            ? file.size === 0
              ? "That file is empty — nothing to analyze."
              : `That file is ${formatBytes(file.size)} — the intake limit is ${INTAKE_CONFIG.maxPdfMb} MB so oversized files never reach processing.`
            : "The file doesn't contain a valid PDF header — it may be corrupted or renamed. Re-download or re-export it.";
  }
  return { checks, ok: !failed, reason };
}

/* ---------- arXiv parsing & normalization ---------- */

export type ArxivParse =
  | { ok: true; id: string; version: string | null; canonicalUrl: string; display: string }
  | { ok: false; reason: string };

const ARXIV_ID_RE = /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i;

export function parseArxivInput(raw: string): ArxivParse {
  const input = raw.trim();
  if (!input) return { ok: false, reason: "Paste an arXiv paper link to continue." };

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return {
      ok: false,
      reason: "That doesn't look like a URL. Paste the full link, e.g. https://arxiv.org/abs/2401.04088.",
    };
  }

  const host = url.hostname.toLowerCase().replace(/^(www|export)\./, "");
  if (host !== "arxiv.org") {
    return {
      ok: false,
      reason: "Only arxiv.org links are supported right now — other repositories and publishers arrive later.",
    };
  }

  const m = url.pathname.match(/^\/(abs|pdf)\/(.+?)\/?$/i);
  if (!m) {
    return {
      ok: false,
      reason: "Use an arXiv abstract or PDF link: arxiv.org/abs/… or arxiv.org/pdf/….",
    };
  }

  const displayId = m[2];
  if (!ARXIV_ID_RE.test(displayId)) {
    return {
      ok: false,
      reason: "That arXiv ID doesn't match a known format (e.g. 2401.04088 or hep-th/9901001).",
    };
  }

  const versionMatch = displayId.match(/v(\d+)$/i);
  const id = displayId.replace(/v\d+$/i, "");
  return {
    ok: true,
    id,
    version: versionMatch ? versionMatch[1] : null,
    canonicalUrl: `https://arxiv.org/abs/${id}`,
    display: displayId,
  };
}

/* ---------- storage path safety ---------- */

/** basename only, whitelist characters — path traversal can't survive this. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "paper";
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_").slice(0, 80);
  return clean.replace(/^\.+/, "") || "paper.pdf";
}

function makeUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Unique, user-scoped object path: `{user_id}/{uuid}-{safe-name}`.
 * The user_id segment + storage policies isolate tenants; the uuid makes
 * paths unguessable and collision-free.
 */
export function makeObjectPath(userId: string, filename: string): string {
  return `${userId}/${makeUuid()}-${sanitizeFilename(filename)}`;
}

export function makeJobId(): string {
  return makeUuid();
}

/* ---------- misc ---------- */

/** A row whose upload never finished (e.g. the tab was closed mid-upload). */
export function isIncomplete(job: PaperJob): boolean {
  return job.status === "uploaded" && !job.temporary_file_path;
}

export function friendlyStorageError(err: unknown): string {
  const raw = String((err as { message?: string })?.message ?? "").toLowerCase();
  if (raw.includes("network") || raw.includes("fetch") || raw.includes("failed to fetch")) {
    return "Network trouble during the upload. The job was marked failed — try again when you're back online.";
  }
  if (raw.includes("size") || raw.includes("too large") || raw.includes("payload")) {
    return "The file exceeded the storage limit. Larger files never reach processing — trim the PDF and retry.";
  }
  if (raw.includes("mime") || raw.includes("type")) {
    return "The storage service rejected the file type. Only genuine PDFs are accepted.";
  }
  if (raw.includes("rate") || raw.includes("too many")) {
    return "Too many uploads in a short window. Wait a minute and try again.";
  }
  return err instanceof Error && err.message
    ? err.message
    : "The upload couldn't be completed. Nothing was charged to your usage — try again.";
}

/* ---------- arXiv metadata (public API, CORS-enabled) ---------- */

export type ArxivMeta = { title: string; authors: string[] } | null;

/**
 * Retrieves paper metadata from the public arXiv Atom API.
 * Best-effort: any failure yields null and the pipeline continues —
 * the PDF itself remains the source of truth for extraction.
 */
export async function fetchArxivMeta(arxivId: string): Promise<ArxivMeta> {
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/atom+xml" },
    });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const xmlText = await res.text();
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    const entry = xml.querySelector("entry");
    if (!entry) return null;
    if (entry.querySelector("id")?.textContent?.includes("api/errors")) return null;
    const title = (entry.querySelector("title")?.textContent ?? "").replace(/\s+/g, " ").trim();
    const authors = Array.from(entry.querySelectorAll("author name"))
      .map((n) => n.textContent?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 24);
    return title ? { title, authors } : null;
  } catch {
    return null;
  }
}

/* ---------- status meta for the UI ---------- */

export const STATUS_META: Record<JobStatus, { label: string; tone: "idle" | "live" | "done" | "err" }> = {
  uploaded: { label: "incomplete upload", tone: "idle" },
  queued: { label: "queued", tone: "idle" },
  extracting: { label: "extracting", tone: "live" },
  normalizing: { label: "normalizing", tone: "live" },
  chunking: { label: "chunking", tone: "live" },
  ready_for_analysis: { label: "ready for analysis", tone: "idle" },
  analyzing_concepts: { label: "analyzing concepts", tone: "live" },
  analyzing_methodology: { label: "analyzing methodology", tone: "live" },
  extracting_claims: { label: "extracting claims", tone: "live" },
  mapping_evidence: { label: "mapping evidence", tone: "live" },
  finalizing: { label: "finalizing structure", tone: "live" },
  analyzed: { label: "analyzed", tone: "done" },
  processing: { label: "processing", tone: "live" },
  completed: { label: "completed", tone: "done" },
  failed: { label: "failed", tone: "err" },
};
