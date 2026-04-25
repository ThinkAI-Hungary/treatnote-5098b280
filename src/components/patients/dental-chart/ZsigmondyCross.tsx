import { useRef, useEffect, useState, useCallback } from 'react';
import { ToothModel } from './types';
import { ADULT_TEETH, BABY_TEETH } from './constants';
import { ZsigmondyToothCell } from './ZsigmondyToothCell';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getToothColors } from './toothColors';
import type { BridgeConfig } from './BridgeConfigurator';

type TreatmentMarker = {
  visual_icon: string;
  visual_color: string;
  status: string;
};

type Props = {
  data: Record<string, ToothModel>;
  onToothClick: (toothNumber: string, event: React.MouseEvent) => void;
  showBabyTeeth: boolean;
  selectedTooth: string | null;
  selectedTeeth: string[];
  treatmentMarkersMap?: Record<string, TreatmentMarker[]>;
  bridgePreview?: BridgeConfig | null;
};

// ============ Bridge line rendering ============

interface BridgeGroup {
  teeth: string[];
  color: string;
}

/**
 * Finds contiguous bridge groups among the rendered teeth.
 * A bridge group is formed when adjacent teeth in the same row both have
 * a status containing a bridge-related ID.
 */
function findBridgeGroups(
  rowNumbers: string[],
  data: Record<string, ToothModel>,
): BridgeGroup[] {
  const BRIDGE_IDS = [
    'bridge', 'bridge_metal_ceramic', 'bridge_zirconium',
    'bridge_pressed_ceramic', 'bridge_gold_ceramic', 'bridge_temporary',
    'bridge_separation',
  ];

  const isBridge = (num: string) => {
    const tooth = data[num];
    if (!tooth?.status) return false;
    return tooth.status.split(',').some(s => BRIDGE_IDS.includes(s.trim()));
  };

  const groups: BridgeGroup[] = [];
  let currentGroup: string[] = [];

  for (const num of rowNumbers) {
    if (isBridge(num)) {
      currentGroup.push(num);
    } else {
      if (currentGroup.length >= 2) {
        const colors = getToothColors(data[currentGroup[0]]?.status);
        groups.push({ teeth: [...currentGroup], color: colors.mainColor });
      }
      currentGroup = [];
    }
  }
  // Flush last group
  if (currentGroup.length >= 2) {
    const colors = getToothColors(data[currentGroup[0]]?.status);
    groups.push({ teeth: [...currentGroup], color: colors.mainColor });
  }

  return groups;
}

// ============ Main Component ============

export function ZsigmondyCross({
  data, onToothClick, showBabyTeeth, selectedTooth, selectedTeeth, treatmentMarkersMap, bridgePreview,
}: Props) {

  const RowWithBridge = ({ leftNumbers, rightNumbers, isUpper }: {
    leftNumbers: string[];
    rightNumbers: string[];
    isUpper: boolean;
  }) => {
    const rowRef = useRef<HTMLDivElement>(null);
    const allNumbers = [...leftNumbers, ...rightNumbers];
    const bridgeGroups = findBridgeGroups(allNumbers, data);

    // Build preview group if bridge preview teeth overlap this row
    const bridgePreviewGroup = (() => {
      if (!bridgePreview) return null;
      const previewTeeth = bridgePreview.teeth.map(t => t.toothNumber);
      const overlapping = previewTeeth.filter(t => allNumbers.includes(t));
      if (overlapping.length < 2) return null;
      return {
        teeth: overlapping.sort((a, b) => parseInt(a) - parseInt(b)),
        color: '#8b5cf6',
        roles: Object.fromEntries(bridgePreview.teeth.map(t => [t.toothNumber, t.role])),
      };
    })();

    return (
      <div ref={rowRef} className="relative flex justify-center items-center gap-0.5 sm:gap-1 w-max mx-auto flex-nowrap">
        {/* Left side */}
        <div className="flex gap-0.5 sm:gap-1 justify-end flex-nowrap items-center w-max">
          {leftNumbers.map(num => (
            <ZsigmondyToothCell
              key={num}
              toothNumber={num}
              tooth={data[num]}
              isSelected={selectedTooth === num}
              isMultiSelected={selectedTeeth.includes(num)}
              onClick={(e) => onToothClick(num, e)}
              isUpper={isUpper}
              treatmentMarkers={treatmentMarkersMap?.[num]}
            />
          ))}
        </div>

        {/* Center divider */}
        <div className="w-0.5 md:w-1 rounded bg-border/60 flex-shrink-0"
          style={{ height: isUpper ? '56px' : '56px' }} />

        {/* Right side */}
        <div className="flex gap-0.5 sm:gap-1 justify-start flex-nowrap items-center w-max">
          {rightNumbers.map(num => (
            <ZsigmondyToothCell
              key={num}
              toothNumber={num}
              tooth={data[num]}
              isSelected={selectedTooth === num}
              isMultiSelected={selectedTeeth.includes(num)}
              onClick={(e) => onToothClick(num, e)}
              isUpper={isUpper}
              treatmentMarkers={treatmentMarkersMap?.[num]}
            />
          ))}
        </div>

        {/* Bridge connection lines (SVG overlay) */}
        {(bridgeGroups.length > 0 || bridgePreviewGroup) && (
          <BridgeOverlay
            groups={bridgeGroups}
            allNumbers={allNumbers}
            isUpper={isUpper}
            containerRef={rowRef}
            previewGroup={bridgePreviewGroup}
          />
        )}
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-2 items-center w-full max-w-6xl mx-auto p-2">

        {/* Upper jaw */}
        <div className="flex flex-col gap-1 w-full items-center">
          <RowWithBridge leftNumbers={ADULT_TEETH.upperRight} rightNumbers={ADULT_TEETH.upperLeft} isUpper={true} />
          {showBabyTeeth && (
            <div className="mt-1 scale-[0.85] origin-top">
              <RowWithBridge leftNumbers={BABY_TEETH.upperRight} rightNumbers={BABY_TEETH.upperLeft} isUpper={true} />
            </div>
          )}
        </div>

        {/* Horizontal jaw divider */}
        <div className="h-0.5 md:h-1 rounded bg-border/40 w-full max-w-2xl flex-shrink-0" />

        {/* Lower jaw */}
        <div className="flex flex-col gap-1 w-full items-center">
          {showBabyTeeth && (
            <div className="mb-1 scale-[0.85] origin-bottom">
              <RowWithBridge leftNumbers={BABY_TEETH.lowerRight} rightNumbers={BABY_TEETH.lowerLeft} isUpper={false} />
            </div>
          )}
          <RowWithBridge leftNumbers={ADULT_TEETH.lowerRight} rightNumbers={ADULT_TEETH.lowerLeft} isUpper={false} />
        </div>
      </div>
    </TooltipProvider>
  );
}

// ============ Bridge Overlay ============

interface PreviewGroup {
  teeth: string[];
  color: string;
  roles: Record<string, string>; // toothNumber -> 'pillar' | 'pontic'
}

function BridgeOverlay({
  groups,
  allNumbers,
  isUpper,
  containerRef,
  previewGroup,
}: {
  groups: BridgeGroup[];
  allNumbers: string[];
  isUpper: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  previewGroup?: PreviewGroup | null;
}) {
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [dims, setDims] = useState({ width: 0, height: 0 });

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    setDims({ width: rect.width, height: rect.height });

    const pos: Record<string, number> = {};
    const cells = container.querySelectorAll('.zsigmondy-tooth-cell');
    cells.forEach(cell => {
      const label = cell.getAttribute('aria-label');
      if (!label) return;
      const num = label.replace('Fog ', '');
      const cellRect = cell.getBoundingClientRect();
      pos[num] = cellRect.left + cellRect.width / 2 - rect.left;
    });
    setPositions(pos);
  }, [containerRef]);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measure, containerRef]);

  if (Object.keys(positions).length === 0 || dims.width === 0) return null;

  const y = isUpper ? 4 : dims.height - 8;

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-20"
      width={dims.width}
      height={dims.height}
      style={{ overflow: 'visible' }}
    >
      {/* Existing bridge groups */}
      {groups.map((group, gi) => {
        const x1 = positions[group.teeth[0]];
        const x2 = positions[group.teeth[group.teeth.length - 1]];
        if (x1 === undefined || x2 === undefined) return null;

        return (
          <g key={gi}>
            <line
              x1={x1} y1={y} x2={x2} y2={y}
              stroke={group.color}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.7}
            />
            <circle cx={x1} cy={y} r={4} fill={group.color} opacity={0.9} />
            <circle cx={x2} cy={y} r={4} fill={group.color} opacity={0.9} />
            {group.teeth.slice(1, -1).map((tooth) => {
              const cx = positions[tooth];
              if (cx === undefined) return null;
              return (
                <circle
                  key={tooth}
                  cx={cx}
                  cy={y}
                  r={3}
                  fill="none"
                  stroke={group.color}
                  strokeWidth={1.5}
                  opacity={0.8}
                />
              );
            })}
          </g>
        );
      })}

      {/* Preview group (dashed line + role-specific markers) */}
      {previewGroup && (() => {
        const teeth = previewGroup.teeth;
        const x1 = positions[teeth[0]];
        const x2 = positions[teeth[teeth.length - 1]];
        if (x1 === undefined || x2 === undefined) return null;
        const previewY = isUpper ? 10 : dims.height - 14;
        const color = previewGroup.color;

        return (
          <g opacity={0.6}>
            {/* Dashed connector line */}
            <line
              x1={x1} y1={previewY} x2={x2} y2={previewY}
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="6,3"
            />
            {/* Per-tooth markers based on role */}
            {teeth.map(tooth => {
              const cx = positions[tooth];
              if (cx === undefined) return null;
              const role = previewGroup.roles[tooth] || 'pontic';
              return role === 'pillar' ? (
                // Pillar: filled diamond
                <g key={tooth}>
                  <circle cx={cx} cy={previewY} r={5} fill={color} />
                  <text
                    x={cx} y={previewY + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontSize={6}
                    fontWeight="bold"
                  >P</text>
                </g>
              ) : (
                // Pontic: open circle with X
                <g key={tooth}>
                  <circle cx={cx} cy={previewY} r={4} fill="none" stroke={color} strokeWidth={1.5} />
                  <line x1={cx - 2} y1={previewY - 2} x2={cx + 2} y2={previewY + 2} stroke={color} strokeWidth={1} />
                  <line x1={cx + 2} y1={previewY - 2} x2={cx - 2} y2={previewY + 2} stroke={color} strokeWidth={1} />
                </g>
              );
            })}
          </g>
        );
      })()}
    </svg>
  );
}
