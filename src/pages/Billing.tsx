import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { supabase } from '@/integrations/supabase/client';
import {
  useBillingDetails,
  fetchInvoices,
  cancelSubscription,
  createSetupIntent,
  createEmbeddedCheckout,
  switchPlan,
  formatCurrency,
  formatDate,
  PRICE_IDS,
  type PaymentMethod,
} from '@/hooks/useBillingDetails';
import { PaymentMethodCard } from '@/components/billing/PaymentMethodCard';
import { InvoiceRow, type Invoice } from '@/components/billing/InvoiceRow';
import { LicenseGrid } from '@/components/billing/LicenseGrid';
import { CheckoutModal } from '@/components/billing/CheckoutModal';
import { StripeProvider } from '@/components/billing/StripeProvider';
import { TrialLicenseCard } from '@/components/billing/TrialLicenseCard';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  CreditCard, Users, Receipt, LayoutDashboard, RefreshCw,
  TrendingUp, TrendingDown, Calendar, ArrowUpDown, Plus,
  CheckCircle, AlertTriangle, XCircle, Clock, Zap, Minus,
  ChevronRight, Shield
} from 'lucide-react';

// ─── Setup Intent Form (inside Stripe Elements) ────────────────────────────

function SetupForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSaving(true);
    setError(null);

    const { error: confirmErr } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });

    if (confirmErr) {
      setError(confirmErr.message || 'Hiba a kártya mentésekor');
      setSaving(false);
    } else {
      toast.success('Fizetési mód elmentve!');
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: { type: 'tabs', defaultCollapsed: false } }} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={saving || !stripe} className="flex-1">
          {saving ? 'Mentés...' : 'Kártya mentése'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Mégse
        </Button>
      </div>
    </form>
  );
}

// ─── Status icon helper ─────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string | null }) {
  switch (status) {
    case 'active': return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'past_due': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case 'canceled': return <XCircle className="h-5 w-5 text-destructive" />;
    case 'trialing': return <Clock className="h-5 w-5 text-primary" />;
    default: return <Shield className="h-5 w-5 text-muted-foreground" />;
  }
}

function statusLabel(status: string | null): string {
  const map: Record<string, string> = {
    active: 'Aktív',
    past_due: 'Késedelmes',
    canceled: 'Lemondva',
    trialing: 'Próbaidőszak',
    incomplete: 'Feldolgozás alatt',
  };
  return (status && map[status]) || 'Nincs előfizetés';
}

// ─── Plan selection cards ────────────────────────────────────────────────────

function PlanCard({
  label, description, amount, currency, selected, onClick,
  badge,
}: {
  label: string; description: string; amount: number; currency: string;
  selected: boolean; onClick: () => void; badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative text-left w-full rounded-xl border p-5 transition-all duration-200 group ${selected
        ? 'border-primary/60 bg-primary/5 dark:bg-primary/10 shadow-[0_0_20px_hsl(270_70%_60%/0.1)]'
        : 'border-border/60 bg-card/60 hover:border-border hover:bg-card/80'
        }`}
    >
      {badge && (
        <span className="absolute top-3 right-3 text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold">
          {badge}
        </span>
      )}
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{label}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div className={`w-4 h-4 rounded-full border-2 mt-1 flex items-center justify-center shrink-0 transition-colors ${selected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
          }`}>
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight">
        {formatCurrency(amount, currency)}
        <span className="text-sm font-normal text-muted-foreground">/hó · licencenként</span>
      </p>
    </button>
  );
}

// ─── Main Billing page ───────────────────────────────────────────────────────

export default function Billing() {
  const { session } = useAuth();
  const { isKlinikaAdmin, companyId, telephelyId, loading: rolesLoading } = useCachedRoles();
  const [searchParams, setSearchParams] = useSearchParams();

  // Billing details
  const { details, loading, refresh } = useBillingDetails(companyId);

  // Invoices (loaded lazily on tab switch)
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // Members (for license tab)
  const [members, setMembers] = useState<Array<{ user_id: string; full_name: string; email?: string }>>([]);

  // UI state
  const [tab, setTab] = useState('overview');
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [seatCount, setSeatCount] = useState(1);
  const [actionLoading, setActionLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  // Detect dark mode
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // Poll after checkout success
  useEffect(() => {
    if (searchParams.get('checkout') !== 'success') return;
    setPolling(true);
    const interval = setInterval(async () => {
      if (!companyId) return;
      const { data } = await supabase.from('companies').select('subscription_status').eq('id', companyId).single();
      if (data?.subscription_status === 'active') {
        setPolling(false);
        clearInterval(interval);
        refresh();
        toast.success('Előfizetés aktiválva!');
        setSearchParams(prev => {
          const params = new URLSearchParams(prev);
          params.delete('checkout');
          return params;
        }, { replace: true });
      }
    }, 3000);
    const timeout = setTimeout(() => { setPolling(false); clearInterval(interval); }, 90000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [searchParams, companyId, refresh, setSearchParams]);

  // Load invoices when tab is selected
  async function loadInvoices() {
    if (!companyId || invoicesLoading) return;
    setInvoicesLoading(true);
    try {
      const data = await fetchInvoices(companyId);
      setInvoices(data?.invoices || []);
    } catch {
      toast.error('Számlák betöltése sikertelen');
    } finally {
      setInvoicesLoading(false);
    }
  }

  // Load members for license tab
  const loadMembers = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .eq('company_id', companyId);
    if (data) setMembers(data as any);
  }, [companyId]);

  useEffect(() => {
    if (tab === 'licences') loadMembers();
    if (tab === 'invoices') loadInvoices();
  }, [tab]);

  async function handleStartCheckout() {
    if (!companyId || !details) return;
    setActionLoading(true);
    try {
      const priceId = selectedPlan === 'yearly' ? PRICE_IDS.yearly : PRICE_IDS.monthly;
      const data = await createEmbeddedCheckout(companyId, telephelyId || "", priceId, seatCount);
      if (data?.client_secret) {
        setCheckoutClientSecret(data.client_secret);
      } else {
        toast.error('Nem sikerült elindítani a fizetést');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Hiba történt');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddPaymentMethod() {
    if (!companyId) return;
    setActionLoading(true);
    try {
      const data = await createSetupIntent(companyId);
      if (data?.client_secret) {
        setSetupClientSecret(data.client_secret);
        setShowSetupForm(true);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Hiba történt');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSwitchPlan() {
    if (!companyId || !details) return;
    const newPriceId = details.subscription.price_id === PRICE_IDS.monthly ? PRICE_IDS.yearly : PRICE_IDS.monthly;
    setActionLoading(true);
    try {
      await switchPlan(companyId, newPriceId);
      toast.success('Csomag váltás sikeres!');
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Hiba történt');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel(immediately = false) {
    if (!companyId) return;
    setActionLoading(true);
    try {
      await cancelSubscription(companyId, { immediately });
      toast.success(immediately ? 'Előfizetés lemondva.' : 'Lemondás ütemezve a periódus végére.');
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Hiba történt');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReactivate() {
    if (!companyId) return;
    setActionLoading(true);
    try {
      await cancelSubscription(companyId, { reactivate: true });
      toast.success('Lemondás visszavonva!');
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Hiba történt');
    } finally {
      setActionLoading(false);
    }
  }

  // ── Access check ──
  if (rolesLoading || loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Számlázás</h1>
          <p className="text-muted-foreground mt-1">Betöltés...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!isKlinikaAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Számlázás</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center max-w-sm text-sm">
              Az előfizetés kezelése a klinika adminisztrátor feladata.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sub = details?.subscription;
  const isActive = sub?.status === 'active' || sub?.status === 'trialing';
  const isPastDue = sub?.status === 'past_due';
  const isCancelPending = sub?.cancel_at_period_end;
  const isYearly = sub?.price_id === PRICE_IDS.yearly;
  const prices = details?.prices;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ── */}
      <div className="bg-galaxy-header rounded-2xl px-6 py-5 border border-border/40">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Számlázás</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Előfizetés, licencek és számlázási információk
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="mt-1"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Status bar */}
        {polling && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Fizetés feldolgozás alatt...
          </div>
        )}
      </div>

      {/* ── Stat cards ── */}
      {(isActive || isPastDue) && sub && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Status */}
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-2">Státusz</p>
              <div className="flex items-center gap-2">
                <StatusIcon status={sub.status} />
                <span className="font-semibold text-sm">{statusLabel(sub.status)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Plan */}
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-2">Csomag</p>
              <div className="flex items-center gap-2">
                {isYearly ? <TrendingDown className="h-4 w-4 text-green-500" /> : <TrendingUp className="h-4 w-4 text-primary" />}
                <span className="font-semibold text-sm">{isYearly ? 'Éves' : 'Havi'}</span>
                {isYearly && <Badge className="text-[9px] px-1 h-4 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Megtakarítás</Badge>}
              </div>
            </CardContent>
          </Card>

          {/* Seats */}
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-2">Licencek</p>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">{sub.seats} db</span>
              </div>
            </CardContent>
          </Card>

          {/* Next billing */}
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-2">
                {isCancelPending ? 'Lejár' : 'Következő számla'}
              </p>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">{formatDate(sub.current_period_end)}</span>
              </div>
              {isCancelPending && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Lemondásra ütemezve</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Main content tabs ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start h-10 bg-muted/40 border border-border/40 rounded-xl p-1">
          <TabsTrigger value="overview" className="gap-1.5 text-xs"><LayoutDashboard className="h-3.5 w-3.5" /> Áttekintés</TabsTrigger>
          <TabsTrigger value="payment" className="gap-1.5 text-xs"><CreditCard className="h-3.5 w-3.5" /> Fizetési módok</TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5 text-xs"><Receipt className="h-3.5 w-3.5" /> Számlák</TabsTrigger>
          <TabsTrigger value="licences" className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" /> Licencek</TabsTrigger>
        </TabsList>

        {/* ── Overview tab ── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <TrialLicenseCard />
          {(isActive || isPastDue) && sub ? (
            <>
              {/* Upcoming invoice */}
              {details?.upcoming_invoice && (
                <Card className="border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        Következő számlázás
                      </CardTitle>
                      <span className="text-xl font-bold">
                        {formatCurrency(details.upcoming_invoice.amount_due, details.upcoming_invoice.currency)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    {details.upcoming_invoice.lines.map((line, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{line.description}</span>
                        <span className="font-medium">{formatCurrency(line.amount, details.upcoming_invoice!.currency)}</span>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground pt-1">
                      Esedékesség: {formatDate(details.upcoming_invoice.period_end)}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* ── Subscription management: rebilling + terminate ── */}
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Előfizetés kezelése
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Rebilling toggle */}
                  <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">Automatikus megújítás</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isCancelPending
                          ? 'Kikapcsolva – nem újul meg az időszak végén'
                          : 'Bekapcsolva – automatikusan megújul'}
                      </p>
                    </div>
                    <button
                      onClick={() => isCancelPending ? handleReactivate() : handleCancel(false)}
                      disabled={actionLoading}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${isCancelPending ? 'bg-muted-foreground/30' : 'bg-primary'}`}
                      aria-label="Megújítás kapcsoló"
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${isCancelPending ? 'translate-x-1' : 'translate-x-6'}`} />
                    </button>
                  </div>

                  {isCancelPending && (
                    <p className="text-xs text-muted-foreground px-1">
                      Az előfizetés az időszak végén megszűnik. Kapcsold vissza a megújítást a fenntartáshoz.
                    </p>
                  )}

                  {/* Terminate immediately */}
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    disabled={actionLoading}
                    onClick={() => handleCancel(true)}
                  >
                    {actionLoading ? 'Feldolgozás…' : 'Előfizetés azonnali lemondása'}
                  </Button>
                </CardContent>
              </Card>

            </>
          ) : (
            /* New subscription purchase */
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold mb-1">Válassz csomagot</h2>
                <p className="text-sm text-muted-foreground">Minden csomag tartalmaz minden funkciót. A licencek száma határozza meg a felhasználókat.</p>
              </div>

              {prices && (
                <div className="max-w-sm">
                  <PlanCard
                    label="Havi"
                    description="Rugalmas, havi megújítás"
                    amount={prices.monthly.unit_amount || 0}
                    currency={prices.monthly.currency}
                    selected={true}
                    onClick={() => { }}
                  />
                </div>
              )}

              {/* Seat count */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Licencek száma
                  </CardTitle>
                  <CardDescription>Hány felhasználó fér hozzá a rendszerhez?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <button
                      className="w-10 h-10 rounded-xl border border-border/60 bg-muted/40 flex items-center justify-center hover:bg-muted/70 transition-colors disabled:opacity-40"
                      disabled={seatCount <= 1}
                      onClick={() => setSeatCount((s) => Math.max(1, s - 1))}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="text-3xl font-bold w-16 text-center">{seatCount}</span>
                    <button
                      className="w-10 h-10 rounded-xl border border-border/60 bg-muted/40 flex items-center justify-center hover:bg-muted/70 transition-colors disabled:opacity-40"
                      disabled={seatCount >= 500}
                      onClick={() => setSeatCount((s) => Math.min(500, s + 1))}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    {prices && (
                      <div className="ml-4 text-sm text-muted-foreground">
                        = <span className="font-semibold text-foreground">
                          {formatCurrency(
                            (selectedPlan === 'yearly' ? prices.yearly.unit_amount : prices.monthly.unit_amount) * seatCount,
                            selectedPlan === 'yearly' ? prices.yearly.currency : prices.monthly.currency
                          )}
                        </span>/{selectedPlan === 'yearly' ? 'év' : 'hó'}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Button
                size="lg"
                className="w-full galaxy-gradient font-semibold gap-2 h-12 text-base"
                onClick={handleStartCheckout}
                disabled={actionLoading}
              >
                <CreditCard className="h-5 w-5" />
                {actionLoading ? 'Indítás...' : 'Előfizetés indítása'}
              </Button>

              <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
                <Shield className="h-3 w-3" />
                Biztonságos fizetés a Stripe által. Kártyaadatait soha nem tároljuk.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ── Payment methods tab ── */}
        <TabsContent value="payment" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Fizetési módok</h2>
              <p className="text-sm text-muted-foreground">Mentett kártyák és fizetési módok</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleAddPaymentMethod}
              disabled={actionLoading}
            >
              <Plus className="h-3.5 w-3.5" />
              Hozzáadás
            </Button>
          </div>

          {/* SetupIntent form */}
          {showSetupForm && setupClientSecret && (
            <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Új fizetési mód</CardTitle>
              </CardHeader>
              <CardContent>
                <StripeProvider clientSecret={setupClientSecret} isDark={isDark}>
                  <SetupForm
                    onSuccess={() => { setShowSetupForm(false); setSetupClientSecret(null); refresh(); }}
                    onCancel={() => { setShowSetupForm(false); setSetupClientSecret(null); }}
                  />
                </StripeProvider>
              </CardContent>
            </Card>
          )}

          {/* Saved payment methods */}
          {details?.payment_methods && details.payment_methods.length > 0 ? (
            <div className="space-y-2">
              {details.payment_methods.map((pm) => (
                <PaymentMethodCard key={pm.id} pm={pm} />
              ))}
            </div>
          ) : !showSetupForm ? (
            <Card className="border-border/60">
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
                <CreditCard className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground text-center">
                  Nincs mentett fizetési mód.
                  <br />Adj hozzá egyet a gombbal fentebb.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ── Invoices tab ── */}
        <TabsContent value="invoices" className="space-y-4 mt-4">
          <div>
            <h2 className="text-base font-semibold">Számlák</h2>
            <p className="text-sm text-muted-foreground">Korábbi és aktuális számlák listája</p>
          </div>

          {invoicesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}
            </div>
          ) : invoices.length > 0 ? (
            <Card className="border-border/60 overflow-hidden">
              <CardContent className="p-2">
                <div className="divide-y divide-border/40">
                  {invoices.map((inv) => <InvoiceRow key={inv.id} invoice={inv} />)}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/60">
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
                <Receipt className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Még nincsenek számlák.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Licences tab ── */}
        <TabsContent value="licences" className="space-y-4 mt-4">
          <div>
            <h2 className="text-base font-semibold">Licencek</h2>
            <p className="text-sm text-muted-foreground">Kiosztott és szabad licencek kezelése</p>
          </div>
          <TrialLicenseCard />

          {sub && companyId && (
            <Card className="border-border/60">
              <CardContent className="pt-5 pb-5">
                <LicenseGrid
                  companyId={companyId}
                  totalSeats={sub.seats || 0}
                  usedSeats={members.length}
                  onUpdate={refresh}
                  readOnly={!isActive && !isPastDue}
                />
              </CardContent>
            </Card>
          )}

          {/* Members table */}
          {members.length > 0 && (
            <Card className="border-border/60 overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Tagok</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/40">
                  {members.map((m, i) => (
                    <div key={m.user_id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {m.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{m.full_name || 'Ismeretlen'}</p>
                      </div>
                      <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">
                        #{i + 1}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Checkout modal ── */}
      {checkoutClientSecret && (
        <CheckoutModal
          clientSecret={checkoutClientSecret}
          onClose={() => setCheckoutClientSecret(null)}
          onComplete={() => {
            setCheckoutClientSecret(null);
            setPolling(true);
          }}
        />
      )}
    </div>
  );
}
