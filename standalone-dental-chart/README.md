# Standalone Dental Chart — Zsigmondy-kereszt

Interaktív fogstátusz diagram Zsigmondy-kereszt elrendezésben, anatómiai fog SVG-kkel.

## Fájlstruktúra

```
standalone-dental-chart/
├── index.ts                          # Barrel export
├── store/
│   └── dentalStore.ts                # Zustand store (típusok + állapotkezelés + FDI konstansok)
├── components/
│   ├── ZsigmondyCross.tsx            # Fő Zsigmondy-kereszt komponens (4 kvadráns + toolbar)
│   ├── ZsigmondyToothCell.tsx        # Egyetlen fog cella (anatómiai SVG + tooltip)
│   └── ToothDetailPanel.tsx          # Részlet/szerkesztő panel (egyedi + csoportos)
├── lib/
│   └── dentalMapping.ts              # Supabase teeth tábla ↔ ToothData mapping
├── hooks/
│   └── useDentalData.ts              # Betöltés/mentés hook (Supabase)
└── README.md
```

## Függőségek

### npm csomagok
```bash
npm install zustand lucide-react
```

### shadcn/ui komponensek
A következő shadcn/ui komponensek szükségesek (az `@/components/ui/` importok):
- `Card`, `CardContent`, `CardHeader`, `CardTitle`
- `Button`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`
- `Tooltip`, `TooltipContent`, `TooltipTrigger`, `TooltipProvider`
- `Label`
- `Switch`
- `Slider`
- `Textarea`

### CSS változók
A komponensek a következő CSS változókat használják (shadcn/ui standard):
- `--primary`, `--border`, `--muted`, `--muted-foreground`, `--ring`, `--background`, `--foreground`

## Használat

### Alap megjelenítés
```tsx
import { ZsigmondyCross, ToothDetailPanel } from './standalone-dental-chart';

function DentalChartPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <ZsigmondyCross />
      <ToothDetailPanel />
    </div>
  );
}
```

### Adatbázis integráció (Supabase)
```tsx
import { useDentalData } from './standalone-dental-chart';
import { supabase } from './your-supabase-client';

function DentalChartWithDb({ examinationId }: { examinationId: string }) {
  const { isLoading, isSaving, saveTeeth } = useDentalData({
    examinationId,
    supabaseClient: supabase,
  });

  return (
    <div>
      <ZsigmondyCross />
      <ToothDetailPanel />
      <button onClick={saveTeeth} disabled={isSaving}>Mentés</button>
    </div>
  );
}
```

### Programmatic API
```tsx
import { useDentalStore } from './standalone-dental-chart';

// Store-ból olvasás
const { teeth, selectedTeeth } = useDentalStore();

// Fog módosítása
useDentalStore.getState().updateTooth(11, { status: 'caries' });

// Több fog kijelölése
useDentalStore.getState().selectMultipleTeeth([11, 12, 13]);

// Híd létrehozás (első/utolsó = pillér, közbülsők = pótfog)
useDentalStore.getState().createBridge([34, 35, 36]);

// Csoportos állapotváltás
useDentalStore.getState().updateMultipleTeeth([41, 42, 43], { status: 'filled' });
```

## Importok testreszabása

A `@/components/ui/*` importokat a célprojekthez kell igazítani.
Ha nem shadcn/ui-t használsz, cseréld le a megfelelő UI könyvtár komponensekre.

## Adatbázis séma

A `dentalMapping.ts` a következő Supabase `teeth` tábla sémát várja:

| Mező | Típus |
|------|-------|
| examination_id | uuid |
| tooth_number | int (FDI: 11–48) |
| present | bool |
| caries | bool |
| caries_locations | text[] |
| restoration | text (none/composite/amalgam/ceramic) |
| restoration_locations | text[] |
| crown | text (none/metal/porcelain/zirconia/gold) |
| bridge | text (none/anchor/pontic) |
| prosthesis | text (none/removable/fixed) |
| endo_status | text (none/treated/retreatment/planned) |
| pathology | text (none/periapical/cyst/fracture) |
| treatment_plan | text (none/extraction/implant/crown/bridge/...) |
| mobility | int (0–3) |
| fissure_sealing | bool |
| notes | text |

## Funkciók

- **Zsigmondy-kereszt** — 4 kvadráns, FDI számozás, anatómiai fog SVG-k
- **Fogtípus-specifikus ábrák** — metszőfog, szemfog, premoláris, moláris (koronával + gyökérrel)
- **Multi-szelekcó** — Ctrl+kattintás, preset gombok (Teljes szájüreg, Felső, Alsó, Q1–Q4)
- **Híd létrehozás** — kijelölés → gomb → pillér + pótfog automatikus hozzárendelés
- **Csoportos szerkesztés** — állapotváltás, felületi változtatás több fogra egyszerre
- **Felületi szerkesztés** — 5 felület (M, D, O, B, L) paint-mode állapotváltás
- **Tooltip** — hover-re részletes info
- **10 státusz** — egészséges, szuvas, tömött, korona, híd pillér/pótfog, hiányzó, implantátum, gyökérkezelt, extrakció tervezett
