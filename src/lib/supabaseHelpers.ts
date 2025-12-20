import { supabase } from '@/integrations/supabase/client';

function isUnauthorizedError(err: unknown) {
  const anyErr = err as any;
  const message = String(anyErr?.message ?? '');
  const status = anyErr?.context?.status ?? anyErr?.status;

  return (
    status === 401 ||
    message.includes('401') ||
    message.includes('Unauthorized') ||
    message.includes('Invalid or expired token')
  );
}

/**
 * Invokes a Supabase edge function with automatic retry on 401 errors.
 * On 401, it refreshes the session and retries once.
 */
export async function invokeWithRetry<T>(
  functionName: string,
  body: Record<string, unknown> = {},
  retries = 1
): Promise<{ data: T | null; error: Error | null }> {
  // Always fetch the current token and pass it explicitly to avoid occasional stale/missing headers.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error && isUnauthorizedError(error) && retries > 0) {
    console.log(`Got 401 for ${functionName}, refreshing session and retrying...`);

    const { error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return invokeWithRetry<T>(functionName, body, retries - 1);
    }
  }

  return { data, error };
}
