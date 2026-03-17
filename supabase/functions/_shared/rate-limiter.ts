import { logErrorToDatabase } from "./logger.ts";

export async function checkRateLimit(
  supabaseAdmin: any,
  identifier: string,
  endpoint: string,
  maxRequests: number = 10,
  windowMinutes: number = 15
): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
  try {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    let { data: currentLimit } = await supabaseAdmin
      .from('rate_limits')
      .select('*')
      .eq('identifier', identifier)
      .eq('endpoint', endpoint)
      .maybeSingle();

    if (currentLimit && new Date(currentLimit.first_request_time) < new Date(windowStart)) {
      // Expired, reset it
      const { data: updated } = await supabaseAdmin
        .from('rate_limits')
        .update({ request_count: 1, first_request_time: new Date().toISOString() })
        .eq('id', currentLimit.id)
        .select('*')
        .single();
      currentLimit = updated;
    } else if (!currentLimit) {
      // Doesn't exist, insert
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('rate_limits')
        .insert({ identifier, endpoint, request_count: 1 })
        .select('*')
        .maybeSingle();
      
      if (insertError) {
         // Concurrency issue (another request inserted it). Fetch again or fall open.
         return { allowed: true, remaining: maxRequests - 1, resetTime: new Date(Date.now() + windowMinutes * 60 * 1000) };
      }
      currentLimit = inserted;
    } else {
        // Exists and is within valid window
        if (currentLimit.request_count >= maxRequests) {
            const resetTime = new Date(new Date(currentLimit.first_request_time).getTime() + windowMinutes * 60 * 1000);
            return { allowed: false, remaining: 0, resetTime };
        }
        await supabaseAdmin
            .from('rate_limits')
            .update({ request_count: currentLimit.request_count + 1 })
            .eq('id', currentLimit.id);
        currentLimit.request_count += 1;
    }
    
    if (!currentLimit) {
        return { allowed: true, remaining: maxRequests, resetTime: new Date(Date.now() + windowMinutes * 60 * 1000) };
    }

    const resetTime = new Date(new Date(currentLimit.first_request_time).getTime() + windowMinutes * 60 * 1000);
    return { allowed: true, remaining: maxRequests - currentLimit.request_count, resetTime };
  } catch (error) {
    console.error(`Rate limiter check failed for ${endpoint}:`, error);
    await logErrorToDatabase(supabaseAdmin, {
      script_name: endpoint,
      summary: 'Rate limiter hiba',
      full_log: error instanceof Error ? error.stack || error.message : String(error),
      severity: 'warning'
    });
    // Fall open on db error to not block legitimate traffic
    return { allowed: true, remaining: maxRequests, resetTime: new Date(Date.now() + windowMinutes * 60 * 1000) };
  }
}
