import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mic, Square, Play, Pause, Upload, Trash2, Loader2, AlertCircle, Plus } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import { useVoiceRecorder, formatDuration } from '@/hooks/useVoiceRecorder';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useFlexiConnection } from '@/hooks/useFlexiConnection';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type RecordingMode = 'voxis' | 'treatnote';

interface RecordingItem {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
  timestamp: Date;
  mode: RecordingMode;
}

export default function VoiceRecording() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isConnected: isFlexiConnected, isLoading: isFlexiLoading } = useFlexiConnection();
  const navigate = useNavigate();
  const [mode, setMode] = useState<RecordingMode>('treatnote');
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

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

  const handleOpenFlexiDialog = () => {
    navigate('/profile?openFlexi=true');
  };

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

  const handlePlayPause = useCallback((recordingId: string) => {
    const audioEl = audioRefs.current[recordingId];
    if (!audioEl) return;

    if (playingId === recordingId) {
      audioEl.pause();
      setPlayingId(null);
    } else {
      if (playingId && audioRefs.current[playingId]) {
        audioRefs.current[playingId]?.pause();
      }
      audioEl.play();
      setPlayingId(recordingId);
    }
  }, [playingId]);

  const handleAudioEnded = useCallback((recordingId: string) => {
    if (playingId === recordingId) {
      setPlayingId(null);
    }
  }, [playingId]);

  const handleAddToList = useCallback(() => {
    if (!audioBlob || !audioUrl) return;
    
    const newRecording: RecordingItem = {
      id: crypto.randomUUID(),
      blob: audioBlob,
      url: audioUrl,
      duration: duration,
      timestamp: new Date(),
      mode: mode,
    };
    
    setRecordings(prev => [...prev, newRecording]);
    resetRecording();
    toast.success('Felvétel hozzáadva a listához');
  }, [audioBlob, audioUrl, duration, mode, resetRecording]);

  const handleRemoveRecording = useCallback((recordingId: string) => {
    const recording = recordings.find(r => r.id === recordingId);
    setRecordings(prev => prev.filter(r => r.id !== recordingId));
    if (playingId === recordingId) {
      setPlayingId(null);
    }
    if (recording) {
      URL.revokeObjectURL(recording.url);
    }
  }, [playingId, recordings]);

  const handleClearCurrentRecording = () => {
    resetRecording();
  };

  const handleUploadRecording = async (recording: RecordingItem) => {
    if (!user) {
      toast.error('Nincs bejelentkezett felhasználó');
      return;
    }

    setIsUploading(recording.id);

    try {
      const timestamp = recording.timestamp.toISOString();
      const filename = `recording_${timestamp.replace(/[:.]/g, '-')}.webm`;

      const formData = new FormData();
      formData.append('audio', recording.blob, filename);
      formData.append('mode', recording.mode);
      formData.append('timestamp', timestamp);
      formData.append('filename', filename);
      formData.append('user_id', user.id);
      formData.append('company_id', profile?.company_id || '');
      formData.append('telephely_id', profile?.telephely_id || '');

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

      if (data?.success) {
        toast.success('Felvétel sikeresen feltöltve!');
        handleRemoveRecording(recording.id);
      } else {
        throw new Error(data?.error || 'Ismeretlen hiba');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Hiba a feltöltés során: ' + (error.message || 'Ismeretlen hiba'));
    } finally {
      setIsUploading(null);
    }
  };

  if (!isFlexiLoading && !isFlexiConnected) {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hangfelvétel</h1>
        <p className="text-muted-foreground mt-1">
          Vizsgálati jegyzőkönyv diktálása
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Felvétel készítése</CardTitle>
            <CardDescription>
              Nyomja meg a mikrofon gombot a felvétel indításához
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
                  <SelectItem value="treatnote">TreatNote</SelectItem>
                  <SelectItem value="voxis">Voxis</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col items-center py-8">
              <div className="text-4xl font-mono font-bold mb-6 text-foreground">
                {formatDuration(duration)}
              </div>

              {isRecording && (
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'
                    }`}
                  />
                  <span className="text-sm text-muted-foreground">
                    {isPaused ? 'Szüneteltetve' : 'Felvétel...'}
                  </span>
                </div>
              )}

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

            {audioUrl && (
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">Aktuális felvétel: {formatDuration(duration)}</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleClearCurrentRecording}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Elvetés
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleAddToList}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Hozzáadás
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visszajátszás</CardTitle>
            <CardDescription>
              A rögzített felvételek meghallgatása és feltöltése
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recordings.length > 0 ? (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {recordings.map((recording, index) => (
                    <div
                      key={recording.id}
                      className="p-4 rounded-lg border border-border bg-card/50 space-y-3"
                    >
                      <audio
                        ref={(el) => { audioRefs.current[recording.id] = el; }}
                        src={recording.url}
                        onEnded={() => handleAudioEnded(recording.id)}
                        className="hidden"
                      />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handlePlayPause(recording.id)}
                            className="h-10 w-10 rounded-full shrink-0"
                          >
                            {playingId === recording.id ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <div>
                            <p className="text-sm font-medium">
                              Felvétel #{index + 1}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDuration(recording.duration)} • {recording.mode.toUpperCase()}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleRemoveRecording(recording.id)}
                          disabled={isUploading === recording.id}
                        >
                          <Trash2 className="mr-2 h-3 w-3" />
                          Törlés
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleUploadRecording(recording)}
                          disabled={isUploading === recording.id}
                        >
                          {isUploading === recording.id ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <Upload className="mr-2 h-3 w-3" />
                          )}
                          {isUploading === recording.id ? 'Feltöltés...' : 'Feltöltés'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Mic className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground text-center">
                  Még nincs felvétel.
                  <br />
                  Készítsen egy felvételt a bal oldali panelen.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Használati útmutató</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>1. Válassza ki a feldolgozási módot:</strong> A TreatNote mód
            vizsgálati jegyzőkönyvet, a Voxis mód általános átírást készít.
          </p>
          <p>
            <strong>2. Indítsa el a felvételt:</strong> Kattintson a mikrofon
            gombra és diktálja a jegyzőkönyvet.
          </p>
          <p>
            <strong>3. Adja hozzá a listához:</strong> A felvétel befejezése
            után adja hozzá a listához, majd töltse fel feldolgozásra.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}