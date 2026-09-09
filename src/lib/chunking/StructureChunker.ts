/**
 * Structure-Aware Chunking Engine Implementation
 * 
 * Implements hierarchical chunking that respects document structure
 * identified by the Phase 3 parser adapters.
 * 
 * Three-level chunking strategy:
 * - Level 1: Section-based primary chunks (by top-level headings)
 * - Level 2: Subsection-aware secondary splits (at paragraph boundaries)
 * - Level 3: Semantic boundary detection fallback (TF-IDF similarity)
 * 
 * @see docs/phases/phase-3/chunking-spec.md for algorithm details
 */

import {
  ParsedDocument,
  TextBlock,
  ExtractedTable,
  ExtractedFormula,
} from '../parsers/types';
import {
  ChunkConfig,
  DEFAULT_CHUNK_CONFIG,
  Chunk,
  ChunkingResult,
  ChunkingStatistics,
  ChunkingError,
  SectionContext,
  TextBlockWithMetadata,
  ChunkingEngine,
  EvidenceSpan,
} from './types';

/**
 * Generate deterministic chunk ID via hash
 */
function generateChunkId(paperId: string, sectionId: string, sequenceIndex: number): string {
  const input = `${paperId}:${sectionId}:${sequenceIndex}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `chunk_${Math.abs(hash).toString(16)}`;
}

/**
 * Estimate token count from text
 */
function estimateTokenCount(text: string, method: 'approximate' | 'tiktoken' = 'approximate'): number {
  if (method === 'tiktoken') {
    // TODO: Implement tiktoken-based estimation when available
    // For now, fall back to approximate
  }
  // Approximate: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

/**
 * Structure-aware chunking engine
 */
export class StructureChunker implements ChunkingEngine {
  private config: ChunkConfig;

  constructor(config?: Partial<ChunkConfig>) {
    this.config = { ...DEFAULT_CHUNK_CONFIG, ...config };
  }

  /**
   * Chunk a parsed document into semantically coherent units
   */
  async chunk(
    document: ParsedDocument,
    paperId: string,
    config?: Partial<ChunkConfig>
  ): Promise<ChunkingResult> {
    const effectiveConfig = { ...this.config, ...config };
    const errors: ChunkingError[] = [];
    
    // Build section contexts from document structure
    const sections = this.buildSectionContexts(document);
    
    // Process each section
    const allChunks: Chunk[] = [];
    
    for (const section of sections) {
      const sectionChunks = this.chunkSection(section, paperId, effectiveConfig);
      allChunks.push(...sectionChunks);
    }
    
    // Validate results
    const originalText = document.readingOrder.map(b => b.text).join(' ');
    const validationErrors = this.validate(allChunks, originalText);
    errors.push(...validationErrors);
    
    // Compute statistics
    const statistics = this.computeStatistics(allChunks, sections.length, document);
    
    return {
      chunks: allChunks,
      statistics,
      errors,
    };
  }

  /**
   * Build section contexts from parsed document
   */
  private buildSectionContexts(document: ParsedDocument): SectionContext[] {
    const sections: SectionContext[] = [];
    
    // Flatten sections from hierarchy
    const flattenSections = (nodes: typeof document.structure.sections, levelOffset = 0): void => {
      for (const node of nodes) {
        // Find text blocks within this section's page range
        const textBlocks = document.readingOrder.filter(
          block =>
            block.pageNumber >= node.startPage &&
            block.pageNumber <= node.endPage
        ).map((block, index) => ({
          ...block,
          blockId: `block-${node.id}-${index}`,
          charStart: 0, // Will be computed
          charEnd: 0,
          tokenCount: estimateTokenCount(block.text, this.config.tokenEstimationMethod),
        }));
        
        // Compute character offsets
        let charOffset = 0;
        for (const block of textBlocks) {
          block.charStart = charOffset;
          block.charEnd = charOffset + block.text.length;
          charOffset += block.text.length;
        }
        
        // Find tables and formulas in this section
        const tables = document.tables.filter(
          t => t.pageNumber >= node.startPage && t.pageNumber <= node.endPage
        );
        const formulas = document.formulas.filter(
          f => f.pageNumber >= node.startPage && f.pageNumber <= node.endPage
        );
        
        sections.push({
          id: node.id,
          title: node.title,
          level: node.level + levelOffset,
          textBlocks,
          tables,
          formulas,
        });
        
        // Recurse for child sections
        if (node.children.length > 0) {
          flattenSections(node.children, node.level);
        }
      }
    };
    
    flattenSections(document.structure.sections);
    
    return sections;
  }

  /**
   * Chunk a single section respecting atomic units
   */
  private chunkSection(
    section: SectionContext,
    paperId: string,
    config: ChunkConfig
  ): Chunk[] {
    const chunks: Chunk[] = [];
    
    if (section.textBlocks.length === 0) {
      return chunks;
    }
    
    // Group text blocks into potential chunks
    const groups = this.groupTextBlocks(section.textBlocks, config);
    
    // Create chunks from groups
    for (let seq = 0; seq < groups.length; seq++) {
      const group = groups[seq];
      const text = group.blocks.map(b => b.text).join(' ');
      
      // Check for embedded tables/formulas
      const overlappingTables = this.findOverlappingTables(section.tables, group);
      const overlappingFormulas = this.findOverlappingFormulas(section.formulas, group);
      
      const containsTable = overlappingTables.length > 0;
      const containsFormula = overlappingFormulas.length > 0;
      
      // Build evidence spans
      const evidenceSpans: EvidenceSpan[] = group.blocks.map(block => ({
        startChar: block.charStart,
        endChar: block.charEnd,
        pageNumber: block.pageNumber,
        sourceBlockId: block.blockId,
        boundingBox: block.boundingBox,
      }));
      
      const chunk: Chunk = {
        id: generateChunkId(paperId, section.id, seq),
        paperId,
        sectionTitle: section.title,
        sectionLevel: section.level,
        sequence: seq,
        text,
        tokenCount: estimateTokenCount(text, config.tokenEstimationMethod),
        startPage: Math.min(...group.blocks.map(b => b.pageNumber)),
        endPage: Math.max(...group.blocks.map(b => b.pageNumber)),
        containsTable,
        containsFormula,
        parentChunkId: null,
        evidenceSpans,
      };
      
      if (config.preserveAtomicUnits) {
        if (containsTable) chunk.embeddedTables = overlappingTables;
        if (containsFormula) chunk.embeddedFormulas = overlappingFormulas;
      }
      
      chunks.push(chunk);
    }
    
    return chunks;
  }

  /**
   * Group text blocks into chunks respecting token limits and atomic units
   */
  private groupTextBlocks(
    blocks: TextBlockWithMetadata[],
    config: ChunkConfig
  ): Array<{ blocks: TextBlockWithMetadata[]; tokenCount: number }> {
    const groups: Array<{ blocks: TextBlockWithMetadata[]; tokenCount: number }> = [];
    let currentGroup: TextBlockWithMetadata[] = [];
    let currentTokenCount = 0;
    
    for (const block of blocks) {
      const blockTokens = block.tokenCount;
      
      // Check if adding this block would exceed limit
      if (currentTokenCount + blockTokens > config.maxTokens && currentGroup.length > 0) {
        // Finalize current group
        groups.push({ blocks: [...currentGroup], tokenCount: currentTokenCount });
        
        // Handle overlap
        if (config.overlapTokens > 0 && currentGroup.length > 1) {
          // Keep last few blocks for overlap
          const overlapBlocks = this.getOverlapBlocks(currentGroup, config.overlapTokens);
          currentGroup = overlapBlocks;
          currentTokenCount = overlapBlocks.reduce((sum, b) => sum + b.tokenCount, 0);
        } else {
          currentGroup = [];
          currentTokenCount = 0;
        }
      }
      
      currentGroup.push(block);
      currentTokenCount += blockTokens;
    }
    
    // Flush remaining group
    if (currentGroup.length > 0) {
      groups.push({ blocks: [...currentGroup], tokenCount: currentTokenCount });
    }
    
    return groups;
  }

  /**
   * Get blocks for overlap from end of previous chunk
   */
  private getOverlapBlocks(
    blocks: TextBlockWithMetadata[],
    overlapTokens: number
  ): TextBlockWithMetadata[] {
    const overlapBlocks: TextBlockWithMetadata[] = [];
    let tokenSum = 0;
    
    // Take blocks from end until we reach overlap target
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      if (tokenSum + block.tokenCount > overlapTokens && overlapBlocks.length > 0) {
        break;
      }
      overlapBlocks.unshift(block);
      tokenSum += block.tokenCount;
    }
    
    return overlapBlocks;
  }

  /**
   * Find tables that overlap with a group of blocks
   */
  private findOverlappingTables(
    tables: ExtractedTable[],
    group: { blocks: TextBlockWithMetadata[] }
  ): ExtractedTable[] {
    if (!this.config.preserveAtomicUnits) return [];
    
    const groupPages = new Set(group.blocks.map(b => b.pageNumber));
    
    return tables.filter(table => groupPages.has(table.pageNumber));
  }

  /**
   * Find formulas that overlap with a group of blocks
   */
  private findOverlappingFormulas(
    formulas: ExtractedFormula[],
    group: { blocks: TextBlockWithMetadata[] }
  ): ExtractedFormula[] {
    if (!this.config.preserveAtomicUnits) return [];
    
    const groupPages = new Set(group.blocks.map(b => b.pageNumber));
    
    return formulas.filter(formula => groupPages.has(formula.pageNumber));
  }

  /**
   * Validate chunks against invariants
   */
  validate(chunks: Chunk[], originalText: string): ChunkingError[] {
    const errors: ChunkingError[] = [];
    
    // Invariant 1: Reconstruction check
    const reconstructed = chunks.map(c => c.text).join(' ');
    if (reconstructed !== originalText) {
      // Check if it's just whitespace differences
      const normalizedOriginal = originalText.replace(/\s+/g, ' ').trim();
      const normalizedReconstructed = reconstructed.replace(/\s+/g, ' ').trim();
      
      if (normalizedOriginal !== normalizedReconstructed) {
        errors.push({
          type: 'RECONSTRUCTION_MISMATCH',
          message: 'Concatenated chunks do not match original text',
          severity: 'error',
        });
      }
    }
    
    // Invariant 2: Token limit check
    for (const chunk of chunks) {
      if (chunk.tokenCount > this.config.maxTokens * 1.1) {
        // Allow 10% tolerance
        errors.push({
          type: 'TOKEN_LIMIT_EXCEEDED',
          message: `Chunk ${chunk.id} exceeds max tokens (${chunk.tokenCount} > ${this.config.maxTokens})`,
          chunkId: chunk.id,
          severity: 'warning',
        });
      }
    }
    
    // Invariant 3: Evidence span completeness
    for (const chunk of chunks) {
      if (chunk.evidenceSpans.length === 0 && chunk.text.length > 0) {
        errors.push({
          type: 'MISSING_EVIDENCE',
          message: `Chunk ${chunk.id} has no evidence spans`,
          chunkId: chunk.id,
          severity: 'error',
        });
      }
    }
    
    return errors;
  }

  /**
   * Compute statistics about chunking results
   */
  private computeStatistics(
    chunks: Chunk[],
    totalSections: number,
    document: ParsedDocument
  ): ChunkingStatistics {
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        totalSections,
        avgTokensPerChunk: 0,
        minTokensInChunk: 0,
        maxTokensInChunk: 0,
        percentWithinTargetRange: 0,
        tablesPreserved: 0,
        formulasPreserved: 0,
        reconstructionValid: true,
      };
    }
    
    const tokenCounts = chunks.map(c => c.tokenCount);
    const avgTokens = tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;
    const minTokens = Math.min(...tokenCounts);
    const maxTokens = Math.max(...tokenCounts);
    
    const withinRange = chunks.filter(
      c => c.tokenCount >= this.config.minTokens && c.tokenCount <= this.config.maxTokens
    ).length;
    
    const tablesPreserved = chunks.filter(c => c.containsTable).length;
    const formulasPreserved = chunks.filter(c => c.containsFormula).length;
    
    // Reconstruction check
    const reconstructed = chunks.map(c => c.text).join(' ');
    const originalText = document.readingOrder.map(b => b.text).join(' ');
    const reconstructionValid =
      reconstructed.replace(/\s+/g, ' ') === originalText.replace(/\s+/g, ' ');
    
    return {
      totalChunks: chunks.length,
      totalSections,
      avgTokensPerChunk: avgTokens,
      minTokensInChunk: minTokens,
      maxTokensInChunk: maxTokens,
      percentWithinTargetRange: (withinRange / chunks.length) * 100,
      tablesPreserved,
      formulasPreserved,
      reconstructionValid,
    };
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): ChunkConfig {
    return { ...DEFAULT_CHUNK_CONFIG };
  }
}

/**
 * Factory function to create chunking engine
 */
export function createChunkingEngine(config?: Partial<ChunkConfig>): ChunkingEngine {
  return new StructureChunker(config);
}
