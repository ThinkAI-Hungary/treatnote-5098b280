import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { supabase } from '@/integrations/supabase/client';
import { useProcessingUsage } from '@/hooks/useProcessingUsage';
import {
  fetchInvoices,
  createSetupIntent,
  formatCurrency,
  formatDate,
  type PaymentMethod,
} from '@/hooks/useBillingDetails';
import { PaymentMethodCard } from '@/components/billing/PaymentMethodCard';
import { InvoiceRow, type Invoice } from '@/components/billing/InvoiceRow';
import { StripeProvider } from '@/components/billing/StripeProvider';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/useToastMessage';
import {
  CreditCard, Receipt, LayoutDashboard, RefreshCw,
  AlertTriangle, XCircle, CheckCircle, Plus, Shield,
  Zap, Mic, Activity, FileText
} from 'lucide-react';

// ─── Setup Intent Form ────────────────────────────────────────

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

// ─── Usage stat card ─────────────────────────────────────────

function UsageStatCard({ label, count, icon: Icon }: { label: string; count: number; icon: any }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border/50 bg-card/60 px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <span className="text-2xl font-bold tracking-tight">{count}</span>
    </div>
  );
}

// ─── Main Billing page ────────────────────────────────────────

export default function Billing() {
  const { session } = useAuth();
  const { isKlinikaAdmin, companyId, loading: rolesLoading } = useCachedRoles();
  const [searchParams] = useSearchParams();

  const { usage, loading: usageLoading, refresh: refreshUsage } = useProcessingUsage(companyId);

  // Payment status from companies table
  const [paymentStatus, setPaymentStatus] = useState<'ok' | 'overdue'>('ok');
  const [isLocked, setIsLocked] = useState(false);
  const [lastInvoicePeriod, setLastInvoicePeriod] = useState<string | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);

  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [pmLoading, setPmLoading] = useState(false);

  // Invoices
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // UI state
  const [tab, setTab] = useState('overview');
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const loadCompanyStatus = useCallback(async () => {
    if (!companyId) return;
    setCompanyLoading(true);
    try {
      const { data } = await supabase
        .from('companies')
        .select('payment_status, is_locked, last_invoice_period')
        .eq('id', companyId)
        .single();
      if (data) {
        setPaymentStatus((data.payment_status as 'ok' | 'overdue') || 'ok');
        setIsLocked(data.is_locked || false);
        setLastInvoicePeriod(data.last_invoice_period || null);
      }
    } finally {
      setCompanyLoading(false);
    }
  }, [companyId]);

  const loadPaymentMethods = useCallback(async () => {
    if (!companyId || pmLoading) return;
    setPmLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { data, error } = await supabase.functions.invoke('get-billing-details', {
        body: { company_id: companyId },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!error && data?.payment_methods) {
        setPaymentMethods(data.payment_methods);
      }
    } finally {
      setPmLoading(false);
    }
  }, [companyId]);

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

  useEffect(() => {
    loadCompanyStatus();
    loadPaymentMethods();
  }, [loadCompanyStatus, loadPaymentMethods]);

  useEffect(() => {
    if (tab === 'invoices') loadInvoices();
  }, [tab]);

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

  function handleRefresh() {
    loadCompanyStatus();
    loadPaymentMethods();
    refreshUsage();
  }

  // ── Access check ──
  if (rolesLoading || companyLoading) {
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

  const monthName = new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ── */}
      <div className="bg-galaxy-header rounded-2xl px-6 py-5 border border-border/40">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Számlázás</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Felhasználás-alapú számlázás · 1 EUR / feldolgozás
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="mt-1"
            onClick={handleRefresh}
            disabled={companyLoading || usageLoading}
          >
            <RefreshCw className={`h-4 w-4 ${(companyLoading || usageLoading) ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ── Lock banner ── */}
      {isLocked && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-5 py-4">
          <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-destructive text-sm">Fiókja zárolva van</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Az előző havi számla ({lastInvoicePeriod}) kifizetetlen. Kérjük mentsen el egy fizetési módot és rendezze a tartozást.
            </p>
          </div>
        </div>
      )}

      {/* ── Overdue banner (de még nincs zárolva – hónap 1–10.) ── */}
      {!isLocked && paymentStatus === 'overdue' && (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-yellow-600 dark:text-yellow-400 text-sm">Nyitott számla</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Az előző havi számla ({lastInvoicePeriod}) kifizetetlen. Ha hónap 10-ig nem rendezi, a hozzáférés szünetel.
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start h-10 bg-muted/40 border border-border/40 rounded-xl p-1">
          <TabsTrigger value="overview" className="gap-1.5 text-xs"><LayoutDashboard className="h-3.5 w-3.5" /> Áttekintés</TabsTrigger>
          <TabsTrigger value="payment" className="gap-1.5 text-xs"><CreditCard className="h-3.5 w-3.5" /> Fizetési módok</TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5 text-xs"><Receipt className="h-3.5 w-3.5" /> Számlák</TabsTrigger>
        </TabsList>

        {/* ── Overview tab ── */}
        <TabsContent value="overview" className="space-y-4 mt-4">

          {/* Havi felhasználás */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Aktuális hónap – {monthName}
                </CardTitle>
                {paymentStatus === 'ok' && !isLocked && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {usageLoading ? (
                <div className="h-16 rounded-lg bg-muted/40 animate-pulse" />
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <UsageStatCard label="Ambuláns" count={usage?.byType.ambulans ?? 0} icon={Mic} />
                    <UsageStatCard label="Státusz" count={usage?.byType.voxis ?? 0} icon={Activity} />
                    <UsageStatCard label="Kezelési terv" count={usage?.byType.treatnote ?? 0} icon={FileText} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Összes feldolgozás</p>
                      <p className="text-2xl font-bold mt-0.5">{usage?.total ?? 0} db</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Becsült számla</p>
                      <p className="text-2xl font-bold mt-0.5 text-primary">
                        {(usage?.estimatedHuf ?? 0).toLocaleString('hu-HU')} EUR
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    A számlát minden hónap 1-jén állítjuk ki az előző hónap felhasználása alapján.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Fizetési módok gyors hozzáférés */}
          {paymentMethods.length === 0 && (
            <Card className="border-border/60 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
                <CreditCard className="h-8 w-8 text-muted-foreground/40" />
                <div className="text-center">
                  <p className="text-sm font-medium">Nincs mentett fizetési mód</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Mentsen el egy kártyát, hogy a havi számlák automatikusan lefussanak.
                  </p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 mt-1" onClick={() => setTab('payment')}>
                  <Plus className="h-3.5 w-3.5" />
                  Kártya hozzáadása
                </Button>
              </CardContent>
            </Card>
          )}

          {paymentMethods.length > 0 && (
            <Card className="border-border/60">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <div className="text-sm">
                  <span className="font-medium">
                    {paymentMethods.find(p => p.is_default)?.brand?.toUpperCase() || paymentMethods[0].brand?.toUpperCase()} ···{paymentMethods.find(p => p.is_default)?.last4 || paymentMethods[0].last4}
                  </span>
                  <span className="text-muted-foreground ml-2">mentett fizetési mód</span>
                </div>
                <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setTab('payment')}>
                  Kezelés
                </Button>
              </CardContent>
            </Card>
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

          {showSetupForm && setupClientSecret && (
            <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Új fizetési mód</CardTitle>
              </CardHeader>
              <CardContent>
                <StripeProvider clientSecret={setupClientSecret} isDark={isDark}>
                  <SetupForm
                    onSuccess={() => { setShowSetupForm(false); setSetupClientSecret(null); loadPaymentMethods(); }}
                    onCancel={() => { setShowSetupForm(false); setSetupClientSecret(null); }}
                  />
                </StripeProvider>
              </CardContent>
            </Card>
          )}

          {paymentMethods.length > 0 ? (
            <div className="space-y-2">
              {paymentMethods.map((pm) => (
                <PaymentMethodCard key={pm.id} pm={pm} />
              ))}
            </div>
          ) : !showSetupForm ? (
            <Card className="border-border/60">
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
                <CreditCard className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground text-center">
                  Nincs mentett fizetési mód.
                  <br />Adjon hozzá egyet a gombbal fentebb.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
            <Shield className="h-3 w-3" />
            Biztonságos fizetés a Stripe által. Kártyaadatait soha nem tároljuk.
          </p>
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
      </Tabs>
    </div>
  );
}
