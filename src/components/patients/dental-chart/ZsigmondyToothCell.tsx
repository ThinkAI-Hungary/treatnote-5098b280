import { ToothModel } from './types';
import { getToothColors, getStatusLabel, parseSurfaces, SurfaceId } from './toothColors';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TreatmentMarker {
  visual_icon: string;
  visual_color: string;
  status: string; // planned | completed | cancelled
}

interface ZsigmondyToothCellProps {
  toothNumber: string;
  tooth?: ToothModel;
  isSelected: boolean;
  isMultiSelected?: boolean;
  onClick: (event: React.MouseEvent) => void;
  isUpper: boolean;
  treatmentMarkers?: TreatmentMarker[];
  className?: string;
  scale?: number;
}

// ============ ANATOMICAL TOOTH SVG PATHS ============
// viewBox: 0 0 30 46   crown occupies y 0-20, roots 20-46

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

// ============ SURFACE REGION DEFINITIONS ============
// Each surface maps to a rectangle {x, y, w, h} within the crown area.
// The rects are clipped by the crown path, so only the intersection shows.
// Coordinates are for UPPER teeth (y=0 is top of crown, y=20 is gum line).

interface SurfaceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type SurfaceRegions = Record<SurfaceId, SurfaceRect>;

// Molar crown bounds: roughly x 3-27, y 0-20
const MOLAR_SURFACES: SurfaceRegions = {
  O: { x: 3, y: 0, w: 24, h: 7 },    // Occlusal: top 35%
  M: { x: 3, y: 7, w: 6, h: 10 },     // Mesial: left strip
  D: { x: 21, y: 7, w: 6, h: 10 },    // Distal: right strip
  V: { x: 9, y: 7, w: 6, h: 8 },      // Vestibular: center-left
  L: { x: 15, y: 7, w: 6, h: 8 },     // Lingual: center-right
  C: { x: 3, y: 17, w: 24, h: 3 },    // Cervical: bottom strip
};

// Premolar crown bounds: roughly x 6-24, y 0-20
const PREMOLAR_SURFACES: SurfaceRegions = {
  O: { x: 6, y: 0, w: 18, h: 7 },
  M: { x: 6, y: 7, w: 5, h: 10 },
  D: { x: 19, y: 7, w: 5, h: 10 },
  V: { x: 11, y: 7, w: 4, h: 8 },
  L: { x: 15, y: 7, w: 4, h: 8 },
  C: { x: 6, y: 17, w: 18, h: 3 },
};

// Canine crown bounds: roughly x 7-23, y 0-20
const CANINE_SURFACES: SurfaceRegions = {
  O: { x: 7, y: 0, w: 16, h: 7 },
  M: { x: 7, y: 7, w: 4, h: 10 },
  D: { x: 19, y: 7, w: 4, h: 10 },
  V: { x: 11, y: 7, w: 4, h: 8 },
  L: { x: 15, y: 7, w: 4, h: 8 },
  C: { x: 7, y: 17, w: 16, h: 3 },
};

// Incisor crown bounds: roughly x 6-24, y 0-20
const INCISOR_SURFACES: SurfaceRegions = {
  O: { x: 6, y: 0, w: 18, h: 6 },     // Incisal edge
  M: { x: 6, y: 6, w: 5, h: 11 },
  D: { x: 19, y: 6, w: 5, h: 11 },
  V: { x: 11, y: 6, w: 4, h: 8 },
  L: { x: 15, y: 6, w: 4, h: 8 },
  C: { x: 6, y: 17, w: 18, h: 3 },
};

const CATEGORY_SURFACES: Record<string, SurfaceRegions> = {
  molar: MOLAR_SURFACES,
  premolar: PREMOLAR_SURFACES,
  canine: CANINE_SURFACES,
  incisor: INCISOR_SURFACES,
};

function flipRect(rect: SurfaceRect): SurfaceRect {
  const h = 46;
  return {
    x: rect.x,
    y: h - rect.y - rect.h,
    w: rect.w,
    h: rect.h,
  };
}

// ============ SURFACE OVERLAY COMPONENT ============

function SurfaceOverlays({
  toothNumber,
  surfacesStr,
  isUpper,
  crownPath,
  category,
}: {
  toothNumber: number;
  surfacesStr: string | null | undefined;
  isUpper: boolean;
  crownPath: string;
  category: string;
}) {
  const entries = parseSurfaces(surfacesStr);
  if (entries.length === 0) return null;

  const regions = CATEGORY_SURFACES[category] || MOLAR_SURFACES;
  const clipId = `surf-clip-${toothNumber}`;

  // Collect all surface rects with their colors
  const rects: { rect: SurfaceRect; color: string; surfaceId: SurfaceId; statusId: string }[] = [];

  for (const entry of entries) {
    for (const surf of entry.surfaces) {
      const region = regions[surf];
      if (!region) continue;
      const finalRect = isUpper ? region : flipRect(region);
      rects.push({ rect: finalRect, color: entry.color, surfaceId: surf, statusId: entry.statusId });
    }
  }

  if (rects.length === 0) return null;

  // Deduplicate: if same surface has multiple statuses, last one wins
  const surfaceMap = new Map<SurfaceId, typeof rects[number]>();
  for (const r of rects) {
    surfaceMap.set(r.surfaceId, r);
  }
  const uniqueRects = Array.from(surfaceMap.values());

  return (
    <>
      {/* Clip path using the crown outline */}
      <defs>
        <clipPath id={clipId}>
          <path d={crownPath} />
        </clipPath>
      </defs>

      {/* Surface overlay rects, clipped to crown shape */}
      <g clipPath={`url(#${clipId})`}>
        {uniqueRects.map((r, i) => (
          <rect
            key={`${r.surfaceId}-${i}`}
            x={r.rect.x}
            y={r.rect.y}
            width={r.rect.w}
            height={r.rect.h}
            fill={r.color}
            opacity={0.75}
            rx={0.5}
          />
        ))}
      </g>

      {/* Surface divider lines — only drawn when surfaces are active */}
      <g clipPath={`url(#${clipId})`} opacity={0.25}>
        {uniqueRects.length > 1 && (
          <>
            {/* Horizontal line separating O from middle zone */}
            <line
              x1={0} y1={isUpper ? 7 : 46 - 7}
              x2={30} y2={isUpper ? 7 : 46 - 7}
              stroke="rgba(0,0,0,0.6)" strokeWidth={0.5}
            />
            {/* Horizontal line separating middle from C zone */}
            <line
              x1={0} y1={isUpper ? 17 : 46 - 17}
              x2={30} y2={isUpper ? 17 : 46 - 17}
              stroke="rgba(0,0,0,0.6)" strokeWidth={0.5}
            />
            {/* Vertical center line separating V/L */}
            <line
              x1={15} y1={isUpper ? 7 : 46 - 17}
              x2={15} y2={isUpper ? 17 : 46 - 7}
              stroke="rgba(0,0,0,0.4)" strokeWidth={0.4}
              strokeDasharray="1,1"
            />
          </>
        )}
      </g>
    </>
  );
}

// ============ TOOTH SILHOUETTE (with surfaces) ============

function ToothSilhouette({
  mainColor,
  rootColor,
  toothNumber,
  isUpper,
  surfacesStr,
  size = 40,
}: {
  mainColor: string;
  rootColor: string;
  toothNumber: number;
  isUpper: boolean;
  surfacesStr?: string | null;
  size?: number;
}) {
  const category = getToothCategory(toothNumber);
  const pathData = UPPER_PATHS[category];
  const crownPath = isUpper ? pathData.crown : flipPathVertically(pathData.crown);
  const rootsPath = isUpper ? pathData.roots : flipPathVertically(pathData.roots);

  const scale = size / 46;
  const viewW = 30;
  const viewH = 46;

  const gradId = `crown-hl-${toothNumber}`;
  const hasSurfaces = surfacesStr && surfacesStr.includes(':');

  // If there are surface overlays, use a neutral base so colors pop
  const baseFill = hasSurfaces ? 'hsl(var(--primary) / 0.35)' : mainColor;

  return (
    <svg className="w-full h-auto drop-shadow-sm" viewBox={`0 0 ${viewW} ${viewH}`}>
      {/* Layer 1: Roots */}
      <path d={rootsPath} fill="none" stroke={rootColor} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />

      {/* Layer 2: Crown base fill */}
      <path d={crownPath} fill={baseFill} stroke="none" />

      {/* Layer 3: Surface overlays (clipped to crown) */}
      <SurfaceOverlays
        toothNumber={toothNumber}
        surfacesStr={surfacesStr}
        isUpper={isUpper}
        crownPath={crownPath}
        category={category}
      />

      {/* Layer 4: Crown outline */}
      <path d={crownPath} fill="none" stroke="rgba(0,0,0,0.25)"
        strokeWidth={0.8} strokeLinejoin="round" />

      {/* Layer 5: Crown highlight gradient */}
      <path d={crownPath} fill={`url(#${gradId})`} opacity={0.2} />

      {/* Occlusal groove for premolars/molars */}
      {(category === 'premolar' || category === 'molar') && !hasSurfaces && (
        <line x1={15} y1={isUpper ? 2 : viewH - 2} x2={15} y2={isUpper ? 10 : viewH - 10}
          stroke="rgba(0,0,0,0.15)" strokeWidth={0.6} />
      )}

      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={isUpper ? 0.5 : 0} />
          <stop offset="100%" stopColor="white" stopOpacity={isUpper ? 0 : 0.5} />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ============ ABSENT TOOTH PLACEHOLDER ============

function AbsentToothPlaceholder() {
  return (
    <div className="w-full aspect-[20/32] flex items-center justify-center">
      <svg className="w-full h-full" viewBox="0 0 20 32">
        <rect x="2" y="2" width="16" height="28" rx="4" fill="none"
          stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3,2" opacity="0.5" />
        <line x1="5" y1="7" x2="15" y2="25" stroke="hsl(var(--muted-foreground))"
          strokeWidth="1" opacity="0.3" strokeLinecap="round" />
        <line x1="15" y1="7" x2="5" y2="25" stroke="hsl(var(--muted-foreground))"
          strokeWidth="1" opacity="0.3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ============ MAIN COMPONENT ============

export function ZsigmondyToothCell({
  toothNumber, tooth, isSelected, isMultiSelected = false, onClick, isUpper, treatmentMarkers, className, scale,
}: ZsigmondyToothCellProps) {
  const numericTooth = parseInt(toothNumber, 10);
  const colors = getToothColors(tooth?.status);
  const statusLabel = getStatusLabel(tooth?.status);
  const surfaceEntries = parseSurfaces(tooth?.surfaces);

  const tooltipLines: string[] = [
    `Fog: ${toothNumber} (FDI)`,
    `Állapot: ${statusLabel}`,
  ];
  if (colors.isAbsent) tooltipLines.push('Hiányzó fog');
  if (tooth?.mobility && tooth.mobility > 0) tooltipLines.push(`Mozgathatóság: ${tooth.mobility}`);

  // Surface details in tooltip
  if (surfaceEntries.length > 0) {
    for (const entry of surfaceEntries) {
      tooltipLines.push(`↳ ${entry.statusId}: ${entry.surfaces.join(', ')}`);
    }
  }

  if (tooth?.notes) tooltipLines.push(`Megjegyzés: ${tooth.notes}`);

  const cellWidth = 30 * (scale || 1);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`
            zsigmondy-tooth-cell relative flex flex-col items-center gap-0 p-0.5 rounded-lg
            focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1
            ${isSelected && !isMultiSelected
              ? 'bg-primary/15 ring-2 ring-primary shadow-lg shadow-primary/20 scale-110 z-10'
              : isMultiSelected
                ? 'bg-blue-500/10 ring-2 ring-blue-500/60 shadow-md scale-105 z-10'
                : 'hover:bg-muted/50 hover:scale-105'}
            ${colors.isAbsent ? 'opacity-40' : ''}
            ${className || ''}
          `}
          style={{ width: `${cellWidth}px`, flex: '0 0 auto', transition: 'width 0.5s cubic-bezier(0.33, 1, 0.68, 1), height 0.5s cubic-bezier(0.33, 1, 0.68, 1), background-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s' }}
          aria-label={`Fog ${toothNumber}`}
        >
          {/* Tooth number label */}
          <span className={`text-[9px] font-bold leading-none tabular-nums
            ${isUpper ? 'order-last mt-0.5' : 'order-first mb-0.5'}
            ${isSelected || isMultiSelected ? 'text-primary' : 'text-muted-foreground'}`}>
            {toothNumber}
          </span>

          {/* SVG tooth or absent placeholder */}
          <div className={`relative w-full ${isUpper ? 'order-first' : 'order-last'}`} style={{ transform: 'scaleY(-1)' }}>
            {colors.isAbsent ? (
              <AbsentToothPlaceholder />
            ) : (
              <ToothSilhouette
                mainColor={colors.mainColor}
                rootColor={colors.rootColor}
                toothNumber={numericTooth}
                isUpper={isUpper}
                surfacesStr={tooth?.surfaces}
                size={30 * (scale || 1)}
              />
            )}
            {/* Treatment plan marker (from dental status) */}
            {colors.hasPlanMarker && (
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background animate-pulse"
                style={{ backgroundColor: '#ef4444' }} />
            )}

            {/* Treatment plan markers (from treatment plan editor) */}
            {treatmentMarkers && treatmentMarkers.length > 0 && (
              <div className={`absolute flex gap-[1px] ${
                isUpper ? '-bottom-1 left-1/2 -translate-x-1/2' : '-top-1 left-1/2 -translate-x-1/2'
              }`}>
                {treatmentMarkers.slice(0, 3).map((marker, i) => (
                  <div
                    key={i}
                    className="w-[5px] h-[5px] rounded-full border border-background"
                    style={{
                      backgroundColor: marker.visual_color,
                      opacity: marker.status === 'planned' ? 0.7 : marker.status === 'completed' ? 1 : 0.3,
                    }}
                  />
                ))}
                {treatmentMarkers.length > 3 && (
                  <span className="text-[6px] font-bold text-muted-foreground leading-none ml-[1px]">
                    +{treatmentMarkers.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side={isUpper ? 'bottom' : 'top'} className="text-xs max-w-[220px]">
        {tooltipLines.map((line, i) => (<div key={i}>{line}</div>))}
      </TooltipContent>
    </Tooltip>
  );
}
