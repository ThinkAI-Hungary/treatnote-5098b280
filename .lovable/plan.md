

# BNO Search Edge Function

## Summary

Create a dedicated `search-bno-codes` edge function that simplifies n8n integration by accepting plain text search queries and returning matching BNO codes. The function will handle embedding generation internally using OpenAI, eliminating the need for n8n to manage embeddings.

## How It Works

```text
┌─────────────────────────────────────────────────────────────────────┐
│                           n8n Workflow                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────────┐         ┌──────────────────────────────────────┐ │
│   │   Trigger    │────────▶│        HTTP Request Node             │ │
│   │  (webhook)   │         │                                      │ │
│   └──────────────┘         │  POST /search-bno-codes              │ │
│                            │  { "query": "tüdőgyulladás" }        │ │
│                            └──────────────┬───────────────────────┘ │
│                                           │                         │
│                                           ▼                         │
│                            ┌──────────────────────────────────────┐ │
│                            │          Response                    │ │
│                            │  [{ code, name, similarity }]        │ │
│                            └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌─────────────────────────────────────────────────────────────────────┐
│                    search-bno-codes Edge Function                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Receive search query text                                       │
│                                                                     │
│  2. Generate embedding via OpenAI API                               │
│     ┌────────────────────────────────────────┐                     │
│     │  POST api.openai.com/v1/embeddings     │                     │
│     │  model: text-embedding-3-large         │                     │
│     │  input: "tüdőgyulladás"                │                     │
│     └────────────────────────────────────────┘                     │
│                                                                     │
│  3. Call match_bno_embedding() with vector                          │
│     ┌────────────────────────────────────────┐                     │
│     │  SELECT * FROM match_bno_embedding(    │                     │
│     │    query_embedding,                    │                     │
│     │    match_threshold,                    │                     │
│     │    match_count                         │                     │
│     │  )                                     │                     │
│     └────────────────────────────────────────┘                     │
│                                                                     │
│  4. Return matching BNO codes with similarity scores                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## API Specification

### Endpoint
`POST /functions/v1/search-bno-codes`

### Request Body
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| query | string | Yes | - | Search text (e.g., "tüdőgyulladás") |
| match_count | number | No | 10 | Maximum results to return |
| match_threshold | number | No | 0.5 | Minimum similarity score (0-1) |

### Response
```json
{
  "success": true,
  "results": [
    {
      "code": "J189",
      "name": "Tüdőgyulladás k.m.n.",
      "similarity": 0.89
    },
    {
      "code": "J180",
      "name": "Bronchopneumonia k.m.n.",
      "similarity": 0.76
    }
  ],
  "query": "tüdőgyulladás",
  "count": 2
}
```

## n8n Integration Example

### HTTP Request Node Configuration
| Setting | Value |
|---------|-------|
| Method | POST |
| URL | `https://bpjzgapmoyhtgryglcke.supabase.co/functions/v1/search-bno-codes` |
| Headers | `apikey`: Supabase anon key |
| Body | `{ "query": "{{$json.searchText}}", "match_count": 5 }` |

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/search-bno-codes/index.ts` | Create | New edge function for semantic BNO search |
| `supabase/config.toml` | Modify | Add function configuration with `verify_jwt = false` |

## Technical Details

### Edge Function Logic
1. Validate request body (query is required)
2. Generate embedding using OpenAI `text-embedding-3-large` model (same as used for BNO embeddings)
3. Call `match_bno_embedding` RPC function with the generated vector
4. Return formatted results with code, name, and similarity score

### Security Considerations
- Set `verify_jwt = false` to allow n8n webhook calls without Supabase auth
- Uses existing `OPENAI_API_KEY` secret (already configured)
- Read-only operation (only SELECT via RPC)

### Error Handling
- Missing query: 400 Bad Request
- OpenAI API failure: 500 with descriptive error
- Database error: 500 with error details

