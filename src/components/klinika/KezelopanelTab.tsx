import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { Loader2, Mic, Copy, Check, QrCode, Eye, EyeOff, RotateCcw, AlertTriangle, Trash2 } from 'lucide-react';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { useProfile } from '@/hooks/useProfile';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

interface KezelopanelTabProps {
  telephelyId: string | null;
}

export function KezelopanelTab({ telephelyId }: KezelopanelTabProps) {
  const { profile, refetch } = useProfile();
  const [currentMode, setCurrentMode] = useState<string | null>(profile?.voice_recording_preference || null);
  const [loading, setLoading] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Reset dialog state
  const [resetTelephelyOpen, setResetTelephelyOpen] = useState(false);
  const [resetProfileOpen, setResetProfileOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setCurrentMode(profile?.voice_recording_preference || null);
  }, [profile?.voice_recording_preference]);

  useEffect(() => {
    if (!telephelyId) return;
    supabase
      .from('telephely')
      .select('share_code')
      .eq('id', telephelyId)
      .single()
      .then(({ data }) => {
        if (data?.share_code) setShareCode(data.share_code);
      });
  }, [telephelyId]);

  const handleCopyCode = () => {
    if (!shareCode) return;
    navigator.clipboard.writeText(shareCode);
    setCopied(true);
    toast.success('Kód vágólapra másolva!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleModeChange = async (newMode: string) => {
    if (!telephelyId) {
      toast.error('Nincs kiválasztott telephely.');
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('telephely')
        .update({ voice_recording_preference: newMode })
        .eq('id', telephelyId);

      if (error) throw error;
      
      setCurrentMode(newMode);
      
      toast.success('Működési mód sikeresen frissítve a telephely összes felhasználója számára!');
      
      // Reload the profile data to ensure all contexts pick up the new telephely setting immediately
      if (refetch) {
        refetch();
      }
    } catch (err: any) {
      console.error('Error updating mode:', err);
      toast.error('Hiba történt a módosításkor: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Reset handlers ──

  const handleResetTelephely = async () => {
    if (!telephelyId) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('v2-onboarding', {
        body: { operation: 'reset-telephely', telephelyId },
      });
      if (error) throw error;
      toast.success(data?.message || 'Telephely mapping-ek és beállítások törölve!');
      setResetTelephelyOpen(false);
    } catch (err: any) {
      console.error('Reset telephely error:', err);
      toast.error('Hiba: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setResetting(false);
    }
  };

  const handleResetProfile = async () => {
    if (!telephelyId) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('v2-onboarding', {
        body: { operation: 'reset-profile', telephelyId },
      });
      if (error) throw error;
      toast.success(data?.message || 'Szótár, FlexiDent domain, próba páciens és bejelentkezési adatok törölve!');
      setResetProfileOpen(false);
      if (refetch) refetch();
    } catch (err: any) {
      console.error('Reset profile error:', err);
      toast.error('Hiba: ' + err.message);
    } finally {
      setResetting(false);
    }
  };

  const isNative = currentMode === 'treatnote_native';
  const isFlexi = currentMode === 'flexident';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ── Telephely megosztási kód ─────────────────────────────────────── */}
      <AnimatedCard>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Páciensmegosztási kód</CardTitle>
          </div>
          <CardDescription>
            Ezt a kódot add meg a másik telephelynek, ha pácienst szeretnek megosztani ezzel a telephellyel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2">
            {/* Code display — fixed height so blur toggle causes no layout shift */}
            <div className="flex-1 relative min-h-[3.5rem]">
              <div
                className={`absolute inset-0 bg-muted rounded-lg px-4 py-3 font-mono text-xs font-bold tracking-wider text-primary break-all leading-relaxed overflow-hidden transition-[filter] duration-300 ${
                  revealed ? 'blur-none select-all' : 'blur-sm select-none'
                }`}
              >
                {shareCode ?? '—'}
              </div>
            </div>

            {/* Reveal / hide toggle */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 mt-0.5"
              onClick={() => setRevealed(r => !r)}
              title={revealed ? 'Elrejtés' : 'Kód megjelenítése'}
            >
              {revealed
                ? <EyeOff className="h-4 w-4" />
                : <Eye className="h-4 w-4" />}
            </Button>

            {/* Copy */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 mt-0.5"
              onClick={handleCopyCode}
              disabled={!shareCode}
              title="Kód másolása"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </AnimatedCard>

      {/* ── Működési mód ─────────────────────────────────────────────────── */}
      <AnimatedCard>
        <CardHeader>
          <CardTitle>Működési Mód Választás</CardTitle>
          <CardDescription>
            Válassza ki a telephely szintű alapértelmezett működési módot. Ez a beállítás az összes munkatársra érvényes lesz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Button
              variant={isFlexi ? "default" : "outline"}
              className={`h-32 text-lg flex flex-col items-center justify-center gap-3 transition-all duration-300 ${isFlexi ? 'ring-2 ring-primary ring-offset-2 !text-black' : 'hover:border-primary/50'}`}
              onClick={() => handleModeChange('flexident')}
              disabled={loading}
            >
              <Mic className={`h-8 w-8 ${isFlexi ? '!text-black' : 'text-primary'}`} />
              <div className="flex flex-col items-center">
                <span className="font-semibold">FlexiDent Integráció</span>
                <span className={`text-xs mt-1 ${isFlexi ? '!text-black/80' : 'text-muted-foreground'}`}>
                  Csatlakozás a meglévő FlexiDent rendszerhez
                </span>
              </div>
            </Button>
            
            <Button
              variant={isNative ? "default" : "outline"}
              className={`h-32 text-lg flex flex-col items-center justify-center gap-3 transition-all duration-300 ${isNative ? 'ring-2 ring-primary ring-offset-2 !text-black' : 'hover:border-primary/50'}`}
              onClick={() => handleModeChange('treatnote_native')}
              disabled={loading}
            >
              <div className={`h-8 w-8 flex items-center justify-center ${isNative ? '!text-black' : 'text-primary'}`}>
                <span className="text-3xl font-extrabold select-none leading-none">T</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="font-semibold">TreatNote Natív</span>
                <span className={`text-xs mt-1 ${isNative ? '!text-black/80' : 'text-muted-foreground'}`}>
                  Önálló működés TreatNote kezelési szótárral
                </span>
              </div>
            </Button>
          </div>
        </CardContent>
      </AnimatedCard>

      {/* ── Alaphelyzetbe állítás (Danger zone) ──────────────────────────── */}
      <AnimatedCard>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-base text-red-500">Veszélyes műveletek</CardTitle>
          </div>
          <CardDescription>
            Ezek a műveletek visszavonhatatlanul törölnek adatokat. Körültekintően használja!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 bg-red-500/5">
            <div>
              <p className="text-sm font-medium">Telephely alaphelyzetbe állítása</p>
              <p className="text-xs text-muted-foreground">Törli a V2 mapping-eket, protokoll testreszabásokat és az onboarding állapotot.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-500 shrink-0"
              onClick={() => setResetTelephelyOpen(true)}
              disabled={!telephelyId}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Visszaállítás
            </Button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 bg-red-500/5">
            <div>
              <p className="text-sm font-medium">Profil alaphelyzetbe állítása</p>
              <p className="text-xs text-muted-foreground">Törli a szótárt, FlexiDent domaint, próba páciens ID-t és FlexiDent bejelentkezési adatokat.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-500 shrink-0"
              onClick={() => setResetProfileOpen(true)}
              disabled={!telephelyId}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Visszaállítás
            </Button>
          </div>
        </CardContent>
      </AnimatedCard>

      {/* ── Telephely reset confirmation ──────────────────────────────────── */}
      <Dialog open={resetTelephelyOpen} onOpenChange={setResetTelephelyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" />
              Telephely alaphelyzetbe állítása
            </DialogTitle>
            <DialogDescription>
              Ez a művelet törli az összes V2 mapping-et és protokoll testreszabást ehhez a telephelyhez.
              Az újrafuttatáshoz a Mapping fülön kell majd újra indítani az automata hozzárendelést.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTelephelyOpen(false)} disabled={resetting}>
              Mégse
            </Button>
            <Button variant="destructive" onClick={handleResetTelephely} disabled={resetting}>
              {resetting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
              Törlés és visszaállítás
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Profile reset confirmation ────────────────────────────────────── */}
      <Dialog open={resetProfileOpen} onOpenChange={setResetProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" />
              Profil alaphelyzetbe állítása
            </DialogTitle>
            <DialogDescription>
              Ez a művelet törli a teljes szótárt, a FlexiDent domain beállítást, a próba páciens azonosítót,
              és a FlexiDent bejelentkezési adatokat. Az onboarding folyamatot újra el kell majd végezni.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetProfileOpen(false)} disabled={resetting}>
              Mégse
            </Button>
            <Button variant="destructive" onClick={handleResetProfile} disabled={resetting}>
              {resetting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Minden törlése
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
