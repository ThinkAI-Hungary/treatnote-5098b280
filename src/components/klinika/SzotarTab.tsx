import { useState, useEffect, useCallback, useMemo } from 'react';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Book, RefreshCw, Loader2, CheckCircle, AlertCircle, User, Globe, Search, X, ChevronDown, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFlexiConnection } from '@/hooks/useFlexiConnection';
import { toast } from 'sonner';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { Link, useSearchParams } from 'react-router-dom';
import { ProbaPaciensDialog } from '@/components/klinika/ProbaPaciensDialog';
import { DomainDialog } from '@/components/klinika/DomainDialog';
import { subscribeToTelephelyChanges } from '@/lib/telephelyEvents';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

interface SzotarKezelesData {
  id: string;
  telephely_id: string;
  name: string;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export function SzotarTab({ companyId, telephelyId, companyName, telephelyName }: SzotarTabProps) {
  const { user } = useAuth();
  const { isConnected: isFlexiConnected, isLoading: flexiLoading } = useFlexiConnection();
  const [szotar, setSzotar] = useState<SzotarData | null>(null);
  const [szotarKezelesek, setSzotarKezelesek] = useState<SzotarKezelesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [probaPaciensNeve, setProbaPaciensNeve] = useState<string | null>(null);
  const [flexiDomain, setFlexiDomain] = useState<string | null>(null);
  const [probaPaciensDialogOpen, setProbaPaciensDialogOpen] = useState(false);
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Check if we should open the dialog from URL params
  useEffect(() => {
    if (searchParams.get('openProba') === 'true') {
      setProbaPaciensDialogOpen(true);
      // Remove the param after opening
      searchParams.delete('openProba');
      setSearchParams(searchParams, { replace: true });
    }
    if (searchParams.get('openDomain') === 'true') {
      setDomainDialogOpen(true);
      searchParams.delete('openDomain');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const hasProbaPaciens = !!probaPaciensNeve;
  const hasFlexiDomain = !!flexiDomain;

  const loadSzotar = useCallback(async () => {
    if (!telephelyId) {
      setLoading(false);
      return;
    }

    try {
      // Fetch szotar data and szotar_kezelesek in parallel
      const [szotarResult, kezelesekResult, telephelyResult] = await Promise.all([
        supabase
          .from('szotar')
          .select('*')
          .eq('telephely_id', telephelyId)
          .maybeSingle(),
        supabase
          .from('szotar_kezelesek')
          .select('*')
          .eq('telephely_id', telephelyId)
          .order('category', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true }),
        supabase
          .from('telephely')
          .select('probapaciens_neve, flexi_domain')
          .eq('id', telephelyId)
          .maybeSingle(),
      ]);

      if (szotarResult.error) {
        console.error('Error loading szotar:', szotarResult.error);
        toast.error('Hiba a szótár betöltésekor');
      } else if (szotarResult.data) {
        const content = Array.isArray(szotarResult.data.content) 
          ? szotarResult.data.content as string[]
          : typeof szotarResult.data.content === 'string' 
            ? [szotarResult.data.content]
            : [];
        setSzotar({
          ...szotarResult.data,
          content,
        });
      } else {
        setSzotar(null);
      }

      if (kezelesekResult.error) {
        console.error('Error loading szotar_kezelesek:', kezelesekResult.error);
      } else {
        setSzotarKezelesek(kezelesekResult.data || []);
      }

      if (telephelyResult.error) {
        console.error('Error loading telephely:', telephelyResult.error);
      } else {
        setProbaPaciensNeve(telephelyResult.data?.probapaciens_neve || null);
        setFlexiDomain(telephelyResult.data?.flexi_domain || null);
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

  // Listen for telephely data changes from other components
  useEffect(() => {
    const unsubscribe = subscribeToTelephelyChanges(() => {
      loadSzotar();
    });
    return unsubscribe;
  }, [loadSzotar]);

  // Real-time subscription for szotar_kezelesek changes
  useEffect(() => {
    if (!telephelyId) return;

    const channel = supabase
      .channel(`szotar_kezelesek_${telephelyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'szotar_kezelesek',
          filter: `telephely_id=eq.${telephelyId}`,
        },
        () => {
          // Reload data when any change occurs
          loadSzotar();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [telephelyId, loadSzotar]);

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

  const handleDomainSaved = (domain: string) => {
    setFlexiDomain(domain);
  };

  // Determine button state and tooltip - check in order: Domain → Flexi → ProbaPaciens
  const getButtonState = () => {
    // 1. Check Domain first
    if (!hasFlexiDomain) {
      return {
        disabled: true,
        tooltip: 'Kérem állítsa be a klinika FlexiDent domain-jét a folytatáshoz.',
        showDomainWarning: true,
        showFlexiWarning: false,
      };
    }
    // 2. Check Flexi second
    if (!isFlexiConnected && !flexiLoading) {
      return {
        disabled: true,
        tooltip: null,
        showDomainWarning: false,
        showFlexiWarning: true,
      };
    }
    // 3. Check ProbaPaciens third
    if (!hasProbaPaciens) {
      return {
        disabled: true,
        tooltip: 'Kérem adjon meg egy próba páciens nevet az elengedhetetlen tesztek futtatásához.',
        showDomainWarning: false,
        showFlexiWarning: false,
      };
    }
    return {
      disabled: generating || flexiLoading,
      tooltip: null,
      showDomainWarning: false,
      showFlexiWarning: false,
    };
  };

  const buttonState = getButtonState();

  // Determine if we're in a disabled/warning state for uniform styling
  const isInWarningState = buttonState.showDomainWarning || buttonState.showFlexiWarning || buttonState.tooltip;

  // Determine if szotar exists based on szotar_kezelesek having records
  const hasSzotar = szotarKezelesek.length > 0;

  // Get unique categories for filter - MUST be before early return
  const uniqueCategories = useMemo(() => {
    const categories = szotarKezelesek
      .map(k => k.category)
      .filter((c): c is string => !!c);
    return [...new Set(categories)].sort();
  }, [szotarKezelesek]);

  // Filter szotarKezelesek based on search query and selected categories - MUST be before early return
  const filteredKezelesek = useMemo(() => {
    return szotarKezelesek.filter(kezeles => {
      // Search filter - check name
      const matchesSearch = searchQuery === '' || 
        kezeles.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Category filter - if no categories selected, show all
      const matchesCategory = selectedCategories.length === 0 || 
        (kezeles.category && selectedCategories.includes(kezeles.category));
      
      return matchesSearch && matchesCategory;
    });
  }, [szotarKezelesek, searchQuery, selectedCategories]);

  // Toggle category selection
  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategories([]);
  };

  if (loading) {
    return (
      <AnimatedCard>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </AnimatedCard>
    );
  }

  // Render buttons with uniform styling based on warning state
  const renderActionButtons = () => {
    const buttonBaseClass = isInWarningState
      ? "opacity-50 cursor-not-allowed"
      : "";
    
    const szotarButtonContent = (
      <>
        {generating ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        {hasSzotar ? 'Szótár újragenerálása' : 'Szótár készítése'}
      </>
    );

    const probaButtonContent = (
      <>
        <User className="mr-2 h-4 w-4" />
        Próba user
        {hasProbaPaciens && (
          <Badge variant="secondary" className="ml-2 bg-emerald-500/10 text-emerald-600">
            <CheckCircle className="h-3 w-3" />
          </Badge>
        )}
      </>
    );

    const domainButtonContent = (
      <>
        <Globe className="mr-2 h-4 w-4" />
        Domain
        {hasFlexiDomain && (
          <Badge variant="secondary" className="ml-2 bg-emerald-500/10 text-emerald-600">
            <CheckCircle className="h-3 w-3" />
          </Badge>
        )}
      </>
    );

    // If in warning state, show with tooltip
    if (isInWarningState) {
      const tooltipContent = buttonState.showDomainWarning ? (
        <p>
          <button
            onClick={() => setDomainDialogOpen(true)}
            className="underline text-primary hover:text-primary/80 cursor-pointer"
          >
            Kérem állítsa be a klinika FlexiDent domain-jét
          </button>
          {' '}a folytatáshoz.
        </p>
      ) : buttonState.showFlexiWarning ? (
        <p className="text-sm">
          Jelenleg nincs hozzácsatolva FlexiDent fiók -{' '}
          <Link 
            to="/profile?openFlexi=true" 
            className="underline text-primary hover:text-primary/80"
          >
            kérem csatolja hozzá fiókját itt!
          </Link>
        </p>
      ) : buttonState.tooltip ? (
        <p>
          <button
            onClick={() => setProbaPaciensDialogOpen(true)}
            className="underline text-primary hover:text-primary/80 cursor-pointer"
          >
            Kérem adjon meg egy próba páciens nevet
          </button>
          {' '}az elengedhetetlen tesztek futtatásához.
        </p>
      ) : null;

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-0">
                <Button
                  disabled
                  className={`${buttonBaseClass} rounded-r-none border-r-0 bg-gradient-to-r from-primary to-accent text-primary-foreground`}
                >
                  {szotarButtonContent}
                </Button>
                <Button
                  onClick={() => setProbaPaciensDialogOpen(true)}
                  className="rounded-none border-r-0 border-l border-primary-foreground/20 bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90"
                >
                  {probaButtonContent}
                </Button>
                <Button
                  onClick={() => setDomainDialogOpen(true)}
                  className="rounded-l-none border-l border-primary-foreground/20 bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90"
                >
                  {domainButtonContent}
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {tooltipContent}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    // Not in warning state - full functionality
    return (
      <div className="flex items-center gap-0">
        <Button
          onClick={handleGenerateSzotar}
          disabled={buttonState.disabled}
          className="bg-gradient-to-r from-primary to-accent hover:opacity-90 rounded-r-none"
        >
          {szotarButtonContent}
        </Button>
        <Button
          onClick={() => setProbaPaciensDialogOpen(true)}
          className="bg-gradient-to-r from-primary to-accent hover:opacity-90 rounded-none border-l border-primary-foreground/20"
        >
          {probaButtonContent}
        </Button>
        <Button
          onClick={() => setDomainDialogOpen(true)}
          className="bg-gradient-to-r from-primary to-accent hover:opacity-90 rounded-l-none border-l border-primary-foreground/20"
        >
          {domainButtonContent}
        </Button>
      </div>
    );
  };

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
                  {hasSzotar ? (
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
            <div className="flex flex-col items-end gap-2">
              {renderActionButtons()}
              {isInWarningState && (
                <p className="text-xs text-muted-foreground max-w-[400px] text-right">
                  {buttonState.showDomainWarning ? (
                    <>
                      Nincs beállítva FlexiDent domain -{' '}
                      <button
                        onClick={() => setDomainDialogOpen(true)}
                        className="underline text-primary hover:text-primary/80"
                      >
                        kérem állítsa be itt!
                      </button>
                    </>
                  ) : buttonState.showFlexiWarning ? (
                    <>
                      Jelenleg nincs hozzácsatolva FlexiDent fiók -{' '}
                      <Link 
                        to="/profile?openFlexi=true" 
                        className="underline text-primary hover:text-primary/80"
                      >
                        kérem csatolja hozzá fiókját itt!
                      </Link>
                    </>
                  ) : null}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
      </AnimatedCard>

      {/* Domain info card */}
      {hasFlexiDomain && (
        <AnimatedCard>
          <CardHeader className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">FlexiDent domain:</span>
                <span className="font-medium">{flexiDomain}.flexi-dent.hu</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setDomainDialogOpen(true)}
              >
                Szerkesztés
              </Button>
            </div>
          </CardHeader>
        </AnimatedCard>
      )}

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

      {/* Content Card - Show szotar_kezelesek */}
      {hasSzotar ? (
        <AnimatedCard>
          <CardHeader>
            <CardTitle className="text-lg">Szótár kezelések</CardTitle>
            <CardDescription>
              {filteredKezelesek.length} / {szotarKezelesek.length} kezelés megjelenítve
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search and Filter Bar */}
            <div className="space-y-3">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Keresés a kezelések között..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 border-primary/20 focus:border-primary/40"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              
              {/* Category Filter Dropdown */}
              {uniqueCategories.length > 0 && (
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-primary/20 hover:bg-primary/10 bg-card h-8"
                      >
                        Kategória
                        {selectedCategories.length > 0 && (
                          <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary h-5 text-xs">
                            {selectedCategories.length}
                          </Badge>
                        )}
                        <ChevronDown className="ml-2 h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      className="w-48 bg-popover border border-border shadow-lg z-50 p-0"
                      align="start"
                    >
                      <div className="p-2 border-b border-border">
                        <span className="text-xs font-medium text-muted-foreground">Kategória szűrő</span>
                      </div>
                      <ScrollArea className="h-[250px]">
                        <div className="p-1">
                          {uniqueCategories.map((category) => (
                            <DropdownMenuCheckboxItem
                              key={category}
                              checked={selectedCategories.includes(category)}
                              onCheckedChange={() => toggleCategory(category)}
                              className="text-sm"
                            >
                              {category}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </div>
                      </ScrollArea>
                      {selectedCategories.length > 0 && (
                        <div className="border-t border-border p-1">
                          <DropdownMenuCheckboxItem
                            checked={false}
                            onCheckedChange={clearFilters}
                            className="text-muted-foreground text-sm"
                          >
                            <X className="mr-2 h-3 w-3" />
                            Szűrők törlése
                          </DropdownMenuCheckboxItem>
                        </div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  {/* Show selected categories as badges */}
                  {selectedCategories.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      {selectedCategories.map((category) => (
                        <Badge
                          key={category}
                          variant="default"
                          className="bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 h-6 text-xs"
                          onClick={() => toggleCategory(category)}
                        >
                          {category}
                          <X className="ml-1 h-3 w-3" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <ScrollArea className="h-[400px] rounded-lg border border-primary/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kezelés neve</TableHead>
                    <TableHead>Kategória</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKezelesek.length > 0 ? (
                    filteredKezelesek.map((kezeles) => (
                      <TableRow key={kezeles.id}>
                        <TableCell className="font-medium">{kezeles.name}</TableCell>
                        <TableCell>
                          {kezeles.category ? (
                            <Badge variant="secondary" className="bg-primary/10 text-primary">
                              {kezeles.category}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                        Nincs találat a keresési feltételeknek megfelelően
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </AnimatedCard>
      ) : (
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
      )}

      {/* Próba páciens dialog */}
      <ProbaPaciensDialog
        open={probaPaciensDialogOpen}
        onOpenChange={setProbaPaciensDialogOpen}
        telephelyId={telephelyId}
        currentName={probaPaciensNeve}
        onSaved={handleProbaPaciensSaved}
      />

      {/* Domain dialog */}
      <DomainDialog
        open={domainDialogOpen}
        onOpenChange={setDomainDialogOpen}
        telephelyId={telephelyId}
        currentDomain={flexiDomain}
        onSaved={handleDomainSaved}
      />
    </div>
  );
}
