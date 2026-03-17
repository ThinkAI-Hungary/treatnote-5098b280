export async function logErrorToDatabase(
  supabaseAdmin: any,
  params: {
    script_name: string;
    summary: string;
    full_log: string | Error;
    domain?: string;
    severity?: 'info' | 'warning' | 'error';
    metadata?: any;
    user_id?: string | null;
    username?: string | null;
    company_id?: string | null;
    company_name?: string | null;
    telephely_id?: string | null;
    telephely_name?: string | null;
    screenshot_urls?: string[];
  }
) {
  try {
    let fullLogStr = '';
    if (params.full_log instanceof Error) {
      fullLogStr = params.full_log.stack || params.full_log.message;
    } else {
      fullLogStr = String(params.full_log);
    }

    const { error } = await supabaseAdmin.from('error_logs').insert({
      script_name: params.script_name,
      summary: params.summary,
      full_log: fullLogStr,
      domain: params.domain || null,
      severity: params.severity || 'error',
      metadata: params.metadata || {},
      user_id: params.user_id || null,
      username: params.username || null,
      company_id: params.company_id || null,
      company_name: params.company_name || null,
      telephely_id: params.telephely_id || null,
      telephely_name: params.telephely_name || null,
      screenshot_urls: params.screenshot_urls || []
    });

    if (error) {
      console.error('[Logger] Failed to insert error log:', error);
    }
  } catch (err) {
    console.error('[Logger] Unexpected error during logErrorToDatabase:', err);
  }
}
