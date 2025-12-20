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
import { Trash2, AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  variant?: 'danger' | 'warning';
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
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-0 bg-card/95 backdrop-blur-xl overflow-hidden">
        {/* Neon glow background */}
        <div className="absolute inset-0 pointer-events-none">
          <div 
            className="absolute -top-20 -left-20 w-40 h-40 rounded-full blur-3xl opacity-30"
            style={{ background: 'hsl(300 70% 50%)' }}
          />
          <div 
            className="absolute -bottom-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-30"
            style={{ background: 'hsl(270 70% 60%)' }}
          />
        </div>
        
        <AlertDialogHeader className="relative z-10">
          <div className="flex items-center gap-4">
            <div 
              className="h-12 w-12 rounded-xl flex items-center justify-center animate-pulse"
              style={{
                background: variant === 'danger' 
                  ? 'linear-gradient(135deg, hsl(300 70% 50%), hsl(350 70% 50%))'
                  : 'linear-gradient(135deg, hsl(40 90% 50%), hsl(30 90% 50%))',
                boxShadow: variant === 'danger'
                  ? '0 0 30px hsl(300 70% 50% / 0.4), 0 0 60px hsl(300 70% 50% / 0.2)'
                  : '0 0 30px hsl(40 90% 50% / 0.4), 0 0 60px hsl(40 90% 50% / 0.2)',
              }}
            >
              {variant === 'danger' ? (
                <Trash2 className="h-6 w-6 text-white" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-white" />
              )}
            </div>
            <div>
              <AlertDialogTitle 
                className="text-xl font-bold"
                style={{
                  background: variant === 'danger'
                    ? 'linear-gradient(135deg, hsl(300 70% 60%), hsl(270 70% 70%))'
                    : 'linear-gradient(135deg, hsl(40 90% 60%), hsl(30 90% 50%))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {title}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground mt-1">
                {description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        
        <AlertDialogFooter className="relative z-10 mt-6">
          <AlertDialogCancel 
            className="border-primary/20 hover:bg-primary/10 hover:border-primary/40 transition-all duration-300"
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="border-0 text-white transition-all duration-300 hover:scale-105"
            style={{
              background: variant === 'danger'
                ? 'linear-gradient(135deg, hsl(300 70% 50%), hsl(350 70% 50%))'
                : 'linear-gradient(135deg, hsl(40 90% 50%), hsl(30 90% 50%))',
              boxShadow: variant === 'danger'
                ? '0 4px 20px hsl(300 70% 50% / 0.4)'
                : '0 4px 20px hsl(40 90% 50% / 0.4)',
            }}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}