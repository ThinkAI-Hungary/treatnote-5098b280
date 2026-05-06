import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Share2, Building2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShareRequests, formatSender, ShareRequest } from '@/hooks/useShareRequests';
import { toast } from '@/hooks/useToastMessage';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { useUserRole } from '@/hooks/useUserRole';

export function ShareRequestBanner() {
  const { incoming, acceptRequest, rejectRequest } = useShareRequests();
  const [expanded, setExpanded] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  // Show to anyone with pending incoming requests — RLS already ensures only eligible users see them
  if (incoming.length === 0) return null;

  const handleAccept = async (requestId: string, patientId: string) => {
    setProcessing(requestId);
    const ok = await acceptRequest(requestId, patientId);
    setProcessing(null);
    if (ok) toast.success('Páciens megosztás elfogadva! A páciens megjelenik a listában.');
    else toast.error('Hiba az elfogadáskor.');
  };

  const handleReject = async (requestId: string, patientId: string) => {
    setProcessing(requestId);
    const ok = await rejectRequest(requestId, patientId);
    setProcessing(null);
    if (ok) toast.info('Megosztási kérelem elutasítva.');
    else toast.error('Hiba az elutasításkor.');
  };

  const first = incoming[0];
  const hasMore = incoming.length > 1;

  return (
    <div className="flex flex-col gap-1.5 mb-4">
      <ShareRequestCard
        request={first}
        onAccept={handleAccept}
        onReject={handleReject}
        processing={processing}
      />

      {hasMore && (
        <>
          {expanded && incoming.slice(1).map(req => (
            <ShareRequestCard
              key={req.id}
              request={req}
              onAccept={handleAccept}
              onReject={handleReject}
              processing={processing}
            />
          ))}
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            {expanded
              ? <><ChevronUp className="h-3 w-3" /> Kevesebb</>
              : <><ChevronDown className="h-3 w-3" /> +{incoming.length - 1} további megosztási kérelem</>}
          </button>
        </>
      )}
    </div>
  );
}

function ShareRequestCard({
  request,
  onAccept,
  onReject,
  processing,
}: {
  request: ShareRequest;
  onAccept: (id: string, patientId: string) => void;
  onReject: (id: string, patientId: string) => void;
  processing: string | null;
}) {
  const isProcessing = processing === request.id;
  const senderLabel = formatSender(request);

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 rounded-lg border',
        'bg-background/70 backdrop-blur-xl',
        'border-violet-500/40 shadow-[0_0_12px_-4px_theme(colors.violet.500)]',
        'animate-in slide-in-from-top-2 fade-in duration-300'
      )}
    >
      <Share2 className="h-4 w-4 shrink-0 text-violet-400" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          <span className="text-violet-400 inline-flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" />
            {senderLabel}
          </span>
          {' '}meg szeretné osztani:{' '}
          <span className="text-foreground font-semibold">{request.patient_name}</span>
        </p>
        {request.message && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">„{request.message}"</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => onReject(request.id, request.patient_id)}
          disabled={isProcessing}
        >
          <X className="h-3.5 w-3.5 mr-1" /> Elutasít
        </Button>
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700"
          onClick={() => onAccept(request.id, request.patient_id)}
          disabled={isProcessing}
        >
          <Check className="h-3.5 w-3.5 mr-1" /> Elfogad
        </Button>
      </div>
    </div>
  );
}
