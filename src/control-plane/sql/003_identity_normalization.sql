-- Keep canonical legal-name and jurisdiction keys separate from display values.
-- The application applies the same NFKC + trim/collapse + lowercase rule on writes.
ALTER TABLE legal_entities ADD COLUMN IF NOT EXISTS normalized_legal_name text;
ALTER TABLE legal_entities ADD COLUMN IF NOT EXISTS normalized_jurisdiction text;
UPDATE legal_entities
SET normalized_legal_name = regexp_replace(lower(trim(legal_name)), E'\\s+', ' ', 'g'),
    normalized_jurisdiction = CASE WHEN jurisdiction IS NULL THEN NULL ELSE regexp_replace(lower(trim(jurisdiction)), E'\\s+', ' ', 'g') END
WHERE normalized_legal_name IS NULL
   OR (jurisdiction IS NOT NULL AND normalized_jurisdiction IS NULL);
CREATE INDEX IF NOT EXISTS legal_entities_normalized_name_idx ON legal_entities (owner_organization_id, normalized_legal_name, normalized_jurisdiction);
