import { ToothStatus } from '@/stores/dentalStore';

export const STATUS_COLORS: Record<ToothStatus, string> = {
  healthy: 'hsl(var(--primary))',
  caries: '#ef4444',
  filled: '#3b82f6',
  crown: '#f59e0b',
  bridge_anchor: '#8b5cf6',
  bridge_pontic: '#a78bfa',
  missing: '#9ca3af',
  implant: '#10b981',
  root_canal: '#ec4899',
  extraction_planned: '#dc2626',
};

export const STATUS_LABELS: Record<ToothStatus, string> = {
  healthy: 'Egészséges',
  caries: 'Szuvas',
  filled: 'Tömött',
  crown: 'Korona',
  bridge_anchor: 'Híd pillér',
  bridge_pontic: 'Híd pótfog',
  missing: 'Hiányzó',
  implant: 'Implantátum',
  root_canal: 'Gyökérkezelt',
  extraction_planned: 'Extrakció tervezett',
};

interface ToothIconProps {
  toothNumber: number;
  status: ToothStatus;
  isSelected: boolean;
  present: boolean;
  onClick: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function ToothIcon({
  toothNumber,
  status,
  isSelected,
  present,
  onClick,
  size = 'md',
}: ToothIconProps) {
  const sizeClasses = {
    sm: 'w-8 h-10',
    md: 'w-10 h-12',
    lg: 'w-12 h-14',
  };

  const isUpper = toothNumber >= 11 && toothNumber <= 28;
  const lastDigit = toothNumber % 10;
  const isMolar = lastDigit >= 6;
  const isPremolar = lastDigit === 4 || lastDigit === 5;

  // Determine tooth shape
  const getToothPath = () => {
    if (isMolar) {
      // Molar - wider, rectangular-ish
      return isUpper
        ? 'M 15 5 Q 10 5 8 10 L 6 35 Q 6 42 15 42 L 35 42 Q 44 42 44 35 L 42 10 Q 40 5 35 5 Z'
        : 'M 15 8 Q 6 8 6 15 L 8 40 Q 10 45 15 45 L 35 45 Q 40 45 42 40 L 44 15 Q 44 8 35 8 Z';
    } else if (isPremolar) {
      // Premolar - medium width
      return isUpper
        ? 'M 18 5 Q 12 5 10 12 L 10 35 Q 10 42 18 42 L 32 42 Q 40 42 40 35 L 40 12 Q 38 5 32 5 Z'
        : 'M 18 8 Q 10 8 10 15 L 10 38 Q 12 45 18 45 L 32 45 Q 38 45 40 38 L 40 15 Q 40 8 32 8 Z';
    } else {
      // Incisor/Canine - narrower
      return isUpper
        ? 'M 20 5 Q 14 5 12 12 L 12 35 Q 12 42 20 42 L 30 42 Q 38 42 38 35 L 38 12 Q 36 5 30 5 Z'
        : 'M 20 8 Q 12 8 12 15 L 12 38 Q 14 45 20 45 L 30 45 Q 36 45 38 38 L 38 15 Q 38 8 30 8 Z';
    }
  };

  const fillColor = present ? STATUS_COLORS[status] : STATUS_COLORS.missing;
  const opacity = present ? 1 : 0.4;

  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center
        ${sizeClasses[size]}
        transition-all duration-150
        ${isSelected ? 'scale-110 z-10' : 'hover:scale-105'}
        focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded
      `}
    >
      <svg
        viewBox="0 0 50 50"
        className="w-full h-full"
        style={{ opacity }}
      >
        <path
          d={getToothPath()}
          fill={fillColor}
          stroke={isSelected ? 'hsl(var(--ring))' : 'hsl(var(--border))'}
          strokeWidth={isSelected ? 3 : 1.5}
        />
        {!present && (
          <line
            x1="10"
            y1="10"
            x2="40"
            y2="40"
            stroke="#dc2626"
            strokeWidth="2"
          />
        )}
      </svg>
      <span className={`
        text-xs font-medium mt-0.5
        ${isSelected ? 'text-primary font-bold' : 'text-muted-foreground'}
      `}>
        {toothNumber}
      </span>
    </button>
  );
}
