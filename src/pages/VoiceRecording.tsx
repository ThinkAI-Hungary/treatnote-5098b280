import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Square, Play, Pause, Upload, Trash2, Loader2 } from 'lucide-react';
import { useState, useRef } from 'react';
import { useVoiceRecorder, formatDuration } from '@/hooks/useVoiceRecorder';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type RecordingMode = 'voxis' | 'treatnote';

export default function VoiceRecording() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [mode, setMode] = useState<RecordingMode>('treatnote');
  const [isUploading, setIsUploading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const {
    isRecording,
    isPaused,
    duration,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
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
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    // Reset by starting and immediately stopping - or just reload
    window.location.reload();
  };

  const handleUpload = async () => {
    if (!audioBlob || !user) {
      toast.error('Nincs felvétel a feltöltéshez');
      return;
    }

    setIsUploading(true);

    try {
      const timestamp = new Date().toISOString();
      const filename = `recording_${timestamp.replace(/[:.]/g, '-')}.webm`;

      // Convert blob to base64 for FormData
      const formData = new FormData();
      formData.append('data', audioBlob, filename);
      formData.append('mode', mode);
      formData.append('timestamp', timestamp);
      formData.append('filename', filename);
      formData.append('user_id', user.id);
      formData.append('telephely_id', profile?.telephely_id || '');

      const { data, error } = await supabase.functions.invoke('voice-recording-webhook', {
        body: formData,
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        toast.success('Felvétel sikeresen feltöltve!');
        // Clear the recording
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        window.location.reload();
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
    <Layout>
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
                    <SelectItem value="treatnote">TreatNote</SelectItem>
                    <SelectItem value="voxis">Voxis</SelectItem>
                  </SelectContent>
                </Select>
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
                      className={`w-3 h-3 rounded-full ${
                        isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'
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
                    <Button
                      className="flex-1"
                      onClick={handleUpload}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      {isUploading ? 'Feltöltés...' : 'Feltöltés'}
                    </Button>
                  </div>
                </>
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
              <strong>3. Töltse fel a felvételt:</strong> A felvétel befejezése
              után hallgassa meg, majd töltse fel feldolgozásra.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
