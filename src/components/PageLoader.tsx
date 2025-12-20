import { cn } from '@/lib/utils';

interface PageLoaderProps {
  className?: string;
}

export function PageLoader({ className }: PageLoaderProps) {
  return (
    <div className={cn(
      "flex items-center justify-center min-h-[60vh]",
      className
    )}>
      <div className="relative">
        {/* Outer glow ring */}
        <div className="absolute inset-0 rounded-full animate-ping opacity-30 bg-gradient-to-r from-[hsl(300,70%,60%)] to-[hsl(270,70%,55%)]" />
        
        {/* Main spinner */}
        <div className="relative w-12 h-12">
          <div 
            className="absolute inset-0 rounded-full border-4 border-transparent animate-spin"
            style={{
              borderTopColor: 'hsl(300, 70%, 60%)',
              borderRightColor: 'hsl(270, 70%, 55%)',
              animationDuration: '1s',
            }}
          />
          <div 
            className="absolute inset-1 rounded-full border-4 border-transparent animate-spin"
            style={{
              borderBottomColor: 'hsl(270, 70%, 55%)',
              borderLeftColor: 'hsl(300, 70%, 60%)',
              animationDuration: '0.8s',
              animationDirection: 'reverse',
            }}
          />
          
          {/* Center glow dot */}
          <div 
            className="absolute inset-0 m-auto w-3 h-3 rounded-full animate-pulse"
            style={{
              background: 'radial-gradient(circle, hsl(300, 70%, 70%) 0%, hsl(270, 70%, 55%) 100%)',
              boxShadow: '0 0 20px hsl(300, 70%, 60%), 0 0 40px hsl(270, 70%, 55%)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
