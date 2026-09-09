/**
 * Phase 4 — OpenAI Extraction Provider
 * 
 * Implements extraction using OpenAI's API with JSON mode for structured output.
 * Uses response_format with json_schema for strict schema enforcement.
 */

import { ExtractionProvider, ExtractionProviderConfig, ExtractionResult, ExtractionProviderError } from './types';
import { ChunkExtractionResultSchema, validateExtractionResult } from '../schemas';
import type { Chunk } from '../../chunking/types';

export class OpenAIProvider implements ExtractionProvider {
  private readonly providerName = 'openai';
  
  getProviderName(): string {
    return this.providerName;
  }
  
  supportsStructuredOutput(): boolean {
    return true;
  }
  
  async extract(chunk: Chunk, config: ExtractionProviderConfig): Promise<ExtractionResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
    
    try {
      const prompt = this.buildPrompt(chunk);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model || 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt()
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: config.maxTokens || 2000,
          temperature: config.temperature ?? 0.1,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'chunk_extraction',
              strict: true,
              schema: this.getJsonSchema()
            }
          }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        
        if (response.status === 401) {
          throw new ExtractionProviderError(
            'OpenAI API authentication failed',
            'AUTH_ERROR',
            errorBody
          );
        }
        
        if (response.status === 429) {
          throw new ExtractionProviderError(
            'OpenAI rate limit exceeded',
            'RATE_LIMIT',
            errorBody
          );
        }
        
        throw new ExtractionProviderError(
          `OpenAI API error: ${response.status}`,
          'PROVIDER_ERROR',
          errorBody
        );
      }
      
      const data = await response.json();
      
      // Parse the response
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new ExtractionProviderError(
          'Empty response from OpenAI',
          'MALFORMED_RESPONSE'
        );
      }
      
      const parsed = JSON.parse(content);
      
      // Validate against Zod schema
      const validated = validateExtractionResult({
        ...parsed,
        chunkId: chunk.id,
        paperId: chunk.paperId,
        extractionMetadata: {
          model: config.model,
          promptVersion: 'v1.0',
          timestamp: new Date().toISOString(),
          tokenUsage: {
            input: data.usage?.prompt_tokens || 0,
            output: data.usage?.completion_tokens || 0
          }
        }
      });
      
      return {
        success: true,
        data: validated,
        tokenUsage: {
          input: data.usage?.prompt_tokens || 0,
          output: data.usage?.completion_tokens || 0
        }
      };
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof ExtractionProviderError) {
        throw error;
      }
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExtractionProviderError(
          `Request timed out after ${config.timeoutMs}ms`,
          'TIMEOUT'
        );
      }
      
      if (error instanceof SyntaxError) {
        throw new ExtractionProviderError(
          'Failed to parse JSON response',
          'MALFORMED_RESPONSE',
          error
        );
      }
      
      throw new ExtractionProviderError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN',
        error
      );
    }
  }
  
  private buildPrompt(chunk: Chunk): string {
    return `Extract entities and semantic relationships from the following text chunk.

**Instructions:**
1. Identify all scientific entities (concepts, methods, datasets, models, claims, results, limitations)
2. For each entity, provide:
   - A normalized form (canonical name for deduplication)
   - All raw mentions found in the text
   - At least one evidence span with exact character offsets
3. Identify relationships between entities ONLY when explicitly stated in the text
4. Set isExplicitlyStated to false for co-occurrence-only connections
5. NEVER invent relationships not supported by the text

**Chunk Text:**
${chunk.text}

**Section Context:** ${chunk.sectionTitle || 'Unknown'}

Return your response as valid JSON matching the required schema.`;
  }
  
  private getSystemPrompt(): string {
    return `You are a scientific document analysis assistant. Extract entities and relationships from research papers with high precision.

CRITICAL RULES:
- Every entity MUST have at least one evidence span with verbatim text
- Character offsets (startChar, endChar) must exactly match the excerpt
- Only mark relationships as isExplicitlyStated=true if the paper explicitly asserts the connection
- Use isExplicitlyStated=false for simple co-occurrences
- If you cannot find supporting evidence, do not extract the entity/relation
- Confidence scores should reflect your certainty (0.0–1.0)

ENTITY TYPES: concept, method, dataset, model, author, institution, claim, result, limitation

RELATION TYPES: uses, evaluates_on, improves, contradicts, extends, derives_from, co_occurs`;
  }
  
  private getJsonSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['concept', 'method', 'dataset', 'model', 'author', 'institution', 'claim', 'result', 'limitation'] },
              normalizedForm: { type: 'string' },
              rawMentions: { type: 'array', items: { type: 'string' } },
              evidenceSpans: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    chunkId: { type: 'string' },
                    startChar: { type: 'integer' },
                    endChar: { type: 'integer' },
                    pageNumber: { type: 'integer' },
                    excerpt: { type: 'string' },
                    confidence: { type: 'number' }
                  },
                  required: ['chunkId', 'startChar', 'endChar', 'pageNumber', 'excerpt', 'confidence'],
                  additionalProperties: false
                }
              },
              sectionContext: { type: 'string' },
              confidence: { type: 'number' }
            },
            required: ['id', 'type', 'normalizedForm', 'rawMentions', 'evidenceSpans', 'confidence'],
            additionalProperties: false
          }
        },
        relations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              sourceEntityId: { type: 'string' },
              targetEntityId: { type: 'string' },
              type: { type: 'string', enum: ['uses', 'evaluates_on', 'improves', 'contradicts', 'extends', 'derives_from', 'co_occurs'] },
              evidenceSpans: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    chunkId: { type: 'string' },
                    startChar: { type: 'integer' },
                    endChar: { type: 'integer' },
                    pageNumber: { type: 'integer' },
                    excerpt: { type: 'string' },
                    confidence: { type: 'number' }
                  },
                  required: ['chunkId', 'startChar', 'endChar', 'pageNumber', 'excerpt', 'confidence'],
                  additionalProperties: false
                }
              },
              isExplicitlyStated: { type: 'boolean' },
              confidence: { type: 'number' }
            },
            required: ['id', 'sourceEntityId', 'targetEntityId', 'type', 'evidenceSpans', 'isExplicitlyStated', 'confidence'],
            additionalProperties: false
          }
        }
      },
      required: ['entities', 'relations'],
      additionalProperties: false
    };
  }
}
