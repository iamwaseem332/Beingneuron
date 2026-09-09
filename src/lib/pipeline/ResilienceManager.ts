// src/lib/pipeline/ResilienceManager.ts
// Phase 5: Resilience Patterns - Retry, Circuit Breaker, Dead Letter Queue

import { ExtractionJobStatus } from './states';

export interface RetryConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  maxRetries: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitoringWindowMs: number;
}

export interface CircuitBreakerState {
  failures: Array<{ timestamp: number }>;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  lastFailureTime?: number;
  openedAt?: number;
}

export class CircuitBreakerError extends Error {
  constructor(public provider: string, message?: string) {
    super(message || `Circuit breaker open for provider: ${provider}`);
    this.name = 'CircuitBreakerError';
  }
}

export class MaxRetriesExceededError extends Error {
  constructor(
    public jobId: string,
    public retryCount: number,
    public maxRetries: number,
    message?: string
  ) {
    super(message || `Max retries (${maxRetries}) exceeded for job ${jobId}`);
    this.name = 'MaxRetriesExceededError';
  }
}

/**
 * Calculates exponential backoff delay
 */
export function calculateBackoffDelay(
  retryCount: number,
  config: RetryConfig
): number {
  const delay = config.baseDelayMs * Math.pow(2, retryCount);
  // Add jitter (±10%) to prevent thundering herd
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, config.maxDelayMs);
}

/**
 * Manages circuit breaker state per provider
 * Instance-scoped (Edge Function memory)
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreakerState> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      resetTimeoutMs: config?.resetTimeoutMs ?? 30000,
      monitoringWindowMs: config?.monitoringWindowMs ?? 60000
    };
  }

  /**
   * Records a failure for a provider
   */
  recordFailure(provider: string): void {
    const now = Date.now();
    let state = this.breakers.get(provider);
    
    if (!state) {
      state = { failures: [], state: 'CLOSED' };
      this.breakers.set(provider, state);
    }

    // Add failure within monitoring window
    state.failures.push({ timestamp: now });
    state.lastFailureTime = now;
    
    // Remove old failures outside monitoring window
    const windowStart = now - this.config.monitoringWindowMs;
    state.failures = state.failures.filter(f => f.timestamp >= windowStart);

    // Check if threshold exceeded
    if (state.failures.length >= this.config.failureThreshold && state.state === 'CLOSED') {
      state.state = 'OPEN';
      state.openedAt = now;
      console.warn(`[CircuitBreaker] OPENED for provider: ${provider}`);
    }
  }

  /**
   * Records a success for a provider
   */
  recordSuccess(provider: string): void {
    const state = this.breakers.get(provider);
    if (!state) return;

    if (state.state === 'HALF_OPEN') {
      state.state = 'CLOSED';
      state.failures = [];
      state.openedAt = undefined;
      console.log(`[CircuitBreaker] CLOSED for provider: ${provider}`);
    } else if (state.state === 'CLOSED') {
      // Clear old failures on success
      state.failures = [];
    }
  }

  /**
   * Checks if circuit is open (should block requests)
   */
  isOpen(provider: string): boolean {
    const state = this.breakers.get(provider);
    if (!state || state.state === 'CLOSED') return false;

    const now = Date.now();
    
    // Check if reset timeout has elapsed
    if (state.state === 'OPEN' && state.openedAt) {
      if (now - state.openedAt >= this.config.resetTimeoutMs) {
        state.state = 'HALF_OPEN';
        console.log(`[CircuitBreaker] HALF_OPEN for provider: ${provider}`);
        return false; // Allow test request
      }
      return true; // Still open
    }

    return state.state === 'OPEN';
  }

  /**
   * Gets current state for monitoring
   */
  getState(provider: string): CircuitBreakerState | undefined {
    return this.breakers.get(provider);
  }

  /**
   * Resets circuit breaker (for manual intervention)
   */
  reset(provider: string): void {
    this.breakers.delete(provider);
    console.log(`[CircuitBreaker] RESET for provider: ${provider}`);
  }
}

/**
 * Manages retry logic and dead letter queue decisions
 */
export class ResilienceManager {
  private retryConfig: RetryConfig;
  private circuitBreaker: CircuitBreakerManager;

  constructor(config?: {
    retry?: Partial<RetryConfig>;
    circuitBreaker?: Partial<CircuitBreakerConfig>;
  }) {
    this.retryConfig = {
      baseDelayMs: config?.retry?.baseDelayMs ?? 5000,
      maxDelayMs: config?.retry?.maxDelayMs ?? 300000,
      maxRetries: config?.retry?.maxRetries ?? 3
    };

    this.circuitBreaker = new CircuitBreakerManager(config?.circuitBreaker);
  }

  /**
   * Determines if a failed operation should be retried
   * Returns delay in ms, or null if should go to DLQ
   */
  shouldRetry(options: {
    retryCount: number;
    maxRetries?: number;
    error: Error;
    provider?: string;
  }): number | null {
    const { retryCount, error, provider } = options;
    const maxRetries = options.maxRetries ?? this.retryConfig.maxRetries;

    // Check if max retries exceeded
    if (retryCount >= maxRetries) {
      return null; // Send to DLQ
    }

    // Check circuit breaker if provider specified
    if (provider && this.circuitBreaker.isOpen(provider)) {
      throw new CircuitBreakerError(provider);
    }

    // Determine if error is recoverable
    if (!this.isRecoverableError(error)) {
      return null; // Non-recoverable, send to DLQ
    }

    return calculateBackoffDelay(retryCount, this.retryConfig);
  }

  /**
   * Records failure and determines next action
   */
  handleFailure(options: {
    jobId: string;
    retryCount: number;
    maxRetries?: number;
    error: Error;
    provider?: string;
  }): { 
    action: 'retry' | 'dead_letter'; 
    delayMs?: number;
    nextRetryAt?: Date;
  } {
    const { provider, error } = options;

    // Record failure in circuit breaker
    if (provider) {
      this.circuitBreaker.recordFailure(provider);
    }

    try {
      const delayMs = this.shouldRetry(options);
      
      if (delayMs === null) {
        return { action: 'dead_letter' };
      }

      const nextRetryAt = new Date(Date.now() + delayMs);
      return { action: 'retry', delayMs, nextRetryAt };
    } catch (e) {
      if (e instanceof CircuitBreakerError) {
        // Circuit is open, use fallback provider instead
        // This is handled at orchestrator level
        return { action: 'retry', delayMs: 0, nextRetryAt: new Date() };
      }
      throw e;
    }
  }

  /**
   * Records successful operation
   */
  handleSuccess(provider?: string): void {
    if (provider) {
      this.circuitBreaker.recordSuccess(provider);
    }
  }

  /**
   * Checks if fallback provider should be used
   */
  shouldUseFallback(primaryProvider: string): boolean {
    return this.circuitBreaker.isOpen(primaryProvider);
  }

  /**
   * Gets circuit breaker status for all providers
   */
  getCircuitBreakerStatus(): Record<string, CircuitBreakerState | undefined> {
    // Return snapshot of all known providers
    const providers = ['openai', 'anthropic', 'fallback'];
    const status: Record<string, CircuitBreakerState | undefined> = {};
    for (const provider of providers) {
      status[provider] = this.circuitBreaker.getState(provider);
    }
    return status;
  }

  /**
   * Determines if an error is recoverable via retry
   */
  private isRecoverableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Recoverable errors
    const recoverablePatterns = [
      'timeout',
      'rate limit',
      'too many requests',
      'service unavailable',
      'network',
      'econnrefused',
      'etimedout',
      '503',
      '429',
      '502',
      '504'
    ];

    // Non-recoverable errors
    const nonRecoverablePatterns = [
      'authentication',
      'unauthorized',
      'api key',
      'invalid request',
      'schema validation',
      'evidence',
      '401',
      '403',
      '400'
    ];

    // Check non-recoverable first
    for (const pattern of nonRecoverablePatterns) {
      if (message.includes(pattern)) {
        return false;
      }
    }

    // Check recoverable
    for (const pattern of recoverablePatterns) {
      if (message.includes(pattern)) {
        return true;
      }
    }

    // Default: retry unknown errors (conservative approach)
    return true;
  }
}

export interface DLQEntry {
  jobId: string;
  paperId: string;
  userId: string;
  status: 'dead_letter';
  retryCount: number;
  maxRetries: number;
  errorMessage: string;
  errorHistory: Array<{
    timestamp: string;
    error: string;
    chunkSequence?: number;
  }>;
  lastSuccessfulChunk?: number;
  totalChunks: number;
  tokenUsageInput: number;
  tokenUsageOutput: number;
  estimatedCostUsd: number;
  createdAt: string;
  deadLetteredAt: string;
}
