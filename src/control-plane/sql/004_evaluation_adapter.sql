-- Evaluation adapter provenance. This migration is additive so applied 001-003
-- remain immutable and existing rows can be reconciled before becoming complete.
ALTER TABLE evaluation_requests ADD COLUMN IF NOT EXISTS subject_organization_id uuid;
ALTER TABLE evaluation_requests ADD COLUMN IF NOT EXISTS recipe text;
ALTER TABLE evaluation_requests ADD COLUMN IF NOT EXISTS artifact_uri text;
ALTER TABLE evaluation_requests ADD COLUMN IF NOT EXISTS subject_context_sha256 text;
ALTER TABLE evaluation_requests ADD COLUMN IF NOT EXISTS trace_id text;
ALTER TABLE evaluation_requests ADD COLUMN IF NOT EXISTS correlation_id uuid;
ALTER TABLE evaluation_references ADD COLUMN IF NOT EXISTS trace_id text;
ALTER TABLE evaluation_references ADD COLUMN IF NOT EXISTS correlation_id uuid;

ALTER TABLE evaluation_requests DROP CONSTRAINT IF EXISTS evaluation_requests_subject_fk;
ALTER TABLE evaluation_requests ADD CONSTRAINT evaluation_requests_subject_fk
  FOREIGN KEY (subject_organization_id) REFERENCES organizations(id) NOT VALID;
ALTER TABLE evaluation_requests DROP CONSTRAINT IF EXISTS evaluation_requests_recipe_check;
ALTER TABLE evaluation_requests ADD CONSTRAINT evaluation_requests_recipe_check
  CHECK (recipe IS NULL OR recipe IN ('lead-fast', 'critic-standard')) NOT VALID;
ALTER TABLE evaluation_requests DROP CONSTRAINT IF EXISTS evaluation_requests_context_hash_check;
ALTER TABLE evaluation_requests ADD CONSTRAINT evaluation_requests_context_hash_check
  CHECK (subject_context_sha256 IS NULL OR subject_context_sha256 ~ '^[0-9a-fA-F]{64}$') NOT VALID;
ALTER TABLE evaluation_references DROP CONSTRAINT IF EXISTS evaluation_references_subject_hash_check;
ALTER TABLE evaluation_references ADD CONSTRAINT evaluation_references_subject_hash_check
  CHECK (subject_context_sha256 ~ '^[0-9a-fA-F]{64}$') NOT VALID;
ALTER TABLE evaluation_references DROP CONSTRAINT IF EXISTS evaluation_references_result_hash_check;
ALTER TABLE evaluation_references ADD CONSTRAINT evaluation_references_result_hash_check
  CHECK (result_sha256 ~ '^[0-9a-fA-F]{64}$') NOT VALID;

CREATE INDEX IF NOT EXISTS evaluation_requests_owner_subject_idx
  ON evaluation_requests(owner_organization_id, subject_organization_id);
