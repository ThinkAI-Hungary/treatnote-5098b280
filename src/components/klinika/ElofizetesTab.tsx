import { useState, useEffect, useCallback, useMemo } from 'react';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CreditCard, Users, Minus, Plus, ExternalLink, RefreshCw, Check,
  Calendar, TrendingUp, Clock, Zap, ArrowRightLeft, AlertCircle,
  CheckCircle2, XCircle, Receipt
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { GalaxyButton } from '@/components/klinika/GalaxyButton';
import { cn } from '@/lib/utils';

const MONTHLY_PRICE_ID = "price_1Sz1XkDG9IVOU80stgzB49Nq";
const YEARLY_PRICE_ID = "price_1SzFbZDG9IVOU80soy18oPwM";

const MONTHLY_PRICE = 4990; // HUF per seat/month
const YEARLY_PRICE = 49900; // HUF per seat/year

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

interface ElofizetesTabProps {
  companyId: string | null;
  companyName: string | null;
}

// ─── Event label / icon helpers ────────────────────────────────
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

// ─── Main component ────────────────────────────────────────────
export function ElofizetesTab({ companyId, companyName }: ElofizetesTabProps) {
  const [searchParams] = useSearchParams();
  const [company, setCompany] = useState<CompanySubscription | null>(null);
  const [events, setEvents] = useState<StripeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [seatCount, setSeatCount] = useState(1);
  const [polling, setPolling] = useState(false);
  const [subTab, setSubTab] = useState<'manage' | 'history'>('manage');

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

  useEffect(() => { fetchCompany(); fetchEvents(); }, [fetchCompany, fetchEvents]);

  // ─── Poll after checkout ────────────────────────────────────
  useEffect(() => {
    if (searchParams.get('checkout') !== 'success') return;
    setPolling(true);
    const interval = setInterval(async () => {
      if (!companyId) return;
      const { data } = await supabase
        .from('companies')
        .select('subscription_status')
        .eq('id', companyId)
        .single();
      if (data?.subscription_status === 'active') {
        setPolling(false);
        clearInterval(interval);
        fetchCompany();
        fetchEvents();
        toast.success('Előfizetés aktiválva!');
      }
    }, 3000);
    const timeout = setTimeout(() => { setPolling(false); clearInterval(interval); }, 60000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [searchParams, companyId, fetchCompany, fetchEvents]);

  // ─── Edge function helper ───────────────────────────────────
  async function invokeFunction(name: string, body: Record<string, unknown>) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const { data, error } = await supabase.functions.invoke(name, {
      body,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (error) throw error;
    return data;
  }

  // ─── Actions ────────────────────────────────────────────────
  async function handleCheckout() {
    if (!companyId) return;
    setActionLoading(true);
    try {
      const priceId = selectedPlan === 'monthly' ? MONTHLY_PRICE_ID : YEARLY_PRICE_ID;
      const data = await invokeFunction('create-checkout-session', {
        company_id: companyId, price_id: priceId, seats: seatCount,
      });
      if (data?.url) window.location.href = data.url;
      else toast.error('Nem sikerült a fizetési munkamenet létrehozása.');
    } catch (err: any) {
      toast.error(err?.message || 'Hiba történt.');
    } finally { setActionLoading(false); }
  }

  async function handleUpdateSeats(newSeats: number) {
    if (!companyId) return;
    setActionLoading(true);
    try {
      await invokeFunction('update-seats', { company_id: companyId, new_seats: newSeats });
      toast.success(`Licence szám frissítve: ${newSeats}`);
      fetchCompany(); fetchEvents();
    } catch (err: any) { toast.error(err?.message || 'Hiba történt.');
    } finally { setActionLoading(false); }
  }

  async function handleSwitchPlan() {
    if (!companyId || !company) return;
    const newPriceId = company.subscription_price_id === MONTHLY_PRICE_ID ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID;
    setActionLoading(true);
    try {
      await invokeFunction('switch-plan', { company_id: companyId, new_price_id: newPriceId });
      toast.success('Csomag váltás elindítva!');
      fetchCompany(); fetchEvents();
    } catch (err: any) { toast.error(err?.message || 'Hiba történt.');
    } finally { setActionLoading(false); }
  }

  async function handlePortal() {
    if (!companyId) return;
    setActionLoading(true);
    try {
      const data = await invokeFunction('create-portal-session', { company_id: companyId });
      if (data?.url) window.location.href = data.url;
      else toast.error('Nem sikerült megnyitni a számlázási portált.');
    } catch (err: any) { toast.error(err?.message || 'Hiba történt.');
    } finally { setActionLoading(false); }
  }

  // ─── Derived state ──────────────────────────────────────────
  const isActive = company?.subscription_status === 'active';
  const isPastDue = company?.subscription_status === 'past_due';
  const hasSubscription = isActive || isPastDue;
  const currentPlanLabel = company?.subscription_price_id === YEARLY_PRICE_ID ? 'Éves' : 'Havi';
  const otherPlanLabel = company?.subscription_price_id === YEARLY_PRICE_ID ? 'Havi' : 'Éves';

  const estimatedTotal = useMemo(() => {
    const price = selectedPlan === 'monthly' ? MONTHLY_PRICE : YEARLY_PRICE;
    return (price * seatCount).toLocaleString('hu-HU');
  }, [selectedPlan, seatCount]);

  const periodLabel = selectedPlan === 'monthly' ? '/ hó' : '/ év';

  // CTA label
  const ctaLabel = useMemo(() => {
    if (!hasSubscription) return 'Előfizetés indítása';
    // These won't be used for checkout, but for display purposes
    return 'Előfizetés indítása';
  }, [hasSubscription]);

  // ─── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <AnimatedCard>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </AnimatedCard>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Polling banner */}
      {polling && (
        <AnimatedCard className="border-accent/40">
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <RefreshCw className="h-4 w-4 text-accent animate-spin" />
            <p className="text-sm text-muted-foreground">Fizetés feldolgozás alatt… kérjük, várjon.</p>
          </CardContent>
        </AnimatedCard>
      )}

      {/* ═══ Dashboard Header ═══ */}
      <AnimatedCard className="overflow-hidden">
        <div className="relative p-5">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
          
          <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Licenses */}
            <MetricTile
              icon={<Users className="h-4 w-4" />}
              label="Licencek"
              value={hasSubscription ? String(company?.seats ?? 0) : '–'}
              accent
            />
            {/* Plan */}
            <MetricTile
              icon={<CreditCard className="h-4 w-4" />}
              label="Csomag"
              value={hasSubscription ? currentPlanLabel : 'Nincs'}
            />
            {/* Status */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-primary/10 dark:border-sparkle-blue/10 bg-card/50 p-3 transition-colors duration-200">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                Státusz
              </span>
              <Badge
                variant={isActive ? 'default' : isPastDue ? 'destructive' : 'secondary'}
                className={cn(
                  "w-fit text-xs",
                  isActive && "bg-accent/20 text-accent border-accent/30",
                )}
              >
                {isActive ? 'Aktív' : isPastDue ? 'Lejárt fizetés' : 'Inaktív'}
              </Badge>
              {company?.cancel_at_period_end && (
                <span className="text-[10px] text-destructive/70">Lemondva</span>
              )}
            </div>
            {/* Renewal */}
            <MetricTile
              icon={<Calendar className="h-4 w-4" />}
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

      {/* ═══ Sub-tabs: Manage / History ═══ */}
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as 'manage' | 'history')} className="space-y-4">
        <TabsList className="bg-card/60 backdrop-blur-sm border border-primary/15 dark:border-sparkle-blue/15 p-0.5 h-9">
          <TabsTrigger
            value="manage"
            className="text-xs h-8 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all duration-200"
          >
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            Kezelés
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="text-xs h-8 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all duration-200"
          >
            <Receipt className="h-3.5 w-3.5 mr-1.5" />
            Előzmények
          </TabsTrigger>
        </TabsList>

        {/* ─── Manage tab ─── */}
        <TabsContent value="manage" className="mt-0 space-y-5">
          {hasSubscription && company ? (
            /* Active subscription management */
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Seat management */}
                <AnimatedCard>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-accent" />
                      Licencek kezelése
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline" size="icon"
                        className="h-9 w-9 border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 active:scale-95"
                        disabled={actionLoading || company.seats <= 1}
                        onClick={() => handleUpdateSeats(company.seats - 1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="text-3xl font-bold min-w-[3rem] text-center bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        {company.seats}
                      </span>
                      <Button
                        variant="outline" size="icon"
                        className="h-9 w-9 border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 active:scale-95"
                        disabled={actionLoading || company.seats >= 500}
                        onClick={() => handleUpdateSeats(company.seats + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Az arányos elszámolás automatikusan történik.
                    </p>
                  </CardContent>
                </AnimatedCard>

                {/* Plan switch */}
                <AnimatedCard>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4 text-accent" />
                      Csomag váltás
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Jelenlegi: <strong className="text-foreground">{currentPlanLabel}</strong>
                    </p>
                    <GalaxyButton onClick={handleSwitchPlan} disabled={actionLoading} className="w-full">
                      {actionLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                      Váltás {otherPlanLabel} csomagra
                    </GalaxyButton>
                  </CardContent>
                </AnimatedCard>
              </div>

              {/* Portal link */}
              <AnimatedCard>
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div>
                    <p className="text-sm font-medium">Stripe számlázási portál</p>
                    <p className="text-xs text-muted-foreground">Számlák, fizetési mód, lemondás</p>
                  </div>
                  <Button onClick={handlePortal} disabled={actionLoading} variant="outline" size="sm"
                    className="border-primary/20 hover:bg-primary/10 transition-all duration-200">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Megnyitás
                  </Button>
                </CardContent>
              </AnimatedCard>
            </div>
          ) : !polling ? (
            /* New subscription flow */
            <div className="space-y-5">
              {/* Plan cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <PlanCard
                  title="Havi"
                  description="Rugalmas, havi elszámolás"
                  price={`${MONTHLY_PRICE.toLocaleString('hu-HU')} Ft`}
                  period="/ hó / licenc"
                  selected={selectedPlan === 'monthly'}
                  onClick={() => setSelectedPlan('monthly')}
                />
                <PlanCard
                  title="Éves"
                  description="Kedvezményes éves elszámolás"
                  price={`${YEARLY_PRICE.toLocaleString('hu-HU')} Ft`}
                  period="/ év / licenc"
                  selected={selectedPlan === 'yearly'}
                  badge="Kedvezményes"
                  onClick={() => setSelectedPlan('yearly')}
                />
              </div>

              {/* Seat selector */}
              <AnimatedCard>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-accent" />
                    Licencek száma
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline" size="icon"
                      className="h-10 w-10 border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 active:scale-95"
                      disabled={seatCount <= 1}
                      onClick={() => setSeatCount((s) => Math.max(1, s - 1))}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-4xl font-bold min-w-[4rem] text-center bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent tabular-nums">
                      {seatCount}
                    </span>
                    <Button
                      variant="outline" size="icon"
                      className="h-10 w-10 border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 active:scale-95"
                      disabled={seatCount >= 500}
                      onClick={() => setSeatCount((s) => Math.min(500, s + 1))}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Estimated total */}
                  <div className="flex items-center justify-between rounded-lg border border-primary/10 dark:border-sparkle-blue/10 bg-primary/5 dark:bg-primary/10 px-4 py-2.5">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Becsült összeg
                    </span>
                    <span className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent tabular-nums">
                      {estimatedTotal} Ft <span className="text-xs font-normal text-muted-foreground">{periodLabel}</span>
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    A licencszám később bármikor módosítható, arányos elszámolással.
                  </p>
                </CardContent>
              </AnimatedCard>

              {/* CTA */}
              <GalaxyButton
                className="w-full h-12 text-base"
                onClick={handleCheckout}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="h-5 w-5 mr-2" />
                )}
                {ctaLabel}
              </GalaxyButton>
            </div>
          ) : null}
        </TabsContent>

        {/* ─── History tab ─── */}
        <TabsContent value="history" className="mt-0">
          <AnimatedCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-accent" />
                Számlázási előzmények
              </CardTitle>
              <CardDescription className="text-xs">Legutóbbi Stripe események</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Receipt className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">Még nincs számlázási esemény.</p>
                </div>
              ) : (
                <ScrollArea className="h-[260px]">
                  <div className="divide-y divide-border/50">
                    {events.map((ev, i) => (
                      <div
                        key={ev.id}
                        className={cn(
                          "flex items-center gap-3 px-5 py-3 transition-colors duration-200 hover:bg-primary/5 dark:hover:bg-primary/10",
                          i === 0 && "rounded-t-none",
                        )}
                      >
                        {/* Icon */}
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
                          {eventIcon(ev.event_type)}
                        </div>
                        {/* Label */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{eventLabel(ev.event_type)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {ev.processed_at
                              ? new Date(ev.processed_at).toLocaleString('hu-HU', {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                })
                              : '–'}
                          </p>
                        </div>
                        {/* Badge */}
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

function MetricTile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-primary/10 dark:border-sparkle-blue/10 bg-card/50 p-3 transition-colors duration-200">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className={cn(
        "text-xl font-bold tabular-nums",
        accent
          ? "bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"
          : "text-foreground",
      )}>
        {value}
      </span>
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
      {/* Selection indicator */}
      {selected && (
        <div className="absolute top-3 right-3 h-6 w-6 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center animate-scale-in">
          <Check className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
      )}
      {badge && (
        <div className="absolute top-3 left-3">
          <Badge variant="secondary" className="text-[10px] bg-accent/15 text-accent border-accent/20">
            {badge}
          </Badge>
        </div>
      )}
      <CardHeader className={cn("pb-1", badge && "pt-10")}>
        <CardTitle className="text-lg">
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{title}</span>
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-foreground">{price}</span>
          <span className="text-xs text-muted-foreground">{period}</span>
        </div>
      </CardContent>
    </AnimatedCard>
  );
}
