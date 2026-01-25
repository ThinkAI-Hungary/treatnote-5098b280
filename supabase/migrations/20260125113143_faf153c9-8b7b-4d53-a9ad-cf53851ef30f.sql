-- Drop and recreate view with SECURITY INVOKER
DROP VIEW IF EXISTS public.treatment_embeddings_stats;

CREATE VIEW public.treatment_embeddings_stats 
WITH (security_invoker = true)
AS
SELECT 
  tr.clinic_id,
  COUNT(DISTINCT te.treatment_rule_id) as rules_with_embeddings,
  COUNT(te.id) as total_embeddings,
  COUNT(CASE WHEN te.source_type = 'name' THEN 1 END) as name_embeddings,
  COUNT(CASE WHEN te.source_type = 'trigger_word' THEN 1 END) as trigger_embeddings,
  COUNT(CASE WHEN te.source_type = 'item_name' THEN 1 END) as item_embeddings,
  MAX(te.updated_at) as last_updated
FROM treatment_rules tr
LEFT JOIN treatment_embeddings te ON te.treatment_rule_id = tr.id
GROUP BY tr.clinic_id;