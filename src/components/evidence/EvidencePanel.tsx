// src/components/evidence/EvidencePanel.tsx
import React, { useState, useCallback } from 'react';
import { EvidencePanelProps, TextSpan, HighlightRegion } from '../../lib/evidence/types';

interface Relation {
  type: string;
  targetId: string;
  targetType?: string;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  nodeId,
  entityType,
  normalizedForm,
  relations,
  evidenceSpans,
  confidence,
  onClose
}) => {
  const [currentEvidenceIndex, setCurrentEvidenceIndex] = useState(0);

  const handlePreviousEvidence = useCallback(() => {
    setCurrentEvidenceIndex(prev => 
      prev > 0 ? prev - 1 : evidenceSpans.length - 1
    );
  }, [evidenceSpans.length]);

  const handleNextEvidence = useCallback(() => {
    setCurrentEvidenceIndex(prev => 
      prev < evidenceSpans.length - 1 ? prev + 1 : 0
    );
  }, [evidenceSpans.length]);

  const handleCopyExcerpt = useCallback((span: TextSpan) => {
    const excerpt = span.startChar && span.endChar 
      ? `Page ${span.pageNumber}, chars ${span.startChar}-${span.endChar}`
      : `Page ${span.pageNumber}`;
    navigator.clipboard.writeText(excerpt);
  }, []);

  const getConfidenceColor = (conf: number): string => {
    if (conf >= 0.9) return 'text-green-600 bg-green-50';
    if (conf >= 0.7) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getConfidenceLabel = (conf: number): string => {
    if (conf >= 0.9) return 'High Confidence';
    if (conf >= 0.7) return 'Medium Confidence';
    return 'Low Confidence';
  };

  const hasMultipleEvidence = evidenceSpans.length > 1;

  return (
    <aside 
      className="evidence-panel fixed right-0 top-0 h-full w-96 bg-white shadow-xl border-l border-gray-200 z-50 overflow-hidden"
      role="complementary"
      aria-label="Evidence Panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{normalizedForm}</h2>
          <p className="text-sm text-gray-500 capitalize">{entityType}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Close evidence panel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Confidence Indicator */}
      <div className={`px-4 py-2 ${getConfidenceColor(confidence)}`}>
        <span className="text-sm font-medium">{getConfidenceLabel(confidence)} ({(confidence * 100).toFixed(0)}%)</span>
      </div>

      {/* Relations Section */}
      {relations.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Relations</h3>
          <ul className="space-y-1" role="list">
            {relations.map((relation, idx) => (
              <li key={idx} className="text-sm text-gray-600">
                <span className="font-medium">{relation.type}</span> → {relation.targetId}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Evidence Spans Section */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">
            Evidence {hasMultipleEvidence ? `${currentEvidenceIndex + 1} of ${evidenceSpans.length}` : ''}
          </h3>
          {hasMultipleEvidence && (
            <div className="flex space-x-1">
              <button
                onClick={handlePreviousEvidence}
                className="p-1 hover:bg-gray-100 rounded"
                aria-label="Previous evidence"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={handleNextEvidence}
                className="p-1 hover:bg-gray-100 rounded"
                aria-label="Next evidence"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {evidenceSpans.map((span, idx) => (
          <div
            key={`${span.chunkId}:${span.startChar}`}
            className={`p-3 mb-2 rounded-lg border-2 transition-all ${
              idx === currentEvidenceIndex 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 bg-gray-50'
            }`}
            role="article"
            aria-label={`Evidence span on page ${span.pageNumber}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500">
                Page {span.pageNumber}
              </span>
              {confidence < 0.7 && (
                <span className="text-xs text-red-600 font-medium">
                  ⚠️ Low confidence mapping
                </span>
              )}
            </div>
            
            <div className="text-sm text-gray-700 font-mono bg-white p-2 rounded mb-2 overflow-x-auto">
              Chars {span.startChar}–{span.endChar}
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleCopyExcerpt(span)}
                className="text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                Copy Excerpt
              </button>
              <button
                className="text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                aria-label="Report incorrect evidence"
              >
                Report Issue
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <button
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          aria-label="View full section context"
        >
          View Full Section
        </button>
      </div>

      {/* Accessibility: Live region for screen readers */}
      <div 
        role="status" 
        aria-live="polite" 
        className="sr-only"
      >
        {hasMultipleEvidence 
          ? `Showing evidence ${currentEvidenceIndex + 1} of ${evidenceSpans.length}`
          : 'Evidence loaded'}
      </div>
    </aside>
  );
};

export default EvidencePanel;
