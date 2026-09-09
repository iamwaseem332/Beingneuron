/**
 * Type definitions for the Phase 3 Structure-Aware Chunking Engine
 * 
 * These interfaces define the contract for hierarchical chunking that respects
 * document structure identified by the parser.
 * 
 * @see docs/phases/phase-3/chunking-spec.md for algorithm details
 * @see docs/phases/phase-3/parser-evaluation-report.md#adapter-pattern for parser output
 */

import { ParsedDocument, TextBlock, ExtractedTable, ExtractedFormula } from '../parsers/types';

/**
 * Configuration for chunking behavior
 */
export interface ChunkConfig {
  /** Maximum tokens per chunk (default: 2000) */
  maxTokens: number;
  /** Minimum tokens per chunk (default: 500) */
  minTokens: number;
  /** Tokens to overlap between consecutive chunks (default: 100) */
  overlapTokens: number;
  /** Whether to preserve atomic units like tables/formulas (default: true) */
  preserveAtomicUnits: boolean;
  /** Token estimation method: 'approximate' (chars/4) or 'tiktoken' */
  tokenEstimationMethod: 'approximate' | 'tiktoken';
}

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  maxTokens: 2000,
  minTokens: 500,
  overlapTokens: 100,
  preserveAtomicUnits: true,
  tokenEstimationMethod: 'approximate',
};

/**
 * Represents a span of text that can be traced back to the source PDF
 */
export interface EvidenceSpan {
  /** Character offset from start of document */
  startChar: number;
  /** Character offset from start of document */
  endChar: number;
  /** 1-indexed page number */
  pageNumber: number;
  /** ID of the source text block */
  sourceBlockId: string;
  /** Bounding box within the page (optional) */
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Represents a single chunk of text with hierarchical metadata
 */
export interface Chunk {
  /** Unique identifier (SHA-256 hash of paperId + sectionId + sequenceIndex) */
  id: string;
  /** Reference to the parent paper */
  paperId: string;
  /** Section title this chunk belongs to */
  sectionTitle: string;
  /** Heading level (1 = top-level, 2 = subsection, etc.) */
  sectionLevel: number;
  /** Sequence number within the section (0-indexed) */
  sequence: number;
  /** The actual text content */
  text: string;
  /** Estimated token count */
  tokenCount: number;
  /** 1-indexed start page */
  startPage: number;
  /** 1-indexed end page */
  endPage: number;
  /** Whether this chunk contains a table */
  containsTable: boolean;
  /** Whether this chunk contains a formula */
  containsFormula: boolean;
  /** ID of parent chunk in hierarchy (null for top-level chunks) */
  parentChunkId: string | null;
  /** Evidence spans mapping text back to source PDF */
  evidenceSpans: EvidenceSpan[];
  /** Embedded tables (if preserveAtomicUnits is true) */
  embeddedTables?: ExtractedTable[];
  /** Embedded formulas (if preserveAtomicUnits is true) */
  embeddedFormulas?: ExtractedFormula[];
}

/**
 * Result of chunking operation
 */
export interface ChunkingResult {
  /** All generated chunks */
  chunks: Chunk[];
  /** Statistics about the chunking process */
  statistics: ChunkingStatistics;
  /** Validation errors (empty if valid) */
  errors: ChunkingError[];
}

/**
 * Statistics about chunking results
 */
export interface ChunkingStatistics {
  /** Total number of chunks generated */
  totalChunks: number;
  /** Number of sections processed */
  totalSections: number;
  /** Average tokens per chunk */
  avgTokensPerChunk: number;
  /** Min tokens in any chunk */
  minTokensInChunk: number;
  /** Max tokens in any chunk */
  maxTokensInChunk: number;
  /** Percentage of chunks within target token range */
  percentWithinTargetRange: number;
  /** Number of tables preserved as atomic units */
  tablesPreserved: number;
  /** Number of formulas preserved as atomic units */
  formulasPreserved: number;
  /** Reconstruction check: concatenated chunks == original text */
  reconstructionValid: boolean;
}

/**
 * Error encountered during chunking
 */
export interface ChunkingError {
  /** Error type */
  type: 'ATOMIC_UNIT_SPLIT' | 'TOKEN_LIMIT_EXCEEDED' | 'RECONSTRUCTION_MISMATCH' | 'MISSING_EVIDENCE';
  /** Human-readable message */
  message: string;
  /** Chunk ID affected (if applicable) */
  chunkId?: string;
  /** Severity */
  severity: 'warning' | 'error';
}

/**
 * Internal representation of a section for chunking
 */
export interface SectionContext {
  /** Section ID */
  id: string;
  /** Section title */
  title: string;
  /** Heading level */
  level: number;
  /** All text blocks in this section */
  textBlocks: TextBlockWithMetadata[];
  /** Tables in this section */
  tables: ExtractedTable[];
  /** Formulas in this section */
  formulas: ExtractedFormula[];
}

/**
 * Text block with additional metadata for chunking
 */
export interface TextBlockWithMetadata extends TextBlock {
  /** Unique identifier for this block */
  blockId: string;
  /** Character offset from start of document */
  charStart: number;
  /** Character offset from start of document */
  charEnd: number;
  /** Estimated token count */
  tokenCount: number;
}

/**
 * Contract for chunking engines
 * 
 * @see docs/phases/phase-3/chunking-spec.md#algorithm
 */
export interface ChunkingEngine {
  /**
   * Chunk a parsed document into semantically coherent units
   * @param document - Parsed document from parser adapter
   * @param paperId - Paper identifier for chunk IDs
   * @param config - Optional chunking configuration
   * @returns Chunking result with chunks, statistics, and errors
   */
  chunk(document: ParsedDocument, paperId: string, config?: Partial<ChunkConfig>): Promise<ChunkingResult>;
  
  /**
   * Validate that chunks conform to invariants
   * @param chunks - Chunks to validate
   * @param originalText - Original document text for reconstruction check
   * @returns List of validation errors (empty if valid)
   */
  validate(chunks: Chunk[], originalText: string): ChunkingError[];
  
  /**
   * Get default configuration
   */
  getDefaultConfig(): ChunkConfig;
}

/**
 * Options for hierarchical chunk queries
 */
export interface ChunkQueryOptions {
  /** Filter by section title */
  sectionTitle?: string;
  /** Filter by heading level */
  sectionLevel?: number;
  /** Filter by page range */
  pageRange?: { start: number; end: number };
  /** Include chunks containing tables */
  includeTables?: boolean;
  /** Include chunks containing formulas */
  includeFormulas?: boolean;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Flattened view of chunks for backward compatibility
 */
export interface FlatChunk {
  id: string;
  paperId: string;
  sequence: number;
  text: string;
  tokenCount: number;
  startPage: number;
  endPage: number;
  metadata: Record<string, unknown>;
}
