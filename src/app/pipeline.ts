/**
 * Phase 5 — document processing pipeline.
 *
 *   PDF/arXiv bytes → extract (pdf.js) → normalize → chunk → ready_for_analysis
 *
 * Pure TypeScript, no UI. Used by the in-browser demo pipeline and by the
 * client-side fallback of the Supabase adapter. The Supabase Edge Function
 * `extract-paper` mirrors this logic server-side (see supabase/functions/).
 *
 * Nothing here invents content: every normalized element traces back to a
 * raw segment with page + order, and raw extraction is kept separate from
 * normalized output.
 */

import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/* ================= configuration ================= */

export const PIPELINE_CONFIG = {
  /** Pages beyond this are skipped (pathological-document guard). */
  maxPages: 120,
  /** Target chunk size in characters (split at paragraph boundaries). */
  chunkTarget: 1400,
  /** A paragraph longer than this is split at sentence boundaries. */
  chunkMax: 2400,
  /** Characters of overlap carried between consecutive chunks. */
  chunkOverlap: 160,
  /** Rough tokens estimate divisor. */
  charsPerToken: 4,
} as const;

/* ================= types ================= */

export type PipelineStage = "extracting" | "normalizing" | "chunking" | "done" | "failed";

export type PipelineEvent = {
  stage: PipelineStage;
  /** extraction progress */
  page?: number;
  pageCount?: number;
  detail?: string;
};

export type RawSegment = {
  page: number; // 1-based
  order: number; // global reading order
  text: string;
  x: number;
  yTop: number;
  fontSize: number;
  eol: boolean;
};

export type RawPage = {
  page: number;
  width: number;
  height: number;
  segments: RawSegment[];
  twoColumn: boolean;
};

export type RawExtraction = {
  pages: RawPage[];
  totalPagesInFile: number;
  truncated: boolean;
  metadataTitle: string | null;
  metadataAuthor: string | null;
};

export type NormalizedSection = {
  heading: string;
  page: number;
  order: number;
  paragraphs: string[];
  isReferences: boolean;
};

export type CaptionRef = { text: string; page: number; kind: "figure" | "table" };

export type NormalizedDoc = {
  title: string;
  authors: string[];
  abstract: string;
  sections: NormalizedSection[];
  captions: CaptionRef[];
  references: string[];
  pageCount: number;
  wordCount: number;
  charCount: number;
  twoColumnPages: number;
  removedHeadersFooters: number;
  removedPageNumbers: number;
  truncated: boolean;
  rawSegmentCount: number;
};

export type DocumentChunkOut = {
  chunk_id: string;
  order_index: number;
  section: string;
  kind: "front" | "body" | "references";
  page_start: number;
  page_end: number;
  text: string;
  char_count: number;
  token_estimate: number;
};

export type PipelineResult = {
  doc: NormalizedDoc;
  chunks: DocumentChunkOut[];
};

/* ================= pdf.js loading (lazy, worker-backed) ================= */

type PdfJsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJsModule> | null = null;

function getPdfjs(): Promise<PdfJsModule> {
  pdfjsPromise ??= import("pdfjs-dist").then((mod) => {
    mod.GlobalWorkerOptions.workerSrc = workerUrl;
    return mod;
  });
  return pdfjsPromise;
}

/* ================= error classification (friendly, no raw internals) ================= */

export function classifyPipelineError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  if (name === "PasswordException" || msg.includes("password")) {
    return "This PDF is password-protected. Remove the password and upload it again.";
  }
  if (name === "InvalidPDFException" || msg.includes("invalid pdf") || msg.includes("not a valid pdf")) {
    return "The file appears to be corrupted or isn't a valid PDF.";
  }
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch")) {
    return "Couldn't fetch the document. Check your connection and try again.";
  }
  if (msg.includes("empty extraction")) {
    return "No selectable text was found — this PDF may be scanned images. Extraction needs a text layer.";
  }
  if (msg.includes("unsupported layout")) {
    return "The layout couldn't be parsed into readable text (unsupported structure).";
  }
  return "Extraction failed unexpectedly. Try again, or with a different copy of the paper.";
}

/* ================= extraction ================= */

type TextItemLike = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
};

export async function extractFromPdf(
  bytes: Uint8Array,
  onPage?: (page: number, pageCount: number) => void,
): Promise<RawExtraction> {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    // Transfer the buffer to the worker; we don't reuse it afterwards.
    useWorkerFetch: false,
  } as Parameters<PdfJsModule["getDocument"]>[0]);

  const doc = await task.promise;
  const totalPages = doc.numPages;
  const pagesToRead = Math.min(totalPages, PIPELINE_CONFIG.maxPages);

  let metadataTitle: string | null = null;
  let metadataAuthor: string | null = null;
  try {
    const meta = await doc.getMetadata();
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    if (typeof info.Title === "string" && info.Title.trim().length > 2 && info.Title.trim() !== "untitled") {
      metadataTitle = info.Title.trim();
    }
    if (typeof info.Author === "string" && info.Author.trim().length > 1) {
      metadataAuthor = info.Author.trim();
    }
  } catch {
    /* metadata is optional */
  }

  const pages: RawPage[] = [];
  let order = 0;

  for (let p = 1; p <= pagesToRead; p += 1) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items = (content.items as unknown[])
      .filter((it): it is TextItemLike => typeof (it as TextItemLike).str === "string")
      .filter((it) => it.str.trim().length > 0);

    const segments: RawSegment[] = items.map((it) => {
      const x = it.transform[4];
      const y = it.transform[5];
      const fontSize = Math.max(Math.hypot(it.transform[2], it.transform[3]), 1);
      order += 1;
      return {
        page: p,
        order,
        text: it.str,
        x,
        yTop: viewport.height - y,
        fontSize,
        eol: Boolean(it.hasEOL),
      };
    });

    // ---- two-column detection: x-positions cluster on both sides of the gutter ----
    let twoColumn = false;
    if (segments.length >= 14) {
      const mid = viewport.width / 2;
      const left = segments.filter((s) => s.x < mid - viewport.width * 0.04).length;
      const right = segments.filter((s) => s.x > mid + viewport.width * 0.04).length;
      twoColumn = left >= 7 && right >= 7 && left > segments.length * 0.25 && right > segments.length * 0.25;
      if (twoColumn) {
        // reading order: left column top→bottom, then right column
        segments.sort((a, b) => {
          const ca = a.x < mid ? 0 : 1;
          const cb = b.x < mid ? 0 : 1;
          if (ca !== cb) return ca - cb;
          if (Math.abs(a.yTop - b.yTop) > 3) return a.yTop - b.yTop;
          return a.x - b.x;
        });
        segments.forEach((s, i) => {
          s.order = order - segments.length + i + 1;
        });
      }
    }

    if (segments.length > 0) pages.push({ page: p, width: viewport.width, height: viewport.height, segments, twoColumn });
    onPage?.(p, pagesToRead);
    // yield to the UI thread between pages
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  try {
    await task.destroy();
  } catch {
    /* best effort */
  }

  const segCount = pages.reduce((n, pg) => n + pg.segments.length, 0);
  if (segCount === 0) throw new Error("empty extraction");

  return {
    pages,
    totalPagesInFile: totalPages,
    truncated: totalPages > PIPELINE_CONFIG.maxPages,
    metadataTitle,
    metadataAuthor,
  };
}

/* ================= normalization ================= */

const PAGE_NUMBER_RE = /^\s*(page\s+)?\d{1,4}(\s+of\s+\d{1,4})?\s*$/i;
const HEADING_RE = /^(?:(?:\d{1,2}(?:\.\d{1,2})*)\.?\s+)?[A-Z][A-Za-z0-9 ,:&()/-]{2,70}$/;
const KNOWN_HEADINGS = /^(abstract|introduction|related work|background|methods?|methodology|materials and methods|results?|discussion|conclusions?|acknowledg(e)?ments?|references|bibliography|appendix|supplementary|keywords?)\b\.?$/i;
const CAPTION_RE = /^(figure|fig\.?|table)\s+\d+/i;

function isHeadingCandidate(
  s: { text: string; fontSize: number },
  bodySize: number,
  nextIsSmaller: boolean,
): boolean {
  const t = s.text.trim();
  if (t.length === 0 || t.length > 90) return false;
  if (KNOWN_HEADINGS.test(t)) return true;
  const big = s.fontSize >= bodySize * 1.22;
  if (!big && !nextIsSmaller) return false;
  if (/\.\s*$/.test(t) && t.split(/\s+/).length > 8) return false;
  return big && (HEADING_RE.test(t) || t === t.toUpperCase());
}

export function normalizeDocument(raw: RawExtraction): NormalizedDoc {
  const allSegments = raw.pages.flatMap((p) => p.segments);

  /* ---- modal body font size ---- */
  const sizeHistogram = new Map<number, number>();
  for (const s of allSegments) {
    const key = Math.round(s.fontSize * 2) / 2;
    sizeHistogram.set(key, (sizeHistogram.get(key) ?? 0) + s.text.length);
  }
  let bodySize = 10;
  let best = 0;
  for (const [size, weight] of sizeHistogram) {
    if (weight > best) {
      best = weight;
      bodySize = size;
    }
  }

  /* ---- detect repeated headers/footers + page numbers ---- */
  const fringeCounts = new Map<string, number>();
  const pageNumbers = new Set<number>();
  for (const page of raw.pages) {
    for (const s of page.segments) {
      const isTop = s.yTop < page.height * 0.08;
      const isBottom = s.yTop > page.height * 0.92;
      if (isTop || isBottom) {
        const key = s.text.trim().toLowerCase().replace(/\s+/g, " ");
        fringeCounts.set(key, (fringeCounts.get(key) ?? 0) + 1);
      }
      if (PAGE_NUMBER_RE.test(s.text)) pageNumbers.add(s.order);
    }
  }
  const threshold = Math.max(3, Math.floor(raw.pages.length * 0.35));
  const repeatedFringe = new Set<string>();
  for (const [key, count] of fringeCounts) {
    if (count >= threshold && key.length < 60) repeatedFringe.add(key);
  }

  /* ---- stream in reading order, minus fringe noise ---- */
  let removedHeadersFooters = 0;
  let removedPageNumbers = 0;
  const stream: (RawSegment & { line: string })[] = [];
  for (const page of raw.pages) {
    for (const s of page.segments) {
      const key = s.text.trim().toLowerCase().replace(/\s+/g, " ");
      if (repeatedFringe.has(key)) {
        removedHeadersFooters += 1;
        continue;
      }
      if (pageNumbers.has(s.order)) {
        removedPageNumbers += 1;
        continue;
      }
      stream.push({ ...s, line: s.text.trim() });
    }
  }
  if (stream.length === 0) throw new Error("empty extraction");

  /* ---- merge items into lines (same y band), then lines into paragraphs ---- */
  type Line = { text: string; page: number; size: number; order: number; gapBefore: number };
  const lines: Line[] = [];
  let prev: RawSegment | null = null;
  for (const s of stream) {
    const samePage = prev?.page === s.page;
    const sameLine = samePage && Math.abs((prev as RawSegment).yTop - s.yTop) < Math.max(2.5, s.fontSize * 0.35);
    if (sameLine) {
      const l = lines[lines.length - 1];
      l.text += (l.text.endsWith("-") ? "" : " ") + s.line;
      if (s.eol) l.text += "\n";
    } else {
      lines.push({
        text: s.line + (s.eol ? "\n" : ""),
        page: s.page,
        size: s.fontSize,
        order: s.order,
        gapBefore: samePage && prev ? Math.max(0, s.yTop - prev.yTop) : 999,
      });
    }
    prev = s;
  }

  /* ---- join hyphenated line breaks + collapse soft returns within paragraphs later ---- */
  for (let i = 0; i < lines.length - 1; i += 1) {
    const a = lines[i];
    const b = lines[i + 1];
    if (a.page === b.page && /-$/.test(a.text.trim()) && /^[a-z]/.test(b.text.trim())) {
      a.text = a.text.trim().replace(/-$/, "") + b.text;
      b.text = "";
    }
  }
  const cleanedLines = lines.filter((l) => l.text.trim().length > 0);

  /* ---- walk lines → front matter, sections, captions, references ---- */
  let title = raw.metadataTitle ?? "";
  let authors: string[] = [];
  if (!title && raw.metadataAuthor) authors = splitAuthors(raw.metadataAuthor);
  let abstractParts: string[] = [];
  const sections: NormalizedSection[] = [];
  const captions: CaptionRef[] = [];
  let current: NormalizedSection | null = null;
  let inAbstract = false;
  let sectionOrder = 0;

  const flushParagraph = (buf: string[]) => {
    const text = buf.join(" ").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
    buf.length = 0;
    return text;
  };

  let paraBuf: string[] = [];
  const pushPara = () => {
    const text = flushParagraph(paraBuf);
    if (!text) return;
    if (inAbstract) {
      abstractParts.push(text);
      return;
    }
    if (!current) {
      sectionOrder += 1;
      current = { heading: "", page: 1, order: sectionOrder, paragraphs: [], isReferences: false };
      sections.push(current);
    }
    current.paragraphs.push(text);
  };

  // pre-title collection (title = first big line on page 1)
  let titleFound = Boolean(title);
  let authorBuf: string[] = [];
  let sawAbstractHeading = false;

  for (let i = 0; i < cleanedLines.length; i += 1) {
    const l = cleanedLines[i];
    const next = cleanedLines[i + 1];
    const nextSmaller = next ? next.size < l.size : false;
    const t = l.text.trim();

    if (!titleFound && l.page === 1 && l.size >= bodySize * 1.25 && t.length <= 160) {
      // collect wrapped title lines
      let j = i;
      let acc = t;
      while (
        j + 1 < cleanedLines.length &&
        cleanedLines[j + 1].page === 1 &&
        Math.abs(cleanedLines[j + 1].size - l.size) < 0.6 &&
        !CAPTION_RE.test(cleanedLines[j + 1].text.trim()) &&
        acc.length < 220
      ) {
        j += 1;
        acc += " " + cleanedLines[j].text.trim();
      }
      title = acc.replace(/\s+/g, " ").trim();
      titleFound = true;
      i = j;
      continue;
    }

    if (titleFound && authors.length === 0 && !sawAbstractHeading && l.page === 1 && l.size > bodySize * 0.9) {
      // author block: short lines between title and abstract, name-ish tokens
      if (t.length <= 140 && /[a-zA-Z]/.test(t) && !KNOWN_HEADINGS.test(t)) {
        authorBuf.push(t);
        if (authorBuf.length <= 6) continue;
      } else if (authorBuf.length > 0) {
        authors = splitAuthors(authorBuf.join(", "));
        authorBuf = [];
      }
    }

    const headingish = isHeadingCandidate({ text: t, fontSize: l.size }, bodySize, nextSmaller);
    if (headingish || KNOWN_HEADINGS.test(t)) {
      pushPara();
      const clean = t.replace(/[.\s]+$/, "");
      if (/^abstract$/i.test(clean)) {
        inAbstract = true;
        sawAbstractHeading = true;
        continue;
      }
      inAbstract = false;
      if (authorBuf.length > 0 && authors.length === 0) {
        authors = splitAuthors(authorBuf.join(", "));
        authorBuf = [];
      }
      sectionOrder += 1;
      current = {
        heading: clean,
        page: l.page,
        order: sectionOrder,
        paragraphs: [],
        isReferences: /^(references|bibliography)$/i.test(clean),
      };
      sections.push(current);
      continue;
    }

    if (inAbstract && /^(keywords?|index terms|ccs concepts)\b/i.test(t)) {
      inAbstract = false;
      pushPara();
      continue;
    }

    // captions: record, but keep them in flow too
    const cap = t.match(CAPTION_RE);
    if (cap && t.length <= 400) {
      captions.push({ text: t, page: l.page, kind: /^table/i.test(cap[1]) ? "table" : "figure" });
    }

    if (inAbstract) {
      paraBuf.push(t);
      continue;
    }

    // paragraph break on vertical gap / font change
    const gapBreak = l.gapBefore > Math.max(10, l.size * 1.35);
    const sizeChange = paraBuf.length > 0 && Math.abs(l.size - bodySize) > 1.2;
    if (gapBreak || sizeChange) pushPara();
    paraBuf.push(t);
  }
  pushPara();
  if (authorBuf.length > 0 && authors.length === 0) authors = splitAuthors(authorBuf.join(", "));
  if (!title && sections.length > 0) title = sections[0].heading || "Untitled document";

  const abstract = abstractParts.join(" ").trim();
  const referenceSection = sections.find((s) => s.isReferences);
  const references = referenceSection ? referenceSection.paragraphs : [];

  const fullText = sections.map((s) => s.paragraphs.join(" ")).join(" ") + " " + abstract;
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;

  return {
    title: title || "Untitled document",
    authors,
    abstract,
    sections,
    captions,
    references,
    pageCount: raw.pages.length,
    wordCount,
    charCount: fullText.length,
    twoColumnPages: raw.pages.filter((p) => p.twoColumn).length,
    removedHeadersFooters,
    removedPageNumbers,
    truncated: raw.truncated,
    rawSegmentCount: allSegments.length,
  };
}

function splitAuthors(raw: string): string[] {
  return raw
    .split(/,|;|\band\b|\n/)
    .map((a) => a.replace(/[*†‡§¶¶\d]+/g, "").replace(/\s+/g, " ").trim())
    .filter((a) => a.length > 1 && a.length < 60 && /[a-zA-Z]/.test(a))
    .slice(0, 24);
}

/* ================= chunking ================= */

function overlapTail(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(text.length - max);
  const atWord = cut.indexOf(" ");
  return atWord === -1 ? cut : cut.slice(atWord + 1);
}

function splitLongParagraph(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length > max && buf) {
      out.push(buf.trim());
      buf = s;
    } else {
      buf = buf ? buf + " " + s : s;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export function chunkDocument(doc: NormalizedDoc, paperShortId: string): DocumentChunkOut[] {
  const chunks: DocumentChunkOut[] = [];
  const push = (section: string, kind: DocumentChunkOut["kind"], pageStart: number, pageEnd: number, text: string) => {
    const orderIndex = chunks.length;
    chunks.push({
      chunk_id: `${paperShortId}-${String(orderIndex).padStart(3, "0")}`,
      order_index: orderIndex,
      section,
      kind,
      page_start: pageStart,
      page_end: pageEnd,
      text,
      char_count: text.length,
      token_estimate: Math.max(1, Math.round(text.length / PIPELINE_CONFIG.charsPerToken)),
    });
  };

  /* front matter first — title, authors, abstract keep document order */
  const frontParts: string[] = [];
  if (doc.title) frontParts.push(`Title: ${doc.title}`);
  if (doc.authors.length > 0) frontParts.push(`Authors: ${doc.authors.join(", ")}`);
  if (doc.abstract) frontParts.push(`Abstract: ${doc.abstract}`);
  if (frontParts.length > 0) {
    for (const piece of splitLongParagraph(frontParts.join("\n\n"), PIPELINE_CONFIG.chunkMax)) {
      push("Front matter", "front", 1, 1, piece);
    }
  }

  /* body — paragraph-boundary splits with carried-over overlap */
  for (const section of doc.sections) {
    if (section.isReferences) continue;
    if (section.paragraphs.length === 0) continue;
    let acc = "";
    let pageStart = section.page;
    let overlap = "";

    const flush = () => {
      if (!acc.trim()) return;
      push(section.heading || "Body", "body", pageStart, section.page, acc.trim());
      overlap = overlapTail(acc, PIPELINE_CONFIG.chunkOverlap);
      acc = "";
      pageStart = section.page;
    };

    for (const para of section.paragraphs) {
      for (const piece of splitLongParagraph(para, PIPELINE_CONFIG.chunkMax)) {
        const candidate = (acc ? acc + "\n\n" : overlap ? overlap + "\n\n" : "") + piece;
        if (candidate.length > PIPELINE_CONFIG.chunkTarget && acc) {
          flush();
          acc = (overlap ? overlap + "\n\n" : "") + piece;
        } else {
          acc = candidate;
        }
      }
    }
    flush();
  }

  /* references — kept, tagged, slightly larger chunks (citation context) */
  if (doc.references.length > 0) {
    let acc = "";
    for (const ref of doc.references) {
      if ((acc + "\n" + ref).length > PIPELINE_CONFIG.chunkMax && acc) {
        push("References", "references", 1, doc.pageCount, acc.trim());
        acc = ref;
      } else {
        acc = acc ? acc + "\n" + ref : ref;
      }
    }
    if (acc.trim()) push("References", "references", 1, doc.pageCount, acc.trim());
  }

  return chunks;
}

/* ================= orchestration ================= */

export async function processPdfBytes(
  bytes: Uint8Array,
  paperShortId: string,
  onEvent?: (e: PipelineEvent) => void,
): Promise<PipelineResult> {
  onEvent?.({ stage: "extracting", page: 0, pageCount: 0, detail: "opening document" });
  const raw = await extractFromPdf(bytes, (page, pageCount) =>
    onEvent?.({ stage: "extracting", page, pageCount, detail: `page ${page} of ${pageCount}` }),
  );

  onEvent?.({ stage: "normalizing", detail: "removing noise · detecting structure" });
  await new Promise<void>((r) => setTimeout(r, 30));
  const doc = normalizeDocument(raw);
  if (doc.wordCount < 40) throw new Error("empty extraction");

  onEvent?.({ stage: "chunking", detail: `${doc.sections.length} sections → chunks` });
  await new Promise<void>((r) => setTimeout(r, 30));
  const chunks = chunkDocument(doc, paperShortId);
  if (chunks.length === 0) throw new Error("unsupported layout");

  onEvent?.({ stage: "done", detail: `${chunks.length} chunks · ${doc.wordCount.toLocaleString()} words` });
  return { doc, chunks };
}
