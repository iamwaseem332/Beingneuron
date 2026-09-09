// Supabase Edge Function: process-extraction-queue
// Phase 5: Queue consumer invoked every 30 seconds via pg_cron

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PipelineOrchestrator } from "file:///src/lib/pipeline/PipelineOrchestrator.ts";
import { OpenAIProvider, FallbackRegexProvider } from "file:///src/lib/extraction/providers/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Initialize providers
    const providers = new Map();
    providers.set('openai', new OpenAIProvider());
    providers.set('fallback', new FallbackRegexProvider());

    // Create orchestrator with config from environment
    const orchestrator = new PipelineOrchestrator({
      supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
      supabaseKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      batchSize: parseInt(Deno.env.get('BATCH_SIZE') ?? '5'),
      maxConcurrentJobs: parseInt(Deno.env.get('MAX_CONCURRENT_JOBS') ?? '10'),
      jobTimeoutMs: parseInt(Deno.env.get('JOB_TIMEOUT_MS') ?? '120000'),
      costBudgetPerJob: parseFloat(Deno.env.get('COST_BUDGET_PER_JOB') ?? '2.00'),
      enableCostTracking: Deno.env.get('ENABLE_COST_TRACKING') !== 'false'
    }, providers);

    // Fetch eligible jobs with advisory locking
    const jobs = await orchestrator.fetchEligibleJobs();
    
    const results = [];
    for (const job of jobs) {
      // Try to acquire lock
      const locked = await orchestrator.acquireLock(job.id);
      
      if (!locked) {
        console.log(`[Queue] Job ${job.id} already being processed, skipping`);
        continue;
      }

      try {
        // Process job
        await orchestrator.processJob(job);
        results.push({ jobId: job.id, status: 'processed' });
      } catch (error) {
        console.error(`[Queue] Error processing job ${job.id}:`, error);
        results.push({ jobId: job.id, status: 'error', error: error.message });
      } finally {
        // Always release lock
        await orchestrator.releaseLock(job.id);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[Queue] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
