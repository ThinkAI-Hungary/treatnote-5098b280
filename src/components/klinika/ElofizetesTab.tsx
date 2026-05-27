import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProcessingUsage } from '@/hooks/useProcessingUsage';
import {
  useBillingDetails,
  fetchInvoices,
  createSetupIntent,
  createCheckoutSession,
  formatCurrency,
  formatDate,
  type PaymentMethod,
} from '@/hooks/useBillingDetails';
import { PaymentMethodCard } from '@/components/billing/PaymentMethodCard';
import { InvoiceRow, type Invoice } from '@/components/billing/InvoiceRow';
import { StripeProvider } from '@/components/billing/StripeProvider';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/useToastMessage';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  CreditCard, Receipt, LayoutDashboard, RefreshCw,
  AlertTriangle, XCircle, CheckCircle, Plus, Shield,
  Zap, Mic, Activity, FileText, Loader2
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

// ─── Main ElofizetesTab Component ──────────────────────────────

interface ElofizetesTabProps {
  companyId: string | null;
  telephelyId?: string | null;
  companyName?: string | null;
  users?: any[];
  isSolo?: boolean;
}

export function ElofizetesTab({ companyId, telephelyId }: ElofizetesTabProps) {
  const { usage, loading: usageLoading, refresh: refreshUsage } = useProcessingUsage(companyId);
  const { details, loading: billingLoading, error: billingError, refresh: refreshBilling } = useBillingDetails(companyId);

  // Payment status from companies table
  const [paymentStatus, setPaymentStatus] = useState<'ok' | 'overdue'>('ok');
  const [isLocked, setIsLocked] = useState(false);
  const [lastInvoicePeriod, setLastInvoicePeriod] = useState<string | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);

  // Invoices
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // UI state
  const [tab, setTab] = useState('overview');
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deletingPm, setDeletingPm] = useState<string | null>(null);
  const [settingDefaultPm, setSettingDefaultPm] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  // Unpaid Invoice Details & Modal State
  const [unpaidInvoiceDetails, setUnpaidInvoiceDetails] = useState<{
    total: number;
    byType: { ambulans: number; voxis: number; treatnote: number };
    estimatedHuf: number;
    loading: boolean;
  } | null>(null);
  const [showUnpaidDetails, setShowUnpaidDetails] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [unpaidInvoiceUrl, setUnpaidInvoiceUrl] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Fetch unpaid invoice URL when payment status is overdue
  useEffect(() => {
    if (companyId && paymentStatus === 'overdue') {
      fetchInvoices(companyId)
        .then((data) => {
          const unpaid = data?.invoices?.find(
            (inv: any) => inv.status === 'open' || inv.status === 'past_due'
          );
          if (unpaid?.hosted_invoice_url) {
            setUnpaidInvoiceUrl(unpaid.hosted_invoice_url);
            console.log("Found unpaid Stripe invoice URL:", unpaid.hosted_invoice_url);
          } else {
            setUnpaidInvoiceUrl(null);
            console.log("No unpaid Stripe invoice found with hosted_invoice_url");
          }
        })
        .catch((err) => {
          console.error("Error fetching unpaid invoice url:", err);
          setUnpaidInvoiceUrl(null);
        });
    } else {
      setUnpaidInvoiceUrl(null);
    }
  }, [companyId, paymentStatus]);
  
  // Card input states
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardZip, setCardZip] = useState('');
  const [paying, setPaying] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 16) value = value.slice(0, 16);
    const parts = [];
    for (let i = 0; i < value.length; i += 4) {
      parts.push(value.slice(i, i + 4));
    }
    setCardNumber(parts.join(' '));
  };

  const handleCardExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 4) value = value.slice(0, 4);
    if (value.length > 2) {
      setCardExpiry(`${value.slice(0, 2)} / ${value.slice(2)}`);
    } else {
      setCardExpiry(value);
    }
  };

  const handleCardCvcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 4) {
      setCardCvc(value);
    }
  };

  const loadUnpaidInvoiceDetails = useCallback(async () => {
    if (!companyId || !lastInvoicePeriod || paymentStatus !== 'overdue') return;
    
    let year: number;
    let monthIndex: number;

    const matchHu = lastInvoicePeriod.match(/(\d{4})\.\s*([a-zA-Záéíóöőúüű]+)/);
    const matchIso = lastInvoicePeriod.match(/(\d{4})-(\d{2})/);

    if (matchHu) {
      year = parseInt(matchHu[1], 10);
      const monthName = matchHu[2].toLowerCase();
      const monthMap: Record<string, number> = {
        'január': 0, 'február': 1, 'március': 2, 'április': 3, 'május': 4, 'június': 5,
        'július': 6, 'augusztus': 7, 'szeptember': 8, 'október': 9, 'november': 10, 'december': 11
      };
      const foundIdx = monthMap[monthName];
      if (foundIdx === undefined) return;
      monthIndex = foundIdx;
    } else if (matchIso) {
      year = parseInt(matchIso[1], 10);
      monthIndex = parseInt(matchIso[2], 10) - 1;
    } else {
      return;
    }
    
    const start = new Date(Date.UTC(year, monthIndex, 1));
    const end = new Date(Date.UTC(year, monthIndex + 1, 1));
    
    setUnpaidInvoiceDetails(prev => ({ ...(prev || { total: 0, byType: { ambulans: 0, voxis: 0, treatnote: 0 }, estimatedHuf: 0 }), loading: true }));
    
    try {
      const { data, error } = await supabase
        .from('processing_usage')
        .select('job_type')
        .eq('company_id', companyId)
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString());
        
      if (error) throw error;
      
      const rows = data || [];
      const byType = {
        ambulans: rows.filter((r) => r.job_type === 'ambulans').length,
        voxis: rows.filter((r) => r.job_type === 'voxis').length,
        treatnote: rows.filter((r) => r.job_type === 'treatnote').length,
      };
      const total = byType.ambulans + byType.voxis + byType.treatnote;
      
      setUnpaidInvoiceDetails({
        total,
        byType,
        estimatedHuf: total * 1,
        loading: false
      });
    } catch (err) {
      console.error("Error loading unpaid invoice details:", err);
      setUnpaidInvoiceDetails(null);
    }
  }, [companyId, lastInvoicePeriod, paymentStatus]);

  useEffect(() => {
    if (paymentStatus === 'overdue' && lastInvoicePeriod) {
      loadUnpaidInvoiceDetails();
    } else {
      setUnpaidInvoiceDetails(null);
    }
  }, [paymentStatus, lastInvoicePeriod, loadUnpaidInvoiceDetails]);

  async function handlePayInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setActionLoading(true);
    
    try {
      // 1. Elsődleges folyamat: ha van nyitott Stripe számla, arra irányítjuk
      if (unpaidInvoiceUrl) {
        window.location.href = unpaidInvoiceUrl;
        return;
      }

      // 2. Tartalék folyamat: ha nincs nyitott Stripe számla, Checkout Session-t hozunk létre
      if (!telephelyId) {
        throw new Error("Hiányzó telephely azonosító (telephelyId). Nem sikerült elindítani a fizetést.");
      }

      const amount = unpaidInvoiceDetails?.estimatedHuf ?? 0;
      if (amount <= 0) {
        throw new Error("A fizetendő összegnek nagyobbnak kell lennie mint 0 Ft.");
      }

      const session = await createCheckoutSession({
        company_id: companyId,
        telephely_id: telephelyId,
        mode: 'payment',
        amount,
        period: lastInvoicePeriod || ''
      });

      if (session?.url) {
        window.location.href = session.url;
      } else {
        throw new Error("Nem sikerült lekérni a fizetési felület címét a Stripe-tól.");
      }
    } catch (err: any) {
      toast.error('Hiba a fizetés indításakor: ' + (err?.message || 'Ismeretlen hiba'));
    } finally {
      setActionLoading(false);
    }
  }

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
  }, [loadCompanyStatus]);

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

  async function handleDeletePaymentMethod(pmId: string) {
    if (!companyId) return;
    setDeletingPm(pmId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { error } = await supabase.functions.invoke('delete-payment-method', {
        body: { payment_method_id: pmId },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      await refreshBilling();
      toast.success('Fizetési mód eltávolítva.');
    } catch (err: any) {
      toast.error(err?.message || 'Hiba a törléskor.');
    } finally {
      setDeletingPm(null);
    }
  }

  async function handleSetDefaultPaymentMethod(pmId: string) {
    if (!companyId) return;
    setSettingDefaultPm(pmId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { error } = await supabase.functions.invoke('set-default-payment-method', {
        body: { payment_method_id: pmId },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      await refreshBilling();
      toast.success('Alapértelmezett kártya beállítva.');
    } catch (err: any) {
      toast.error(err?.message || 'Hiba a beállításkor.');
    } finally {
      setSettingDefaultPm(null);
    }
  }

  function handleRefresh() {
    loadCompanyStatus();
    refreshBilling();
    refreshUsage();
    if (tab === 'invoices') loadInvoices();
  }

  // Handle successful checkout redirect parameter
  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      toast.success('Sikeres fizetés! A hátralék rendezése folyamatban van.');
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('checkout');
      setSearchParams(newParams, { replace: true });
      handleRefresh();
    }
  }, [searchParams, setSearchParams]);

  if (billingLoading || companyLoading) {
    return (
      <AnimatedCard>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </AnimatedCard>
    );
  }

  const paymentMethods = details?.payment_methods || [];
  const monthName = new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' });

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Refresh row ── */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={companyLoading || usageLoading || billingLoading}
          className="text-xs gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${(companyLoading || usageLoading || billingLoading) ? 'animate-spin' : ''}`} />
          Frissítés
        </Button>
      </div>

      {/* ── Lock banner ── */}
      {isLocked && (
        <AnimatedCard className="border-destructive/40 bg-destructive/10">
          <CardContent className="flex items-start gap-3 py-4">
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive text-sm">Fiókja zárolva van</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Az előző havi számla ({lastInvoicePeriod}) kifizetetlen. Kérjük mentsen el egy fizetési módot és rendezze a tartozást.
              </p>
            </div>
          </CardContent>
        </AnimatedCard>
      )}

      {/* ── Overdue banner ── */}
      {!isLocked && paymentStatus === 'overdue' && (
        <AnimatedCard className="border-yellow-500/40 bg-yellow-500/10">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-yellow-600 dark:text-yellow-400 text-sm">Nyitott számla</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Az előző havi számla ({lastInvoicePeriod}) kifizetetlen. Ha hónap 10-ig nem rendezi, a hozzáférés szünetel.
              </p>
            </div>
          </CardContent>
        </AnimatedCard>
      )}

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card/60 backdrop-blur-sm border border-primary/15 dark:border-sparkle-blue/15 p-0.5 h-8 w-full justify-start">
          <TabsTrigger value="overview" className="text-xs h-7 gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all">
            <LayoutDashboard className="h-3.5 w-3.5" /> Áttekintés
          </TabsTrigger>
          <TabsTrigger value="payment" className="text-xs h-7 gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all">
            <CreditCard className="h-3.5 w-3.5" /> Fizetési módok
          </TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs h-7 gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all">
            <Receipt className="h-3.5 w-3.5" /> Számlák
          </TabsTrigger>
        </TabsList>

        {/* ── Overview tab ── */}
        <TabsContent value="overview" className="space-y-3 mt-3">
          {/* Unpaid / Open Invoices Table */}
          {paymentStatus === 'overdue' && lastInvoicePeriod && (
            <AnimatedCard className="border-destructive/30 bg-destructive/5 dark:bg-destructive/10">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2 text-destructive font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  Kifizetetlen / Nyitott számlák
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="overflow-x-auto rounded-lg border border-border bg-card">
                  <table className="w-full text-sm text-left table-fixed">
                    <colgroup>
                      <col className="w-[25%]" />
                      <col className="w-[20%]" />
                      <col className="w-[20%]" />
                      <col className="w-[35%]" />
                    </colgroup>
                    <thead className="bg-muted text-muted-foreground text-xs uppercase">
                      <tr>
                        <th className="px-4 py-2 w-[25%]">Időszak</th>
                        <th className="px-4 py-2 w-[20%]">Összeg</th>
                        <th className="px-4 py-2 w-[20%]">Státusz</th>
                        <th className="px-4 py-2 w-[35%] text-right">Műveletek</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr className="hover:bg-muted/30">
                        <td className="px-4 py-3.5 font-medium w-[25%] truncate">{lastInvoicePeriod}</td>
                        <td className="px-4 py-3.5 font-semibold w-[20%] truncate">
                          {unpaidInvoiceDetails?.loading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            `${(unpaidInvoiceDetails?.estimatedHuf ?? 0).toLocaleString('hu-HU')} EUR`
                          )}
                        </td>
                        <td className="px-4 py-3.5 w-[20%]">
                          <Badge variant="destructive" className="text-[10px] px-2 py-0.5 h-5 gap-1">
                            <AlertTriangle className="h-2.5 w-2.5" /> Késedelmes
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-right w-[35%]">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8"
                              onClick={() => setShowUnpaidDetails(!showUnpaidDetails)}
                            >
                              {showUnpaidDetails ? 'Részletek elrejtése' : 'Részletek megtekintése'}
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              className="text-xs h-8 bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-1.5"
                              onClick={handlePayInvoice}
                              disabled={actionLoading}
                            >
                              {actionLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CreditCard className="h-3.5 w-3.5" />
                              )}
                              Fizetés
                            </Button>
                          </div>
                        </td>
                      </tr>
                      
                      {/* Detailed breakdown row */}
                      {showUnpaidDetails && (
                        <tr>
                          <td colSpan={4} className="px-4 py-3 bg-muted/20 border-t border-border col-span-4">
                            {unpaidInvoiceDetails?.loading ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 justify-center">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Részletek betöltése...
                              </div>
                            ) : unpaidInvoiceDetails ? (
                              <div className="space-y-2 py-1">
                                <p className="text-xs font-semibold text-muted-foreground">Feldolgozások részletezése:</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <div className="flex items-center justify-between p-2 rounded bg-card border border-border/50 text-xs">
                                    <span className="flex items-center gap-1"><Mic className="h-3.5 w-3.5 text-primary" /> Ambuláns</span>
                                    <span className="font-bold">{unpaidInvoiceDetails.byType.ambulans} db ({(unpaidInvoiceDetails.byType.ambulans * 1).toLocaleString('hu-HU')} EUR)</span>
                                  </div>
                                  <div className="flex items-center justify-between p-2 rounded bg-card border border-border/50 text-xs">
                                    <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5 text-primary" /> Státusz</span>
                                    <span className="font-bold">{unpaidInvoiceDetails.byType.voxis} db ({(unpaidInvoiceDetails.byType.voxis * 1).toLocaleString('hu-HU')} EUR)</span>
                                  </div>
                                  <div className="flex items-center justify-between p-2 rounded bg-card border border-border/50 text-xs">
                                    <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-primary" /> Kezelési terv</span>
                                    <span className="font-bold">{unpaidInvoiceDetails.byType.treatnote} db ({(unpaidInvoiceDetails.byType.treatnote * 1).toLocaleString('hu-HU')} EUR)</span>
                                  </div>
                                </div>
                                <div className="flex justify-between items-center text-xs font-bold border-t border-border/60 pt-2 mt-1">
                                  <span>Összesen</span>
                                  <span>{unpaidInvoiceDetails.total} db ({unpaidInvoiceDetails.estimatedHuf.toLocaleString('hu-HU')} EUR)</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground text-center py-2">
                                Nem sikerült betölteni a részleteket.
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </AnimatedCard>
          )}

          <AnimatedCard className="border-border/60">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Aktuális hónap – {monthName}
                </CardTitle>
                {paymentStatus === 'ok' && !isLocked && (
                  <CheckCircle className="h-4.5 w-4.5 text-green-500" />
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              {usageLoading ? (
                <div className="h-16 rounded-lg bg-muted/40 animate-pulse" />
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <UsageStatCard label="Ambuláns" count={usage?.byType.ambulans ?? 0} icon={Mic} />
                    <UsageStatCard label="Státusz" count={usage?.byType.voxis ?? 0} icon={Activity} />
                    <UsageStatCard label="Kezelési terv" count={usage?.byType.treatnote ?? 0} icon={FileText} />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Összes feldolgozás</p>
                      <p className="text-xl font-bold mt-0.5">{usage?.total ?? 0} db</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Becsült számla</p>
                      <p className="text-xl font-bold mt-0.5 text-primary">
                        {(usage?.estimatedHuf ?? 0).toLocaleString('hu-HU')} EUR
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    A számlát minden hónap 1-jén állítjuk ki az előző hónap felhasználása alapján.
                  </p>
                </>
              )}
            </CardContent>
          </AnimatedCard>

          {/* Quick Payment Info */}
          <AnimatedCard className="border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <div>
                  {paymentMethods.length > 0 ? (
                    <p className="text-sm font-medium">
                      Mentett kártya: {paymentMethods.find(p => p.is_default)?.brand?.toUpperCase() || paymentMethods[0].brand?.toUpperCase()} ···· {paymentMethods.find(p => p.is_default)?.last4 || paymentMethods[0].last4}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nincs mentett fizetési mód</p>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setTab('payment')}>
                Kezelés
              </Button>
            </CardContent>
          </AnimatedCard>
        </TabsContent>

        {/* ── Payment methods tab ── */}
        <TabsContent value="payment" className="space-y-3 mt-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="text-sm font-semibold">Mentett fizetési kártyák</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={handleAddPaymentMethod}
              disabled={actionLoading}
            >
              <Plus className="h-3.5 w-3.5" />
              Kártya hozzáadása
            </Button>
          </div>

          {showSetupForm && setupClientSecret && (
            <AnimatedCard className="border-primary/30 bg-primary/5 dark:bg-primary/10">
              <CardContent className="p-4">
                <StripeProvider clientSecret={setupClientSecret} isDark={isDark}>
                  <SetupForm
                    onSuccess={() => { setShowSetupForm(false); setSetupClientSecret(null); refreshBilling(); }}
                    onCancel={() => { setShowSetupForm(false); setSetupClientSecret(null); }}
                  />
                </StripeProvider>
              </CardContent>
            </AnimatedCard>
          )}

          {paymentMethods.length > 0 ? (
            <div className="space-y-2">
              {paymentMethods.map((pm) => (
                <PaymentMethodCard
                  key={pm.id}
                  pm={pm}
                  onDelete={handleDeletePaymentMethod}
                  deleting={deletingPm === pm.id}
                  onSetDefault={handleSetDefaultPaymentMethod}
                  settingDefault={settingDefaultPm === pm.id}
                  canSetDefault={paymentMethods.length > 1}
                />
              ))}
            </div>
          ) : !showSetupForm ? (
            <AnimatedCard className="border-border/60">
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
                <CreditCard className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground text-center">
                  Nincs mentett fizetési kártyája.
                </p>
              </CardContent>
            </AnimatedCard>
          ) : null}

          <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
            <Shield className="h-3 w-3" />
            Biztonságos fizetés a Stripe által. Kártyaadatait nem tároljuk.
          </p>
        </TabsContent>

        {/* ── Invoices tab ── */}
        <TabsContent value="invoices" className="space-y-3 mt-3">
          <AnimatedCard className="border-border/60">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Receipt className="h-4 w-4 text-accent" /> Számlák listája
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : invoices.length > 0 ? (
                <ScrollArea className="h-[300px]">
                  <div className="divide-y divide-border/40 px-2 py-2">
                    {invoices.map(inv => <InvoiceRow key={inv.id} invoice={inv} />)}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                  <Receipt className="h-8 w-8 opacity-40" />
                  <p className="text-sm">Nem található korábbi számla.</p>
                </div>
              )}
            </CardContent>
          </AnimatedCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
