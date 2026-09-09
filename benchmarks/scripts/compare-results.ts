#!/usr/bin/env tsx

/**
 * Benchmark Comparison Script
 * 
 * Compares before/after benchmark results and reports pass/fail status
 * against defined targets.
 * 
 * Usage: tsx compare-results.ts --before <path> --after <path> --output <path>
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

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

interface MetricTarget {
  min?: number;
  max?: number;
  regressionTolerance?: number;
}

interface TargetsConfig {
  [metricPath: string]: MetricTarget;
}

interface ComparisonResult {
  metric: string;
  beforeValue: number | boolean;
  afterValue: number | boolean;
  delta: number;
  percentChange: number;
  pass: boolean;
  reason?: string;
}

interface ComparisonReport {
  beforeCommit: string;
  afterCommit: string;
  beforePhase: string;
  afterPhase: string;
  beforeDate: string;
  afterDate: string;
  totalMetrics: number;
  passedMetrics: number;
  failedMetrics: number;
  results: ComparisonResult[];
  summary: {
    allPass: boolean;
    exitCode: number;
  };
}

function parseArgs(args: string[]): { before: string; after: string; output?: string } {
  const result = { before: '', after: '', output: undefined as string | undefined };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--before' && args[i + 1]) {
      result.before = args[i + 1];
      i++;
    } else if (args[i] === '--after' && args[i + 1]) {
      result.after = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      result.output = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Benchmark Comparison Tool

Usage: tsx compare-results.ts --before <path> --after <path> [--output <path>]

Options:
  --before  Path to baseline/before results JSON
  --after   Path to phase/after results JSON
  --output  Optional: Output path for structured comparison report
  --help    Show this help message

Example:
  tsx compare-results.ts --before benchmarks/results/baseline.json --after benchmarks/results/phase-3.json
`);
      process.exit(0);
    }
  }
  
  return result;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function loadTargets(): TargetsConfig {
  const targetsPath = './benchmarks/benchmark-targets.json';
  
  if (!existsSync(targetsPath)) {
    console.warn('benchmark-targets.json not found. Using default targets.');
    return getDefaultTargets();
  }
  
  try {
    const content = require('fs').readFileSync(targetsPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('Failed to load targets config. Using defaults.');
    return getDefaultTargets();
  }
}

function getDefaultTargets(): TargetsConfig {
  return {
    'extraction.entityPrecision': { min: 0.85, regressionTolerance: 0.05 },
    'extraction.entityRecall': { min: 0.80, regressionTolerance: 0.05 },
    'extraction.relationF1': { min: 0.75, regressionTolerance: 0.05 },
    'extraction.parseSuccessRate': { min: 0.95, regressionTolerance: 0.05 },
    'extraction.evidenceAccuracy': { min: 0.80, regressionTolerance: 0.05 },
    'graph.dragFps': { min: 55, regressionTolerance: 5 },
    'database.indexHitRatio': { min: 0.95, regressionTolerance: 0.05 },
    'database.orphanRecords': { max: 0, regressionTolerance: 0 },
    'database.rlsIsolationTestsPassed': { min: 1, regressionTolerance: 0 }
  };
}

function compareMetric(
  metricPath: string,
  beforeValue: number | boolean,
  afterValue: number | boolean,
  target?: MetricTarget
): ComparisonResult {
  const beforeNum = typeof beforeValue === 'boolean' ? (beforeValue ? 1 : 0) : beforeValue;
  const afterNum = typeof afterValue === 'boolean' ? (afterValue ? 1 : 0) : afterValue;
  
  const delta = afterNum - beforeNum;
  const percentChange = beforeNum !== 0 ? ((delta / Math.abs(beforeNum)) * 100) : 0;
  
  let pass = true;
  let reason = 'No target defined';
  
  if (target) {
    // Check absolute target
    if (target.min !== undefined && afterNum < target.min) {
      pass = false;
      reason = `Below minimum target (${target.min})`;
    }
    if (target.max !== undefined && afterNum > target.max) {
      pass = false;
      reason = `Above maximum target (${target.max})`;
    }
    
    // Check regression tolerance (only if we have a baseline value)
    if (pass && target.regressionTolerance !== undefined && beforeNum !== 0) {
      // For metrics where higher is better
      if (metricPath.includes('Precision') || metricPath.includes('Recall') || 
          metricPath.includes('F1') || metricPath.includes('Rate') || 
          metricPath.includes('Ratio') || metricPath.includes('Fps')) {
        if (delta < -target.regressionTolerance) {
          pass = false;
          reason = `Regression exceeds tolerance (-${target.regressionTolerance})`;
        }
      }
      // For metrics where lower is better
      else if (metricPath.includes('Time') || metricPath.includes('Cost') || 
               metricPath.includes('Percent') || metricPath.includes('Records')) {
        if (delta > target.regressionTolerance) {
          pass = false;
          reason = `Regression exceeds tolerance (+${target.regressionTolerance})`;
        }
      }
    }
  }
  
  return {
    metric: metricPath,
    beforeValue,
    afterValue,
    delta,
    percentChange,
    pass,
    reason
  };
}

function formatValue(value: number | boolean): string {
  if (typeof value === 'boolean') return value ? 'PASS' : 'FAIL';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (value < 1 && value > 0) return value.toFixed(3);
  return value.toFixed(1);
}

function printTable(results: ComparisonResult[]): void {
  console.log('\n' + '='.repeat(100));
  console.log('BENCHMARK COMPARISON RESULTS');
  console.log('='.repeat(100));
  
  // Header
  console.log(
    '\n' +
    'METRIC'.padEnd(40) +
    'BEFORE'.padStart(12) +
    'AFTER'.padStart(12) +
    'DELTA'.padStart(12) +
    'CHANGE'.padStart(10) +
    'STATUS'.padStart(10)
  );
  console.log('-'.repeat(100));
  
  // Rows
  for (const result of results) {
    const status = result.pass ? '✓ PASS' : '✗ FAIL';
    const statusColor = result.pass ? '' : '';
    
    console.log(
      result.metric.padEnd(40) +
      formatValue(result.beforeValue).padStart(12) +
      formatValue(result.afterValue).padStart(12) +
      (result.delta >= 0 ? '+' : '') + result.delta.toFixed(2).padStart(12) +
      (result.percentChange >= 0 ? '+' : '') + result.percentChange.toFixed(1) + '%'.padStart(9) +
      statusColor + status.padStart(10)
    );
    
    if (!result.pass && result.reason) {
      console.log('  └─ ' + result.reason);
    }
  }
  
  console.log('='.repeat(100));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { before, after, output } = args;
  
  if (!before || !after) {
    console.error('Error: --before and --after arguments are required');
    console.error('Usage: tsx compare-results.ts --before <path> --after <path>');
    process.exit(1);
  }
  
  console.log(`Comparing benchmarks:`);
  console.log(`  Before: ${before}`);
  console.log(`  After:  ${after}`);
  
  // Load benchmark results
  let beforeResult: BenchmarkResult;
  let afterResult: BenchmarkResult;
  
  try {
    const beforeContent = await readFile(before, 'utf-8');
    beforeResult = JSON.parse(beforeContent);
  } catch (error) {
    console.error(`Failed to load before file: ${error}`);
    process.exit(1);
  }
  
  try {
    const afterContent = await readFile(after, 'utf-8');
    afterResult = JSON.parse(afterContent);
  } catch (error) {
    console.error(`Failed to load after file: ${error}`);
    process.exit(1);
  }
  
  // Load targets
  const targets = loadTargets();
  
  // Compare all metrics
  const results: ComparisonResult[] = [];
  const metricPaths = [
    'extraction.medianProcessingTimeMs',
    'extraction.p95ProcessingTimeMs',
    'extraction.parseSuccessRate',
    'extraction.entityPrecision',
    'extraction.entityRecall',
    'extraction.relationF1',
    'extraction.evidenceAccuracy',
    'extraction.tokenCostPerPaperUsd',
    'graph.initialLayoutTimeMs',
    'graph.nodeClickLatencyMs',
    'graph.fullscreenTransitionMs',
    'graph.layoutOverlapPercent',
    'graph.dragFps',
    'graph.multiPaperQueryRenderMs',
    'database.paperGraphQueryP95Ms',
    'database.indexHitRatio',
    'database.orphanRecords',
    'database.rlsIsolationTestsPassed'
  ];
  
  for (const path of metricPaths) {
    const beforeValue = getNestedValue(beforeResult, path);
    const afterValue = getNestedValue(afterResult, path);
    
    if (beforeValue === undefined || afterValue === undefined) {
      console.warn(`Skipping metric ${path}: missing value (before=${beforeValue}, after=${afterValue})`);
      continue;
    }
    
    const target = targets[path];
    const result = compareMetric(path, beforeValue, afterValue, target);
    results.push(result);
  }
  
  // Generate report
  const passedCount = results.filter(r => r.pass).length;
  const failedCount = results.filter(r => !r.pass).length;
  const allPass = failedCount === 0;
  
  const report: ComparisonReport = {
    beforeCommit: beforeResult.commit,
    afterCommit: afterResult.commit,
    beforePhase: beforeResult.phase,
    afterPhase: afterResult.phase,
    beforeDate: beforeResult.date,
    afterDate: afterResult.date,
    totalMetrics: results.length,
    passedMetrics: passedCount,
    failedMetrics: failedCount,
    results,
    summary: {
      allPass,
      exitCode: allPass ? 0 : 1
    }
  };
  
  // Print table
  printTable(results);
  
  // Print summary
  console.log(`\nSUMMARY:`);
  console.log(`  Total metrics: ${results.length}`);
  console.log(`  Passed: ${passedCount}`);
  console.log(`  Failed: ${failedCount}`);
  console.log(`  Overall: ${allPass ? '✓ ALL PASS' : '✗ REGRESSIONS DETECTED'}`);
  
  // Write structured report if output specified
  if (output) {
    await writeFile(output, JSON.stringify(report, null, 2));
    console.log(`\nStructured report written to: ${output}`);
  }
  
  // Exit with appropriate code
  process.exit(allPass ? 0 : 1);
}

main().catch(error => {
  console.error('Comparison failed:', error);
  process.exit(1);
});
