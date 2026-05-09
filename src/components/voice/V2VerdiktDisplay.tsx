// ============================================================
// TreatNote V2 — VerdiktDisplay Component
// Redesigned for V2 engine output with full debug data
// ============================================================

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useMemo, useState } from 'react';
import {
  FileText, Shield, Cpu, ScrollText,
  ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle, Info
} from 'lucide-react';
import { actionName } from '@/lib/atomicActionNames';
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

// ── Main Component ──

interface V2VerdiktDisplayProps {
  result: V2Result;
  rawAudioText?: string;
}

export function V2VerdiktDisplay({ result, rawAudioText }: V2VerdiktDisplayProps) {
  const v2 = result.v2;

  if (!v2) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        <AlertTriangle size={24} className="mx-auto mb-2 text-gray-400" />
        <p>Nincs V2 debug adat. Ez egy legacy eredmény.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <Tabs defaultValue="rpa" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gray-50 border-b border-gray-200 rounded-t-lg rounded-b-none h-10">
          <TabsTrigger value="transcript" className="text-xs gap-1.5 text-gray-600 data-[state=active]:text-gray-900 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-none first:rounded-tl-lg"><FileText size={13} />Átirat</TabsTrigger>
          <TabsTrigger value="validation" className="text-xs gap-1.5 text-gray-600 data-[state=active]:text-gray-900 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-none"><Shield size={13} />Validáció</TabsTrigger>
          <TabsTrigger value="rpa" className="text-xs gap-1.5 text-gray-600 data-[state=active]:text-gray-900 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-none"><Cpu size={13} />Kitöltés</TabsTrigger>
          <TabsTrigger value="logs" className="text-xs gap-1.5 text-gray-600 data-[state=active]:text-gray-900 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-none last:rounded-tr-lg"><ScrollText size={13} />Logs</TabsTrigger>
        </TabsList>

        <div className="max-h-[500px] overflow-y-auto">
          <TabsContent value="transcript" className="mt-0"><TranscriptTab v2={v2} /></TabsContent>
          <TabsContent value="validation" className="mt-0"><ValidationTab v2={v2} /></TabsContent>
          <TabsContent value="rpa" className="mt-0"><RpaOutputTab result={result} /></TabsContent>
          <TabsContent value="logs" className="mt-0"><LogsTab v2={v2} result={result} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/** Check if a result contains V2 data */
export function isV2Result(result: unknown): result is V2Result {
  return result !== null && typeof result === 'object' && 'v2' in (result as Record<string, unknown>);
}
