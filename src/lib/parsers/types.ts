/**
 * Type definitions for the Phase 3 Parser Adapter Pattern
 * 
 * These interfaces define the contract that all parser implementations
 * (LlamaParse, Marker, Legacy pdf.js) must adhere to.
 * 
 * @see docs/phases/phase-3/parser-evaluation-report.md for selection rationale
 * @see docs/phases/phase-3/chunking-spec.md for downstream usage
 */

/**
 * Represents a contiguous block of text extracted from a specific page
 */
export interface TextBlock {
  /** The actual text content */
  text: string;
  /** 1-indexed page number */
  pageNumber: number;
  /** Bounding box in PDF coordinates (points, 72 per inch) */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Semantic type of this block */
  type: 'paragraph' | 'heading' | 'caption' | 'list_item' | 'footnote';
  /** Parser confidence score 0.0 - 1.0 */
  confidence: number;
}

/**
 * Represents a table extracted from the document with multiple representations
 */
export interface ExtractedTable {
  /** Markdown representation of the table */
  markdown: string;
  /** HTML representation for rich rendering */
  html: string;
  /** 1-indexed page number where table appears */
  pageNumber: number;
  /** Bounding box encompassing the entire table */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Column headers (empty array if no headers detected) */
  headers: string[];
  /** Number of data rows (excluding header) */
  rowCount: number;
  /** Number of columns */
  colCount: number;
}

/**
 * Represents a mathematical formula with LaTeX and MathML representations
 */
export interface ExtractedFormula {
  /** LaTeX representation */
  latex: string;
  /** MathML representation (null if not available) */
  mathml: string | null;
  /** 1-indexed page number */
  pageNumber: number;
  /** Bounding box of the formula */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** True if inline formula, false if display/block formula */
  isInline: boolean;
}

/**
 * Represents a node in the document's section hierarchy
 */
export interface SectionNode {
  /** Unique identifier (generated via hash of title + path) */
  id: string;
  /** Section title text */
  title: string;
  /** Heading level (1 = top-level, 2 = subsection, etc.) */
  level: number;
  /** 1-indexed start page */
  startPage: number;
  /** 1-indexed end page */
  endPage: number;
  /** Character offset from start of document */
  charStart: number;
  /** Character offset from start of document */
  charEnd: number;
  /** Child sections (empty array if leaf node) */
  children: SectionNode[];
}

/**
 * Represents the hierarchical structure of the document
 */
export interface DocumentStructure {
  /** Document title */
  title: string;
  /** List of authors */
  authors: string[];
  /** Abstract text */
  abstract: string;
  /** Root section nodes */
  sections: SectionNode[];
}

/**
 * Metadata extracted from the paper
 */
export interface PaperMetadata {
  title: string;
  authors: string[];
  abstract?: string;
  keywords?: string[];
  doi?: string;
  arxivId?: string;
  publicationVenue?: string;
  publicationYear?: number;
}

/**
 * Represents a single parsed page
 */
export interface ParsedPage {
  pageNumber: number;
  width: number;
  height: number;
  textBlocks: TextBlock[];
  tables: ExtractedTable[];
  formulas: ExtractedFormula[];
}

/**
 * Complete parsed document output from any parser adapter
 */
export interface ParsedDocument {
  /** All pages with their content */
  pages: ParsedPage[];
  /** Document metadata */
  metadata: PaperMetadata;
  /** Hierarchical section structure */
  structure: DocumentStructure;
  /** All extracted tables */
  tables: ExtractedTable[];
  /** All extracted formulas */
  formulas: ExtractedFormula[];
  /** Text blocks in reading order */
  readingOrder: TextBlock[];
}

/**
 * Features that parsers may support
 */
export type ParserFeature = 
  | 'TABLE_EXTRACTION' 
  | 'FORMULA_RECOGNITION' 
  | 'HEADING_HIERARCHY' 
  | 'TWO_COLUMN_HANDLING' 
  | 'OFFLINE_CAPABLE';

/**
 * Configuration options for parsing
 */
export interface ParseOptions {
  /** Maximum number of pages to parse (undefined = all) */
  maxPages?: number;
  /** Whether to extract tables (default: true) */
  extractTables?: boolean;
  /** Whether to extract formulas (default: true) */
  extractFormulas?: boolean;
  /** Whether to preserve reading order (default: true) */
  preserveReadingOrder?: boolean;
}

/**
 * Contract that all parser adapters must implement
 * 
 * @see docs/phases/phase-3/parser-evaluation-report.md#adapter-pattern
 */
export interface ParserAdapter {
  /**
   * Parse a PDF buffer into structured document representation
   * @param pdfBuffer - Raw PDF bytes as ArrayBuffer
   * @param options - Optional parsing configuration
   * @returns Promise resolving to parsed document structure
   * @throws {ParserAuthError} When authentication fails (LlamaParse)
   * @throws {ParserTimeoutError} When parsing exceeds timeout
   * @throws {ParserFormatError} When PDF is malformed or unsupported
   */
  parse(pdfBuffer: ArrayBuffer, options?: ParseOptions): Promise<ParsedDocument>;
  
  /**
   * Check if this parser supports a specific feature
   * @param feature - The feature to check
   * @returns True if supported, false otherwise
   */
  supports(feature: ParserFeature): boolean;
  
  /**
   * Get the name of the parser provider
   * @returns Provider name (e.g., "LlamaParse", "Marker", "pdf.js")
   */
  getProviderName(): string;
}

/**
 * Base error class for parser-related errors
 */
export class ParserError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ParserError';
  }
}

/**
 * Authentication failure (e.g., invalid API key)
 */
export class ParserAuthError extends ParserError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ParserAuthError';
  }
}

/**
 * Parsing operation timed out
 */
export class ParserTimeoutError extends ParserError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ParserTimeoutError';
  }
}

/**
 * PDF format error or unsupported feature
 */
export class ParserFormatError extends ParserError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ParserFormatError';
  }
}

/**
 * Memory limit exceeded (WASM-specific)
 */
export class ParserMemoryError extends ParserError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ParserMemoryError';
  }
}
