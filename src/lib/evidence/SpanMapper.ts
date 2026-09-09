// src/lib/evidence/SpanMapper.ts
import { TextSpan, PdfCoordinate, HighlightRegion } from './types';

// Import Phase 3 types for ParsedDocument and TextBlock
interface TextBlock {
  id: string;
  pageNumber: number;
  charStart: number;
  charEnd: number;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface ParsedDocument {
  id: string;
  readingOrder: TextBlock[];
  pages: Array<{ pageNumber: number; width: number; height: number }>;
}

export class SpanMapper {
  /**
   * Maps char-offset span to PDF coordinates using parsed text block metadata
   * from Phase 3's ParsedDocument.readingOrder
   */
  mapSpanToCoordinates(
    span: TextSpan, 
    parsedDoc: ParsedDocument,
    chunkText: string
  ): HighlightRegion {
    // 1. Locate TextBlocks containing span via char offset correlation
    const relevantBlocks = this.findBlocksContainingSpan(span, parsedDoc);
    
    // 2. For each block, compute sub-block char range and interpolate position
    const coordinates: PdfCoordinate[] = [];
    let remainingChars = span.endChar - span.startChar;
    
    for (const block of relevantBlocks) {
      const blockStartInSpan = Math.max(0, block.charStart - span.startChar);
      const blockEndInSpan = Math.min(block.charEnd - block.charStart, remainingChars);
      
      if (blockEndInSpan <= 0) continue;
      
      // Interpolate within block bounding box based on char proportion
      const blockLength = block.charEnd - block.charStart;
      if (blockLength === 0) continue;
      
      const charProportionStart = blockStartInSpan / blockLength;
      const charProportionEnd = (blockStartInSpan + blockEndInSpan) / blockLength;
      
      coordinates.push({
        pageNumber: block.pageNumber,
        x: block.boundingBox.x + (block.boundingBox.width * charProportionStart),
        y: block.boundingBox.y,
        width: block.boundingBox.width * (charProportionEnd - charProportionStart),
        height: block.boundingBox.height
      });
      
      remainingChars -= blockEndInSpan;
    }
    
    return {
      span,
      coordinates,
      nodeId: '', // Set by caller
      confidence: this.computeMappingConfidence(relevantBlocks, span)
    };
  }
  
  private findBlocksContainingSpan(span: TextSpan, parsedDoc: ParsedDocument): TextBlock[] {
    return parsedDoc.readingOrder.filter(block => 
      block.pageNumber === span.pageNumber &&
      block.charStart < span.endChar &&
      block.charEnd > span.startChar
    );
  }
  
  private computeMappingConfidence(blocks: TextBlock[], span: TextSpan): number {
    if (blocks.length === 0) return 0;
    
    // Confidence based on block boundary alignment and parser confidence
    const exactBoundaryMatch = blocks.some(b => 
      b.charStart === span.startChar || b.charEnd === span.endChar
    );
    const avgBlockConfidence = blocks.reduce((sum, b) => sum + b.confidence, 0) / blocks.length;
    return exactBoundaryMatch ? avgBlockConfidence : avgBlockConfidence * 0.8;
  }
}
