import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mic, Square, Play, Pause, Upload, Trash2, Loader2, AlertCircle, Book, Sparkles, Star, CheckCircle2, ChevronDown, ChevronUp, Clock } from 'lucide-react';
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
import { translateRecordingError, cn } from '@/lib/utils';
import { V2VerdiktDisplay } from '@/components/voice/V2VerdiktDisplay';
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const { jobs, isLoading: historyLoading, pollJob, refetch: refetchJobs } = useUnifiedVoiceHistory(treatnotePatientId, isHistoryOpen);
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
      const job = await pollJob(currentJobId, false);
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

      // Create FormData matching native-voice-webhook field names
      const formData = new FormData();
      formData.append('audio', audioBlob, filename);
      formData.append('mode', mode);
      formData.append('filename', filename);
      formData.append('timestamp', timestamp);
      formData.append('treatnote_patient_id', treatnotePatientId || '');
      formData.append('paciens_id', paciensId || '');
      if (userId) formData.append('user_id', userId);

      // Call native-voice-webhook (V2 engine pipeline)
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `https://bpjzgapmoyhtgryglcke.supabase.co/functions/v1/native-voice-webhook`,
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
      console.log('Native webhook response:', JSON.stringify(data));

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
  const _isPageLoading = profileLoading || isFlexiLoading || rulesLoading;
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
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-300 dark:from-cyan-600 dark:to-cyan-500 shadow-cyan-500/30 flex items-center justify-center glow-cyan">
                <Mic className="h-7 w-7 text-primary-foreground" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight galaxy-title-primary">
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
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-300 dark:from-cyan-600 dark:to-cyan-500 shadow-cyan-500/30 flex items-center justify-center glow-purple">
                <Mic className="h-7 w-7 text-primary-foreground" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight galaxy-title-purple">
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
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* ── Mode Selector (segmented) ── */}
      <div className="flex rounded-xl bg-card border p-1 gap-1" data-tour="vr-mode-select">
        {([
          { value: 'treatnote' as RecordingMode, label: 'Kezelési terv' },
          { value: 'voxis' as RecordingMode, label: 'Státuszfelvétel' },
          { value: 'ambulans' as RecordingMode, label: 'Ambuláns lap' },
        ]).map(opt => (
          <Button
            key={opt.value}
            variant={mode === opt.value ? 'default' : 'ghost'}
            size="sm"
            className={`flex-1 h-9 text-xs font-medium transition-all ${mode === opt.value ? 'shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setMode(opt.value)}
            disabled={isRecording}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* ── Patient ID Bar ── */}
      <div className="flex items-center gap-3 rounded-xl bg-card border p-3" data-tour="vr-paciens-id">
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Páciens #</span>
        <Input
          type="text"
          inputMode="numeric"
          placeholder={treatnotePatientId ? "Profil ID" : "ID szám"}
          value={paciensId}
          onChange={(e) => {
            if (treatnotePatientId) return;
            setPaciensId(e.target.value.replace(/\D/g, ''));
          }}
          disabled={isRecording || !!treatnotePatientId}
          className="h-9 font-mono text-center max-w-[140px]"
        />
        {treatnotePatientId && paciensId && (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Csatolva
          </span>
        )}
      </div>

      {/* ── Recording Area ── */}
      <div className="rounded-2xl bg-card border overflow-hidden">
        <div className="flex flex-col items-center px-6 py-10">
          {/* Timer */}
          <div className={`text-5xl font-mono font-bold mb-6 tracking-wider transition-colors ${isRecording && !isPaused ? 'text-red-500' : 'text-foreground'}`}>
            {formatDuration(audioUrl ? (finalDuration || duration) : duration)}
          </div>



          {/* Main Mic Button */}
          <div className="relative" data-tour="vr-record-btn">
            {isRecording && !isPaused && (
              <div className="absolute inset-0 rounded-full animate-ping bg-red-500/20 pointer-events-none" style={{ animationDuration: '1.5s' }} />
            )}
            <Button
              size="lg"
              className={`h-24 w-24 rounded-full transition-all duration-300 shadow-lg ${
                isRecording
                  ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30'
                  : 'primary-btn-gradient dark:bg-gradient-to-br dark:from-[hsl(270_70%_60%)] dark:via-[hsl(250_65%_55%)] dark:to-[hsl(195_85%_50%)] hover:shadow-xl hover:shadow-primary/30 hover:scale-105'
              }`}
              onClick={handleToggleRecording}
            >
              {isRecording ? <Square className="h-9 w-9 text-white" /> : <Mic className="h-9 w-9 text-white" />}
            </Button>
          </div>

          {/* Hint text & Secondary controls wrapper for smooth height transition */}
          <div className={cn(
            "grid transition-all duration-500 ease-out w-full",
            (audioUrl && !isRecording) ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          )}>
            <div className="overflow-hidden flex flex-col items-center">
              <div className="h-14 flex items-center justify-center mt-2">
                {!isRecording && !audioUrl && (
                  <p className="text-sm text-muted-foreground">
                    Kattintson a mikrofonra a felvétel indításához
                  </p>
                )}
                {isRecording && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleTogglePause}>
                    {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    {isPaused ? 'Folytatás' : 'Szünet'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Playback + Upload bar ── */}
        <div 
          className={cn(
            "grid transition-all duration-500 ease-out",
            audioUrl && !isRecording ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <div 
              className={cn(
                "border-t bg-muted/30 px-6 py-4 space-y-3 transition-all duration-500 ease-out",
                audioUrl && !isRecording ? "translate-y-0" : "translate-y-4"
              )}
              data-tour="vr-playback"
            >
              <audio 
                ref={audioRef} 
                src={audioUrl || undefined} 
                onEnded={() => setIsPlaying(false)} 
                controls 
                className="w-full h-10 rounded-lg transition-opacity opacity-100" 
                style={{ colorScheme: 'dark' }} 
              />
              <div className="flex gap-3">
                <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleClearRecording} disabled={!audioUrl || isUploading || isRecording}>
                  <Trash2 className="h-4 w-4" /> Törlés
                </Button>
                <Button
                  size="sm"
                  className="flex-1 gap-1.5 border-0 transition-opacity"
                  style={{
                    background: isDark
                      ? 'linear-gradient(to right, hsl(270 70% 60%), hsl(250 65% 55%), hsl(195 85% 50%))'
                      : 'linear-gradient(to right, hsl(268 30% 82%), hsl(263 22% 87%), hsl(255 12% 92%))',
                    color: isDark ? 'white' : 'hsl(262 48% 16%)',
                    opacity: (!audioUrl || isUploading || !paciensId || isRecording) ? 0.5 : 1
                  }}
                  onClick={handleUpload}
                  disabled={!audioUrl || isUploading || !paciensId || isRecording}
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {isUploading ? 'Feltöltés...' : 'Feltöltés'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Verdikt Display ── */}
      {(() => {
        const isDemoVerdiktStep = showTour && activeTourStep === 5;
        const showVerdikt = isVerdiktLoading || verdiktResponseData || selectedJob || isDemoVerdiktStep;
        const effectiveData = isDemoVerdiktStep && !verdiktResponseData && !selectedJob
          ? TOUR_DEMO_VERDIKT : (selectedJob ? selectedJob.result : verdiktResponseData);
        let parsedData = effectiveData;
        if (typeof parsedData === 'string') { try { parsedData = JSON.parse(parsedData); } catch { /* keep */ } }
        return showVerdikt ? (
          <div data-tour="vr-verdikt">
            <V2VerdiktDisplay
              result={parsedData}
              rawAudioText={(selectedJob as any)?.raw_audio_text || (jobs.find(j => j.id === currentJobId) as any)?.raw_audio_text}
              jobId={selectedJob?.id || currentJobId || lastJobId}
              isLoading={isVerdiktLoading}
              progressPercent={(selectedJob as any)?.progress_percent || (jobs.find(j => j.id === currentJobId) as any)?.progress_percent}
              progressMessage={(selectedJob as any)?.progress_message || (jobs.find(j => j.id === currentJobId) as any)?.progress_message}
              error={selectedJob?.error}
              jobStatus={selectedJob?.status || (isVerdiktLoading ? 'processing' : undefined)}
              isSelectedJob={!!selectedJob}
              selectedJobMode={selectedJob?.mode}
              selectedJobPaciensId={selectedJob?.paciens_id}
              onClose={() => { if (isDemoVerdiktStep) return; if (selectedJob) { setSelectedJobId(null); } else { clearVerdikt(); } }}
              onTerminate={async () => {
                const targetJobId = selectedJob?.id || currentJobId;
                if (!targetJobId) return;
                const targetJob = jobs.find(j => j.id === targetJobId);
                const isNative = targetJob?.isFlexi === false;
                const table = isNative ? 'native_voice_jobs' : 'voice_jobs';
                const { error } = await supabase.from(table).update({ status: 'error', error: 'Megszakítva felhasználó által', completed_at: new Date().toISOString() }).eq('id', targetJobId);
                if (error) { toast.error('Hiba a megszakítás során!'); } else { toast.info('Feldolgozás megszakítva.'); refetchJobs(); }
              }}
            />
          </div>
        ) : null;
      })()}

      {/* ── Recent History ── */}
      <div data-tour="vr-history">
        <Button 
          variant="ghost" 
          className="w-full flex items-center justify-center py-4 text-muted-foreground hover:bg-muted/50 rounded-xl" 
          onClick={() => setIsHistoryOpen(!isHistoryOpen)}
        >
          <Clock className="h-4 w-4 mr-2" />
          <span className="font-medium">Előzmények</span>
          {isHistoryOpen ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
        </Button>

        {isHistoryOpen && (
          <div className="mt-2 animate-in fade-in slide-in-from-top-4 duration-500">
             <VoiceJobHistory jobs={jobs} isLoading={historyLoading} selectedJobId={selectedJobId} onSelectJob={handleSelectJob} onJobTerminated={refetchJobs} />
          </div>
        )}
      </div>


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
