import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { Loader2, Mic, Bot } from 'lucide-react';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { useProfile } from '@/hooks/useProfile';

interface KezelopanelTabProps {
  telephelyId: string | null;
}

export function KezelopanelTab({ telephelyId }: KezelopanelTabProps) {
  const { profile, refetch } = useProfile();
  const [currentMode, setCurrentMode] = useState<string | null>(profile?.voice_recording_preference || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCurrentMode(profile?.voice_recording_preference || null);
  }, [profile?.voice_recording_preference]);

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

  const isNative = currentMode === 'treatnote_native';
  const isFlexi = currentMode === 'flexident';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
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
    </div>
  );
}
