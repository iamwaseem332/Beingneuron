export interface BenchmarkMetrics {
  [key: string]: number | boolean | null;
}

export interface MetricDefinition {
  name: string;
  unit: string;
  description: string;
  target?: number;
  isPercentage?: boolean;
  lowerIsBetter?: boolean;
}

/**
 * Standardized metric definitions for all benchmark categories
 */
export const EXTRACTION_METRICS: MetricDefinition[] = [
  { name: 'medianProcessingTimeMs', unit: 'ms', description: 'Median paper processing time', lowerIsBetter: true },
  { name: 'p95ProcessingTimeMs', unit: 'ms', description: '95th percentile processing time', lowerIsBetter: true },
  { name: 'parseSuccessRate', unit: 'ratio', description: 'Fraction of papers parsed successfully', target: 1.0, isPercentage: true },
  { name: 'entityPrecision', unit: 'ratio', description: 'Precision of entity extraction vs gold standard', target: 0.85, isPercentage: true },
  { name: 'entityRecall', unit: 'ratio', description: 'Recall of entity extraction vs gold standard', target: 0.80, isPercentage: true },
  { name: 'relationF1', unit: 'ratio', description: 'F1 score for relation extraction', target: 0.75, isPercentage: true },
  { name: 'evidenceAccuracy', unit: 'ratio', description: 'Accuracy of evidence span localization', target: 0.80, isPercentage: true },
  { name: 'tokenCostPerPaperUsd', unit: 'USD', description: 'Average token cost per paper', lowerIsBetter: true }
];

export const GRAPH_METRICS: MetricDefinition[] = [
  { name: 'initialLayoutTimeMs', unit: 'ms', description: 'Time to stabilize initial graph layout', lowerIsBetter: true },
  { name: 'nodeClickLatencyMs', unit: 'ms', description: 'Latency from node click to evidence panel render', lowerIsBetter: true },
  { name: 'fullscreenTransitionMs', unit: 'ms', description: 'Time to transition to/from fullscreen mode', lowerIsBetter: true },
  { name: 'layoutOverlapPercent', unit: '%', description: 'Percentage of overlapping nodes in layout', lowerIsBetter: true },
  { name: 'dragFps', unit: 'fps', description: 'Frames per second during node drag', target: 55 },
  { name: 'multiPaperQueryRenderMs', unit: 'ms', description: 'Time to query and render 5-paper merged graph', lowerIsBetter: true }
];

export const DATABASE_METRICS: MetricDefinition[] = [
  { name: 'paperGraphQueryP95Ms', unit: 'ms', description: '95th percentile latency for GET /paper/:id/graph', lowerIsBetter: true },
  { name: 'indexHitRatio', unit: 'ratio', description: 'Database index hit ratio', target: 0.95, isPercentage: true },
  { name: 'orphanRecords', unit: 'count', description: 'Number of orphaned records violating FK constraints', lowerIsBetter: true, target: 0 },
  { name: 'rlsIsolationTestsPassed', unit: 'boolean', description: 'Whether RLS isolation tests passed', target: 1 }
];

/**
 * Record a single metric value with validation
 */
export function recordMetric(
  metrics: BenchmarkMetrics,
  name: string,
  value: number | boolean | null,
  definition?: MetricDefinition
): void {
  if (definition) {
    // Validate against expected type
    if (definition.isPercentage !== undefined && typeof value === 'number') {
      if (value < 0 || value > 1) {
        console.warn(`Metric ${name} has value ${value} but isPercentage=true expects 0-1 range`);
      }
    }
    if (definition.target !== undefined && typeof value === 'number' && definition.lowerIsBetter) {
      if (value > definition.target * 2) {
        console.warn(`Metric ${name} value ${value} significantly exceeds target ${definition.target}`);
      }
    }
  }
  metrics[name] = value;
}

/**
 * Compute median from array of numbers
 */
export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute p95 from array of numbers
 */
export function computeP95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Compute precision, recall, F1 from true positives, false positives, false negatives
 */
export function computePrecisionRecallF1(tp: number, fp: number, fn: number): { precision: number; recall: number; f1: number } {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

/**
 * Format metric value for display with appropriate units
 */
export function formatMetricValue(name: string, value: number | boolean | null, definition?: MetricDefinition): string {
  if (value === null) return 'N/A';
  if (typeof value === 'boolean') return value ? 'PASS' : 'FAIL';
  
  const unit = definition?.unit || '';
  if (definition?.isPercentage && typeof value === 'number') {
    return `${(value * 100).toFixed(1)}%`;
  }
  
  if (typeof value === 'number') {
    if (value >= 1000 && unit === 'ms') {
      return `${(value / 1000).toFixed(2)}s`;
    }
    return value.toFixed(value % 1 === 0 ? 0 : 2);
  }
  
  return String(value);
}
