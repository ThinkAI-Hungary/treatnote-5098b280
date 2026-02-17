import { Clock, CheckCircle2, XCircle, Loader2, Mic, ChevronRight, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VoiceJob } from '@/hooks/useVoiceJobHistory';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { hu } from 'date-fns/locale';
import { toast } from 'sonner';
import { useState } from 'react';

interface VoiceJobHistoryProps {
  jobs: VoiceJob[];
  isLoading: boolean;
  selectedJobId: string | null;
  onSelectJob: (job: VoiceJob) => void;
  onJobTerminated?: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getModeLabel(mode: string): string {
  switch (mode) {
    case 'treatnote': return 'Kezelési terv';
    case 'voxis': return 'Státuszfelvétel';
    case 'ambulans': return 'Ambuláns';
    default: return mode;
  }
}

function StatusIcon({ status }: { status: VoiceJob['status'] }) {
  switch (status) {
    case 'processing':
      return <Loader2 className="h-4 w-4 animate-spin text-sparkle-blue" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return null;
  }
}

export function VoiceJobHistory({ jobs, isLoading, selectedJobId, onSelectJob, onJobTerminated }: VoiceJobHistoryProps) {
  const [terminatingJobId, setTerminatingJobId] = useState<string | null>(null);

  const handleTerminateJob = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    setTerminatingJobId(jobId);
    try {
      const { error } = await supabase
        .from('voice_jobs')
        .delete()
        .eq('id', jobId);
      if (error) throw error;
      toast.success('Feldolgozás leállítva');
      onJobTerminated?.();
    } catch (err) {
      console.error('Failed to terminate job:', err);
      toast.error('Nem sikerült leállítani a feldolgozást');
    } finally {
      setTerminatingJobId(null);
    }
  };
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Előzmények
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Előzmények
          {jobs.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {jobs.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 px-4 text-center py-12">
            <Mic className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              Még nincs előzmény
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-3 pt-0">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => onSelectJob(job)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all duration-200",
                    "hover:bg-muted/50 hover:border-border",
                    selectedJobId === job.id
                      ? "bg-muted border-sparkle-blue/50 shadow-sm"
                      : "bg-transparent border-transparent"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusIcon status={job.status} />
                        <span className="font-medium text-sm truncate">
                          {getModeLabel(job.mode)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDuration(job.duration_seconds)}</span>
                        <span>•</span>
                        <span className="truncate">
                          {formatDistanceToNow(new Date(job.created_at), {
                            addSuffix: true,
                            locale: hu
                          })}
                        </span>
                      </div>
                      {job.paciens_id && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Páciens: #{job.paciens_id}
                        </div>
                      )}
                    </div>
                    {job.status === 'processing' ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => handleTerminateJob(e, job.id)}
                        disabled={terminatingJobId === job.id}
                        title="Feldolgozás leállítása"
                      >
                        {terminatingJobId === job.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    ) : (
                      <ChevronRight className={cn(
                        "h-4 w-4 text-muted-foreground/50 flex-shrink-0 transition-transform",
                        selectedJobId === job.id && "text-sparkle-blue"
                      )} />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
