import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CustomAudioPlayerProps {
  audioUrl: string;
  durationSeconds?: number;
  className?: string;
  onEnded?: () => void;
}

export function CustomAudioPlayer({ audioUrl, durationSeconds = 0, className, onEnded }: CustomAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (audioUrl) {
      audioRef.current = new Audio(audioUrl);
      
      // We manually bind the ended event
      audioRef.current.onended = () => {
        setIsPlaying(false);
        setProgress(100);
        if (onEnded) onEnded();
      };
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioUrl, onEnded]);

  const updateProgress = () => {
    if (!audioRef.current) return;
    
    // Fallback: If durationSeconds was provided, use it. Otherwise guess based on standard audio object.
    const duration = durationSeconds > 0 ? durationSeconds : audioRef.current.duration;
    
    if (duration > 0 && duration !== Infinity) {
      const currentProgress = (audioRef.current.currentTime / duration) * 100;
      setProgress(Math.min(currentProgress, 100));
    }
    
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(updateProgress);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(updateProgress);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, durationSeconds]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // If we finished playing previously, reset to start
      if (progress >= 100) {
        audioRef.current.currentTime = 0;
        setProgress(0);
      }
      
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
        }).catch(error => {
          console.error("Playback prevented:", error);
          setIsPlaying(false);
        });
      }
    }
  };

  return (
    <div className={cn("flex flex-col gap-2 w-full", className)}>
      <div className="flex items-center gap-3 bg-secondary/30 p-2.5 rounded-xl border border-border/50">
        <Button 
          variant="default" 
          size="icon" 
          onClick={togglePlay}
          className={cn(
            "h-10 w-10 shrink-0 rounded-full shadow-md transition-all duration-300", 
            isPlaying ? "bg-primary/90 scale-95" : "hover:scale-105"
          )}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" fill="currentColor" />
          ) : progress >= 100 ? (
             <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
          )}
        </Button>
        
        <div className="flex-1 relative h-2.5 bg-muted/60 rounded-full overflow-hidden shrink-0">
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-sparkle-blue transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
