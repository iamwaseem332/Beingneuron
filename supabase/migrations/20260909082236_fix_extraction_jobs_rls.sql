-- Phase 5/10: Fix extraction_jobs RLS policy, foreign key references, and advisory lock typo
-- Fixes:
--   C1: RLS policy "Service role manages jobs" was USING (true) allowing any user access
--   C2: Foreign key references non-existent 'papers' table - should be 'extracted_documents'
--   C3: Typo pg_try_advisive_lock should be pg_try_advisory_lock

-- Fix C1: Drop and recreate service role policy with proper role check
DROP POLICY IF EXISTS "Service role manages jobs" ON extraction_jobs;
CREATE POLICY "Service role manages jobs" ON extraction_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Fix C2: Update foreign key constraint to reference correct table
-- First drop the old constraint
ALTER TABLE extraction_jobs
  DROP CONSTRAINT IF EXISTS extraction_jobs_paper_id_fkey;

-- Add corrected constraint referencing extracted_documents (the actual paper storage table from 0003_extraction.sql)
ALTER TABLE extraction_jobs
  ADD CONSTRAINT extraction_jobs_paper_id_fkey
  FOREIGN KEY (paper_id)
  REFERENCES extracted_documents(id)
  ON DELETE CASCADE;

-- Also fix entity_mentions table
ALTER TABLE entity_mentions
  DROP CONSTRAINT IF EXISTS entity_mentions_paper_id_fkey;

ALTER TABLE entity_mentions
  ADD CONSTRAINT entity_mentions_paper_id_fkey
  FOREIGN KEY (paper_id)
  REFERENCES extracted_documents(id)
  ON DELETE CASCADE;

-- Fix C3: Correct the typo in the advisory lock function
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

-- Verify fixes applied
DO $$
BEGIN
  RAISE NOTICE 'Fixes applied successfully:';
  RAISE NOTICE '  C1: RLS policy now restricted to service_role';
  RAISE NOTICE '  C2: FK constraints now reference extracted_documents';
  RAISE NOTICE '  C3: Advisory lock function corrected to pg_try_advisory_lock';
END $$;
