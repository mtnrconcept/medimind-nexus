-- Legacy Profile Support for RLS
-- Allows cde_user_edges.user_id to match EITHER auth.uid() OR a profile.id owned by auth.uid()

ALTER TABLE "public"."cde_user_edges" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own edges" ON "public"."cde_user_edges";

CREATE POLICY "Users can manage their own edges" ON "public"."cde_user_edges"
AS PERMISSIVE FOR ALL
TO authenticated
USING (
  user_id = auth.uid() 
  OR 
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
)
WITH CHECK (
  user_id = auth.uid() 
  OR 
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
