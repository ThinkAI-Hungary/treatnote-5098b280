import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { Mic, Bot, Loader2, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardModeSwitcherProps {
  currentMode: string | null;
  telephelyId: string | null;
  userId: string | null;
  isKlinikaAdmin: boolean;
  onModeChanged: () => void;
}

export function DashboardModeSwitcher({ currentMode, telephelyId, userId, isKlinikaAdmin, onModeChanged }: DashboardModeSwitcherProps) {
  const [loading, setLoading] = useState(false);
  const [hasAckMode, setHasAckMode] = useState(true);

  useEffect(() => {
    if (userId) {
      const ack = localStorage.getItem(`mode_ack_${userId}`);
      if (ack || currentMode) {
        setHasAckMode(true);
        if (!ack && currentMode) {
          localStorage.setItem(`mode_ack_${userId}`, 'true');
        }
      } else {
        setHasAckMode(false);
      }
    }
  }, [userId, currentMode]);

  if (!isKlinikaAdmin || !telephelyId || !userId) return null;

  const handleModeChange = async (newMode: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('telephely')
        .update({ voice_recording_preference: newMode })
        .eq('id', telephelyId);

      if (error) throw error;
      
      localStorage.setItem(`mode_ack_${userId}`, 'true');
      setHasAckMode(true);
      
      toast.success('Működési mód sikeresen frissítve!');
      
      // Frissítjük a profil adatokat a szülőben, így nem kell oldalújratöltés
      onModeChanged();
    } catch (err: any) {
      console.error('Error updating mode:', err);
      toast.error('Hiba történt a módosításkor: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const setAck = () => {
    localStorage.setItem(`mode_ack_${userId}`, 'true');
    setHasAckMode(true);
    onModeChanged();
  };

  const isNative = currentMode === 'treatnote_native';

  // HA MÉG NEM VÁLASZTOTT (Full screen / Large hero selector)
  if (!hasAckMode) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-500 p-4">
        <div className="w-full max-w-4xl space-y-8 animate-in slide-in-from-bottom-8 duration-700">
          <div className="text-center space-y-3">
            <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Válasszon Működési Módot
            </h2>
            <p className="text-xl text-muted-foreground">
              Hogyan szeretné használni a TreatNote rendszert?
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* FlexiDent Card */}
            <Card 
              className={cn(
                "relative overflow-hidden cursor-pointer group hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border-2 hover:border-primary/50",
                loading && "pointer-events-none opacity-70"
              )}
              onClick={() => handleModeChange('flexident')}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="p-8 flex flex-col items-center text-center space-y-6">
                <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                  {loading ? <Loader2 className="h-10 w-10 text-primary animate-spin" /> : <Mic className="h-10 w-10 text-primary" />}
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-bold">FlexiDent Integráció</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Közvetlen szinkronizáció meglévő FlexiDent fiókkal. Automatikus páciens és beavatkozás betöltés, egyből a Flexibe mentünk mindent.
                  </p>
                </div>
              </div>
            </Card>

            {/* Native Card */}
            <Card 
              className={cn(
                "relative overflow-hidden cursor-pointer group hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border-2 hover:border-primary/50",
                loading && "pointer-events-none opacity-70"
              )}
              onClick={() => {
                if (isNative) {
                  setAck(); // Már az, csak leokézza
                } else {
                  handleModeChange('treatnote_native');
                }
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="p-8 flex flex-col items-center text-center space-y-6">
                <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                  {loading ? (
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  ) : (
                    <span className="text-[3rem] font-extrabold text-primary select-none leading-none">T</span>
                  )}
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-bold">TreatNote Natív</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Rendszerünk teljes körű használata függetlenül. Manuális szótár rögzítés, letisztult, önálló dokumentációs folyamat.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // HA MÁR VÁLASZTOTT (A másik gomb a sarokban van)
  return (
    <div className="absolute top-6 right-6 z-10 animate-in fade-in slide-in-from-right-8 duration-700">
      <Button
        variant="outline"
        size="sm"
        className="rounded-full shadow-md hover:shadow-lg transition-all duration-300 border-primary/20 bg-background/80 backdrop-blur-md"
        onClick={() => handleModeChange(isNative ? 'flexident' : 'treatnote_native')}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <ArrowRightLeft className="h-4 w-4 mr-2 text-primary" />
        )}
        <span className="font-medium">
          Váltás {isNative ? 'FlexiDent' : 'Natív'} módra
        </span>
      </Button>
    </div>
  );
}
