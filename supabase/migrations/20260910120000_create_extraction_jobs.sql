-- Phase 5: Job Queue Architecture with Supabase-Native Primitives
-- Migration: Create extraction_jobs table with advisory lock support

-- Job queue table
CREATE TABLE IF NOT EXISTS extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID NOT NULL REFERENCES extracted_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  current_chunk_sequence INT,
  total_chunks INT NOT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  error_message TEXT,
  last_error_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  token_usage_input BIGINT NOT NULL DEFAULT 0,
  token_usage_output BIGINT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT chk_positive_chunks CHECK (total_chunks > 0),
  CONSTRAINT chk_retry_bounds CHECK (retry_count <= max_retries)
);

-- Indexes for efficient polling and user queries
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_polling 
  ON extraction_jobs(status, next_retry_at) 
  WHERE status IN ('pending', 'failed') AND next_retry_at <= NOW();

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_user_status 
  ON extraction_jobs(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_paper 
  ON extraction_jobs(paper_id) INCLUDE (status, total_chunks, current_chunk_sequence);

-- RLS policies enforcing tenant isolation
ALTER TABLE extraction_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own jobs" ON extraction_jobs;
CREATE POLICY "Users view own jobs" ON extraction_jobs FOR SELECT 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages jobs" ON extraction_jobs;
CREATE POLICY "Service role manages jobs" ON extraction_jobs FOR ALL 
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- View for queue health monitoring
CREATE OR REPLACE VIEW vw_extraction_queue_health AS
SELECT 
  COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE status = 'processing') AS processing_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
  COUNT(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_count,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) FILTER (WHERE status = 'pending') AS avg_wait_time_seconds,
  CASE 
    WHEN COUNT(*) > 0 THEN COUNT(*) FILTER (WHERE status = 'failed')::FLOAT / COUNT(*) * 100
    ELSE 0 
  END AS failure_rate_percent
FROM extraction_jobs
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Function to try acquiring advisory lock on a job
CREATE OR REPLACE FUNCTION try_advisory_job_lock(job_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  lock_id BIGINT;
BEGIN
  -- Convert UUID to BIGINT for advisory lock (hash the UUID)
  lock_id := hashtext(job_id::text)::BIGINT;
  
  -- Try to acquire lock (non-blocking)
  RETURN pg_try_advisory_lock(lock_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to release advisory lock
CREATE OR REPLACE FUNCTION release_advisory_job_lock(job_id UUID)
RETURNS VOID AS $$
DECLARE
  lock_id BIGINT;
BEGIN
  lock_id := hashtext(job_id::text)::BIGINT;
  PERFORM pg_advisory_unlock(lock_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_extraction_job_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_extraction_job_updated_at ON extraction_jobs;
CREATE TRIGGER trg_extraction_job_updated_at
  BEFORE UPDATE ON extraction_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_extraction_job_updated_at();

-- Comment documenting the queue architecture
COMMENT ON TABLE extraction_jobs IS 
  'Phase 5 extraction job queue with advisory locking, retry logic, and cost tracking. Jobs transition through states: pending -> processing -> completed|failed. Failed jobs retry up to max_retries with exponential backoff before moving to dead_letter.';
