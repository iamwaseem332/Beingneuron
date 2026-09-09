# Phase 7: Troubleshooting Guide

## Common Issues and Resolutions

This guide provides diagnostic steps and remediation strategies for common issues encountered when operating the Evidence Linking System.

---

## Issue Category 1: Highlight Misalignment

### Symptom: Highlights don't match text position in PDF

**Diagnostic Steps**:
1. Check browser console for SpanMapper warnings
2. Verify `confidence` score in evidence panel (<0.7 indicates low confidence)
3. Inspect PDF structure: is it multi-column or table-heavy?

**Likely Causes**:
| Cause | Probability | Detection |
|-------|-------------|-----------|
| Parser confidence <0.7 | High | Check `block.confidence` in readingOrder |
| Complex table layout | Medium | Visual inspection of PDF |
| Font rendering mismatch | Low | Compare text layer vs rendered glyphs |

**Resolution**:
```typescript
// For low-confidence spans, use page-level fallback
if (region.confidence < 0.7) {
  renderPageLevelHighlight(region.span.pageNumber);
  showWarningIcon();
}
```

**Prevention**: Ensure Phase 3 parser is configured with appropriate language models for document type.

---

## Issue Category 2: Sync Feedback Loops

### Symptom: Graph and PDF rapidly toggle selections

**Diagnostic Steps**:
1. Open React DevTools, inspect `SyncManager.state.syncSource`
2. Check if both `onNodeSelect` and `onPdfTextSelect` firing rapidly
3. Review console logs for "blocked" messages

**Likely Causes**:
| Cause | Probability | Detection |
|-------|-------------|-----------|
| syncSource flag not set | High | State shows 'none' during updates |
| Debounce timer cleared prematurely | Medium | Scroll events fire without delay |
| Multiple event listeners attached | Low | Duplicate handlers in memory |

**Resolution**:
```typescript
// Ensure syncSource is set BEFORE triggering actions
onNodeSelect(nodeId, spans) {
  if (this.state.syncSource === 'pdf') return;
  
  this.updateState({ syncSource: 'graph' }); // Set first!
  
  // Then trigger PDF scroll
  this.pdfViewer.scrollToRegion(...);
}
```

**Prevention**: Code review checklist includes syncSource verification.

---

## Issue Category 3: Panel Not Opening

### Symptom: Clicking node doesn't open evidence panel

**Diagnostic Steps**:
1. Verify node has `evidenceSpans` array (not empty)
2. Check React component state for `activeNodeId`
3. Inspect CSS for `display: none` or z-index conflicts

**Likely Causes**:
| Cause | Probability | Detection |
|-------|-------------|-----------|
| Empty evidence spans | High | Node data shows `evidenceSpans: []` |
| Panel render condition false | Medium | React DevTools shows component unmounted |
| CSS overflow hidden | Low | Computed styles show clipping |

**Resolution**:
```typescript
// Handle empty evidence gracefully
{evidenceSpans.length === 0 ? (
  <EmptyState message="No evidence available for this entity" />
) : (
  <EvidencePanel {...props} />
)}
```

**Prevention**: Backend should never return nodes without evidence spans unless explicitly marked as "ungrounded".

---

## Issue Category 4: Slow Highlight Rendering

### Symptom: Noticeable delay (>500ms) between selection and highlight appearance

**Diagnostic Steps**:
1. Open Chrome DevTools Performance tab
2. Record interaction, identify long tasks
3. Check if SpanMapper computation or render is bottleneck

**Likely Causes**:
| Cause | Probability | Detection |
|-------|-------------|-----------|
| Large number of spans (>50) | High | Count spans in node data |
| Unmemoized highlight computation | Medium | Repeated calculations on re-render |
| Main thread blocked | Low | Long tasks in Performance profile |

**Resolution**:
```typescript
// Memoize highlight geometry computation
const highlights = useMemo(
  () => evidenceSpans.map(span => 
    spanMapper.mapSpanToCoordinates(span, doc, text)
  ),
  [evidenceSpans] // Only recompute when spans change
);

// Virtualize for large span counts
{evidenceSpans.length > 20 ? (
  <VirtualList items={highlights} itemHeight={80} />
) : (
  highlights.map(h => <Highlight key={h.span.chunkId} {...h} />)
)}
```

**Prevention**: Set performance budget: highlight render ≤200ms p95.

---

## Issue Category 5: Keyboard Navigation Not Working

### Symptom: Alt+←/→ shortcuts don't cycle evidence

**Diagnostic Steps**:
1. Verify keyboard event listener attached
2. Check if panel has focus
3. Test with screen reader to isolate issue

**Likely Causes**:
| Cause | Probability | Detection |
|-------|-------------|-----------|
| Event listener not bound | High | Missing `useEffect` with `keydown` handler |
| Focus trapped elsewhere | Medium | Tab key doesn't reach panel |
| Modifier key conflict | Low | Browser/devtools intercepting Alt keys |

**Resolution**:
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.altKey && e.key === 'ArrowLeft') {
      handlePreviousEvidence();
    } else if (e.altKey && e.key === 'ArrowRight') {
      handleNextEvidence();
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [handlePreviousEvidence, handleNextEvidence]);
```

**Prevention**: Accessibility audit includes keyboard navigation testing.

---

## Issue Category 6: Memory Growth During Long Sessions

### Symptom: Browser memory increases >50MB after 30min of use

**Diagnostic Steps**:
1. Open Chrome DevTools Memory tab
2. Take heap snapshots at 5min intervals
3. Compare snapshots to identify retained objects

**Likely Causes**:
| Cause | Probability | Detection |
|-------|-------------|-----------|
| Highlight geometry not garbage collected | High | Detached DOM nodes accumulating |
| Event listener leaks | Medium | Listeners array growing |
| React state not cleaned up | Low | Component instances retained |

**Resolution**:
```typescript
// Clean up highlights on unmount
useEffect(() => {
  return () => {
    // Clear cached geometries
    highlightCache.clear();
    // Remove all event listeners
    cleanupListeners();
  };
}, []);

// Limit cache size
const MAX_CACHE_SIZE = 100;
if (highlightCache.size > MAX_CACHE_SIZE) {
  const oldestKey = highlightCache.keys().next().value;
  highlightCache.delete(oldestKey);
}
```

**Prevention**: Run memory profiling weekly; set alert at 30MB growth.

---

## Issue Category 7: Mobile Bottom Sheet Dismisses Accidentally

### Symptom: Evidence panel closes when user didn't intend to dismiss

**Diagnostic Steps**:
1. Reproduce on actual mobile device (not emulator)
2. Measure swipe gesture distance threshold
3. Check if touch target overlaps dismiss zone

**Likely Causes**:
| Cause | Probability | Detection |
|-------|-------------|-----------|
| Swipe threshold too sensitive | High | <20px swipe triggers dismiss |
| Touch target extends to edge | Medium | CSS shows full-width buttons |
| Gesture conflict with scroll | Low | Both vertical and horizontal detected |

**Resolution**:
```typescript
// Increase swipe threshold
const SWIPE_THRESHOLD = 80; // px (was 40)

// Add confirmation for accidental dismissals
let swipeStartTime = 0;
const handleTouchEnd = () => {
  const duration = Date.now() - swipeStartTime;
  if (duration < 200 && swipeDistance > SWIPE_THRESHOLD) {
    // Quick swipe - likely intentional
    closePanel();
  } else if (swipeDistance > SWIPE_THRESHOLD) {
    // Slow swipe - ask for confirmation
    showConfirmDialog('Close evidence panel?');
  }
};
```

**Prevention**: User testing on mobile devices before release.

---

## Diagnostic Commands

### Check SpanMapper Health
```bash
# View recent mapping failures
curl -s https://api.beingneuron.com/logs | grep "SpanMapper" | tail -20

# Check average confidence by paper
psql -c "SELECT paper_id, AVG(confidence) FROM evidence_spans GROUP BY paper_id ORDER BY 2 ASC LIMIT 10;"
```

### Monitor Sync State
```javascript
// In browser console
window.__SYNC_STATE__ = syncManager.getState();
console.log('Sync source:', window.__SYNC_STATE__.syncSource);
console.log('Active node:', window.__SYNC_STATE__.activeNodeId);
console.log('Highlight count:', window.__SYNC_STATE__.highlightRegions.length);
```

### Performance Profiling
```bash
# Run automated performance test
npm run test:phase-7:performance -- --paper-id=<uuid> --iterations=10

# Generate flame graph
chrome://tracing -> Load JSON -> Analyze long tasks
```

---

## Escalation Protocol

| Severity | Response Time | Escalation Path |
|----------|---------------|-----------------|
| Critical (data loss, complete failure) | Immediate | On-call engineer → Tech lead → VP Engineering |
| High (core feature broken) | 4 hours | Engineering lead → Product owner |
| Medium (degraded UX) | 24 hours | Team backlog, next sprint |
| Low (cosmetic, edge case) | Next release | Documentation update |

---

## Contact Information

- **Primary Maintainer**: [Phase 7 Lead]
- **Slack Channel**: #beingneuron-evidence
- **On-Call Rotation**: PagerDuty service `beingneuron-phase7`
- **Documentation**: `/docs/phases/phase-7/`

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-10 | Phase 7 Team | Initial troubleshooting guide |
