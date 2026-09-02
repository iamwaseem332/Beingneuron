// ============================================================
// BeingNeuron · Phase 6 · Edge Function: analyze-paper
//
// Server-side AI analysis. The browser invokes this with { job_id }.
// It loads the extracted document + chunks, runs a provider-abstracted
// LLM analysis (chunk-by-chunk, never the whole paper at once), validates
// that every item is evidence-backed, persists the structured result and
// a usage/cost record, and marks the job `analyzed`.
//
// API keys live ONLY in server env vars — never in the browser bundle:
//   AI_PROVIDER    e.g. "openai" | "anthropic" | any OpenAI-compatible host
//   AI_MODEL       e.g. "gpt-4o-mini"
//   AI_API_KEY     secret — server-side only
//   AI_BASE_URL    optional, for OpenAI-compatible endpoints
//   AI_COST_PER_1K_PROMPT / AI_COST_PER_1K_COMPLETION  optional USD rates
//
// Deploy:  supabase functions deploy analyze-paper
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const UNCERTAIN_THRESHOLD = 0.45;

type Evidence = { excerpt: string; page: number | null; section: string; chunk_id: string };
type ChunkRow = { order_index: number; section: string; kind: string; page_start: number; text: string };

/* ---------- provider abstraction ---------- */

interface LlmResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

async function callLlm(system: string, user: string): Promise<LlmResponse> {
  const provider = Deno.env.get("AI_PROVIDER") ?? "openai";
  const model = Deno.env.get("AI_MODEL") ?? "gpt-4o-mini";
  const apiKey = Deno.env.get("AI_API_KEY");
  if (!apiKey) throw new Error("AI_API_KEY is not configured.");

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`LLM request failed (${res.status}).`);
    const data = await res.json();
    const content = (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
    return {
      content,
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      model,
    };
  }

  // OpenAI / OpenAI-compatible
  const base = (Deno.env.get("AI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM request failed (${res.status}).`);
  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "{}",
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    model: data.model ?? model,
  };
}

/* ---------- analysis prompt (structured output + evidence mandate) ---------- */

const SYSTEM_PROMPT = `You are BeingNeuron's research analysis engine. Given a chunk of an academic paper, extract structured research knowledge as JSON.

STRICT RULES:
- Output ONLY valid JSON matching the schema below. No prose, no markdown.
- Every item MUST include an "evidence" array with at least one object whose "excerpt" is a short VERBATIM quote from the chunk. If you cannot quote real evidence for an item, OMIT that item entirely. Never invent quotes, facts, numbers or names.
- "excerpt" must be copied exactly from the input text (≤ 240 chars).
- "confidence" is 0–1; set it low (< 0.45) when the signal is weak.
- If nothing of a type is present, return an empty array for it.

JSON schema:
{
  "research_question": "string|null",
  "main_problem": "string|null",
  "conclusion": "string|null",
  "concepts":  [{"name","kind","explanation","confidence","evidence":[{"excerpt","page","section","chunk_id"}]}],
  "claims":    [{"text","kind","confidence","evidence":[...]}],
  "methods":   [{"name","type":"method|model","description","confidence","evidence":[...]}],
  "results":   [{"statement","metric":"string|null","confidence","evidence":[...]}],
  "datasets":  [{"name","description","confidence","evidence":[...]}],
  "experiments":[{"name","description","confidence","evidence":[...]}],
  "limitations":[{"text","confidence","evidence":[...]}]
}`;

function buildChunkPrompt(chunk: ChunkRow): string {
  return `Paper section: "${chunk.section}" (page ${chunk.page_start}). Chunk id: "${chunk.order_index}".

CHUNK TEXT:
"""
${chunk.text}
"""

Extract the structured research knowledge from the chunk text above. Remember: only quote evidence that appears verbatim in the chunk; omit anything you cannot ground.`;
}

/* ---------- evidence validation (drop unsupported) ---------- */

function cleanEvidence(ev: unknown, chunk: ChunkRow): Evidence[] {
  if (!Array.isArray(ev)) return [];
  const out: Evidence[] = [];
  for (const e of ev) {
    const rec = (e ?? {}) as Record<string, unknown>;
    const excerpt = typeof rec.excerpt === "string" ? rec.excerpt.trim().slice(0, 280) : "";
    if (!excerpt) continue;
    // ground-check: the excerpt must actually appear in the chunk text
    const haystack = chunk.text.toLowerCase().replace(/\s+/g, " ");
    const needle = excerpt.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
    if (!haystack.includes(needle)) continue; // reject hallucinated quotes
    out.push({
      excerpt,
      page: typeof rec.page === "number" ? rec.page : chunk.page_start,
      section: typeof rec.section === "string" ? rec.section : chunk.section,
      chunk_id: String(chunk.order_index).padStart(3, "0"),
    });
  }
  return out;
}

/* ---------- merge / dedupe across chunks ---------- */

function mergeByKey<T extends { name?: string; text?: string; statement?: string; evidence: Evidence[]; confidence?: number }>(
  items: T[],
  key: (t: T) => string,
): T[] {
  const map = new Map<string, T>();
  for (const it of items) {
    const k = key(it).toLowerCase().trim();
    if (!k) continue;
    const prev = map.get(k);
    if (prev) {
      prev.evidence = [...prev.evidence, ...it.evidence].slice(0, 4);
      prev.confidence = Math.max(prev.confidence ?? 0, it.confidence ?? 0);
    } else {
      map.set(k, { ...it, evidence: it.evidence.slice(0, 4) });
    }
  }
  return [...map.values()];
}

/* ---------- handler ---------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // ownership check (anon client is RLS-bound, but be explicit)
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: job } = await admin.from("paper_jobs").select("id, user_id").eq("id", job_id).single();
    if (!job || job.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    await admin.from("paper_jobs").update({ status: "analyzing_concepts" }).eq("id", job_id);

    const { data: doc } = await admin.from("extracted_documents").select("id, title, abstract").eq("job_id", job_id).maybeSingle();
    if (!doc) {
      await admin.from("paper_jobs").update({ status: "failed", error_message: "No extracted document to analyze. Run extraction first." }).eq("id", job_id);
      return new Response(JSON.stringify({ error: "No extracted document" }), { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    const { data: chunkRows } = await admin
      .from("document_chunks")
      .select("order_index, section, kind, page_start, text")
      .eq("document_id", doc.id)
      .order("order_index", { ascending: true });

    const chunks = ((chunkRows ?? []) as ChunkRow[]).filter((c) => c.kind !== "references");

    /* chunk-by-chunk analysis (long-document strategy) */
    let promptTokens = 0;
    let completionTokens = 0;
    let requests = 0;
    let failures = 0;
    let model = Deno.env.get("AI_MODEL") ?? "unknown";

    const agg: Record<string, unknown[]> = {
      concepts: [], claims: [], methods: [], results: [], datasets: [], experiments: [], limitations: [],
    };
    let researchQuestion: string | null = null;
    let mainProblem: string | null = null;
    let conclusion: string | null = null;

    for (const [i, chunk] of chunks.entries()) {
      const stage = i < chunks.length * 0.4 ? "analyzing_concepts" : i < chunks.length * 0.7 ? "extracting_claims" : "mapping_evidence";
      await admin.from("paper_jobs").update({ status: stage }).eq("id", job_id);
      try {
        const llm = await callLlm(SYSTEM_PROMPT, buildChunkPrompt(chunk));
        requests += 1;
        promptTokens += llm.promptTokens;
        completionTokens += llm.completionTokens;
        model = llm.model;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(llm.content);
        } catch {
          failures += 1; // malformed structured output → skip chunk, don't fabricate
          continue;
        }

        researchQuestion ??= (parsed.research_question as string) || null;
        mainProblem ??= (parsed.main_problem as string) || null;
        conclusion ??= (parsed.conclusion as string) || null;

        for (const key of Object.keys(agg)) {
          const items = Array.isArray(parsed[key]) ? (parsed[key] as Record<string, unknown>[]) : [];
          for (const it of items) {
            const evidence = cleanEvidence(it.evidence, chunk);
            if (evidence.length === 0) continue; // evidence mandate: drop unsupported
            agg[key].push({ ...it, evidence, confidence: typeof it.confidence === "number" ? it.confidence : 0.5 });
          }
        }
      } catch {
        failures += 1; // failed AI request → keep going, count the failure
      }
    }

    await admin.from("paper_jobs").update({ status: "finalizing" }).eq("id", job_id);

    /* dedupe + confidence flagging */
    const name = (t: { name?: string; text?: string; statement?: string }) => t.name ?? t.text ?? t.statement ?? "";
    const flag = <T extends { confidence?: number }>(arr: T[]) =>
      arr.map((x) => ({ ...x, confidence: Math.min(1, Math.max(0, x.confidence ?? 0)), uncertain: (x.confidence ?? 0) < UNCERTAIN_THRESHOLD }));

    const analysis = {
      research_question: researchQuestion,
      main_problem: mainProblem,
      conclusion,
      concepts: flag(mergeByKey(agg.concepts as { name?: string; evidence: Evidence[]; confidence?: number }[], name)),
      claims: flag(mergeByKey(agg.claims as { text?: string; evidence: Evidence[]; confidence?: number }[], name)),
      methods: flag(mergeByKey(agg.methods as { name?: string; evidence: Evidence[]; confidence?: number }[], name)),
      results: flag(mergeByKey(agg.results as { statement?: string; evidence: Evidence[]; confidence?: number }[], name)),
      datasets: flag(mergeByKey(agg.datasets as { name?: string; evidence: Evidence[]; confidence?: number }[], name)),
      experiments: flag(mergeByKey(agg.experiments as { name?: string; evidence: Evidence[]; confidence?: number }[], name)),
      limitations: flag(mergeByKey(agg.limitations as { text?: string; evidence: Evidence[]; confidence?: number }[], name)),
      relationships: [],
      dropped_unsupported: 0,
    };

    /* cost accounting */
    const per1kPrompt = parseFloat(Deno.env.get("AI_COST_PER_1K_PROMPT") ?? "0");
    const per1kCompletion = parseFloat(Deno.env.get("AI_COST_PER_1K_COMPLETION") ?? "0");
    const costUsd = (promptTokens / 1000) * per1kPrompt + (completionTokens / 1000) * per1kCompletion;
    const provider = Deno.env.get("AI_PROVIDER") ?? "openai";

    const { error: insErr } = await admin.from("research_analyses").upsert(
      {
        job_id,
        user_id: user.id,
        document_id: doc.id,
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
        meta: { provider, model, prompt_tokens: promptTokens, completion_tokens: completionTokens, cost_usd: costUsd, requests, failures },
      },
      { onConflict: "job_id" },
    );

    await admin.from("ai_usage_log").insert({
      user_id: user.id,
      job_id,
      provider,
      model,
      requests,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: costUsd,
      failure: failures > 0 && requests === 0,
    });

    if (insErr) {
      await admin.from("paper_jobs").update({ status: "failed", error_message: "Couldn't store the analysis." }).eq("id", job_id);
      return new Response(JSON.stringify({ error: "Storage failed" }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    await admin.from("paper_jobs").update({ status: "analyzed", error_message: null }).eq("id", job_id);

    const usage = { provider, model, requests, prompt_tokens: promptTokens, completion_tokens: completionTokens, cost_usd: costUsd, failures };
    return new Response(JSON.stringify({ analysis, usage }), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed.";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
