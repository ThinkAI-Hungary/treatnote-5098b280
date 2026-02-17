import { useState } from 'react';
import { useInvitations } from '@/hooks/useInvitations';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mail, Check, X, Loader2, Building2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { notifyMembershipChanged } from '@/lib/telephelyEvents';
import { useNotifications } from '@/hooks/useNotifications';

export function InvitationBanner() {
  const { invitations, loading, responding, respondToInvitation, hasInvitations } = useInvitations();
  const { addNotification } = useNotifications();
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const handleRespond = async (invitationId: string, response: 'accepted' | 'declined') => {
    try {
      await respondToInvitation(invitationId, response);
      if (response === 'accepted') {
        toast.success('Meghívás elfogadva! Csatlakozás folyamatban...');
        addNotification('telephely', 'Új telephely csatlakoztatása folyamatban...');

        // Show connecting state for this invitation
        setConnectingId(invitationId);

        // Notify AppSidebar to start polling for the new membership
        notifyMembershipChanged();

        // After a short delay, hide the connecting state (sidebar will handle the rest)
        setTimeout(() => {
          setConnectingId(null);
        }, 5000);
      } else {
        toast.info('Meghívás elutasítva');
      }
    } catch (error: any) {
      toast.error(error.message || 'Hiba történt');
      setConnectingId(null);
    }
  };

  if (loading || !hasInvitations) {
    // Still show the connecting banner if we just accepted
    if (connectingId) {
      return (
        <div className="space-y-3 mb-6">
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-500/10 p-2">
                  <RefreshCw className="h-5 w-5 text-emerald-400 animate-spin" />
                </div>
                <div>
                  <h4 className="font-medium text-emerald-400">Csatlakozás folyamatban...</h4>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Az új telephely hamarosan megjelenik az oldalsávban.
                  </p>
                </div>
              </div>
              {/* Progress shimmer */}
              <div className="mt-3 h-1 rounded-full overflow-hidden bg-emerald-500/10">
                <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-emerald-500 via-primary to-emerald-500 animate-[shimmer_1.5s_ease-in-out_infinite]" />
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-3 mb-6">
      {invitations.map((invitation) => (
        <Card key={invitation.id} className={connectingId === invitation.id ? "border-emerald-500/30 bg-emerald-500/5" : "border-primary/30 bg-primary/5"}>
          <CardContent className="p-4">
            {connectingId === invitation.id ? (
              // Connecting state
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-500/10 p-2">
                  <RefreshCw className="h-5 w-5 text-emerald-400 animate-spin" />
                </div>
                <div>
                  <h4 className="font-medium text-emerald-400">Csatlakozás folyamatban...</h4>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Csatlakozás a(z) <span className="font-medium">{invitation.company_name} - {invitation.telephely_name}</span> szervezethez. Az új telephely hamarosan megjelenik.
                  </p>
                </div>
              </div>
            ) : (
              // Normal invitation state
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">Meghívás érkezett</h4>
                      <Badge variant="outline" className="text-xs">
                        {format(new Date(invitation.created_at), 'MMM d.', { locale: hu })}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium">{invitation.invited_by_name}</span> meghívott a következő organizációba:
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{invitation.company_name}</span>
                      <span className="text-muted-foreground">-</span>
                      <span>{invitation.telephely_name}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRespond(invitation.id, 'declined')}
                    disabled={responding === invitation.id}
                  >
                    {responding === invitation.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    <span className="ml-1 hidden sm:inline">Elutasít</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleRespond(invitation.id, 'accepted')}
                    disabled={responding === invitation.id}
                  >
                    {responding === invitation.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    <span className="ml-1 hidden sm:inline">Elfogad</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Progress shimmer for connecting state */}
            {connectingId === invitation.id && (
              <div className="mt-3 h-1 rounded-full overflow-hidden bg-emerald-500/10">
                <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-emerald-500 via-primary to-emerald-500 animate-[shimmer_1.5s_ease-in-out_infinite]" />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}