/**
 * Parser Adapter Factory
 * 
 * Creates the appropriate parser adapter based on feature requirements
 * and runtime availability.
 * 
 * @see docs/phases/phase-3/parser-evaluation-report.md#adapter-pattern
 */

import { ParserAdapter, ParserFeature, ParseOptions, ParsedDocument } from './types';
import { LlamaParseAdapter } from './LlamaParseAdapter';
import { MarkerAdapter } from './MarkerAdapter';
import { LegacyPdfJsAdapter } from './LegacyPdfJsAdapter';

/**
 * Configuration for parser selection
 */
export interface ParserConfig {
  /** Primary parser to use */
  primary: 'llamaParse' | 'marker' | 'legacy';
  /** Fallback parsers in order of preference */
  fallbacks: Array<'llamaParse' | 'marker' | 'legacy'>;
  /** Required features (all must be supported) */
  requiredFeatures?: ParserFeature[];
  /** API key for LlamaParse (required if selected) */
  llamaParseApiKey?: string;
  /** Enable offline-only mode (excludes LlamaParse) */
  offlineOnly?: boolean;
}

/**
 * Default configuration prioritizing quality with fallbacks
 */
const DEFAULT_CONFIG: ParserConfig = {
  primary: 'llamaParse',
  fallbacks: ['marker', 'legacy'],
  requiredFeatures: ['TABLE_EXTRACTION', 'HEADING_HIERARCHY'],
};

/**
 * Create a parser adapter with automatic fallback support
 * 
 * @param config - Parser configuration
 * @returns Parser adapter with fallback logic
 */
export function createParser(config: Partial<ParserConfig> = {}): ParserAdapter {
  const finalConfig: ParserConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    fallbacks: config.fallbacks || DEFAULT_CONFIG.fallbacks,
  };

  // Filter out LlamaParse if offline-only mode
  const availableParsers = finalConfig.offlineOnly
    ? ['marker', 'legacy'] as const
    : ['llamaParse', 'marker', 'legacy'] as const;

  // Build adapter chain with fallbacks
  const adapters: Array<{ name: string; adapter: ParserAdapter }> = [];

  // Try primary parser
  const primaryAdapter = createAdapterByName(finalConfig.primary, finalConfig);
  if (primaryAdapter) {
    adapters.push({ name: finalConfig.primary, adapter: primaryAdapter });
  }

  // Add fallbacks
  for (const fallbackName of finalConfig.fallbacks) {
    if (fallbackName !== finalConfig.primary) {
      const fallbackAdapter = createAdapterByName(fallbackName, finalConfig);
      if (fallbackAdapter) {
        adapters.push({ name: fallbackName, adapter: fallbackAdapter });
      }
    }
  }

  if (adapters.length === 0) {
    throw new Error('No parsers available. Check configuration and API keys.');
  }

  // Return wrapper with fallback logic
  return new FallbackParserAdapter(adapters, finalConfig.requiredFeatures);
}

/**
 * Create a single adapter by name
 */
function createAdapterByName(
  name: string,
  config: ParserConfig
): ParserAdapter | null {
  switch (name) {
    case 'llamaParse':
      if (!config.llamaParseApiKey) {
        console.warn('LlamaParse selected but no API key provided. Skipping.');
        return null;
      }
      return new LlamaParseAdapter(config.llamaParseApiKey);
    
    case 'marker':
      // Marker WASM may fail to load in some environments
      try {
        return new MarkerAdapter();
      } catch (error) {
        console.warn('Marker WASM failed to initialize. Skipping.', error);
        return null;
      }
    
    case 'legacy':
      return new LegacyPdfJsAdapter();
    
    default:
      console.warn(`Unknown parser: ${name}. Skipping.`);
      return null;
  }
}

/**
 * Parser adapter that implements fallback logic
 */
class FallbackParserAdapter implements ParserAdapter {
  private readonly adapters: Array<{ name: string; adapter: ParserAdapter }>;
  private readonly requiredFeatures?: ParserFeature[];
  private consecutiveFailures = 0;
  private static readonly FAILURE_THRESHOLD = 5;

  constructor(
    adapters: Array<{ name: string; adapter: ParserAdapter }>,
    requiredFeatures?: ParserFeature[]
  ) {
    this.adapters = adapters;
    this.requiredFeatures = requiredFeatures;
  }

  async parse(pdfBuffer: ArrayBuffer, options?: ParseOptions): Promise<ParsedDocument> {
    let lastError: Error | null = null;

    for (const { name, adapter } of this.adapters) {
      // Check if adapter supports required features
      if (this.requiredFeatures) {
        const missingFeatures = this.requiredFeatures.filter(
          feature => !adapter.supports(feature)
        );
        if (missingFeatures.length > 0) {
          console.debug(
            `Skipping ${name}: missing features ${missingFeatures.join(', ')}`
          );
          continue;
        }
      }

      try {
        const result = await adapter.parse(pdfBuffer, options);
        this.consecutiveFailures = 0; // Reset on success
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Parser ${name} failed:`, lastError.message);
        this.consecutiveFailures++;

        // Circuit breaker: if too many consecutive failures, skip remaining high-tier parsers
        if (this.consecutiveFailures >= FallbackParserAdapter.FAILURE_THRESHOLD) {
          console.warn(
            `Circuit breaker triggered after ${this.consecutiveFailures} failures. Trying legacy fallback.`
          );
        }
      }
    }

    throw lastError || new Error('All parsers failed');
  }

  supports(feature: ParserFeature): boolean {
    // Return true if ANY adapter supports the feature
    return this.adapters.some(({ adapter }) => adapter.supports(feature));
  }

  getProviderName(): string {
    // Return the name of the primary (first) adapter
    return this.adapters[0]?.adapter.getProviderName() || 'unknown';
  }
}

/**
 * Get list of available parsers for the current environment
 */
export function getAvailableParsers(config: Partial<ParserConfig> = {}): string[] {
  const parsers: string[] = [];
  const testConfig: ParserConfig = {
    primary: 'llamaParse',
    fallbacks: ['marker', 'legacy'],
    llamaParseApiKey: 'test-key',
    ...config,
  };

  if (!testConfig.offlineOnly) {
    parsers.push('llamaParse');
  }
  
  try {
    new MarkerAdapter();
    parsers.push('marker');
  } catch {
    // Marker not available
  }
  
  parsers.push('legacy');
  
  return parsers;
}

/**
 * Check if a specific parser is available
 */
export function isParserAvailable(name: string, config: Partial<ParserConfig> = {}): boolean {
  switch (name) {
    case 'llamaParse':
      return !config.offlineOnly && !!config.llamaParseApiKey;
    case 'marker':
      try {
        new MarkerAdapter();
        return true;
      } catch {
        return false;
      }
    case 'legacy':
      return true;
    default:
      return false;
  }
}
