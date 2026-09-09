// src/lib/pipeline/PipelineOrchestrator.ts
// Phase 5: Main pipeline orchestrator coordinating extraction, resilience, and cost tracking

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { 
  ExtractionJobStatus, 
  JobProgress, 
  enforceTransition, 
  calculatePercentComplete,
  estimateTimeRemaining,
  sanitizeErrorMessage
} from './states';
import { ResilienceManager, CircuitBreakerError, DLQEntry } from './ResilienceManager';
import type { ExtractionProvider } from '../extraction/providers/types';
import type { ChunkExtractionResult, ExtractedEntity, ExtractedRelation } from '../extraction/schemas';
import { EvidenceValidator, ValidationResult } from '../extraction/EvidenceValidator';
import type { Chunk } from '../chunking/types';

export interface PipelineConfig {
  supabaseUrl: string;
  supabaseKey: string;
  batchSize: number;
  maxConcurrentJobs: number;
  jobTimeoutMs: number;
  costBudgetPerJob: number;
  enableCostTracking: boolean;
}

export interface JobState {
  id: string;
  paperId: string;
  userId: string;
  status: ExtractionJobStatus;
  currentChunkSequence: number;
  totalChunks: number;
  retryCount: number;
  maxRetries: number;
  tokenUsageInput: number;
  tokenUsageOutput: number;
  estimatedCostUsd: number;
  chunkDurations: number[];
  lastError?: string;
}

export interface CostTracking {
  jobId: string;
  tokenUsageInput: number;
  tokenUsageOutput: number;
  estimatedCostUsd: number;
  budgetRemaining: number;
  isOverBudget: boolean;
}

export class PipelineOrchestrator {
  private supabase: SupabaseClient;
  private config: PipelineConfig;
  private resilienceManager: ResilienceManager;
  private evidenceValidator: EvidenceValidator;
  private providers: Map<string, ExtractionProvider>;
  private activeJobs: Map<string, JobState> = new Map();

  constructor(
    config: PipelineConfig,
    providers: Map<string, ExtractionProvider>
  ) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.config = config;
    this.providers = providers;
    this.resilienceManager = new ResilienceManager();
    this.evidenceValidator = new EvidenceValidator();
  }

  /**
   * Fetches eligible jobs from queue (pending or failed with retry time elapsed)
   */
  async fetchEligibleJobs(batchSize?: number): Promise<JobState[]> {
    const limit = batchSize ?? this.config.batchSize;
    
    const { data, error } = await this.supabase
      .from('extraction_jobs')
      .select('*')
      .in('status', ['pending', 'failed'])
      .or(`next_retry_at.is.null, next_retry_at.lte.${new Date().toISOString()}`)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[Pipeline] Failed to fetch eligible jobs:', error);
      return [];
    }

    return (data || []).map(row => this.rowToJobState(row));
  }

  /**
   * Acquires advisory lock on a job to prevent duplicate processing
   */
  async acquireLock(jobId: string): Promise<boolean> {
    // Use pg_try_advisory_lock via RPC
    const { data, error } = await this.supabase.rpc('try_advisory_job_lock', { 
      job_id: jobId 
    });

    if (error) {
      console.warn('[Pipeline] Lock acquisition failed:', error.message);
      return false;
    }

    return !!data;
  }

  /**
   * Releases advisory lock on job completion
   */
  async releaseLock(jobId: string): Promise<void> {
    await this.supabase.rpc('release_advisory_job_lock', { job_id: jobId });
  }

  /**
   * Processes a single extraction job end-to-end
   */
  async processJob(job: JobState): Promise<void> {
    const startTime = Date.now();
    console.log(`[Pipeline] Starting job ${job.id} for paper ${job.paperId}`);

    try {
      // Transition to processing
      await this.updateJobStatus(job.id, 'processing');
      
      // Fetch chunks for this paper
      const chunks = await this.fetchChunks(job.paperId);
      
      if (chunks.length === 0) {
        throw new Error('No chunks found for paper');
      }

      job.totalChunks = chunks.length;
      
      // Resume from last successful chunk if retrying
      const startSequence = job.currentChunkSequence || 0;
      
      for (let i = startSequence; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkStart = Date.now();

        try {
          // Check cost budget before processing
          if (this.config.enableCostTracking) {
            const costStatus = await this.getCostStatus(job.id);
            if (costStatus.isOverBudget) {
              throw new Error(`Job exceeded cost budget: $${costStatus.estimatedCostUsd.toFixed(2)} > $${this.config.costBudgetPerJob}`);
            }
          }

          // Select provider (check circuit breaker)
          const providerName = this.selectProvider();
          const provider = this.providers.get(providerName)!;

          // Extract entities and relations from chunk
          const extractionResult = await provider.extract(chunk, {
            apiKey: process.env.LLM_API_KEY || '',
            model: 'gpt-4o-mini',
            maxTokens: 2000,
            temperature: 0.1,
            timeoutMs: 30000
          });

          // Validate evidence grounding
          const validation = this.evidenceValidator.validate(extractionResult, chunk);
          
          if (!validation.isValid) {
            const criticalErrors = validation.errors.filter(e => e.severity === 'critical');
            if (criticalErrors.length > 0) {
              throw new Error(`Evidence validation failed: ${criticalErrors.map(e => e.type).join(', ')}`);
            }
            // Log warnings but continue
            console.warn(`[Pipeline] Validation warnings for chunk ${chunk.id}:`, validation.errors);
          }

          // Store extraction results
          await this.storeExtractionResults(extractionResult);

          // Update job progress
          job.currentChunkSequence = i + 1;
          const duration = Date.now() - chunkStart;
          job.chunkDurations.push(duration);
          
          // Aggregate token usage
          job.tokenUsageInput += extractionResult.extractionMetadata.tokenUsage.input;
          job.tokenUsageOutput += extractionResult.extractionMetadata.tokenUsage.output;
          
          // Update progress in DB
          await this.updateJobProgress(job);

          // Record success for circuit breaker
          this.resilienceManager.handleSuccess(providerName);

        } catch (error) {
          const providerName = 'openai'; // Last attempted provider
          const resilienceResult = this.resilienceManager.handleFailure({
            jobId: job.id,
            retryCount: job.retryCount,
            error: error as Error,
            provider: providerName
          });

          if (resilienceResult.action === 'retry' && resilienceResult.nextRetryAt) {
            // Schedule retry
            await this.scheduleRetry(job.id, resilienceResult.nextRetryAt, error as Error);
            return; // Exit without marking as dead letter
          } else {
            // Send to dead letter queue
            await this.moveToDeadLetter(job, error as Error);
            return;
          }
        }
      }

      // All chunks processed successfully
      await this.completeJob(job);
      console.log(`[Pipeline] Job ${job.id} completed in ${Date.now() - startTime}ms`);

    } catch (error) {
      console.error(`[Pipeline] Fatal error in job ${job.id}:`, error);
      await this.moveToDeadLetter(job, error as Error);
    } finally {
      await this.releaseLock(job.id);
    }
  }

  /**
   * Completes a job successfully
   */
  private async completeJob(job: JobState): Promise<void> {
    const { error } = await this.supabase
      .from('extraction_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_chunk_sequence: job.totalChunks,
        token_usage_input: job.tokenUsageInput,
        token_usage_output: job.tokenUsageOutput,
        estimated_cost_usd: job.estimatedCostUsd
      })
      .eq('id', job.id);

    if (error) {
      console.error('[Pipeline] Failed to complete job:', error);
      throw error;
    }

    // Trigger graph build webhook or event
    await this.triggerGraphBuild(job.paperId);
  }

  /**
   * Moves job to dead letter queue
   */
  private async moveToDeadLetter(job: JobState, error: Error): Promise<void> {
    const dlqEntry: Partial<DLQEntry> = {
      jobId: job.id,
      paperId: job.paperId,
      userId: job.userId,
      status: 'dead_letter',
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      errorMessage: sanitizeErrorMessage(error.message),
      lastSuccessfulChunk: job.currentChunkSequence,
      totalChunks: job.totalChunks,
      tokenUsageInput: job.tokenUsageInput,
      tokenUsageOutput: job.tokenUsageOutput,
      estimatedCostUsd: job.estimatedCostUsd,
      deadLetteredAt: new Date().toISOString()
    };

    const { error: updateError } = await this.supabase
      .from('extraction_jobs')
      .update({
        status: 'dead_letter',
        error_message: dlqEntry.errorMessage,
        last_error_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id);

    if (updateError) {
      console.error('[Pipeline] Failed to move job to DLQ:', updateError);
    }

    // Send alert to ops channel
    await this.sendDLQAlert(dlqEntry);
  }

  /**
   * Schedules a retry for a failed job
   */
  private async scheduleRetry(
    jobId: string, 
    nextRetryAt: Date, 
    error: Error
  ): Promise<void> {
    const { error: updateError } = await this.supabase
      .from('extraction_jobs')
      .update({
        status: 'failed',
        retry_count: this.supabase.rpc('increment_retry_count'),
        next_retry_at: nextRetryAt.toISOString(),
        error_message: sanitizeErrorMessage(error.message),
        last_error_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[Pipeline] Failed to schedule retry:', updateError);
    }
  }

  /**
   * Updates job progress during processing
   */
  private async updateJobProgress(job: JobState): Promise<void> {
    const percentComplete = calculatePercentComplete(
      job.currentChunkSequence, 
      job.totalChunks
    );

    const { error } = await this.supabase
      .from('extraction_jobs')
      .update({
        status: 'processing',
        current_chunk_sequence: job.currentChunkSequence,
        token_usage_input: job.tokenUsageInput,
        token_usage_output: job.tokenUsageOutput,
        estimated_cost_usd: job.estimatedCostUsd,
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id);

    if (error) {
      console.error('[Pipeline] Failed to update progress:', error);
    }
  }

  /**
   * Updates job status with state machine enforcement
   */
  private async updateJobStatus(
    jobId: string, 
    newStatus: ExtractionJobStatus
  ): Promise<void> {
    // Fetch current status
    const { data: current } = await this.supabase
      .from('extraction_jobs')
      .select('status')
      .eq('id', jobId)
      .single();

    if (!current) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Enforce valid transition
    enforceTransition(current.status as ExtractionJobStatus, newStatus);

    const { error } = await this.supabase
      .from('extraction_jobs')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) {
      console.error('[Pipeline] Failed to update status:', error);
      throw error;
    }
  }

  /**
   * Gets current cost status for a job
   */
  async getCostStatus(jobId: string): Promise<CostTracking> {
    const { data, error } = await this.supabase
      .from('extraction_jobs')
      .select('token_usage_input, token_usage_output, estimated_cost_usd')
      .eq('id', jobId)
      .single();

    if (error) {
      throw error;
    }

    const estimatedCost = data.estimated_cost_usd || 0;
    const budgetRemaining = Math.max(0, this.config.costBudgetPerJob - estimatedCost);

    return {
      jobId,
      tokenUsageInput: data.token_usage_input || 0,
      tokenUsageOutput: data.token_usage_output || 0,
      estimatedCostUsd: estimatedCost,
      budgetRemaining,
      isOverBudget: estimatedCost > this.config.costBudgetPerJob
    };
  }

  /**
   * Selects best available provider based on circuit breaker state
   */
  private selectProvider(): string {
    const primaryProvider = 'openai';
    
    if (this.resilienceManager.shouldUseFallback(primaryProvider)) {
      console.log('[Pipeline] Using fallback provider due to circuit breaker');
      return 'fallback';
    }

    return primaryProvider;
  }

  /**
   * Fetches chunks for a paper from database
   */
  private async fetchChunks(paperId: string): Promise<Chunk[]> {
    const { data, error } = await this.supabase
      .from('paper_chunks')
      .select('*')
      .eq('paper_id', paperId)
      .order('sequence', { ascending: true });

    if (error) {
      throw error;
    }

    return (data || []) as Chunk[];
  }

  /**
   * Stores extraction results in database
   */
  private async storeExtractionResults(result: ChunkExtractionResult): Promise<void> {
    // Insert entities
    for (const entity of result.entities) {
      const { error } = await this.supabase
        .from('extracted_entities')
        .insert({
          id: entity.id,
          chunk_id: result.chunkId,
          paper_id: result.paperId,
          type: entity.type,
          normalized_form: entity.normalizedForm,
          raw_mentions: entity.rawMentions,
          evidence_spans: entity.evidenceSpans,
          section_context: entity.sectionContext,
          confidence: entity.confidence
        })
        .onConflict('id')
        .ignore();

      if (error) {
        console.error('[Pipeline] Failed to insert entity:', error);
      }
    }

    // Insert relations
    for (const relation of result.relations) {
      const { error } = await this.supabase
        .from('extracted_relations')
        .insert({
          id: relation.id,
          source_entity_id: relation.sourceEntityId,
          target_entity_id: relation.targetEntityId,
          type: relation.type,
          evidence_spans: relation.evidenceSpans,
          is_explicitly_stated: relation.isExplicitlyStated,
          confidence: relation.confidence
        })
        .onConflict('id')
        .ignore();

      if (error) {
        console.error('[Pipeline] Failed to insert relation:', error);
      }
    }
  }

  /**
   * Triggers graph build after job completion
   */
  private async triggerGraphBuild(paperId: string): Promise<void> {
    // Send webhook or publish event for Phase 6 graph builder
    console.log(`[Pipeline] Triggering graph build for paper ${paperId}`);
    
    // Implementation depends on Phase 6 integration method
    // Options: webhook, Supabase Realtime event, or direct function call
  }

  /**
   * Sends alert when job enters DLQ
   */
  private async sendDLQAlert(entry: Partial<DLQEntry>): Promise<void> {
    console.warn('[Pipeline] DLQ ALERT:', JSON.stringify(entry, null, 2));
    
    // In production: send webhook to ops Slack/email
    // const { error } = await this.supabase.functions.invoke('send-ops-alert', {
    //   body: { type: 'dlq_entry', entry }
    // });
  }

  /**
   * Converts database row to JobState
   */
  private rowToJobState(row: any): JobState {
    return {
      id: row.id,
      paperId: row.paper_id,
      userId: row.user_id,
      status: row.status as ExtractionJobStatus,
      currentChunkSequence: row.current_chunk_sequence || 0,
      totalChunks: row.total_chunks,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      tokenUsageInput: row.token_usage_input,
      tokenUsageOutput: row.token_usage_output,
      estimatedCostUsd: row.estimated_cost_usd,
      chunkDurations: [],
      lastError: row.error_message
    };
  }
}
