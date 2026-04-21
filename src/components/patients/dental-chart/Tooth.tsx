import { cn } from '@/lib/utils';
import { ToothModel } from './types';
import { DENTAL_STATUSES } from './constants';

type Props = {
  number: string;
  data?: ToothModel;
  onClick: (number: string) => void;
  selected?: boolean;
};

export function Tooth({ number, data, onClick, selected }: Props) {
  const statusDef = data?.status ? DENTAL_STATUSES.find(s => s.id === data.status) : null;
  
  // Decide colors based on status group or ID
  let bgColor = 'bg-card hover:bg-muted';
  let textColor = 'text-foreground';
  let borderColor = 'border-border';
  let badgeColor = '';

  if (statusDef) {
    // Coloring logic
    if (statusDef.id === 'missing') {
      bgColor = 'bg-muted/30';
      textColor = 'text-muted-foreground line-through opacity-60';
    } else if (statusDef.group === 'Caries') {
      bgColor = 'bg-red-500/10 hover:bg-red-500/20';
      borderColor = 'border-red-500/50';
      textColor = 'text-red-700 dark:text-red-400 font-semibold';
      badgeColor = 'bg-red-500';
    } else if (statusDef.group === 'Tömés') {
      bgColor = 'bg-blue-500/10 hover:bg-blue-500/20';
      borderColor = 'border-blue-500/50';
      textColor = 'text-blue-700 dark:text-blue-400 font-semibold';
      badgeColor = 'bg-blue-500';
    } else if (statusDef.group === 'Letört fog' || statusDef.group === 'Speciális') {
      bgColor = 'bg-orange-500/10 hover:bg-orange-500/20';
      borderColor = 'border-orange-500/50';
      textColor = 'text-orange-700 dark:text-orange-400';
      badgeColor = 'bg-orange-500';
    } else if (statusDef.id !== 'healthy') {
      // Default filled state
      bgColor = 'bg-primary/10 hover:bg-primary/20';
      borderColor = 'border-primary/50';
      textColor = 'text-primary font-semibold';
      badgeColor = 'bg-primary';
    }
  }

  return (
    <button
      type="button"
      onClick={() => onClick(number)}
      className={cn(
        'relative flex flex-col items-center justify-center shrink-0 w-8 h-10 sm:w-9 sm:h-12 md:w-10 md:h-14 rounded border shadow-sm transition-all duration-200',
        bgColor,
        borderColor,
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105 z-10'
      )}
      title={statusDef?.name || 'Egészséges'}
    >
      <span className={cn('text-lg sm:text-xl md:text-2xl tracking-tighter', textColor)}>
        {number}
      </span>
      {data?.surfaces && (
        <span className="absolute bottom-1 text-[8px] sm:text-[10px] font-bold text-foreground/70 uppercase">
          {data.surfaces}
        </span>
      )}
      {badgeColor && !data?.surfaces && (
        <div className={cn("absolute top-1 right-1 w-2 h-2 rounded-full", badgeColor)} />
      )}
    </button>
  );
}
