# Phase 7: Span Mapper Specification

## Overview

The SpanMapper component maps character-offset evidence spans from Phase 4 extraction results to precise PDF coordinates for visual highlighting, enabling bidirectional synchronization between graph nodes and source document passages.

## Core Types

### TextSpan
```typescript
interface TextSpan {
  chunkId: string;      // References Phase 3 chunk
  startChar: number;    // Character offset within chunk
  endChar: number;      // Exclusive end offset
  pageNumber: number;   // PDF page number (1-indexed)
}
```

### PdfCoordinate
```typescript
interface PdfCoordinate {
  pageNumber: number;   // PDF page (1-indexed)
  x: number;            // Points from left edge
  y: number;            // Points from bottom edge (PDF coordinate system)
  width: number;        // Width in points
  height: number;       // Height in points
}
```

### HighlightRegion
```typescript
interface HighlightRegion {
  span: TextSpan;
  coordinates: PdfCoordinate[];  // Multiple rects for wrapped text
  nodeId: string;
  confidence: number;            // 0-1 mapping confidence score
}
```

## Interpolation Algorithm

The SpanMapper uses Phase 3's `ParsedDocument.readingOrder` TextBlocks to interpolate character offsets to PDF coordinates:

### Step 1: Block Location
Find all TextBlocks where:
- `block.pageNumber === span.pageNumber`
- `block.charStart < span.endChar`
- `block.charEnd > span.startChar`

### Step 2: Proportional Interpolation
For each overlapping block:
```
blockLength = block.charEnd - block.charStart
charProportionStart = max(0, block.charStart - span.startChar) / blockLength
charProportionEnd = min(blockLength, remainingChars) / blockLength

coordinate.x = block.boundingBox.x + (block.boundingBox.width * charProportionStart)
coordinate.width = block.boundingBox.width * (charProportionEnd - charProportionStart)
coordinate.y = block.boundingBox.y
coordinate.height = block.boundingBox.height
```

### Step 3: Confidence Scoring
```
if exactBoundaryMatch (span starts/ends at block boundary):
  confidence = avgBlockConfidence
else:
  confidence = avgBlockConfidence * 0.8
```

## Edge Cases

### Multi-Block Spans
When a span crosses multiple TextBlocks (e.g., wrapped text), the algorithm produces multiple `PdfCoordinate` rectangles. The EvidencePanel renders all rectangles as separate highlight overlays.

### Missing Block Metadata
If no TextBlocks overlap the span:
- Return empty `coordinates` array
- Set `confidence = 0`
- UI displays page-level fallback with warning indicator

### Cross-Page Spans
Spans should not cross page boundaries due to Phase 3 chunking constraints. If detected:
- Split span at page boundary
- Log warning for Phase 3 investigation

## Fallback Strategy

| Condition | Fallback Behavior |
|-----------|-------------------|
| No matching blocks | Page-level highlight with ⚠️ icon |
| Low confidence (<0.7) | Dashed border, yellow overlay |
| Coordinate computation error | Skip highlight, log to audit trail |

## Performance Characteristics

- **Time Complexity**: O(n) where n = number of TextBlocks on page
- **Memory**: O(m) where m = number of coordinate rectangles produced
- **Typical Latency**: <5ms per span on desktop, <15ms on mobile

## Testing Guidelines

Unit tests should verify:
1. Exact boundary matches produce high confidence
2. Inexact boundaries produce reduced confidence
3. Multi-block spans produce multiple coordinates
4. Page attribution is 100% accurate
5. Confidence scores correlate with ground truth overlap

Integration tests should verify:
1. Highlight geometry matches visual text position
2. Wrapped text highlights are contiguous
3. Scroll-to-highlight centers the region

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-09-10 | Initial implementation |
