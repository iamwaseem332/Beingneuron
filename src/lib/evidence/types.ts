// src/lib/evidence/types.ts
export interface TextSpan {
  chunkId: string;
  startChar: number;
  endChar: number;
  pageNumber: number;
}

export interface PdfCoordinate {
  pageNumber: number;
  x: number;      // pt from left edge
  y: number;      // pt from bottom edge (PDF coordinate system)
  width: number;  // pt
  height: number; // pt
}

export interface HighlightRegion {
  span: TextSpan;
  coordinates: PdfCoordinate[]; // Multiple rects for wrapped text
  nodeId: string;
  confidence: number;
}

export interface SyncState {
  activeNodeId: string | null;
  activeSpanIds: string[];
  pdfPage: number;
  pdfScrollY: number;
  highlightRegions: HighlightRegion[];
  syncSource: 'graph' | 'pdf' | 'none'; // Prevent feedback loops
}

export interface EvidencePanelProps {
  nodeId: string;
  entityType: string;
  normalizedForm: string;
  relations: Array<{ type: string; targetId: string }>;
  evidenceSpans: TextSpan[];
  confidence: number;
  onClose: () => void;
}
