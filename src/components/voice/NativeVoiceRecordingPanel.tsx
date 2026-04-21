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
import { toast } from 'sonner';
import { useUnifiedVoiceHistory } from '@/hooks/useUnifiedVoiceHistory';
import { GalaxyButton } from '@/components/klinika/GalaxyButton';
import { cn } from '@/lib/utils';
import { useProfile } from '@/hooks/useProfile';
import { useSzotar } from '@/hooks/useSzotar';

type RecordingMode = 'voxis' | 'treatnote' | 'ambulans';

interface NativeVoiceRecordingPanelProps {
  treatnotePatientId: string;
  isFlexi?: boolean;
  flexiPatientId?: string | null;
  onUploadStart?: () => void;
  onJobStarted?: (jobId: string) => void;
  onJobComplete?: (jobId: string, result: any) => void;
  onJobError?: (jobId: string, error: any) => void;
}

export function NativeVoiceRecordingPanel({
  treatnotePatientId,
  isFlexi,
  flexiPatientId,
  onUploadStart,
  onJobStarted,
  onJobComplete,
  onJobError,
}: NativeVoiceRecordingPanelProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { flexiDomain } = useSzotar();
  const [mode, setMode] = useState<RecordingMode>('treatnote');
  const [isUploading, setIsUploading] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

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
      toast.error('Hiba a felvétel során: ' + error.message);
    },
  });

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
          onJobComplete?.(currentJobId, job.result);
        } else if (job.status === 'error') {
          toast.error('Hiba a feldolgozás során: ' + (job.error || 'Ismeretlen hiba'));
          onJobError?.(currentJobId, job.error);
        }
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [currentJobId, pollJob, onJobComplete, onJobError]);

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

  return (
    <div className="space-y-6">
      <Card className="shrink-0">
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

          {/* Recording controls */}
          <div className="flex flex-col items-center py-8">
            {/* Duration display */}
            <div className="text-4xl font-mono font-bold mb-6 text-foreground">
              {formatDuration(duration)}
            </div>

            {/* Recording indicator - keeps space reserved so the window size won't jump */}
            <div className="flex items-center justify-center gap-2 mb-4 h-5">
              {isRecording && (
                <>
                  <div
                    className={`shrink-0 w-3 h-3 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`}
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {isPaused ? 'Szüneteltetve' : 'Felvétel...'}
                  </span>
                </>
              )}
            </div>

            {/* Main controls */}
            <div className="flex items-center gap-4">
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

      <Card className={cn("shrink-0", !audioUrl ? 'opacity-50 pointer-events-none' : '')}>
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
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="flex-1 whitespace-normal h-auto py-2.5 px-3 min-h-[44px]"
                  onClick={handleClearRecording}
                  disabled={isUploading || !!currentJobId}
                >
                  <Trash2 className="mr-2 h-4 w-4 shrink-0" />
                  Törlés
                </Button>
                <GalaxyButton
                  className="flex-1 whitespace-normal h-auto py-2.5 px-3 min-h-[44px] text-white font-semibold"
                  onClick={handleUpload}
                  disabled={isUploading || !!currentJobId}
                >
                  {(isUploading || !!currentJobId) ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      <span>Feldolgozás...</span>
                    </div>
                  ) : (
                    <span>Feltöltés és feldolgozás</span>
                  )}
                </GalaxyButton>
              </div>
            </>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
              <Mic className="h-8 w-8 mb-2 text-muted-foreground" />
              <p>Még nincs rögzített felvétel</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
