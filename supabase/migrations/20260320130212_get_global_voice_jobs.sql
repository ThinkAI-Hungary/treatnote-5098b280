CREATE OR REPLACE FUNCTION get_global_voice_jobs(
  p_limit INT DEFAULT 200,
  p_company_id UUID DEFAULT NULL,
  p_telephely_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS SETOF voice_jobs AS $$
DECLARE
  v_role text;
BEGIN
  -- Get the current user's role
  SELECT role INTO v_role 
  FROM user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1;

  -- Only admins can view global history
  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT *
  FROM voice_jobs
  WHERE (p_company_id IS NULL OR company_id = p_company_id)
    AND (p_telephely_id IS NULL OR telephely_id = p_telephely_id)
    AND (p_user_id IS NULL OR user_id = p_user_id)
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
