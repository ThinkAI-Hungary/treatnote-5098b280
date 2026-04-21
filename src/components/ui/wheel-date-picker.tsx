import { useState, useEffect, useRef } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

function ScrollColumn({ items, value, onChange, suffix, width }: any) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeout = useRef<NodeJS.Timeout>();

  const scrollToCenter = (el: HTMLElement) => {
      const container = containerRef.current;
      if (!container || !el) return;
      const targetTop = el.offsetTop - (container.clientHeight / 2) + (el.clientHeight / 2);
      const startTop = container.scrollTop;
      const distance = targetTop - startTop;
      
      if (Math.abs(distance) < 2) return;
      
      const duration = 250;
      let startTime: number | null = null;
      
      const step = (timestamp: number) => {
          if (!startTime) startTime = timestamp;
          const progress = timestamp - startTime;
          const percentage = Math.min(progress / duration, 1);
          const ease = 1 - Math.pow(1 - percentage, 3);
          container.scrollTop = startTop + distance * ease;
          if (progress < duration) {
              window.requestAnimationFrame(step);
          }
      };
      window.requestAnimationFrame(step);
  };

  useEffect(() => {
    if (containerRef.current && value) {
      const el = containerRef.current.querySelector(`[data-value="${value}"]`) as HTMLElement;
      if (el) el.scrollIntoView({ block: 'center' });
    }
  }, [items]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key.length !== 1 || !/[a-záéíóöőúüű]/.test(key)) return;
      const firstMatch = items.find((item: any) => String(item.label).toLowerCase().startsWith(key));
      if (firstMatch && firstMatch.value !== value) {
         e.preventDefault();
         onChange(firstMatch.value);
         setTimeout(() => {
            if (!containerRef.current) return;
            const el = containerRef.current.querySelector(`[data-value="${firstMatch.value}"]`) as HTMLElement;
            if (el) scrollToCenter(el);
         }, 0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, value, onChange]);

  const handleScroll = () => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      if (!containerRef.current) return;
      const containerCenter = containerRef.current.getBoundingClientRect().top + (containerRef.current.clientHeight / 2);
      let closestEl: Element | null = null;
      let minDistance = Infinity;
      containerRef.current.querySelectorAll('.wheel-item').forEach(child => {
          const rect = child.getBoundingClientRect();
          const childCenter = rect.top + (rect.height / 2);
          const distance = Math.abs(childCenter - containerCenter);
          if (distance < minDistance) {
              minDistance = distance;
              closestEl = child;
          }
      });
      if (closestEl) {
          const closestAttr = closestEl.getAttribute('data-value');
          if (closestAttr && closestAttr !== value) onChange(closestAttr);
          scrollToCenter(closestEl as HTMLElement);
      }
    }, 120);
  };

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className={cn("h-[210px] overflow-y-auto relative", width)} 
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <div className="h-[85px]" /> 
      {items.map((item: any) => (
        <div
          key={item.value}
          data-value={item.value}
          onClick={(e) => {
             onChange(item.value);
             scrollToCenter(e.currentTarget as HTMLElement);
          }}
          className={cn(
            "wheel-item h-10 flex items-center justify-center cursor-pointer transition-all duration-200",
            value === item.value ? "font-bold text-lg text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground"
          )}
        >
          {item.label}{suffix}
        </div>
      ))}
      <div className="h-[85px]" />
    </div>
  )
}

export function WheelDatePicker({ value, onChange, placeholder }: { value: string | null, onChange: (date: string) => void, placeholder?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [year, setYear] = useState<string>('');
  const [month, setMonth] = useState<string>('');
  const [day, setDay] = useState<string>('');

  useEffect(() => {
    if (value && value.includes('-')) {
      const [y, m, d] = value.split('-');
      if (y !== year) setYear(y);
      if (m !== month) setMonth(m);
      if (d !== day) setDay(d);
    } else if (!value) {
      const d = new Date();
      setYear(d.getFullYear().toString());
      setMonth(String(d.getMonth() + 1).padStart(2, '0'));
      setDay(String(d.getDate()).padStart(2, '0'));
    }
  }, [value, isOpen]);

  useEffect(() => {
    if (year && month && day) {
      const newDate = `${year}-${month}-${day}`;
      if (newDate !== value && isOpen) {
        onChange(newDate);
      }
    }
  }, [year, month, day]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => {
    const v = (currentYear + 10 - i).toString();
    return { label: v, value: v };
  });
  
  const monthNames = ["Jan", "Feb", "Már", "Ápr", "Máj", "Jún", "Júl", "Aug", "Szep", "Okt", "Nov", "Dec"];
  const months = monthNames.map((name, i) => ({
    label: name,
    value: String(i + 1).padStart(2, '0')
  }));
  
  const daysInMonth = year && month ? new Date(parseInt(year), parseInt(month), 0).getDate() : 31;
  useEffect(() => {
     if (day && parseInt(day) > daysInMonth) {
        setDay(String(daysInMonth).padStart(2, '0'));
     }
  }, [daysInMonth, day]);

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const v = String(i + 1).padStart(2, '0');
    return { label: v, value: v };
  });

  const displayVal = value && value.includes('-') 
    ? value.split('-').join('. ') + '.'
    : null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !displayVal && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayVal ? displayVal : (placeholder || "ÉÉÉÉ. HH. NN.")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-4 cursor-default select-none" align="center">
        <div 
          onClick={() => setIsOpen(false)}
          className="relative flex h-[210px] w-full items-center justify-between overflow-hidden"
          style={{ 
            maskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)', 
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)' 
          }}
        >
          <div className="absolute left-0 right-0 top-1/2 h-10 -translate-y-1/2 rounded bg-accent/50 pointer-events-none" />
          <ScrollColumn items={years} value={year} onChange={setYear} width="flex-1" suffix="." />
          <ScrollColumn items={months} value={month} onChange={setMonth} width="flex-1" suffix="" />
          <ScrollColumn items={days} value={day} onChange={setDay} width="flex-1" suffix="." />
        </div>
      </PopoverContent>
    </Popover>
  );
}
