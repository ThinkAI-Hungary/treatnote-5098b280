import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Mic, Square, Play, Pause, Upload, Trash2, Loader2, AlertCircle, Book, Info, X, Sparkles, ExternalLink } from 'lucide-react';
import { useState, useRef, useMemo } from 'react';
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
import { useVoiceRecordingStore } from '@/stores/voiceRecordingStore';

type RecordingMode = 'voxis' | 'treatnote';

// Helper to parse verdikt and increment vizitek, make links clickable
function parseVerdikt(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  
  return lines.map((line, lineIndex) => {
    // Process vizitek: add +1 to the number
    let processedLine = line.replace(/vizitek:\s*(\d+)/gi, (match, num) => {
      const incremented = parseInt(num, 10) + 1;
      return `vizitek: ${incremented}`;
    });
    
    // Split line by URL pattern and create clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = processedLine.split(urlRegex);
    
    const elements = parts.map((part, partIndex) => {
      if (urlRegex.test(part)) {
        // Reset regex lastIndex
        urlRegex.lastIndex = 0;
        return (
          <a
            key={`${lineIndex}-${partIndex}`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sparkle-blue hover:text-sparkle-blue/80 underline underline-offset-2 inline-flex items-center gap-1 transition-colors"
          >
            {part}
            <ExternalLink className="h-3 w-3 inline-block" />
          </a>
        );
      }
      return <span key={`${lineIndex}-${partIndex}`}>{part}</span>;
    });
    
    return (
      <div key={lineIndex}>
        {elements}
      </div>
    );
  });
}

export default function VoiceRecording() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isConnected: isFlexiConnected, isLoading: isFlexiLoading } = useFlexiConnection();
  const { hasSzotar, isLoading: szotarLoading } = useSzotar();
  const { admins: klinikaAdmins } = useKlinikaAdmins();
  const { isKlinikaAdmin, isAdmin } = useCachedRoles();
  const navigate = useNavigate();
  
  // Persistent state from store
  const { 
    verdikt, 
    paciensId, 
    isPaciensIdLocked, 
    mode,
    setVerdikt, 
    setPaciensId, 
    setIsPaciensIdLocked, 
    setMode,
    clearVerdikt 
  } = useVoiceRecordingStore();
  
  // Local state
  const [isUploading, setIsUploading] = useState(false);
  const [isCheckboxPulsing, setIsCheckboxPulsing] = useState(false);
  const [isZarolasHovered, setIsZarolasHovered] = useState(false);
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

  // Memoize parsed verdikt
  const parsedVerdikt = useMemo(() => {
    if (!verdikt) return null;
    return parseVerdikt(verdikt);
  }, [verdikt]);

  const handleOpenFlexiDialog = () => {
    navigate('/profile?openFlexi=true');
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      // Clear verdikt when starting a new recording
      clearVerdikt();
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
    setIsVerdiktLoading(true);

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
      console.log('Webhook response:', JSON.stringify(data));

      if (data?.success) {
        toast.success('Felvétel sikeresen feltöltve!');
        
        // Extract szoveges_lista from response if available
        let szoveg: string | null = null;
        
        if (data.webhookResponse) {
          if (Array.isArray(data.webhookResponse) && data.webhookResponse.length > 0) {
            szoveg = data.webhookResponse[0]?.szoveges_lista;
          } else if (typeof data.webhookResponse === 'object' && data.webhookResponse.szoveges_lista) {
            szoveg = data.webhookResponse.szoveges_lista;
          } else if (typeof data.webhookResponse === 'string') {
            szoveg = data.webhookResponse;
          }
        }
        
        console.log('szoveges_lista:', szoveg);
        if (szoveg) {
          setVerdikt(szoveg);
        }
        
        resetRecording();
      } else {
        throw new Error(data?.error || 'Ismeretlen hiba');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Hiba a feltöltés során: ' + (error.message || 'Ismeretlen hiba'));
    } finally {
      setIsUploading(false);
      setIsVerdiktLoading(false);
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
                              className={`transition-all duration-300 relative z-10 ${
                                isCheckboxPulsing ? 'animate-pulse-fade' : ''
                              }`}
                            />
                          </div>
                          <Label 
                            htmlFor="lock-paciens-id" 
                            className={`text-sm cursor-pointer select-none ${
                              !paciensId ? 'text-muted-foreground/50' : 'text-muted-foreground'
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
                  Készítsen egy felvételt a bal oldali panelen.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Verdikt card - styled to match galaxy theme */}
        {(isVerdiktLoading || verdikt) && (
          <Card className="md:col-span-2 border-sparkle-blue/30 bg-gradient-to-br from-card via-card to-galaxy-purple/5">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sparkle-blue/20 to-galaxy-purple/20 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-sparkle-blue" />
                </div>
                <div>
                  <CardTitle className="text-lg">Verdikt</CardTitle>
                  <CardDescription>
                    A feldolgozás eredménye
                  </CardDescription>
                </div>
              </div>
              {!isVerdiktLoading && verdikt && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-destructive/10"
                  onClick={clearVerdikt}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isVerdiktLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="relative">
                    <Loader2 className="h-10 w-10 animate-spin text-sparkle-blue" />
                    <div className="absolute inset-0 h-10 w-10 animate-ping opacity-20 rounded-full bg-sparkle-blue" />
                  </div>
                  <p className="text-muted-foreground text-center mt-4">
                    Feldolgozás folyamatban...
                  </p>
                </div>
              ) : (
                <div className="relative rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 via-muted/20 to-transparent p-5 backdrop-blur-sm">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-sparkle-blue/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-galaxy-purple/5 rounded-full blur-2xl pointer-events-none" />
                  <div className="relative text-sm leading-relaxed text-foreground/90 space-y-1">
                    {parsedVerdikt}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
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
