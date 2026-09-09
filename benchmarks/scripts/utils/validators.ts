import Ajv, { ValidateFunction } from 'ajv';

const ajv = new Ajv();

// Schema for entities.json gold standard
const entitiesSchema = {
  type: 'object',
  required: ['annotations'],
  properties: {
    annotations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['paperId', 'entities'],
        properties: {
          paperId: { type: 'string' },
          entities: {
            type: 'array',
            items: {
              type: 'object',
              required: ['entityId', 'text', 'normalizedForm', 'entityType', 'page', 'startOffset', 'endOffset'],
              properties: {
                entityId: { type: 'string' },
                text: { type: 'string' },
                normalizedForm: { type: 'string' },
                entityType: { type: 'string', enum: ['concept', 'method', 'dataset', 'claim', 'author', 'metric', 'task'] },
                page: { type: 'integer', minimum: 1 },
                startOffset: { type: 'integer', minimum: 0 },
                endOffset: { type: 'integer', minimum: 0 }
              }
            }
          }
        }
      }
    }
  }
};

// Schema for relations.json gold standard
const relationsSchema = {
  type: 'object',
  required: ['annotations'],
  properties: {
    annotations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['paperId', 'relations'],
        properties: {
          paperId: { type: 'string' },
          relations: {
            type: 'array',
            items: {
              type: 'object',
              required: ['relationId', 'subjectEntityId', 'objectEntityId', 'relationType', 'confidence'],
              properties: {
                relationId: { type: 'string' },
                subjectEntityId: { type: 'string' },
                objectEntityId: { type: 'string' },
                relationType: { type: 'string', enum: ['uses', 'extends', 'contradicts', 'cites', 'evaluates_on', 'proposes', 'improves', 'based_on'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 }
              }
            }
          }
        }
      }
    }
  }
};

// Schema for evidence_spans.json gold standard
const evidenceSpansSchema = {
  type: 'object',
  required: ['annotations'],
  properties: {
    annotations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['paperId', 'evidenceSpans'],
        properties: {
          paperId: { type: 'string' },
          evidenceSpans: {
            type: 'array',
            items: {
              type: 'object',
              required: ['spanId', 'page', 'startOffset', 'endOffset', 'text'],
              oneOf: [
                { required: ['linkedEntityId'] },
                { required: ['linkedRelationId'] }
              ],
              properties: {
                spanId: { type: 'string' },
                linkedEntityId: { type: 'string' },
                linkedRelationId: { type: 'string' },
                page: { type: 'integer', minimum: 1 },
                startOffset: { type: 'integer', minimum: 0 },
                endOffset: { type: 'integer', minimum: 0 },
                text: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
};

// Compile validators
let validateEntities: ValidateFunction | null = null;
let validateRelations: ValidateFunction | null = null;
let validateEvidenceSpans: ValidateFunction | null = null;

/**
 * Validate entities.json against schema
 */
export function validateEntities(data: unknown): { valid: boolean; errors?: string[] } {
  if (!validateEntities) {
    validateEntities = ajv.compile(entitiesSchema);
  }
  
  const valid = validateEntities(data);
  if (!valid) {
    const errors = validateEntities.errors?.map(e => 
      `Path: ${e.instancePath || 'root'} - ${e.message}`
    ) || ['Unknown validation error'];
    return { valid: false, errors };
  }
  return { valid: true };
}

/**
 * Validate relations.json against schema
 */
export function validateRelations(data: unknown): { valid: boolean; errors?: string[] } {
  if (!validateRelations) {
    validateRelations = ajv.compile(relationsSchema);
  }
  
  const valid = validateRelations(data);
  if (!valid) {
    const errors = validateRelations.errors?.map(e => 
      `Path: ${e.instancePath || 'root'} - ${e.message}`
    ) || ['Unknown validation error'];
    return { valid: false, errors };
  }
  return { valid: true };
}

/**
 * Validate evidence_spans.json against schema
 */
export function validateEvidenceSpans(data: unknown): { valid: boolean; errors?: string[] } {
  if (!validateEvidenceSpans) {
    validateEvidenceSpans = ajv.compile(evidenceSpansSchema);
  }
  
  const valid = validateEvidenceSpans(data);
  if (!valid) {
    const errors = validateEvidenceSpans.errors?.map(e => 
      `Path: ${e.instancePath || 'root'} - ${e.message}`
    ) || ['Unknown validation error'];
    return { valid: false, errors };
  }
  return { valid: true };
}

/**
 * Normalize text for comparison (lowercase, trim, collapse whitespace)
 */
export function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if two text spans match using exact + normalized matching
 */
export function textMatches(extracted: string, gold: string, threshold: number = 0.9): boolean {
  // Exact match
  if (extracted === gold) return true;
  
  // Normalized exact match
  const normExtracted = normalizeText(extracted);
  const normGold = normalizeText(gold);
  if (normExtracted === normGold) return true;
  
  // Fuzzy match using simple overlap ratio
  const words1 = normExtracted.split(' ');
  const words2 = normGold.split(' ');
  const commonWords = words1.filter(w => words2.includes(w));
  const overlap = commonWords.length / Math.max(words1.length, words2.length);
  
  return overlap >= threshold;
}

/**
 * Compute text overlap ratio between two spans
 * Returns value between 0 (no overlap) and 1 (complete overlap)
 */
export function computeTextOverlap(extractedStart: number, extractedEnd: number, goldStart: number, goldEnd: number): number {
  const overlapStart = Math.max(extractedStart, goldStart);
  const overlapEnd = Math.min(extractedEnd, goldEnd);
  
  if (overlapStart >= overlapEnd) return 0;
  
  const overlapLength = overlapEnd - overlapStart;
  const unionLength = Math.max(extractedEnd, goldEnd) - Math.min(extractedStart, goldStart);
  
  return unionLength > 0 ? overlapLength / unionLength : 0;
}

/**
 * Check if evidence span is correct based on page match and text overlap >= 0.8
 */
export function evidenceSpanCorrect(
  extractedPage: number,
  extractedStart: number,
  extractedEnd: number,
  goldPage: number,
  goldStart: number,
  goldEnd: number
): boolean {
  // Must be on same page
  if (extractedPage !== goldPage) return false;
  
  // Compute character-level overlap
  const overlap = computeTextOverlap(extractedStart, extractedEnd, goldStart, goldEnd);
  return overlap >= 0.8;
}

/**
 * Build entity lookup map from gold standard data
 */
export function buildEntityLookup(goldEntities: Array<{ entityId: string; text: string; normalizedForm: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const entity of goldEntities) {
    // Index by both original text and normalized form
    map.set(normalizeText(entity.text), entity.entityId);
    map.set(normalizeText(entity.normalizedForm), entity.entityId);
  }
  return map;
}
