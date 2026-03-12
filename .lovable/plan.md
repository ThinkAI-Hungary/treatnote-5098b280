

# Onboarding Tour / Tooltip elrejtese mobilon

## Cel

Mobil nezetben (768px alatt) az onboarding tour es a TourHelpButton ne jelenjen meg, hogy ne zavarja a felhasznalot a kisebb kepernyokon.

## Megoldas

Egyetlen fajl modositasa szukseges: `src/hooks/useOnboardingTour.ts`

### Valtozasok

**`src/hooks/useOnboardingTour.ts`**:
- Importalni a `useIsMobile` hookot a `src/hooks/use-mobile.tsx` fajlbol
- Ha `isMobile === true`:
  - `showTour` mindig `false` marad (az auto-show logika nem indul el)
  - `startTour` nem csinal semmit (a TourHelpButton kattintasa nem inditja el a turt)
- A visszaadott objektumba felvenni egy `isMobile` mezo is, hogy a TourHelpButton-t a hivo komponensekben el lehessen rejteni

**Hivo komponensek** (pl. `KlinikaAdmin.tsx`, `Dashboard.tsx`, `Profile.tsx`, `VoiceRecording.tsx`):
- A `TourHelpButton`-t feltetelesen renderelni: csak akkor jelenjen meg, ha nem mobil nezet
- Ezt a `useOnboardingTour`-bol visszakapott `isMobile` ertekkel vagy kulon `useIsMobile()` hivassal oldhatjuk meg

## Technikai reszletek

A `useOnboardingTour` hook-ban:

```text
import { useIsMobile } from '@/hooks/use-mobile';

export function useOnboardingTour(...) {
  const isMobile = useIsMobile();

  // Az auto-show effect-ben: ha isMobile, ne induljon el
  useEffect(() => {
    if (!checkedInitial || !isEligible || isMobile) return;
    ...
  }, [checkedInitial, autoShowForNewUsers, isNewUser, hasSeenTour, isEligible, isMobile]);

  const startTour = useCallback(() => {
    if (isMobile) return;  // mobilon nem indul
    setShowTour(true);
  }, [isMobile]);

  return { showTour, startTour, completeTour, skipTour, isNewUser, hasSeenTour, isMobile };
}
```

A hivo komponensekben:

```text
const { showTour, startTour, ..., isMobile } = useOnboardingTour({...});

// A renderben:
{!isMobile && <TourHelpButton onClick={startTour} />}
```

## Erintett fajlok

| Fajl | Valtozas |
|------|----------|
| `src/hooks/useOnboardingTour.ts` | `useIsMobile` hozzaadasa, mobil guard az auto-show-ra es startTour-ra, `isMobile` visszaadasa |
| `src/pages/KlinikaAdmin.tsx` | TourHelpButton felteteles renderelese |
| `src/pages/Dashboard.tsx` | TourHelpButton felteteles renderelese |
| `src/pages/Profile.tsx` | TourHelpButton felteteles renderelese |
| `src/pages/VoiceRecording.tsx` | TourHelpButton felteteles renderelese |

## Kockazat

Alacsony -- csak felteteles logika hozzaadasa, meglevo mukodes nem valtozik desktop-on.

