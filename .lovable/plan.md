

## Fix VerdiktDisplay: Field Name Mismatches and Rendering Issues

### Problems Found

**Problem 1: Hungarian vs English field names in interfaces (CRITICAL)**
The actual webhook JSON from n8n uses Hungarian field names, but the TypeScript interfaces in `VerdiktDisplay.tsx` use English names. This causes the "Szabaly talaltatok" panel to show all N/A values:

| Interface field (English) | Actual JSON field (Hungarian) |
|---|---|
| `final_decision` | `eredmeny` |
| `search_details` | `keresek` |
| `selected` / `candidates` | `kivalasztott` / `jeloltek` |
| `override` | `alapszabaly_override` |
| `similarity_summary` | `similarity_osszesites` |
| `total`, `matched`, `match_rate` | nested under `statisztika` |

**Problem 2: Kitoltes text may appear truncated**
The `linkifyText` function uses a regex with the `g` (global) flag combined with `.test()` inside a `.map()` loop. The `g` flag causes `.test()` to maintain internal state (`lastIndex`) across calls, which can lead to incorrect match/no-match results on subsequent iterations. This is a known JavaScript footgun. Also the ScrollArea `max-h-[500px]` may be too small for long treatment plans.

### Solution

**File: `src/components/voice/VerdiktDisplay.tsx`**

1. Update `ExecutionReportHuman` interface to match actual JSON structure -- add `statisztika` wrapper with `similarity_osszesites` sub-object, keep `talalatok` as-is.

2. Update `Talalat` interface to use Hungarian field names: `eredmeny` instead of `final_decision`, `keresek` instead of `search_details`. Update nested types: `kivalasztott` instead of `selected`, `jeloltek` instead of `candidates`, `alapszabaly_override` instead of `override`.

3. Update `MatchItem` component to reference the corrected Hungarian field names (`item.eredmeny`, `item.keresek`, etc.).

4. Fix `linkifyText`: remove the `g` flag from the regex used in `.test()`, or use a separate non-global regex for testing. The `split()` method ignores the `g` flag anyway.

5. Increase `max-h` on Kitoltes ScrollArea from `500px` to `800px` for longer treatment plans.

