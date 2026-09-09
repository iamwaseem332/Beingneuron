/**
 * Legacy pdf.js Adapter Implementation
 * 
 * Wraps existing pdf.js-based parsing logic in the new ParserAdapter interface.
 * Provides backward compatibility but with limited feature support.
 * 
 * This adapter returns empty arrays for unsupported features (tables, formulas)
 * and infers basic headings from font-size heuristics.
 * 
 * @see docs/phases/phase-3/parser-evaluation-report.md#legacy-fallback
 */

import {
  ParserAdapter,
  ParserFeature,
  ParseOptions,
  ParsedDocument,
  ParsedPage,
  TextBlock,
  ExtractedTable,
  ExtractedFormula,
  SectionNode,
  DocumentStructure,
  PaperMetadata,
  ParserFormatError,
} from './types';

// Dynamically import pdf.js (works in both browser and Node/Edge environments)
let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  if (pdfjsLib) {
    return pdfjsLib;
  }

  try {
    // Try dynamic import (works in bundler environments)
    const module = await import('pdfjs-dist');
    pdfjsLib = module;
    
    // Set worker source for Node/Edge environments
    if (typeof window === 'undefined') {
      const { GlobalWorkerOptions } = module;
      GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.min.js';
    }
    
    return module;
  } catch (error) {
    throw new Error(
      'pdf.js not available. Install with: npm install pdfjs-dist'
    );
  }
}

/**
 * Legacy pdf.js adapter implementation
 */
export class LegacyPdfJsAdapter implements ParserAdapter {
  async parse(
    pdfBuffer: ArrayBuffer,
    options?: ParseOptions
  ): Promise<ParsedDocument> {
    const pdfjs = await loadPdfJs();
    
    try {
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfBuffer),
      });

      const pdf = await loadingTask.promise;
      
      const maxPages = options?.maxPages ?? pdf.numPages;
      const pagesToParse = Math.min(maxPages, pdf.numPages);

      const pages: ParsedPage[] = [];
      const allTextBlocks: TextBlock[] = [];

      for (let pageNum = 1; pageNum <= pagesToParse; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        
        const textContent = await page.getTextContent();
        const textBlocks = this.extractTextBlocks(
          { items: textContent.items as Array<{ str: string; transform: number[]; fontName: string; hasEOL: boolean }> },
          pageNum,
          viewport
        );
        
        pages.push({
          pageNumber: pageNum,
          width: viewport.width,
          height: viewport.height,
          textBlocks,
          tables: [], // Not supported in legacy parser
          formulas: [], // Not supported in legacy parser
        });

        allTextBlocks.push(...textBlocks);
      }

      // Build basic metadata and structure from text
      const metadata = this.extractMetadata(allTextBlocks);
      const sections = this.inferSections(allTextBlocks);

      return {
        pages,
        metadata,
        structure: {
          title: metadata.title,
          authors: metadata.authors,
          abstract: this.extractAbstract(allTextBlocks),
          sections,
        },
        tables: [],
        formulas: [],
        readingOrder: allTextBlocks,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid PDF')) {
        throw new ParserFormatError('Invalid or corrupted PDF', error);
      }
      throw error;
    }
  }

  supports(feature: ParserFeature): boolean {
    switch (feature) {
      case 'TABLE_EXTRACTION':
        return false; // pdf.js doesn't extract tables
      case 'FORMULA_RECOGNITION':
        return false; // No formula support
      case 'HEADING_HIERARCHY':
        return true; // Basic inference from font size
      case 'TWO_COLUMN_HANDLING':
        return false; // Simple top-to-bottom reading
      case 'OFFLINE_CAPABLE':
        return true; // Runs locally
      default:
        return false;
    }
  }

  getProviderName(): string {
    return 'pdf.js';
  }

  /**
   * Extract text blocks from pdf.js text content
   */
  private extractTextBlocks(
    textContent: { items: Array<{ str: string; transform: number[]; fontName: string; hasEOL: boolean }> },
    pageNumber: number,
    viewport: { width: number; height: number }
  ): TextBlock[] {
    const blocks: TextBlock[] = [];
    const items = textContent.items as Array<{
      str: string;
      transform: number[];
      fontName: string;
      hasEOL: boolean;
    }>;

    // Group consecutive items on same line
    let currentLine: Array<typeof items[0]> = [];
    let lastY = -1;
    const yThreshold = 5; // Points tolerance for same line

    for (const item of items) {
      const y = item.transform[5]; // Y coordinate in PDF transform matrix

      if (lastY >= 0 && Math.abs(y - lastY) > yThreshold) {
        // New line - flush current line as block
        if (currentLine.length > 0) {
          const block = this.createTextBlock(currentLine, pageNumber, viewport);
          if (block) blocks.push(block);
          currentLine = [];
        }
      }

      currentLine.push(item);
      lastY = y;
    }

    // Flush remaining line
    if (currentLine.length > 0) {
      const block = this.createTextBlock(currentLine, pageNumber, viewport);
      if (block) blocks.push(block);
    }

    return blocks;
  }

  /**
   * Create a TextBlock from a line of text items
   */
  private createTextBlock(
    items: Array<{ str: string; transform: number[]; fontName: string }>,
    pageNumber: number,
    viewport: { width: number; height: number }
  ): TextBlock | null {
    const text = items.map(i => i.str).join(' ').trim();
    if (!text) return null;

    // Estimate bounding box from first and last item
    const firstTransform = items[0].transform;
    const lastTransform = items[items.length - 1].transform;

    const x = firstTransform[4];
    const y = firstTransform[5];
    const width = lastTransform[4] + lastTransform[2] - x;
    const height = firstTransform[3];

    // Infer type from font size (heuristic)
    const fontSize = firstTransform[3];
    const type: TextBlock['type'] = this.inferBlockType(fontSize, text);

    return {
      text,
      pageNumber,
      boundingBox: { x, y, width: Math.max(width, 10), height: Math.max(height, 10) },
      type,
      confidence: 0.7, // Lower confidence due to heuristic nature
    };
  }

  /**
   * Infer block type from font size and content
   */
  private inferBlockType(fontSize: number, text: string): TextBlock['type'] {
    // Heuristics based on typical PDF font sizes
    if (fontSize >= 18 || text.match(/^\d+\s+Introduction|Abstract|Methods|Results|Discussion/i)) {
      return 'heading';
    }
    if (fontSize >= 14) {
      return 'heading';
    }
    if (text.startsWith('•') || text.startsWith('-') || text.match(/^\d+\./)) {
      return 'list_item';
    }
    if (text.toLowerCase().startsWith('figure ') || text.toLowerCase().startsWith('table ')) {
      return 'caption';
    }
    return 'paragraph';
  }

  /**
   * Extract basic metadata from text blocks
   */
  private extractMetadata(textBlocks: TextBlock[]): PaperMetadata {
    const allText = textBlocks.map(b => b.text).join('\n');
    const lines = allText.split('\n').filter(l => l.trim().length > 0);

    // First non-empty line is often the title
    const title = lines[0]?.trim() || '';
    
    // Next few lines might be authors (simple heuristic)
    const authors: string[] = [];
    for (let i = 1; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      if (line.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/) && line.length < 100) {
        authors.push(line);
      }
    }

    return { title, authors };
  }

  /**
   * Infer section hierarchy from heading blocks
   */
  private inferSections(textBlocks: TextBlock[]): SectionNode[] {
    const sections: SectionNode[] = [];
    const headingBlocks = textBlocks.filter(b => b.type === 'heading');
    
    let charOffset = 0;
    
    for (const block of headingBlocks) {
      // Determine level from font size or numbering
      const level = this.determineHeadingLevel(block.text);
      
      sections.push({
        id: `section-${sections.length}`,
        title: block.text,
        level,
        startPage: block.pageNumber,
        endPage: block.pageNumber,
        charStart: charOffset,
        charEnd: charOffset + block.text.length,
        children: [],
      });
      
      charOffset += block.text.length;
    }

    // Build simple flat hierarchy (no nesting detection in legacy parser)
    return sections.filter(s => s.level === 1);
  }

  /**
   * Determine heading level from text patterns
   */
  private determineHeadingLevel(text: string): number {
    if (text.match(/^\d+\.\d+\.\d+/)) return 3;
    if (text.match(/^\d+\.\d+/)) return 2;
    if (text.match(/^\d+\./) || text.match(/^Introduction|Methods|Results|Discussion/i)) {
      return 1;
    }
    return 1;
  }

  /**
   * Extract abstract (look for "Abstract" heading and following text)
   */
  private extractAbstract(textBlocks: TextBlock[]): string {
    const abstractIndex = textBlocks.findIndex(
      b => b.type === 'heading' && b.text.toLowerCase().includes('abstract')
    );

    if (abstractIndex >= 0 && abstractIndex < textBlocks.length - 1) {
      // Return next block as abstract content
      return textBlocks[abstractIndex + 1].text;
    }

    return '';
  }
}
