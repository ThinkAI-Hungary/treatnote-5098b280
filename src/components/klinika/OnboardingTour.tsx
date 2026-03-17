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
  switchToTab?: string;
  requiredTab?: string;
  spotlightYOffset?: number;
  hideNav?: boolean;    // Hide ALL prev/next buttons (only Kihagyás)
  hideNext?: boolean;   // Hide Next button but keep Előző; Kihagyás still shown unless hideSkip
  hideSkip?: boolean;   // Hide the Kihagyás (skip) button in the footer
  interactive?: boolean; // Overlay becomes pointer-events-none so spotlight element stays clickable
  showArrows?: boolean;  // Render animated gradient arrows on the sides of the spotlight
  showTopArrow?: boolean;// Render animated gradient arrow from the top
  displayStep?: number;  // Override the counter numerator (e.g. 1)
  displayTotal?: number; // Override the counter denominator (e.g. 3)
  noScroll?: boolean;    // Don't scroll to element — use its current viewport rect as-is
}

interface OnboardingTourProps {
  steps: TourStep[];
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
  onStepChange?: (step: TourStep, stepIndex: number) => void; // Callback for step changes
  step?: number; // Optional external step override — when provided, drives the current step
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingTour({ steps, isOpen, onComplete, onSkip, onStepChange, step: externalStep }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [arrowPosition, setArrowPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom');
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  // Reset to first step when tour opens — useLayoutEffect so it's synchronous before paint
  useLayoutEffect(() => {
    if (isOpen) {
      setCurrentStep(externalStep ?? 0);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external step when VoiceRecording drives it (record/stop buttons)
  // useLayoutEffect: step state updates BEFORE the browser paints, avoiding a flicker frame
  useLayoutEffect(() => {
    if (isOpen && externalStep !== undefined) {
      setCurrentStep(externalStep);
    }
  }, [externalStep, isOpen]);

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
    if (!step.noScroll) {
      const edgeBuffer = 40;
      const isNearTop = preRect.top < edgeBuffer;
      const isNearBottom = preRect.bottom > window.innerHeight - edgeBuffer;
      if (isNearTop || isNearBottom) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    const rect = preRect;
    const spotlightPaddingX = 2; // Minimal horizontal — avoids overflowing sidebar right border
    const spotlightPaddingY = 8; // Vertical breathing room above/below

    // Store target rect for spotlight (with padding)
    const highlightRect = {
      top: rect.top - spotlightPaddingY,
      left: rect.left - spotlightPaddingX,
      width: rect.width + spotlightPaddingX * 2,
      height: rect.height + spotlightPaddingY * 2,
      bottom: rect.bottom + spotlightPaddingY,
      right: rect.right + spotlightPaddingX,
    };

    // Clamp spotlight to viewport so it never renders outside the screen (prevents top clipping)
    // Use per-step Y offset if provided (e.g., for Profile page inputs near top edge)
    const spotlightYOffset = step.spotlightYOffset ?? 0;
    const clampedTop = Math.max(0, highlightRect.top - spotlightYOffset);
    const clampedLeft = Math.max(4, highlightRect.left); // min 4px from edge so border is never clipped
    const clampedRight = Math.min(window.innerWidth - 4, highlightRect.right);
    const clampedBottom = Math.min(window.innerHeight, highlightRect.bottom - spotlightYOffset);

    setTargetRect({
      top: clampedTop,
      left: clampedLeft,
      width: Math.max(0, clampedRight - clampedLeft),
      height: Math.max(0, clampedBottom - clampedTop),
    });

    // Read tooltip size directly from the DOM — synchronous, no async state needed.
    // Falls back to reasonable defaults if the tooltip isn't mounted yet.
    const tooltipEl = tooltipRef.current;
    const tooltipWidth = tooltipEl ? tooltipEl.offsetWidth : 350;
    const tooltipHeight = tooltipEl ? tooltipEl.offsetHeight : 200;
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
  }, [currentStep, isOpen, steps]);

  // useLayoutEffect: fires synchronously after DOM mutations, before the browser paints.
  // This means positions are always correct on the very first painted frame after a step change.
  useLayoutEffect(() => {
    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    window.addEventListener('scroll', calculatePosition, true);

    return () => {
      window.removeEventListener('resize', calculatePosition);
      window.removeEventListener('scroll', calculatePosition, true);
    };
  }, [calculatePosition]);

  // Notify parent when step changes (keeps activeTourStep in VoiceRecording in sync
  // when the user presses Előző/Következő inside the tour itself)
  useEffect(() => {
    if (isOpen && steps[currentStep] && onStepChange) {
      onStepChange(steps[currentStep], currentStep);
    }
  }, [currentStep, isOpen, steps, onStepChange]);

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
            style={{
              // When interactive: clip the overlay to a frame around the spotlight so
              // the spotlight area passes pointer events to the page while the rest is blocked.
              clipPath: step.interactive && targetRect
                ? `polygon(0px 0px, 100% 0px, 100% 100%, 0px 100%, 0px 0px, ${targetRect.left}px ${targetRect.top}px, ${targetRect.left}px ${targetRect.top + targetRect.height}px, ${targetRect.left + targetRect.width}px ${targetRect.top + targetRect.height}px, ${targetRect.left + targetRect.width}px ${targetRect.top}px, ${targetRect.left}px ${targetRect.top}px)`
                : undefined,
            }}
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

          {/* Directional arrows pointing at the spotlight (showArrows steps) */}
          {step.showArrows && targetRect && (
            <>
              {/* Left arrow — tip points RIGHT (inward toward button) */}
              <motion.div
                key={`arrow-left-${currentStep}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, x: [0, 8, 0] }}
                transition={{ opacity: { duration: 0.3 }, x: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } }}
                className="fixed z-[9999] pointer-events-none"
                style={{
                  top: targetRect.top + targetRect.height / 2 - 20,
                  left: targetRect.left - 58,
                  transform: 'translateY(-50%)',
                  width: 42,
                  height: 42,
                  clipPath: 'polygon(0% 30%, 55% 30%, 55% 0%, 100% 50%, 55% 100%, 55% 70%, 0% 70%)',
                  background: 'linear-gradient(to right, hsl(var(--accent)), hsl(var(--primary)))',
                  filter: 'drop-shadow(0 0 8px hsl(var(--primary) / 0.8))',
                }}
              />
              {/* Right arrow — tip points LEFT (inward toward button) */}
              <motion.div
                key={`arrow-right-${currentStep}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, x: [0, -8, 0] }}
                transition={{ opacity: { duration: 0.3 }, x: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } }}
                className="fixed z-[9999] pointer-events-none"
                style={{
                  top: targetRect.top + targetRect.height / 2 - 20,
                  left: targetRect.left + targetRect.width + 16,
                  transform: 'translateY(-50%)',
                  width: 42,
                  height: 42,
                  clipPath: 'polygon(100% 30%, 45% 30%, 45% 0%, 0% 50%, 45% 100%, 45% 70%, 100% 70%)',
                  background: 'linear-gradient(to left, hsl(var(--accent)), hsl(var(--primary)))',
                  filter: 'drop-shadow(0 0 8px hsl(var(--primary) / 0.8))',
                }}
              />
            </>
          )}

          {/* Directional arrow pointing from the top */}
          {step.showTopArrow && targetRect && (
            <motion.div
              key={`arrow-top-${currentStep}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, y: [0, 8, 0] }}
              transition={{ opacity: { duration: 0.3 }, y: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } }}
              className="fixed z-[9999] pointer-events-none"
              style={{
                left: targetRect.left + targetRect.width / 2 - 21,
                top: targetRect.top - 58,
                width: 42,
                height: 42,
                clipPath: 'polygon(30% 0%, 70% 0%, 70% 55%, 100% 55%, 50% 100%, 0% 55%, 30% 55%)',
                background: 'linear-gradient(to bottom, hsl(var(--accent)), hsl(var(--primary)))',
                filter: 'drop-shadow(0 0 8px hsl(var(--primary) / 0.8))',
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
                  {step.displayStep ?? currentStep + 1} / {step.displayTotal ?? steps.length}
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
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {step.content}
              </p>
            </div>

            {/* Footer */}
            <div className="px-4 pb-4 flex items-center justify-between">
              {step.hideNav ? (
                // Action-gated: only show Kihagyás, no navigation
                <>
                  <span />
                  <div className="flex gap-1.5">
                    {Array.from({ length: step.displayTotal ?? steps.length }).map((_, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'w-2 h-2 rounded-full transition-colors',
                          idx === (step.displayStep != null ? step.displayStep - 1 : currentStep)
                            ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                      />
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground text-xs">
                    Kihagyás
                  </Button>
                </>
              ) : step.hideNext ? (
                // Click-to-act: Előző only if not on first step, no Következő
                <>
                  {currentStep > 0 ? (
                    <Button variant="ghost" size="sm" onClick={handlePrev} className="text-muted-foreground">
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Előző
                    </Button>
                  ) : <span />}
                  <div className="flex gap-1.5">
                    {Array.from({ length: step.displayTotal ?? steps.length }).map((_, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'w-2 h-2 rounded-full transition-colors',
                          idx === (step.displayStep != null ? step.displayStep - 1 : currentStep)
                            ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                      />
                    ))}
                  </div>
                  {!step.hideSkip ? (
                    <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground text-xs">
                      Kihagyás
                    </Button>
                  ) : <span />}
                </>
              ) : (
                // Normal nav
                <>
                  {currentStep > 0 ? (
                    <Button variant="ghost" size="sm" onClick={handlePrev} className="text-muted-foreground">
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Előző
                    </Button>
                  ) : <span />}
                  <div className="flex gap-1.5">
                    {Array.from({ length: step.displayTotal ?? steps.length }).map((_, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'w-2 h-2 rounded-full transition-colors',
                          idx === (step.displayStep != null ? step.displayStep - 1 : currentStep)
                            ? 'bg-primary' : 'bg-muted-foreground/30'
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
                </>
              )}
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
