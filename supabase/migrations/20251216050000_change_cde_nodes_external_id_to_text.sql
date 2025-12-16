-- Change external_id from uuid to text to support NCBI IDs (which are integers/strings)
ALTER TABLE "public"."cde_nodes" ALTER COLUMN "external_id" TYPE text USING "external_id"::text;
