import { useState } from 'react';
import { FileText, Pill, Stethoscope, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Diagnosis {
  bno10?: string | null;
  text_label?: string | null;
  evidence?: string | null;
  confidence?: number;
  _bno_name?: string;
}
interface Procedure {
  oeno?: string | null;
  text_label?: string | null;
  quantity_me?: number | null;
  evidence?: string | null;
  confidence?: number;
}
interface AmbulansResult {
  pap_history?: string;
  pap_treatments?: string;
  pap_drugs?: string;
  diagnoses?: Diagnosis[];
  procedures?: Procedure[];
  validation?: { errors: any[]; warnings: any[] };
}

interface Props {
  resultJson: AmbulansResult | null;
}

const TABS = [
  { key: 'history', label: 'Anamnézis', icon: FileText },
  { key: 'treatments', label: 'Kezelések', icon: Stethoscope },
  { key: 'drugs', label: 'Gyógyszerek', icon: Pill },
] as const;

function ConfidenceBadge({ value }: { value?: number }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'text-emerald-500' : pct >= 60 ? 'text-amber-500' : 'text-red-400';
  return <span className={cn('text-xs font-mono', color)}>{pct}%</span>;
}

function TextSection({ text }: { text?: string }) {
  if (!text) return <p className="text-sm text-muted-foreground italic">Nincs adat.</p>;
  return (
    <pre className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-sans">
      {text}
    </pre>
  );
}

export function AmbulansllapReviewPanel({ resultJson }: Props) {
  const [activeTab, setActiveTab] = useState<'history' | 'treatments' | 'drugs'>('history');

  if (!resultJson) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <FileText className="h-5 w-5 mr-2" />
        <span className="text-sm">Az ambuláns lap adatai nem elérhetők.</span>
      </div>
    );
  }

  const diagnoses = resultJson.diagnoses?.filter(d => d.bno10 || d.text_label) || [];
  const procedures = resultJson.procedures?.filter(p => p.oeno || p.text_label) || [];
  const hasErrors = (resultJson.validation?.errors?.length ?? 0) > 0;

  const textMap = {
    history: resultJson.pap_history,
    treatments: resultJson.pap_treatments,
    drugs: resultJson.pap_drugs,
  };

  return (
    <div className="space-y-5">

      {/* ── Validation warnings ── */}
      {hasErrors && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm flex gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-amber-600 dark:text-amber-400">Érvényesítési figyelmeztetések:</span>
            {resultJson.validation!.errors.map((e, i) => (
              <div key={i} className="text-foreground/70 text-xs mt-0.5">{e.field}: {e.message}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3 text section tabs ── */}
      <div>
        <div className="flex gap-1 mb-3 border-b border-border/50">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors',
                activeTab === tab.key
                  ? 'bg-primary/10 text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 via-muted/20 to-transparent p-5 min-h-[200px]">
          <TextSection text={textMap[activeTab]} />
        </div>
      </div>

      {/* ── Diagnoses (BNO) ── */}
      {diagnoses.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-2">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Diagnózisok (BNO)
          </h4>
          <div className="space-y-2">
            {diagnoses.map((d, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-1.5 border-b border-border/20 last:border-0">
                <div className="flex items-start gap-2 min-w-0">
                  {d.bno10 && (
                    <Badge variant="outline" className="font-mono text-xs shrink-0 border-primary/40 text-primary">
                      {d.bno10}
                    </Badge>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{d._bno_name || d.text_label || '—'}</p>
                    {d.evidence && <p className="text-xs text-muted-foreground truncate">{d.evidence}</p>}
                  </div>
                </div>
                <ConfidenceBadge value={d.confidence} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Procedures (OENO) ── */}
      {procedures.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-2">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-blue-500" />
            Beavatkozások (OENO)
          </h4>
          <div className="space-y-2">
            {procedures.map((p, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-1.5 border-b border-border/20 last:border-0">
                <div className="flex items-start gap-2 min-w-0">
                  {p.oeno && (
                    <Badge variant="outline" className="font-mono text-xs shrink-0 border-blue-500/40 text-blue-500">
                      {p.oeno}
                    </Badge>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{p.text_label || '—'}</p>
                    {p.quantity_me != null && (
                      <p className="text-xs text-muted-foreground">Mennyiség: {p.quantity_me}</p>
                    )}
                  </div>
                </div>
                <ConfidenceBadge value={p.confidence} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
