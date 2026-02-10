import { useState, useEffect, useCallback, useMemo } from 'react';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CreditCard, Users, Minus, Plus, ExternalLink, RefreshCw, Check,
  Calendar, TrendingUp, Clock, Zap, ArrowRightLeft, AlertCircle,
  CheckCircle2, XCircle, Receipt, Copy, ShieldCheck, User
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { GalaxyButton } from '@/components/klinika/GalaxyButton';
import { cn } from '@/lib/utils';

const MONTHLY_PRICE_ID = "price_1Sz1XkDG9IVOU80stgzB49Nq";
const YEARLY_PRICE_ID = "price_1SzFbZDG9IVOU80soy18oPwM";

interface CompanySubscription {
  subscription_status: string;
  subscription_price_id: string | null;
  seats: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_item_id: string | null;
}

interface StripeEvent {
  id: string;
  event_id: string;
  event_type: string;
  processed_at: string | null;
  livemode: boolean;
}

interface StripePriceInfo {
  price_id: string;
  unit_amount: number | null;
  currency: string;
  interval: string;
}

interface License {
  id: string;
  assigned_user_id: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
}

interface KlinikaUser {
  id: string;
  email: string;
  full_name: string | null;
}

interface ElofizetesTabProps {
  companyId: string | null;
  companyName: string | null;
  users?: KlinikaUser[];
}

// ─── Event helpers ─────────────────────────────────────────────
function eventLabel(type: string): string {
  const map: Record<string, string> = {
    'checkout.session.completed': 'Előfizetés elindítva',
    'customer.subscription.updated': 'Előfizetés módosítva',
    'customer.subscription.deleted': 'Előfizetés törölve',
    'invoice.payment_succeeded': 'Fizetés sikeres',
    'invoice.payment_failed': 'Fizetés sikertelen',
  };
  return map[type] || type;
}

function eventIcon(type: string) {
  if (type.includes('payment_failed')) return <XCircle className="h-4 w-4 text-destructive" />;
  if (type.includes('payment_succeeded')) return <CheckCircle2 className="h-4 w-4 text-accent" />;
  if (type.includes('deleted')) return <AlertCircle className="h-4 w-4 text-destructive" />;
  if (type.includes('checkout')) return <Zap className="h-4 w-4 text-accent" />;
  return <ArrowRightLeft className="h-4 w-4 text-primary" />;
}

function eventBadgeVariant(type: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (type.includes('failed') || type.includes('deleted')) return 'destructive';
  if (type.includes('succeeded') || type.includes('checkout')) return 'default';
  return 'secondary';
}

function formatPrice(amount: number | null, currency: string): string {
  if (amount === null) return '–';
  const value = amount / 100;
  if (currency === 'huf') return `${value.toLocaleString('hu-HU')} Ft`;
  return `${value.toLocaleString('hu-HU')} ${currency.toUpperCase()}`;
}

// ─── Main component ────────────────────────────────────────────
export function ElofizetesTab({ companyId, companyName, users: klinikaUsers = [] }: ElofizetesTabProps) {
  const [searchParams] = useSearchParams();
  const [company, setCompany] = useState<CompanySubscription | null>(null);
  const [events, setEvents] = useState<StripeEvent[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [prices, setPrices] = useState<{ monthly: StripePriceInfo | null; yearly: StripePriceInfo | null }>({ monthly: null, yearly: null });
  const [pricesLoading, setPricesLoading] = useState(true);
  const [pricesError, setPricesError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [seatCount, setSeatCount] = useState(1);
  const [addSeats, setAddSeats] = useState(1);
  const [polling, setPolling] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [subTab, setSubTab] = useState<'manage' | 'history' | 'licenses'>('manage');

  // ─── Data fetching ──────────────────────────────────────────
  const fetchCompany = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('companies')
      .select('subscription_status, subscription_price_id, seats, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_item_id')
      .eq('id', companyId)
      .single();
    if (!error && data) setCompany(data as CompanySubscription);
    setLoading(false);
  }, [companyId]);

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from('stripe_events')
      .select('*')
      .order('processed_at', { ascending: false })
      .limit(50);
    if (data) setEvents(data as StripeEvent[]);
  }, []);

  const fetchLicenses = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('licenses')
      .select('id, assigned_user_id, status, expires_at, created_at')
      .eq('company_id', companyId)
      .in('status', ['available', 'assigned'])
      .order('created_at', { ascending: true });
    if (data) setLicenses(data as License[]);
  }, [companyId]);

  const fetchPrices = useCallback(async () => {
    setPricesLoading(true);
    setPricesError(false);
    try {
      const { data, error } = await supabase.functions.invoke('get-prices');
      if (error) throw error;
      if (data?.monthly && data?.yearly) {
        setPrices({ monthly: data.monthly, yearly: data.yearly });
      } else {
        setPricesError(true);
      }
    } catch {
      setPricesError(true);
    } finally {
      setPricesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompany();
    fetchEvents();
    fetchLicenses();
    fetchPrices();
  }, [fetchCompany, fetchEvents, fetchLicenses, fetchPrices]);

  // ─── Poll after checkout ────────────────────────────────────
  const startPolling = useCallback(() => {
    if (!companyId) return;
    setPolling(true);
    setPollingTimedOut(false);
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('companies')
          .select('subscription_status')
          .eq('id', companyId)
          .single();
        if (data?.subscription_status === 'active') {
          setPolling(false);
          clearInterval(interval);
          clearTimeout(timeout);
          fetchCompany();
          fetchEvents();
          fetchLicenses();
          toast.success('Előfizetés aktiválva!');
        }
      } catch (err) {
        console.error('[ElofizetesTab] Polling error:', err);
      }
    }, 3000);
    const timeout = setTimeout(() => {
      setPolling(false);
      setPollingTimedOut(true);
      clearInterval(interval);
    }, 60000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [companyId, fetchCompany, fetchEvents, fetchLicenses]);

  useEffect(() => {
    if (searchParams.get('checkout') !== 'success') return;
    const cleanup = startPolling();
    return cleanup;
  }, [searchParams, startPolling]);

  // ─── Edge function helper ───────────────────────────────────
  async function invokeFunction(name: string, body: Record<string, unknown>) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Nincs érvényes munkamenet. Kérjük, jelentkezzen be újra.');

    const startTime = Date.now();
    const { data, error } = await supabase.functions.invoke(name, {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });

    if (import.meta.env.DEV) {
      console.debug(`[ElofizetesTab] ${name}`, {
        duration: Date.now() - startTime,
        error: error?.message,
        data,
      });
    }

    if (error) {
      const msg = typeof error === 'object' && 'message' in error ? error.message : String(error);
      throw new Error(msg);
    }
    return data;
  }

  // ─── Actions ────────────────────────────────────────────────
  async function handleCheckout() {
    if (!companyId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const priceId = selectedPlan === 'monthly' ? MONTHLY_PRICE_ID : YEARLY_PRICE_ID;
      const data = await invokeFunction('create-checkout-session', {
        company_id: companyId, price_id: priceId, seats: seatCount,
      });
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Nem sikerült a fizetési munkamenet létrehozása – nincs URL.');
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Ismeretlen hiba történt.';
      setActionError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUpdateSeats(newSeats: number) {
    if (!companyId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await invokeFunction('update-seats', { company_id: companyId, new_seats: newSeats });
      toast.success(`Licence szám frissítve: ${newSeats}`);
      fetchCompany();
      fetchEvents();
      fetchLicenses();
    } catch (err: any) {
      const errorMsg = err?.message || 'Hiba történt.';
      setActionError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBuyMoreSeats() {
    if (!companyId || !company) return;
    const newTotal = company.seats + addSeats;
    await handleUpdateSeats(newTotal);
    setAddSeats(1);
  }

  async function handleSwitchPlan() {
    if (!companyId || !company) return;
    const newPriceId = company.subscription_price_id === MONTHLY_PRICE_ID ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID;
    setActionLoading(true);
    setActionError(null);
    try {
      await invokeFunction('switch-plan', { company_id: companyId, new_price_id: newPriceId });
      toast.success('Csomag váltás sikeres!');
      fetchCompany();
      fetchEvents();
    } catch (err: any) {
      const errorMsg = err?.message || 'Hiba történt.';
      setActionError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePortal() {
    if (!companyId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const data = await invokeFunction('create-portal-session', { company_id: companyId });
      if (data?.url) window.location.href = data.url;
      else throw new Error('Nem sikerült megnyitni a számlázási portált.');
    } catch (err: any) {
      const errorMsg = err?.message || 'Hiba történt.';
      setActionError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setActionLoading(false);
    }
  }

  function copyDebugInfo() {
    const info = {
      companyId,
      subscription_status: company?.subscription_status,
      stripe_customer_id: company?.stripe_customer_id,
      seats: company?.seats,
      error: actionError,
      timestamp: new Date().toISOString(),
    };
    navigator.clipboard.writeText(JSON.stringify(info, null, 2));
    toast.success('Debug info másolva a vágólapra.');
  }

  // ─── Derived state ──────────────────────────────────────────
  const isActive = company?.subscription_status === 'active';
  const isPastDue = company?.subscription_status === 'past_due';
  const hasSubscription = isActive || isPastDue;
  const currentPlanLabel = company?.subscription_price_id === YEARLY_PRICE_ID ? 'Éves' : 'Havi';
  const otherPlanLabel = company?.subscription_price_id === YEARLY_PRICE_ID ? 'Havi' : 'Éves';

  const userNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    klinikaUsers.forEach((u) => {
      map[u.id] = u.full_name || u.email;
    });
    return map;
  }, [klinikaUsers]);

  const assignedLicenses = licenses.filter(l => l.status === 'assigned');
  const availableLicenses = licenses.filter(l => l.status === 'available');

  const currentPrice = useMemo(() => {
    const p = selectedPlan === 'monthly' ? prices.monthly : prices.yearly;
    return p?.unit_amount ?? null;
  }, [selectedPlan, prices]);

  const estimatedTotal = useMemo(() => {
    if (currentPrice === null) return '–';
    const total = (currentPrice / 100) * seatCount;
    return total.toLocaleString('hu-HU');
  }, [currentPrice, seatCount]);

  const periodLabel = selectedPlan === 'monthly' ? '/ hó' : '/ év';

  // ─── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <AnimatedCard>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </AnimatedCard>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Polling banner */}
      {polling && (
        <AnimatedCard className="border-accent/40">
          <CardContent className="flex items-center gap-3 py-2.5 px-4">
            <RefreshCw className="h-4 w-4 text-accent animate-spin" />
            <p className="text-sm text-muted-foreground">Fizetés feldolgozás alatt… kérjük, várjon.</p>
          </CardContent>
        </AnimatedCard>
      )}

      {/* Polling timeout banner */}
      {pollingTimedOut && (
        <AnimatedCard className="border-destructive/40">
          <CardContent className="flex flex-col gap-2 py-3 px-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">Nem érkezett meg a fizetés visszaigazolása</p>
                <p className="text-xs text-muted-foreground">
                  Kérjük, próbálja újra egy perc múlva, vagy frissítse az oldalt.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-7">
              <Button variant="outline" size="sm" onClick={() => startPolling()} className="h-7 text-xs">
                <RefreshCw className="h-3 w-3 mr-1.5" /> Újrapróbálás
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.location.reload()} className="h-7 text-xs">
                Oldal frissítése
              </Button>
              <Button variant="ghost" size="sm" onClick={copyDebugInfo} className="h-7 text-xs">
                <Copy className="h-3 w-3 mr-1.5" /> Debug info
              </Button>
            </div>
          </CardContent>
        </AnimatedCard>
      )}

      {/* Error banner */}
      {actionError && (
        <AnimatedCard className="border-destructive/40">
          <CardContent className="flex items-center justify-between gap-3 py-2.5 px-4">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive truncate">{actionError}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="ghost" size="sm" onClick={copyDebugInfo} className="h-7 text-xs">
                <Copy className="h-3 w-3 mr-1" /> Debug
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setActionError(null)} className="h-7 text-xs">
                ✕
              </Button>
            </div>
          </CardContent>
        </AnimatedCard>
      )}

      {/* ═══ Compact Dashboard Header ═══ */}
      <AnimatedCard className="overflow-hidden">
        <div className="relative p-4">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
          <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricTile
              icon={<Users className="h-3.5 w-3.5" />}
              label="Licencek"
              value={hasSubscription ? String(company?.seats ?? 0) : '–'}
              subtitle={hasSubscription ? `${assignedLicenses.length} kiosztva · ${availableLicenses.length} szabad` : undefined}
              accent
            />
            <MetricTile
              icon={<CreditCard className="h-3.5 w-3.5" />}
              label="Csomag"
              value={hasSubscription ? currentPlanLabel : 'Nincs'}
            />
            <div className="flex flex-col gap-1 rounded-lg border border-primary/10 dark:border-sparkle-blue/10 bg-card/50 p-2.5 transition-colors duration-200">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Zap className="h-3 w-3" /> Státusz
              </span>
              <Badge
                variant={isActive ? 'default' : isPastDue ? 'destructive' : 'secondary'}
                className={cn("w-fit text-[11px]", isActive && "bg-accent/20 text-accent border-accent/30")}
              >
                {isActive ? 'Aktív' : isPastDue ? 'Lejárt fizetés' : 'Inaktív'}
              </Badge>
            </div>
            <MetricTile
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Megújítás"
              value={
                company?.current_period_end
                  ? new Date(company.current_period_end).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })
                  : '–'
              }
            />
          </div>
        </div>
      </AnimatedCard>

      {/* ═══ Sub-tabs: Manage / Licenses / History ═══ */}
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as 'manage' | 'history' | 'licenses')} className="space-y-3">
        <TabsList className="bg-card/60 backdrop-blur-sm border border-primary/15 dark:border-sparkle-blue/15 p-0.5 h-8">
          <TabsTrigger value="manage" className="text-xs h-7 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all duration-200">
            <CreditCard className="h-3.5 w-3.5 mr-1.5" /> Kezelés
          </TabsTrigger>
          <TabsTrigger value="licenses" className="text-xs h-7 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all duration-200">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Licencek
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs h-7 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all duration-200">
            <Receipt className="h-3.5 w-3.5 mr-1.5" /> Előzmények
          </TabsTrigger>
        </TabsList>

        {/* ─── Manage tab ─── */}
        <TabsContent value="manage" className="mt-0 space-y-4">
          {hasSubscription && company ? (
            <div className="space-y-4">
              {/* Buy more licenses */}
              <AnimatedCard>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Plus className="h-4 w-4 text-accent" /> Licenc vásárlás
                  </CardTitle>
                  <CardDescription className="text-xs">Jelenlegi licencek: <strong>{company.seats}</strong></CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon"
                      className="h-8 w-8 border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 active:scale-95"
                      disabled={actionLoading || addSeats <= 1}
                      onClick={() => setAddSeats(s => Math.max(1, s - 1))}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-2xl font-bold min-w-[2.5rem] text-center bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent tabular-nums">
                      +{addSeats}
                    </span>
                    <Button variant="outline" size="icon"
                      className="h-8 w-8 border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 active:scale-95"
                      disabled={actionLoading || (company.seats + addSeats) >= 500}
                      onClick={() => setAddSeats(s => Math.min(500 - company.seats, s + 1))}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <GalaxyButton onClick={handleBuyMoreSeats} disabled={actionLoading} className="ml-auto h-9 px-4 text-sm">
                      {actionLoading ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1.5" />}
                      Vásárlás ({company.seats + addSeats} összesen)
                    </GalaxyButton>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Az arányos elszámolás automatikusan történik.
                  </p>
                </CardContent>
              </AnimatedCard>

              {/* License table with plan type and switch */}
              <AnimatedCard>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4 text-accent" /> Licencek és csomag
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Összes licenc a jelenlegi csomagtípussal
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Felhasználó</TableHead>
                        <TableHead className="text-xs">Állapot</TableHead>
                        <TableHead className="text-xs">Csomag</TableHead>
                        <TableHead className="text-xs">Lejárat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {licenses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-sm">
                            Még nincs licenc.
                          </TableCell>
                        </TableRow>
                      ) : (
                        licenses.map((lic) => (
                          <TableRow key={lic.id}>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-2">
                                <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                                  {lic.status === 'assigned'
                                    ? <User className="h-3 w-3 text-accent" />
                                    : <ShieldCheck className="h-3 w-3 text-muted-foreground" />}
                                </div>
                                <span className="truncate max-w-[160px]">
                                  {lic.assigned_user_id
                                    ? (userNameMap[lic.assigned_user_id] || lic.assigned_user_id.slice(0, 8) + '…')
                                    : <span className="text-muted-foreground italic">Szabad</span>}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={lic.status === 'assigned' ? 'default' : 'secondary'} className="text-[10px] h-5 px-1.5">
                                {lic.status === 'assigned' ? 'Kiosztva' : 'Szabad'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                                {currentPlanLabel}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {lic.expires_at
                                ? new Date(lic.expires_at).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })
                                : '–'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  {/* Global plan switch */}
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Jelenlegi csomag: </span>
                      <strong className="text-foreground">{currentPlanLabel}</strong>
                    </div>
                    <GalaxyButton onClick={handleSwitchPlan} disabled={actionLoading} className="h-8 px-3 text-xs">
                      {actionLoading ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />}
                      Váltás {otherPlanLabel} csomagra
                    </GalaxyButton>
                  </div>
                </CardContent>
              </AnimatedCard>

              {/* Portal link */}
              <AnimatedCard>
                <CardContent className="flex items-center justify-between py-2.5 px-4">
                  <div>
                    <p className="text-sm font-medium">Stripe számlázási portál</p>
                    <p className="text-[11px] text-muted-foreground">Számlák, fizetési mód, lemondás</p>
                  </div>
                  <Button onClick={handlePortal} disabled={actionLoading} variant="outline" size="sm"
                    className="h-8 border-primary/20 hover:bg-primary/10 transition-all duration-200">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Megnyitás
                  </Button>
                </CardContent>
              </AnimatedCard>
            </div>
          ) : !polling ? (
            /* New subscription flow */
            <div className="space-y-4">
              {/* Plan cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <PlanCard
                  title="Havi"
                  description="Rugalmas, havi elszámolás"
                  price={pricesLoading ? '...' : prices.monthly ? formatPrice(prices.monthly.unit_amount, prices.monthly.currency) : '–'}
                  period="/ hó / licenc"
                  selected={selectedPlan === 'monthly'}
                  onClick={() => setSelectedPlan('monthly')}
                />
                <PlanCard
                  title="Éves"
                  description="Kedvezményes éves elszámolás"
                  price={pricesLoading ? '...' : prices.yearly ? formatPrice(prices.yearly.unit_amount, prices.yearly.currency) : '–'}
                  period="/ év / licenc"
                  selected={selectedPlan === 'yearly'}
                  badge="Kedvezményes"
                  onClick={() => setSelectedPlan('yearly')}
                />
              </div>

              {pricesError && (
                <AnimatedCard className="border-destructive/30">
                  <CardContent className="flex items-center justify-between py-2.5 px-4">
                    <p className="text-sm text-muted-foreground">Nem sikerült betölteni az árakat.</p>
                    <Button variant="ghost" size="sm" onClick={fetchPrices} className="h-7 text-xs">
                      <RefreshCw className="h-3 w-3 mr-1" /> Újra
                    </Button>
                  </CardContent>
                </AnimatedCard>
              )}

              {/* Seat selector */}
              <AnimatedCard>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4 text-accent" /> Licencek száma
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon"
                      className="h-9 w-9 border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 active:scale-95"
                      disabled={seatCount <= 1}
                      onClick={() => setSeatCount((s) => Math.max(1, s - 1))}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-3xl font-bold min-w-[3rem] text-center bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent tabular-nums">
                      {seatCount}
                    </span>
                    <Button variant="outline" size="icon"
                      className="h-9 w-9 border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 active:scale-95"
                      disabled={seatCount >= 500}
                      onClick={() => setSeatCount((s) => Math.min(500, s + 1))}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Estimated total */}
                  <div className="flex items-center justify-between rounded-lg border border-primary/10 dark:border-sparkle-blue/10 bg-primary/5 dark:bg-primary/10 px-3 py-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3" /> Becsült összeg
                    </span>
                    <span className="text-base font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent tabular-nums">
                      {estimatedTotal} {prices.monthly?.currency === 'huf' || !prices.monthly ? 'Ft' : prices.monthly.currency.toUpperCase()} <span className="text-[11px] font-normal text-muted-foreground">{periodLabel}</span>
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    A licencszám később bármikor módosítható, arányos elszámolással.
                  </p>
                </CardContent>
              </AnimatedCard>

              {/* CTA */}
              <GalaxyButton
                className="w-full h-10 text-sm"
                onClick={handleCheckout}
                disabled={actionLoading || pricesLoading}
              >
                {actionLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Előfizetés indítása
              </GalaxyButton>
            </div>
          ) : null}
        </TabsContent>

        {/* ─── Licenses tab ─── */}
        <TabsContent value="licenses" className="mt-0">
          <AnimatedCard>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-accent" /> Licencek ({licenses.length})
              </CardTitle>
              <CardDescription className="text-xs">
                {assignedLicenses.length} kiosztva · {availableLicenses.length} szabad
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {licenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <ShieldCheck className="h-7 w-7 mb-2 opacity-40" />
                  <p className="text-sm">Még nincs licenc.</p>
                </div>
              ) : (
                <ScrollArea className="h-[220px]">
                  <div className="divide-y divide-border/50">
                    {licenses.map((lic) => (
                      <div key={lic.id} className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-200 hover:bg-primary/5 dark:hover:bg-primary/10">
                        <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
                          {lic.status === 'assigned' ? (
                            <User className="h-3.5 w-3.5 text-accent" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {lic.assigned_user_id
                              ? (userNameMap[lic.assigned_user_id] || lic.assigned_user_id.slice(0, 8) + '…')
                              : 'Szabad licenc'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {lic.expires_at
                              ? `Lejárat: ${new Date(lic.expires_at).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}`
                              : '–'}
                          </p>
                        </div>
                        <Badge variant={lic.status === 'assigned' ? 'default' : 'secondary'} className="text-[10px] h-5 px-1.5 flex-shrink-0">
                          {lic.status === 'assigned' ? 'Kiosztva' : 'Szabad'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </AnimatedCard>
        </TabsContent>

        {/* ─── History tab ─── */}
        <TabsContent value="history" className="mt-0">
          <AnimatedCard>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-accent" /> Számlázási előzmények
              </CardTitle>
              <CardDescription className="text-xs">Legutóbbi Stripe események</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Receipt className="h-7 w-7 mb-2 opacity-40" />
                  <p className="text-sm">Még nincs számlázási esemény.</p>
                </div>
              ) : (
                <ScrollArea className="h-[220px]">
                  <div className="divide-y divide-border/50">
                    {events.map((ev) => (
                      <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-200 hover:bg-primary/5 dark:hover:bg-primary/10">
                        <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
                          {eventIcon(ev.event_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{eventLabel(ev.event_type)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {ev.processed_at
                              ? new Date(ev.processed_at).toLocaleString('hu-HU', {
                                  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
                                })
                              : '–'}
                          </p>
                        </div>
                        <Badge variant={eventBadgeVariant(ev.event_type)} className="text-[10px] h-5 px-1.5 flex-shrink-0">
                          {ev.event_type.includes('succeeded') ? 'OK' :
                           ev.event_type.includes('failed') ? 'Hiba' :
                           ev.event_type.includes('deleted') ? 'Törölve' :
                           ev.event_type.includes('checkout') ? 'Új' : 'Módosítás'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </AnimatedCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────

function MetricTile({ icon, label, value, subtitle, accent }: {
  icon: React.ReactNode; label: string; value: string; subtitle?: string; accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-primary/10 dark:border-sparkle-blue/10 bg-card/50 p-2.5 transition-colors duration-200">
      <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </span>
      <span className={cn(
        "text-lg font-bold tabular-nums",
        accent ? "bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent" : "text-foreground",
      )}>
        {value}
      </span>
      {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
    </div>
  );
}

function PlanCard({ title, description, price, period, selected, badge, onClick }: {
  title: string; description: string; price: string; period: string;
  selected: boolean; badge?: string; onClick: () => void;
}) {
  return (
    <AnimatedCard
      className={cn(
        "cursor-pointer transition-all duration-300 relative overflow-hidden",
        selected
          ? "ring-2 ring-primary/60 border-primary/40 glow-purple"
          : "hover:border-primary/30 hover:shadow-md",
      )}
      onClick={onClick}
    >
      {selected && (
        <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center animate-scale-in">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}
      {badge && (
        <div className="absolute top-2.5 left-2.5">
          <Badge variant="secondary" className="text-[10px] bg-accent/15 text-accent border-accent/20">
            {badge}
          </Badge>
        </div>
      )}
      <CardHeader className={cn("pb-1 pt-4", badge && "pt-9")}>
        <CardTitle className="text-base">
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{title}</span>
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-foreground">{price}</span>
          <span className="text-xs text-muted-foreground">{period}</span>
        </div>
      </CardContent>
    </AnimatedCard>
  );
}
