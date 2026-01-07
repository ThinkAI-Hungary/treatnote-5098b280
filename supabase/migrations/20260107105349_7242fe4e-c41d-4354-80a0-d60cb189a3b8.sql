-- Assign company and telephely to the klinika_admin user who is missing it
UPDATE profiles 
SET 
  company_id = 'f858e5d5-a4d2-48b7-b2a7-ab8c01f7700d',
  telephely_id = 'bb52a833-00db-4b68-8a37-1c4b0cc4b59d'
WHERE user_id = '2a739ead-25fe-41b8-a866-813d910af76b'
  AND company_id IS NULL;