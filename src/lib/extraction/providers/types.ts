/**
 * Phase 4 — LLM Provider Abstraction Layer
 * 
 * This module defines the interface for extraction providers and implements
 * the adapter pattern to guarantee structured output regardless of underlying model.
 * 
 * @see docs/phases/phase-4/provider-abstraction-guide.md for extension points
 */

import type { ChunkExtractionResult } from '../schemas';
import type { Chunk } from '../../chunking/types';

/**
 * Configuration for extraction provider
 */
export interface ExtractionProviderConfig {
  /** API key for the provider */
  apiKey: string;
  /** Model identifier (e.g., "gpt-4o", "claude-3.5-sonnet") */
  model: string;
  /** Maximum tokens to generate */
  maxTokens: number;
  /** Temperature for sampling (0–2) */
  temperature: number;
  /** Request timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Result of an extraction attempt
 */
export interface ExtractionResult {
  /** Whether extraction succeeded */
  success: boolean;
  /** Extracted result (if successful) */
  data?: ChunkExtractionResult;
  /** Error message (if failed) */
  error?: string;
  /** Token usage metadata */
  tokenUsage?: {
    input: number;
    output: number;
  };
}

/**
 * Contract for extraction providers
 * 
 * All providers must implement this interface to ensure
 * consistent behavior across different LLM backends.
 */
export interface ExtractionProvider {
  /**
   * Extract entities and relations from a chunk
   * 
   * @param chunk - The chunk to extract from
   * @param config - Provider configuration
   * @returns Extraction result with structured data
   */
  extract(chunk: Chunk, config: ExtractionProviderConfig): Promise<ExtractionResult>;
  
  /**
   * Get provider name for logging/metadata
   */
  getProviderName(): string;
  
  /**
   * Whether this provider supports native structured output
   * (JSON mode, function calling, tool use, etc.)
   */
  supportsStructuredOutput(): boolean;
}

/**
 * Error types for extraction failures
 */
export type ExtractionErrorType = 
  | 'TIMEOUT'           // Request timed out
  | 'AUTH_ERROR'        // Invalid API key
  | 'RATE_LIMIT'        // Rate limit exceeded
  | 'MALFORMED_RESPONSE' // Response doesn't match schema
  | 'VALIDATION_ERROR'  // Zod validation failed
  | 'PROVIDER_ERROR'    // Provider-specific error
  | 'UNKNOWN';          // Unknown error

/**
 * Standardized extraction error
 */
export class ExtractionProviderError extends Error {
  constructor(
    message: string,
    public readonly type: ExtractionErrorType,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ExtractionProviderError';
  }
}
