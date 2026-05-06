import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Square, Play, Pause, Trash2, Loader2, Sparkles, Star } from 'lucide-react';
import { CustomAudioPlayer } from '@/components/voice/CustomAudioPlayer';
import { useVoiceRecorder, formatDuration } from '@/hooks/useVoiceRecorder';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { useUnifiedVoiceHistory } from '@/hooks/useUnifiedVoiceHistory';
import { GalaxyButton } from '@/components/klinika/GalaxyButton';
import { cn } from '@/lib/utils';
import { translateRecordingError } from '@/lib/utils';
import { useProfile } from '@/hooks/useProfile';
import { useSzotar } from '@/hooks/useSzotar';

type RecordingMode = 'voxis' | 'treatnote' | 'ambulans';

interface NativeVoiceRecordingPanelProps {
  treatnotePatientId: string;
  isFlexi?: boolean;
  flexiPatientId?: string | null;
  forceMode?: RecordingMode;
  onUploadStart?: () => void;
  onJobStarted?: (jobId: string) => void;
  onJobComplete?: (jobId: string, result: any) => void;
  onJobError?: (jobId: string, error: any) => void;
  /** 'panel' (default) = full Card, 'compact' = single wide button bar */
  variant?: 'panel' | 'compact';
}

export function NativeVoiceRecordingPanel({
  treatnotePatientId,
  isFlexi,
  flexiPatientId,
  forceMode,
  onUploadStart,
  onJobStarted,
  onJobComplete,
  onJobError,
  variant = 'panel',
  className
}: NativeVoiceRecordingPanelProps & { className?: string }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { flexiDomain } = useSzotar();
  const [mode, setMode] = useState<RecordingMode>(forceMode || 'treatnote');
  const [isUploading, setIsUploading] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Update mode if forceMode changes
  useEffect(() => {
    if (forceMode) setMode(forceMode);
  }, [forceMode]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const { pollJob } = useUnifiedVoiceHistory(treatnotePatientId);

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
    onError: (error) => {
      toast.error('Hiba a felvétel során: ' + translateRecordingError(error));
    },
  });

  const onJobCompleteRef = useRef(onJobComplete);
  const onJobErrorRef = useRef(onJobError);

  useEffect(() => {
    onJobCompleteRef.current = onJobComplete;
    onJobErrorRef.current = onJobError;
  }, [onJobComplete, onJobError]);

  // Poll for job completion
  useEffect(() => {
    if (!currentJobId) return;

    const pollInterval = setInterval(async () => {
      const job = await pollJob(currentJobId, isFlexi);
      if (job && job.status !== 'processing') {
        clearInterval(pollInterval);
        setCurrentJobId(null);

        if (job.status === 'completed') {
          toast.success('Felvétel sikeresen feldolgozva!');
          onJobCompleteRef.current?.(currentJobId, job.result);
        } else if (job.status === 'error') {
          toast.error('Hiba a feldolgozás során: ' + (job.error || 'Ismeretlen hiba'));
          onJobErrorRef.current?.(currentJobId, job.error);
        }
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [currentJobId, pollJob, isFlexi]);

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
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

  const handleClearRecording = () => {
    resetRecording();
  };

  const handleUpload = async () => {
    if (!audioBlob || !user) {
      toast.error('Nincs felvétel a feltöltéshez');
      return;
    }

    setIsUploading(true);
    onUploadStart?.();

    try {
      const timestamp = new Date().toISOString();
      const filename = `recording_${timestamp.replace(/[:.]/g, '-')}.webm`;

      const formData = new FormData();
      formData.append('audio', audioBlob, filename);
      formData.append('mode', mode);
      formData.append('timestamp', timestamp);
      formData.append('filename', filename);
      formData.append('user_id', user.id);

      if (treatnotePatientId) {
        formData.append('treatnote_patient_id', treatnotePatientId);
      }

      if (isFlexi) {
        formData.append('PaciensID', flexiPatientId || '');
        formData.append('company_id', profile?.company_id || '');
        formData.append('telephely_id', (profile as any)?.current_telephely_id || profile?.telephely_id || '');
        formData.append('domain', flexiDomain || '');
      }

      const { data: { session } } = await supabase.auth.getSession();

      const webhookUrl = isFlexi
        ? `https://bpjzgapmoyhtgryglcke.supabase.co/functions/v1/voice-recording-webhook`
        : `https://bpjzgapmoyhtgryglcke.supabase.co/functions/v1/native-voice-webhook`;

      const response = await fetch(
        webhookUrl,
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
          onJobStarted?.(errorData.active_job_id);
          toast.info('Folytatjuk a folyamatban lévő feldolgozás követését...');
          resetRecording();
          return;
        }
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data?.job_id) {
        toast.info('Felvétel feltöltve, feldolgozás folyamatban...');
        setCurrentJobId(data.job_id);
        onJobStarted?.(data.job_id);
        resetRecording();
      } else {
        throw new Error(data?.error || 'Ismeretlen hiba');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Hiba a feltöltés során: ' + (error.message || 'Ismeretlen hiba'));
    } finally {
      setIsUploading(false);
    }
  };

  // ─── COMPACT VARIANT ───
  if (variant === 'compact') {
    return (
      <div className={cn('w-full space-y-2', className)}>

        {/* ── Idle / Processing state ── */}
        {!isRecording && !audioUrl && (
          <button
            onClick={handleToggleRecording}
            disabled={isUploading || !!currentJobId}
            className={cn(
              'w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 font-medium text-sm',
              (isUploading || !!currentJobId)
                ? 'bg-muted/40 border-border/60 cursor-not-allowed'
                : 'bg-muted/40 border-border/60 text-foreground hover:bg-muted hover:border-border hover:shadow-sm'
            )}
          >
            {(isUploading || !!currentJobId) ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin shrink-0 text-primary" />
                <span className="text-primary">Feldolgozás folyamatban…</span>
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">Hangfelvétel indítása</span>
              </>
            )}
          </button>
        )}

        {/* ── Recording state — bar is NOT clickable, only dedicated buttons ── */}
        {isRecording && (
          <div className="w-full grid grid-cols-3 items-center px-4 py-3 rounded-xl border border-border/60 bg-muted/40 transition-all duration-200">
            {/* Left: status */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span className="font-medium text-sm text-foreground truncate">
                {isPaused ? 'Szünetelve' : 'Felvétel folyamatban…'}
              </span>
            </div>

            {/* Center: Pause + Stop */}
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleTogglePause}
                className="w-9 h-9 rounded-full border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors shadow-sm"
                title={isPaused ? 'Folytatás' : 'Szünet'}
              >
                {isPaused
                  ? <Play className="h-4 w-4 text-foreground" />
                  : <Pause className="h-4 w-4 text-foreground" />}
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="w-9 h-9 rounded-full border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors shadow-sm"
                title="Leállítás"
              >
                <Square className="h-4 w-4 text-foreground" />
              </button>
            </div>

            {/* Right: timer */}
            <div className="flex justify-end">
              <span className="font-mono font-bold text-sm tabular-nums text-foreground">
                {formatDuration(duration)}
              </span>
            </div>
          </div>
        )}


        {/* ── Audio ready — recording button stays, player appears below ── */}
        {!isRecording && audioUrl && (
          <>
            {/* Recording button — start a new recording */}
            <button
              onClick={() => { resetRecording(); startRecording(); }}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border/60 bg-muted/40 text-foreground hover:bg-muted hover:border-border hover:shadow-sm transition-all duration-200 font-medium text-sm"
            >
              <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">Hangfelvétel indítása</span>
            </button>

            {/* Audio player row */}
            <div className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border border-border/50 bg-muted/30">
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => setIsPlaying(false)}
                controls
                className="flex-1 h-8 min-w-0"
                style={{ colorScheme: 'dark' }}
              />
              <Button
                variant="outline"
                size="icon"
                className="w-8 h-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={handleClearRecording}
                disabled={isUploading || !!currentJobId}
                title="Törlés"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <GalaxyButton
                className="h-8 px-3 text-xs font-bold text-white tracking-wide shrink-0"
                onClick={handleUpload}
                disabled={isUploading || !!currentJobId}
              >
                {(isUploading || !!currentJobId) ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  'Feltöltés'
                )}
              </GalaxyButton>
            </div>
          </>
        )}

      </div>
    );
  }

  // ─── PANEL VARIANT (default) ───
  return (
    <div className={cn("w-full", className)}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Hangfelvevő</CardTitle>
          <CardDescription className="text-xs">
            Rögzítse és dolgozza fel a leletet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode selector */}
          {!forceMode && (
            <div className="space-y-1.5">
              <Label className="text-xs">Feldolgozási mód</Label>
              <Select
                value={mode}
                onValueChange={(value: RecordingMode) => setMode(value)}
                disabled={isRecording}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="treatnote">Kezelési terv</SelectItem>
                  <SelectItem value="voxis">Státuszfelvétel</SelectItem>
                  <SelectItem value="ambulans">Ambuláns adatlap</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Recording Controls */}
          <div className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${isRecording ? 'bg-red-500/5 border-red-500/20' : 'bg-muted/30 border-border/50'}`}>
            <div className="flex items-center gap-2">
              {isRecording && (
                <Button
                  size="icon"
                  variant="outline"
                  className="rounded-full w-10 h-10 border-red-200 text-red-600 hover:bg-red-50"
                  onClick={handleTogglePause}
                >
                  {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </Button>
              )}
              <Button
                size="icon"
                variant={isRecording ? 'destructive' : 'default'}
                className="rounded-full w-12 h-12 shadow-md transition-transform hover:scale-105"
                onClick={handleToggleRecording}
              >
                {isRecording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-2xl font-mono font-bold tracking-tight">
                {formatDuration(finalDuration || duration)}
              </span>
              {isRecording && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-500 animate-pulse flex items-center gap-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {isPaused ? 'Szünetelve' : 'Felvétel'}
                </span>
              )}
            </div>
          </div>

          {/* Playback & Actions */}
          {audioUrl && (
            <div className="space-y-3 pt-3 border-t">
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => setIsPlaying(false)}
                controls
                className="w-full h-8"
                style={{ colorScheme: 'dark' }}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="w-9 h-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={handleClearRecording}
                  disabled={isUploading || !!currentJobId}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <GalaxyButton
                  className="flex-1 h-9 text-xs font-bold text-white tracking-wide"
                  onClick={handleUpload}
                  disabled={isUploading || !!currentJobId}
                >
                  {(isUploading || !!currentJobId) ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                      <span>Feldolgozás...</span>
                    </div>
                  ) : (
                    <span>Feltöltés és Generálás</span>
                  )}
                </GalaxyButton>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
