import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { motion, useAnimation } from "framer-motion";

import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

// SVG Border Animation Component
function SnakeBorder({ isOpen, width, height }: { isOpen: boolean; width: number; height: number }) {
  const controls = useAnimation();
  const borderRadius = 8;
  const strokeWidth = 2;
  const padding = strokeWidth;
  
  React.useEffect(() => {
    if (isOpen) {
      controls.start({
        pathLength: 1,
        opacity: 1,
        transition: {
          pathLength: { duration: 0.3, ease: "easeOut" },
          opacity: { duration: 0.05 },
        },
      });
    } else {
      controls.start({
        pathLength: 0,
        opacity: 0,
        transition: {
          pathLength: { duration: 0.15, ease: "easeIn" },
          opacity: { duration: 0.1, delay: 0.1 },
        },
      });
    }
  }, [isOpen, controls]);

  if (width === 0 || height === 0) return null;

  const svgWidth = width + padding * 2;
  const svgHeight = height + padding * 2;

  // Create a path that starts from top center and goes clockwise
  const createRoundedRectPath = () => {
    const x = padding;
    const y = padding;
    const w = width;
    const h = height;
    const r = borderRadius;
    
    // Start from top center, go right (clockwise)
    return `
      M ${x + w / 2} ${y}
      L ${x + w - r} ${y}
      Q ${x + w} ${y} ${x + w} ${y + r}
      L ${x + w} ${y + h - r}
      Q ${x + w} ${y + h} ${x + w - r} ${y + h}
      L ${x + r} ${y + h}
      Q ${x} ${y + h} ${x} ${y + h - r}
      L ${x} ${y + r}
      Q ${x} ${y} ${x + r} ${y}
      L ${x + w / 2} ${y}
    `;
  };

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute pointer-events-none"
      style={{ 
        top: -padding, 
        left: -padding,
        overflow: 'visible',
      }}
    >
      <defs>
        <linearGradient id="snakeBorderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(195, 90%, 55%)" />
          <stop offset="33%" stopColor="hsl(270, 70%, 55%)" />
          <stop offset="66%" stopColor="hsl(300, 70%, 60%)" />
          <stop offset="100%" stopColor="hsl(195, 90%, 55%)" />
        </linearGradient>
        <filter id="snakeBorderGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <motion.path
        d={createRoundedRectPath()}
        stroke="url(#snakeBorderGradient)"
        strokeWidth={strokeWidth}
        fill="none"
        filter="url(#snakeBorderGlow)"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={controls}
      />
    </svg>
  );
}

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <SelectPrimitive.Trigger
        ref={ref}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg px-3 py-2 text-sm",
          "bg-background/80 backdrop-blur-sm",
          "border border-input/50 ring-offset-background",
          "placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-0 focus:border-primary/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "[&>span]:line-clamp-1",
          "transition-all duration-300 ease-out",
          "hover:border-primary/30 hover:shadow-[0_0_10px_hsl(195_85%_55%/0.1)]",
          className,
        )}
        onPointerDown={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        data-state={isOpen ? "open" : "closed"}
        {...props}
      >
        {children}
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 opacity-50 transition-transform duration-200" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SnakeBorder isOpen={isOpen} width={dimensions.width} height={dimensions.height} />
    </div>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      "bg-gradient-to-b from-popover to-transparent",
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      "bg-gradient-to-t from-popover to-transparent",
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-lg",
        "bg-popover/95 backdrop-blur-md text-popover-foreground",
        "border border-border/50 shadow-xl shadow-primary/10",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className,
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label 
    ref={ref} 
    className={cn(
      "py-1.5 pl-8 pr-2 text-sm font-semibold text-foreground/80",
      className
    )} 
    {...props} 
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none",
      "transition-all duration-200 ease-out",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      "focus:bg-gradient-to-r focus:from-primary/15 focus:via-accent/10 focus:to-primary/5",
      "focus:text-accent-foreground focus:shadow-[inset_0_0_20px_hsl(195_85%_55%/0.1)]",
      "data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4 text-primary" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator 
    ref={ref} 
    className={cn(
      "-mx-1 my-1 h-px bg-gradient-to-r from-transparent via-border to-transparent",
      className
    )} 
    {...props} 
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
