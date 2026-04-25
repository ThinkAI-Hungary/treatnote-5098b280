import type { ToothStatus, ToothData } from '../store/dentalStore';
import { STATUS_COLORS, STATUS_LABELS } from '../store/dentalStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ZsigmondyToothCellProps {
  toothNumber: number;
  tooth: ToothData;
  isSelected: boolean;
  isMultiSelected?: boolean;
  onClick: (event: React.MouseEvent) => void;
  isUpper: boolean;
}

// ============ ANATOMICAL TOOTH SVG PATHS ============
// viewBox: 0 0 30 46
// Upper teeth: crown at top, roots at bottom

interface ToothPathData {
  crown: string;
  roots: string;
}

const UPPER_PATHS: Record<string, ToothPathData> = {
  incisor: {
    crown: 'M 7,3 Q 7,0 15,0 Q 23,0 23,3 L 24,13 Q 24,18 21,20 L 9,20 Q 6,18 6,13 Z',
    roots: 'M 11,20 Q 11,20 12,34 Q 13,42 15,45 Q 17,42 18,34 Q 19,20 19,20',
  },
  canine: {
    crown: 'M 9,6 Q 11,2 15,0 Q 19,2 21,6 L 23,14 Q 23,18 21,20 L 9,20 Q 7,18 7,14 Z',
    roots: 'M 11,20 Q 11,20 12,36 Q 13,43 15,46 Q 17,43 18,36 Q 19,20 19,20',
  },
  premolar: {
    crown: 'M 6,8 Q 7,4 10,2 L 12,4 L 15,0 L 18,4 L 20,2 Q 23,4 24,8 L 24,14 Q 24,18 22,20 L 8,20 Q 6,18 6,14 Z',
    roots: 'M 10,20 Q 10,20 11,32 Q 12,40 14,44 L 16,44 Q 18,40 19,32 Q 20,20 20,20',
  },
  molar: {
    crown: 'M 3,10 Q 3,5 6,2 L 8,4 L 11,1 L 15,0 L 19,1 L 22,4 L 24,2 Q 27,5 27,10 L 27,15 Q 27,19 24,20 L 6,20 Q 3,19 3,15 Z',
    roots: 'M 6,20 Q 6,20 6,30 Q 6,38 8,42 L 10,42 Q 11,38 10,28 Q 10,20 10,20 M 14,20 Q 14,20 14,30 Q 15,38 15,40 Q 15,38 16,30 Q 16,20 16,20 M 20,20 Q 20,20 20,28 Q 19,38 20,42 L 22,42 Q 24,38 24,30 Q 24,20 24,20',
  },
};

function getToothCategory(num: number): keyof typeof UPPER_PATHS {
  const pos = num % 10;
  if (pos >= 6) return 'molar';
  if (pos >= 4) return 'premolar';
  if (pos === 3) return 'canine';
  return 'incisor';
}

function flipPathVertically(path: string): string {
  const h = 46;
  return path.replace(
    /([MLQCZ,\s]*)(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/g,
    (_, prefix, x, y) => {
      const flippedY = h - parseFloat(y);
      return `${prefix}${x},${flippedY}`;
    }
  );
}

function ToothSilhouette({
  tooth,
  toothNumber,
  isUpper,
  size = 42,
}: {
  tooth: ToothData;
  toothNumber: number;
  isUpper: boolean;
  size?: number;
}) {
  const category = getToothCategory(toothNumber);
  const pathData = UPPER_PATHS[category];
  const crownPath = isUpper ? pathData.crown : flipPathVertically(pathData.crown);
  const rootsPath = isUpper ? pathData.roots : flipPathVertically(pathData.roots);

  const mainColor = STATUS_COLORS[tooth.status];
  const rootColor = tooth.status === 'healthy' ? 'hsl(var(--muted-foreground))' : mainColor;

  const scale = size / 46;
  const viewW = 30;
  const viewH = 46;

  return (
    <svg width={viewW * scale} height={viewH * scale} viewBox={`0 0 ${viewW} ${viewH}`} className="drop-shadow-sm">
      <path d={rootsPath} fill="none" stroke={rootColor} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
      <path d={crownPath} fill={mainColor} stroke="rgba(0,0,0,0.2)"
        strokeWidth={0.8} strokeLinejoin="round" />
      <path d={crownPath} fill="url(#crown-highlight)" opacity={0.3} />
      {(category === 'premolar' || category === 'molar') && (
        <line x1={15} y1={isUpper ? 2 : viewH - 2} x2={15} y2={isUpper ? 10 : viewH - 10}
          stroke="rgba(0,0,0,0.15)" strokeWidth={0.6} />
      )}
      <defs>
        <linearGradient id="crown-highlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={isUpper ? 0.5 : 0} />
          <stop offset="100%" stopColor="white" stopOpacity={isUpper ? 0 : 0.5} />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ZsigmondyToothCell({
  toothNumber, tooth, isSelected, isMultiSelected = false, onClick, isUpper,
}: ZsigmondyToothCellProps) {
  const hasTreatmentPlan = tooth.status === 'extraction_planned' || tooth.endoStatus === 'planned';

  const tooltipLines: string[] = [
    `Fog: ${toothNumber} (FDI)`,
    `Állapot: ${STATUS_LABELS[tooth.status]}`,
  ];
  if (!tooth.present) tooltipLines.push('Hiányzó fog');
  if (tooth.endoStatus !== 'none')
    tooltipLines.push(`Endo: ${tooth.endoStatus === 'treated' ? 'Gyökérkezelt' : tooth.endoStatus === 'retreatment' ? 'Újrakezelés' : 'Tervezett'}`);
  if (tooth.mobility > 0) tooltipLines.push(`Mozgathatóság: ${tooth.mobility}`);
  if (tooth.notes) tooltipLines.push(`Megjegyzés: ${tooth.notes}`);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`
            zsigmondy-tooth-cell relative flex flex-col items-center gap-0 p-0.5 rounded-lg
            transition-all duration-200 ease-out
            focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1
            ${isSelected && !isMultiSelected
              ? 'bg-primary/15 ring-2 ring-primary shadow-lg shadow-primary/20 scale-110 z-10'
              : isMultiSelected
                ? 'bg-blue-500/10 ring-2 ring-blue-500/60 shadow-md scale-105 z-10'
                : 'hover:bg-muted/50 hover:scale-105'}
            ${!tooth.present ? 'opacity-35' : ''}
          `}
          aria-label={`Fog ${toothNumber}`}
        >
          <span className={`text-[9px] font-bold leading-none tabular-nums
            ${isUpper ? 'order-last mt-0.5' : 'order-first mb-0.5'}
            ${isSelected || isMultiSelected ? 'text-primary' : 'text-muted-foreground'}`}>
            {toothNumber}
          </span>
          <div className={`relative ${isUpper ? 'order-first' : 'order-last'}`}>
            {tooth.present ? (
              <ToothSilhouette tooth={tooth} toothNumber={toothNumber} isUpper={isUpper} size={40} />
            ) : (
              <div className="w-[26px] h-[40px] flex items-center justify-center">
                <svg width="20" height="32" viewBox="0 0 20 32">
                  <rect x="2" y="2" width="16" height="28" rx="4" fill="none"
                    stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3,2" opacity="0.5" />
                  <line x1="5" y1="7" x2="15" y2="25" stroke="hsl(var(--muted-foreground))"
                    strokeWidth="1" opacity="0.3" strokeLinecap="round" />
                  <line x1="15" y1="7" x2="5" y2="25" stroke="hsl(var(--muted-foreground))"
                    strokeWidth="1" opacity="0.3" strokeLinecap="round" />
                </svg>
              </div>
            )}
            {hasTreatmentPlan && (
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-background animate-pulse"
                style={{ backgroundColor: '#ef4444' }} />
            )}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side={isUpper ? 'bottom' : 'top'} className="text-xs max-w-[200px]">
        {tooltipLines.map((line, i) => (<div key={i}>{line}</div>))}
      </TooltipContent>
    </Tooltip>
  );
}
