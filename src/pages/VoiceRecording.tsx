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

// Helper to parse verdikt from structured JSON response
function parseVerdikt(responseData: unknown): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  
  try {
    // Parse if string
    let data = responseData;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        // If not valid JSON, return as plain text with link detection
        return parseVerdiktPlainText(data as string);
      }
    }
    
    // Handle array response (webhook returns array)
    if (Array.isArray(data) && data.length > 0) {
      data = data[0];
    }
    
    const response = data as {
      link?: string;
      osszesitett?: {
        vizitek?: Record<string, {
          kezelesek?: Record<string, { fogak?: string[] }>;
        }>;
      };
      szoveges_lista?: string;
    };
    
    // Add link line
    if (response.link) {
      elements.push(
        <div key="link-line" className="mb-4">
          <span>A kitöltés értékét itt tudja megtekinteni: </span>
          <a
            href={response.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sparkle-blue hover:text-sparkle-blue/80 underline underline-offset-2 inline-flex items-center gap-1 transition-colors"
          >
            {response.link}
            <ExternalLink className="h-3 w-3 inline-block" />
          </a>
        </div>
      );
    }
    
    // Parse osszesitett.vizitek
    const vizitek = response.osszesitett?.vizitek;
    if (vizitek) {
      // Sort vizit keys numerically
      const vizitKeys = Object.keys(vizitek).sort((a, b) => parseInt(a) - parseInt(b));
      
      vizitKeys.forEach((vizitKey, vizitIdx) => {
        const vizitNum = parseInt(vizitKey) + 1; // +1 as requested
        const vizitData = vizitek[vizitKey];
        
        elements.push(
          <div key={`vizit-${vizitKey}`} className={`font-semibold text-foreground ${vizitIdx > 0 ? 'mt-4' : ''}`}>
            Vizit: {vizitNum}
          </div>
        );
        
        // Group kezelesek by fog
        const kezelesek = vizitData.kezelesek || {};
        const fogToKezelesek: Record<string, string[]> = {};
        
        Object.entries(kezelesek).forEach(([kezelesNev, kezelesData]) => {
          const fogak = kezelesData.fogak || [];
          fogak.forEach((fog) => {
            if (!fogToKezelesek[fog]) {
              fogToKezelesek[fog] = [];
            }
            fogToKezelesek[fog].push(kezelesNev);
          });
        });
        
        // Sort fog numbers
        const sortedFogak = Object.keys(fogToKezelesek).sort((a, b) => parseInt(a) - parseInt(b));
        
        sortedFogak.forEach((fog) => {
          elements.push(
            <div key={`vizit-${vizitKey}-fog-${fog}`} className="font-medium text-foreground/90 mt-2 pl-8">
              Fog: {fog}
            </div>
          );
          
          // Sort kezelesek alphabetically
          const kezelesekForFog = fogToKezelesek[fog].sort();
          kezelesekForFog.forEach((kezeles, kezelesIdx) => {
            elements.push(
              <div key={`vizit-${vizitKey}-fog-${fog}-kezeles-${kezelesIdx}`} className="pl-16 text-foreground/80">
                - {kezeles}
              </div>
            );
          });
        });
      });
      
      return elements;
    }
    
    // Fallback to szoveges_lista if no structured data
    if (response.szoveges_lista) {
      return parseVerdiktPlainText(response.szoveges_lista);
    }
    
    // If nothing matched, try plain text parsing on original
    if (typeof responseData === 'string') {
      return parseVerdiktPlainText(responseData);
    }
    
    return elements.length > 0 ? elements : [<div key="empty">Nincs megjeleníthető adat</div>];
  } catch (e) {
    console.error('Error parsing verdikt:', e);
    if (typeof responseData === 'string') {
      return parseVerdiktPlainText(responseData);
    }
    return [<div key="error">Hiba a válasz feldolgozása során</div>];
  }
}

// Fallback plain text parser
function parseVerdiktPlainText(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  
  return lines.map((line, lineIndex) => {
    let processedLine = line;
    let indentClass = '';
    
    // Increment Vizit numbers by 1
    processedLine = processedLine.replace(/Vizit:\s*(\d+)/gi, (match, num) => {
      const incremented = parseInt(num, 10) + 1;
      return `Vizit: ${incremented}`;
    });
    
    // Also handle vizitek variant
    processedLine = processedLine.replace(/vizitek:\s*(\d+)/gi, (match, num) => {
      const incremented = parseInt(num, 10) + 1;
      return `vizitek: ${incremented}`;
    });
    
    // Determine indentation based on content
    const trimmedLine = processedLine.trim();
    if (trimmedLine.toLowerCase().startsWith('vizit')) {
      indentClass = '';
    } else if (trimmedLine.toLowerCase().startsWith('fog')) {
      indentClass = 'pl-12';
    } else if (trimmedLine.length > 0 && !trimmedLine.includes(':') && !trimmedLine.toLowerCase().startsWith('a kitöltés')) {
      indentClass = 'pl-28';
    } else if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•')) {
      indentClass = 'pl-28';
    }
    
    // Split line by URL pattern and create clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = processedLine.split(urlRegex);
    
    const elements = parts.map((part, partIndex) => {
      if (urlRegex.test(part)) {
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
    
    const isVizitLine = trimmedLine.toLowerCase().startsWith('vizit');
    const isFogLine = trimmedLine.toLowerCase().startsWith('fog');
    
    return (
      <div 
        key={lineIndex} 
        className={`${indentClass} ${isVizitLine ? 'font-semibold text-foreground mt-3 first:mt-0' : ''} ${isFogLine ? 'font-medium text-foreground/90 mt-2' : ''}`}
      >
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
  const setMode = (value: 'voxis' | 'treatnote') => store.setMode(userId, value);
  const clearVerdikt = () => store.clearVerdikt(userId);
  
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
        
        // Store full webhook response for structured parsing
        if (data.webhookResponse) {
          // Store as JSON string for the parser to handle
          const responseToStore = typeof data.webhookResponse === 'string' 
            ? data.webhookResponse 
            : JSON.stringify(data.webhookResponse);
          console.log('Webhook response stored:', responseToStore.substring(0, 200));
          setVerdikt(responseToStore);
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
