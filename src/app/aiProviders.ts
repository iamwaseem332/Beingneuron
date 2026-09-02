/**
 * Phase 6 — AI provider abstraction.
 *
 * The research pipeline talks to an `AnalysisProvider`, never to a specific
 * model vendor. Two providers ship today:
 *
 *   • HeuristicProvider — local, evidence-backed lexical analyzer. Invokes no
 *     model, costs nothing, and always grounds output in document text. Used
 *     in demo/offline mode and as the fallback when the server LLM is absent.
 *
 *   • EdgeFunctionProvider — delegates to the `analyze-paper` Supabase Edge
 *     Function, which performs the LLM analysis server-side. API keys live in
 *     server env (`AI_API_KEY`) and NEVER reach the browser. The function
 *     reports token usage and approximate cost, and re-validates evidence.
 *
 * Adding a future provider = implement `AnalysisProvider`; the pipeline and
 * the rest of the app are untouched.
 */

import { supabase, isSupabaseConfigured } from "../auth/supabaseClient";
import type { DocumentChunkOut, NormalizedDoc } from "./pipeline";
import { extractChunkCandidates } from "./heuristicAnalyzer";
import type { ChunkCandidates, PaperAnalysis } from "./analysisSchemas";

/* ================= stages (must correspond to real processing) ================= */

export type AnalysisStage =
  | "analyzing_concepts"
  | "analyzing_methodology"
  | "extracting_claims"
  | "mapping_evidence"
  | "finalizing"
  | "done"
  | "failed";

/* ================= usage / cost tracking ================= */

export type AiUsage = {
  provider: string;
  model: string;
  /** Number of model/provider requests made for this analysis. */
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  /** Approximate USD cost; 0 for the local heuristic provider. */
  cost_usd: number;
  failures: number;
};

export function emptyUsage(provider: string, model: string): AiUsage {
  return { provider, model, requests: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0, failures: 0 };
}

/* ================= provider contract ================= */

export type AnalysisInput = {
  jobId: string;
  doc: NormalizedDoc;
  chunks: DocumentChunkOut[];
};

export type ProviderAnalysisResult = {
  analysis: PaperAnalysis;
  usage: AiUsage;
};

export interface AnalysisProvider {
  readonly id: string;
  /**
   * Whole-document analysis performed server-side (LLM path). Returns `null`
   * when the provider is unavailable so the caller can fall back to the
   * client-side long-document strategy.
   */
  analyzeDocument?(input: AnalysisInput, onStage: (s: AnalysisStage) => void): Promise<ProviderAnalysisResult | null>;
  /** Per-chunk candidate extraction for the client-side long-document strategy. */
  analyzeChunk?(chunk: DocumentChunkOut, doc: NormalizedDoc): Promise<ChunkCandidates>;
}

/* ================= heuristic (local) provider ================= */

export class HeuristicProvider implements AnalysisProvider {
  readonly id = "heuristic-local";

  async analyzeChunk(chunk: DocumentChunkOut, doc: NormalizedDoc): Promise<ChunkCandidates> {
    // Yield to the UI thread so staged progress is perceptible on long papers.
    await new Promise<void>((r) => setTimeout(r, 0));
    return extractChunkCandidates(chunk, doc);
  }
}

/* ================= edge-function (server LLM) provider ================= */

export class EdgeFunctionProvider implements AnalysisProvider {
  readonly id = "edge-function";
  private client = supabase!;

  async analyzeDocument(input: AnalysisInput, onStage: (s: AnalysisStage) => void): Promise<ProviderAnalysisResult | null> {
    onStage("analyzing_concepts");
    try {
      const { data, error } = await this.client.functions.invoke("analyze-paper", {
        body: { job_id: input.jobId },
      });
      if (error || !data) return null; // function missing / failed → caller falls back
      const payload = data as { analysis?: unknown; usage?: Partial<AiUsage> };
      if (!payload.analysis) return null;
      onStage("finalizing");
      return {
        analysis: payload.analysis as PaperAnalysis,
        usage: {
          ...emptyUsage(payload.usage?.provider ?? "openai-compatible", payload.usage?.model ?? "unknown"),
          requests: payload.usage?.requests ?? 1,
          prompt_tokens: payload.usage?.prompt_tokens ?? 0,
          completion_tokens: payload.usage?.completion_tokens ?? 0,
          cost_usd: payload.usage?.cost_usd ?? 0,
          failures: payload.usage?.failures ?? 0,
        },
      };
    } catch {
      return null;
    }
  }
}

/* ================= selection ================= */

export type ProviderMode = "supabase" | "demo";

export function getProvider(mode: ProviderMode): AnalysisProvider {
  return mode === "supabase" && isSupabaseConfigured ? new EdgeFunctionProvider() : new HeuristicProvider();
}
