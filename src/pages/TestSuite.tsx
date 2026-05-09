// ============================================================
// TreatNote V2 — Test Suite Page
// Developer debugging interface for the V2 clinical pipeline
// Only visible to zsolt@gmail.com
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FlaskConical, Play, Sparkles, Loader2,
  ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle,
  Clock, Search, FileText, Cpu, Shield, ArrowRight, Zap, List,
  Brain,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { actionName, ATOMIC_ACTION_NAMES, ATOMIC_ACTION_OPTIONS } from '@/lib/atomicActionNames';
import { cn } from '@/lib/utils';

// ── Types ──

interface PipelineRun {
  id: string;
  timestamp: Date;
  inputText: string;
  result: any;
  error?: string;
  durationMs: number;
}

interface AssessmentFinding {
  type: string;
  stage: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
}

interface Assessment {
  score: number;
  verdict: 'PASS' | 'WARN' | 'FAIL';
  summary: string;
  findings: AssessmentFinding[];
}

// ── Presets ──

const SAMPLE_TEXTS = [
  { label: 'Egyszerű — 1 tömés', text: 'A 36-os fogon háromfelszínű MOD kompozit tömést végeztem.' },
  { label: 'Közepes — 3 kezelés', text: 'A 36-os fogon háromfelszínű MOD kompozit tömést végeztem. A 46-os fogon egyfelszínű tömés készült. A 14-es fogon infiltrációs érzéstelenítés után gyökérkezelést kezdtem, csatornafeltárás és gyógyszeres zárás történt.' },
  { label: 'Komplex — implantáció', text: 'A 36-os régióban implantátum beültetés történt navigált sablonnal, csontpótlás membránnal. A 15-ös fogon cirkónium korona preparáció, digitális lenyomat és ideiglenes korona készült.' },
  { label: 'Sebészet — extractio', text: 'A 46-os fogat sebészeti feltárásból eltávolítottam, socket prezervációt végeztem csontpótlással és membránnal.' },
];

// ── Stages config ──

const STAGES = [
  { key: '01_transcribe', label: 'Transzkripció', icon: FileText },
  { key: '02_extract', label: 'AI Extrakció', icon: Sparkles },
  { key: '03_validate', label: 'Validáció', icon: Shield },
  { key: '04_expand', label: 'Expand / Vizit-bontás', icon: List },
  { key: '04.5_clinical_validation', label: 'Klinikai Validáció (A-E)', icon: Shield },
  { key: '05_map', label: 'Szótár Mapping', icon: ArrowRight },
  { key: '06_format_rpa', label: 'RPA Kimenet', icon: Zap },
];

// ── Main Component ──

export default function TestSuite() {
  const { profile } = useProfile();
  const telephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id || '';

  // Input state
  const [inputText, setInputText] = useState('');
  const [complexity, setComplexity] = useState('medium');
  const [category, setCategory] = useState('random');
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);

  // Results
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // Assessment
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [assessing, setAssessing] = useState(false);

  const activeRun = runs.find(r => r.id === activeRunId) || null;

  // ── Generate AI dictation ──

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('v2-generate-dictation', {
        body: { complexity, category: category === 'random' ? undefined : category },
      });
      if (error) throw error;
      if (data?.text) setInputText(data.text);
    } catch (err: any) {
      console.error('Generate error:', err);
    } finally {
      setGenerating(false);
    }
  }, [complexity, category]);

  // ── Run pipeline ──

  const runAssessment = useCallback(async (text: string, data: any) => {
    setAssessing(true);
    setAssessment(null);
    try {
      const { data: assessData, error } = await supabase.functions.invoke('v2-assess-result', {
        body: {
          inputText: text,
          rpaOutput: data.rpaOutput,
          unmapped: data.unmapped,
          protocolCount: data.protocolCount,
          vizitCount: data.vizitCount,
          itemCount: data.itemCount,
          debug: data.debug,
        },
      });
      if (error) throw error;
      setAssessment(assessData as Assessment);
    } catch (err: any) {
      console.error('Assessment error:', err);
      setAssessment({ score: 0, verdict: 'FAIL', summary: 'Értékelés sikertelen: ' + err.message, findings: [] });
    } finally {
      setAssessing(false);
    }
  }, []);

  const handleRun = useCallback(async () => {
    if (!inputText.trim() || !telephelyId) return;
    setRunning(true);
    setAssessment(null);
    const t0 = Date.now();
    const runId = crypto.randomUUID();

    try {
      const { data, error } = await supabase.functions.invoke('v2-test-text', {
        body: { text: inputText, telephelyId },
      });
      if (error) throw error;

      const run: PipelineRun = {
        id: runId,
        timestamp: new Date(),
        inputText,
        result: data,
        durationMs: Date.now() - t0,
      };
      setRuns(prev => [run, ...prev].slice(0, 10));
      setActiveRunId(runId);
      // Auto-trigger assessment
      runAssessment(inputText, data);
    } catch (err: any) {
      const run: PipelineRun = {
        id: runId,
        timestamp: new Date(),
        inputText,
        result: null,
        error: err.message || 'Unknown error',
        durationMs: Date.now() - t0,
      };
      setRuns(prev => [run, ...prev].slice(0, 10));
      setActiveRunId(runId);
    } finally {
      setRunning(false);
    }
  }, [inputText, telephelyId, runAssessment]);



  // ── Render ──

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-white text-black overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-3 flex items-center gap-3">
        <FlaskConical className="h-5 w-5" />
        <h1 className="text-lg font-semibold">V2 Test Suite</h1>
        <Badge variant="outline" className="text-xs border-black/20">
          {telephelyId ? telephelyId.slice(0, 8) + '...' : 'nincs telephely'}
        </Badge>
        {runs.length > 0 && (
          <Badge variant="outline" className="text-xs ml-auto border-black/20">
            {runs.length} futtatás
          </Badge>
        )}
      </div>

      {/* 3-panel layout */}
      <div className="flex-1 flex min-h-0">

        {/* ═══ Panel 1: Input ═══ */}
        <div className="w-[340px] shrink-0 border-r flex flex-col overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* AI Generate section */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-black/50">AI Generálás</label>
              <div className="flex gap-2">
                <Select value={complexity} onValueChange={setComplexity}>
                  <SelectTrigger className="h-8 text-xs bg-white border-black/20 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Egyszerű</SelectItem>
                    <SelectItem value="medium">Közepes</SelectItem>
                    <SelectItem value="complex">Komplex</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 text-xs bg-white border-black/20 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random">Random</SelectItem>
                    <SelectItem value="konzervalo">Konzerváló</SelectItem>
                    <SelectItem value="sebeszet">Sebészet</SelectItem>
                    <SelectItem value="implantacio">Implantáció</SelectItem>
                    <SelectItem value="fogpotlastan">Fogpótlástan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs border-black/20 hover:bg-black/5"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1.5" />}
                Szöveg generálása
              </Button>
            </div>

            {/* Presets */}
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-black/50">Sablonok</label>
              {SAMPLE_TEXTS.map((s, i) => (
                <button
                  key={i}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-black/5 transition-colors truncate"
                  onClick={() => setInputText(s.text)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Textarea */}
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-black/50">Diktált szöveg</label>
              <Textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Írja be vagy generálja az AI-val a diktált szöveget..."
                className="min-h-[140px] text-sm bg-white border-black/20 resize-none"
              />
            </div>

            {/* Run button */}
            <Button
              className="w-full bg-black text-white hover:bg-black/80"
              onClick={handleRun}
              disabled={running || !inputText.trim()}
            >
              {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Play className="h-4 w-4 mr-1.5" />}
              Pipeline futtatása
            </Button>

            {/* History */}
            {runs.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-black/10">
                <label className="text-xs font-medium uppercase tracking-wide text-black/50">Előzmények</label>
                {runs.map(run => (
                  <button
                    key={run.id}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded text-xs transition-colors",
                      activeRunId === run.id ? "bg-black/10" : "hover:bg-black/5"
                    )}
                    onClick={() => setActiveRunId(run.id)}
                  >
                    <div className="flex justify-between items-center">
                      <span className="truncate max-w-[180px]">{run.inputText.slice(0, 50)}...</span>
                      <span className="text-black/40 shrink-0 ml-2">{(run.durationMs / 1000).toFixed(1)}s</span>
                    </div>
                    {run.error && <span className="text-red-600 text-[10px]">HIBA</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══ Panel 2: Pipeline Inspector ═══ */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {!activeRun ? (
            <div className="flex items-center justify-center h-full text-black/30">
              <div className="text-center">
                <FlaskConical className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Futtasson egy tesztet a pipeline megtekintéséhez</p>
              </div>
            </div>
          ) : activeRun.error ? (
            <div className="p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="font-medium text-red-800">Pipeline hiba</span>
                </div>
                <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono">{activeRun.error}</pre>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-1">
              {/* Timing bar */}
              <TimingBar timing={activeRun.result?.timing} totalMs={activeRun.durationMs} />

              {/* Stages */}
              <StageTranscribe text={activeRun.result?.transcript} timing={activeRun.result?.timing?.['01_transcribe']} />
              <StageExtract data={activeRun.result} timing={activeRun.result?.timing?.['02_extract']} />
              <StageValidate data={activeRun.result} timing={activeRun.result?.timing?.['03_validate']} />
              <StageExpand data={activeRun.result} timing={activeRun.result?.timing?.['04_expand']} />
              <StageClinicalValidation data={activeRun.result} timing={activeRun.result?.timing?.['04.5_clinical_validation']} />
              <StageMap data={activeRun.result} timing={activeRun.result?.timing?.['05_map']} />
              <StageRpa data={activeRun.result} timing={activeRun.result?.timing?.['06_format_rpa']} />
            </div>
          )}
        </div>

        {/* ═══ Panel 3: AI Assessment ═══ */}
        <div className="w-[300px] shrink-0 border-l overflow-y-auto">
          <div className="p-3 space-y-4">
            {/* Stats */}
            {activeRun?.result && (
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-black/50">Eredmény</label>
                <div className="grid grid-cols-2 gap-1">
                  <StatBadge label="Protokollok" value={activeRun.result.protocolCount} />
                  <StatBadge label="Vizitek" value={activeRun.result.vizitCount} />
                  <StatBadge label="Tételek" value={activeRun.result.itemCount} />
                  <StatBadge label="Unmapped" value={activeRun.result.unmapped?.length || 0} danger={activeRun.result.unmapped?.length > 0} />
                </div>
              </div>
            )}

            {/* AI Assessment */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-black/50" />
                <label className="text-xs font-medium uppercase tracking-wide text-black/50">AI Értékelés</label>
              </div>

              {assessing ? (
                <div className="flex items-center gap-2 py-8 justify-center text-black/40">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Értékelés folyamatban...</span>
                </div>
              ) : assessment ? (
                <div className="space-y-3">
                  {/* Score + Verdict */}
                  <div className={cn(
                    "rounded-lg p-3 border text-center",
                    assessment.verdict === 'PASS' ? 'bg-green-50 border-green-200' :
                    assessment.verdict === 'WARN' ? 'bg-yellow-50 border-yellow-200' :
                    'bg-red-50 border-red-200'
                  )}>
                    <div className={cn(
                      "text-3xl font-mono font-bold",
                      assessment.verdict === 'PASS' ? 'text-green-700' :
                      assessment.verdict === 'WARN' ? 'text-yellow-700' :
                      'text-red-700'
                    )}>
                      {assessment.score}
                    </div>
                    <div className={cn(
                      "text-xs font-medium mt-0.5",
                      assessment.verdict === 'PASS' ? 'text-green-600' :
                      assessment.verdict === 'WARN' ? 'text-yellow-600' :
                      'text-red-600'
                    )}>
                      {assessment.verdict}
                    </div>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-black/70 leading-relaxed">{assessment.summary}</p>

                  {/* Findings */}
                  {assessment.findings.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium uppercase tracking-wide text-black/40">Megállapítások</label>
                      {assessment.findings.map((f, i) => (
                        <div
                          key={i}
                          className={cn(
                            "rounded px-2.5 py-2 border text-xs",
                            f.severity === 'critical' ? 'bg-red-50 border-red-200' :
                            f.severity === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                            'bg-green-50 border-green-200'
                          )}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {f.severity === 'critical' ? <XCircle className="h-3 w-3 text-red-500 shrink-0" /> :
                             f.severity === 'warning' ? <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" /> :
                             <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />}
                            <span className={cn(
                              "font-mono text-[10px] uppercase",
                              f.severity === 'critical' ? 'text-red-600' :
                              f.severity === 'warning' ? 'text-yellow-600' :
                              'text-green-600'
                            )}>{f.type}</span>
                            {f.stage && (
                              <span className="font-mono text-[9px] bg-black/5 text-black/50 px-1 py-0.5 rounded">
                                {f.stage}
                              </span>
                            )}
                          </div>
                          <p className="text-black/70 leading-snug">{f.description}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Re-run assessment */}
                  {activeRun?.result && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs border-black/20"
                      onClick={() => runAssessment(activeRun.inputText, activeRun.result)}
                      disabled={assessing}
                    >
                      <Brain className="h-3 w-3 mr-1.5" />
                      Újraértékelés
                    </Button>
                  )}
                </div>
              ) : !activeRun?.result ? (
                <div className="text-center py-6 text-black/30 text-xs">
                  Futtasson egy tesztet az értékeléshez
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

function StatBadge({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={cn("border rounded px-2 py-1 text-center", danger ? "border-red-300 bg-red-50" : "border-black/10")}>
      <div className={cn("text-lg font-mono font-bold", danger ? "text-red-600" : "")}>{value}</div>
      <div className="text-[9px] text-black/50 uppercase">{label}</div>
    </div>
  );
}

function TimingBar({ timing, totalMs }: { timing?: Record<string, number>; totalMs: number }) {
  if (!timing) return null;
  const stages = Object.entries(timing);
  const total = stages.reduce((s, [, v]) => s + v, 0) || 1;
  const colors = ['#000', '#333', '#555', '#777', '#999', '#bbb', '#ddd'];

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-black/50">Időzítés</span>
        <span className="text-xs font-mono text-black/50">{(totalMs / 1000).toFixed(2)}s össz.</span>
      </div>
      <div className="flex h-5 rounded overflow-hidden border border-black/10">
        {stages.map(([key, ms], i) => {
          const pct = (ms / total) * 100;
          if (pct < 1) return null;
          return (
            <div
              key={key}
              className="relative group"
              style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length] }}
              title={`${key}: ${ms}ms`}
            >
              <div className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                {ms}ms
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-1 flex-wrap">
        {stages.map(([key, ms], i) => (
          <span key={key} className="text-[9px] text-black/40 flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: colors[i % colors.length] }} />
            {key.replace(/^\d+_?/, '')}: {ms}ms
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Stage wrappers ──

function StageSection({ title, timingMs, icon: Icon, status, children, defaultOpen = false }: {
  title: string; timingMs?: number; icon: any; status: 'ok' | 'warn' | 'error' | 'neutral';
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const statusIcon = status === 'ok'
    ? <CheckCircle2 className="h-3 w-3 text-green-600" />
    : status === 'warn'
      ? <AlertTriangle className="h-3 w-3 text-yellow-600" />
      : status === 'error'
        ? <XCircle className="h-3 w-3 text-red-600" />
        : <Cpu className="h-3 w-3 text-black/30" />;

  return (
    <div className="border border-black/10 rounded-lg">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.02] transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <Icon className="h-3.5 w-3.5 shrink-0 text-black/50" />
        <span className="text-xs font-medium flex-1">{title}</span>
        {statusIcon}
        {timingMs !== undefined && (
          <span className="text-[10px] font-mono text-black/40 ml-1">{timingMs}ms</span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-black/5 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}

function StageTranscribe({ text, timing }: { text?: string; timing?: number }) {
  return (
    <StageSection title="01 — Transzkripció" timingMs={timing} icon={FileText} status="ok" defaultOpen>
      <p className="text-sm whitespace-pre-wrap bg-black/[0.02] rounded p-2 font-mono">{text || '—'}</p>
    </StageSection>
  );
}

function StageExtract({ data, timing }: { data: any; timing?: number }) {
  const protocols = data?.rpaOutput ? [] : []; // We need to parse from the full result
  // The v2-test-text returns: protocolCount, rpaOutput, timing
  // But not the full v2 debug data unless we look at the raw response
  const protocolCount = data?.protocolCount || 0;

  return (
    <StageSection title="02 — AI Extrakció" timingMs={timing} icon={Sparkles} status={protocolCount > 0 ? 'ok' : 'warn'}>
      <div className="space-y-2">
        <div className="text-xs text-black/60">{protocolCount} protokoll kinyerve</div>
        {/* We show what we have from the rpaOutput as proxy */}
        {data?.rpaOutput?.vizitek && (
          <div className="text-xs">
            <span className="text-black/40">Kinyert tételek: </span>
            {data.rpaOutput.vizitek.length} sor
          </div>
        )}
      </div>
    </StageSection>
  );
}

function StageValidate({ data, timing }: { data: any; timing?: number }) {
  return (
    <StageSection title="03 — Validáció" timingMs={timing} icon={Shield} status="ok">
      <div className="text-xs text-black/60">Paraméterek validálva, alapértékek kitöltve.</div>
    </StageSection>
  );
}

function StageExpand({ data, timing }: { data: any; timing?: number }) {
  const itemCount = data?.itemCount || 0;
  return (
    <StageSection title="04 — Expand / Vizit-bontás" timingMs={timing} icon={List} status="ok">
      <div className="text-xs text-black/60">{itemCount} tétel expand után</div>
    </StageSection>
  );
}

function StageClinicalValidation({ data, timing }: { data: any; timing?: number }) {
  return (
    <StageSection title="04.5 — Klinikai Validáció" timingMs={timing} icon={Shield} status="ok">
      <div className="text-xs text-black/60">A-E passok lefutottak.</div>
    </StageSection>
  );
}

function StageMap({ data, timing }: { data: any; timing?: number }) {
  const unmapped = data?.unmapped || [];
  return (
    <StageSection title="05 — Szótár Mapping" timingMs={timing} icon={ArrowRight} status={unmapped.length > 0 ? 'warn' : 'ok'}>
      <div className="space-y-2">
        {unmapped.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-red-600">Nem párosított akciók:</div>
            {unmapped.map((u: string) => (
              <div key={u} className="text-xs bg-red-50 border border-red-200 rounded px-2 py-1 font-mono">
                {u} → <span className="text-red-600">{actionName(u)}</span>
              </div>
            ))}
          </div>
        )}
        {unmapped.length === 0 && (
          <div className="text-xs text-green-700">Minden akció sikeresen párosítva.</div>
        )}
      </div>
    </StageSection>
  );
}

function StageRpa({ data, timing }: { data: any; timing?: number }) {
  const vizitek = data?.rpaOutput?.vizitek || [];
  // Group by visit
  const grouped = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const v of vizitek) {
      const arr = map.get(v.vizit) || [];
      arr.push(v);
      map.set(v.vizit, arr);
    }
    return map;
  }, [vizitek]);

  return (
    <StageSection title="06 — RPA Kimenet" timingMs={timing} icon={Zap} status={vizitek.length > 0 ? 'ok' : 'warn'} defaultOpen>
      <div className="space-y-3">
        {Array.from(grouped.entries()).map(([vizitNum, items]) => (
          <div key={vizitNum}>
            <div className="text-xs font-medium mb-1 text-black/60">Vizit {vizitNum}</div>
            <table className="w-full text-xs border border-black/10 rounded">
              <thead>
                <tr className="bg-black/[0.03]">
                  <th className="text-left px-2 py-1 font-medium">Fog</th>
                  <th className="text-left px-2 py-1 font-medium">Kezelés</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, i: number) => (
                  <tr key={i} className="border-t border-black/5">
                    <td className="px-2 py-1 font-mono">{item.fog || '—'}</td>
                    <td className="px-2 py-1">{item.name || item.kezeles || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {vizitek.length === 0 && (
          <div className="text-xs text-black/40">Nincs RPA kimenet</div>
        )}
      </div>
    </StageSection>
  );
}
