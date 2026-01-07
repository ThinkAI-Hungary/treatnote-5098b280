import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight, HelpCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TourStep {
  target: string; // CSS selector or data attribute
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface OnboardingTourProps {
  steps: TourStep[];
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export function OnboardingTour({ steps, isOpen, onComplete, onSkip }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [arrowPosition, setArrowPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom');

  const calculatePosition = useCallback(() => {
    if (!isOpen || steps.length === 0) return;

    const step = steps[currentStep];
    const element = document.querySelector(step.target);

    if (!element) {
      // If element not found, center the tooltip
      setTooltipPosition({
        top: window.innerHeight / 2 - 100,
        left: window.innerWidth / 2 - 175,
      });
      return;
    }

    const rect = element.getBoundingClientRect();
    const tooltipWidth = 350;
    const tooltipHeight = 180;
    const padding = 16;

    let top = 0;
    let left = 0;
    let arrow: 'top' | 'bottom' | 'left' | 'right' = step.position || 'bottom';

    // Calculate best position based on available space
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceLeft = rect.left;
    const spaceRight = window.innerWidth - rect.right;

    if (step.position === 'top' || (!step.position && spaceAbove > tooltipHeight + padding)) {
      // Position above
      top = rect.top - tooltipHeight - padding;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      arrow = 'bottom';
    } else if (step.position === 'bottom' || (!step.position && spaceBelow > tooltipHeight + padding)) {
      // Position below
      top = rect.bottom + padding;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      arrow = 'top';
    } else if (step.position === 'left' || (!step.position && spaceLeft > tooltipWidth + padding)) {
      // Position left
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - padding;
      arrow = 'right';
    } else {
      // Position right
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + padding;
      arrow = 'left';
    }

    // Keep within viewport bounds
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipHeight - padding));

    setTooltipPosition({ top, left });
    setArrowPosition(arrow);

    // Scroll element into view if needed
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentStep, isOpen, steps]);

  useEffect(() => {
    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    window.addEventListener('scroll', calculatePosition, true);

    return () => {
      window.removeEventListener('resize', calculatePosition);
      window.removeEventListener('scroll', calculatePosition, true);
    };
  }, [calculatePosition]);

  useEffect(() => {
    // Recalculate after a small delay to allow DOM updates
    const timeout = setTimeout(calculatePosition, 100);
    return () => clearTimeout(timeout);
  }, [currentStep, calculatePosition]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    setCurrentStep(0);
    onSkip();
  };

  if (!isOpen || steps.length === 0) return null;

  const step = steps[currentStep];

  // Highlight the target element
  const targetElement = document.querySelector(step.target);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
            onClick={handleSkip}
          />

          {/* Highlight spotlight */}
          {targetElement && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed z-[9999] pointer-events-none rounded-lg ring-4 ring-primary ring-offset-4 ring-offset-background"
              style={{
                top: targetElement.getBoundingClientRect().top - 4,
                left: targetElement.getBoundingClientRect().left - 4,
                width: targetElement.getBoundingClientRect().width + 8,
                height: targetElement.getBoundingClientRect().height + 8,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
              }}
            />
          )}

          {/* Tooltip */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed z-[10000] w-[350px] bg-card border border-primary/30 rounded-xl shadow-2xl overflow-hidden"
            style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
          >
            {/* Arrow */}
            <div
              className={cn(
                'absolute w-3 h-3 bg-card border-primary/30 rotate-45',
                arrowPosition === 'top' && 'top-[-7px] left-1/2 -translate-x-1/2 border-t border-l',
                arrowPosition === 'bottom' && 'bottom-[-7px] left-1/2 -translate-x-1/2 border-b border-r',
                arrowPosition === 'left' && 'left-[-7px] top-1/2 -translate-y-1/2 border-b border-l',
                arrowPosition === 'right' && 'right-[-7px] top-1/2 -translate-y-1/2 border-t border-r'
              )}
            />

            {/* Header */}
            <div className="bg-gradient-to-r from-primary/20 to-accent/20 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">
                  {currentStep + 1} / {steps.length}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={handleSkip}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              <h3 className="font-semibold text-lg bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {step.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.content}
              </p>
            </div>

            {/* Footer */}
            <div className="px-4 pb-4 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrev}
                disabled={currentStep === 0}
                className="text-muted-foreground"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Előző
              </Button>

              <div className="flex gap-1.5">
                {steps.map((_, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'w-2 h-2 rounded-full transition-colors',
                      idx === currentStep ? 'bg-primary' : 'bg-muted-foreground/30'
                    )}
                  />
                ))}
              </div>

              <Button
                size="sm"
                onClick={handleNext}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
              >
                {currentStep === steps.length - 1 ? 'Befejezés' : 'Következő'}
                {currentStep < steps.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

// Help button to restart the tour
interface TourHelpButtonProps {
  onClick: () => void;
}

export function TourHelpButton({ onClick }: TourHelpButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="border-primary/20 hover:bg-primary/10 gap-2"
    >
      <HelpCircle className="h-4 w-4" />
      Útmutató
    </Button>
  );
}
