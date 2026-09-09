-- Migration: Create canonical entity registry and entity mentions tables
-- Phase 8: Multi-Paper Synthesis, Entity Normalization, and Cross-Document Graph Merging

CREATE TABLE IF NOT EXISTS canonical_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_form TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('concept','method','dataset','model','author','institution')),
  aliases TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.0 CHECK (confidence BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  curated_by UUID REFERENCES auth.users(id),
  curation_status TEXT NOT NULL DEFAULT 'auto' CHECK (curation_status IN ('auto','reviewed','rejected'))
);

CREATE TABLE IF NOT EXISTS entity_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_entity_id UUID NOT NULL REFERENCES canonical_entities(id) ON DELETE CASCADE,
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL,
  raw_mention TEXT NOT NULL,
  evidence_span JSONB NOT NULL,
  mention_confidence NUMERIC(3,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient lookup and merging
CREATE INDEX IF NOT EXISTS idx_canonical_entities_normalized ON canonical_entities(normalized_form text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_canonical_entities_type ON canonical_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_canonical ON entity_mentions(canonical_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_paper ON entity_mentions(paper_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_gin_aliases ON canonical_entities USING GIN(aliases);

-- Enable Row Level Security
ALTER TABLE canonical_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_mentions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated users to read canonical entities" 
  ON canonical_entities FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role manages canonical entities" 
  ON canonical_entities FOR ALL 
  USING (auth.role() = 'service_role') 
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Allow authenticated users to read entity mentions" 
  ON entity_mentions FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role manages entity mentions" 
  ON entity_mentions FOR ALL 
  USING (auth.role() = 'service_role') 
  WITH CHECK (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE canonical_entities IS 'Phase 8: Canonical entity registry for multi-paper synthesis with normalization';
COMMENT ON TABLE entity_mentions IS 'Phase 8: Entity mentions linking raw extractions to canonical entities';
COMMENT ON COLUMN canonical_entities.curation_status IS 'auto=algorithm assigned, reviewed=human verified, rejected=manually corrected';
