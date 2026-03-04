-- Fix missing telephely_id on recently purchased licenses that were orphaned by the webhook bug
UPDATE public.licenses l
SET telephely_id = (
  SELECT t.id FROM public.telephely t
  WHERE t.company_id = l.company_id
  LIMIT 1
)
WHERE l.telephely_id IS NULL;
