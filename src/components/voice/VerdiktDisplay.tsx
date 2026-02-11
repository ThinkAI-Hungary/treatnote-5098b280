import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, X, Loader2, AlertCircle, Book, FileText, Search } from 'lucide-react';
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
  total?: number;
  matched?: number;
  match_rate?: string | number;
  similarity_summary?: {
    average?: number;
    median?: number;
    min?: number;
    max?: number;
  };
  talalatok?: Talalat[];
}

interface Talalat {
  sorszam?: number;
  id?: string;
  input_text?: string;
  context_text?: string;
  final_decision?: {
    status?: string;
    rule_name?: string;
    rule_id?: string | null;
    alapszabaly?: boolean | null;
    valasztas_modja?: string;
    mi_alapjan?: string;
  };
  search_details?: {
    primary?: {
      status?: string;
      threshold?: number;
      selected?: {
        name?: string;
        similarity?: number;
        override?: boolean;
      };
      candidates?: Array<{
        name?: string;
        similarity?: number;
        alapszabaly?: boolean;
      }>;
    };
    fallback?: {
      status?: string;
      threshold?: number;
      selected?: {
        name?: string;
        similarity?: number;
      };
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
  return val.toFixed(4);
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
        Original Text
      </h4>
      <ScrollArea className="max-h-[500px]">
        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-mono" style={{ wordBreak: 'break-word' }}>
          {text || 'N/A'}
        </p>
      </ScrollArea>
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
          Semantic Matcher Results
        </h4>
        <p className="text-sm text-muted-foreground">N/A</p>
      </div>
    );
  }

  const sim = report.similarity_summary;
  const talalatok = report.talalatok || [];

  return (
    <div className="relative rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 via-muted/20 to-transparent p-5 backdrop-blur-sm h-full">
      <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <Search className="h-4 w-4 text-accent" />
        Semantic Matcher Results
      </h4>
      <ScrollArea className="max-h-[600px]">
        <div className="space-y-6 text-sm">
          {/* Overall Statistics */}
          <div className="space-y-2">
            <h5 className="font-medium text-foreground">Overall Statistics</h5>
            <div className="grid grid-cols-3 gap-2 text-foreground/80">
              <div>Total: <span className="font-medium text-foreground">{val(report.total)}</span></div>
              <div>Matched: <span className="font-medium text-foreground">{val(report.matched)}</span></div>
              <div>Match rate: <span className="font-medium text-foreground">{val(report.match_rate)}</span></div>
            </div>
            {sim && (
              <div className="mt-2">
                <h6 className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Similarity Summary</h6>
                <div className="grid grid-cols-4 gap-2 text-foreground/80">
                  <div>Avg: <span className="font-medium">{formatSim(sim.average)}</span></div>
                  <div>Med: <span className="font-medium">{formatSim(sim.median)}</span></div>
                  <div>Min: <span className="font-medium">{formatSim(sim.min)}</span></div>
                  <div>Max: <span className="font-medium">{formatSim(sim.max)}</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Separator */}
          <div className="border-t border-border/40" />

          {/* Matches */}
          <div className="space-y-5">
            <h5 className="font-medium text-foreground">Matches ({talalatok.length})</h5>
            {talalatok.map((t, idx) => (
              <MatchItem key={idx} item={t} />
            ))}
            {talalatok.length === 0 && (
              <p className="text-muted-foreground">No matches found.</p>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function MatchItem({ item }: { item: Talalat }) {
  const fd = item.final_decision;
  const sd = item.search_details;

  return (
    <div className="border border-border/30 rounded-lg p-4 space-y-3 bg-muted/10">
      {/* Header */}
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-mono text-muted-foreground">#{val(item.sorszam)}</span>
        <span className="text-xs text-muted-foreground">ID: {val(item.id)}</span>
      </div>

      {/* Input & Context */}
      <div className="space-y-1">
        <div><span className="text-muted-foreground">Input: </span><span className="text-foreground">{val(item.input_text)}</span></div>
        <div><span className="text-muted-foreground">Context: </span><span className="text-foreground">{val(item.context_text)}</span></div>
      </div>

      {/* Final Decision */}
      {fd && (
        <div className="space-y-1 pl-3 border-l-2 border-sparkle-blue/40">
          <h6 className="text-xs font-semibold uppercase tracking-wide text-sparkle-blue">Final Decision</h6>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-foreground/80">
            <div>Status: <span className="font-medium">{val(fd.status)}</span></div>
            <div>Rule: <span className="font-medium">{val(fd.rule_name)}</span></div>
            <div>Rule ID: <span className="font-mono text-xs">{fd.rule_id === null ? 'null' : val(fd.rule_id)}</span></div>
            <div>Alapszabaly: <span className="font-medium">{val(fd.alapszabaly)}</span></div>
            <div>Valasztas modja: <span className="font-medium">{val(fd.valasztas_modja)}</span></div>
          </div>
          {fd.mi_alapjan && (
            <div className="mt-1"><span className="text-muted-foreground">Mi alapjan: </span><span className="text-foreground/90 italic">{fd.mi_alapjan}</span></div>
          )}
        </div>
      )}

      {/* Search Details */}
      {sd && (
        <div className="space-y-2 pl-3 border-l-2 border-accent/30">
          <h6 className="text-xs font-semibold uppercase tracking-wide text-accent">Search Details</h6>
          
          {/* Primary */}
          {sd.primary && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">Primary</div>
              <div className="text-foreground/80">
                Status: {val(sd.primary.status)} | Threshold: {formatSim(sd.primary.threshold)}
              </div>
              {sd.primary.selected && (
                <div className="text-foreground/80">
                  Selected: {val(sd.primary.selected.name)} (sim: {formatSim(sd.primary.selected.similarity)})
                  {sd.primary.selected.override && <span className="ml-1 text-yellow-500">[override]</span>}
                </div>
              )}
              {sd.primary.candidates && sd.primary.candidates.length > 0 && (
                <div className="mt-1">
                  <div className="text-xs text-muted-foreground mb-1">Candidates (by similarity desc):</div>
                  <div className="space-y-0.5 pl-2">
                    {[...sd.primary.candidates]
                      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
                      .map((c, ci) => (
                        <div key={ci} className="text-xs text-foreground/70">
                          {val(c.name)} | sim: {formatSim(c.similarity)} | alapszabaly: {val(c.alapszabaly)}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fallback */}
          {sd.fallback && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">Fallback</div>
              <div className="text-foreground/80">
                Status: {val(sd.fallback.status)} | Threshold: {formatSim(sd.fallback.threshold)}
              </div>
              {sd.fallback.selected && (
                <div className="text-foreground/80">
                  Selected: {val(sd.fallback.selected.name)} (sim: {formatSim(sd.fallback.selected.similarity)})
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
function TextualListPanel({ text }: { text?: string }) {
  return (
    <div className="relative rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 via-muted/20 to-transparent p-5 backdrop-blur-sm h-full">
      <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
        <Book className="h-4 w-4 text-galaxy-purple" />
        Textual List
      </h4>
      <ScrollArea className="max-h-[500px]">
        <pre className="text-sm leading-relaxed text-foreground/90 whitespace-pre font-mono overflow-x-auto" style={{ tabSize: 4 }}>
          {text || 'N/A'}
        </pre>
      </ScrollArea>
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
    <Card className="md:col-span-2 xl:col-span-3 border-sparkle-blue/30 bg-gradient-to-br from-card via-card to-galaxy-purple/5">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sparkle-blue/20 to-galaxy-purple/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-sparkle-blue" />
          </div>
          <div>
            <CardTitle className="text-lg">
              {isSelectedJob ? 'Elomeny reszletei' : 'Verdikt'}
            </CardTitle>
            <CardDescription>
              {isSelectedJob
                ? `${(selectedJobMode || '').toUpperCase()} - Paciens #${selectedJobPaciensId || 'N/A'}`
                : 'A feldolgozas eredmenye'
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
            <p className="text-muted-foreground text-center mt-4">Feldolgozas folyamatban...</p>
          </div>
        ) : selectedJobStatus === 'error' ? (
          <div className="flex flex-col items-center justify-center py-12 text-destructive">
            <AlertCircle className="h-10 w-10 mb-4" />
            <p className="text-center font-medium">Hiba tortent a feldolgozas soran</p>
            <p className="text-sm text-muted-foreground mt-2">{selectedJobError}</p>
          </div>
        ) : isThreePanel ? (
          /* New three-panel layout */
          <Tabs defaultValue="original" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="original">Original Text</TabsTrigger>
              <TabsTrigger value="semantic">Semantic Matcher</TabsTrigger>
              <TabsTrigger value="textual">Textual List</TabsTrigger>
            </TabsList>
            <TabsContent value="original">
              <OriginalTextPanel text={payload?.transcriber?.text} />
            </TabsContent>
            <TabsContent value="semantic">
              <SemanticMatcherPanel report={payload?.execution_report_human} />
            </TabsContent>
            <TabsContent value="textual">
              <TextualListPanel text={payload?.szoveges_lista} />
            </TabsContent>
          </Tabs>
        ) : (
          /* Legacy fallback for non-treatnote or old format */
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
