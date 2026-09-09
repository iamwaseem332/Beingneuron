// src/lib/evidence/SyncManager.ts
import { TextSpan, HighlightRegion, SyncState } from './types';
import { SpanMapper } from './SpanMapper';

interface ParsedDocument {
  id: string;
  readingOrder: any[];
  pages: Array<{ pageNumber: number; width: number; height: number }>;
}

interface GraphNode {
  id: string;
  spanId: string;
  evidenceSpans: TextSpan[];
}

interface PdfViewer {
  scrollToRegion: (region: HighlightRegion, options?: ScrollIntoViewOptions) => void;
  getCurrentPage: () => number;
  getScrollY: () => number;
}

interface GraphRenderer {
  focusNode: (nodeId: string, options?: { animate: boolean }) => void;
}

export class SyncManager {
  private state: SyncState;
  private debounceTimer: NodeJS.Timeout | null = null;
  private spanMapper: SpanMapper;
  private pdfViewer: PdfViewer;
  private graphRenderer: GraphRenderer;
  private parsedDoc: ParsedDocument;
  private chunkText: string;
  private allNodes: GraphNode[];

  constructor(
    parsedDoc: ParsedDocument,
    chunkText: string,
    pdfViewer: PdfViewer,
    graphRenderer: GraphRenderer,
    allNodes: GraphNode[]
  ) {
    this.state = {
      activeNodeId: null,
      activeSpanIds: [],
      pdfPage: 1,
      pdfScrollY: 0,
      highlightRegions: [],
      syncSource: 'none'
    };
    this.spanMapper = new SpanMapper();
    this.pdfViewer = pdfViewer;
    this.graphRenderer = graphRenderer;
    this.parsedDoc = parsedDoc;
    this.chunkText = chunkText;
    this.allNodes = allNodes;
  }

  getState(): SyncState {
    return { ...this.state };
  }

  // Graph → PDF: User clicks node
  onNodeSelect(nodeId: string, spans: TextSpan[]): void {
    if (this.state.syncSource === 'pdf') return; // Prevent loop
    
    const regions = spans.map(span => {
      const region = this.spanMapper.mapSpanToCoordinates(span, this.parsedDoc, this.chunkText);
      return { ...region, nodeId };
    });
    
    this.updateState({
      activeNodeId: nodeId,
      activeSpanIds: spans.map(s => `${s.chunkId}:${s.startChar}`),
      pdfPage: regions[0]?.coordinates[0]?.pageNumber ?? this.state.pdfPage,
      highlightRegions: regions,
      syncSource: 'graph'
    });
    
    // Scroll PDF to first highlight region with smooth animation
    if (regions[0]) {
      this.pdfViewer.scrollToRegion(regions[0], { behavior: 'smooth', block: 'center' });
    }
  }
  
  // PDF → Graph: User selects text in PDF
  onPdfTextSelect(pageNumber: number, charRange: {start: number, end: number}): void {
    if (this.state.syncSource === 'graph') return;
    
    // Reverse lookup: find entities whose evidence spans overlap selection
    const matchingNodes = this.findNodesOverlappingSpan(pageNumber, charRange);
    
    if (matchingNodes.length > 0) {
      this.updateState({
        activeNodeId: matchingNodes[0].id,
        activeSpanIds: matchingNodes.map(n => n.spanId),
        syncSource: 'pdf'
      });
      
      // Pan/zoom graph to center selected node
      this.graphRenderer.focusNode(matchingNodes[0].id, { animate: true });
    }
  }
  
  // Debounced scroll sync to prevent jitter
  onPdfScroll(pageNumber: number, scrollY: number): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      // Update active highlights based on visible page
      this.refreshHighlightsForPage(pageNumber);
    }, 50);
  }

  private updateState(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial };
  }

  private findNodesOverlappingSpan(pageNumber: number, charRange: {start: number, end: number}): GraphNode[] {
    return this.allNodes.filter(node => 
      node.evidenceSpans.some(span => 
        span.pageNumber === pageNumber &&
        span.startChar < charRange.end &&
        span.endChar > charRange.start
      )
    );
  }

  private refreshHighlightsForPage(pageNumber: number): void {
    const visibleRegions = this.state.highlightRegions.filter(
      region => region.coordinates.some(coord => coord.pageNumber === pageNumber)
    );
    // In a real implementation, this would update the visible highlights
    console.log('Refreshing highlights for page', pageNumber, ':', visibleRegions.length, 'regions');
  }

  clearSelection(): void {
    this.updateState({
      activeNodeId: null,
      activeSpanIds: [],
      highlightRegions: [],
      syncSource: 'none'
    });
  }
}
