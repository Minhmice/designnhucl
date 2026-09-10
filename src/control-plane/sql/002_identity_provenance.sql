DO $$ BEGIN CREATE TYPE source_kind AS ENUM ('registry','company','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS source_kind source_kind NOT NULL DEFAULT 'other';
