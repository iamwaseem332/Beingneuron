/**
 * BeingNeuron · Phase 5 · Edge Function: extract-paper
 *
 * Server-side document extraction. This is the production pipeline used when
 * Supabase is configured; the browser pipeline (src/app/pipeline.ts) is the
 * offline/demo fallback and mirrors these heuristics.
 *
 * Flow: fetch temp PDF (service role) → extract text w/ positions → detect
 * structure → normalize → chunk → persist extracted_documents + document_chunks
 * → mark job ready_for_analysis → purge the original PDF (retention).
 *
 * Deploy:  supabase functions deploy extract-paper
 * Invoke:  supabase.functions.invoke("extract-paper", { body: { job_id } })
 *
 * SECURITY: runs with the service role (bypasses RLS by design), but we
 * re-check job ownership against the caller's JWT before touching any row,
 * so a user can never trigger extraction on another user's job.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { getDocument, GlobalWorkerOptions } from "npm:pdfjs-dist@4.8.69/legacy/build/pdf.mjs";

// pdf.js in Deno has no DOM worker; use the "fake worker" on the main thread.
GlobalWorkerOptions.workerSrc = "";

const BUCKET = "paper-intake";
const MAX_PAGES = 120;
const CHUNK_TARGET = 1400;
const CHUNK_MAX = 2400;
const CHUNK_OVERLAP = 160;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RawSegment {
  page: number;
  order: number;
  text: string;
  x: number;
  yTop: number;
  fontSize: number;
}

interface Section {
  heading: string;
  page: number;
  order: number;
  paragraphs: string[];
  is_references: boolean;
}

const PAGE_NUMBER_RE = /^\s*(page\s+)?\d{1,4}(\s+of\s+\d{1,4})?\s*$/i;
const KNOWN_HEADINGS =
  /^(abstract|introduction|related work|background|methods?|methodology|materials and methods|results?|discussion|conclusions?|acknowledg(e)?ments?|references|bibliography|appendix|supplementary|keywords?)\b\.?$/i;
const CAPTION_RE = /^(figure|fig\.?|table)\s+\d+/i;
const HEADING_RE = /^(?:(?:\d{1,2}(?:\.\d{1,2})*)\.?\s+)?[A-Z][A-Za-z0-9 ,:&()/-]{2,70}$/;

function splitAuthors(raw: string): string[] {
  return raw
    .split(/,|;|\band\b|\n/)
    .map((a) => a.replace(/[*†‡§¶\d]+/g, "").replace(/\s+/g, " ").trim())
    .filter((a) => a.length > 1 && a.length < 60 && /[a-zA-Z]/.test(a))
    .slice(0, 24);
}

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

async function extract(bytes: Uint8Array) {
  const doc = await getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true }).promise;
  const pagesToRead = Math.min(doc.numPages, MAX_PAGES);

  let metadataTitle: string | null = null;
  let metadataAuthor: string | null = null;
  try {
    const meta = await doc.getMetadata();
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    if (typeof info.Title === "string" && info.Title.trim().length > 2) metadataTitle = info.Title.trim();
    if (typeof info.Author === "string" && info.Author.trim().length > 1) metadataAuthor = info.Author.trim();
  } catch { /* optional */ }

  const pages: { page: number; width: number; height: number; segments: RawSegment[]; twoColumn: boolean }[] = [];
  let order = 0;

  for (let p = 1; p <= pagesToRead; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = (content.items as any[])
      .filter((it) => typeof it.str === "string" && it.str.trim().length > 0);

    const segments: RawSegment[] = items.map((it) => {
      order += 1;
      return {
        page: p,
        order,
        text: it.str,
        x: it.transform[4],
        yTop: viewport.height - it.transform[5],
        fontSize: Math.max(Math.hypot(it.transform[2], it.transform[3]), 1),
      };
    });

    let twoColumn = false;
    if (segments.length >= 14) {
      const mid = viewport.width / 2;
      const left = segments.filter((s) => s.x < mid - viewport.width * 0.04).length;
      const right = segments.filter((s) => s.x > mid + viewport.width * 0.04).length;
      twoColumn = left >= 7 && right >= 7 && left > segments.length * 0.25 && right > segments.length * 0.25;
      if (twoColumn) {
        segments.sort((a, b) => {
          const ca = a.x < mid ? 0 : 1;
          const cb = b.x < mid ? 0 : 1;
          if (ca !== cb) return ca - cb;
          if (Math.abs(a.yTop - b.yTop) > 3) return a.yTop - b.yTop;
          return a.x - b.x;
        });
      }
    }
    if (segments.length > 0) pages.push({ page: p, width: viewport.width, height: viewport.height, segments, twoColumn });
  }

  const segCount = pages.reduce((n, pg) => n + pg.segments.length, 0);
  if (segCount === 0) throw new Error("empty extraction");

  return { pages, truncated: doc.numPages > MAX_PAGES, metadataTitle, metadataAuthor, rawSegmentCount: segCount };
}

function normalize(raw: Awaited<ReturnType<typeof extract>>) {
  const all = raw.pages.flatMap((p) => p.segments);

  // modal body font size
  const hist = new Map<number, number>();
  for (const s of all) {
    const key = Math.round(s.fontSize * 2) / 2;
    hist.set(key, (hist.get(key) ?? 0) + s.text.length);
  }
  let bodySize = 10;
  let best = 0;
  for (const [size, w] of hist) if (w > best) { best = w; bodySize = size; }

  // repeated headers/footers + page numbers
  const fringe = new Map<string, number>();
  const pageNums = new Set<number>();
  for (const page of raw.pages) {
    for (const s of page.segments) {
      const t = s.yTop < page.height * 0.08 || s.yTop > page.height * 0.92;
      if (t) {
        const key = s.text.trim().toLowerCase().replace(/\s+/g, " ");
        fringe.set(key, (fringe.get(key) ?? 0) + 1);
      }
      if (PAGE_NUMBER_RE.test(s.text)) pageNums.add(s.order);
    }
  }
  const threshold = Math.max(3, Math.floor(raw.pages.length * 0.35));
  const repeated = new Set<string>();
  for (const [key, count] of fringe) if (count >= threshold && key.length < 60) repeated.add(key);

  let removedHeadersFooters = 0;
  let removedPageNumbers = 0;
  const stream: (RawSegment & { line: string })[] = [];
  for (const page of raw.pages) {
    for (const s of page.segments) {
      const key = s.text.trim().toLowerCase().replace(/\s+/g, " ");
      if (repeated.has(key)) { removedHeadersFooters++; continue; }
      if (pageNums.has(s.order)) { removedPageNumbers++; continue; }
      stream.push({ ...s, line: s.text.trim() });
    }
  }
  if (stream.length === 0) throw new Error("empty extraction");

  // merge into lines
  type Line = { text: string; page: number; size: number; order: number; gapBefore: number };
  const lines: Line[] = [];
  let prev: RawSegment | null = null;
  for (const s of stream) {
    const samePage = prev?.page === s.page;
    const sameLine = samePage && Math.abs(prev!.yTop - s.yTop) < Math.max(2.5, s.fontSize * 0.35);
    if (sameLine) {
      const l = lines[lines.length - 1];
      l.text += (l.text.endsWith("-") ? "" : " ") + s.line;
    } else {
      lines.push({
        text: s.line,
        page: s.page,
        size: s.fontSize,
        order: s.order,
        gapBefore: samePage && prev ? Math.max(0, s.yTop - prev.yTop) : 999,
      });
    }
    prev = s;
  }
  // hyphen joins
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    if (a.page === b.page && /-$/.test(a.text.trim()) && /^[a-z]/.test(b.text.trim())) {
      a.text = a.text.trim().replace(/-$/, "") + b.text;
      b.text = "";
    }
  }
  const cleaned = lines.filter((l) => l.text.trim().length > 0);

  // walk lines → title / authors / abstract / sections / captions
  let title = raw.metadataTitle ?? "";
  let authors: string[] = raw.metadataAuthor ? splitAuthors(raw.metadataAuthor) : [];
  let abstractParts: string[] = [];
  const sections: Section[] = [];
  const captions: { text: string; page: number; kind: string }[] = [];
  let current: Section | null = null;
  let inAbstract = false;
  let order_ = 0;
  let titleFound = Boolean(title);
  let authorBuf: string[] = [];
  let sawAbstract = false;
  let paraBuf: string[] = [];

  const flush = () => {
    const text = paraBuf.join(" ").replace(/\s+/g, " ").trim();
    paraBuf = [];
    if (!text) return;
    if (inAbstract) { abstractParts.push(text); return; }
    if (!current) {
      order_++;
      current = { heading: "", page: 1, order: order_, paragraphs: [], is_references: false };
      sections.push(current);
    }
    current.paragraphs.push(text);
  };

  for (let i = 0; i < cleaned.length; i++) {
    const l = cleaned[i];
    const next = cleaned[i + 1];
    const nextSmaller = next ? next.size < l.size : false;
    const t = l.text.trim();

    if (!titleFound && l.page === 1 && l.size >= bodySize * 1.25 && t.length <= 160) {
      title = t.replace(/\s+/g, " ").trim();
      titleFound = true;
      continue;
    }
    if (titleFound && authors.length === 0 && !sawAbstract && l.page === 1 && l.size > bodySize * 0.9) {
      if (t.length <= 140 && /[a-zA-Z]/.test(t) && !KNOWN_HEADINGS.test(t)) {
        authorBuf.push(t);
        continue;
      } else if (authorBuf.length > 0) {
        authors = splitAuthors(authorBuf.join(", "));
        authorBuf = [];
      }
    }

    const big = l.size >= bodySize * 1.22;
    const headingish =
      KNOWN_HEADINGS.test(t) ||
      (big && t.length <= 90 && (HEADING_RE.test(t) || t === t.toUpperCase()) && nextSmaller);
    if (headingish) {
      flush();
      const cleanH = t.replace(/[.\s]+$/, "");
      if (/^abstract$/i.test(cleanH)) { inAbstract = true; sawAbstract = true; continue; }
      inAbstract = false;
      if (authorBuf.length > 0 && authors.length === 0) { authors = splitAuthors(authorBuf.join(", ")); authorBuf = []; }
      order_++;
      current = {
        heading: cleanH,
        page: l.page,
        order: order_,
        paragraphs: [],
        is_references: /^(references|bibliography)$/i.test(cleanH),
      };
      sections.push(current);
      continue;
    }
    if (inAbstract && /^(keywords?|index terms|ccs concepts)\b/i.test(t)) { inAbstract = false; flush(); continue; }
    const cap = t.match(CAPTION_RE);
    if (cap && t.length <= 400) captions.push({ text: t, page: l.page, kind: /^table/i.test(cap[1]) ? "table" : "figure" });
    if (inAbstract) { paraBuf.push(t); continue; }
    const gapBreak = l.gapBefore > Math.max(10, l.size * 1.35);
    if (gapBreak) flush();
    paraBuf.push(t);
  }
  flush();
  if (authorBuf.length > 0 && authors.length === 0) authors = splitAuthors(authorBuf.join(", "));
  if (!title && sections.length > 0) title = sections[0].heading || "Untitled document";

  const abstract = abstractParts.join(" ").trim();
  const refSection = sections.find((s) => s.is_references);
  const references = refSection ? refSection.paragraphs : [];
  const fullText = sections.map((s) => s.paragraphs.join(" ")).join(" ") + " " + abstract;

  return {
    title: title || "Untitled document",
    authors,
    abstract,
    sections,
    captions,
    references,
    pageCount: raw.pages.length,
    wordCount: fullText.split(/\s+/).filter(Boolean).length,
    charCount: fullText.length,
    twoColumnPages: raw.pages.filter((p) => p.twoColumn).length,
    removedHeadersFooters,
    removedPageNumbers,
    truncated: raw.truncated,
    rawSegmentCount: raw.rawSegmentCount,
  };
}

function chunk(doc: ReturnType<typeof normalize>, shortId: string) {
  const chunks: {
    order_index: number; section: string; kind: string;
    page_start: number; page_end: number; text: string; char_count: number;
  }[] = [];
  const push = (section: string, kind: string, ps: number, pe: number, text: string) => {
    chunks.push({
      order_index: chunks.length, section, kind,
      page_start: ps, page_end: pe, text, char_count: text.length,
    });
  };

  const front: string[] = [];
  if (doc.title) front.push(`Title: ${doc.title}`);
  if (doc.authors.length) front.push(`Authors: ${doc.authors.join(", ")}`);
  if (doc.abstract) front.push(`Abstract: ${doc.abstract}`);
  if (front.length) {
    for (const piece of splitLongParagraph(front.join("\n\n"), CHUNK_MAX)) push("Front matter", "front", 1, 1, piece);
  }

  for (const section of doc.sections) {
    if (section.is_references || section.paragraphs.length === 0) continue;
    let acc = "";
    let pageStart = section.page;
    let overlap = "";
    const flush = () => {
      if (!acc.trim()) return;
      push(section.heading || "Body", "body", pageStart, section.page, acc.trim());
      overlap = overlapTail(acc, CHUNK_OVERLAP);
      acc = "";
      pageStart = section.page;
    };
    for (const para of section.paragraphs) {
      for (const piece of splitLongParagraph(para, CHUNK_MAX)) {
        const candidate = (acc ? acc + "\n\n" : overlap ? overlap + "\n\n" : "") + piece;
        if (candidate.length > CHUNK_TARGET && acc) {
          flush();
          acc = (overlap ? overlap + "\n\n" : "") + piece;
        } else acc = candidate;
      }
    }
    flush();
  }

  if (doc.references.length) {
    let acc = "";
    for (const ref of doc.references) {
      if ((acc + "\n" + ref).length > CHUNK_MAX && acc) {
        push("References", "references", 1, doc.pageCount, acc.trim());
        acc = ref;
      } else acc = acc ? acc + "\n" + ref : ref;
    }
    if (acc.trim()) push("References", "references", 1, doc.pageCount, acc.trim());
  }
  return chunks;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { job_id } = await req.json();
    if (!job_id) throw new Error("job_id is required");

    // The user JWT comes from the Authorization header (set by functions.invoke).
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Ownership check — never process another user's job.
    const { data: job, error: jobErr } = await admin
      .from("paper_jobs").select("*").eq("id", job_id).maybeSingle();
    if (jobErr || !job || job.user_id !== userId) {
      return new Response(JSON.stringify({ ok: false, error: "Job not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (!["uploaded", "queued", "failed"].includes(job.status)) {
      return new Response(JSON.stringify({ ok: false, error: "Job is not processable" }), { status: 409, headers: { ...cors, "Content-Type": "application/json" } });
    }

    await admin.from("paper_jobs").update({ status: "extracting", error_message: null }).eq("id", job_id);

    // Acquire bytes: stored PDF (private bucket) or fetch arXiv PDF.
    let bytes: Uint8Array;
    if (job.source_type === "arxiv" && job.arxiv_id) {
      const res = await fetch(`https://arxiv.org/pdf/${job.arxiv_id}`);
      if (!res.ok) throw new Error("Failed to retrieve the PDF from arXiv.");
      bytes = new Uint8Array(await res.arrayBuffer());
    } else {
      if (!job.temporary_file_path) throw new Error("The temporary file is missing — re-upload the paper.");
      const { data: fileData, error: fileErr } = await admin.storage
        .from(BUCKET).download(job.temporary_file_path);
      if (fileErr || !fileData) throw new Error("Couldn't open the stored file.");
      bytes = new Uint8Array(await fileData.arrayBuffer());
    }

    const raw = await extract(bytes);
    await admin.from("paper_jobs").update({ status: "normalizing" }).eq("id", job_id);
    const doc = normalize(raw);
    if (doc.wordCount < 40) throw new Error("empty extraction");

    await admin.from("paper_jobs").update({ status: "chunking" }).eq("id", job_id);
    const chunks = chunk(doc, String(job_id).slice(0, 8));
    if (chunks.length === 0) throw new Error("unsupported layout");

    const { data: docRow, error: docErr } = await admin
      .from("extracted_documents")
      .insert({
        job_id, user_id: userId,
        title: doc.title, authors: doc.authors, abstract: doc.abstract,
        page_count: doc.pageCount, word_count: doc.wordCount, char_count: doc.charCount,
        sections: doc.sections, captions: doc.captions,
        stats: {
          two_column_pages: doc.twoColumnPages,
          removed_headers_footers: doc.removedHeadersFooters,
          removed_page_numbers: doc.removedPageNumbers,
          raw_segment_count: doc.rawSegmentCount,
          truncated: doc.truncated,
          references_count: doc.references.length,
          chunk_count: chunks.length,
        },
      })
      .select().single();
    if (docErr || !docRow) throw new Error("Couldn't store the extracted document.");

    if (chunks.length) {
      const { error: chunkErr } = await admin.from("document_chunks").insert(
        chunks.map((c) => ({ document_id: docRow.id, user_id: userId, ...c })),
      );
      if (chunkErr) throw new Error("Couldn't store the document chunks.");
    }

    // Retention: keep structured data, delete the original PDF.
    if (job.temporary_file_path) {
      await admin.storage.from(BUCKET).remove([job.temporary_file_path]).catch(() => undefined);
    }
    await admin.from("paper_jobs").update({
      status: "ready_for_analysis",
      document_id: docRow.id,
      temporary_file_path: null,
      source_purged: job.source_type === "pdf",
      error_message: null,
    }).eq("id", job_id);

    return new Response(
      JSON.stringify({
        ok: true,
        detail: `${chunks.length} chunks · ${doc.wordCount.toLocaleString()} words`,
        summary: {
          title: doc.title, page_count: doc.pageCount, word_count: doc.wordCount,
          section_count: doc.sections.length, chunk_count: chunks.length,
        },
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Extraction failed";
    // Best-effort: mark the job failed (only meaningful if we got a job_id).
    try {
      const body = await req.clone().json().catch(() => null);
      if (body?.job_id) {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await admin.from("paper_jobs").update({ status: "failed", error_message: msg }).eq("id", body.job_id);
      }
    } catch { /* non-fatal */ }
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
