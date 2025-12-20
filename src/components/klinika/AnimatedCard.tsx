import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  [key: string]: any;
}

// Static card wrapper - no delay animations, instant render
export function AnimatedCard({ children, className, ...props }: AnimatedCardProps) {
  return (
    <Card 
      className={cn(
        "hover-lift border-primary/20 bg-card/80 backdrop-blur-sm",
        "dark:bg-card/60 dark:border-sparkle-blue/20",
        "transition-transform duration-300",
        className
      )} 
      {...props}
    >
      {children}
    </Card>
  );
}
