import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2, AlertCircle, Book, FileText, Search, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/useToastMessage';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';

interface TreatNotePayload {
  szoveges_lista?: string;
  transcriber?: { text?: string };
  execution_report_human?: ExecutionReportHuman;
  kezdeti_szoveg?: string;
  tisztitott_szoveg?: string;
  // Legacy fields
  link?: string;
  osszesitett?: unknown;
}

interface ExecutionReportHuman {
  statisztika?: {
    total?: number;
    matched?: number;
    match_rate?: string | number;
    similarity_osszesites?: {
      darab?: number;
      atlag?: number;
      median?: number;
      min?: number;
      max?: number;
    };
  };
  talalatok?: Talalat[];
}

interface Talalat {
  sorszam?: number;
  id?: string;
  input_text?: string;
  context_text?: string;
  eredmeny?: {
    status?: string;
    rule_name?: string;
    rule_id?: string | null;
    alapszabaly?: boolean | null;
    valasztas_modja?: string;
    mi_alapjan?: string;
  };
  keresek?: {
    primary?: {
      status?: string;
      threshold?: number;
      kivalasztott?: {
        name?: string;
        similarity?: number;
        alapszabaly_override?: boolean;
      };
      jeloltek?: Array<{
        name?: string;
        similarity?: number;
        alapszabaly?: boolean;
      }>;
    };
    fallback?: {
      status?: string;
      threshold?: number | null;
      kivalasztott?: {
        name?: string;
        similarity?: number;
      } | null;
    };
  };
}

function parsePayload(responseData: unknown): TreatNotePayload | null {
  try {
    let data = responseData;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return null; }
    }
    if (Array.isArray(data) && data.length > 0) data = data[0];
    // Handle wrapped { payload: ... } structure
    if (data && typeof data === 'object' && 'payload' in data) {
      data = (data as Record<string, unknown>).payload;
    }
    return data as TreatNotePayload;
  } catch {
    return null;
  }
}

function hasThreePanelData(payload: TreatNotePayload | null): boolean {
  if (!payload) return false;
  return !!(payload.transcriber?.text || payload.execution_report_human);
}

function formatSim(val: number | undefined | null): string {
  if (val == null) return 'N/A';
  return val.toFixed(2);
}

function val(v: unknown, fallback = 'N/A'): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function formatTreatnotePayload(payload: any): string {
  if (!payload || !Array.isArray(payload.vizitek)) {
    return payload?.szoveges_lista || JSON.stringify(payload, null, 2);
  }

  const visits = new Map<number, any[]>();
  for (const item of payload.vizitek) {
    const v = item.vizit || 1;
    if (!visits.has(v)) visits.set(v, []);
    visits.get(v)!.push(item);
  }

  let result = '';
  const sortedVisits = Array.from(visits.entries()).sort((a, b) => a[0] - b[0]);

  for (const [vNum, items] of sortedVisits) {
    result += `${vNum}. Ülés\n`;
    result += `----------------------\n`;
    for (const item of items) {
      const fog = item.fog && item.fog !== 'szájüreg' ? `Fog: ${item.fog}` : 'Szájüreg';
      const text = item.name || 'Ismeretlen kezelés';
      const qty = item.quantity > 1 ? ` (x${item.quantity})` : '';
      const extras = [];
      if (item.hidtag === 'pontic_only') extras.push('hídtag');
      if (item.hidtag === 'pillar_only') extras.push('pillér');
      const extraStr = extras.length > 0 ? ` [${extras.join(', ')}]` : '';

      result += ` • ${fog} | ${text}${qty}${extraStr}\n`;
    }
    result += `\n`;
  }

  return result.trim();
}

// ── Panel 1: Original Text ──
function OriginalTextPanel({ text }: { text?: string }) {
  return (
    <div className="relative rounded-xl border border-border/40 bg-card p-5 h-full shadow-sm">
      <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-sparkle-blue" />
        Eredeti szöveg
      </h4>
      <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-mono" style={{ wordBreak: 'break-word' }}>
        {text || 'N/A'}
      </p>
    </div>
  );
}

// ── Panel 2: Semantic Matcher Results ──
function SemanticMatcherPanel({ report }: { report?: ExecutionReportHuman }) {
  if (!report) {
    return (
      <div className="relative rounded-xl border border-border/40 bg-card p-5 h-full shadow-sm">
        <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-accent" />
          Szabály találatok
        </h4>
        <p className="text-sm text-muted-foreground">N/A</p>
      </div>
    );
  }

  const talalatok = report.talalatok || [];

  return (
    <div className="relative rounded-xl border border-border/40 bg-card p-5 h-full shadow-sm">
      <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <Search className="h-4 w-4 text-accent" />
        Szabály találatok
      </h4>
      <div className="space-y-5 text-sm">
        <h5 className="font-medium text-foreground">Találatok ({talalatok.length})</h5>
        {talalatok.map((t, idx) => (
          <MatchItem key={idx} item={t} />
        ))}
        {talalatok.length === 0 && (
          <p className="text-muted-foreground">Nincs találat.</p>
        )}
      </div>
    </div>
  );
}

function MatchItem({ item }: { item: Talalat }) {
  const fd = item.eredmeny;
  const sd = item.keresek;

  // Extract only the context part after "Kontextus:"
  const contextOnly = item.context_text?.includes('Kontextus:')
    ? item.context_text.split('Kontextus:')[1]?.trim()
    : item.context_text;

  return (
    <div className="border border-border/40 rounded-lg p-4 space-y-3 bg-background/50 hover:bg-background/80 transition-colors shadow-sm">
      {/* Header */}
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-mono text-muted-foreground">#{val(item.sorszam)}</span>
      </div>

      {/* Input & Context */}
      <div className="space-y-1">
        <div><span className="text-muted-foreground">Szabály: </span><span className="text-foreground">{val(item.input_text)}</span></div>
        <div><span className="text-muted-foreground">Szövegkörnyezet: </span><span className="text-foreground">{val(contextOnly)}</span></div>
      </div>

      {/* Eredmeny (Final Decision) */}
      {fd && (
        <div className="space-y-1 pl-3 border-l-2 border-sparkle-blue/40">
          <h6 className="text-xs font-semibold uppercase tracking-wide text-sparkle-blue">Eredmény</h6>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-foreground/80">
            <div>Status: <span className="font-medium">{val(fd.status)}</span></div>
            <div>Rule: <span className="font-medium">{val(fd.rule_name)}</span></div>
            <div>Alapszabály: <span className="font-medium">{val(fd.alapszabaly)}</span></div>
            <div>Választás módja: <span className="font-medium">{val(fd.valasztas_modja)}</span></div>
          </div>
          {fd.mi_alapjan && (
            <div className="mt-1"><span className="text-muted-foreground">Mi alapján: </span><span className="text-foreground/90 italic">{fd.mi_alapjan}</span></div>
          )}
        </div>
      )}

      {/* Keresek (Search Details) */}
      {sd && (
        <div className="space-y-2 pl-3 border-l-2 border-accent/30">
          <h6 className="text-xs font-semibold uppercase tracking-wide text-accent">Keresés részletei</h6>

          {/* Primary */}
          {sd.primary && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">Primary</div>
              <div className="text-foreground/80">
                Status: {val(sd.primary.status)} | Küszöb: {formatSim(sd.primary.threshold)}
              </div>
              {sd.primary.kivalasztott && (
                <div className="text-foreground/80">
                  Kiválasztott: {val(sd.primary.kivalasztott.name)} (Hasonlóság: {formatSim(sd.primary.kivalasztott.similarity)})
                  {sd.primary.kivalasztott.alapszabaly_override && <span className="ml-1 text-yellow-500">[override]</span>}
                </div>
              )}
              {sd.primary.jeloltek && sd.primary.jeloltek.length > 0 && (
                <div className="mt-1">
                  <div className="text-xs text-muted-foreground mb-1">Jelöltek (hasonlóság szerint):</div>
                  <div className="space-y-0.5 pl-2">
                    {[...sd.primary.jeloltek]
                      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
                      .map((c, ci) => (
                        <div key={ci} className="text-xs text-foreground/70">
                          {val(c.name)} | Hasonlóság: {formatSim(c.similarity)} | alapszabály: {val(c.alapszabaly)}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fallback */}
          {sd.fallback && sd.fallback.status !== 'N/A' && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">Fallback</div>
              <div className="text-foreground/80">
                Status: {val(sd.fallback.status)} | Küszöb: {formatSim(sd.fallback.threshold)}
              </div>
              {sd.fallback.kivalasztott && (
                <div className="text-foreground/80">
                  Kiválasztott: {val(sd.fallback.kivalasztott.name)} (Hasonlóság: {formatSim(sd.fallback.kivalasztott.similarity)})
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Panel 3: Textual List ──
function linkifyText(text: string) {
  const splitRegex = /(https?:\/\/[^\s\\]+)/g;
  const testRegex = /^https?:\/\//;
  const parts = text.split(splitRegex);
  return parts.map((part, i) =>
    testRegex.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-sparkle-blue underline hover:text-blue-500 dark:hover:text-sparkle-blue/80 break-all">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function normalizeNewlines(text: string): string {
  return text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

function TextualListPanel({ text }: { text?: string }) {
  const normalizedText = useMemo(() => {
    if (!text) return '';
    const nl = normalizeNewlines(text);
    // Increment Vizit numbers by 1 so they start from 1 instead of 0
    return nl.replace(/Vizit\s+(\d+)/gi, (_, num) => `Vizit ${parseInt(num, 10) + 1}`);
  }, [text]);

  return (
    <div className="relative rounded-xl border border-border/40 bg-card p-5 h-full shadow-sm">
      <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
        <Book className="h-4 w-4 text-galaxy-purple" />
        Kitöltés
      </h4>
      <pre className="text-sm leading-relaxed text-foreground/90 whitespace-pre font-mono overflow-x-auto" style={{ tabSize: 4 }}>
        {normalizedText ? linkifyText(normalizedText) : 'N/A'}
      </pre>
    </div>
  );
}

// ── Complaint Dialog ──
function ComplaintDialog({ jobId, jobType, hasComplaint, onSubmitted }: { jobId: string, jobType: string, hasComplaint: boolean, onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('voice_job_complaints').insert({
        job_id: jobId,
        job_type: jobType || 'native',
        complaint_text: text.trim(),
        created_by: user?.id,
        status: 'new',
      });
      if (error) throw error;
      toast.success('Probléma sikeresen bejelentve');
      setOpen(false);
      onSubmitted();
      setText('');
    } catch (err: any) {
      console.error(err);
      toast.error('Hiba történt a bejelentés során');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex text-muted-foreground hover:text-destructive hover:border-destructive/50">
          <AlertCircle className="mr-2 h-4 w-4" />
          {hasComplaint ? 'Újabb bejelentés' : 'Probléma bejelentése'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hasComplaint ? 'Újabb probléma bejelentése' : 'Milyen problémát tapasztalt?'}</DialogTitle>
          <DialogDescription>
            Kérjük írja le, ha a felvétel feldolgozása vagy a szabály felismerés nem volt megfelelő. A bejelentés szövege rögzítésre kerül az eddigi bejelentések mellé, és utólag nem módosítható.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder="Kérem röviden írja le a problémát..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[100px]"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Mégse</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={isSubmitting || !text.trim()}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Küldés
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main export ──
interface VerdiktDisplayProps {
  isLoading: boolean;
  responseData: unknown;
  isSelectedJob: boolean;
  selectedJobMode?: string;
  selectedJobPaciensId?: string | null;
  selectedJobError?: string | null;
  selectedJobStatus?: string;
  jobId?: string;
  jobType?: 'legacy' | 'native';
  progressPercent?: number | null;
  progressMessage?: string | null;
  rawAudioText?: string | null;
  claudeCleanedText?: string | null;
  onComplaintSubmitted?: () => void;
  onClose: () => void;
  onTerminate?: () => void;
  onViewInChart?: () => void;
  voxisReviewPanelNode?: React.ReactNode;
}

import { isVoxisJob } from '@/lib/voxisUtils';
import { TreatnoteReviewPanel } from '../patients/dental-chart/TreatnoteReviewPanel';
import { AmbulansllapReviewPanel } from '../patients/ambulans/AmbulansllapReviewPanel';

export function VerdiktDisplay({
  isLoading,
  responseData,
  isSelectedJob,
  selectedJobMode,
  selectedJobPaciensId,
  selectedJobError,
  selectedJobStatus,
  jobId,
  jobType,
  progressPercent,
  progressMessage,
  rawAudioText,
  claudeCleanedText,
  onComplaintSubmitted,
  onClose,
  onTerminate,
  onViewInChart,
  voxisReviewPanelNode,
}: VerdiktDisplayProps) {
  const payload = useMemo(() => parsePayload(responseData), [responseData]);

  const effectiveJobMode = useMemo(() => {
    if (isVoxisJob(selectedJobMode, responseData)) return 'voxis';
    return selectedJobMode;
  }, [selectedJobMode, responseData]);

  const isThreePanel = useMemo(() => hasThreePanelData(payload) || effectiveJobMode === 'voxis' || effectiveJobMode === 'treatnote' || effectiveJobMode === 'ambulans', [payload, effectiveJobMode]);

  const [complaints, setComplaints] = useState<{ id: string; complaint_text: string, created_at: string, users?: { full_name: string } }[]>([]);
  const [localProgress, setLocalProgress] = useState(0);

  const fetchComplaints = async () => {
    if (!jobId) return;
    try {
      const { data, error } = await supabase
        .from('voice_job_complaints')
        .select(`
          id,
          complaint_text,
          created_at,
          users:created_by (
            full_name
          )
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setComplaints(data);
      }
    } catch (e) {
      console.error('Error fetching complaints', e);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, [jobId]);

  // Reset progress when a new job starts or gets selected
  useEffect(() => {
    if (isLoading) {
      setLocalProgress(Math.max(5, progressPercent || 0));
    } else {
      setLocalProgress(progressPercent === 100 || selectedJobStatus === 'completed' ? 100 : (progressPercent || 0));
    }
  }, [jobId, isLoading, selectedJobStatus]);

  // Sync with DB provided progress if it jumps ahead
  useEffect(() => {
    if (progressPercent && progressPercent > localProgress) {
      setLocalProgress(progressPercent);
    }
  }, [progressPercent, localProgress]);

  // Calculate smooth local progress to provide realistic feedback
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLocalProgress((prev) => {
          // Target ~15 seconds processing time (3% every 500ms = 15 secs to 90%)
          let step = 3.0;
          if (prev > 80) step = 1.0;
          if (prev > 90) step = 0.3;
          if (prev > 96) step = 0.05;

          const next = prev + step;
          return next > 98 ? 98 : next;
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  // 10-step message ladder based on the current percent (Fallback if no active backend message)
  const getProgressMessage = (percent: number) => {
    if (percent < 12) return "Hangfelvétel előkészítése és biztonságos titkosítása...";
    if (percent < 25) return "Küldés a neurális AI beszédfelismerő motorba...";
    if (percent < 38) return "Szakorvosi hanganyag elemzése és szöveggé alakítása...";
    if (percent < 50) return "Nyers átirat fogadása és nyelvi tisztítása...";
    if (percent < 65) return "Klinikai mondatok, panaszok és kifejezések kinyerése...";
    if (percent < 78) return "Fogállapotok vizuális kvadránsokká térképezése...";
    if (percent < 88) return "Változások generálása és kontextuális szabályok ellenőrzése...";
    if (percent < 96) return "Státusz adatbázis és végeredmény formázása...";
    return "Adatok mentése a kartonba és szinkronizáció...";
  };

  const displayPercent = Math.floor(localProgress);
  const displayMessage = isLoading
    ? (progressMessage || getProgressMessage(displayPercent))
    : (progressMessage || 'Kérjük, várjon amíg az AI elemzi a felvételt.');

  return (
    <Card className="md:col-span-2 xl:col-span-3 border-primary/20 bg-gradient-to-t from-card/70 to-card backdrop-blur-sm dark:from-card/30 dark:to-card/60 dark:border-sparkle-blue/20">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">
              {isSelectedJob ? 'Előzmény részletei' : 'Verdikt'}
            </CardTitle>
            <CardDescription>
              {isSelectedJob
                ? `${effectiveJobMode === 'voxis' ? 'STÁTUSZFELVÉTEL' : effectiveJobMode === 'treatnote' ? 'KEZELÉSI TERV' : effectiveJobMode === 'ambulans' ? 'AMBULÁNS LAP' : (effectiveJobMode || '').toUpperCase()} - Páciens #${selectedJobPaciensId || 'N/A'}`
                : 'A feldolgozás eredménye'
              }
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {jobId && (
            <>
              {complaints.length > 0 && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 flex font-medium">
                  <AlertCircle className="mr-1.5 h-3.5 w-3.5" />
                  {complaints.length} probléma bejelentve
                </Badge>
              )}
              <ComplaintDialog
                jobId={jobId}
                jobType={jobType || 'native'}
                hasComplaint={complaints.length > 0}
                onSubmitted={() => {
                  fetchComplaints();
                  if (onComplaintSubmitted) onComplaintSubmitted();
                }}
              />
            </>
          )}
          {!isLoading && responseData && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-destructive/10"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {complaints.length > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-destructive/5 border border-destructive/20 text-sm space-y-3">
            <h4 className="font-semibold text-destructive flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4" />
              Bejelentett problémák ({complaints.length})
            </h4>
            {complaints.map((c, i) => (
              <div key={c.id || i} className="bg-destructive/10 rounded p-3 border border-destructive/20">
                <div className="flex items-center gap-2 mb-1 opacity-70 text-[11px] font-medium">
                  <span>{new Date(c.created_at).toLocaleString('hu-HU')}</span>
                  {c.users?.full_name && (
                    <>
                      <span>•</span>
                      <span>{c.users.full_name}</span>
                    </>
                  )}
                </div>
                <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{c.complaint_text}</p>
              </div>
            ))}
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 max-w-md mx-auto">
            <div className="relative mb-6">
              <Loader2 className="h-12 w-12 animate-spin text-sparkle-blue" />
              <div className="absolute inset-0 h-12 w-12 animate-ping opacity-20 rounded-full bg-sparkle-blue" />
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-2 text-center">
              Feldolgozás folyamatban...
            </h3>

            <p className="text-sm text-muted-foreground text-center mb-6 h-10 flex items-center justify-center">
              {jobType === 'legacy' ? "Várakozás a rendszer válaszára..." : displayMessage}
            </p>

            {jobType !== 'legacy' && (
              <div className="w-full space-y-2">
                <div className="flex justify-between text-xs font-medium text-muted-foreground w-full px-1">
                  <span>Folyamat</span>
                  <span>{displayPercent}%</span>
                </div>
                <Progress value={localProgress} className="h-2 w-full" />
              </div>
            )}

            {onTerminate && (
              <Button
                variant="outline"
                size="sm"
                onClick={onTerminate}
                className="w-full mt-4 text-destructive hover:bg-destructive/10"
              >
                <X className="w-4 h-4 mr-2" />
                Várakozás megszakítása
              </Button>
            )}
          </div>
        ) : selectedJobStatus === 'error' ? (
          <div className="flex flex-col items-center justify-center py-12 text-destructive">
            <AlertCircle className="h-10 w-10 mb-4" />
            <p className="text-center font-medium">Hiba történt a feldolgozás során</p>
            <p className="text-sm text-muted-foreground mt-2">{selectedJobError}</p>
          </div>
        ) : isThreePanel ? (
          <Tabs defaultValue={effectiveJobMode === 'voxis' || effectiveJobMode === 'ambulans' ? 'textual' : 'original'} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="original">Eredeti szöveg</TabsTrigger>
              {effectiveJobMode !== 'voxis' && effectiveJobMode !== 'ambulans' && (
                <TabsTrigger value="semantic">Szabály találatok</TabsTrigger>
              )}
              <TabsTrigger value="textual">Kitöltés</TabsTrigger>
            </TabsList>
            <div className="mt-4">
              <TabsContent value="original">
                <OriginalTextPanel text={rawAudioText || claudeCleanedText || payload?.kezdeti_szoveg || payload?.tisztitott_szoveg || payload?.transcriber?.text} />
              </TabsContent>
              {effectiveJobMode !== 'voxis' && effectiveJobMode !== 'ambulans' && (
                <TabsContent value="semantic">
                  <SemanticMatcherPanel report={responseData?.execution_report_human || payload?.execution_report_human} />
                </TabsContent>
              )}
              <TabsContent value="textual" className="space-y-4">
                {/* Voxis: structured review + confirmation panel */}
                {effectiveJobMode === 'voxis' && voxisReviewPanelNode ? (
                  voxisReviewPanelNode
                ) : (
                  <>
                    {selectedJobPaciensId && (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-foreground">Sikeres mentés</h4>
                          <p className="text-sm text-muted-foreground mt-1">Az adatok bekerültek a páciens kartonjába.</p>
                        </div>
                        {onViewInChart ? (
                          <Button
                            variant="outline"
                            className="shrink-0 gap-2"
                            onClick={onViewInChart}
                          >
                            Megtekintés a kartonban
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button asChild variant="outline" className="shrink-0 gap-2">
                            <Link to={`/patients/${selectedJobPaciensId}/${effectiveJobMode === 'treatnote' ? 'treatment-plan' : effectiveJobMode === 'ambulans' ? 'ambulatory-chart' : 'status'}`}>
                              Megtekintés a kartonban
                              <ArrowRight className="w-4 h-4" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    )}
                    <TextualListPanel text={
                      (payload?.link ? `🔗 Megtekintés a külső rendszerben: ${payload.link}\n\n` : '') +
                      (effectiveJobMode === 'voxis' ? JSON.stringify(payload, null, 2)
                        : effectiveJobMode === 'ambulans' ? JSON.stringify(responseData, null, 2)
                          : effectiveJobMode === 'treatnote' ? formatTreatnotePayload(payload)
                            : payload?.szoveges_lista || JSON.stringify(payload, null, 2))
                    } />
                  </>
                )}
              </TabsContent>
            </div>
          </Tabs>
        ) : (
          <div className="relative rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 via-muted/20 to-transparent p-5 backdrop-blur-sm">
            <pre className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-mono" style={{ wordBreak: 'break-word' }}>
              {typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
      {/* Portal target for VoxisReviewPanel global save button */}
      <div id="voxis-save-portal"></div>
    </Card>
  );
}
