

# BNO Embedding Auto-Generatorater with Cron Job

## Summary

Create an automatic embedding generation system that runs on a schedule (cron) inside Supabase. The system will process BNO codes without embeddings in small, reliable batches, avoiding the timeout issues with background tasks.

## Problem Analysis

The current `EdgeRuntime.waitUntil` approach fails because:
- Edge functions are being shut down before background tasks complete
- Processing 11,698 codes in one call exceeds execution limits
- Logs show repeated "shutdown" events, killing the batch process

## Solution: Paginated Cron Job

```text
┌─────────────────────────────────────────────────────────────────────┐
│                      Cron Job (every minute)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   pg_cron ─────▶ pg_net.http_post ─────▶ generate-bno-embeddings   │
│      │                                            │                 │
│      │                                            ▼                 │
│      │                              ┌──────────────────────────┐   │
│      │                              │  1. Query bno_codes      │   │
│      │                              │     without embeddings   │   │
│      │                              │     LIMIT 50             │   │
│      │                              │                          │   │
│      │                              │  2. Generate embeddings  │   │
│      │                              │     via OpenAI           │   │
│      │                              │                          │   │
│      │                              │  3. Upsert to            │   │
│      │                              │     bno_embeddings       │   │
│      │                              │                          │   │
│      │                              │  4. Return result        │   │
│      │                              └──────────────────────────┘   │
│      │                                                              │
│      └────────────── Repeats until all codes processed ────────────┘
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Create New Edge Function

Create `supabase/functions/generate-bno-embeddings/index.ts`:
- Fetches BNO codes that don't have embeddings (using LEFT JOIN)
- Processes exactly 50 codes per invocation (safe batch size)
- Generates embeddings via OpenAI
- Inserts into `bno_embeddings` table
- Returns status: `{ processed: N, remaining: M }`

### Step 2: Update Config

Add to `supabase/config.toml`:
```toml
[functions.generate-bno-embeddings]
verify_jwt = false
```

### Step 3: Enable Cron Extensions

SQL migration to enable `pg_cron` and `pg_net` extensions.

### Step 4: Create Cron Job

SQL to schedule the function to run every minute:
```sql
SELECT cron.schedule(
  'generate-bno-embeddings-job',
  '* * * * *',
  $$ SELECT net.http_post(...) $$
);
```

The cron job will automatically stop when there are no more codes to process (function returns early).

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/generate-bno-embeddings/index.ts` | Create | New edge function for batch embedding |
| `supabase/config.toml` | Modify | Add function config |
| SQL Migration | Execute | Enable pg_cron, pg_net, create schedule |

## Technical Details

### Edge Function Logic
```typescript
// Pseudocode
1. Query: SELECT bc.* FROM bno_codes bc
          LEFT JOIN bno_embeddings be ON bc.id = be.bno_code_id
          WHERE be.id IS NULL
          LIMIT 50

2. If no results -> return { processed: 0, complete: true }

3. Generate embeddings via OpenAI (batch of 50 texts)

4. For each: CALL upsert_bno_embedding(...)

5. Return { processed: 50, remaining: X }
```

### Processing Timeline
- 11,698 codes / 50 per minute = ~234 minutes (~4 hours)
- Can increase batch size to 100 for ~2 hours completion
- Runs automatically, no manual intervention needed

### Safety Features
- Function is idempotent (safe to re-run)
- LEFT JOIN ensures only unprocessed codes are selected
- Small batch size prevents timeouts and rate limits
- Cron job can be paused/deleted via SQL

