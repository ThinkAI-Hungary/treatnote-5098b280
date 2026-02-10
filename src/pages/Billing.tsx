import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Users, ArrowRight, Minus, Plus, ExternalLink, RefreshCw, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

const MONTHLY_PRICE_ID = "price_1Sz1XkDG9IVOU80stgzB49Nq";
const YEARLY_PRICE_ID = "price_1SzFbZDG9IVOU80soy18oPwM";

interface CompanySubscription {
  id: string;
  name: string;
  subscription_status: string;
  subscription_price_id: string | null;
  seats: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_item_id: string | null;
}

export default function Billing() {
  const { session } = useAuth();
  const { isKlinikaAdmin, companyId, loading: rolesLoading } = useCachedRoles();
  const [searchParams] = useSearchParams();
  const [company, setCompany] = useState<CompanySubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [seatCount, setSeatCount] = useState(1);
  const [polling, setPolling] = useState(false);

  const fetchCompany = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, subscription_status, subscription_price_id, seats, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_item_id')
      .eq('id', companyId)
      .single();
    if (!error && data) setCompany(data as CompanySubscription);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { if (!rolesLoading) fetchCompany(); }, [rolesLoading, fetchCompany]);

  // Poll after checkout success
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
        toast.success('Előfizetés aktiválva!');
      }
    }, 3000);
    const timeout = setTimeout(() => { setPolling(false); clearInterval(interval); }, 60000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [searchParams, companyId, fetchCompany]);

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

  async function handleCheckout() {
    if (!companyId) return;
    setActionLoading(true);
    try {
      const priceId = selectedPlan === 'monthly' ? MONTHLY_PRICE_ID : YEARLY_PRICE_ID;
      const data = await invokeFunction('create-checkout-session', {
        company_id: companyId,
        price_id: priceId,
        seats: seatCount,
      });
      if (data?.url) window.location.href = data.url;
      else toast.error('Nem sikerült a fizetési munkamenet létrehozása.');
    } catch (err: any) {
      toast.error(err?.message || 'Hiba történt.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUpdateSeats(newSeats: number) {
    if (!companyId) return;
    setActionLoading(true);
    try {
      await invokeFunction('update-seats', { company_id: companyId, new_seats: newSeats });
      toast.success(`Licence szám frissítve: ${newSeats}`);
      fetchCompany();
    } catch (err: any) {
      toast.error(err?.message || 'Hiba történt.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSwitchPlan() {
    if (!companyId || !company) return;
    const newPriceId = company.subscription_price_id === MONTHLY_PRICE_ID ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID;
    setActionLoading(true);
    try {
      await invokeFunction('switch-plan', { company_id: companyId, new_price_id: newPriceId });
      toast.success('Csomag váltás elindítva!');
      fetchCompany();
    } catch (err: any) {
      toast.error(err?.message || 'Hiba történt.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePortal() {
    if (!companyId) return;
    setActionLoading(true);
    try {
      const data = await invokeFunction('create-portal-session', { company_id: companyId });
      if (data?.url) window.location.href = data.url;
      else toast.error('Nem sikerült megnyitni a számlázási portált.');
    } catch (err: any) {
      toast.error(err?.message || 'Hiba történt.');
    } finally {
      setActionLoading(false);
    }
  }

  if (rolesLoading || loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Számlázás</h1>
          <p className="text-muted-foreground mt-1">Betöltés...</p>
        </div>
      </div>
    );
  }

  if (!isKlinikaAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Számlázás</h1>
          <p className="text-muted-foreground mt-1">Előfizetés és számlázási információk</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center max-w-sm">
              Az előfizetés kezelése a klinika adminisztrátor feladata. Kérjük, forduljon a klinika adminisztrátorához.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isActive = company?.subscription_status === 'active';
  const isPastDue = company?.subscription_status === 'past_due';
  const currentPlanLabel = company?.subscription_price_id === YEARLY_PRICE_ID ? 'Éves' : 'Havi';
  const otherPlanLabel = company?.subscription_price_id === YEARLY_PRICE_ID ? 'Havi' : 'Éves';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Számlázás</h1>
        <p className="text-muted-foreground mt-1">
          {company?.name} – Előfizetés és licence kezelés
        </p>
      </div>

      {polling && (
        <Card className="border-accent">
          <CardContent className="flex items-center gap-3 py-4">
            <RefreshCw className="h-5 w-5 text-accent animate-spin" />
            <p className="text-sm">Fizetés feldolgozás alatt... Kérjük, várjon.</p>
          </CardContent>
        </Card>
      )}

      {/* Active subscription management */}
      {(isActive || isPastDue) && company && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Státusz</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant={isActive ? 'default' : 'destructive'} className="text-sm">
                  {isActive ? 'Aktív' : 'Lejárt fizetés'}
                </Badge>
                {company.cancel_at_period_end && (
                  <p className="text-xs text-muted-foreground mt-1">Lemondás a periódus végén</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Csomag</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{currentPlanLabel}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Licencek</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{company.seats}</p>
              </CardContent>
            </Card>
          </div>

          {company.current_period_end && (
            <p className="text-sm text-muted-foreground">
              Következő megújítás: {new Date(company.current_period_end).toLocaleDateString('hu-HU')}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Seat management */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Licencek kezelése
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={actionLoading || company.seats <= 1}
                    onClick={() => handleUpdateSeats(company.seats - 1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="text-2xl font-bold min-w-[3rem] text-center">{company.seats}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={actionLoading || company.seats >= 500}
                    onClick={() => handleUpdateSeats(company.seats + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Az arányos elszámolás automatikusan történik.
                </p>
              </CardContent>
            </Card>

            {/* Plan switching */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowRight className="h-5 w-5" />
                  Csomag váltás
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Jelenlegi: <strong>{currentPlanLabel}</strong>
                </p>
                <Button onClick={handleSwitchPlan} disabled={actionLoading} variant="outline">
                  Váltás {otherPlanLabel} csomagra
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium">Stripe számlázási portál</p>
                <p className="text-sm text-muted-foreground">Számlák, fizetési mód, lemondás</p>
              </div>
              <Button onClick={handlePortal} disabled={actionLoading} variant="outline">
                <ExternalLink className="h-4 w-4 mr-2" />
                Megnyitás
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* New subscription purchase */}
      {!isActive && !isPastDue && !polling && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              className={`cursor-pointer transition-all ${selectedPlan === 'monthly' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelectedPlan('monthly')}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Havi
                  {selectedPlan === 'monthly' && <Check className="h-5 w-5 text-primary" />}
                </CardTitle>
                <CardDescription>Rugalmas, havi elszámolás</CardDescription>
              </CardHeader>
            </Card>
            <Card
              className={`cursor-pointer transition-all ${selectedPlan === 'yearly' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelectedPlan('yearly')}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Éves
                  {selectedPlan === 'yearly' && <Check className="h-5 w-5 text-primary" />}
                </CardTitle>
                <CardDescription>Kedvezményes éves elszámolás</CardDescription>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Licencek száma
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" disabled={seatCount <= 1} onClick={() => setSeatCount((s) => Math.max(1, s - 1))}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="text-2xl font-bold min-w-[3rem] text-center">{seatCount}</span>
                <Button variant="outline" size="icon" disabled={seatCount >= 500} onClick={() => setSeatCount((s) => Math.min(500, s + 1))}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Button
            size="lg"
            className="w-full"
            onClick={handleCheckout}
            disabled={actionLoading}
          >
            <CreditCard className="h-5 w-5 mr-2" />
            Előfizetés indítása
          </Button>
        </div>
      )}
    </div>
  );
}
