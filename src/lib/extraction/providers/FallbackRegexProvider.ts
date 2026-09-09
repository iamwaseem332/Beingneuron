/**
 * Phase 4 — Fallback Regex Extraction Provider
 * 
 * Emergency last-resort provider when LLM APIs fail catastrophically.
 * Uses regex patterns to extract basic entities (authors, institutions)
 * and marks ALL relations as isExplicitlyStated: false with low confidence.
 * 
 * CRITICAL: This provider NEVER generates hallucinated semantic relationships.
 * It serves as a graceful degradation mechanism, not a full replacement.
 */

import { ExtractionProvider, ExtractionProviderConfig, ExtractionResult } from './types';
import type { Chunk } from '../../chunking/types';
import { ExtractedEntity, ExtractedRelation } from '../schemas';

export class FallbackRegexProvider implements ExtractionProvider {
  private readonly providerName = 'fallback-regex';
  
  // Simple regex patterns for basic entity extraction
  private patterns = {
    // Email-based author detection
    author: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
    // Institution keywords
    institution: /\b(University|Institute|Laboratory|College|Department|Research Center)\b/gi,
    // Dataset mentions
    dataset: /\b([A-Z][A-Za-z0-9]*(?:\s+(?:Dataset|Corpus|Benchmark|Collection))?)\b/g,
    // Year patterns for temporal context
    year: /\b(19|20)\d{2}\b/g
  };
  
  getProviderName(): string {
    return this.providerName;
  }
  
  supportsStructuredOutput(): boolean {
    return false;
  }
  
  async extract(chunk: Chunk, config: ExtractionProviderConfig): Promise<ExtractionResult> {
    try {
      const entities: ExtractedEntity[] = [];
      const relations: ExtractedRelation[] = [];
      
      // Generate deterministic IDs
      const makeId = (prefix: string, index: number) => 
        `${prefix}-${chunk.id.slice(0, 8)}-${index}`;
      
      let entityIndex = 0;
      
      // Extract potential authors (capitalized names)
      const authorMatches = [...chunk.text.matchAll(this.patterns.author)];
      const seenAuthors = new Set<string>();
      
      for (const match of authorMatches) {
        const name = match[0];
        // Filter out common false positives
        if (this.isFalsePositiveAuthor(name)) continue;
        if (seenAuthors.has(name)) continue;
        seenAuthors.add(name);
        
        const startChar = match.index || 0;
        const endChar = startChar + name.length;
        
        entities.push({
          id: makeId('ent', entityIndex++),
          type: 'author',
          normalizedForm: this.normalizeName(name),
          rawMentions: [name],
          evidenceSpans: [{
            chunkId: chunk.id,
            startChar,
            endChar,
            pageNumber: chunk.startPage,
            excerpt: name,
            confidence: 0.3 // Low confidence for regex extraction
          }],
          sectionContext: chunk.sectionTitle || undefined,
          confidence: 0.3
        });
      }
      
      // Extract institution mentions
      const institutionMatches = [...chunk.text.matchAll(this.patterns.institution)];
      const seenInstitutions = new Set<string>();
      
      for (const match of institutionMatches) {
        // Get surrounding context for better institution name
        const startChar = match.index || 0;
        const contextStart = Math.max(0, startChar - 50);
        const contextEnd = Math.min(chunk.text.length, startChar + 100);
        const context = chunk.text.substring(contextStart, contextEnd);
        
        // Try to extract full institution name
        const institutionName = this.extractInstitutionName(context, match[0]);
        if (seenInstitutions.has(institutionName)) continue;
        seenInstitutions.add(institutionName);
        
        const actualStart = contextStart + context.indexOf(institutionName);
        
        entities.push({
          id: makeId('ent', entityIndex++),
          type: 'institution',
          normalizedForm: institutionName.toLowerCase(),
          rawMentions: [institutionName],
          evidenceSpans: [{
            chunkId: chunk.id,
            startChar: actualStart,
            endChar: actualStart + institutionName.length,
            pageNumber: chunk.startPage,
            excerpt: institutionName,
            confidence: 0.25
          }],
          sectionContext: chunk.sectionTitle || undefined,
          confidence: 0.25
        });
      }
      
      // Extract potential dataset mentions
      const datasetMatches = [...chunk.text.matchAll(this.patterns.dataset)];
      const seenDatasets = new Set<string>();
      
      for (const match of datasetMatches) {
        const name = match[0];
        // Filter out common words
        if (name.length < 4 || this.isCommonWord(name)) continue;
        if (seenDatasets.has(name)) continue;
        seenDatasets.add(name);
        
        const startChar = match.index || 0;
        
        entities.push({
          id: makeId('ent', entityIndex++),
          type: 'dataset',
          normalizedForm: name.toLowerCase(),
          rawMentions: [name],
          evidenceSpans: [{
            chunkId: chunk.id,
            startChar,
            endChar: startChar + name.length,
            pageNumber: chunk.startPage,
            excerpt: name,
            confidence: 0.2
          }],
          sectionContext: chunk.sectionTitle || undefined,
          confidence: 0.2
        });
      }
      
      // Create minimal co-occurrence relations (all marked as NOT explicitly stated)
      let relationIndex = 0;
      for (let i = 0; i < entities.length && i < 5; i++) {
        for (let j = i + 1; j < entities.length && j < 5; j++) {
          // Only create relations between different types
          if (entities[i].type === entities[j].type) continue;
          
          relations.push({
            id: makeId('rel', relationIndex++),
            sourceEntityId: entities[i].id,
            targetEntityId: entities[j].id,
            type: 'co_occurs',
            evidenceSpans: [{
              chunkId: chunk.id,
              startChar: 0,
              endChar: Math.min(100, chunk.text.length),
              pageNumber: chunk.startPage,
              excerpt: chunk.text.substring(0, Math.min(100, chunk.text.length)),
              confidence: 0.1
            }],
            isExplicitlyStated: false, // CRITICAL: Never claim explicit relations
            confidence: 0.1
          });
        }
      }
      
      return {
        success: true,
        data: {
          chunkId: chunk.id,
          paperId: chunk.paperId,
          entities,
          relations,
          extractionMetadata: {
            model: 'regex-fallback',
            promptVersion: 'v1.0',
            timestamp: new Date().toISOString(),
            tokenUsage: {
              input: 0,
              output: 0
            }
          }
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Fallback provider failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Filter out common false positive author names
   */
  private isFalsePositiveAuthor(name: string): boolean {
    const falsePositives = new Set([
      'The', 'This', 'That', 'These', 'Those',
      'Abstract', 'Introduction', 'Methods', 'Results', 'Discussion',
      'Conclusion', 'References', 'Acknowledgments', 'Supplementary',
      'Figure', 'Table', 'Equation', 'Algorithm',
      'We', 'They', 'Our', 'Their'
    ]);
    
    return falsePositives.has(name) || 
           name.split(' ').length > 4 || // Too many words
           name.toLowerCase().includes('the ') ||
           !/[A-Z][a-z]+\s+[A-Z]/.test(name); // Doesn't look like a name
  }
  
  /**
   * Normalize a person's name
   */
  private normalizeName(name: string): string {
    return name.trim();
  }
  
  /**
   * Extract full institution name from context
   */
  private extractInstitutionName(context: string, keyword: string): string {
    // Try to capture full institution name
    const institutionPatterns = [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+University(?:\s+of\s+[A-Z][a-z]+)?)/i,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+Institute(?:\s+of\s+Technology)?)/i,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+Laboratory)/i,
      /((?:Department|School)\s+of\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
    ];
    
    for (const pattern of institutionPatterns) {
      const match = context.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    // Fall back to keyword plus one word before
    const wordsBefore = context.split(keyword)[0]?.split(/\s+/).slice(-2).join(' ') || '';
    return `${wordsBefore} ${keyword}`.trim();
  }
  
  /**
   * Check if a word is a common English word
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'The', 'This', 'That', 'These', 'Those', 'And', 'But', 'Or',
      'For', 'Nor', 'Yet', 'So', 'If', 'Then', 'Else', 'When',
      'Where', 'Why', 'How', 'What', 'Which', 'Who', 'Whom',
      'Dataset', 'Datasets', 'Corpus', 'Collection', 'Benchmark'
    ]);
    
    return commonWords.has(word);
  }
}
