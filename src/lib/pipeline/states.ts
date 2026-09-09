// src/lib/pipeline/states.ts
// Phase 5: Pipeline State Machine with Granular Status Tracking

export type ExtractionJobStatus = 
  | 'pending'        // Queued, awaiting worker
  | 'processing'     // Actively extracting chunks
  | 'completed'      // All chunks extracted + validated
  | 'failed'         // Recoverable error, will retry
  | 'dead_letter';   // Max retries exhausted, manual intervention needed

export interface JobProgress {
  status: ExtractionJobStatus;
  currentChunk: number;
  totalChunks: number;
  percentComplete: number;
  errorMessage?: string;
  lastUpdatedAt: string;
  estimatedTimeRemaining?: number; // seconds
}

// Valid state transitions matrix
const VALID_TRANSITIONS: Record<ExtractionJobStatus, ExtractionJobStatus[]> = {
  'pending': ['processing'],
  'processing': ['completed', 'failed'],
  'failed': ['processing', 'dead_letter'],
  'completed': [], // Terminal state
  'dead_letter': [] // Terminal state
};

export class InvalidStateTransitionError extends Error {
  constructor(
    public from: ExtractionJobStatus,
    public to: ExtractionJobStatus,
    message?: string
  ) {
    super(message || `Invalid state transition from ${from} to ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * Validates if a state transition is allowed
 */
export function isValidTransition(from: ExtractionJobStatus, to: ExtractionJobStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Enforces valid state transitions, throws on invalid
 */
export function enforceTransition(from: ExtractionJobStatus, to: ExtractionJobStatus): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

/**
 * Calculates percent complete from chunk progress
 */
export function calculatePercentComplete(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

/**
 * Estimates time remaining based on rolling average of chunk processing times
 */
export function estimateTimeRemaining(
  chunkDurations: number[],
  remainingChunks: number
): number | undefined {
  if (chunkDurations.length === 0 || remainingChunks <= 0) return undefined;
  
  // Use last 10 durations for rolling average
  const recentDurations = chunkDurations.slice(-10);
  const avgDuration = recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length;
  
  return Math.round(avgDuration * remainingChunks);
}

/**
 * Sanitizes error messages for user display
 * Strips API keys, internal paths, stack traces
 */
export function sanitizeErrorMessage(error: string): string {
  // Remove potential API keys (common patterns)
  let sanitized = error.replace(/sk-[a-zA-Z0-9]{32,}/g, '[REDACTED_API_KEY]');
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/g, '[REDACTED_TOKEN]');
  
  // Remove file paths
  sanitized = sanitized.replace(/\/[^\s]+\/(node_modules|src|lib|functions)/g, '[PATH_REDACTED]');
  
  // Remove stack traces (lines starting with at )
  sanitized = sanitized.split('\n').filter(line => !line.trim().startsWith('at ')).join('\n');
  
  // Truncate if too long
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 497) + '...';
  }
  
  return sanitized.trim();
}
