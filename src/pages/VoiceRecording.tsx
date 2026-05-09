import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Mic, Square, Play, Pause, Upload, Trash2, Loader2, AlertCircle, Book, Info, Sparkles, Star, CheckCircle2 } from 'lucide-react';
import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useVoiceRecorder, formatDuration } from '@/hooks/useVoiceRecorder';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useFlexiConnection } from '@/hooks/useFlexiConnection';
import { useSzotar } from '@/hooks/useSzotar';
import { useKlinikaAdmins } from '@/hooks/useKlinikaAdmins';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { useUnifiedVoiceHistory } from '@/hooks/useUnifiedVoiceHistory';
import type { UnifiedVoiceJob as VoiceJob } from '@/hooks/useUnifiedVoiceHistory';
import { useTheme } from '@/components/ThemeProvider';
import { VoiceJobHistory } from '@/components/voice/VoiceJobHistory';
import { translateRecordingError } from '@/lib/utils';
import { VerdiktDisplay } from '@/components/voice/VerdiktDisplay';
import { V2VerdiktDisplay, isV2Result } from '@/components/voice/V2VerdiktDisplay';
import { OnboardingTour, TourStep } from '@/components/klinika/OnboardingTour';
import { useOnboardingTour } from '@/hooks/useOnboardingTour';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { VoxisReviewPanel } from '@/components/patients/dental-chart/VoxisReviewPanel';
import { toast } from '@/hooks/useToastMessage';
import { isVoxisJob } from '@/lib/voxisUtils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useVoiceRecordingStore } from '@/stores/voiceRecordingStore';
import { PageLoader } from '@/components/PageLoader';
import { usePageLoadingSignal } from '@/contexts/PageLoadingContext';

type RecordingMode = 'voxis' | 'treatnote' | 'ambulans';

interface VoiceRecordingProps {
  treatnotePatientId?: string;
}

export default function VoiceRecording({ treatnotePatientId }: VoiceRecordingProps = {}) {
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { profile, loading: profileLoading } = useProfile();
  // Derive active telephely before hooks that depend on it
  const activeTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id || null;
  const { isConnected: isFlexiConnected, isLoading: isFlexiLoading } = useFlexiConnection(activeTelephelyId);
  const { hasSzotar, flexiDomain, isLoading: szotarLoading } = useSzotar();
  const { admins: klinikaAdmins } = useKlinikaAdmins();
  const { isKlinikaAdmin, isAdmin } = useCachedRoles();
  const { jobs, isLoading: historyLoading, pollJob, refetch: refetchJobs } = useUnifiedVoiceHistory(treatnotePatientId);
  const navigate = useNavigate();

  // ── Onboarding tour ──────────────────────────────────────────────────────
  // Demo payload shown at step 6/7 so the spotlight has a real element to highlight
  const TOUR_DEMO_VERDIKT = {
    transcriber: {
      text: 'A páciens arcíves harapásrögzítést kér rágóizom relaxációs harapásvétellel, fog 11-esnél. ICT érzéstelenítés szükséges fog 11-esnél.',
    },
    szoveges_lista:
      'Vizit 0\nKezelés: Arcíves harapásrögzítés rágóizom relaxációs harapásvétellel\n\t– Fog: 11\nKezelés: ICT érzéstelenítés\n\t– Fog: 11',
    execution_report_human: {
      statisztika: { total: 2, matched: 2, match_rate: '100%' },
      talalatok: [
        {
          sorszam: 1,
          input_text: 'arcíves harapásrögzítés rágóizom relaxációs harapásvétellel',
          eredmeny: { status: 'matched', rule_name: 'Arcíves harapásrögzítés', valasztas_modja: 'primary' },
        },
        {
          sorszam: 2,
          input_text: 'ICT érzéstelenítés',
          eredmeny: { status: 'matched', rule_name: 'ICT érzéstelenítés', valasztas_modja: 'primary' },
        },
      ],
    },
  };

  const VOICE_TOUR_STEPS: TourStep[] = [
    {
      target: '[data-tour="vr-mode-select"]',
      title: 'Feldolgozási mód',
      content: `Válassza ki, milyen formában szeretné feldolgoztatni a felvett hangot: 
Kezelési terv: vizsgálati jegyzőkönyvet, 
Státuszfelvétel: általános leírást, 
Ambuláns adatlap pedig ambuláns lapot készít.`,
      position: 'right',
    },
    {
      target: '[data-tour="vr-paciens-id"]',
      title: 'Páciens ID-ja',
      content: 'Adja meg a FlexiDent oldalon látható páciens ID-t. Az ID megtalálásában a mező melletti kis információ gomb segít. Miután meggyőződött a helyes kitöltésről, kattintson a „Zárolás" gombra — ez megvédi az értékmezőt a véletlenszerű módosítástól.',
      position: 'bottom',
    },
    {
      // Step 2: interactive — Előző available, overlay passthrough so mic is clickable
      target: '[data-tour="vr-record-btn"]',
      title: 'Teszt felvétel indítása',
      content: 'Kattintson a mikrofon gombra egy rövid teszt felvétel indításához! A tartalom nem számít, néhány másodpercnyi hang is tökéletes.',
      position: 'bottom',
      hideNext: true,
      hideSkip: true,
      interactive: true,
      showArrows: true,
    },
    {
      // Step 3: recording active — navigable (4/7), interactive so stop button is clickable
      target: '[data-tour="vr-record-btn"]',
      title: 'Szünet és leállítás',
      content: 'A felvétel elindult! A bal oldali gombbal szüneteltetheti (Pause / Resume). A nagy középső gombbal állítsa le a felvételt a befejezéshez.',
      position: 'bottom',
      interactive: true,
      hideNext: true,
      hideSkip: true,
      showTopArrow: true,
    },
    {
      // Step 4: playback intro — shown automatically after recording stops
      target: '[data-tour="vr-playback"]',
      title: 'Visszajátszás és feltöltés',
      content: 'A felvétel leállítása után itt jelenik meg a rögzített hang. Visszajátszhatja, hangerőt állíthat, letöltheti. A „Feltöltés" gombra kattintva indul el a feldolgozás.',
      position: 'left',
    },
    {
      target: '[data-tour="vr-verdikt"]',
      title: 'Feldolgozás eredménye',
      content: `A feltöltés után itt jelenik meg az eredmény. 
 Eredeti szöveg: amit Ön felmondott. 
 Szabály találatok: a szövegre legjobban értelmezhető szabályok. 
 Kitöltés: ez kerül be a FlexiDent oldalra olyan formában, ahogy ott is látható.`,
      position: 'top',
      interactive: true,
    },
    {
      target: '[data-tour="vr-history"]',
      title: 'Előzmények',
      content: 'Itt tekintheti meg a korábbi kitöltéseket. Kattintson egy elemre az eredmény megtekintéséhez. A „További előzmények” gombbal még régebbi felvételeket is előhívhat és visszahúzhat.',
      position: 'right',
    },
  ];

  const {
    showTour,
    startTour,
    completeTour,
    skipTour,
  } = useOnboardingTour({
    tourKey: 'voice-recording',
    isEligible: true,
    autoShowForNewUsers: true,
    newUserDays: 30,
  });

  // ── Interactive tour: reactive step control ───────────────────────────────
  const [activeTourStep, setActiveTourStep] = useState(0);

  const handleStartTour = useCallback(() => {
    setActiveTourStep(0); // Always begin from Feldolgozási mód (step 1/3)
    startTour();
  }, [startTour]);


  // Reset step when tour closes so next open starts fresh at step 2
  useEffect(() => {
    if (!showTour) setActiveTourStep(0);
  }, [showTour]);

  // Info button re-starts the interactive tour from step 2
  useEffect(() => {
    const handler = () => handleStartTour();
    window.addEventListener('taskbar-info', handler);
    return () => window.removeEventListener('taskbar-info', handler);
  }, [handleStartTour]);

  // User ID for store operations
  const userId = user?.id ?? '';

  // Persistent state from store - keyed by userId
  const store = useVoiceRecordingStore();
  const verdikt = store.getVerdikt(userId);
  const lastJobId = store.getLastJobId(userId);
  const paciensId = store.getPaciensId(userId);
  const isPaciensIdLocked = store.getIsPaciensIdLocked(userId);
  const mode = store.getMode(userId);

  const setVerdikt = (value: string | null, jobId: string | null = null) => store.setVerdikt(userId, value, jobId);
  const setPaciensId = (value: string) => store.setPaciensId(userId, value);
  const setIsPaciensIdLocked = (value: boolean) => store.setIsPaciensIdLocked(userId, value);
  const setMode = (value: 'voxis' | 'treatnote' | 'ambulans') => store.setMode(userId, value);
  const clearVerdikt = () => store.clearVerdikt(userId);

  // Local state
  const [isUploading, setIsUploading] = useState(false);
  const [isCheckboxPulsing, setIsCheckboxPulsing] = useState(false);
  const [isZarolasHovered, setIsZarolasHovered] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const checkboxRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVerdiktLoading, setIsVerdiktLoading] = useState(false);
  const [patientFlexidentId, setPatientFlexidentId] = useState<string | null>(null);

  useEffect(() => {
    if (!treatnotePatientId) return;

    supabase.from('patient_alap_adatok')
      .select('flexident_id')
      .eq('id', treatnotePatientId)
      .single()
      .then(({ data }) => {
        if (data?.flexident_id) {
          setPatientFlexidentId(data.flexident_id);
          setPaciensId(data.flexident_id);
          setIsPaciensIdLocked(true);
        } else {
          setPatientFlexidentId(null);
          setPaciensId('');
          setIsPaciensIdLocked(false);
        }
      });
  }, [treatnotePatientId, setPaciensId, setIsPaciensIdLocked]);

  const {
    isRecording,
    isPaused,
    duration,
    finalDuration,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    audioBlob,
    audioUrl,
  } = useVoiceRecorder({
    onRecordingComplete: (blob, dur) => {
      console.log('Recording complete:', blob.size, 'bytes,', dur, 'seconds');
    },
    onError: (error) => {
      toast.error('Hiba a felvétel során: ' + translateRecordingError(error));
    },
  });

  // Poll for job completion
  useEffect(() => {
    if (!currentJobId) return;

    const pollInterval = setInterval(async () => {
      const job = await pollJob(currentJobId, true);
      if (job && job.status !== 'processing') {
        clearInterval(pollInterval);
        setCurrentJobId(null);
        setIsVerdiktLoading(false);

        if (job.status === 'completed' && job.result) {
          const responseToStore = typeof job.result === 'string'
            ? job.result
            : JSON.stringify(job.result);
          setVerdikt(responseToStore, job.id);
          toast.success('Felvétel sikeresen feldolgozva!');
        } else if (job.status === 'error') {
          toast.error('Hiba a feldolgozás során: ' + (job.error || 'Ismeretlen hiba'));
        }
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [currentJobId, pollJob, setVerdikt]);

  // Get response data for verdikt display
  const verdiktResponseData = useMemo(() => {
    if (selectedJobId) {
      const job = jobs.find(j => j.id === selectedJobId);
      return job?.result ?? null;
    }
    if (!verdikt) return null;
    try { return JSON.parse(verdikt); } catch { return verdikt; }
  }, [verdikt, selectedJobId, jobs]);

  const handleOpenFlexiDialog = () => {
    navigate('/profile?openFlexi=true');
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
      // Tour: treat stop-recording as “Következő” on 4/7 → advance to 5/7 immediately
      if (showTour && activeTourStep === 3) {
        setActiveTourStep(4);
      }
    } else {
      // Clear verdikt and selection when starting a new recording
      clearVerdikt();
      setSelectedJobId(null);
      startRecording();
      // Tour: treat start-recording as “Következő” on 3/7 → advance to 4/7 immediately
      if (showTour && activeTourStep === 2) {
        setActiveTourStep(3);
      }
    }
  };

  const handleTogglePause = () => {
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  };

  const handleClearRecording = () => {
    resetRecording();
  };

  const handleSelectJob = useCallback((job: VoiceJob) => {
    // Clear current verdikt from store when viewing history
    clearVerdikt();
    setSelectedJobId(job.id);
  }, [clearVerdikt]);

  const handleUpload = async () => {
    if (!audioBlob || !user) {
      toast.error('Nincs felvétel a feltöltéshez');
      return;
    }

    setIsUploading(true);
    setIsVerdiktLoading(true);
    setSelectedJobId(null);

    try {
      const timestamp = new Date().toISOString();
      const filename = `recording_${timestamp.replace(/[:.]/g, '-')}.webm`;

      // Create FormData with correct field names matching edge function
      const formData = new FormData();
      formData.append('audio', audioBlob, filename);
      formData.append('mode', mode);
      formData.append('filename', filename);
      formData.append('PaciensID', paciensId);
      if (treatnotePatientId) {
        formData.append('treatnote_patient_id', treatnotePatientId);
      }
      if (userId) formData.append('user_id', userId);
      formData.append('company_id', profile?.company_id || '');
      formData.append('telephely_id', (profile as any)?.current_telephely_id || profile?.telephely_id || '');
      formData.append('PaciensID', paciensId);
      formData.append('domain', flexiDomain || '');

      // Note: flexi credentials (username + decrypted pw) are fetched by the edge function
      // using the service role key, so the browser does not need to send them.

      // Call edge function
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `https://bpjzgapmoyhtgryglcke.supabase.co/functions/v1/voice-recording-webhook`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 409 && errorData.active_job_id) {
          setCurrentJobId(errorData.active_job_id);
          toast.info('Folytatjuk a folyamatban lévő feldolgozás követését...');
          resetRecording();
          return;
        }
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('Webhook response:', JSON.stringify(data));

      if (data?.job_id) {
        toast.info('Felvétel feltöltve, feldolgozás folyamatban...');
        setCurrentJobId(data.job_id);
        resetRecording();
      } else {
        throw new Error(data?.error || 'Ismeretlen hiba');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Hiba a feltöltés során: ' + (error.message || 'Ismeretlen hiba'));
      setIsVerdiktLoading(false);
    } finally {
      setIsUploading(false);
    }
  };

  // Get the selected job for display
  const selectedJob = selectedJobId ? jobs.find(j => j.id === selectedJobId) : null;

  // Check if treatment rules exist
  const [hasRules, setHasRules] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(true);
  // activeTelephelyId is already declared at the top (before useFlexiConnection)
  useEffect(() => {
    // Wait for profile to load before checking rules
    if (profileLoading) return;
    if (!activeTelephelyId) { setHasRules(false); setRulesLoading(false); return; }
    supabase
      .from('treatment_rules')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', activeTelephelyId)
      .then(({ count }) => { setHasRules((count || 0) > 0); setRulesLoading(false); });
  }, [activeTelephelyId, profileLoading]);

  // Signal loading to sidebar indicator
  const _isPageLoading = profileLoading || isFlexiLoading || rulesLoading || historyLoading;
  usePageLoadingSignal(_isPageLoading);

  // Show unified loading state while critical data loads
  if (_isPageLoading) {
    return null;
  }

  // Show message if Flexi is not connected
  if (!isFlexiConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hangfelvétel</h1>
          <p className="text-muted-foreground mt-1">
            Vizsgálati jegyzőkönyv diktálása
          </p>
        </div>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>FlexiDent fiók szükséges</AlertTitle>
          <AlertDescription>
            Jelenleg nincs hozzácsatolva felhasználóhoz FlexiDent fiók - kérem csatolja hozzá fiókját{' '}
            <button
              onClick={handleOpenFlexiDialog}
              className="underline font-medium hover:text-destructive-foreground/80"
            >
              itt
            </button>
            !
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Show message if Szotar is not available
  if (!szotarLoading && !hasSzotar) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl bg-galaxy-header p-6 border border-primary/20 dark:border-sparkle-blue/20">
          <Sparkles className="absolute top-4 right-4 h-6 w-6 text-accent/50 animate-float" style={{ willChange: 'transform' }} />
          <Star className="absolute bottom-4 right-12 h-4 w-4 text-primary/40 animate-float" style={{ animationDelay: '1s', willChange: 'transform' }} />

          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-purple">
                <Mic className="h-7 w-7 text-primary-foreground" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                Hangfelvétel
              </h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Vizsgálati jegyzőkönyv diktálása
              </p>
            </div>
          </div>
        </div>

        <Alert variant="destructive">
          <Book className="h-4 w-4" />
          <AlertTitle>Szótár szükséges</AlertTitle>
          <AlertDescription>
            {isKlinikaAdmin || isAdmin ? (
              <>
                Nem található szótár a telephelynél -{' '}
                <button
                  onClick={() => navigate('/klinika-admin?tab=szotar')}
                  className="underline font-medium hover:text-destructive-foreground/80"
                >
                  kattintson ide a létrehozáshoz
                </button>
              </>
            ) : (
              <div className="space-y-2">
                <p>Nem található szótár a telephelynél, kérem keresse fel klinika adminját!</p>
                {klinikaAdmins.length > 0 && (
                  <div>
                    <p className="font-medium">
                      {klinikaAdmins.length > 1 ? 'Klinika adminok:' : 'Klinika admin:'}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {klinikaAdmins.map((admin) => (
                        <li key={admin.id}>
                          {admin.full_name || 'Névtelen'}
                          {admin.phone && <span className="ml-2">({admin.phone})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Show message if treatment rules are not available
  if (!rulesLoading && !hasRules) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl bg-galaxy-header p-6 border border-primary/20 dark:border-sparkle-blue/20">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-[hsl(268_42%_72%)] via-[hsl(263_28%_80%)] to-[hsl(255_13%_88%)] dark:from-primary dark:via-primary/70 dark:to-accent flex items-center justify-center glow-purple">
                <Mic className="h-7 w-7 text-primary-foreground" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-[hsl(268_52%_50%)] via-[hsl(263_32%_65%)] to-[hsl(255_18%_74%)] dark:from-primary dark:via-primary/60 dark:to-accent bg-clip-text text-transparent">
                Hangfelvétel
              </h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Vizsgálati jegyzőkönyv diktálása
              </p>
            </div>
          </div>
        </div>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Kezelési szabályok szükségesek</AlertTitle>
          <AlertDescription>
            {isKlinikaAdmin || isAdmin ? (
              <>
                Nincsenek kezelési szabályok a telephelyhez -{' '}
                <button
                  onClick={() => navigate('/klinika-admin?tab=kezelesi-szabalyok')}
                  className="underline font-medium hover:text-destructive-foreground/80"
                >
                  generálja le a szabályokat
                </button>
              </>
            ) : (
              <div className="space-y-2">
                <p>Nincsenek kezelési szabályok a telephelyhez, kérem keresse fel klinika adminját!</p>
                {klinikaAdmins.length > 0 && (
                  <div>
                    <p className="font-medium">
                      {klinikaAdmins.length > 1 ? 'Klinika adminok:' : 'Klinika admin:'}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {klinikaAdmins.map((admin) => (
                        <li key={admin.id}>
                          {admin.full_name || 'Névtelen'}
                          {admin.phone && <span className="ml-2">({admin.phone})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-galaxy-header p-6 border border-primary/20 dark:border-sparkle-blue/20">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-[hsl(268_42%_72%)] via-[hsl(263_28%_80%)] to-[hsl(255_13%_88%)] dark:from-primary dark:to-accent flex items-center justify-center glow-purple">
              <Mic className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-[hsl(268_52%_50%)] via-[hsl(263_32%_65%)] to-[hsl(255_18%_74%)] dark:from-primary dark:via-primary/60 dark:to-accent bg-clip-text text-transparent">
              Hangfelvétel
            </h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Vizsgálati jegyzőkönyv diktálása
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* History sidebar - static size matching other cards */}
        <div className="hidden xl:block" data-tour="vr-history">
          <VoiceJobHistory
            jobs={jobs}
            isLoading={historyLoading}
            selectedJobId={selectedJobId}
            onSelectJob={handleSelectJob}
            onJobTerminated={refetchJobs}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Felvétel készítése</CardTitle>
            <CardDescription>
              Nyomja meg a mikrofon gombot a felvétel indításához
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Mode selector */}
            <div className="space-y-2" data-tour="vr-mode-select">
              <Label>Feldolgozási mód</Label>
              <Select
                value={mode}
                onValueChange={(value: RecordingMode) => setMode(value)}
                disabled={isRecording}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="treatnote">Kezelési terv</SelectItem>
                  <SelectItem value="voxis">Státuszfelvétel</SelectItem>
                  <SelectItem value="ambulans">Ambuláns adatlap</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Páciens ID input */}
            <div className="space-y-2" data-tour="vr-paciens-id">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>Páciens ID-ja</Label>
                  {!treatnotePatientId && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>A Páciens ID megtalálható a "Páciens lista"-ban való szűrést követően az "ID" oszlopban, ezt a sorszámot kell ide beilleszteni arra a páciensre, akinek a felhasználójával dolgozni szeretne.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                {treatnotePatientId && !paciensId && (
                  <div className="text-xs text-destructive flex items-center gap-1.5 font-medium animate-in fade-in slide-in-from-right-2 duration-300">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Hiányzó FlexiDent ID
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder={treatnotePatientId ? "Páciens profil tartalmazza az ID-t." : "Páciens ID-ja (# nélkül)"}
                    value={paciensId}
                    onChange={(e) => {
                      if (treatnotePatientId) return;
                      const value = e.target.value.replace(/\D/g, '');
                      setPaciensId(value);
                    }}
                    onKeyDown={(e) => {
                      if (treatnotePatientId) return;
                      // Allow control keys
                      if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                        return;
                      }
                      // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                      if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) {
                        return;
                      }
                      // Block non-numeric
                      if (!/^\d$/.test(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    disabled={isRecording || isPaciensIdLocked || !!treatnotePatientId}
                    className={`transition-all duration-300 ${isPaciensIdLocked || !!treatnotePatientId ? 'bg-muted/50 cursor-not-allowed' : ''} ${treatnotePatientId && !paciensId ? 'border-destructive/50 bg-destructive/5' : ''}`}
                  />
                </div>
                {treatnotePatientId ? (
                  paciensId ? (
                    <div className="flex items-center gap-2 px-3 text-sm font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 rounded-md h-10 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                      <CheckCircle2 className="w-4 h-4" /> Csatolva
                    </div>
                  ) : null
                ) : (
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip open={isZarolasHovered && !paciensId}>
                        <TooltipTrigger asChild>
                          <div
                            className="flex items-center gap-2"
                            onMouseEnter={() => setIsZarolasHovered(true)}
                            onMouseLeave={() => setIsZarolasHovered(false)}
                          >
                            <div className={`relative transition-all duration-300 ${isPaciensIdLocked ? 'checkbox-glow-active' : ''}`}>
                              <Checkbox
                                ref={checkboxRef}
                                id="lock-paciens-id"
                                checked={isPaciensIdLocked}
                                onCheckedChange={(checked) => setIsPaciensIdLocked(checked === true)}
                                disabled={isRecording || !paciensId}
                                className={`transition-all duration-300 relative z-10 ${isCheckboxPulsing ? 'animate-pulse-fade' : ''
                                  }`}
                              />
                            </div>
                            <Label
                              htmlFor="lock-paciens-id"
                              className={`text-sm cursor-pointer select-none ${!paciensId ? 'text-muted-foreground/50' : 'text-muted-foreground'
                                }`}
                            >
                              Zárolás
                            </Label>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Kérem töltse ki a Páciens ID értéket.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </div>
            </div>

            {/* Recording controls */}
            <div className="flex flex-col items-center py-8">
              {/* Duration display */}
              <div className="text-4xl font-mono font-bold mb-6 text-foreground">
                {formatDuration(duration)}
              </div>

              {/* Recording indicator */}
              {isRecording && (
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className={`w-3 h-3 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'
                      }`}
                  />
                  <span className="text-sm text-muted-foreground">
                    {isPaused ? 'Szüneteltetve' : 'Felvétel...'}
                  </span>
                </div>
              )}

              {/* Main controls */}
              <div className="flex items-center gap-4" data-tour="vr-record-btn">
                {isRecording && (
                  <Button
                    size="lg"
                    variant={isRecording ? 'destructive' : 'default'}
                    className="h-20 w-20 rounded-full primary-btn-gradient dark:bg-gradient-to-br dark:from-[hsl(270_70%_60%)] dark:via-[hsl(250_65%_55%)] dark:to-[hsl(195_85%_50%)] dark:hover:shadow-lg dark:hover:shadow-[hsl(270_70%_60%)/0.4]"
                    onClick={handleTogglePause}
                  >
                    {isPaused ? (
                      <Play className="h-8 w-8" />
                    ) : (
                      <Pause className="h-8 w-8" />
                    )}
                  </Button>
                )}

                <Button
                  size="lg"
                  variant={isRecording ? 'destructive' : 'default'}
                  className="h-20 w-20 rounded-full primary-btn-gradient dark:bg-gradient-to-br dark:from-[hsl(270_70%_60%)] dark:via-[hsl(250_65%_55%)] dark:to-[hsl(195_85%_50%)] dark:hover:shadow-lg dark:hover:shadow-[hsl(270_70%_60%)/0.4]"
                  onClick={handleToggleRecording}
                >
                  {isRecording ? (
                    <Square className="h-8 w-8" />
                  ) : (
                    <Mic className="h-8 w-8" />
                  )}
                </Button>
              </div>

              <p className="mt-4 text-sm text-muted-foreground text-center">
                {isRecording
                  ? isPaused ? 'Kattintson a folytatáshoz' : 'Kattintson a leállításhoz'
                  : 'Kattintson a felvétel indításához'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card data-tour="vr-playback">
          <CardHeader>
            <CardTitle>Visszajátszás</CardTitle>
            <CardDescription>
              A rögzített felvétel meghallgatása és feltöltése
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {audioUrl ? (
              <>
                {/* Duration badge */}
                <div className="flex justify-center">
                  <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
                    <Mic className="h-3.5 w-3.5" />
                    {formatDuration(finalDuration || duration)}
                  </span>
                </div>

                {/* Audio player */}
                <div className="space-y-2">
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    onEnded={() => setIsPlaying(false)}
                    controls
                    className="w-full h-10 rounded-lg"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleClearRecording}
                    disabled={isUploading}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Törlés
                  </Button>
                  <div
                    className="flex-1"
                    onMouseEnter={() => {
                      if (!treatnotePatientId && !isPaciensIdLocked) {
                        setIsCheckboxPulsing(true);
                      }
                    }}
                    onMouseLeave={() => {
                      setIsCheckboxPulsing(false);
                    }}
                  >
                    <Button
                      className="w-full border-0 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20"
                      style={{
                        background: isDark
                          ? 'linear-gradient(to right, hsl(270 70% 60%), hsl(250 65% 55%), hsl(195 85% 50%))'
                          : 'linear-gradient(to right, hsl(268 30% 82%), hsl(263 22% 87%), hsl(255 12% 92%))',
                        color: isDark ? 'white' : 'hsl(262 48% 16%)',
                      }}
                      onClick={handleUpload}
                      disabled={isUploading || (treatnotePatientId ? !paciensId : !isPaciensIdLocked)}
                    >
                      {isUploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      {isUploading ? 'Feltöltés...' : 'Feltöltés'}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Mic className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  Még nincs felvétel.
                  <br />
                  Készítsen felvételt a középső panelen.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Verdikt card - full width below all cards */}
        {/* At tour step 6/7 (index 5) always show with demo data so the spotlight has something to point at */}
        {(() => {
          const isDemoVerdiktStep = showTour && activeTourStep === 5;
          const showVerdikt = isVerdiktLoading || verdiktResponseData || selectedJob || isDemoVerdiktStep;
          const effectiveData = isDemoVerdiktStep && !verdiktResponseData && !selectedJob
            ? TOUR_DEMO_VERDIKT
            : (selectedJob ? selectedJob.result : verdiktResponseData);
          return showVerdikt ? (
            <div data-tour="vr-verdikt" className="col-span-full">
              {/* V2 engine results get the new 7-tab debug display */}
              {effectiveData && isV2Result(effectiveData) ? (
                <V2VerdiktDisplay
                  result={effectiveData}
                  rawAudioText={(selectedJob as any)?.raw_audio_text || (jobs.find(j => j.id === currentJobId) as any)?.raw_audio_text}
                />
              ) : (
              <VerdiktDisplay
                isLoading={isVerdiktLoading}
                responseData={effectiveData}
                isSelectedJob={!!selectedJob}
                selectedJobMode={selectedJob?.mode}
                selectedJobPaciensId={selectedJob?.paciens_id}
                selectedJobError={selectedJob?.error}
                selectedJobStatus={selectedJob?.status}
                jobId={selectedJob?.id || currentJobId || lastJobId || undefined}
                jobType={selectedJob ? (selectedJob.isFlexi ? 'legacy' : 'native') : 'legacy'}
                userComplaint={selectedJob?.user_complaint}
                progressPercent={(selectedJob as any)?.progress_percent || (jobs.find(j => j.id === currentJobId) as any)?.progress_percent}
                progressMessage={(selectedJob as any)?.progress_message || (jobs.find(j => j.id === currentJobId) as any)?.progress_message}
                rawAudioText={(selectedJob as any)?.raw_audio_text || (jobs.find(j => j.id === currentJobId) as any)?.raw_audio_text}
                claudeCleanedText={(selectedJob as any)?.claude_cleaned_text || (jobs.find(j => j.id === currentJobId) as any)?.claude_cleaned_text}
                onComplaintSubmitted={() => {
                  refetchJobs();
                }}
                onTerminate={async () => {
                  const targetJobId = selectedJob?.id || currentJobId;
                  if (!targetJobId) return;
                  const targetJob = jobs.find(j => j.id === targetJobId);
                  const isNative = targetJob?.isFlexi === false;
                  const table = isNative ? 'native_voice_jobs' : 'voice_jobs';

                  const { error } = await supabase
                    .from(table)
                    .update({ status: 'error', error: 'Megszakítva felhasználó által', completed_at: new Date().toISOString() })
                    .eq('id', targetJobId);

                  if (error) {
                    toast.error('Hiba a megszakítás során!');
                  } else {
                    toast.info('Feldolgozás megszakítva.');
                    refetchJobs();
                  }
                }}
                onClose={() => {
                  if (isDemoVerdiktStep) return; // keep mounted during tour demo
                  if (selectedJob) {
                    setSelectedJobId(null);
                  } else {
                    clearVerdikt();
                  }
                }}
                voxisReviewPanelNode={
                  isVoxisJob(selectedJob?.mode, selectedJob?.result) && selectedJob?.status === 'completed' && selectedJob?.result && (selectedJob?.paciens_id || (selectedJob as any)?.treatnote_patient_id) ? (
                    <VoxisReviewPanel 
                      patientId={selectedJob?.paciens_id || (selectedJob as any)?.treatnote_patient_id}
                      resultJson={typeof selectedJob.result === 'string' ? JSON.parse(selectedJob.result) : selectedJob.result}
                      jobId={selectedJob.id}
                    />
                  ) : isVoxisJob(selectedJob?.mode, selectedJob?.result) ? (
                    <div className="p-4 text-center text-muted-foreground">Kérem párosítson klienst a megtekintéséhez.</div>
                  ) : null
                }
              />
              )}
            </div>
          ) : null;
        })()}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Használati útmutató</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>1. Válassza ki a feldolgozási módot:</strong> A Kezelési terv mód
            vizsgálati jegyzőkönyvet, a Státuszfelvétel mód általános átírást készít.
          </p>
          <p>
            <strong>2. Indítsa el a felvételt:</strong> Kattintson a mikrofon
            gombra és diktálja a jegyzőkönyvet.
          </p>
          <p>
            <strong>3. Zárolás:</strong> Miután meggyőződött a Páciens ID helyességéről, kattintsa be a "Zárolás" gombot.
          </p>
          <p>
            <strong>4. Töltse fel a felvételt:</strong> A felvétel befejezése
            után hallgassa meg, majd töltse fel feldolgozásra.
          </p>
        </CardContent>
      </Card>

      <OnboardingTour
        steps={VOICE_TOUR_STEPS}
        isOpen={showTour}
        step={activeTourStep}
        onComplete={completeTour}
        onSkip={skipTour}
        onStepChange={(_step, idx) => setActiveTourStep(idx)}
      />
    </div>
  );
}
