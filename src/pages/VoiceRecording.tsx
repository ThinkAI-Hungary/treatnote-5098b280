import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Mic, Square, Play, Pause, Upload, Trash2, Loader2, AlertCircle, Book, Info, Sparkles, Star } from 'lucide-react';
import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useVoiceRecorder, formatDuration } from '@/hooks/useVoiceRecorder';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useFlexiConnection } from '@/hooks/useFlexiConnection';
import { useSzotar } from '@/hooks/useSzotar';
import { useKlinikaAdmins } from '@/hooks/useKlinikaAdmins';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { useVoiceJobHistory, VoiceJob } from '@/hooks/useVoiceJobHistory';
import { VoiceJobHistory } from '@/components/voice/VoiceJobHistory';
import { VerdiktDisplay } from '@/components/voice/VerdiktDisplay';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useVoiceRecordingStore } from '@/stores/voiceRecordingStore';
import { PageLoader } from '@/components/PageLoader';
import { usePageLoadingSignal } from '@/contexts/PageLoadingContext';

type RecordingMode = 'voxis' | 'treatnote' | 'ambulans';

export default function VoiceRecording() {
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  // Derive active telephely before hooks that depend on it
  const activeTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id || null;
  const { isConnected: isFlexiConnected, isLoading: isFlexiLoading } = useFlexiConnection(activeTelephelyId);
  const { hasSzotar, flexiDomain, isLoading: szotarLoading } = useSzotar();
  const { admins: klinikaAdmins } = useKlinikaAdmins();
  const { isKlinikaAdmin, isAdmin } = useCachedRoles();
  const { jobs, isLoading: historyLoading, pollJob, refetch: refetchJobs } = useVoiceJobHistory();
  const navigate = useNavigate();

  // User ID for store operations
  const userId = user?.id ?? '';

  // Persistent state from store - keyed by userId
  const store = useVoiceRecordingStore();
  const verdikt = store.getVerdikt(userId);
  const paciensId = store.getPaciensId(userId);
  const isPaciensIdLocked = store.getIsPaciensIdLocked(userId);
  const mode = store.getMode(userId);

  const setVerdikt = (value: string | null) => store.setVerdikt(userId, value);
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

  const {
    isRecording,
    isPaused,
    duration,
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
      toast.error('Hiba a felvétel során: ' + error.message);
    },
  });

  // Poll for job completion
  useEffect(() => {
    if (!currentJobId) return;

    const pollInterval = setInterval(async () => {
      const job = await pollJob(currentJobId);
      if (job && job.status !== 'processing') {
        clearInterval(pollInterval);
        setCurrentJobId(null);
        setIsVerdiktLoading(false);

        if (job.status === 'completed' && job.result) {
          const responseToStore = typeof job.result === 'string'
            ? job.result
            : JSON.stringify(job.result);
          setVerdikt(responseToStore);
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
    } else {
      // Clear verdikt and selection when starting a new recording
      clearVerdikt();
      setSelectedJobId(null);
      startRecording();
    }
  };

  const handleTogglePause = () => {
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
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
      formData.append('timestamp', timestamp);
      formData.append('filename', filename);
      formData.append('user_id', user.id);
      formData.append('company_id', profile?.company_id || '');
      formData.append('telephely_id', (profile as any)?.current_telephely_id || profile?.telephely_id || '');
      formData.append('PaciensID', paciensId);
      formData.append('domain', flexiDomain || '');

      // Fetch flexi credentials
      const { data: flexiAuth } = await supabase
        .from('flexi_auth')
        .select('flexi_username, flexi_pw')
        .eq('user_id', user.id)
        .maybeSingle();

      formData.append('flexi_email', flexiAuth?.flexi_username || '');
      formData.append('flexi_password', flexiAuth?.flexi_pw || '');

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
        const errorData = await response.json();
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

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* History sidebar - static size matching other cards */}
        <div className="hidden xl:block">
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
            <div className="space-y-2">
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
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Páciens ID-ja</Label>
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
              </div>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="Páciens ID-ja (# nélkül)"
                    value={paciensId}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      setPaciensId(value);
                    }}
                    onKeyDown={(e) => {
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
                    disabled={isRecording || isPaciensIdLocked}
                    className={`transition-all duration-300 ${isPaciensIdLocked ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                  />
                </div>
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
              <div className="flex items-center gap-4">
                {isRecording && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 w-14 rounded-full"
                    onClick={handleTogglePause}
                  >
                    {isPaused ? (
                      <Play className="h-6 w-6" />
                    ) : (
                      <Pause className="h-6 w-6" />
                    )}
                  </Button>
                )}

                <Button
                  size="lg"
                  variant={isRecording ? 'destructive' : 'default'}
                  className="h-20 w-20 rounded-full"
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
                  ? 'Kattintson a leállításhoz'
                  : 'Kattintson a felvétel indításához'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visszajátszás</CardTitle>
            <CardDescription>
              A rögzített felvétel meghallgatása és feltöltése
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {audioUrl ? (
              <>
                {/* Audio player */}
                <div className="space-y-4">
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />

                  <div className="flex items-center justify-center gap-4">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={handlePlayPause}
                      className="h-14 w-14 rounded-full"
                    >
                      {isPlaying ? (
                        <Pause className="h-6 w-6" />
                      ) : (
                        <Play className="h-6 w-6" />
                      )}
                    </Button>
                  </div>

                  <div className="flex justify-center">
                    <span className="text-sm text-muted-foreground">
                      Felvétel hossza: {formatDuration(duration)}
                    </span>
                  </div>
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
                      if (!isPaciensIdLocked) {
                        setIsCheckboxPulsing(true);
                      }
                    }}
                    onMouseLeave={() => {
                      setIsCheckboxPulsing(false);
                    }}
                  >
                    <Button
                      className="w-full"
                      onClick={handleUpload}
                      disabled={isUploading || !isPaciensIdLocked}
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
                <Mic className="h-12 w-12 text-muted-foreground/30 mb-4" />
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
        {(isVerdiktLoading || verdiktResponseData || selectedJob) && (
          <VerdiktDisplay
            isLoading={isVerdiktLoading}
            responseData={selectedJob ? selectedJob.result : verdiktResponseData}
            isSelectedJob={!!selectedJob}
            selectedJobMode={selectedJob?.mode}
            selectedJobPaciensId={selectedJob?.paciens_id}
            selectedJobError={selectedJob?.error}
            selectedJobStatus={selectedJob?.status}
            onClose={() => {
              if (selectedJob) {
                setSelectedJobId(null);
              } else {
                clearVerdikt();
              }
            }}
          />
        )}
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
    </div>
  );
}
