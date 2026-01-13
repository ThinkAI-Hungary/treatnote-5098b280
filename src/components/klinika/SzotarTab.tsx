import { useState, useEffect, useCallback } from 'react';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Book, RefreshCw, Loader2, CheckCircle, AlertCircle, LinkIcon, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFlexiConnection } from '@/hooks/useFlexiConnection';
import { toast } from 'sonner';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { Link, useSearchParams } from 'react-router-dom';
import { ProbaPaciensDialog } from '@/components/klinika/ProbaPaciensDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SzotarTabProps {
  companyId: string | null;
  telephelyId: string | null;
  companyName: string | null;
  telephelyName: string | null;
}

interface SzotarData {
  id: string;
  telephely_id: string;
  content: string[];
  created_at: string;
  updated_at: string;
}

export function SzotarTab({ companyId, telephelyId, companyName, telephelyName }: SzotarTabProps) {
  const { user } = useAuth();
  const { isConnected: isFlexiConnected, isLoading: flexiLoading } = useFlexiConnection();
  const [szotar, setSzotar] = useState<SzotarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [probaPaciensNeve, setProbaPaciensNeve] = useState<string | null>(null);
  const [probaPaciensDialogOpen, setProbaPaciensDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Check if we should open the dialog from URL params
  useEffect(() => {
    if (searchParams.get('openProba') === 'true') {
      setProbaPaciensDialogOpen(true);
      // Remove the param after opening
      searchParams.delete('openProba');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const hasProbaPaciens = !!probaPaciensNeve;

  const loadSzotar = useCallback(async () => {
    if (!telephelyId) {
      setLoading(false);
      return;
    }

    try {
      // Fetch szotar data
      const { data, error } = await supabase
        .from('szotar')
        .select('*')
        .eq('telephely_id', telephelyId)
        .maybeSingle();

      if (error) {
        console.error('Error loading szotar:', error);
        toast.error('Hiba a szótár betöltésekor');
      } else if (data) {
        const content = Array.isArray(data.content) 
          ? data.content as string[]
          : typeof data.content === 'string' 
            ? [data.content]
            : [];
        setSzotar({
          ...data,
          content,
        });
      } else {
        setSzotar(null);
      }

      // Fetch probapaciens_neve from telephely
      const { data: telephelyData, error: telephelyError } = await supabase
        .from('telephely')
        .select('probapaciens_neve')
        .eq('id', telephelyId)
        .maybeSingle();

      if (telephelyError) {
        console.error('Error loading telephely:', telephelyError);
      } else {
        setProbaPaciensNeve(telephelyData?.probapaciens_neve || null);
      }
    } catch (err) {
      console.error('Error loading szotar:', err);
    } finally {
      setLoading(false);
    }
  }, [telephelyId]);

  useEffect(() => {
    loadSzotar();
  }, [loadSzotar]);

  const handleGenerateSzotar = async () => {
    if (!telephelyId || !companyId || !user) {
      toast.error('Hiányzó telephely vagy cég azonosító');
      return;
    }

    setGenerating(true);

    try {
      // Call the edge function that will trigger n8n webhook
      const { data, error } = await supabase.functions.invoke('szotar-webhook', {
        body: {
          telephely_id: telephelyId,
          company_id: companyId,
          user_id: user.id,
          regenerate: szotar !== null,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(szotar ? 'Szótár újragenerálása elindítva!' : 'Szótár készítése elindítva!');
        // Reload after a delay to check for updates
        setTimeout(() => loadSzotar(), 2000);
      } else {
        throw new Error(data?.error || 'Ismeretlen hiba');
      }
    } catch (err: any) {
      console.error('Error generating szotar:', err);
      toast.error('Hiba a szótár generálásakor: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setGenerating(false);
    }
  };

  const handleProbaPaciensSaved = (name: string) => {
    setProbaPaciensNeve(name);
  };

  // Determine button state and tooltip
  const getButtonState = () => {
    if (!isFlexiConnected && !flexiLoading) {
      return {
        disabled: true,
        tooltip: null,
        showFlexiWarning: true,
      };
    }
    if (!hasProbaPaciens) {
      return {
        disabled: true,
        tooltip: 'Kérem adjon meg egy próba páciens nevet az elengedhetetlen tesztek futtatásához.',
        showFlexiWarning: false,
      };
    }
    return {
      disabled: generating || flexiLoading,
      tooltip: null,
      showFlexiWarning: false,
    };
  };

  const buttonState = getButtonState();

  if (loading) {
    return (
      <AnimatedCard>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </AnimatedCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <AnimatedCard>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Book className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Szótár
                  {szotar ? (
                    <Badge className="bg-gradient-to-r from-emerald-500 to-emerald-600">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Aktív
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-muted">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Nincs szótár
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {telephelyName} telephely szótára
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Szótár készítése button */}
              {buttonState.showFlexiWarning ? (
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-0">
                    <Button
                      disabled
                      variant="outline"
                      className="opacity-50 cursor-not-allowed rounded-r-none border-r-0"
                    >
                      <LinkIcon className="mr-2 h-4 w-4" />
                      {szotar ? 'Szótár újragenerálása' : 'Szótár készítése'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setProbaPaciensDialogOpen(true)}
                      className="rounded-l-none"
                    >
                      <User className="mr-2 h-4 w-4" />
                      Próba user
                      {hasProbaPaciens && (
                        <Badge variant="secondary" className="ml-2 bg-emerald-500/10 text-emerald-600">
                          <CheckCircle className="h-3 w-3" />
                        </Badge>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-[300px] text-right">
                    Jelenleg nincs hozzácsatolva FlexiDent fiók -{' '}
                    <Link 
                      to="/profile?openFlexi=true" 
                      className="underline text-primary hover:text-primary/80"
                    >
                      kérem csatolja hozzá fiókját itt!
                    </Link>
                  </p>
                </div>
              ) : buttonState.tooltip ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-0">
                        <Button
                          disabled
                          className="bg-gradient-to-r from-primary to-accent hover:opacity-90 opacity-50 cursor-not-allowed rounded-r-none"
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          {szotar ? 'Szótár újragenerálása' : 'Szótár készítése'}
                        </Button>
                        <Button
                          onClick={() => setProbaPaciensDialogOpen(true)}
                          className="bg-gradient-to-r from-primary to-accent hover:opacity-90 rounded-l-none border-l border-primary-foreground/20"
                        >
                          <User className="mr-2 h-4 w-4" />
                          Próba user
                          {hasProbaPaciens && (
                            <Badge variant="secondary" className="ml-2 bg-emerald-500/10 text-emerald-600">
                              <CheckCircle className="h-3 w-3" />
                            </Badge>
                          )}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p>
                        <button
                          onClick={() => setProbaPaciensDialogOpen(true)}
                          className="underline text-primary hover:text-primary/80 cursor-pointer"
                        >
                          Kérem adjon meg egy próba páciens nevet
                        </button>
                        {' '}az elengedhetetlen tesztek futtatásához.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <div className="flex items-center gap-0">
                  <Button
                    onClick={handleGenerateSzotar}
                    disabled={buttonState.disabled}
                    className="bg-gradient-to-r from-primary to-accent hover:opacity-90 rounded-r-none"
                  >
                    {generating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {szotar ? 'Szótár újragenerálása' : 'Szótár készítése'}
                  </Button>
                  <Button
                    onClick={() => setProbaPaciensDialogOpen(true)}
                    className="bg-gradient-to-r from-primary to-accent hover:opacity-90 rounded-l-none border-l border-primary-foreground/20"
                  >
                    <User className="mr-2 h-4 w-4" />
                    Próba user
                    {hasProbaPaciens && (
                      <Badge variant="secondary" className="ml-2 bg-emerald-500/10 text-emerald-600">
                        <CheckCircle className="h-3 w-3" />
                      </Badge>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </AnimatedCard>

      {/* Próba páciens info card */}
      {hasProbaPaciens && (
        <AnimatedCard>
          <CardHeader className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Próbapáciens:</span>
                <span className="font-medium">{probaPaciensNeve}</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setProbaPaciensDialogOpen(true)}
              >
                Szerkesztés
              </Button>
            </div>
          </CardHeader>
        </AnimatedCard>
      )}

      {/* Content Card */}
      {szotar && szotar.content.length > 0 ? (
        <AnimatedCard>
          <CardHeader>
            <CardTitle className="text-lg">Szótár tartalma</CardTitle>
            <CardDescription>
              Utoljára frissítve: {new Date(szotar.updated_at).toLocaleString('hu-HU')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] rounded-lg border border-primary/10 bg-muted/30">
              <div className="p-4 space-y-2">
                {szotar.content.map((item, index) => (
                  <div
                    key={index}
                    className="px-4 py-2 rounded-md bg-card border border-primary/10 text-sm hover:bg-accent/10 transition-colors"
                  >
                    {typeof item === 'string' ? item : JSON.stringify(item)}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </AnimatedCard>
      ) : !szotar ? (
        <AnimatedCard>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Book className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground text-center">
              Még nincs szótár létrehozva ehhez a telephelyhez.
              <br />
              Kattintson a "Szótár készítése" gombra a létrehozáshoz.
            </p>
          </CardContent>
        </AnimatedCard>
      ) : null}

      {/* Próba páciens dialog */}
      <ProbaPaciensDialog
        open={probaPaciensDialogOpen}
        onOpenChange={setProbaPaciensDialogOpen}
        telephelyId={telephelyId}
        currentName={probaPaciensNeve}
        onSaved={handleProbaPaciensSaved}
      />
    </div>
  );
}
