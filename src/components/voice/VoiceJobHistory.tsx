import {
  Clock, CheckCircle2, XCircle, Loader2, Mic, ChevronRight, Trash2,
  History, FileText, Book, AlertCircle, Filter
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { UnifiedVoiceJob as VoiceJob } from '@/hooks/useUnifiedVoiceHistory';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { toast } from '@/hooks/useToastMessage';
import { useState, useRef, useCallback } from 'react';
import { RuleDetailsPopup } from '@/components/shared/RuleDetailsPopup';

// ─── How many jobs to show in the sidebar before "see more" ───
const SIDEBAR_CAP = 10;

interface VoiceJobHistoryProps {
  jobs: VoiceJob[];
  isLoading: boolean;
  selectedJobId: string | null;
  onSelectJob: (job: VoiceJob) => void;
  onJobTerminated?: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getModeLabel(mode: string): string {
  switch (mode) {
    case 'treatnote': return 'Kezelési terv';
    case 'voxis': return 'Státuszfelvétel';
    case 'ambulans': return 'Ambuláns';
    default: return mode;
  }
}

function StatusIcon({ status }: { status: VoiceJob['status'] }) {
  switch (status) {
    case 'processing': return <Loader2 className="h-4 w-4 animate-spin text-sparkle-blue" />;
    case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
    default: return null;
  }
}

import { mapVoxisToModels } from '../patients/dental-chart/voxisMapper';
import { DENTAL_STATUSES } from '../patients/dental-chart/constants';

function getStatusName(id?: string) {
  if (!id || id === 'healthy') return 'Egészséges';
  return id.split(',').map(part => {
    const trimmed = part.trim();
    return DENTAL_STATUSES.find(s => s.id === trimmed)?.name || trimmed;
  }).join(', ');
}

function parseJobResult(job: any): { originalText: string | null; kitoltes: string | null; appliedRules: any[] } {
  try {
    const result = job.result;
    const mode = job.mode;
    let data: any = result;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return { originalText: null, kitoltes: null, appliedRules: [] }; }
    }
    if (Array.isArray(data) && data.length > 0) data = data[0];
    if (data && typeof data === 'object' && 'payload' in data) data = (data as any).payload;
    
    // Handle n8n wrapping
    let finalData = data;
    if (data && typeof data === 'object' && 'result' in data && typeof data.result === 'object') {
        finalData = data.result;
    }

    const appliedRules = finalData?.execution_report_human?.talalatok || [];

    let kitoltesStr = finalData?.szoveges_lista ?? null;
    if (!kitoltesStr && (mode === 'voxis' || finalData?.MEGJEGYZES_FO !== undefined || finalData?.Megjegyzes_fo !== undefined)) {
      const megjegyzes = finalData?.MEGJEGYZES_FO || finalData?.Megjegyzes_fo;
      kitoltesStr = megjegyzes ? `Megjegyzés: ${megjegyzes}\n\n--- Érintett fogak ---\n` : `--- Érintett fogak ---\n`;
      
      const mappedUpdates = mapVoxisToModels(finalData, {}, job.treatnote_patient_id || '');
      
      if (mappedUpdates.length > 0) {
        for (const update of mappedUpdates) {
          kitoltesStr += `Fog ${update.tooth_number}:\n`;
          kitoltesStr += `  Státusz: ${getStatusName(update.status)}\n`;
          if (update.surfaces) kitoltesStr += `  Felszín: ${update.surfaces}\n`;
          if (update.notes) kitoltesStr += `  Észrevétel: ${update.notes}\n`;
        }
      } else {
        kitoltesStr = megjegyzes ? kitoltesStr + "Nincsenek specifikus fogak megjelölve." : "Nem lett változás regisztrálva a fogakon.";
      }
    }

    // Attempt to parse out some treatnote output if szoveges_lista is missing
    if (!kitoltesStr && mode === 'treatnote' && appliedRules.length > 0) {
      kitoltesStr = "--- Felismert Kezelések ---\n";
      appliedRules.forEach((rule: any) => {
         if (rule.eredmeny?.rule_name) {
             kitoltesStr += `- ${rule.eredmeny.rule_name}\n`;
         }
      });
    }

    return {
      originalText: job.raw_audio_text ?? job.claude_cleaned_text ?? finalData?.transcriber?.raw?.text ?? finalData?.transcriber?.text ?? finalData?.audioText ?? null,
      kitoltes: kitoltesStr,
      appliedRules: Array.isArray(appliedRules) ? appliedRules : [],
    };
  } catch (e) {
    console.error("Error parsing job result", e);
    return { originalText: null, kitoltes: null, appliedRules: [] };
  }
}

function normalizeText(text: string): string {
  return text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

// ─── Right-side hover preview panel ───
function PreviewPanel({
  job,
  onMouseEnter,
  onMouseLeave,
}: {
  job: VoiceJob | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <div
      className="flex flex-col h-full"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {!job ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <History className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            Vigye az egeret egy rekord fölé az előnézet megtekintéséhez
          </p>
        </div>
      ) : job.status === 'processing' ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <Loader2 className="h-8 w-8 animate-spin text-sparkle-blue mb-3" />
          <p className="text-sm text-muted-foreground">Feldolgozás folyamatban…</p>
        </div>
      ) : job.status === 'error' ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <AlertCircle className="h-8 w-8 text-destructive mb-3" />
          <p className="text-sm font-medium text-destructive mb-1">Hiba történt</p>
          <p className="text-xs text-muted-foreground">{job.error || 'Ismeretlen hiba'}</p>
        </div>
      ) : (
        <PreviewContent job={job} />
      )}
    </div>
  );
}

function PreviewContent({ job }: { job: VoiceJob }) {
  const { originalText, kitoltes, appliedRules } = parseJobResult(job);
  const [selectedRule, setSelectedRule] = useState<{ id: string; name: string } | null>(null);

  if (!originalText && !kitoltes) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <Mic className="h-8 w-8 text-muted-foreground/20 mb-3" />
        <p className="text-sm text-muted-foreground">Nincs megtekinthető adat</p>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-scroll p-4 space-y-4"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'hsl(var(--border)) transparent',
      }}
    >
      {/* Header meta */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
          {getModeLabel(job.mode)}
        </p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(job.created_at), 'yyyy.MM.dd HH:mm')}
          {job.paciens_id && ` · Páciens #${job.paciens_id}`}
        </p>
      </div>

      {/* Eredeti szöveg */}
      {originalText && (
        <div className="rounded-lg border border-galaxy-purple/20 bg-galaxy-purple/5 dark:bg-transparent">
          <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
            <FileText className="h-3.5 w-3.5 text-galaxy-purple flex-shrink-0" />
            <span className="text-xs font-semibold text-galaxy-purple">Eredeti szöveg</span>
          </div>
          <pre className="text-xs text-foreground/80 font-mono leading-relaxed whitespace-pre-wrap break-words px-3 pb-3">
            {normalizeText(originalText)}
          </pre>
        </div>
      )}

      {/* Kitöltés */}
      {kitoltes && (
        <div className="rounded-lg border border-galaxy-purple/20 bg-galaxy-purple/5 dark:bg-transparent">
          <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
            <Book className="h-3.5 w-3.5 text-galaxy-purple flex-shrink-0" />
            <span className="text-xs font-semibold text-galaxy-purple">Kitöltés</span>
          </div>
          <pre className="text-xs text-foreground/80 font-mono leading-relaxed whitespace-pre-wrap break-words px-3 pb-3">
            {normalizeText(kitoltes)}
          </pre>
        </div>
      )}

      {/* Applied Rules */}
      {appliedRules.length > 0 && (
        <div className="rounded-lg border border-galaxy-purple/20 bg-galaxy-purple/5 dark:bg-transparent overflow-hidden mt-6">
          <div className="flex items-center gap-1.5 px-3 pt-3 pb-2 border-b border-galaxy-purple/10">
            <Filter className="h-3.5 w-3.5 text-galaxy-purple flex-shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide text-galaxy-purple">Alkalmazott Szabályok</span>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-galaxy-purple/5 text-muted-foreground border-b border-galaxy-purple/10">
                <tr>
                  <th className="px-4 py-2 font-medium">Ssz.</th>
                  <th className="px-4 py-2 font-medium">Szabály Neve</th>
                  <th className="px-4 py-2 font-medium">Kontextus</th>
                  <th className="px-4 py-2 font-medium">Egyezés Oka</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-galaxy-purple/10">
                {appliedRules.map((t: any, idx: number) => {
                  const hasRuleId = !!t.eredmeny?.rule_id;
                  return (
                    <tr 
                        key={idx} 
                        className={cn(
                            "transition-colors",
                            hasRuleId ? "hover:bg-galaxy-purple/10 cursor-pointer" : "hover:bg-galaxy-purple/5"
                        )}
                        onClick={() => {
                            if (hasRuleId) {
                                setSelectedRule({ id: t.eredmeny.rule_id, name: t.eredmeny.rule_name });
                            }
                        }}
                    >
                      <td className="px-4 py-3 text-muted-foreground font-medium">{t.sorszam || idx + 1}.</td>
                      <td className="px-4 py-3 font-semibold text-foreground/90">{t.eredmeny?.rule_name || '-'}</td>
                      <td className="px-4 py-3 text-muted-foreground break-words text-xs min-w-[200px]">{t.context_text || '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{t.eredmeny?.mi_alapjan || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      <RuleDetailsPopup 
          ruleId={selectedRule?.id || ''}
          ruleName={selectedRule?.name || ''}
          open={!!selectedRule}
          onOpenChange={(open) => !open && setSelectedRule(null)}
      />
    </div>
  );
}


// ─── Full history popup ───
function HistoryPopup({
  jobs,
  selectedJobId,
  onSelectJob,
}: {
  jobs: VoiceJob[];
  selectedJobId: string | null;
  onSelectJob: (job: VoiceJob) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hoveredJob, setHoveredJob] = useState<VoiceJob | null>(null);
  // Timeout ref used to debounce clearing the hover so moving to the right panel doesn't flash
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHoverClear = useCallback(() => {
    clearTimer.current = setTimeout(() => setHoveredJob(null), 120);
  }, []);

  const cancelHoverClear = useCallback(() => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  }, []);

  const handleRowEnter = useCallback((job: VoiceJob) => {
    cancelHoverClear();
    setHoveredJob(job);
  }, [cancelHoverClear]);

  const handleRowLeave = useCallback(() => {
    scheduleHoverClear();
  }, [scheduleHoverClear]);

  const handleSelect = (job: VoiceJob) => {
    onSelectJob(job);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-xs text-muted-foreground hover:text-foreground gap-1.5"
        onClick={() => setOpen(true)}
      >
        <History className="h-3.5 w-3.5" />
        További előzmények megtekintése
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) { cancelHoverClear(); setHoveredJob(null); }
        }}
      >
        <DialogContent
          className="max-w-4xl w-[90vw] h-[80vh] flex flex-col p-0 gap-0 border-primary/20 backdrop-blur-md overflow-hidden"
          style={{
            backgroundColor: document.documentElement.classList.contains('dark') ? 'hsl(260 35% 10%)' : 'hsl(240 10% 88%)',
            color: document.documentElement.classList.contains('dark') ? 'hsl(0 0% 95%)' : 'hsl(262 50% 13%)',
          }}
        >
          <DialogHeader className="px-6 py-4 border-b border-border/40 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Összes előzmény
              <Badge variant="secondary" className="ml-1 text-xs">{jobs.length}</Badge>
            </DialogTitle>
          </DialogHeader>

          {/* Two-panel body */}
          <div className="flex flex-1 min-h-0">
            {/* Left: scrollable list */}
            <div className="w-[52%] border-r border-border/40 flex flex-col min-h-0">
              <ScrollArea className="flex-1">
                <div className="space-y-1 p-3">
                  {jobs.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Mic className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">Még nincs előzmény</p>
                    </div>
                  )}
                  {jobs.map(job => (
                    <button
                      key={job.id}
                      onClick={() => handleSelect(job)}
                      onMouseEnter={() => handleRowEnter(job)}
                      onMouseLeave={handleRowLeave}
                      className={cn(
                        'w-full text-left p-3 rounded-lg border transition-all duration-150',
                        'hover:bg-muted/60 hover:border-border',
                        selectedJobId === job.id
                          ? 'bg-muted border-sparkle-blue/50 shadow-sm'
                          : hoveredJob?.id === job.id
                            ? 'bg-muted/40 border-border'
                            : 'bg-transparent border-transparent'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <StatusIcon status={job.status} />
                            <span className="font-medium text-sm">{getModeLabel(job.mode)}</span>
                            {job.paciens_id && (
                              <span className="text-xs text-muted-foreground">#{job.paciens_id}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{formatDuration(job.duration_seconds)}</span>
                            <span>·</span>
                            <span>{format(new Date(job.created_at), 'yyyy.MM.dd HH:mm')}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 mt-0.5">
                          {job.isFlexi && (
                            <span className="flex items-center justify-center h-4 w-4 rounded-sm bg-emerald-500/10 text-emerald-500 font-bold text-[10px]" title="Flexi-Dent folyamat">
                              F
                            </span>
                          )}
                          <ChevronRight className={cn(
                            'h-4 w-4 flex-shrink-0 transition-colors',
                            selectedJobId === job.id ? 'text-sparkle-blue' : 'text-muted-foreground/40'
                          )} />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Right: hover preview — mouseEnter cancels clear so panel stays while mouse is here */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <PreviewPanel
                job={hoveredJob}
                onMouseEnter={cancelHoverClear}
                onMouseLeave={scheduleHoverClear}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main export ───
export function VoiceJobHistory({ jobs, isLoading, selectedJobId, onSelectJob, onJobTerminated }: VoiceJobHistoryProps) {
  const [terminatingJobId, setTerminatingJobId] = useState<string | null>(null);

  const handleTerminateJob = async (e: React.MouseEvent, job: VoiceJob) => {
    e.stopPropagation();
    setTerminatingJobId(job.id);
    try {
      const table = job.isFlexi ? 'voice_jobs' : 'native_voice_jobs';
      const { error } = await supabase.from(table).delete().eq('id', job.id);
      if (error) throw error;
      toast.success('Feldolgozás leállítva');
      onJobTerminated?.();
    } catch (err) {
      console.error('Failed to terminate job:', err);
      toast.error('Nem sikerült leállítani a feldolgozást');
    } finally {
      setTerminatingJobId(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Előzmények
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const sidebarJobs = jobs.slice(0, SIDEBAR_CAP);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Előzmények
          {jobs.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {jobs.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 px-4 text-center py-12">
            <Mic className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Még nincs előzmény</p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1">
              <div className="space-y-1 p-3 pt-0">
                {sidebarJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => onSelectJob(job)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border transition-all duration-200',
                      'hover:bg-muted/50 hover:border-border',
                      selectedJobId === job.id
                        ? 'bg-muted border-sparkle-blue/50 shadow-sm'
                        : 'bg-transparent border-transparent'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusIcon status={job.status} />
                          <span className="font-medium text-sm truncate">{getModeLabel(job.mode)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDuration(job.duration_seconds)}</span>
                          <span>•</span>
                          <span className="truncate">
                            {format(new Date(job.created_at), 'yyyy.MM.dd HH:mm')}
                          </span>
                        </div>
                        {job.paciens_id && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Páciens: #{job.paciens_id}
                          </div>
                        )}
                      </div>
                      {job.status === 'processing' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => handleTerminateJob(e, job)}
                          disabled={terminatingJobId === job.id}
                          title="Feldolgozás leállítása"
                        >
                          {terminatingJobId === job.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          {job.isFlexi && (
                            <span className="flex items-center justify-center h-4 w-4 rounded-sm bg-emerald-500/10 text-emerald-500 font-bold text-[10px]" title="Flexi-Dent folyamat">
                              F
                            </span>
                          )}
                          <ChevronRight className={cn(
                            'h-4 w-4 text-muted-foreground/50 flex-shrink-0',
                            selectedJobId === job.id && 'text-sparkle-blue'
                          )} />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>

            <div className="px-3 pb-3 flex-shrink-0 border-t border-border/30 pt-2">
              <HistoryPopup
                jobs={jobs}
                selectedJobId={selectedJobId}
                onSelectJob={onSelectJob}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
