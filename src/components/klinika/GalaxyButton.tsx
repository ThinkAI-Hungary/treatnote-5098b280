import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface GalaxyButtonProps extends ButtonProps { }

/**
 * GalaxyButton — gradient-styled button.
 *
 * Uses the `galaxy-gradient` CSS class (defined in index.css) which
 * handles both light and dark mode with !important, cleanly overriding
 * the `primary-btn-gradient` class that Button's default variant adds.
 */
export const GalaxyButton = React.forwardRef<HTMLButtonElement, GalaxyButtonProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        className={cn(
          'relative overflow-hidden transition-all duration-300',
          variant === 'default' && 'galaxy-gradient',
          'hover:shadow-lg hover:shadow-primary/15',
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
