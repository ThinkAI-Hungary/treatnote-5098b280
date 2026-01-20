import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Mic, Square, Play, Pause, Upload, Trash2, Loader2, AlertCircle, Book, Info, AlertTriangle } from 'lucide-react';
import { useState, useRef } from 'react';
import { useVoiceRecorder, formatDuration } from '@/hooks/useVoiceRecorder';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useFlexiConnection } from '@/hooks/useFlexiConnection';
import { useSzotar } from '@/hooks/useSzotar';
import { useKlinikaAdmins } from '@/hooks/useKlinikaAdmins';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type RecordingMode = 'voxis' | 'treatnote';

export default function VoiceRecording() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isConnected: isFlexiConnected, isLoading: isFlexiLoading } = useFlexiConnection();
  const { hasSzotar, isLoading: szotarLoading } = useSzotar();
  const { admins: klinikaAdmins } = useKlinikaAdmins();
  const { isKlinikaAdmin, isAdmin } = useCachedRoles();
  const navigate = useNavigate();
  const [mode, setMode] = useState<RecordingMode>('treatnote');
  const [paciensId, setPaciensId] = useState('');
  const [isPaciensIdLocked, setIsPaciensIdLocked] = useState(false);
  const [paciensIdError, setPaciensIdError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCheckboxPulsing, setIsCheckboxPulsing] = useState(false);
  const checkboxRef = useRef<HTMLButtonElement>(null);
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

  const handleUpload = async () => {
    if (!audioBlob || !user) {
      toast.error('Nincs felvétel a feltöltéshez');
      return;
    }

    setIsUploading(true);

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
      formData.append('telephely_id', profile?.telephely_id || '');
      formData.append('PaciensID', paciensId);

      // Call edge function directly with fetch since supabase.functions.invoke doesn't handle FormData properly
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

  // Show message if Flexi is not connected
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

  // Show message if Szotar is not available
  if (!szotarLoading && !hasSzotar) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hangfelvétel</h1>
          <p className="text-muted-foreground mt-1">
            Vizsgálati jegyzőkönyv diktálása
          </p>
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
                      const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                      setPaciensId(value);
                      setPaciensIdError(false);
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
                        return;
                      }
                      // Block if already at max length
                      if (paciensId.length >= 8) {
                        e.preventDefault();
                        setPaciensIdError(true);
                      }
                    }}
                    disabled={isRecording || isPaciensIdLocked}
                    className={`transition-all duration-300 ${
                      paciensIdError 
                        ? 'border-2 border-warning ring-2 ring-destructive/50 shadow-[0_0_10px_hsl(var(--warning)/0.5)]' 
                        : ''
                    } ${isPaciensIdLocked ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                  />
                  {paciensIdError && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-pulse cursor-help">
                            <AlertTriangle className="h-5 w-5 text-warning" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>A nyolc karakteres szabványhossz után is érzékelhető volt karakterlenyomás! Kérem ellenőrízze, hogy helyes-e a bevitt adat!</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    ref={checkboxRef}
                    id="lock-paciens-id"
                    checked={isPaciensIdLocked}
                    onCheckedChange={(checked) => setIsPaciensIdLocked(checked === true)}
                    disabled={isRecording}
                    className={`transition-all duration-300 ${
                      isCheckboxPulsing ? 'animate-[pulse-fade_0.6s_ease-in-out_infinite]' : ''
                    }`}
                  />
                  <Label 
                    htmlFor="lock-paciens-id" 
                    className="text-sm text-muted-foreground cursor-pointer select-none"
                  >
                    Zárolás
                  </Label>
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
                  <div 
                    className="flex-1"
                    onMouseEnter={() => {
                      if (!isPaciensIdLocked) {
                        setIsCheckboxPulsing(true);
                      }
                    }}
                    onMouseLeave={() => {
                      // Let the current animation cycle complete before stopping
                      setTimeout(() => setIsCheckboxPulsing(false), 1800);
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
  );
}