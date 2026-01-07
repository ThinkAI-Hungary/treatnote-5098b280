import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
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
  switchToTab?: string; // Optional: switch to this tab before showing step (legacy)
  requiredTab?: string; // Which tab this step belongs to (used for both forward and backward navigation)
}

interface OnboardingTourProps {
  steps: TourStep[];
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
  onStepChange?: (step: TourStep, stepIndex: number) => void; // Callback for step changes
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingTour({ steps, isOpen, onComplete, onSkip, onStepChange }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [arrowPosition, setArrowPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom');
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipSize, setTooltipSize] = useState({ width: 350, height: 200 });

  // Reset to first step when tour opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

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
      setTargetRect(null);
      return;
    }

    // Ensure the target is fully on-screen BEFORE measuring spotlight.
    // Otherwise the glow/outline can get clipped by the viewport edge.
    const preRect = element.getBoundingClientRect();
    const edgeBuffer = 40;
    const isNearTop = preRect.top < edgeBuffer;
    const isNearBottom = preRect.bottom > window.innerHeight - edgeBuffer;
    if (isNearTop || isNearBottom) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const rect = preRect;
    const spotlightPadding = 16; // Padding around the spotlight (enough to not clip text)

    // Store target rect for spotlight (with padding)
    const highlightRect = {
      top: rect.top - spotlightPadding,
      left: rect.left - spotlightPadding,
      width: rect.width + spotlightPadding * 2,
      height: rect.height + spotlightPadding * 2,
      bottom: rect.bottom + spotlightPadding,
      right: rect.right + spotlightPadding,
    };

    // Clamp spotlight to viewport so it never renders outside the screen (prevents top clipping)
    const clampedTop = Math.max(24, highlightRect.top);
    const clampedLeft = Math.max(24, highlightRect.left);
    const clampedRight = Math.min(window.innerWidth - 24, highlightRect.right);
    const clampedBottom = Math.min(window.innerHeight - 24, highlightRect.bottom);

    setTargetRect({
      top: clampedTop,
      left: clampedLeft,
      width: Math.max(0, clampedRight - clampedLeft),
      height: Math.max(0, clampedBottom - clampedTop),
    });

    const tooltipWidth = tooltipSize.width;
    const tooltipHeight = tooltipSize.height;
    const gap = 20; // Gap between highlight border and tooltip

    let top = 0;
    let left = 0;
    let arrow: 'top' | 'bottom' | 'left' | 'right' = 'bottom';

    // Calculate available space from the HIGHLIGHT rect (not original element)
    const spaceAbove = highlightRect.top;
    const spaceBelow = window.innerHeight - highlightRect.bottom;
    const spaceLeft = highlightRect.left;
    const spaceRight = window.innerWidth - highlightRect.right;

    // Minimum space required
    const minSpaceVertical = tooltipHeight + gap;
    const minSpaceHorizontal = tooltipWidth + gap;

    // Determine position priority based on step.position preference, but fallback if no space
    const canFitAbove = spaceAbove >= minSpaceVertical;
    const canFitBelow = spaceBelow >= minSpaceVertical;
    const canFitLeft = spaceLeft >= minSpaceHorizontal;
    const canFitRight = spaceRight >= minSpaceHorizontal;

    // Build priority list based on preference
    type Position = 'top' | 'bottom' | 'left' | 'right';
    const preferredPosition = step.position || 'bottom';
    const positionPriority: Position[] = [preferredPosition];
    
    // Add fallback positions
    if (preferredPosition !== 'bottom') positionPriority.push('bottom');
    if (preferredPosition !== 'top') positionPriority.push('top');
    if (preferredPosition !== 'right') positionPriority.push('right');
    if (preferredPosition !== 'left') positionPriority.push('left');

    // Find first position that fits
    let chosenPosition: Position | null = null;
    for (const pos of positionPriority) {
      if (pos === 'top' && canFitAbove) { chosenPosition = 'top'; break; }
      if (pos === 'bottom' && canFitBelow) { chosenPosition = 'bottom'; break; }
      if (pos === 'left' && canFitLeft) { chosenPosition = 'left'; break; }
      if (pos === 'right' && canFitRight) { chosenPosition = 'right'; break; }
    }

    // Apply position
    if (chosenPosition === 'top') {
      top = highlightRect.top - tooltipHeight - gap;
      left = highlightRect.left + highlightRect.width / 2 - tooltipWidth / 2;
      arrow = 'bottom';
    } else if (chosenPosition === 'bottom') {
      top = highlightRect.bottom + gap;
      left = highlightRect.left + highlightRect.width / 2 - tooltipWidth / 2;
      arrow = 'top';
    } else if (chosenPosition === 'left') {
      top = highlightRect.top + highlightRect.height / 2 - tooltipHeight / 2;
      left = highlightRect.left - tooltipWidth - gap;
      arrow = 'right';
    } else if (chosenPosition === 'right') {
      top = highlightRect.top + highlightRect.height / 2 - tooltipHeight / 2;
      left = highlightRect.right + gap;
      arrow = 'left';
    } else {
      // No position fits - place at top-center of viewport, outside highlight
      top = 16;
      left = window.innerWidth / 2 - tooltipWidth / 2;
      arrow = 'top';
      // If highlight is at top of screen, try to go below it
      if (highlightRect.top < tooltipHeight + gap + 32) {
        top = highlightRect.bottom + gap;
      }
    }

    // Horizontal clamp - keep within viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
    
    // Vertical clamp with overlap prevention
    const tooltipBottom = top + tooltipHeight;
    const tooltipRight = left + tooltipWidth;
    
    // Check for overlap and adjust
    const overlapsVertically = !(tooltipBottom < highlightRect.top || top > highlightRect.bottom);
    const overlapsHorizontally = !(tooltipRight < highlightRect.left || left > highlightRect.right);
    
    if (overlapsVertically && overlapsHorizontally) {
      // There's overlap - force repositioning
      if (arrow === 'bottom' || arrow === 'top') {
        // For vertical arrows, adjust the top position
        if (spaceAbove > spaceBelow) {
          top = Math.min(highlightRect.top - tooltipHeight - gap, window.innerHeight - tooltipHeight - 16);
          top = Math.max(16, top);
          arrow = 'bottom';
        } else {
          top = Math.max(highlightRect.bottom + gap, 16);
          arrow = 'top';
        }
      }
    }
    
    // Final viewport clamp
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));

    setTooltipPosition({ top, left });
    setArrowPosition(arrow);

    // Scroll is handled near the start of this function to avoid viewport-edge clipping.
  }, [currentStep, isOpen, steps, tooltipSize.width, tooltipSize.height]);

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
    // Notify parent of step change (for tab switching etc.)
    if (isOpen && steps[currentStep] && onStepChange) {
      onStepChange(steps[currentStep], currentStep);
    }
  }, [currentStep, isOpen, steps, onStepChange]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    // Measure tooltip height/width (content-dependent) to avoid clipping into the highlighted element
    const raf = requestAnimationFrame(() => {
      const el = tooltipRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Avoid pointless rerenders
      setTooltipSize((prev) =>
        prev.width === r.width && prev.height === r.height
          ? prev
          : { width: r.width, height: r.height }
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, currentStep, steps.length]);

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

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* SVG Overlay with cutout for spotlight */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998]"
          >
            <svg className="w-full h-full">
              <defs>
                <mask id="spotlight-mask">
                  {/* White = visible, Black = hidden */}
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  {targetRect && (
                    <rect
                      x={targetRect.left}
                      y={targetRect.top}
                      width={targetRect.width}
                      height={targetRect.height}
                      rx="12"
                      fill="black"
                    />
                  )}
                </mask>
              </defs>
              {/* Dark overlay with cutout */}
              <rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill="rgba(0, 0, 0, 0.85)"
                mask="url(#spotlight-mask)"
              />
            </svg>
          </motion.div>

          {/* Glowing border around target */}
          {targetRect && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed z-[9999] pointer-events-none rounded-xl"
              style={{
                top: targetRect.top,
                left: targetRect.left,
                width: targetRect.width,
                height: targetRect.height,
                boxShadow: `
                  0 0 0 3px hsl(var(--primary)),
                  0 0 20px 4px hsl(var(--primary) / 0.5),
                  0 0 40px 8px hsl(var(--accent) / 0.3),
                  inset 0 0 20px 4px hsl(var(--primary) / 0.1)
                `,
                background: 'transparent',
              }}
            />
          )}

          {/* Animated pulse ring - outward only, then fade */}
          {targetRect && (
            <motion.div
              key={currentStep} // Reset animation on step change
              initial={{ opacity: 0.5, scale: 1 }}
              animate={{ 
                opacity: [0.5, 0], 
                scale: [1, 1.15]
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                repeatDelay: 0.3, // Small delay before next pulse
                ease: 'easeOut',
              }}
              className="fixed z-[9998] pointer-events-none rounded-xl border-2 border-primary"
              style={{
                top: targetRect.top,
                left: targetRect.left,
                width: targetRect.width,
                height: targetRect.height,
              }}
            />
          )}

          {/* Tooltip */}
          <motion.div
            ref={tooltipRef}
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

// Help button to restart the tour - styled like ThemeToggle, positioned bottom right
interface TourHelpButtonProps {
  onClick: () => void;
}

export function TourHelpButton({ onClick }: TourHelpButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-20 z-50",
        "h-12 w-12 rounded-full",
        "flex items-center justify-center",
        "bg-gradient-to-br from-primary to-accent",
        "shadow-lg transition-all duration-500 ease-out",
        "hover:scale-110 hover:shadow-xl",
        "shadow-[0_0_20px_hsl(var(--primary)/0.4),0_0_40px_hsl(var(--accent)/0.2)]"
      )}
      aria-label="Útmutató megnyitása"
    >
      <HelpCircle className="h-5 w-5 text-primary-foreground" />
    </button>
  );
}
