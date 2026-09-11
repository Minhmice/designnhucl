-- Complete evaluation reference provenance. Applied migrations 001-004 stay immutable.
ALTER TABLE evaluation_references ADD COLUMN IF NOT EXISTS subject_organization_id uuid;
ALTER TABLE evaluation_references DROP CONSTRAINT IF EXISTS evaluation_references_subject_fk;
ALTER TABLE evaluation_references ADD CONSTRAINT evaluation_references_subject_fk
  FOREIGN KEY (subject_organization_id) REFERENCES organizations(id) NOT VALID;
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_owner_id_unique;
ALTER TABLE organizations ADD CONSTRAINT organizations_owner_id_unique UNIQUE (owner_organization_id, id);
ALTER TABLE evaluation_requests DROP CONSTRAINT IF EXISTS evaluation_requests_subject_tenant_fk;
ALTER TABLE evaluation_requests ADD CONSTRAINT evaluation_requests_subject_tenant_fk
  FOREIGN KEY (owner_organization_id, subject_organization_id) REFERENCES organizations(owner_organization_id, id) NOT VALID;
ALTER TABLE evaluation_references DROP CONSTRAINT IF EXISTS evaluation_references_subject_tenant_fk;
ALTER TABLE evaluation_references ADD CONSTRAINT evaluation_references_subject_tenant_fk
  FOREIGN KEY (owner_organization_id, subject_organization_id) REFERENCES organizations(owner_organization_id, id) NOT VALID;
ALTER TABLE evaluation_references DROP CONSTRAINT IF EXISTS evaluation_references_subject_owner_check;
ALTER TABLE evaluation_references ADD CONSTRAINT evaluation_references_subject_owner_check
  CHECK (subject_organization_id IS NULL OR subject_organization_id <> owner_organization_id) NOT VALID;
ALTER TABLE evaluation_requests DROP CONSTRAINT IF EXISTS evaluation_requests_subject_owner_check;
ALTER TABLE evaluation_requests ADD CONSTRAINT evaluation_requests_subject_owner_check
  CHECK (subject_organization_id IS NULL OR subject_organization_id <> owner_organization_id) NOT VALID;
ALTER TABLE evaluation_requests ADD COLUMN IF NOT EXISTS reconciliation_required boolean NOT NULL DEFAULT false;
ALTER TABLE evaluation_requests ADD COLUMN IF NOT EXISTS reconciliation_reason text;
CREATE INDEX IF NOT EXISTS evaluation_references_owner_subject_idx
  ON evaluation_references(owner_organization_id, subject_organization_id);
