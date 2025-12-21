import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface GalaxyButtonProps extends ButtonProps {}

export const GalaxyButton = React.forwardRef<HTMLButtonElement, GalaxyButtonProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        className={cn(
          'relative overflow-hidden transition-all duration-300',
          variant === 'default' && [
            'bg-gradient-to-r from-primary to-accent text-primary-foreground',
            'hover:shadow-lg hover:shadow-primary/25',
          ],
          className,
        )}
        variant={variant}
        {...props}
      >
        {children}
      </Button>
    );
  },
);
GalaxyButton.displayName = 'GalaxyButton';
