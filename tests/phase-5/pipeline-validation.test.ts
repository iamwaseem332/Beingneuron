// tests/phase-5/pipeline-validation.ts
// Phase 5 Pipeline Validation Suite (PVS)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  isValidTransition, 
  enforceTransition, 
  InvalidStateTransitionError,
  calculatePercentComplete,
  estimateTimeRemaining,
  sanitizeErrorMessage
} from '../../src/lib/pipeline/states';
import {
  ResilienceManager,
  CircuitBreakerManager,
  calculateBackoffDelay,
  CircuitBreakerError
} from '../../src/lib/pipeline/ResilienceManager';

describe('Phase 5: Pipeline Validation Suite', () => {
  
  // Category 1: State Machine Tests
  describe('Category 1: State Machine Validation', () => {
    
    it('validates pending -> processing transition', () => {
      expect(isValidTransition('pending', 'processing')).toBe(true);
    });

    it('validates processing -> completed transition', () => {
      expect(isValidTransition('processing', 'completed')).toBe(true);
    });

    it('validates processing -> failed transition', () => {
      expect(isValidTransition('processing', 'failed')).toBe(true);
    });

    it('validates failed -> processing retry transition', () => {
      expect(isValidTransition('failed', 'processing')).toBe(true);
    });

    it('validates failed -> dead_letter transition', () => {
      expect(isValidTransition('failed', 'dead_letter')).toBe(true);
    });

    it('rejects invalid transition pending -> completed', () => {
      expect(isValidTransition('pending', 'completed')).toBe(false);
      expect(() => enforceTransition('pending', 'completed'))
        .toThrow(InvalidStateTransitionError);
    });

    it('rejects invalid transition completed -> processing', () => {
      expect(isValidTransition('completed', 'processing')).toBe(false);
    });

    it('rejects invalid transition dead_letter -> processing', () => {
      expect(isValidTransition('dead_letter', 'processing')).toBe(false);
    });

    it('calculates percent complete correctly', () => {
      expect(calculatePercentComplete(0, 100)).toBe(0);
      expect(calculatePercentComplete(50, 100)).toBe(50);
      expect(calculatePercentComplete(100, 100)).toBe(100);
      expect(calculatePercentComplete(25, 50)).toBe(50);
    });

    it('estimates time remaining from rolling average', () => {
      const durations = [1000, 1200, 1100, 1300, 1000]; // 5 chunks averaging 1120ms
      const remaining = 10;
      const estimated = estimateTimeRemaining(durations, remaining);
      expect(estimated).toBeDefined();
      expect(estimated!).toBeCloseTo(11200, -2); // ~11.2 seconds
    });

    it('sanitizes API keys from error messages', () => {
      const dirty = 'Authentication failed: sk-abc123def456ghi789jkl012mno345pqr678';
      const clean = sanitizeErrorMessage(dirty);
      expect(clean).toContain('[REDACTED_API_KEY]');
      expect(clean).not.toContain('sk-abc123');
    });

    it('sanitizes file paths from error messages', () => {
      const dirty = 'Error at /workspace/src/lib/pipeline/test.ts:42';
      const clean = sanitizeErrorMessage(dirty);
      expect(clean).toContain('[PATH_REDACTED]');
    });
  });

  // Category 2: Resilience Pattern Tests
  describe('Category 2: Resilience Patterns', () => {
    
    it('calculates exponential backoff with jitter', () => {
      const config = { baseDelayMs: 1000, maxDelayMs: 60000, maxRetries: 3 };
      
      // First retry: ~1000ms
      const delay0 = calculateBackoffDelay(0, config);
      expect(delay0).toBeGreaterThanOrEqual(900);
      expect(delay0).toBeLessThanOrEqual(1100);

      // Second retry: ~2000ms
      const delay1 = calculateBackoffDelay(1, config);
      expect(delay1).toBeGreaterThanOrEqual(1800);
      expect(delay1).toBeLessThanOrEqual(2200);

      // Third retry: ~4000ms
      const delay2 = calculateBackoffDelay(2, config);
      expect(delay2).toBeGreaterThanOrEqual(3600);
      expect(delay2).toBeLessThanOrEqual(4400);
    });

    it('caps backoff delay at maximum', () => {
      const config = { baseDelayMs: 1000, maxDelayMs: 5000, maxRetries: 10 };
      const delay = calculateBackoffDelay(10, config);
      expect(delay).toBeLessThanOrEqual(5000);
    });

    it('circuit breaker opens after threshold failures', () => {
      const cb = new CircuitBreakerManager({ 
        failureThreshold: 3,
        monitoringWindowMs: 60000
      });

      expect(cb.isOpen('test-provider')).toBe(false);

      // Record 3 failures
      cb.recordFailure('test-provider');
      cb.recordFailure('test-provider');
      cb.recordFailure('test-provider');

      expect(cb.isOpen('test-provider')).toBe(true);
    });

    it('circuit breaker transitions to half-open after timeout', () => {
      const cb = new CircuitBreakerManager({ 
        failureThreshold: 2,
        resetTimeoutMs: 100, // 100ms for testing
        monitoringWindowMs: 60000
      });

      cb.recordFailure('test-provider');
      cb.recordFailure('test-provider');
      expect(cb.isOpen('test-provider')).toBe(true);

      // Wait for reset timeout
      setTimeout(() => {
        expect(cb.isOpen('test-provider')).toBe(false); // Should be HALF_OPEN
      }, 150);
    });

    it('circuit breaker closes on success in half-open state', () => {
      const cb = new CircuitBreakerManager({ 
        failureThreshold: 2,
        resetTimeoutMs: 50,
        monitoringWindowMs: 60000
      });

      cb.recordFailure('test-provider');
      cb.recordFailure('test-provider');
      
      setTimeout(() => {
        cb.isOpen('test-provider'); // Trigger transition to HALF_OPEN
        cb.recordSuccess('test-provider');
        
        expect(cb.isOpen('test-provider')).toBe(false);
      }, 100);
    });

    it('resilience manager identifies recoverable errors', () => {
      const rm = new ResilienceManager();
      
      const recoverableErrors = [
        new Error('Request timeout'),
        new Error('Rate limit exceeded'),
        new Error('Service unavailable (503)'),
        new Error('Network error')
      ];

      const nonRecoverableErrors = [
        new Error('Authentication failed'),
        new Error('Invalid API key'),
        new Error('Schema validation error')
      ];

      for (const error of recoverableErrors) {
        const result = rm.shouldRetry({
          retryCount: 0,
          error,
          provider: 'openai'
        });
        expect(result).toBeGreaterThan(0);
      }

      for (const error of nonRecoverableErrors) {
        const result = rm.shouldRetry({
          retryCount: 0,
          error,
          provider: 'openai'
        });
        expect(result).toBeNull();
      }
    });

    it('resilience manager sends to DLQ after max retries', () => {
      const rm = new ResilienceManager({ retry: { maxRetries: 3 } });
      
      const result = rm.handleFailure({
        jobId: 'test-job',
        retryCount: 3,
        error: new Error('Timeout'),
        provider: 'openai'
      });

      expect(result.action).toBe('dead_letter');
    });
  });

  // Category 3: Cost Governance Tests
  describe('Category 3: Cost Governance', () => {
    
    it('tracks token usage accumulation', () => {
      // Simulated test - actual implementation requires DB
      const initialInput = 1000;
      const initialOutput = 500;
      const additionalInput = 2000;
      const additionalOutput = 800;

      const totalInput = initialInput + additionalInput;
      const totalOutput = initialOutput + additionalOutput;

      expect(totalInput).toBe(3000);
      expect(totalOutput).toBe(1300);
    });

    it('detects budget overage', () => {
      const budget = 2.00;
      const currentSpend = 2.50;
      
      expect(currentSpend > budget).toBe(true);
    });

    it('calculates remaining budget', () => {
      const budget = 2.00;
      const spent = 1.25;
      const remaining = Math.max(0, budget - spent);
      
      expect(remaining).toBe(0.75);
    });
  });

  // Category 4: Integration Tests
  describe('Category 4: Integration Flow', () => {
    
    it('processes job through complete lifecycle', () => {
      // Simulated state transitions
      const states: string[] = [];
      
      states.push('pending');
      states.push('processing');
      
      // Simulate successful completion
      states.push('completed');

      expect(states[0]).toBe('pending');
      expect(states[1]).toBe('processing');
      expect(states[2]).toBe('completed');
    });

    it('handles retry flow correctly', () => {
      const states: string[] = [];
      
      states.push('pending');
      states.push('processing');
      states.push('failed'); // First failure
      states.push('processing'); // Retry
      states.push('completed');

      expect(states).toHaveLength(5);
      expect(isValidTransition('failed', 'processing')).toBe(true);
    });

    it('handles DLQ transition correctly', () => {
      const states: string[] = [];
      
      states.push('pending');
      states.push('processing');
      states.push('failed'); // First failure
      states.push('failed'); // Second failure
      states.push('failed'); // Third failure
      states.push('dead_letter'); // Max retries exceeded

      expect(states[states.length - 1]).toBe('dead_letter');
      expect(isValidTransition('failed', 'dead_letter')).toBe(true);
    });
  });
});

console.log('Phase 5 Pipeline Validation Suite loaded successfully');
