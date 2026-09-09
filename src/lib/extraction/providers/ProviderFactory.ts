/**
 * Phase 4 — Provider Factory and Selection Logic
 * 
 * Creates appropriate extraction provider based on availability,
 * cost constraints, and feature requirements.
 */

import { ExtractionProvider, ExtractionProviderConfig } from './types';
import { OpenAIProvider } from './OpenAIProvider';
import { FallbackRegexProvider } from './FallbackRegexProvider';

/**
 * Available provider types
 */
export type ProviderType = 'openai' | 'anthropic' | 'fallback';

/**
 * Provider selection options
 */
export interface ProviderSelectionOptions {
  /** Preferred provider type */
  preferred?: ProviderType;
  /** Whether structured output is required */
  requireStructuredOutput?: boolean;
  /** Cost constraint (max USD per chunk) */
  maxCostPerChunk?: number;
  /** API keys available */
  apiKeys: {
    openai?: string;
    anthropic?: string;
  };
}

/**
 * Create extraction provider based on options
 * 
 * @param options - Provider selection options
 * @returns Configured extraction provider
 */
export function createProvider(options: ProviderSelectionOptions): ExtractionProvider {
  const { preferred, requireStructuredOutput, apiKeys } = options;
  
  // If structured output required, cannot use fallback
  if (requireStructuredOutput && preferred === 'fallback') {
    console.warn('Fallback provider does not support structured output, selecting alternative');
  }
  
  // Try preferred provider first
  if (preferred && preferred !== 'fallback') {
    switch (preferred) {
      case 'openai':
        if (apiKeys.openai) {
          return new OpenAIProvider();
        }
        console.warn('OpenAI API key not available, falling back');
        break;
        
      case 'anthropic':
        // Anthropic provider would be implemented here
        console.warn('Anthropic provider not yet implemented, falling back');
        break;
    }
  }
  
  // Fall back to regex provider as last resort
  return new FallbackRegexProvider();
}

/**
 * Get default configuration for a provider type
 */
export function getDefaultConfig(providerType: ProviderType): ExtractionProviderConfig {
  switch (providerType) {
    case 'openai':
      return {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: 'gpt-4o',
        maxTokens: 2000,
        temperature: 0.1,
        timeoutMs: 30000
      };
      
    case 'anthropic':
      return {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-3.5-sonnet-20241022',
        maxTokens: 2000,
        temperature: 0.1,
        timeoutMs: 30000
      };
      
    case 'fallback':
      return {
        apiKey: '',
        model: 'regex-fallback',
        maxTokens: 0,
        temperature: 0,
        timeoutMs: 5000
      };
  }
}

/**
 * Check if provider is available (API key configured, etc.)
 */
export function isProviderAvailable(providerType: ProviderType, apiKeys: ProviderSelectionOptions['apiKeys']): boolean {
  switch (providerType) {
    case 'openai':
      return !!apiKeys.openai;
    case 'anthropic':
      return !!apiKeys.anthropic;
    case 'fallback':
      return true; // Always available
  }
}
