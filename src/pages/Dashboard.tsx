import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { useFlexiConnection } from '@/hooks/useFlexiConnection';
import { useSzotar } from '@/hooks/useSzotar';
import { supabase } from '@/integrations/supabase/client';
import { notifySzotarDataChanged } from '@/lib/szotarEvents';
import {
  Users, Calendar, Stethoscope, TrendingUp,
  Globe, TestTube, Link2, BookOpen, ClipboardList,
  CheckCircle2, Circle, Sparkles, Star,
  Phone, UserCog, PartyPopper, Loader2, Pencil, AlertTriangle
} from 'lucide-react';
import { PageLoader } from '@/components/PageLoader';
import { usePageLoadingSignal } from '@/contexts/PageLoadingContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DomainDialog } from '@/components/klinika/DomainDialog';
import { ProbaPaciensDialog } from '@/components/klinika/ProbaPaciensDialog';
import FlexiConnectDialog from '@/components/profile/FlexiConnectDialog';
import { notifyFlexiConnectionChanged } from '@/hooks/useFlexiConnection';

interface OnboardingStep {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  completed: boolean;
  adminOnly: boolean;
  actionLabel?: string;
  currentValue?: string | null;
  editable?: boolean;
  warning?: string | null;
}

interface KlinikaAdminContact {
  full_name: string | null;
  phone: string | null;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { isKlinikaAdmin, isAdmin, isInitialized: rolesInitialized } = useCachedRoles();
  const { isConnected: isFlexiConnected, flexiUsername, isLoading: isFlexiLoading, refetch: refetchFlexi } = useFlexiConnection();
  const {
    hasSzotar, hasProbaPaciens, hasFlexiDomain,
    flexiDomain, probaPaciensNeve,
    isLoading: szotarLoading, refresh: refreshSzotar,
  } = useSzotar();

  const [hasRules, setHasRules] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [klinikaAdmins, setKlinikaAdmins] = useState<KlinikaAdminContact[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [recentExaminations, setRecentExaminations] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  // Dialog states
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [probaDialogOpen, setProbaDialogOpen] = useState(false);
  const [flexiDialogOpen, setFlexiDialogOpen] = useState(false);

  // Loading states for webhook steps
  const [szotarGenerating, setSzotarGenerating] = useState(false);
  const [szabalyokGenerating, setSzabalyokGenerating] = useState(false);

  // Flexi connection failure tracking
  const [flexiConnectionFailed, setFlexiConnectionFailed] = useState(false);

  // Active telephely / company IDs
  const activeTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id;
  const activeCompanyId = profile?.company_id;

  // Fetch treatment_rules count
  useEffect(() => {
    async function fetchRules() {
      if (!activeTelephelyId) { setHasRules(false); setRulesLoading(false); return; }
      try {
        const { count } = await supabase
          .from('treatment_rules')
          .select('id', { count: 'exact', head: true })
          .eq('clinic_id', activeTelephelyId);
        setHasRules((count || 0) > 0);
      } catch { setHasRules(false); }
      finally { setRulesLoading(false); }
    }
    if (!profileLoading) fetchRules();
  }, [activeTelephelyId, profileLoading]);

  // Fetch Klinika Admin contacts (for Felhasználó)
  useEffect(() => {
    async function fetchAdmins() {
      if (!activeTelephelyId || isKlinikaAdmin || isAdmin) { setAdminsLoading(false); return; }
      try {
        const { data: memberships } = await supabase
          .from('telephely_memberships')
          .select('user_id')
          .eq('telephely_id', activeTelephelyId)
          .eq('role', 'klinika_admin');
        if (memberships && memberships.length > 0) {
          const userIds = memberships.map(m => m.user_id);
          const { data: profiles } = await supabase.from('profiles').select('full_name, phone').in('user_id', userIds);
          setKlinikaAdmins(profiles || []);
        }
      } catch { setKlinikaAdmins([]); }
      finally { setAdminsLoading(false); }
    }
    if (!profileLoading && rolesInitialized) fetchAdmins();
  }, [activeTelephelyId, profileLoading, isKlinikaAdmin, isAdmin, rolesInitialized]);

  // Fetch recent examinations
  useEffect(() => {
    async function fetchStats() {
      if (!user) { setStatsLoading(false); return; }
      try {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase.from('examinations').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo);
        setRecentExaminations(count || 0);
      } catch { /* ignore */ }
      finally { setStatsLoading(false); }
    }
    fetchStats();
  }, [user]);

  // ── Szótár webhook trigger ──
  const generationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleGenerateSzotar = useCallback(async () => {
    if (!activeTelephelyId || !activeCompanyId || !user) return;
    setSzotarGenerating(true);
    notifySzotarDataChanged();
    try {
      const { data, error } = await supabase.functions.invoke('szotar-webhook', {
        body: {
          telephely_id: activeTelephelyId,
          company_id: activeCompanyId,
          user_id: user.id,
          regenerate: false,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Ismeretlen hiba');
      toast.success('Szótár generálása elindítva!');

      // Poll for completion
      if (generationPollRef.current) clearInterval(generationPollRef.current);
      const startedAt = Date.now();
      generationPollRef.current = setInterval(async () => {
        try {
          const { count } = await supabase
            .from('szotar_kezelesek')
            .select('id', { count: 'exact', head: true })
            .eq('telephely_id', activeTelephelyId);
          if ((count || 0) > 0) {
            if (generationPollRef.current) clearInterval(generationPollRef.current);
            generationPollRef.current = null;
            await refreshSzotar();
            notifySzotarDataChanged();
            setSzotarGenerating(false);
            toast.success('Szótár sikeresen generálva!');

            // Trigger embeddings in background
            supabase.functions.invoke('generate-szotar-embeddings', {
              body: { telephely_id: activeTelephelyId }
            }).catch(() => { });
          }
          if (Date.now() - startedAt > 180_000) {
            if (generationPollRef.current) clearInterval(generationPollRef.current);
            generationPollRef.current = null;
            setSzotarGenerating(false);
            toast.info('A szótár generálása még folyamatban van. Kérjük várjon.');
          }
        } catch {
          // ignore poll errors
        }
      }, 3000);
    } catch (err: any) {
      console.error('Szotar generation error:', err);
      toast.error(err.message || 'Hiba a szótár generálásakor');
      setSzotarGenerating(false);
    }
  }, [activeTelephelyId, activeCompanyId, user, refreshSzotar]);

  // Cleanup polls on unmount
  useEffect(() => {
    return () => {
      if (generationPollRef.current) clearInterval(generationPollRef.current);
      if (rulesPollRef.current) clearInterval(rulesPollRef.current);
    };
  }, []);

  // ── Szabályok generálása szótárból webhook ──
  const rulesPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleGenerateRules = useCallback(async () => {
    if (!activeTelephelyId || !user) return;
    setSzabalyokGenerating(true);
    try {
      const isRegenerate = hasRules;
      const { data, error } = await supabase.functions.invoke('szotar-rules-webhook', {
        body: {
          telephely_id: activeTelephelyId,
          user_id: user.id,
          regenerate: isRegenerate,
        },
      });
      if (error) throw new Error(error.message || 'Edge function error');

      if (data?.ok && data.status === 'started' && data.batch_id) {
        toast.success(isRegenerate ? 'Szabályok újragenerálása elindult!' : 'Szabályok generálása elindult!');
        // Poll rule_generation_jobs by batch_id
        if (rulesPollRef.current) clearInterval(rulesPollRef.current);
        let pollCount = 0;
        rulesPollRef.current = setInterval(async () => {
          pollCount++;
          try {
            const { data: jobs } = await supabase
              .from('rule_generation_jobs')
              .select('status')
              .eq('batch_id', data.batch_id);

            if (jobs && jobs.length > 0) {
              const completed = jobs.filter((j: { status: string }) => j.status === 'completed').length;
              const errors = jobs.filter((j: { status: string }) => j.status === 'error').length;
              const total = jobs.length;
              const done = completed + errors;

              if (done >= total) {
                // All jobs finished
                if (rulesPollRef.current) clearInterval(rulesPollRef.current);
                rulesPollRef.current = null;
                setSzabalyokGenerating(false);
                if (completed > 0) {
                  setHasRules(true);
                  toast.success(`Szabályok generálva! ${completed}/${total} sikeres${errors > 0 ? `, ${errors} hibás` : ''}`);
                } else {
                  toast.error(`Minden protokoll hibás (${errors}/${total})`);
                }
                return;
              }
            }

            // Safety timeout after ~5 minutes (100 polls * 3s)
            if (pollCount >= 100) {
              if (rulesPollRef.current) clearInterval(rulesPollRef.current);
              rulesPollRef.current = null;
              setSzabalyokGenerating(false);
              setHasRules(true);
              toast.info('Generálás időtúllépés — ellenőrizze az eredményt');
            }
          } catch { /* ignore polling errors */ }
        }, 3000);
        return;
      } else if (data?.ok) {
        toast.success('Kérés elküldve feldolgozásra');
        setSzabalyokGenerating(false);
        return;
      } else {
        toast.error(data?.message || 'Hiba a szabályok generálásakor');
        setSzabalyokGenerating(false);
      }
    } catch (err: any) {
      console.error('Error generating rules:', err);
      toast.error(err.message || 'Hiba a szabályok generálásakor');
      setSzabalyokGenerating(false);
    }
  }, [activeTelephelyId, user, hasRules]);

  const isLoading = authLoading || profileLoading || !rolesInitialized || isFlexiLoading || szotarLoading || rulesLoading || statsLoading || adminsLoading;

  // Build onboarding steps
  const allSteps = useMemo<OnboardingStep[]>(() => [
    {
      id: 'domain',
      icon: Globe,
      title: 'FlexiDent domain beállítása',
      description: 'Adja meg a klinika FlexiDent domain címét a rendszer összekapcsolásához.',
      completed: hasFlexiDomain,
      adminOnly: true,
      actionLabel: hasFlexiDomain ? 'Módosítás' : 'Domain megadása',
      currentValue: flexiDomain || null,
      editable: true,
      warning: flexiConnectionFailed ? 'A domain helytelen lehet. Kérjük ellenőrizze!' : null,
    },
    {
      id: 'proba',
      icon: TestTube,
      title: 'Próba páciens ID megadása',
      description: 'Adjon meg egy teszt páciens nevet a rendszer teszteléséhez.',
      completed: hasProbaPaciens,
      adminOnly: true,
      actionLabel: hasProbaPaciens ? 'Módosítás' : 'Próba ID megadása',
      currentValue: probaPaciensNeve || null,
      editable: true,
    },
    {
      id: 'flexi',
      icon: Link2,
      title: 'FlexiDent fiók csatlakoztatása',
      description: 'Csatlakoztassa saját FlexiDent fiókját a páciensadatok szinkronizálásához.',
      completed: !!isFlexiConnected,
      adminOnly: false,
      actionLabel: isFlexiConnected ? 'Újracsatlakozás' : 'Flexi csatlakoztatás',
      currentValue: flexiUsername || null,
      editable: true,
    },
    {
      id: 'szotar',
      icon: BookOpen,
      title: 'Szótár generálása',
      description: 'Generálja le a kezelési szótárt a hangfelismerés pontosításához.',
      completed: hasSzotar,
      adminOnly: true,
      actionLabel: szotarGenerating ? 'Generálás...' : 'Szótár generálása',
    },
    {
      id: 'rules',
      icon: ClipboardList,
      title: hasRules ? 'Szótár újragenerálása' : 'Szabályok generálása szótárból',
      description: hasRules
        ? 'Törölje a szótár alapszabályokat és generálja újra (a PDF szabályok megmaradnak).'
        : 'Generálja le a kezelési szabályokat a szótár alapján.',
      completed: hasRules,
      adminOnly: true,
      actionLabel: szabalyokGenerating ? 'Generálás...' : (hasRules ? 'Szótár újragenerálása' : 'Szabályok generálása'),
    },
  ], [hasFlexiDomain, hasProbaPaciens, isFlexiConnected, hasSzotar, hasRules, szotarGenerating, szabalyokGenerating, flexiDomain, probaPaciensNeve, flexiUsername, flexiConnectionFailed]);

  const isKlinikaAdminOrAdmin = isKlinikaAdmin || isAdmin;
  const userOwnSteps = useMemo(() => allSteps.filter(s => !s.adminOnly), [allSteps]);
  const adminMissingSteps = useMemo(() => allSteps.filter(s => s.adminOnly && !s.completed), [allSteps]);
  const allComplete = allSteps.every(s => s.completed);
  const completedCount = allSteps.filter(s => s.completed).length;
  const totalCount = allSteps.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Handle step click actions
  const handleStepAction = (stepId: string) => {
    switch (stepId) {
      case 'domain':
        setDomainDialogOpen(true);
        break;
      case 'proba':
        setProbaDialogOpen(true);
        break;
      case 'flexi':
        setFlexiDialogOpen(true);
        break;
      case 'szotar':
        handleGenerateSzotar();
        break;
      case 'rules':
        handleGenerateRules();
        break;
    }
  };

  // Step is processing (loading)
  const isStepProcessing = (stepId: string) => {
    if (stepId === 'szotar') return szotarGenerating;
    if (stepId === 'rules') return szabalyokGenerating;
    return false;
  };

  // Signal loading to sidebar indicator
  usePageLoadingSignal(isLoading);

  if (isLoading) {
    return null;
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-card via-card to-primary/5 p-6 border border-primary/20 dark:border-sparkle-blue/20">
        <Sparkles className="absolute top-4 right-4 h-6 w-6 text-accent/50 animate-pulse" />
        <Star className="absolute bottom-4 right-12 h-4 w-4 text-primary/40 animate-pulse" style={{ animationDelay: '1s' }} />

        <div className="flex items-center gap-4">
          <div className={cn(
            "h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-500",
            allComplete
              ? "bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg shadow-green-500/30"
              : "bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30",
          )}>
            {allComplete ? (
              <PartyPopper className="h-7 w-7 text-white" />
            ) : (
              <Stethoscope className="h-7 w-7 text-white" />
            )}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Üdvözöljük{profile?.full_name ? `, ${profile.full_name}` : ''}!
            </h1>
            <p className="text-muted-foreground mt-1">
              {allComplete
                ? 'Minden beállítás kész :) — használja az alkalmazást teljes mértékben!'
                : 'Kövesse az alábbi lépéseket a rendszer beállításához.'}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {!allComplete && (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">Beállítás állapota</span>
              <span className="text-primary font-semibold">{completedCount}/{totalCount} kész</span>
            </div>
            <div className="h-2.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>


      {/* Onboarding steps */}
      {!allComplete && (
        <div className="space-y-3">
          {isKlinikaAdminOrAdmin ? (
            /* ── Klinika Admin / Admin: actionable steps ── */
            allSteps.map((step, idx) => {
              const isFirstIncomplete = !step.completed && allSteps.slice(0, idx).every(s => s.completed);
              return (
                <StepCard
                  key={step.id}
                  step={step}
                  index={idx}
                  isCurrent={isFirstIncomplete}
                  isProcessing={isStepProcessing(step.id)}
                  onAction={() => handleStepAction(step.id)}
                />
              );
            })
          ) : (
            /* ── Felhasználó ── */
            <>
              {userOwnSteps.map((step, idx) => (
                <StepCard
                  key={step.id}
                  step={step}
                  index={idx}
                  isCurrent={!step.completed}
                  isProcessing={false}
                  onAction={() => handleStepAction(step.id)}
                />
              ))}

              {/* Admin-managed missing items shown as read-only */}
              {adminMissingSteps.length > 0 && (
                <Card className="border-yellow-500/30 bg-yellow-500/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <UserCog className="h-5 w-5 text-yellow-500" />
                      A Klinika Admin által elvégzendő lépések
                    </CardTitle>
                    <CardDescription>
                      Az alábbi beállításokat a Klinika Adminisztrátor tudja elvégezni.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-2">
                      {adminMissingSteps.map(step => (
                        <li key={step.id} className="flex items-center gap-3 text-sm text-muted-foreground">
                          <Circle className="h-4 w-4 text-yellow-500/60 flex-shrink-0" />
                          <span>{step.title}</span>
                        </li>
                      ))}
                    </ul>

                    {klinikaAdmins.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border/50">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Klinika Admin elérhetősége:</p>
                        <div className="space-y-1.5">
                          {klinikaAdmins.map((admin, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <UserCog className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
                              <span className="font-medium">{admin.full_name || 'Ismeretlen'}</span>
                              {admin.phone && (
                                <>
                                  <span className="text-muted-foreground">·</span>
                                  <a href={`tel:${admin.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                                    <Phone className="h-3 w-3" />
                                    {admin.phone}
                                  </a>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}



      {/* ─── Dialogs ─── */}
      <DomainDialog
        open={domainDialogOpen}
        onOpenChange={setDomainDialogOpen}
        telephelyId={activeTelephelyId}
        currentDomain={flexiDomain}
        onSaved={() => { refreshSzotar(); setFlexiConnectionFailed(false); }}
      />
      <ProbaPaciensDialog
        open={probaDialogOpen}
        onOpenChange={setProbaDialogOpen}
        telephelyId={activeTelephelyId}
        currentName={probaPaciensNeve}
        onSaved={() => refreshSzotar()}
      />
      <FlexiConnectDialog
        open={flexiDialogOpen}
        onOpenChange={(open) => {
          setFlexiDialogOpen(open);
          if (!open) {
            refetchFlexi();
            notifyFlexiConnectionChanged();
          }
        }}
        onError={() => setFlexiConnectionFailed(true)}
      />
    </div>
  );
}

/* ── Step Card sub-component ── */
function StepCard({
  step,
  index,
  isCurrent,
  isProcessing,
  onAction,
}: {
  step: OnboardingStep;
  index: number;
  isCurrent: boolean;
  isProcessing: boolean;
  onAction: () => void;
}) {
  const Icon = step.icon;

  return (
    <Card
      className={cn(
        'transition-all duration-300',
        step.completed && 'border-green-500/30 bg-green-500/5',
        isCurrent && !isProcessing && 'border-primary/40 bg-primary/5 shadow-md shadow-primary/10',
        isProcessing && 'border-amber-500/40 bg-amber-500/5 shadow-md shadow-amber-500/10',
        !step.completed && !isCurrent && !isProcessing && 'opacity-50',
      )}
    >
      <CardContent className="flex items-center gap-4 py-4 px-5">
        {/* Step number / status icon */}
        <div
          className={cn(
            'flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300',
            step.completed && 'bg-green-500/20',
            isCurrent && !isProcessing && 'bg-primary/20',
            isProcessing && 'bg-amber-500/20',
            !step.completed && !isCurrent && !isProcessing && 'bg-muted/50',
          )}
        >
          {step.completed ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : isProcessing ? (
            <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
          ) : (
            <span className={cn(
              'text-sm font-bold',
              isCurrent ? 'text-primary' : 'text-muted-foreground',
            )}>
              {index + 1}
            </span>
          )}
        </div>

        {/* Icon */}
        <div
          className={cn(
            'flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center transition-all duration-300',
            step.completed && 'bg-green-500/10',
            isCurrent && !isProcessing && 'bg-primary/10',
            isProcessing && 'bg-amber-500/10',
            !step.completed && !isCurrent && !isProcessing && 'bg-muted/30',
          )}
        >
          {isProcessing ? (
            <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
          ) : (
            <Icon className={cn(
              'h-5 w-5 transition-colors duration-300',
              step.completed && 'text-green-500',
              isCurrent && !isProcessing && 'text-primary',
              !step.completed && !isCurrent && 'text-muted-foreground',
            )} />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className={cn(
            'font-medium transition-colors duration-300',
            step.completed && 'text-green-600 dark:text-green-400',
            isCurrent && !isProcessing && 'text-primary',
            isProcessing && 'text-amber-600 dark:text-amber-400',
          )}>
            {step.title}
          </div>
          <div className="text-sm text-muted-foreground">
            {isProcessing ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                Feldolgozás folyamatban...
              </span>
            ) : step.description}
          </div>
          {/* Current value display */}
          {step.completed && step.currentValue && (
            <div className="mt-1 inline-flex items-center gap-1.5 text-xs bg-muted/50 rounded-md px-2 py-0.5 text-muted-foreground">
              <span className="font-medium text-foreground/70">{step.currentValue}</span>
            </div>
          )}
          {/* Warning display */}
          {step.warning && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              <span>{step.warning}</span>
            </div>
          )}
        </div>

        {/* Action button — shown for current incomplete step OR for completed editable steps */}
        {isCurrent && !isProcessing && step.actionLabel && !step.completed && (
          <Button
            size="sm"
            onClick={onAction}
            className="flex-shrink-0 gap-2"
          >
            {step.actionLabel}
          </Button>
        )}
        {step.completed && step.editable && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onAction}
            className="flex-shrink-0 gap-1.5 text-muted-foreground hover:text-primary"
          >
            <Pencil className="h-3.5 w-3.5" />
            {step.actionLabel || 'Módosítás'}
          </Button>
        )}
        {step.completed && !step.editable && (
          <span className="text-xs font-medium text-green-500 flex-shrink-0">Kész ✓</span>
        )}
      </CardContent>
    </Card>
  );
}
