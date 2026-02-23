import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2, AlertCircle, Book, FileText, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMemo } from 'react';

interface TreatNotePayload {
  szoveges_lista?: string;
  transcriber?: { text?: string };
  execution_report_human?: ExecutionReportHuman;
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

// ── Panel 1: Original Text ──
function OriginalTextPanel({ text }: { text?: string }) {
  return (
    <div className="relative rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 via-muted/20 to-transparent p-5 backdrop-blur-sm h-full">
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
      <div className="relative rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 via-muted/20 to-transparent p-5 backdrop-blur-sm h-full">
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
    <div className="relative rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 via-muted/20 to-transparent p-5 backdrop-blur-sm h-full">
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
    <div className="border border-border/30 rounded-lg p-4 space-y-3 bg-muted/10">
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
    <div className="relative rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 via-muted/20 to-transparent p-5 backdrop-blur-sm h-full">
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

// ── Main export ──
interface VerdiktDisplayProps {
  isLoading: boolean;
  responseData: unknown;
  isSelectedJob: boolean;
  selectedJobMode?: string;
  selectedJobPaciensId?: string | null;
  selectedJobError?: string | null;
  selectedJobStatus?: string;
  onClose: () => void;
}

export function VerdiktDisplay({
  isLoading,
  responseData,
  isSelectedJob,
  selectedJobMode,
  selectedJobPaciensId,
  selectedJobError,
  selectedJobStatus,
  onClose,
}: VerdiktDisplayProps) {
  const payload = useMemo(() => parsePayload(responseData), [responseData]);
  const isThreePanel = useMemo(() => hasThreePanelData(payload), [payload]);

  return (
    <Card className="md:col-span-2 xl:col-span-3 border-primary/20 bg-gradient-to-br from-card/70 to-card backdrop-blur-sm dark:from-card/30 dark:to-card/60 dark:border-sparkle-blue/20">
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
                ? `${(selectedJobMode || '').toUpperCase()} - Páciens #${selectedJobPaciensId || 'N/A'}`
                : 'A feldolgozás eredménye'
              }
            </CardDescription>
          </div>
        </div>
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
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="relative">
              <Loader2 className="h-10 w-10 animate-spin text-sparkle-blue" />
              <div className="absolute inset-0 h-10 w-10 animate-ping opacity-20 rounded-full bg-sparkle-blue" />
            </div>
            <p className="text-muted-foreground text-center mt-4">Feldolgozás folyamatban...</p>
          </div>
        ) : selectedJobStatus === 'error' ? (
          <div className="flex flex-col items-center justify-center py-12 text-destructive">
            <AlertCircle className="h-10 w-10 mb-4" />
            <p className="text-center font-medium">Hiba történt a feldolgozás során</p>
            <p className="text-sm text-muted-foreground mt-2">{selectedJobError}</p>
          </div>
        ) : isThreePanel ? (
          <Tabs defaultValue="original" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="original">Eredeti szöveg</TabsTrigger>
              <TabsTrigger value="semantic">Szabály találatok</TabsTrigger>
              <TabsTrigger value="textual">Kitöltés</TabsTrigger>
            </TabsList>
            {/* All panels occupy the same grid cell. The tallest one sets
                the container height; inactive panels are invisible but still
                participate in layout, preventing page jumps. */}
            <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
              <TabsContent value="original" forceMount className="data-[state=inactive]:invisible">
                <OriginalTextPanel text={payload?.transcriber?.text} />
              </TabsContent>
              <TabsContent value="semantic" forceMount className="data-[state=inactive]:invisible">
                <SemanticMatcherPanel report={payload?.execution_report_human} />
              </TabsContent>
              <TabsContent value="textual" forceMount className="data-[state=inactive]:invisible">
                <TextualListPanel text={payload?.szoveges_lista} />
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
    </Card>
  );
}
