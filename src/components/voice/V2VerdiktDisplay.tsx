// ============================================================
// TreatNote V2 — VerdiktDisplay Component
// Redesigned for V2 engine output with full debug data
// ============================================================

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  FileText, Shield, Cpu, ScrollText, Brain, Loader2,
  ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle, Info, X
} from 'lucide-react';
import { actionName } from '@/lib/atomicActionNames';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { cn } from '@/lib/utils';
import { PROTOCOL_DEFAULTS } from '@/lib/protocolDefaults';

// ── Types matching V2 engine output ──

interface V2Result {
  vizitek?: RpaVisitItem[];
  vizit_szam?: number;
  v2?: V2DebugData;
  execution_report_human?: any;
}

interface V2DebugData {
  sessionId: string;
  transcript: string;
  extraction: {
    protocols: ProtocolInstance[];
    rawResponse: string;
    tokensUsed: number;
  };
  validation: {
    protocols: ProtocolInstance[];
    warnings: ValidationWarning[];
  };
  expansion: {
    items: ExpandedItem[];
  };
  clinicalValidation: {
    removedByPassA: number;
    removedByPassB: number;
    removedByPassC: number;
    removedByPassD: number;
    removedByPassE: number;
    totalRemoved: number;
  };
  mapping: {
    items: MappedItem[];
    unmapped: string[];
  };
  timing: Record<string, number>;
}

interface ProtocolInstance {
  templateSlug: string | null;
  confidence: number;
  parameters: Record<string, unknown>;
  atomicActions: { slug: string; parameters: Record<string, unknown>; confidence?: number }[];
}

interface ValidationWarning {
  actionSlug: string;
  field: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

interface ExpandedItem {
  actionSlug: string;
  actionName: string;
  toothFdi: number | null;
  quantity: number;
  scaling: string;
  visitNum: number;
  templateSlug: string | null;
  clinicalPhase: string | null;
  parameters: Record<string, unknown>;
}

interface MappedItem extends ExpandedItem {
  szotarKezelesId: string | null;
  szotarKezelesName: string | null;
  confidence: number;
  reviewed: boolean;
}

interface RpaVisitItem {
  vizit: string;
  fog: string;
  name: string;
}

// ── Helpers ──

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = (confidence * 100).toFixed(0);
  const cls = confidence >= 0.8 ? 'bg-green-50 text-green-700 border-green-200'
    : confidence >= 0.5 ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
    : 'bg-red-50 text-red-700 border-red-200';
  return <Badge variant="outline" className={`${cls} text-xs`}>{pct}%</Badge>;
}

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case 'error': return <XCircle size={14} className="text-red-500" />;
    case 'warning': return <AlertTriangle size={14} className="text-yellow-500" />;
    default: return <Info size={14} className="text-blue-500" />;
  }
}

function protocolName(slug: string | null): string {
  if (!slug) return 'Ad-hoc protokoll';
  return PROTOCOL_DEFAULTS[slug]?.nameHu || slug;
}

function formatParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => {
    if (k === 'tooth_fdi') return `fog: ${v}`;
    if (k === 'surfaces') return `felszinek: ${v}`;
    if (k === 'material') return `anyag: ${v}`;
    if (k === 'canal_count') return `csatorna: ${v}`;
    return `${k}: ${v}`;
  }).join(', ');
}

// ── Tab: Transcript ──

function TranscriptTab({ v2 }: { v2: V2DebugData }) {
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Eredeti átirat</h3>
      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-4 border border-gray-200">
        {v2.transcript || 'Nincs átirat'}
      </p>
    </div>
  );
}

// ── Tab: Validation ──

function ValidationTab({ v2 }: { v2: V2DebugData }) {
  const cv = v2.clinicalValidation;
  const passes = [
    { name: 'Pass A: Kategória deduplikáció', removed: cv.removedByPassA },
    { name: 'Pass B: Klinikai sorrend', removed: cv.removedByPassB },
    { name: 'Pass C: Pozíció/mennyiség', removed: cv.removedByPassC },
    { name: 'Pass D: Márka konzisztencia', removed: cv.removedByPassD },
    { name: 'Pass E: Cross-vizit deduplikáció', removed: cv.removedByPassE },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Parameter warnings */}
      {v2.validation.warnings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Paraméter figyelmeztetések</h3>
          <div className="space-y-1">
            {v2.validation.warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-3 py-2 border border-gray-200">
                <SeverityIcon severity={w.severity} />
                <span className="font-medium text-gray-900">{actionName(w.actionSlug)}</span>
                <span className="text-gray-500">{w.field}:</span>
                <span className="text-gray-700">{w.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clinical validation passes */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">
          Klinikai validáció ({cv.totalRemoved} tétel eltávolítva)
        </h3>
        <div className="space-y-1">
          {passes.map((pass, i) => (
            <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded px-3 py-2 border border-gray-200">
              <span className="text-gray-800">{pass.name}</span>
              <span className={pass.removed > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                {pass.removed > 0 ? `-${pass.removed}` : 'OK'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: RPA Output ──

function RpaOutputTab({ result }: { result: V2Result }) {
  const visits = useMemo(() => {
    if (!result.vizitek) return [];
    const map = new Map<string, RpaVisitItem[]>();
    for (const item of result.vizitek) {
      if (!map.has(item.vizit)) map.set(item.vizit, []);
      map.get(item.vizit)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [result]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2 mb-1">
        <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-300">
          {result.vizitek?.length || 0} tétel
        </Badge>
        <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-300">
          {visits.length} vizit
        </Badge>
      </div>

      {visits.map(([vizitKey, items]) => {
        const vizitNum = vizitKey.replace('vizit_', '');
        return (
          <div key={vizitKey} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-900">{vizitNum}. Ülés</span>
            </div>
            <div className="divide-y divide-gray-100">
              {items.map((item, j) => (
                <div key={j} className="flex items-center gap-3 text-sm px-3 py-2">
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded min-w-[56px] text-center">
                    {item.fog === 'teljesszajureg' ? 'Teljes' : item.fog}
                  </span>
                  <span className="text-gray-900">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab: Logs (combined: Protocols + Vizit terv + Mapping + Timing) ──

function LogsTab({ v2, result }: { v2: V2DebugData; result: V2Result }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    protocols: true, visits: true, mapping: true, timing: false,
  });

  const toggle = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const totalMs = Object.values(v2.timing).reduce((a, b) => a + b, 0);

  // Visit grouping
  const visits = useMemo(() => {
    const map = new Map<number, ExpandedItem[]>();
    for (const item of v2.expansion.items) {
      if (!map.has(item.visitNum)) map.set(item.visitNum, []);
      map.get(item.visitNum)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [v2]);

  const mapped = v2.mapping.items.filter(i => i.szotarKezelesName);
  const unmappedList = v2.mapping.unmapped || [];

  return (
    <div className="p-4 space-y-2">

      {/* ── Protocols ── */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => toggle('protocols')} className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
          <span className="text-sm font-semibold text-gray-900">
            Protokollok ({v2.extraction.protocols.length})
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{v2.extraction.tokensUsed} token</span>
            {openSections.protocols ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          </div>
        </button>
        {openSections.protocols && (
          <div className="divide-y divide-gray-100">
            {v2.extraction.protocols.map((protocol, i) => (
              <div key={i} className="px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{protocolName(protocol.templateSlug)}</span>
                  <ConfidenceBadge confidence={protocol.confidence} />
                </div>
                {Object.keys(protocol.parameters).length > 0 && (
                  <div className="text-xs text-gray-500 mb-1">{formatParams(protocol.parameters)}</div>
                )}
                <div className="space-y-0.5">
                  {protocol.atomicActions.map((action, j) => (
                    <div key={j} className="text-xs text-gray-700 bg-gray-50 rounded px-2 py-1 flex items-center gap-2">
                      <span className="text-gray-400 w-4 text-right">{j + 1}.</span>
                      <span className="font-medium">{actionName(action.slug)}</span>
                      {Object.keys(action.parameters).length > 0 && (
                        <span className="text-gray-400">({formatParams(action.parameters)})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Visit plan ── */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => toggle('visits')} className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
          <span className="text-sm font-semibold text-gray-900">
            Vizit terv ({visits.length} vizit, {v2.expansion.items.length} tétel)
          </span>
          {openSections.visits ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </button>
        {openSections.visits && (
          <div className="divide-y divide-gray-100">
            {visits.map(([visitNum, items]) => (
              <div key={visitNum} className="px-3 py-2">
                <div className="text-xs font-semibold text-gray-600 mb-1">{visitNum}. Vizit</div>
                <div className="space-y-0.5">
                  {items.map((item, j) => (
                    <div key={j} className="text-xs flex items-center gap-2 bg-gray-50 rounded px-2 py-1">
                      <span className="text-gray-400 w-4 text-right">{j + 1}.</span>
                      <span className="font-medium text-gray-800">{actionName(item.actionSlug)}</span>
                      {item.toothFdi && <Badge variant="outline" className="text-[10px] py-0 bg-white text-gray-600 border-gray-300">fog {item.toothFdi}</Badge>}
                      {item.quantity > 1 && <Badge variant="outline" className="text-[10px] py-0 bg-blue-50 text-blue-700 border-blue-200">x{item.quantity}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Mapping ── */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => toggle('mapping')} className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
          <span className="text-sm font-semibold text-gray-900">
            Mapping ({mapped.length} párosított{unmappedList.length > 0 ? `, ${unmappedList.length} hiányzó` : ''})
          </span>
          {openSections.mapping ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </button>
        {openSections.mapping && (
          <div className="divide-y divide-gray-100">
            {mapped.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs px-3 py-1.5">
                <span className="font-medium text-gray-800 w-48 truncate" title={item.actionSlug}>{actionName(item.actionSlug)}</span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-700 flex-1 truncate">{item.szotarKezelesName}</span>
                <ConfidenceBadge confidence={item.confidence} />
                {item.reviewed && <CheckCircle2 size={12} className="text-green-500" />}
              </div>
            ))}
            {unmappedList.length > 0 && (
              <div className="px-3 py-2">
                <div className="text-xs text-red-600 font-medium mb-1">Nem párosított:</div>
                <div className="flex flex-wrap gap-1">
                  {unmappedList.map((slug, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">{actionName(slug)}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Timing ── */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => toggle('timing')} className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
          <span className="text-sm font-semibold text-gray-900">
            Timing ({(totalMs / 1000).toFixed(1)}s)
          </span>
          {openSections.timing ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </button>
        {openSections.timing && (
          <div className="px-3 py-2 space-y-1.5">
            {Object.entries(v2.timing).map(([stage, ms]) => {
              const pct = totalMs > 0 ? (ms / totalMs) * 100 : 0;
              return (
                <div key={stage} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 font-mono">{stage}</span>
                    <span className="text-gray-500">{ms}ms ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-600 rounded-full" style={{ width: `${Math.max(pct, 1)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Raw LLM response */}
      <details className="mt-2">
        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Nyers LLM válasz</summary>
        <pre className="text-xs text-gray-600 mt-2 bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
          {v2.extraction.rawResponse}
        </pre>
      </details>
    </div>
  );
}

// ── Tab: AI Assessment ──

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

function AssessmentTab({ assessment, assessing, onRerun }: {
  assessment: Assessment | null;
  assessing: boolean;
  onRerun: () => void;
}) {
  if (assessing) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-3" />
        <p className="text-sm text-gray-500">AI kiértékelés folyamatban...</p>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Brain className="h-8 w-8 mb-3" />
        <p className="text-sm">Nincs kiértékelés</p>
      </div>
    );
  }

  const verdictColor = assessment.verdict === 'PASS' ? 'text-green-600 bg-green-50 border-green-200'
    : assessment.verdict === 'WARN' ? 'text-yellow-600 bg-yellow-50 border-yellow-200'
    : 'text-red-600 bg-red-50 border-red-200';

  return (
    <div className="p-4 space-y-4">
      {/* Verdict header */}
      <div className="flex items-center justify-between">
        <Badge variant="outline" className={cn("text-xs font-mono", verdictColor)}>
          {assessment.verdict === 'PASS' ? '✓ Rendben' : assessment.verdict === 'WARN' ? '⚠ Figyelmeztetés' : '✕ Hiba'}
        </Badge>
        <Button variant="outline" size="sm" onClick={onRerun} className="text-xs gap-1.5">
          <Brain className="h-3 w-3" />
          Újraértékelés
        </Button>
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-200">
        {assessment.summary}
      </p>

      {/* Findings */}
      {assessment.findings.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-gray-400">Megállapítások</label>
          {assessment.findings.map((f, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg px-3 py-2.5 border text-xs",
                f.severity === 'critical' ? 'bg-red-50 border-red-200' :
                f.severity === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                'bg-green-50 border-green-200'
              )}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                {f.severity === 'critical' ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" /> :
                 f.severity === 'warning' ? <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" /> :
                 <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                <span className={cn(
                  "font-mono text-[10px] uppercase font-semibold",
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
              <p className="text-gray-700 leading-snug">{f.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

interface V2VerdiktDisplayProps {
  result?: V2Result | null;
  rawAudioText?: string;
  isLoading?: boolean;
  progressPercent?: number | null;
  progressMessage?: string | null;
  error?: string | null;
  jobStatus?: string;
  jobId?: string | null;
  isSelectedJob?: boolean;
  selectedJobMode?: string;
  selectedJobPaciensId?: string | null;
  onClose?: () => void;
  onTerminate?: () => void;
}

export function V2VerdiktDisplay({
  result,
  rawAudioText,
  isLoading,
  progressPercent,
  progressMessage,
  error,
  jobStatus,
  jobId,
  isSelectedJob,
  selectedJobMode,
  selectedJobPaciensId,
  onClose,
  onTerminate,
}: V2VerdiktDisplayProps) {
  const v2 = result?.v2;
  const { profile } = useProfile();
  const telephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id || '';

  // AI Assessment state
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [assessedResultId, setAssessedResultId] = useState<string | null>(null);

  // Smooth local progress
  const [localProgress, setLocalProgress] = useState(0);

  useEffect(() => {
    if (isLoading) {
      setLocalProgress(Math.max(5, progressPercent || 0));
    } else {
      setLocalProgress(progressPercent === 100 || jobStatus === 'completed' ? 100 : (progressPercent || 0));
    }
  }, [isLoading, jobStatus]);

  useEffect(() => {
    if (progressPercent && progressPercent > localProgress) {
      setLocalProgress(progressPercent);
    }
  }, [progressPercent, localProgress]);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLocalProgress((prev) => {
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
    : '';

  const runAssessment = useCallback(async () => {
    if (!v2) return;
    setAssessing(true);
    setAssessment(null);
    try {
      const { data, error } = await supabase.functions.invoke('v2-assess-result', {
        body: {
          inputText: v2.transcript,
          rpaOutput: { vizitek: result?.vizitek },
          unmapped: v2.mapping.unmapped,
          protocolCount: v2.extraction.protocols.length,
          vizitCount: result?.vizit_szam || new Set((result?.vizitek || []).map(v => v.vizit)).size,
          itemCount: (result?.vizitek || []).length,
          debug: {
            extraction: v2.extraction,
            validation: v2.validation,
            expansion: v2.expansion,
            clinicalValidation: v2.clinicalValidation,
            mapping: v2.mapping,
          },
        },
      });
      if (error) throw error;
      const assessmentData = data as Assessment;
      setAssessment(assessmentData);

      // Save assessment to the job record so it persists
      if (jobId) {
        try {
          const { data: jobRow } = await supabase
            .from('native_voice_jobs')
            .select('result')
            .eq('id', jobId)
            .single();
          if (jobRow?.result) {
            const updatedResult = typeof jobRow.result === 'string' ? JSON.parse(jobRow.result) : jobRow.result;
            if (updatedResult.v2) {
              updatedResult.v2.assessment = assessmentData;
            }
            await supabase
              .from('native_voice_jobs')
              .update({ result: updatedResult })
              .eq('id', jobId);
          }
        } catch (saveErr) {
          console.warn('Failed to save assessment to job:', saveErr);
        }
      }
    } catch (err: any) {
      console.error('Assessment error:', err);
      setAssessment({ score: 0, verdict: 'FAIL', summary: 'Értékelés sikertelen: ' + err.message, findings: [] });
    } finally {
      setAssessing(false);
    }
  }, [v2, result, jobId]);

  // Auto-run assessment once: load from cache or generate
  useEffect(() => {
    if (!v2) return;
    // If assessment already cached in the result, use it
    if (v2.assessment) {
      setAssessment(v2.assessment as Assessment);
      return;
    }
    // Otherwise auto-run once (only if not already assessed for this session)
    if (!assessment && !assessing && v2.sessionId !== assessedResultId) {
      setAssessedResultId(v2.sessionId);
      runAssessment();
    }
  }, [v2?.sessionId]);

  // Assessment tab label with score badge
  const assessmentLabel = assessment ? (
    <span className="flex items-center gap-1.5">
      <Brain size={13} />
      AI
      {assessment.verdict !== 'PASS' && (
        <span className={cn(
          "w-2 h-2 rounded-full",
          assessment.verdict === 'WARN' ? 'bg-yellow-500' : 'bg-red-500'
        )} />
      )}
    </span>
  ) : assessing ? (
    <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" />AI...</span>
  ) : (
    <span className="flex items-center gap-1.5"><Brain size={13} />AI</span>
  );

  const modeLabel = selectedJobMode === 'treatnote' ? 'KEZELÉSI TERV'
    : selectedJobMode === 'voxis' ? 'STÁTUSZFELVÉTEL'
    : selectedJobMode === 'ambulans' ? 'AMBULÁNS LAP'
    : (selectedJobMode || '').toUpperCase();

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
                ? `${modeLabel} - Páciens #${selectedJobPaciensId || 'N/A'}`
                : 'A feldolgozás eredménye'
              }
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && result && onClose && (
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
        {/* Loading state */}
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
              {displayMessage}
            </p>
            <div className="w-full space-y-2">
              <div className="flex justify-between text-xs font-medium text-muted-foreground w-full px-1">
                <span>Folyamat</span>
                <span>{displayPercent}%</span>
              </div>
              <Progress value={localProgress} className="h-2 w-full" />
            </div>
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
        ) : jobStatus === 'error' ? (
          <div className="flex flex-col items-center justify-center py-12 text-destructive">
            <AlertTriangle className="h-10 w-10 mb-4" />
            <p className="text-center font-medium">Hiba történt a feldolgozás során</p>
            <p className="text-sm text-muted-foreground mt-2">{error}</p>
          </div>
        ) : v2 ? (
          /* V2 result tabs */
          <Tabs defaultValue="rpa" className="w-full">
            <TabsList className="grid w-full grid-cols-5 bg-muted/50 border border-border/40 rounded-lg h-10">
              <TabsTrigger value="transcript" className="text-xs gap-1.5 rounded-md"><FileText size={13} />Átirat</TabsTrigger>
              <TabsTrigger value="validation" className="text-xs gap-1.5 rounded-md"><Shield size={13} />Validáció</TabsTrigger>
              <TabsTrigger value="rpa" className="text-xs gap-1.5 rounded-md"><Cpu size={13} />Kitöltés</TabsTrigger>
              <TabsTrigger value="logs" className="text-xs gap-1.5 rounded-md"><ScrollText size={13} />Logs</TabsTrigger>
              <TabsTrigger value="assessment" className="text-xs gap-1.5 rounded-md">{assessmentLabel}</TabsTrigger>
            </TabsList>
            <div className="max-h-[500px] overflow-y-auto mt-3">
              <TabsContent value="transcript" className="mt-0"><TranscriptTab v2={v2} /></TabsContent>
              <TabsContent value="validation" className="mt-0"><ValidationTab v2={v2} /></TabsContent>
              <TabsContent value="rpa" className="mt-0"><RpaOutputTab result={result!} /></TabsContent>
              <TabsContent value="logs" className="mt-0"><LogsTab v2={v2} result={result!} /></TabsContent>
              <TabsContent value="assessment" className="mt-0">
                <AssessmentTab assessment={assessment} assessing={assessing} onRerun={runAssessment} />
              </TabsContent>
            </div>
          </Tabs>
        ) : result ? (
          /* Legacy result without V2 debug — show raw data */
          <div className="rounded-lg border border-border/50 bg-muted/20 p-5">
            <pre className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-mono" style={{ wordBreak: 'break-word' }}>
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="h-8 w-8 mb-3 opacity-30" />
            <p className="text-sm">Nincs megjeleníthető adat</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Check if a result contains V2 data */
export function isV2Result(result: unknown): result is V2Result {
  return result !== null && typeof result === 'object' && 'v2' in (result as Record<string, unknown>);
}
