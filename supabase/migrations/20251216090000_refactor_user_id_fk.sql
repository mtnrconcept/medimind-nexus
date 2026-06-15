-- Migration: Refactor cde_user_edges FK to reference auth.users
-- Description: Standardize user_id to be auth.uid() instead of potentially legacy profile.id

-- 1. Relax constraint to allow updates
ALTER TABLE "public"."cde_user_edges" DROP CONSTRAINT IF EXISTS "cde_user_edges_user_id_fkey";

-- 2. Update existing rows: Convert profile_id to auth_user_id
-- We look up the corresponding auth.id (stored in profiles.user_id) for the current profile.id
UPDATE "public"."cde_user_edges" e
SET user_id = p.user_id
FROM "public"."profiles" p
WHERE e.user_id = p.id;

-- 3. Add new constraint referencing auth.users
ALTER TABLE "public"."cde_user_edges"
ADD CONSTRAINT "cde_user_edges_user_id_fkey"
FOREIGN KEY (user_id)
REFERENCES auth.users(id)
ON DELETE CASCADE;

-- 4. Simplify RLS to standard strict check
ALTER TABLE "public"."cde_user_edges" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own edges" ON "public"."cde_user_edges";

CREATE POLICY "Users can manage their own edges" ON "public"."cde_user_edges"
AS PERMISSIVE FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
