import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  CreditCard, LayoutDashboard, Receipt, ShieldCheck,
  Minus, Plus, ExternalLink, RefreshCw, AlertCircle,
  Copy, CheckCircle2, ChevronDown, Calendar, TrendingUp, Users, AlertTriangle, Loader2
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { GalaxyButton } from '@/components/klinika/GalaxyButton';
import { cn } from '@/lib/utils';
import { notifyLicenseDataChanged } from '@/lib/licenseEvents';
import {
  useBillingDetails,
  cancelSubscription,
  createSetupIntent,
  cancelLicense,
  switchLicenseInterval,
  updateSeats,
  switchPlan,
  fetchInvoices,
  formatCurrency,
  formatDate,
  PRICE_IDS,
  type BillingDetails,
  type PaymentMethod,
} from '@/hooks/useBillingDetails';
import { createEmbeddedCheckoutMultiple } from '@/hooks/useBillingDetails';
import { CheckoutModal } from '@/components/billing/CheckoutModal';
import { PaymentMethodCard } from '@/components/billing/PaymentMethodCard';
import { InvoiceRow, type Invoice } from '@/components/billing/InvoiceRow';
import { loadStripe, type Stripe as StripeType } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KlinikaUser {
  id: string;
  email: string;
  full_name: string | null;
}

interface License {
  id: string;
  assigned_user_id: string | null;
  status: string;
  expires_at: string | null;
  billing_interval: string;
  license_type: string;
  cancel_at_period_end: boolean;
  created_at: string;
}

interface ElofizetesTabProps {
  companyId: string | null;
  telephelyId?: string | null;
  companyName?: string | null;
  users?: KlinikaUser[];
  isSolo?: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ElofizetesTab({ companyId, telephelyId, companyName, users: klinikaUsers = [], isSolo = false }: ElofizetesTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Billing details from edge function
  const { details, loading, error: billingError, refresh } = useBillingDetails(companyId);

  // Licenses from Supabase directly (for richer local data)
  const [licenses, setLicenses] = useState<License[]>([]);
  const [licensesLoading, setLicensesLoading] = useState(true);

  // Invoices
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);

  // UI state
  const [subTab, setSubTab] = useState<'overview' | 'payment' | 'invoices' | 'licenses'>('overview');
  const [expandedForecast, setExpandedForecast] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [deletingPm, setDeletingPm] = useState<string | null>(null);
  const [settingDefaultPm, setSettingDefaultPm] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [addCardClientSecret, setAddCardClientSecret] = useState<string | null>(null);
  const stripePromiseRef = useRef<Promise<StripeType | null> | null>(null);

  // Purchase state
  const [monthlySeats, setMonthlySeats] = useState(1);
  const [yearlySeats, setYearlySeats] = useState(1);

  // ─── Fetch licenses ────────────────────────────────────────────────────────

  const fetchLicenses = useCallback(async () => {
    if (!companyId) { setLicensesLoading(false); return; }
    setLicensesLoading(true);
    let query = supabase
      .from('licenses')
      .select('id, assigned_user_id, status, expires_at, billing_interval, license_type, cancel_at_period_end, created_at')
      .eq('company_id', companyId)
      .in('status', ['available', 'assigned'])
      .order('created_at', { ascending: true });
    // Scope licenses to this telephely when available
    if (telephelyId) query = query.eq('telephely_id', telephelyId);
    const { data } = await query;
    if (data) {
      const loaded = data as License[];

      // ── Orphaned-license cleanup ──────────────────────────────────────────
      // If a license is assigned to a user_id that no longer exists in
      // the current telephely, release it back to 'available'.
      // This repairs the state left by old hard-deletes that skipped the
      // license table.
      if (klinikaUsers.length > 0) {
        const validUserIds = new Set(klinikaUsers.map(u => u.id));
        const orphaned = loaded.filter(
          l => l.status === 'assigned' && l.assigned_user_id && !validUserIds.has(l.assigned_user_id)
        );
        if (orphaned.length > 0) {
          await supabase
            .from('licenses')
            .update({ assigned_user_id: null, status: 'available' })
            .in('id', orphaned.map(l => l.id));
          // Patch locally so the UI reflects the fix immediately
          orphaned.forEach(l => { l.assigned_user_id = null; l.status = 'available'; });
        }
      }

      const now = new Date();
      const visible = loaded.filter(l => {
        // Drop expired trial licenses so they disappear automatically
        if (l.license_type === 'trial') {
          return l.expires_at ? new Date(l.expires_at) > now : false;
        }
        return true;
      });
      setLicenses(visible);
    }
    setLicensesLoading(false);
  }, [companyId, telephelyId, klinikaUsers]);

  useEffect(() => { fetchLicenses(); }, [fetchLicenses]);


  // ─── Auto-assign free licenses ─────────────────────────────────────────────

  const autoAssign = useCallback(async () => {
    if (!companyId || klinikaUsers.length === 0 || licenses.length === 0) return;
    const free = licenses.filter(l => l.status === 'available');
    const assignedIds = new Set(licenses.filter(l => l.status === 'assigned').map(l => l.assigned_user_id));
    const unassigned = klinikaUsers.filter(u => !assignedIds.has(u.id));
    if (free.length === 0 || unassigned.length === 0) return;
    const toAssign = Math.min(free.length, unassigned.length);
    let changed = false;
    for (let i = 0; i < toAssign; i++) {
      const { data, error } = await supabase
        .from('licenses')
        .update({ assigned_user_id: unassigned[i].id, status: 'assigned' })
        .eq('id', free[i].id)
        .eq('status', 'available')
        .select('id');
      if (!error && data && data.length > 0) changed = true;
    }
    if (changed) { fetchLicenses(); toast.success(`${toAssign} licenc automatikusan kiosztva.`); }
  }, [companyId, klinikaUsers, licenses, fetchLicenses]);

  useEffect(() => {
    if (!licensesLoading && licenses.length > 0 && klinikaUsers.length > 0) autoAssign();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licensesLoading, licenses.length, klinikaUsers.length]);

  // ─── Post-checkout polling ─────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (!companyId) return;
    setPolling(true);
    setPollingTimedOut(false);
    const interval = setInterval(async () => {
      const { data } = await supabase.from('companies').select('subscription_status').eq('id', companyId).single();
      if (data?.subscription_status === 'active') {
        setPolling(false);
        clearInterval(interval);
        clearTimeout(timeout);
        refresh();
        fetchLicenses();
        toast.success('Előfizetés aktiválva!');
        setSearchParams(prev => {
          const params = new URLSearchParams(prev);
          params.delete('checkout');
          return params;
        }, { replace: true });
      }
    }, 3000);
    const timeout = setTimeout(() => { setPolling(false); setPollingTimedOut(true); clearInterval(interval); }, 60_000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [companyId, refresh, fetchLicenses, setSearchParams]);

  useEffect(() => {
    if (searchParams.get('checkout') !== 'success') return;
    return startPolling();
  }, [searchParams, startPolling]);

  // ─── Invoices (lazy load) ──────────────────────────────────────────────────

  useEffect(() => {
    if (subTab !== 'invoices' || invoicesLoaded || !companyId) return;
    (async () => {
      setInvoicesLoading(true);
      try {
        const data = await fetchInvoices(companyId);
        setInvoices((data?.invoices || data || []) as Invoice[]);
        setInvoicesLoaded(true);
      } catch { /* ignore */ }
      finally { setInvoicesLoading(false); }
    })();
  }, [subTab, invoicesLoaded, companyId]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function handleBuyLicenses(type: 'monthly' | 'yearly') {
    if (!companyId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const priceId = PRICE_IDS.monthly;
      const seats = type === 'monthly' ? monthlySeats : yearlySeats;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { company_id: companyId, telephely_id: telephelyId, price_id: priceId, seats },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
      else throw new Error('Nem sikerült a fizetési munkamenet létrehozása.');
    } catch (err: any) {
      const msg = err?.message ?? 'Hiba a vásárlásnál.';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePortal() {
    if (!companyId) return;
    setActionLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: { company_id: companyId },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
      else throw new Error('Hiba a portál megnyitásakor.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Hiba.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelSubscription(opts: { immediately?: boolean; reactivate?: boolean } = {}) {
    if (!companyId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await cancelSubscription(companyId, opts);
      await refresh();
      // For immediate cancellation, the Stripe webhook needs 2-4s to expire licenses.
      // Refresh licenses right away + poll again to catch the webhook update.
      // Also fire the license event so AppSidebar locks Hangfelvétel instantly.
      if (opts.immediately) {
        notifyLicenseDataChanged();
        await fetchLicenses();
        setTimeout(() => fetchLicenses(), 3000);
        setTimeout(() => fetchLicenses(), 7000);
      }
      toast.success(opts.reactivate ? 'Lemondás visszavonva!' : opts.immediately ? 'Előfizetés lemondva.' : 'Lemondás beütemezve a periódus végére.');
    } catch (err: any) {
      const msg = err?.message ?? 'Hiba.';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleRebilling(currentlyWillCancel: boolean) {
    // currentlyWillCancel=true means cancel_at_period_end is ON (rebilling OFF)
    // toggle flips it: true → reactivate (turn rebilling back ON), false → cancel at period end
    await handleCancelSubscription({ reactivate: currentlyWillCancel });
  }

  async function handleSwitchPlan(newPriceId: string) {
    if (!companyId) return;
    setActionLoading(true);
    try {
      await switchPlan(companyId, newPriceId);
      await refresh();
      toast.success('Csomag módosítva.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Hiba a csomag módosításakor.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUpdateSeats(newSeats: number) {
    if (!companyId) return;
    setActionLoading(true);
    try {
      await updateSeats(companyId, newSeats);
      await refresh();
      await fetchLicenses();
      toast.success('Licencek száma frissítve.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Hiba.');
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
      await refresh();
      toast.success('Fizetési mód eltávolítva.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Hiba a törléskor.');
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
      await refresh();
      toast.success('Alapértelmezett kártya beállítva.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Hiba a beállításkor.');
    } finally {
      setSettingDefaultPm(null);
    }
  }

  async function handleAddCard() {
    if (!companyId) return;
    setAddingCard(true);
    try {
      // Load Stripe publishable key once and cache in ref
      if (!stripePromiseRef.current) {
        const { data: keyData } = await supabase.functions.invoke('get-stripe-publishable-key');
        const pk = keyData?.publishable_key;
        if (!pk) throw new Error('Stripe közzétett kulcs nem található.');
        stripePromiseRef.current = loadStripe(pk);
      }
      // Create SetupIntent — returns { client_secret }
      const data = await createSetupIntent(companyId);
      if (data?.client_secret) {
        setAddCardClientSecret(data.client_secret);
      } else {
        throw new Error('Nem sikerült a kártyahozzáadási munkamenet létrehozása.');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Hiba.');
    } finally {
      setAddingCard(false);
    }
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const sub = details?.subscription;
  const isActive = sub?.status === 'active';
  const isPastDue = sub?.status === 'past_due';
  const hasSubscription = isActive || isPastDue;
  const isMonthlyPlan = sub?.price_id === PRICE_IDS.monthly;
  const isCancelPending = sub?.cancel_at_period_end ?? false;

  // Exclude trial licenses and licenses with renewal turned off from billing calculations
  const paidLicenses = licenses.filter(l => l.license_type !== 'trial');
  const monthlyLicenses = paidLicenses.filter(l => l.billing_interval === 'monthly' && !l.cancel_at_period_end);
  const yearlyLicenses = paidLicenses.filter(l => l.billing_interval === 'yearly' && !l.cancel_at_period_end);
  const assignedLicenses = licenses.filter(l => l.status === 'assigned');
  const availableLicenses = paidLicenses.filter(l => l.status === 'available');

  const prices = details?.prices;

  // Translate Stripe invoice line descriptions to clear Hungarian.
  // Stripe proration strings look like:
  //   "Unused time on TreatNote Monthly (Feb 10 – Mar 10, 2026) × 5"
  //   "Remaining time on TreatNote Monthly after 10 Feb 2026"
  //   "1 × TreatNote Monthly (Feb 10 – Mar 10, 2026)"
  function translateLine(desc: string | null): string {
    if (!desc) return 'Licenc előfizetés';
    const d = desc.toLowerCase();
    // Proration credit: unused time (negative amount)
    if (d.includes('unused time')) {
      const periodMatch = desc.match(/\(([^)]+)\)/);
      const period = periodMatch ? ` (${periodMatch[1]})` : '';
      // Count is explicitly "× N" at end, not part of a year
      const countMatch = desc.match(/×\s*(\d+)\s*$/);
      const count = countMatch ? ` × ${countMatch[1]} licenc` : '';
      return `Arányos jóváírás — fel nem használt idő${period}${count}`;
    }
    // Proration charge: remaining time (positive amount)
    if (d.includes('remaining time')) {
      const afterMatch = desc.match(/after\s+([\w\s]+?)(?:\s*×|$)/i);
      const since = afterMatch ? ` (${afterMatch[1].trim()}-től)` : '';
      const countMatch = desc.match(/×\s*(\d+)\s*$/);
      const count = countMatch ? ` × ${countMatch[1]} licenc` : '';
      return `Arányos díj — hátralévő idő${since}${count}`;
    }
    // Regular subscription line
    if (d.includes('treatnote') || d.includes('monthly') || d.includes('yearly')) {
      const dateMatch = desc.match(/\(([^)]+)\)/);
      const period = dateMatch ? ` (${dateMatch[1]})` : '';
      const countMatch = desc.match(/^(\d+)\s*×/);
      const count = countMatch && parseInt(countMatch[1]) > 1 ? ` × ${countMatch[1]}` : '';
      return `Licenc előfizetés${count}${period}`;
    }
    // Fallback: strip Stripe artifacts
    return desc
      .replace(/^\d+\s*×\s*/, '')
      .replace(/×\s*\d+\s*$/, '')
      .replace('Unused time', 'Arányos jóváírás')
      .replace('Remaining time', 'Arányos díj')
      .trim() || 'Licenc előfizetés';
  }

  // Build a 1-year billing forecast grouped by license type.
  // - Monthly licenses: 12 monthly renewal entries starting from the license's own expires_at.
  // - Yearly licenses: 1 entry each at their expires_at.
  // All entries are merged and sorted by date.
  const forecastEntries = useMemo(() => {
    const all: {
      date: Date;
      amount: number;
      currency: string;
      seats: number;
      unitAmount: number;
      interval: 'monthly' | 'yearly';
      isNext: boolean;
    }[] = [];

    const now = new Date();
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() + 1);

    // Monthly licenses — use the billing day-of-month from sub.current_period_end
    // to generate rolling monthly entries (e.g. 10th of every month).
    // Falls back to next-month-from-today if no period end available.
    if (monthlyLicenses.length > 0) {
      const unitAmount = prices?.monthly?.unit_amount ?? 0;
      const currency = prices?.monthly?.currency ?? 'huf';

      // Find the billing day-of-month
      let billingDay = 1;
      if (sub?.current_period_end) {
        billingDay = new Date(sub.current_period_end as string).getDate();
      }

      // Start from the next occurrence of billingDay that is >= today
      const current = new Date(now.getFullYear(), now.getMonth(), billingDay);
      if (current <= now) current.setMonth(current.getMonth() + 1);

      for (let i = 0; i < 12; i++) {
        if (current > cutoff) break;
        all.push({
          date: new Date(current),
          amount: unitAmount * monthlyLicenses.length,
          currency,
          seats: monthlyLicenses.length,
          unitAmount,
          interval: 'monthly',
          isNext: false,
        });
        current.setMonth(current.getMonth() + 1);
      }
    }

    // Yearly licenses — each has its own expires_at
    if (yearlyLicenses.length > 0) {
      const unitAmount = prices?.yearly?.unit_amount ?? 0;
      const currency = prices?.yearly?.currency ?? 'huf';
      // Group all yearly licenses that expire on the same date
      const grouped: Record<string, number> = {};
      for (const lic of yearlyLicenses) {
        const raw = lic.expires_at ?? sub?.current_period_end ?? null;
        if (!raw) continue;
        const d = new Date(raw);
        if (d > cutoff) continue;
        const key = d.toISOString().slice(0, 10);
        grouped[key] = (grouped[key] ?? 0) + 1;
      }
      for (const [key, count] of Object.entries(grouped)) {
        all.push({
          date: new Date(key),
          amount: unitAmount * count,
          currency,
          seats: count,
          unitAmount,
          interval: 'yearly',
          isNext: false,
        });
      }
    }

    // Sort by date, then mark the globally next entry
    all.sort((a, b) => a.date.getTime() - b.date.getTime());
    if (all.length > 0) all[0].isNext = true;
    return all;
  }, [monthlyLicenses, yearlyLicenses, sub, prices]);

  // ─── Loading / error states ────────────────────────────────────────────────

  if (loading && !details) {
    return (
      <AnimatedCard>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </AnimatedCard>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Processing banner */}
      {polling && (
        <AnimatedCard className="border-accent/40">
          <CardContent className="flex items-center gap-3 py-2.5 px-4">
            <RefreshCw className="h-4 w-4 text-accent animate-spin" />
            <p className="text-sm text-muted-foreground">Fizetés feldolgozás alatt… kérjük, várjon.</p>
          </CardContent>
        </AnimatedCard>
      )}

      {/* Timeout banner */}
      {pollingTimedOut && (
        <AnimatedCard className="border-destructive/40">
          <CardContent className="flex items-center justify-between py-2.5 px-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">Nem érkezett meg a fizetés visszaigazolása. Frissítse az oldalt.</p>
            </div>
            <Button variant="outline" size="sm" onClick={startPolling} className="h-7 text-xs shrink-0">
              <RefreshCw className="h-3 w-3 mr-1" /> Újra
            </Button>
          </CardContent>
        </AnimatedCard>
      )}

      {/* Billing error banner */}
      {billingError && !details && (
        <AnimatedCard className="border-destructive/40">
          <CardContent className="flex items-center justify-between py-2.5 px-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">Betöltési hiba: {billingError}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={refresh} className="h-7 text-xs">
              <RefreshCw className="h-3 w-3 mr-1" /> Újra
            </Button>
          </CardContent>
        </AnimatedCard>
      )}

      {/* Action error */}
      {actionError && (
        <AnimatedCard className="border-destructive/40">
          <CardContent className="flex items-center justify-between gap-3 py-2.5 px-4">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive truncate">{actionError}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setActionError(null)} className="h-7 text-xs shrink-0">✕</Button>
          </CardContent>
        </AnimatedCard>
      )}

      {/* ── Sub-tabs ── */}
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as typeof subTab)} className="space-y-3">
        <TabsList className="bg-card/60 backdrop-blur-sm border border-primary/15 dark:border-sparkle-blue/15 p-0.5 h-8 w-full justify-start">
          <TabsTrigger value="overview" className="text-xs h-7 gap-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all">
            <LayoutDashboard className="h-3.5 w-3.5" /> Áttekintés
          </TabsTrigger>

          <TabsTrigger value="invoices" className="text-xs h-7 gap-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all">
            <Receipt className="h-3.5 w-3.5" /> Számlák
          </TabsTrigger>
          <TabsTrigger value="licenses" className="text-xs h-7 gap-1 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all">
            <ShieldCheck className="h-3.5 w-3.5" /> Licencek
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════
            Tab 1: Áttekintés (Overview)
        ══════════════════════════════════════════ */}
        <TabsContent value="overview" className="mt-0 space-y-3">

          {/* ── Hero status banner (no action buttons) ── */}
          <AnimatedCard className="overflow-hidden">
            <div className="px-4 pt-4 pb-4">
              {/* 3 mini metrics */}
              <div className="grid grid-cols-1 gap-2">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Users className="h-3 w-3" /> Licencek</p>
                  <p className="text-base font-bold mt-0.5 tabular-nums">{assignedLicenses.length}<span className="text-xs font-normal text-muted-foreground">/{licenses.length}</span></p>
                </div>
              </div>


            </div>
          </AnimatedCard>

          {/* ── Következő számlázások — hidden when subscription set to cancel ── */}
          {forecastEntries.length > 0 && !isCancelPending && (
            <AnimatedCard>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-accent" /> Következő számlázások
                </CardTitle>
                <CardDescription className="text-xs">Előre jelzett megújítások — 12 hónap</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 pb-1.5 border-b border-border/40 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span>Dátum</span>
                  <span className="text-center">Db</span>
                  <span className="text-center">Típus</span>
                  <span className="text-right">Összeg</span>
                </div>
                <div className="divide-y divide-border/30">
                  {forecastEntries.map((entry, idx) => {
                    const isOpen = expandedForecast === idx;
                    const dateStr = entry.date.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });
                    return (
                      <div key={idx}>
                        <button
                          onClick={() => setExpandedForecast(isOpen ? null : idx)}
                          className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-2 text-xs hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-2 text-left">
                            <div className={cn(
                              'w-1.5 h-1.5 rounded-full shrink-0',
                              entry.isNext ? 'bg-accent' : 'bg-muted-foreground/30'
                            )} />
                            <span className={cn('font-medium', entry.isNext && 'text-accent')}>{dateStr}</span>
                            {entry.isNext && (
                              <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-accent/40 text-accent shrink-0">Következő</Badge>
                            )}
                          </div>
                          <span className="text-center font-medium tabular-nums">{entry.seats}</span>
                          <span className="text-center">
                            <Badge variant="outline" className={cn(
                              'text-[9px] h-4 px-1.5',
                              entry.interval === 'yearly' ? 'border-accent/30 text-accent' : 'border-primary/30 text-primary'
                            )}>
                              {entry.interval === 'monthly' ? 'Havi' : 'Éves'}
                            </Badge>
                          </span>
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="font-semibold tabular-nums">{formatCurrency(entry.amount, entry.currency)}</span>
                            <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform duration-200 shrink-0', isOpen && 'rotate-180')} />
                          </div>
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-3 pt-1.5 bg-muted/20 border-t border-border/20">
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">{entry.seats} licenc × {formatCurrency(entry.unitAmount, entry.currency)} / {entry.interval === 'monthly' ? 'hó' : 'év'}</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(entry.amount, entry.currency)}</span>
                              </div>
                              {/* Show real Stripe lines for the very next renewal */}
                              {entry.isNext && details?.upcoming_invoice?.lines && details.upcoming_invoice.lines.length > 1 && (
                                <>
                                  <div className="border-t border-border/20 mt-1.5 pt-1.5" />
                                  {details.upcoming_invoice.lines.map((line, li) => {
                                    const isCredit = line.amount < 0;
                                    return (
                                      <div key={li} className="flex justify-between items-start text-xs gap-2">
                                        <span className="text-muted-foreground">{translateLine(line.description)}</span>
                                        <span className={cn(
                                          'tabular-nums font-medium shrink-0',
                                          isCredit ? 'text-green-500' : 'text-foreground'
                                        )}>
                                          {isCredit ? '− ' : '+ '}{formatCurrency(Math.abs(line.amount), details.upcoming_invoice!.currency)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </AnimatedCard>
          )}


        </TabsContent>



        {/* ══════════════════════════════════════════
            Tab 3: Számlák
        ══════════════════════════════════════════ */}
        <TabsContent value="invoices" className="mt-0">
          <AnimatedCard>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Receipt className="h-4 w-4 text-accent" /> Számlák
              </CardTitle>
              <CardDescription className="text-xs">Legutóbbi Stripe számlák</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : invoices.length > 0 ? (
                <ScrollArea className="h-[340px]">
                  <div className="divide-y divide-border/40 px-2 py-2">
                    {invoices.map(inv => <InvoiceRow key={inv.id} invoice={inv} />)}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <Receipt className="h-7 w-7 opacity-40" />
                  <p className="text-sm">Még nincs számla.</p>
                  {companyId && (
                    <Button variant="ghost" size="sm" onClick={() => setInvoicesLoaded(false)} className="h-7 text-xs">
                      <RefreshCw className="h-3 w-3 mr-1" /> Frissítés
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </AnimatedCard>
        </TabsContent>

        {/* ══════════════════════════════════════════
            Tab 4: Licencek
        ══════════════════════════════════════════ */}
        <TabsContent value="licenses" className="mt-0 space-y-3">

          {/* ── Solo: buy one license or manage subscription ── */}
          {isSolo && (
            <AnimatedCard>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent" /> Licenc kezelése
                </CardTitle>
                <CardDescription className="text-xs">
                  Egyfelhasználós előfizetés — 1 havi licenc, automatikus megújítással.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {!hasSubscription ? (
                  /* No active subscription → buy button */
                  <GalaxyButton
                    onClick={() => handleBuyLicenses('monthly')}
                    disabled={actionLoading}
                    className="w-full"
                  >
                    {actionLoading ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Feldolgozás…</>
                    ) : (
                      <><CreditCard className="h-4 w-4 mr-2" /> 1 havi licenc vásárlása</>
                    )}
                  </GalaxyButton>
                ) : (
                  /* Active subscription → management */
                  <div className="space-y-3">
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
                        onClick={() => handleToggleRebilling(isCancelPending)}
                        disabled={actionLoading}
                        className={cn(
                          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50',
                          isCancelPending ? 'bg-muted-foreground/30' : 'bg-accent'
                        )}
                        aria-label="Megújítás kapcsoló"
                      >
                        <span
                          className={cn(
                            'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
                            isCancelPending ? 'translate-x-1' : 'translate-x-6'
                          )}
                        />
                      </button>
                    </div>

                    {isCancelPending && (
                      <p className="text-xs text-muted-foreground px-1">
                        Az előfizetés az időszak végén megszűnik. Kapcsold vissza a megújítást a fenntartáshoz.
                      </p>
                    )}

                    {/* Terminate immediately button */}
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      disabled={actionLoading}
                      onClick={() => handleCancelSubscription({ immediately: true })}
                    >
                      {actionLoading ? (
                        <><RefreshCw className="h-3 w-3 mr-2 animate-spin" /> Feldolgozás…</>
                      ) : (
                        'Előfizetés azonnali lemondása'
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </AnimatedCard>
          )}

          {/* LicenseManagementTable: always shown for non-solo companies */}
          {!isSolo && (
            licensesLoading ? (
              <AnimatedCard>
                <CardContent className="flex items-center justify-center py-8">
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                </CardContent>
              </AnimatedCard>
            ) : (
              <LicenseManagementTable
                licenses={licenses}
                users={klinikaUsers}
                companyId={companyId}
                telephelyId={telephelyId}
                seats={sub?.seats ?? licenses.length}
                isCancelPending={isCancelPending}
                actionLoading={actionLoading}
                onRefresh={fetchLicenses}
                onUpdateSeats={handleUpdateSeats}
              />
            )
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── AddCardFormInner ─────────────────────────────────────────────────────────
// Must be rendered inside <Elements> provider.
// Card data goes directly browser → Stripe (PCI-compliant). We never see it.

function AddCardFormInner({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setCardError(null);
    try {
      const { error } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          // No return_url — we use redirect:'if_required' so cards stay on-page
          return_url: window.location.href,
        },
        redirect: 'if_required',
      });
      if (error) {
        setCardError(error.message ?? 'Sikertelen kártyamentés.');
      } else {
        onSuccess();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <PaymentElement options={{ layout: 'tabs' }} />
      {cardError && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" /> {cardError}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={submitting || !stripe} className="flex-1 h-8 text-xs">
          {submitting ? <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> : null}
          {submitting ? 'Mentés…' : 'Kártya mentése'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting} className="h-8 text-xs">
          Mégse
        </Button>
      </div>
    </form>
  );
}

// ─── LicenseManagementTable ───────────────────────────────────────────────────

interface LicMgmtProps {
  licenses: Array<{
    id: string;
    assigned_user_id: string | null;
    status: string;
    billing_interval: string;
    license_type: string;
    expires_at: string | null;
    cancel_at_period_end: boolean;
  }>;
  users: KlinikaUser[];
  companyId: string | null;
  telephelyId: string | null | undefined;
  seats: number;
  isCancelPending: boolean;
  actionLoading: boolean;
  onRefresh: () => void;
  onUpdateSeats: (n: number) => void;
}

type StagedChange =
  | { type: 'cancel'; ids: string[]; reactivate: boolean }
  | { type: 'switch_interval'; id: string; interval: 'monthly' | 'yearly' }
  | { type: 'update_seats'; seats: number };

function LicenseManagementTable({
  licenses, users, companyId, telephelyId, seats, isCancelPending, actionLoading, onRefresh, onUpdateSeats,
}: LicMgmtProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Cart state: store planned changes before executing
  const [stagedIntervalChanges, setStagedIntervalChanges] = useState<Record<string, 'monthly' | 'yearly'>>({});
  const [stagedCancelIds, setStagedCancelIds] = useState<Set<string>>(new Set());
  const [stagedReactivateIds, setStagedReactivateIds] = useState<Set<string>>(new Set());

  const [stagedMonthlySeats, setStagedMonthlySeats] = useState<number | null>(null);


  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);

  const hasStagedChanges = Object.keys(stagedIntervalChanges).length > 0
    || stagedCancelIds.size > 0
    || stagedReactivateIds.size > 0
    || (stagedMonthlySeats !== null && stagedMonthlySeats > 0);

  const userMap = useMemo(() => {
    const m: Record<string, KlinikaUser> = {};
    users.forEach(u => { m[u.id] = u; });
    return m;
  }, [users]);

  const allIds = licenses.filter(l => l.license_type !== 'trial').map(l => l.id);
  const allSelected = selected.size === allIds.length && allIds.length > 0;
  const someSelected = selected.size > 0;

  function toggleAll() { setSelected(allSelected ? new Set() : new Set(allIds)); }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ─── Queue actions (local state only) ──────────────────────────────

  function queueCancel(ids: string[], reactivate: boolean) {
    if (reactivate) {
      setStagedReactivateIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
      setStagedCancelIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    } else {
      setStagedCancelIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
      setStagedReactivateIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    }
    setSelected(new Set());
  }

  // Individually toggle each license: renewing → cancel, not renewing → reactivate
  function queueToggle(ids: string[]) {
    setStagedCancelIds(prev => {
      const n = new Set(prev);
      ids.forEach(id => {
        const isRenewing = stagedReactivateIds.has(id)
          ? true
          : stagedCancelIds.has(id)
            ? false
            : !(licenses.find(l => l.id === id)?.cancel_at_period_end ?? false);
        if (isRenewing) { n.add(id); } else { n.delete(id); }
      });
      return n;
    });
    setStagedReactivateIds(prev => {
      const n = new Set(prev);
      ids.forEach(id => {
        const isRenewing = stagedReactivateIds.has(id)
          ? true
          : stagedCancelIds.has(id)
            ? false
            : !(licenses.find(l => l.id === id)?.cancel_at_period_end ?? false);
        if (!isRenewing) { n.add(id); } else { n.delete(id); }
      });
      return n;
    });
    setSelected(new Set());
  }

  function queueIntervalSwitch(id: string, newInterval: 'monthly' | 'yearly') {
    const lic = licenses.find(l => l.id === id);
    if (!lic) return;
    setStagedIntervalChanges(prev => {
      const next = { ...prev };
      if (lic.billing_interval === newInterval) {
        delete next[id];
      } else {
        next[id] = newInterval;
      }
      return next;
    });
  }

  // ─── Execute all staged changes ────────────────────────────────────

  async function executeTransaction() {
    if (!hasStagedChanges) { toast.error('Nincs várható tranzakció.'); return; }
    if (!companyId) { toast.error('Hiba: company_id hiányzik. Kérlek frissítsd az oldalt.'); return; }
    setBulkLoading(true);
    let errorMsgs: string[] = [];
    // When the checkout modal opens we must NOT call onRefresh() — that would toggle
    // licensesLoading and unmount LicenseManagementTable, destroying checkoutClientSecret state
    // before the modal can render. The modal's own onSuccess callback triggers the refresh.
    let skipRefresh = false;

    try {
      // We need to build an items array for checkout or cancel
      // Exclude trial licenses from base paid seat counts
      const baseMonthlySeats = licenses.filter(l => l.billing_interval === "monthly" && l.license_type !== 'trial').length;
      const finalMonthly = stagedMonthlySeats !== null ? stagedMonthlySeats : baseMonthlySeats;

      // 1. Turn off / Turn on auto-renewal in ONE atomic call.
      // Sending cancel_ids and reactivate_ids together lets the edge function
      // make a SINGLE net Stripe quantity update per subscription item,
      // avoiding the race condition where two sequential Stripe calls produce
      // overlapping webhooks that corrupt the quantity.
      if (stagedCancelIds.size > 0 || stagedReactivateIds.size > 0) {
        try {
          await cancelLicense(companyId, [], {
            cancel_ids: Array.from(stagedCancelIds),
            reactivate_ids: Array.from(stagedReactivateIds),
            immediately: false,
          });
        } catch (e: any) { console.error(e); errorMsgs.push('Megújítás módosítás hiba: ' + e.message); }
      }

      // 3. Process interval changes (monthly only)
      const toMonthly = Object.entries(stagedIntervalChanges).filter(([_, int]) => int === 'monthly').map(([id]) => id);
      if (toMonthly.length > 0) {
        try { await switchLicenseInterval(companyId, toMonthly, 'monthly'); }
        catch (e: any) { console.error(e); errorMsgs.push("Havi váltás hiba: " + e.message); }
      }

      // 4. Seat purchases (Checkout Modal) — stagedMonthlySeats is the quantity to buy
      if (stagedMonthlySeats && stagedMonthlySeats > 0) {
        try {
          const itemsToBuy = [{ price_id: PRICE_IDS.monthly, seats: stagedMonthlySeats }];

          if (itemsToBuy.length > 1) {
            throw new Error("A Stripe nem engedélyezi Havi és Éves licencek egyidejű vásárlását egyetlen tranzakcióban. Kérjük, vásárolja meg őket külön lépésekben.");
          }

          if (itemsToBuy.length > 0) {
            const data = await createEmbeddedCheckoutMultiple(companyId, telephelyId || '', itemsToBuy);
            if (data?.client_secret) {
              setCheckoutClientSecret(data.client_secret);
              // Skip onRefresh() — if we call it here the licensesLoading toggle unmounts
              // this component and destroys checkoutClientSecret before the modal renders.
              // The CheckoutModal's onSuccess callback will trigger onRefresh when done.
              skipRefresh = true;
              return;
            } else {
              throw new Error("Nem sikerült elindítani a fizetést.");
            }
          }
        } catch (e: any) {
          console.error("Seat purchase failed:", e);
          errorMsgs.push(e.message);
        }
      }

      if (errorMsgs.length === 0) {
        toast.success('Kért tranzakció sikeresen végrehajtva.');
        // Clear cart
        setStagedIntervalChanges({});
        setStagedCancelIds(new Set());
        setStagedReactivateIds(new Set());
        setStagedMonthlySeats(null);
      } else {
        toast.error(`A tranzakció befejeződött, de hiba történt:\n${errorMsgs.join('\n')}`);
      }

    } finally {
      setBulkLoading(false);
      if (!skipRefresh) onRefresh(); // Refresh data to get true state from server
    }
  }

  const trialLicenses = licenses.filter(l => l.license_type === 'trial');
  const paidLicenses = licenses.filter(l => l.license_type !== 'trial');

  // Seat counts — monthly paid licenses only
  const baseMonthly = paidLicenses.filter(l => l.billing_interval === 'monthly').length;
  const projectedMonthly = stagedMonthlySeats ?? baseMonthly;

  const assignedCount = paidLicenses.filter(l => l.assigned_user_id).length;
  const assignedMonthlyCount = paidLicenses.filter(l => l.assigned_user_id && l.billing_interval === 'monthly').length;

  const displaySeats = projectedMonthly;

  return (
    <>
      {/* ── Trial license section ── */}
      {trialLicenses.length > 0 && (
        <AnimatedCard className="border border-primary/20 bg-primary/5 dark:bg-primary/10 overflow-hidden mb-3">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="text-primary">🎁</span> Próbaidőszak licenc
              <span className="ml-auto inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">Aktív</span>
            </CardTitle>
          </CardHeader>
          <div className="divide-y divide-border/30">
            {trialLicenses.map(lic => {
              const userMap2: Record<string, KlinikaUser> = {};
              users.forEach(u => { userMap2[u.id] = u; });
              const user = lic.assigned_user_id ? userMap2[lic.assigned_user_id] : null;
              const displayName = user ? (user.full_name || user.email) : null;
              const expiresAt = lic.expires_at ? new Date(lic.expires_at) : null;
              const diff = expiresAt ? expiresAt.getTime() - Date.now() : 0;
              const days = Math.max(0, Math.floor(diff / 86_400_000));
              const hours = Math.max(0, Math.floor((diff % 86_400_000) / 3_600_000));
              const minutes = Math.max(0, Math.floor((diff % 3_600_000) / 60_000));
              return (
                <div key={lic.id} className="px-4 py-3 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                      {displayName ? displayName.charAt(0).toUpperCase() : '–'}
                    </div>
                    <div>
                      <p className="font-medium">{displayName ?? <span className="italic text-muted-foreground">Szabad</span>}</p>
                      {user?.full_name && <p className="text-[9px] text-muted-foreground">{user.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    {expiresAt && (
                      <span className="tabular-nums text-[11px]">
                        <span className="text-primary font-semibold">{days}n {hours}ó {minutes}p</span> hátralévő
                      </span>
                    )}
                    <span className="text-[10px] opacity-60">{expiresAt ? expiresAt.toLocaleDateString('hu-HU') : '–'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </AnimatedCard>
      )}

      {/* ── Paid license table (always visible so user can buy) ── */}
      <AnimatedCard className="overflow-hidden">

        {/* Compact Card header: summary + Tranzakció button */}
        <CardHeader className="pb-3 pt-4 px-4 border-b border-border/40">
          <div className="flex items-center justify-between flex-wrap gap-4">

            {/* Left side: Title + Seat adjuster */}
            <div className="flex items-center gap-6">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> Licenc &amp; Csomag kezelés
              </CardTitle>

              <div className="flex items-center gap-3 border-l border-border/40 pl-6">
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">Licencek kezelése:</span>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-cyan-700 dark:text-cyan-400">Licence vétel</span>
                    <LicSeatAdjuster
                      total={stagedMonthlySeats ?? 0}
                      min={0}
                      onSave={(val) => setStagedMonthlySeats(val)}
                      disabled={bulkLoading || actionLoading}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right side: Subscription actions + Execute button */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Buy more */}
              <Button
                size="sm"
                className={cn("h-8 text-xs ml-1 transition-all", hasStagedChanges ? "bg-primary hover:bg-primary/90" : "bg-muted text-muted-foreground")}
                disabled={!hasStagedChanges || bulkLoading}
                onClick={executeTransaction}
              >
                {bulkLoading ? <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> : null}
                Tranzakció végrehajtása
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Cart Summary (Várható Tranzakciók) */}
        {hasStagedChanges && (
          <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-3">
            <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 mb-2 flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Várható Tranzakciók (Kosár)
            </p>
            <ul className="space-y-1.5 text-[11px] text-yellow-800 dark:text-yellow-300">
              {stagedMonthlySeats !== null && stagedMonthlySeats > 0 && (
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-600/50 dark:bg-cyan-400/50 shrink-0" />
                  +{stagedMonthlySeats} új Havi licenc vásárlása
                </li>
              )}



              {Object.entries(stagedIntervalChanges).map(([id, int]) => {
                const u = userMap[licenses.find(l => l.id === id)?.assigned_user_id ?? ''];
                const name = u ? (u.full_name || u.email) : 'Szabad licenc';
                return (
                  <li key={`int-${id}`} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/50 shrink-0" />
                    <span>Csomagváltás Havira: <span className="font-medium">{name}</span></span>
                  </li>
                );
              })}

              {Array.from(stagedCancelIds).map(id => {
                const u = userMap[licenses.find(l => l.id === id)?.assigned_user_id ?? ''];
                const name = u ? (u.full_name || u.email) : 'Szabad licenc';
                return (
                  <li key={`cancel-${id}`} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500/50 shrink-0" />
                    <span className="text-red-800 dark:text-red-300">Licenc lemondása: <span className="font-medium">{name}</span></span>
                  </li>
                );
              })}

              {Array.from(stagedReactivateIds).map(id => {
                const u = userMap[licenses.find(l => l.id === id)?.assigned_user_id ?? ''];
                const name = u ? (u.full_name || u.email) : 'Szabad licenc';
                return (
                  <li key={`re-${id}`} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500/50 shrink-0" />
                    <span className="text-green-800 dark:text-green-300">Lemondás visszavonása: <span className="font-medium">{name}</span></span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Selection action bar — paid licenses only */}
        {someSelected && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 bg-primary/5 border-b border-primary/20">
            <span className="text-xs font-medium text-primary">{selected.size} kiválasztva</span>
            <div className="flex items-center gap-2">
              {(() => {
                const selArr = Array.from(selected);
                const renewingIds = selArr.filter(id => {
                  // Check staged state first, then per-license DB state
                  if (stagedReactivateIds.has(id)) return true;
                  if (stagedCancelIds.has(id)) return false;
                  const lic = licenses.find(l => l.id === id);
                  return lic ? !lic.cancel_at_period_end : true;
                });
                const allRenewing = renewingIds.length === selArr.length;
                const noneRenewing = renewingIds.length === 0;
                const isMixed = !allRenewing && !noneRenewing;
                const label = allRenewing
                  ? 'Megújítások kikapcsolása'
                  : noneRenewing
                    ? 'Megújítások bekapcsolása'
                    : 'Megújítások ki/be-kapcsolása';
                return (
                  <GalaxyButton
                    size="sm"
                    onClick={() =>
                      isMixed ? queueToggle(selArr) : queueCancel(selArr, noneRenewing)
                    }
                    disabled={bulkLoading}
                    className="h-7 text-[11px]"
                  >
                    {label}
                  </GalaxyButton>
                );
              })()}

              {/* Immediate cancel — destructive, requires confirm */}
              <GalaxyButton
                size="sm"
                disabled={actionLoading || bulkLoading}
                onClick={() => setShowCancelConfirm(true)}
                className="h-7 text-[11px]"
              >
                Licenc azonnali lemondása
              </GalaxyButton>
              <button onClick={() => setSelected(new Set())}
                className="text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── Azonnali lemondás megerősítő dialog ── */}
        <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
          <DialogContent className="max-w-md border border-destructive/30 bg-background shadow-2xl shadow-destructive/10">
            <DialogHeader className="gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/20">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <DialogTitle className="text-base">Kiválasztott licenc(ek) azonnali lemondása</DialogTitle>
              </div>
              <DialogDescription className="text-sm leading-relaxed pl-[52px]">
                Biztosan azonnal le kívánja mondani a kiválasztott licenc(ek)et?
              </DialogDescription>
            </DialogHeader>
            <div className="mx-4 my-1 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Ez a művelet{' '}
              <span className="font-semibold">visszavonhatatlan</span>{' '}
              — a kiválasztott licencek azonnal törlésre kerülnek!
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCancelConfirm(false)}
                disabled={bulkLoading}
              >
                Mégse
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkLoading}
                onClick={async () => {
                  if (!companyId) return;
                  if (selected.size === 0) {
                      toast.error("Nincs licenc kiválasztva.");
                      return;
                  }
                  setShowCancelConfirm(false);
                  setBulkLoading(true);
                  try {
                    await cancelLicense(companyId, Array.from(selected), { immediately: true });
                    toast.success('Kiválasztott licenc(ek) azonnal lemondva.');
                    setSelected(new Set());
                    onRefresh();
                  } catch (e: any) { toast.error(e.message); }
                  finally { setBulkLoading(false); }
                }}
              >
                {bulkLoading ? (
                  <><RefreshCw className="h-3 w-3 animate-spin mr-1.5" /> Feldolgozás...</>
                ) : (
                  'Igen, azonnal lemondom'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* License table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded border-border accent-primary cursor-pointer" />
                </th>
                <th className="text-left text-[11px] text-muted-foreground py-2.5 font-normal">Felhasználó</th>
                <th className="text-center text-[11px] text-muted-foreground py-2.5 font-normal">Elszámolás</th>
                <th className="text-center text-[11px] text-muted-foreground py-2.5 font-normal">Lejárat</th>
                <th className="text-center text-[11px] text-muted-foreground py-2.5 font-normal">Megújítás</th>
                <th className="text-center text-[11px] text-muted-foreground py-2.5 font-normal">Állapot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {licenses.map((lic) => {
                if (lic.license_type === 'trial') return null;  // trial shown in its own card above
                const user = lic.assigned_user_id ? userMap[lic.assigned_user_id] : null;

                // Resolve actual vs planned states
                const plannedInterval = stagedIntervalChanges[lic.id] || lic.billing_interval;
                const isMonthly = plannedInterval === 'monthly';

                const isPlannedCancel = stagedCancelIds.has(lic.id);
                const isPlannedReactivate = stagedReactivateIds.has(lic.id);
                // Per-license: staged overrides, then fall back to the license's own DB field
                const effCancelPending = isPlannedCancel ? true : isPlannedReactivate ? false : lic.cancel_at_period_end;

                const isRowModified = !!stagedIntervalChanges[lic.id] || isPlannedCancel || isPlannedReactivate;

                const isLoading = rowLoading[lic.id];
                const isChecked = selected.has(lic.id);
                const displayName = user ? (user.full_name || user.email) : null;

                return (
                  <tr key={lic.id} className={cn(
                    'transition-colors hover:bg-muted/20',
                    isChecked && 'bg-primary/5',
                    isRowModified && 'bg-yellow-500/10 hover:bg-yellow-500/20' // Highlight rows with pending changes
                  )}>

                    {/* Checkbox */}
                    <td className="px-3 py-2.5 w-8">
                      <input type="checkbox" checked={isChecked} onChange={() => toggleOne(lic.id)}
                        className="w-3.5 h-3.5 rounded border-border accent-primary cursor-pointer" />
                    </td>

                    {/* User */}
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                          user
                            ? isMonthly ? 'bg-cyan-600/10 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400' : 'bg-green-600/10 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                            : 'bg-muted/60 border border-dashed border-border/60 text-muted-foreground',
                        )}>
                          {displayName ? displayName.charAt(0).toUpperCase() : '–'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[130px]">
                            {displayName ?? <span className="italic text-muted-foreground">Szabad</span>}
                          </p>
                          {user?.full_name && (
                            <p className="text-[9px] text-muted-foreground truncate max-w-[130px]">{user.email}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Billing interval — read-only badge */}
                    <td className="py-2.5 text-center">
                      <span className={cn(
                        'inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium',
                        isMonthly
                          ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
                          : 'bg-green-500/10 text-green-700 dark:text-green-400'
                      )}>
                        {isMonthly ? 'Havi' : 'Éves'}
                      </span>
                    </td>

                    {/* Expiry */}
                    <td className="py-2.5 text-center text-muted-foreground">
                      {lic.expires_at ? formatDate(lic.expires_at) : '–'}
                    </td>

                    {/* Renewal status */}
                    <td className="py-2.5 text-center">
                      {effCancelPending
                        ? <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-medium">Ki</span>
                        : <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-medium">Be</span>
                      }
                    </td>

                    {/* Status */}
                    <td className="py-2.5 text-center">
                      {effCancelPending
                        ? <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-medium">Lemond</span>
                        : lic.status === 'assigned'
                          ? <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-medium">Aktív</span>
                          : <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium">Szabad</span>
                      }
                    </td>

                    {/* No per-row action */}
                    <td className="py-2.5 pr-4 text-right" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </AnimatedCard>

      {checkoutClientSecret && (
        <CheckoutModal
          clientSecret={checkoutClientSecret}
          onClose={() => {
            setCheckoutClientSecret(null);
            setBulkLoading(false);
          }}
          onComplete={() => {
            setCheckoutClientSecret(null);
            setBulkLoading(false);
            setStagedMonthlySeats(null);

            setStagedIntervalChanges({});
            setStagedCancelIds(new Set());
            setStagedReactivateIds(new Set());
            onRefresh();
            toast.success("Sikeres licenc vásárlás!");
          }}
        />
      )}
    </>
  );
}

// ─── LicSeatAdjuster ─────────────────────────────────────────────────────────

function LicSeatAdjuster({ total, min, onSave, disabled }: {
  total: number; min: number; onSave: (n: number) => void; disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 border border-border/60">
        <button
          className="w-6 h-6 rounded-lg hover:bg-background flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          disabled={disabled || total <= min}
          onClick={() => onSave(Math.max(min, total - 1))}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-8 text-center font-bold text-sm tracking-tight">{total}</span>
        <button
          className="w-6 h-6 rounded-lg hover:bg-background flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          disabled={disabled || total >= 500}
          onClick={() => onSave(Math.min(500, total + 1))}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
