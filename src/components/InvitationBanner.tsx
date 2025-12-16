import { useInvitations } from '@/hooks/useInvitations';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mail, Check, X, Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';

export function InvitationBanner() {
  const { invitations, loading, responding, respondToInvitation, hasInvitations } = useInvitations();

  const handleRespond = async (invitationId: string, response: 'accepted' | 'declined') => {
    try {
      await respondToInvitation(invitationId, response);
      if (response === 'accepted') {
        toast.success('Meghívás elfogadva! Üdvözlünk az organizációban.');
        // Reload page to update user profile
        window.location.reload();
      } else {
        toast.info('Meghívás elutasítva');
      }
    } catch (error: any) {
      toast.error(error.message || 'Hiba történt');
    }
  };

  if (loading || !hasInvitations) {
    return null;
  }

  return (
    <div className="space-y-3 mb-6">
      {invitations.map((invitation) => (
        <Card key={invitation.id} className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}