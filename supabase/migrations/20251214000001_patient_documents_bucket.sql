-- Create the patient-documents storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-documents',
  'patient-documents',
  false,
  10485760, -- 10 MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/csv', 
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain']
)
ON CONFLICT (id) DO UPDATE SET 
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS Policies for the storage bucket
-- Allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'patient-documents');

-- Allow authenticated users to read their files
CREATE POLICY "Allow authenticated reads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'patient-documents');

-- Allow authenticated users to update their files
CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'patient-documents');

-- Allow authenticated users to delete their files
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'patient-documents');
