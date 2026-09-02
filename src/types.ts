/**
 * Future entity model — Phase 4+ will persist these via Supabase.
 * Defined now so pages can be typed against the real shapes instead of
 * being refactored later. Nothing here implies a backend exists yet.
 */

export type User = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
};

export type Paper = {
  id: string;
  user_id: string;
  title: string;
  authors: string[];
  domain: string;
  source: "upload" | "arxiv";
  arxiv_id?: string;
  created_at: string;
};

/* Phase 7 ships the real knowledge-graph model in `src/app/graphModel.ts`
   (typed nodes, typed relationships, evidence references, graph levels).
   These aliases keep the entity contract stable for future phases. */
import type { GraphNode, GraphEdge, KnowledgeGraphData, GraphNodeType, RelationKind } from "./app/graphModel";

export type KnowledgeGraphNode = GraphNode;
export type KnowledgeGraphEdge = GraphEdge;
export type KnowledgeGraph = KnowledgeGraphData;
export type { GraphNodeType, RelationKind };

export type ResearchAnalysis = {
  id: string;
  user_id: string;
  paper_id: string;
  status: "queued" | "processing" | "ready" | "failed";
  graph: KnowledgeGraph | null;
  created_at: string;
};

export type ResearchCollection = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  analysis_ids: string[];
  created_at: string;
};

export type NeuroSurgeryChallenge = {
  id: string;
  slug: string;
  title: string;
  category: string;
  difficulty: "intro" | "core" | "advanced";
};

export type NeuroSurgerySession = {
  id: string;
  user_id: string;
  challenge_id: string;
  status: "active" | "repaired" | "abandoned";
  started_at: string;
  finished_at: string | null;
};

export type UsageRecord = {
  id: string;
  user_id: string;
  kind: "analysis" | "experiment" | "collection";
  created_at: string;
};

export type ActivityItem = {
  id: string;
  kind: "analysis" | "experiment" | "collection" | "account";
  label: string;
  at: string;
};

/* ---------- Phase 5: document extraction ---------- */

export type PaperJobStatus =
  | "uploaded"
  | "queued"
  | "extracting"
  | "normalizing"
  | "chunking"
  | "ready_for_analysis"
  | "failed";

export type DocumentSection = {
  heading: string;
  page: number;
  order: number;
  paragraphs: string[];
  is_references: boolean;
};

export type ExtractedDocument = {
  id: string;
  job_id: string;
  user_id: string;
  title: string;
  authors: string[];
  abstract: string;
  page_count: number;
  word_count: number;
  char_count: number;
  sections: DocumentSection[];
  captions: { text: string; page: number; kind: "figure" | "table" }[];
  created_at: string;
};

export type DocumentChunk = {
  id: string;
  document_id: string;
  order_index: number;
  section: string;
  kind: "front" | "body" | "references";
  page_start: number;
  page_end: number;
  text: string;
  char_count: number;
};
