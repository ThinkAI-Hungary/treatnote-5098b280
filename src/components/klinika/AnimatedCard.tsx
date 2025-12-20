import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  [key: string]: any;
}

// Static card wrapper - no movement animations
export function AnimatedCard({ children, className, ...props }: AnimatedCardProps) {
  return (
    <Card 
      className={cn(
        "border-primary/20 bg-card/80 backdrop-blur-sm p-6",
        "dark:bg-card/60 dark:border-sparkle-blue/20",
        className
      )} 
      {...props}
    >
      {children}
    </Card>
  );
}
