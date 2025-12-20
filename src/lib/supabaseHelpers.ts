import { supabase } from '@/integrations/supabase/client';

/**
 * Invokes a Supabase edge function with automatic retry on 401 errors.
 * On 401, it refreshes the session and retries once.
 */
export async function invokeWithRetry<T>(
  functionName: string,
  body: Record<string, unknown> = {},
  retries = 1
): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke<T>(functionName, { body });
  
  // Check for 401 error (unauthorized) - retry after session refresh
  if (error && (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.message?.includes('Invalid or expired token'))) {
    if (retries > 0) {
      console.log(`Got 401 for ${functionName}, refreshing session and retrying...`);
      // Refresh the session
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError) {
        // Wait a brief moment for the new token to propagate
        await new Promise(resolve => setTimeout(resolve, 100));
        return invokeWithRetry<T>(functionName, body, retries - 1);
      }
    }
  }
  
  return { data, error };
}
