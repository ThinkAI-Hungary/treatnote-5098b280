import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface GalaxyButtonProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  disabled?: boolean;
  onClick?: () => void;
  [key: string]: any;
}

export function GalaxyButton({ 
  children, 
  className, 
  variant = 'default',
  ...props 
}: GalaxyButtonProps) {
  return (
    <Button
      className={cn(
        "relative overflow-hidden transition-all duration-300",
        variant === 'default' && [
          "bg-gradient-to-r from-primary to-accent text-primary-foreground",
          "hover:shadow-lg hover:shadow-primary/25",
          "before:absolute before:inset-0 before:bg-gradient-to-r before:from-accent before:to-primary",
          "before:opacity-0 before:transition-opacity before:duration-300",
          "hover:before:opacity-100",
          "[&>*]:relative [&>*]:z-10"
        ],
        className
      )}
      variant={variant}
      {...props}
    >
      {children}
    </Button>
  );
}
