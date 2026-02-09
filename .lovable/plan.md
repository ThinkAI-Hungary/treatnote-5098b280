

## Add `sajat_feltoltes` column to `treatment_rules`

### What this does
Adds a new column `sajat_feltoltes` to the `treatment_rules` table that flags whether a treatment rule was uploaded via the Szabalyepito Teszt webhook (value = 1) or created through any other method (value = 0).

### Steps

1. **Database Migration** -- Add `sajat_feltoltes` column to `treatment_rules`
   - Type: `smallint`, NOT NULL, DEFAULT `0`
   - All existing rows will automatically get value `0`

2. **Update `szabalyepito-teszt-webhook` Edge Function** -- Set `sajat_feltoltes = 1` on insert
   - In the extraction processing loop (around line 538), add `sajat_feltoltes: 1` to the `treatment_rules` insert payload

3. **Update TypeScript types** -- Regenerate or manually add the field to `src/integrations/supabase/types.ts` so the frontend is aware of the new column

### Technical details

**Migration SQL:**
```sql
ALTER TABLE treatment_rules
  ADD COLUMN sajat_feltoltes smallint NOT NULL DEFAULT 0;
```

**Edge Function change (line ~538):**
```typescript
.insert({
  clinic_id: telephely_id,
  name: extraction.fogalom,
  category: extraction.kategoria || null,
  semantic_description: extraction.semantic_description || null,
  sajat_feltoltes: 1,  // <-- new
})
```

No other edge functions or UI code that inserts into `treatment_rules` needs changes -- the DEFAULT 0 handles everything else automatically.

