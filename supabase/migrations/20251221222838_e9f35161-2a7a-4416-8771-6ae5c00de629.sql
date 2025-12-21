-- Add policy for klinika_admins to upload to client-files bucket
-- They can only upload to paths matching their company/telephely structure
CREATE POLICY "Klinika admins can upload to client-files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-files' 
  AND has_role(auth.uid(), 'klinika_admin')
);

-- Add policy for klinika_admins to view their files in client-files
CREATE POLICY "Klinika admins can view client-files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-files' 
  AND has_role(auth.uid(), 'klinika_admin')
);

-- Add policy for klinika_admins to delete their files in client-files
CREATE POLICY "Klinika admins can delete from client-files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-files' 
  AND has_role(auth.uid(), 'klinika_admin')
);