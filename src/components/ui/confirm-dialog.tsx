import { useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Trash2, AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (options?: { forceDelete?: boolean }) => void;
  variant?: 'danger' | 'warning';
  /** Position the dialog near the trigger element */
  anchorPosition?: { x: number; y: number } | null;
  /** Show force delete checkbox (for folder deletion) */
  showForceDelete?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title = 'Biztosan törölni szeretné?',
  description = 'Ez a művelet nem vonható vissza.',
  confirmText = 'Törlés',
  cancelText = 'Mégse',
  onConfirm,
  variant = 'danger',
  anchorPosition,
  showForceDelete = false,
}: ConfirmDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top?: string; left?: string }>({});
  const [forceDelete, setForceDelete] = useState(false);

  // Reset force delete when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setForceDelete(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && anchorPosition && contentRef.current) {
      const { x, y } = anchorPosition;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const dialogWidth = 320;
      const dialogHeight = showForceDelete ? 220 : 180;

      let left = Math.min(x, viewportWidth - dialogWidth - 20);
      let top = Math.min(y, viewportHeight - dialogHeight - 20);

      left = Math.max(20, left);
      top = Math.max(20, top);

      setPosition({
        top: `${top}px`,
        left: `${left}px`,
      });
    } else {
      setPosition({});
    }
  }, [open, anchorPosition, showForceDelete]);

  const handleConfirm = () => {
    onConfirm({ forceDelete });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent 
        ref={contentRef}
        className={`border border-primary/20 bg-card backdrop-blur-xl overflow-hidden max-w-[320px] p-4 ${
          anchorPosition ? 'inset-auto' : ''
        }`}
        style={anchorPosition ? { 
          position: 'fixed',
          top: position.top,
          left: position.left,
          margin: 0,
        } : undefined}
      >
        {/* Subtle glow background */}
        <div className="absolute inset-0 pointer-events-none opacity-50">
          <div 
            className="absolute -top-10 -left-10 w-20 h-20 rounded-full blur-2xl"
            style={{ background: 'hsl(var(--primary) / 0.2)' }}
          />
          <div 
            className="absolute -bottom-10 -right-10 w-20 h-20 rounded-full blur-2xl"
            style={{ background: 'hsl(var(--accent) / 0.2)' }}
          />
        </div>
        
        <AlertDialogHeader className="relative z-10 space-y-2">
          <div className="flex items-center gap-3">
            <div 
              className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: variant === 'danger' 
                  ? 'linear-gradient(135deg, hsl(var(--destructive)), hsl(var(--primary)))'
                  : 'linear-gradient(135deg, hsl(40 90% 50%), hsl(30 90% 50%))',
              }}
            >
              {variant === 'danger' ? (
                <Trash2 className="h-4 w-4 text-white" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <AlertDialogTitle className="text-base font-semibold text-foreground">
                {title}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground mt-0.5">
                {description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {showForceDelete && (
          <div className="relative z-10 mt-3 flex items-center space-x-2">
            <Checkbox 
              id="force-delete" 
              checked={forceDelete} 
              onCheckedChange={(checked) => setForceDelete(checked === true)}
            />
            <Label 
              htmlFor="force-delete" 
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Kényszerített törlés (üres mappákhoz)
            </Label>
          </div>
        )}
        
        <AlertDialogFooter className="relative z-10 mt-4 gap-2">
          <AlertDialogCancel 
            className="flex-1 h-8 text-sm border-border hover:bg-muted transition-colors"
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="flex-1 h-8 text-sm border-0 text-white transition-colors"
            style={{
              background: variant === 'danger'
                ? 'hsl(var(--destructive))'
                : 'hsl(40 90% 50%)',
            }}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
