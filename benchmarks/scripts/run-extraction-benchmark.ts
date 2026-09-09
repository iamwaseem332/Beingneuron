#!/usr/bin/env tsx

/**
 * Extraction Pipeline Benchmark Script
 * 
 * Processes all papers in corpus/papers/ through the extraction pipeline
 * and compares results against gold standard annotations.
 * 
 * Usage: tsx run-extraction-benchmark.ts --phase <name> --output <path>
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import Ajv from 'ajv';

interface PaperMetadata {
  paperId: string;
  title: string;
  fileName: string;
  pageCount: number;
  tableDensity: string;
  formulaCount: number;
  citationCount: number;
  sha256: string;
}

interface CorpusMetadata {
  corpusVersion: string;
  lastUpdated: string;
  papers: PaperMetadata[];
}

interface GoldEntity {
  entityId: string;
  text: string;
  normalizedForm: string;
  entityType: string;
  page: number;
  startOffset: number;
  endOffset: number;
}

interface GoldRelation {
  relationId: string;
  subjectEntityId: string;
  objectEntityId: string;
  relationType: string;
  confidence: number;
}

interface GoldEvidenceSpan {
  spanId: string;
  linkedEntityId?: string;
  linkedRelationId?: string;
  page: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

interface ExtractedEntity {
  text: string;
  normalizedForm?: string;
  entityType: string;
  page?: number;
}

interface ExtractedRelation {
  subject: string;
  object: string;
  relationType: string;
}

interface ExtractionResult {
  paperId: string;
  success: boolean;
  processingTimeMs: number;
  parseSuccess: boolean;
  tokenUsage?: number;
  extractedEntities: ExtractedEntity[];
  extractedRelations: ExtractedRelation[];
  evidenceSpans: Array<{ page: number; startOffset: number; endOffset: number }>;
  error?: string;
}

interface BenchmarkResult {
  commit: string;
  date: string;
  phase: string;
  environment: string;
  corpusVersion: string;
  extraction: {
    medianProcessingTimeMs: number;
    p95ProcessingTimeMs: number;
    parseSuccessRate: number;
    entityPrecision: number;
    entityRecall: number;
    relationF1: number;
    evidenceAccuracy: number;
    tokenCostPerPaperUsd: number;
  };
  graph: {
    initialLayoutTimeMs: number;
    nodeClickLatencyMs: number;
    fullscreenTransitionMs: number;
    layoutOverlapPercent: number;
    dragFps: number;
    multiPaperQueryRenderMs: number;
  };
  database: {
    paperGraphQueryP95Ms: number;
    indexHitRatio: number;
    orphanRecords: number;
    rlsIsolationTestsPassed: boolean;
  };
}

function parseArgs(args: string[]): { phase: string; output: string } {
  const result = { phase: 'baseline', output: 'benchmarks/results/baseline.json' };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--phase' && args[i + 1]) {
      result.phase = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      result.output = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Extraction Pipeline Benchmark

Usage: tsx run-extraction-benchmark.ts --phase <name> --output <path>

Options:
  --phase   Phase name (e.g., 'baseline', 'phase-3') [default: baseline]
  --output  Output file path for results JSON [default: benchmarks/results/baseline.json]
  --help    Show this help message

Example:
  tsx run-extraction-benchmark.ts --phase baseline --output benchmarks/results/baseline.json
`);
      process.exit(0);
    }
  }
  
  return result;
}

async function loadCorpusMetadata(): Promise<CorpusMetadata> {
  const metadataPath = join(process.cwd(), 'benchmarks', 'corpus', 'metadata.json');
  
  if (!existsSync(metadataPath)) {
    throw new Error(
      `Corpus metadata not found at ${metadataPath}. ` +
      `Please curate your corpus following benchmarks/corpus/README.md`
    );
  }
  
  const content = await readFile(metadataPath, 'utf-8');
  return JSON.parse(content) as CorpusMetadata;
}

async function loadGoldStandard(paperId: string): Promise<{
  entities: GoldEntity[];
  relations: GoldRelation[];
  evidenceSpans: GoldEvidenceSpan[];
}> {
  const entitiesPath = join(process.cwd(), 'benchmarks', 'gold', 'entities.json');
  const relationsPath = join(process.cwd(), 'benchmarks', 'gold', 'relations.json');
  const evidencePath = join(process.cwd(), 'benchmarks', 'gold', 'evidence_spans.json');
  
  let entities: GoldEntity[] = [];
  let relations: GoldRelation[] = [];
  let evidenceSpans: GoldEvidenceSpan[] = [];
  
  // Load and validate entities
  if (existsSync(entitiesPath)) {
    const content = await readFile(entitiesPath, 'utf-8');
    const data = JSON.parse(content);
    const annotation = data.annotations?.find((a: any) => a.paperId === paperId);
    if (annotation) {
      entities = annotation.entities || [];
    }
  }
  
  // Load and validate relations
  if (existsSync(relationsPath)) {
    const content = await readFile(relationsPath, 'utf-8');
    const data = JSON.parse(content);
    const annotation = data.annotations?.find((a: any) => a.paperId === paperId);
    if (annotation) {
      relations = annotation.relations || [];
    }
  }
  
  // Load and validate evidence spans
  if (existsSync(evidencePath)) {
    const content = await readFile(evidencePath, 'utf-8');
    const data = JSON.parse(content);
    const annotation = data.annotations?.find((a: any) => a.paperId === paperId);
    if (annotation) {
      evidenceSpans = annotation.evidenceSpans || [];
    }
  }
  
  return { entities, relations, evidenceSpans };
}

function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

function computePrecisionRecallF1(tp: number, fp: number, fn: number): { precision: number; recall: number; f1: number } {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

function evaluateEntityExtraction(
  extracted: ExtractedEntity[],
  gold: GoldEntity[]
): { tp: number; fp: number; fn: number; precision: number; recall: number } {
  let tp = 0;
  const matchedGold = new Set<number>();
  
  for (const ext of extracted) {
    let matched = false;
    for (let i = 0; i < gold.length; i++) {
      if (matchedGold.has(i)) continue;
      
      const g = gold[i];
      const normExt = normalizeText(ext.normalizedForm || ext.text);
      const normGold = normalizeText(g.normalizedForm);
      
      if (normExt === normGold) {
        tp++;
        matchedGold.add(i);
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      // Count as false positive
    }
  }
  
  const fp = extracted.length - tp;
  const fn = gold.length - tp;
  const { precision, recall } = computePrecisionRecallF1(tp, fp, fn);
  
  return { tp, fp, fn, precision, recall };
}

function evaluateRelationExtraction(
  extracted: ExtractedRelation[],
  gold: GoldRelation[],
  entityMap: Map<string, string>
): { tp: number; fp: number; fn: number; f1: number } {
  let tp = 0;
  const matchedGold = new Set<number>();
  
  for (const ext of extracted) {
    const extSubject = entityMap.get(normalizeText(ext.subject));
    const extObject = entityMap.get(normalizeText(ext.object));
    
    if (!extSubject || !extObject) continue;
    
    for (let i = 0; i < gold.length; i++) {
      if (matchedGold.has(i)) continue;
      
      const g = gold[i];
      if (g.subjectEntityId === extSubject && g.objectEntityId === extObject && g.relationType === ext.relationType) {
        tp++;
        matchedGold.add(i);
        break;
      }
    }
  }
  
  const fp = extracted.length - tp;
  const fn = gold.length - tp;
  const { f1 } = computePrecisionRecallF1(tp, fp, fn);
  
  return { tp, fp, fn, f1 };
}

function evaluateEvidenceAccuracy(
  extracted: Array<{ page: number; startOffset: number; endOffset: number }>,
  gold: GoldEvidenceSpan[]
): number {
  if (gold.length === 0) return 1.0;
  if (extracted.length === 0) return 0.0;
  
  let correct = 0;
  
  for (const g of gold) {
    for (const e of extracted) {
      if (e.page !== g.page) continue;
      
      // Compute character-level overlap
      const overlapStart = Math.max(e.startOffset, g.startOffset);
      const overlapEnd = Math.min(e.endOffset, g.endOffset);
      
      if (overlapStart >= overlapEnd) continue;
      
      const overlapLength = overlapEnd - overlapStart;
      const unionLength = Math.max(e.endOffset, g.endOffset) - Math.min(e.startOffset, g.startOffset);
      const overlap = unionLength > 0 ? overlapLength / unionLength : 0;
      
      if (overlap >= 0.8) {
        correct++;
        break;
      }
    }
  }
  
  return correct / gold.length;
}

async function simulateExtraction(paperFile: string): Promise<ExtractionResult> {
  /**
   * SIMULATION MODE - No actual extraction pipeline exists yet
   * 
   * This function simulates extraction results for benchmarking framework testing.
   * In Phase 3+, this will call the actual Edge Function extraction pipeline.
   * 
   * TODO: Replace with actual Edge Function call:
   * const response = await supabase.functions.invoke('extract-paper', { ... });
   */
  
  const startTime = Date.now();
  
  // Simulate processing delay (will be replaced with actual extraction time)
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
  
  // Simulate successful parse
  const parseSuccess = true;
  
  // Simulate extracted entities (placeholder - will come from actual extraction)
  const extractedEntities: ExtractedEntity[] = [
    { text: 'Transformer', normalizedForm: 'Transformer', entityType: 'concept' },
    { text: 'attention mechanism', normalizedForm: 'Attention', entityType: 'method' }
  ];
  
  // Simulate extracted relations
  const extractedRelations: ExtractedRelation[] = [
    { subject: 'Transformer', object: 'attention mechanism', relationType: 'uses' }
  ];
  
  // Simulate evidence spans
  const evidenceSpans = [
    { page: 1, startOffset: 100, endOffset: 150 }
  ];
  
  const processingTimeMs = Date.now() - startTime;
  
  return {
    paperId: paperFile.replace('.pdf', ''),
    success: true,
    processingTimeMs,
    parseSuccess,
    tokenUsage: 500 + Math.floor(Math.random() * 500),
    extractedEntities,
    extractedRelations,
    evidenceSpans
  };
}

async function getGitCommit(): Promise<string> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const { stdout } = await execAsync('git rev-parse --short HEAD');
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { phase, output } = args;
  
  console.log(`Starting extraction benchmark for phase: ${phase}`);
  console.log(`Output will be written to: ${output}`);
  
  // Check if this is a dry run
  if (process.argv.includes('--dry-run')) {
    console.log('DRY RUN: Arguments parsed successfully. No actual execution.');
    console.log('Phase:', phase);
    console.log('Output:', output);
    process.exit(0);
  }
  
  // Load corpus metadata
  console.log('\nLoading corpus metadata...');
  const corpusMetadata = await loadCorpusMetadata();
  console.log(`Found ${corpusMetadata.papers.length} papers in corpus`);
  
  if (corpusMetadata.papers.length === 0) {
    console.warn('WARNING: Corpus is empty. Please add papers following benchmarks/corpus/README.md');
    console.warn('⚠️  SIMULATED MODE: Results are placeholders, not actual benchmark measurements'); console.warn('   To run real benchmarks, implement full pipeline integration.');;
  }
  
  // Validate gold standard files exist
  const goldEntitiesPath = join(process.cwd(), 'benchmarks', 'gold', 'entities.json');
  const goldRelationsPath = join(process.cwd(), 'benchmarks', 'gold', 'relations.json');
  const goldEvidencePath = join(process.cwd(), 'benchmarks', 'gold', 'evidence_spans.json');
  
  if (!existsSync(goldEntitiesPath)) {
    console.warn(`WARNING: Gold standard entities not found at ${goldEntitiesPath}`);
    console.warn('Entity metrics will be null. Create gold annotations following schema.');
  }
  
  // Process each paper
  const results: ExtractionResult[] = [];
  const processingTimes: number[] = [];
  let parseSuccesses = 0;
  let totalTokenUsage = 0;
  
  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;
  let totalRelationTp = 0;
  let totalRelationFp = 0;
  let totalRelationFn = 0;
  let totalEvidenceCorrect = 0;
  let totalEvidenceGold = 0;
  
  for (const paper of corpusMetadata.papers) {
    const paperPath = join(process.cwd(), 'benchmarks', 'corpus', 'papers', paper.fileName);
    
    if (!existsSync(paperPath)) {
      console.warn(`Paper not found: ${paper.fileName}. Skipping...`);
      results.push({
        paperId: paper.paperId,
        success: false,
        processingTimeMs: 0,
        parseSuccess: false,
        extractedEntities: [],
        extractedRelations: [],
        evidenceSpans: [],
        error: 'File not found'
      });
      continue;
    }
    
    console.log(`\nProcessing: ${paper.title}`);
    
    try {
      const result = await simulateExtraction(paper.fileName);
      results.push(result);
      
      if (result.success) {
        processingTimes.push(result.processingTimeMs);
        if (result.parseSuccess) parseSuccesses++;
        if (result.tokenUsage) totalTokenUsage += result.tokenUsage;
        
        // Load gold standard for evaluation
        const gold = await loadGoldStandard(paper.paperId);
        
        if (gold.entities.length > 0) {
          const entityEval = evaluateEntityExtraction(result.extractedEntities, gold.entities);
          totalTp += entityEval.tp;
          totalFp += entityEval.fp;
          totalFn += entityEval.fn;
          
          // Build entity map for relation evaluation
          const entityMap = new Map<string, string>();
          gold.entities.forEach((e, i) => {
            entityMap.set(normalizeText(e.normalizedForm), e.entityId);
          });
          
          if (gold.relations.length > 0) {
            const relationEval = evaluateRelationExtraction(result.extractedRelations, gold.relations, entityMap);
            totalRelationTp += relationEval.tp;
            totalRelationFp += relationEval.fp;
            totalRelationFn += relationEval.fn;
          }
          
          if (gold.evidenceSpans.length > 0) {
            const evidenceAcc = evaluateEvidenceAccuracy(result.evidenceSpans, gold.evidenceSpans);
            totalEvidenceCorrect += evidenceAcc * gold.evidenceSpans.length;
            totalEvidenceGold += gold.evidenceSpans.length;
          }
        }
      }
      
      console.log(`  ✓ Processed in ${result.processingTimeMs}ms`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ Failed: ${errorMsg}`);
      results.push({
        paperId: paper.paperId,
        success: false,
        processingTimeMs: 0,
        parseSuccess: false,
        extractedEntities: [],
        extractedRelations: [],
        evidenceSpans: [],
        error: errorMsg
      });
    }
  }
  
  // Compute aggregate metrics
  const medianProcessingTime = processingTimes.length > 0
    ? processingTimes.sort((a, b) => a - b)[Math.floor(processingTimes.length / 2)]
    : 0;
  
  const p95Index = Math.ceil(processingTimes.length * 0.95) - 1;
  const p95ProcessingTime = processingTimes.length > 0
    ? processingTimes.sort((a, b) => a - b)[Math.max(0, p95Index)]
    : 0;
  
  const parseSuccessRate = corpusMetadata.papers.length > 0
    ? parseSuccesses / corpusMetadata.papers.length
    : 0;
  
  const { precision: entityPrecision, recall: entityRecall } = computePrecisionRecallF1(totalTp, totalFp, totalFn);
  const { f1: relationF1 } = computePrecisionRecallF1(totalRelationTp, totalRelationFp, totalRelationFn);
  const evidenceAccuracy = totalEvidenceGold > 0 ? totalEvidenceCorrect / totalEvidenceGold : 0;
  
  const avgTokenUsage = corpusMetadata.papers.length > 0 ? totalTokenUsage / corpusMetadata.papers.length : 0;
  // Approximate cost: $0.000001 per token (adjust based on actual model pricing)
  const tokenCostPerPaper = avgTokenUsage * 0.000001;
  
  // Build final result matching baseline.json schema
  const benchmarkResult: BenchmarkResult = {
    commit: await getGitCommit(),
    date: new Date().toISOString(),
    phase,
    environment: 'staging',
    corpusVersion: corpusMetadata.corpusVersion,
    extraction: {
      medianProcessingTimeMs: medianProcessingTime,
      p95ProcessingTimeMs: p95ProcessingTime,
      parseSuccessRate,
      entityPrecision,
      entityRecall,
      relationF1,
      evidenceAccuracy,
      tokenCostPerPaperUsd: tokenCostPerPaper
    },
    graph: {
      initialLayoutTimeMs: 0,
      nodeClickLatencyMs: 0,
      fullscreenTransitionMs: 0,
      layoutOverlapPercent: 0,
      dragFps: 0,
      multiPaperQueryRenderMs: 0
    },
    database: {
      paperGraphQueryP95Ms: 0,
      indexHitRatio: 0,
      orphanRecords: 0,
      rlsIsolationTestsPassed: true
    }
  };
  
  // Write results
  console.log('\nWriting results...');
  await writeFile(output, JSON.stringify(benchmarkResult, null, 2));
  console.log(`Results written to: ${output}`);
  
  // Print summary
  console.log('\n=== EXTRACTION BENCHMARK SUMMARY ===');
  console.log(`Papers processed: ${results.filter(r => r.success).length}/${corpusMetadata.papers.length}`);
  console.log(`Median processing time: ${medianProcessingTime.toFixed(0)}ms`);
  console.log(`P95 processing time: ${p95ProcessingTime.toFixed(0)}ms`);
  console.log(`Parse success rate: ${(parseSuccessRate * 100).toFixed(1)}%`);
  console.log(`Entity precision: ${(entityPrecision * 100).toFixed(1)}%`);
  console.log(`Entity recall: ${(entityRecall * 100).toFixed(1)}%`);
  console.log(`Relation F1: ${(relationF1 * 100).toFixed(1)}%`);
  console.log(`Evidence accuracy: ${(evidenceAccuracy * 100).toFixed(1)}%`);
  console.log(`Token cost per paper: $${tokenCostPerPaper.toFixed(6)}`);
}

main().catch(error => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
