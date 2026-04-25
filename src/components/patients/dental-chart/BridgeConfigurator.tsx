import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link2, Check, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToothModel } from './types';

// ─── Bridge types from statuses.json ─────────────────────────────────────────

export const BRIDGE_TYPES = [
  { id: 'bridge_metal_ceramic', name: 'Fém-kerámia híd', short: 'FK' },
  { id: 'bridge_zirconium', name: 'Cirkónium híd', short: 'Zr' },
  { id: 'bridge_pressed_ceramic', name: 'Préskerámia híd', short: 'PK' },
  { id: 'bridge_gold_ceramic', name: 'Aranykerámia híd', short: 'Au' },
  { id: 'bridge_temporary', name: 'Ideiglenes híd', short: 'Idgl' },
  { id: 'bridge', name: 'Híd (általános)', short: 'Ált' },
  { id: 'bridge_separation', name: 'Hídelválasztás', short: 'Elv' },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export type ToothRole = 'pillar' | 'pontic';

export interface BridgeConfig {
  bridgeType: string;
  teeth: Array<{ toothNumber: string; role: ToothRole }>;
}

interface BridgeConfiguratorProps {
  selectedTeeth: string[];
  toothData: Record<string, ToothModel>;
  onConfirm: (config: BridgeConfig) => void;
  onCancel: () => void;
  /** Called whenever config changes — parent uses this for live preview */
  onPreviewChange?: (config: BridgeConfig | null) => void;
}

// ─── Smart role detection ────────────────────────────────────────────────────

function inferRole(toothNumber: string, index: number, total: number, tooth?: ToothModel): ToothRole {
  const status = tooth?.status || '';
  const statuses = status.split(',').map(s => s.trim());

  // Missing teeth → always pontic
  if (statuses.includes('missing')) return 'pontic';

  // Implant teeth → always pillar (strong anchor)
  if (statuses.some(s => s.startsWith('implant'))) return 'pillar';

  // End teeth → default pillar
  if (index === 0 || index === total - 1) return 'pillar';

  // Radix (root remnant) → can serve as pillar
  if (statuses.includes('radix')) return 'pillar';

  // Middle teeth that are healthy or have other statuses → pontic by default
  return 'pontic';
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BridgeConfigurator({
  selectedTeeth,
  toothData,
  onConfirm,
  onCancel,
  onPreviewChange,
}: BridgeConfiguratorProps) {
  const sorted = useMemo(
    () => [...selectedTeeth].sort((a, b) => parseInt(a) - parseInt(b)),
    [selectedTeeth]
  );

  const [bridgeType, setBridgeType] = useState('bridge_metal_ceramic');
  const [typeOpen, setTypeOpen] = useState(false);
  const [roles, setRoles] = useState<Record<string, ToothRole>>(() => {
    const initial: Record<string, ToothRole> = {};
    sorted.forEach((tooth, i) => {
      initial[tooth] = inferRole(tooth, i, sorted.length, toothData[tooth]);
    });
    return initial;
  });

  // Build current config
  const currentConfig = useMemo((): BridgeConfig => ({
    bridgeType,
    teeth: sorted.map(t => ({ toothNumber: t, role: roles[t] })),
  }), [bridgeType, sorted, roles]);

  // Notify parent for live preview
  useEffect(() => {
    onPreviewChange?.(currentConfig);
    return () => onPreviewChange?.(null);
  }, [currentConfig]);

  const toggleRole = (tooth: string) => {
    setRoles(prev => ({
      ...prev,
      [tooth]: prev[tooth] === 'pillar' ? 'pontic' : 'pillar',
    }));
  };

  // Validation: need at least 1 pillar and 1 pontic for a real bridge
  const pillarCount = sorted.filter(t => roles[t] === 'pillar').length;
  const ponticCount = sorted.filter(t => roles[t] === 'pontic').length;
  const isValid = pillarCount >= 1 && sorted.length >= 2;

  const selectedType = BRIDGE_TYPES.find(t => t.id === bridgeType) || BRIDGE_TYPES[0];

  return (
    <div className="space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
      {/* Row 1: Bridge type selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hídtípus:</span>
        <div className="relative">
          <button
            onClick={() => setTypeOpen(!typeOpen)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all",
              "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100",
              "dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-300"
            )}
          >
            <span className="font-mono text-xs bg-purple-200/50 dark:bg-purple-800/50 px-1.5 py-0.5 rounded">
              {selectedType.short}
            </span>
            {selectedType.name}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", typeOpen && "rotate-180")} />
          </button>

          {typeOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[220px]">
              {BRIDGE_TYPES.map(type => (
                <button
                  key={type.id}
                  onClick={() => { setBridgeType(type.id); setTypeOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left",
                    bridgeType === type.id && "bg-purple-50 dark:bg-purple-950/30"
                  )}
                >
                  <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded w-8 text-center">
                    {type.short}
                  </span>
                  <span>{type.name}</span>
                  {bridgeType === type.id && <Check className="h-3.5 w-3.5 ml-auto text-purple-600" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Per-tooth role assignment */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fogak szerepe:</span>
          <span className="text-[10px] text-muted-foreground">
            (kattintson a váltáshoz)
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {sorted.map((tooth, i) => {
            const role = roles[tooth];
            const isPillar = role === 'pillar';
            const existingStatus = toothData[tooth]?.status || '';
            const isMissing = existingStatus.includes('missing');
            const isImplant = existingStatus.split(',').some(s => s.trim().startsWith('implant'));

            return (
              <button
                key={tooth}
                onClick={() => toggleRole(tooth)}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg border-2 transition-all text-center min-w-[42px]",
                  isPillar
                    ? "border-purple-400 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-600"
                    : "border-dashed border-muted-foreground/30 bg-muted/20"
                )}
                title={`${tooth}: ${isPillar ? 'Pillér (horgony)' : 'Pótlás (hídtag)'}`}
              >
                {/* Tooth number */}
                <span className={cn(
                  "font-mono text-xs font-bold",
                  isPillar ? "text-purple-700 dark:text-purple-300" : "text-muted-foreground"
                )}>
                  {tooth}
                </span>
                {/* Role label */}
                <span className={cn(
                  "text-[9px] font-medium leading-none",
                  isPillar ? "text-purple-600 dark:text-purple-400" : "text-muted-foreground/70"
                )}>
                  {isPillar ? 'Pillér' : 'Pótlás'}
                </span>
                {/* Status indicator */}
                {(isMissing || isImplant) && (
                  <span className={cn(
                    "absolute -top-1 -right-1 w-3 h-3 rounded-full text-[6px] font-bold flex items-center justify-center border border-background",
                    isMissing ? "bg-red-400 text-white" : "bg-cyan-400 text-white"
                  )}>
                    {isMissing ? '✕' : 'I'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 3: Summary + actions */}
      <div className="flex items-center justify-between pt-1">
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-purple-600 dark:text-purple-400">{pillarCount} pillér</span>
          {ponticCount > 0 && (
            <span> • <span className="font-medium">{ponticCount} pótlás</span></span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            className="text-xs h-8"
          >
            <X className="w-3.5 h-3.5 mr-1" /> Mégse
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm(currentConfig)}
            disabled={!isValid}
            className="text-xs h-8 bg-purple-600 hover:bg-purple-700 gap-1.5"
          >
            <Link2 className="w-3.5 h-3.5" />
            Híd létrehozása
          </Button>
        </div>
      </div>
    </div>
  );
}
