-- Drop legacy vector-based overloads to resolve PGRST203 ambiguity
-- Keep only the text-based version with rule_name alias

DROP FUNCTION IF EXISTS public.match_szotar_embedding(extensions.vector, double precision, integer, uuid);
DROP FUNCTION IF EXISTS public.match_szotar_embedding(extensions.vector, double precision, integer, uuid, text[]);