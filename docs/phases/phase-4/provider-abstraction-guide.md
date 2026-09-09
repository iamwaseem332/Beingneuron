# Phase 4 Provider Abstraction Guide

## Overview

This guide documents the LLM provider abstraction layer that guarantees structured output regardless of underlying model. The architecture follows the Adapter Pattern, mirroring Phase 3's parser design.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Extraction Pipeline                        │
├─────────────────────────────────────────────────────────┤
│  Chunk → [Provider Interface] → Result → Zod → Validator│
│                      ↑                                  │
│         ┌────────────┴────────────┐                     │
│         │                         │                     │
│  ┌──────▼──────┐          ┌───────▼──────┐             │
│  │ OpenAI      │          │ Fallback     │             │
│  │ Provider    │          │ Regex        │             │
│  └─────────────┘          └──────────────┘             │
│                                                        │
└─────────────────────────────────────────────────────────┘
```

## Provider Interface

All providers implement `ExtractionProvider`:

```typescript
interface ExtractionProvider {
  extract(chunk: Chunk, config: ExtractionProviderConfig): Promise<ExtractionResult>;
  getProviderName(): string;
  supportsStructuredOutput(): boolean;
}
```

### Configuration

```typescript
interface ExtractionProviderConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}
```

## Implemented Providers

### OpenAIProvider

Uses OpenAI's JSON Schema mode for strict structured output.

**Features:**
- `response_format: { type: "json_schema", json_schema: {...} }`
- Exponential backoff for rate limits
- Token usage tracking

**Configuration:**
```typescript
{
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
  maxTokens: 2000,
  temperature: 0.1,
  timeoutMs: 30000
}
```

### FallbackRegexProvider

Emergency last-resort provider using regex patterns.

**Characteristics:**
- Extracts basic entities (authors, institutions)
- ALL relations marked `isExplicitlyStated: false`
- Low confidence scores (0.1–0.3)
- NEVER hallucinates semantic relationships

**Use Cases:**
- API outages
- Rate limit exhaustion
- Cost constraints

## Provider Selection

Use the factory function for automatic selection:

```typescript
import { createProvider, isProviderAvailable } from './providers/ProviderFactory';

const provider = createProvider({
  preferred: 'openai',
  requireStructuredOutput: true,
  apiKeys: {
    openai: process.env.OPENAI_API_KEY
  }
});
```

### Selection Logic

1. Try preferred provider if available
2. Fall back to alternative LLM providers
3. Use FallbackRegexProvider as last resort

## Error Handling

All providers throw typed `ExtractionProviderError`:

```typescript
type ExtractionErrorType = 
  | 'TIMEOUT'
  | 'AUTH_ERROR'
  | 'RATE_LIMIT'
  | 'MALFORMED_RESPONSE'
  | 'VALIDATION_ERROR'
  | 'PROVIDER_ERROR'
  | 'UNKNOWN';
```

### Retry Strategy

```typescript
async function extractWithRetry(
  provider: ExtractionProvider,
  chunk: Chunk,
  config: ExtractionProviderConfig,
  maxRetries = 3
): Promise<ExtractionResult> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await provider.extract(chunk, config);
    } catch (error) {
      lastError = error;
      
      if (error instanceof ExtractionProviderError) {
        // Don't retry auth errors or validation failures
        if (error.type === 'AUTH_ERROR' || error.type === 'VALIDATION_ERROR') {
          throw error;
        }
        
        // Exponential backoff for rate limits/timeouts
        if (error.type === 'RATE_LIMIT' || error.type === 'TIMEOUT') {
          const delay = Math.pow(2, attempt) * 1000;
          await sleep(delay);
          continue;
        }
      }
    }
  }
  
  throw lastError;
}
```

## Extending with New Providers

### Step 1: Implement Interface

```typescript
import { ExtractionProvider, ExtractionProviderConfig, ExtractionResult } from './types';

export class AnthropicProvider implements ExtractionProvider {
  getProviderName(): string {
    return 'anthropic';
  }
  
  supportsStructuredOutput(): boolean {
    return true;
  }
  
  async extract(chunk: Chunk, config: ExtractionProviderConfig): Promise<ExtractionResult> {
    // Implementation using Anthropic's tool use API
  }
}
```

### Step 2: Register in Factory

```typescript
// In ProviderFactory.ts
export function createProvider(options: ProviderSelectionOptions): ExtractionProvider {
  switch (options.preferred) {
    case 'anthropic':
      if (options.apiKeys.anthropic) {
        return new AnthropicProvider();
      }
      break;
    // ...
  }
}
```

### Step 3: Add Default Config

```typescript
export function getDefaultConfig(providerType: ProviderType): ExtractionProviderConfig {
  switch (providerType) {
    case 'anthropic':
      return {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-3.5-sonnet-20241022',
        maxTokens: 2000,
        temperature: 0.1,
        timeoutMs: 30000
      };
  }
}
```

## Prompt Versioning

Prompts are versioned and tracked in metadata:

```typescript
extractionMetadata: {
  model: "openai/gpt-4o",
  promptVersion: "v1.2",  // Increment on changes
  timestamp: "2024-01-15T10:30:00Z",
  tokenUsage: { input: 1200, output: 650 }
}
```

### Version History

| Version | Changes |
|---------|---------|
| v1.0 | Initial release |
| v1.1 | Added explicit co-occurrence instructions |
| v1.2 | Improved evidence span formatting examples |

See `src/lib/extraction/prompts/` for versioned prompt templates.

## Cost Monitoring

Track token usage per extraction:

```typescript
const result = await provider.extract(chunk, config);

if (result.tokenUsage) {
  console.log(`Input: ${result.tokenUsage.input} tokens`);
  console.log(`Output: ${result.tokenUsage.output} tokens`);
  
  // Estimate cost (OpenAI example)
  const inputCost = (result.tokenUsage.input / 1_000_000) * 2.50;
  const outputCost = (result.tokenUsage.output / 1_000_000) * 10.00;
  console.log(`Estimated cost: $${(inputCost + outputCost).toFixed(4)}`);
}
```

## A/B Testing

Provider abstraction enables model comparison without code changes:

```typescript
// Run same corpus through different providers
const openaiResults = await runExtraction(openaiProvider, corpus);
const anthropicResults = await runExtraction(anthropicProvider, corpus);

// Compare against gold standard
const openaiMetrics = computeMetrics(openaiResults, goldStandard);
const anthropicMetrics = computeMetrics(anthropicResults, goldStandard);

console.log('OpenAI F1:', openaiMetrics.entityF1);
console.log('Anthropic F1:', anthropicMetrics.entityF1);
```

---

*This guide is part of Phase 4 deliverables. See docs/phases/phase-4/ for related documentation.*
