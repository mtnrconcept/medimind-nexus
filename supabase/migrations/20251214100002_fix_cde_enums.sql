-- Fix CDE tables: Change ENUM columns to TEXT
-- This migration fixes the type mismatch error

-- Drop the enum types if they exist and alter columns to TEXT
DO $$
BEGIN
  -- Alter cde_nodes.node_type to TEXT
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cde_nodes' AND column_name = 'node_type' AND data_type != 'text') THEN
    ALTER TABLE cde_nodes ALTER COLUMN node_type TYPE TEXT USING node_type::TEXT;
  END IF;

  -- Alter cde_edges.relationship_type to TEXT
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cde_edges' AND column_name = 'relationship_type' AND data_type != 'text') THEN
    ALTER TABLE cde_edges ALTER COLUMN relationship_type TYPE TEXT USING relationship_type::TEXT;
  END IF;

  -- Alter cde_edges.evidence_level to TEXT if it's an enum
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cde_edges' AND column_name = 'evidence_level' AND data_type != 'text') THEN
    ALTER TABLE cde_edges ALTER COLUMN evidence_level TYPE TEXT USING evidence_level::TEXT;
  END IF;

  -- Alter discovery_cards.evidence_level to TEXT if it's an enum
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'discovery_cards' AND column_name = 'evidence_level' AND data_type != 'text') THEN
    ALTER TABLE discovery_cards ALTER COLUMN evidence_level TYPE TEXT USING evidence_level::TEXT;
  END IF;

  -- Alter discovery_cards.status to TEXT if it's an enum
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'discovery_cards' AND column_name = 'status' AND data_type != 'text') THEN
    ALTER TABLE discovery_cards ALTER COLUMN status TYPE TEXT USING status::TEXT;
  END IF;
END $$;

-- Drop the old enum types (they're no longer needed)
DROP TYPE IF EXISTS cde_node_type CASCADE;
DROP TYPE IF EXISTS cde_relationship_type CASCADE;
DROP TYPE IF EXISTS cde_evidence_level CASCADE;
DROP TYPE IF EXISTS cde_discovery_status CASCADE;
