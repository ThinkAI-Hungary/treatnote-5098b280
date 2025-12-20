import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AnimatedTableProps {
  loading: boolean;
  children: ReactNode;
  headers: ReactNode;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  isEmpty?: boolean;
  className?: string;
}

export function AnimatedTable({
  loading,
  children,
  headers,
  emptyMessage = 'Nincs megjeleníthető adat',
  emptyIcon,
  isEmpty = false,
  className,
}: AnimatedTableProps) {
  if (loading) {
    return (
      <div className="relative min-h-[200px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Loader2 
              className="h-10 w-10 animate-spin"
              style={{
                stroke: 'url(#loader-gradient)',
              }}
            />
            <svg width="0" height="0">
              <defs>
                <linearGradient id="loader-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(300 70% 60%)" />
                  <stop offset="100%" stopColor="hsl(270 70% 60%)" />
                </linearGradient>
              </defs>
            </svg>
            <div 
              className="absolute inset-0 blur-xl opacity-50 animate-pulse"
              style={{
                background: 'radial-gradient(circle, hsl(300 70% 60% / 0.5), transparent)',
              }}
            />
          </div>
          <span className="text-sm text-muted-foreground">Betöltés...</span>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="text-center py-12 text-muted-foreground animate-fade-in">
        {emptyIcon && <div className="mb-3 flex justify-center opacity-30">{emptyIcon}</div>}
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg overflow-hidden border border-primary/10 animate-fade-in", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 border-b border-primary/10">
            {headers}
          </TableRow>
        </TableHeader>
        <TableBody>
          {children}
        </TableBody>
      </Table>
    </div>
  );
}

// Animated table row component with staggered entrance
interface AnimatedTableRowProps {
  children: ReactNode;
  index?: number;
  className?: string;
  onClick?: () => void;
}

export function AnimatedTableRow({ 
  children, 
  index = 0, 
  className,
  onClick,
}: AnimatedTableRowProps) {
  return (
    <TableRow
      className={cn(
        "group hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 transition-colors duration-200 table-row-animate",
        className
      )}
      style={{ animationDelay: `${Math.min(index, 15) * 30}ms` }}
      onClick={onClick}
    >
      {children}
    </TableRow>
  );
}