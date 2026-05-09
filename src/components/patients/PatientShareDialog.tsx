import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { Loader2, Share2, Building2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';

interface PatientShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: {
    id: string;
    titulus?: string;
    vezeteknev: string;
    keresztnev: string;
    telephely_ids?: string[];
  };
}

export function PatientShareDialog({ open, onOpenChange, patient }: PatientShareDialogProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [shareCode, setShareCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [targetName, setTargetName] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetCompanyName, setTargetCompanyName] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const activeTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id;

  const handleCodeChange = async (value: string) => {
    const upper = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 64);
    setShareCode(upper);
    setTargetName(null);
    setTargetId(null);
    setTargetCompanyName(null);

    if (upper.length === 64) {
      setLookupLoading(true);
      const { data } = await supabase
        .from('telephely')
        .select('id, name, display_name, company_id')
        .eq('share_code', upper)
        .single();
      setLookupLoading(false);

      if (data) {
        if (data.id === activeTelephelyId) {
          toast.error('Ez a saját telephelyed kódja.');
          return;
        }
        if (patient.telephely_ids?.includes(data.id)) {
          toast.error('A páciens már meg van osztva ezzel a telephely-lyal.');
          return;
        }
        // Fetch company name
        let companyName: string | null = null;
        if (data.company_id) {
          const { data: comp } = await supabase
            .from('companies')
            .select('display_name')
            .eq('id', data.company_id)
            .single();
          companyName = comp?.display_name || null;
        }
        setTargetId(data.id);
        setTargetName(data.display_name || data.name);
        setTargetCompanyName(companyName);
      } else {
        toast.error('Nem található telephely ezzel a kóddal.');
      }
    }
  };

  const handleSubmit = async () => {
    if (!targetId || !user || !activeTelephelyId) return;
    setLoading(true);

    try {
      // Fetch sender's telephely and company name for the snapshot
      let fromTelephelyName: string | null = null;
      let fromCompanyName: string | null = null;
      const { data: fromT } = await supabase
        .from('telephely')
        .select('name, display_name, company_id')
        .eq('id', activeTelephelyId)
        .single();
      if (fromT) {
        fromTelephelyName = fromT.display_name || fromT.name || null;
        if (fromT.company_id) {
          const { data: comp } = await supabase
            .from('companies')
            .select('display_name, name')
            .eq('id', fromT.company_id)
            .single();
          fromCompanyName = comp?.display_name || comp?.name || null;
        }
      }

      const patientFullName = [patient.titulus, patient.vezeteknev, patient.keresztnev].filter(Boolean).join(' ');

      // 1. Insert share request with snapshots
      const { data: req, error: reqError } = await supabase
        .from('patient_share_requests')
        .insert({
          patient_id: patient.id,
          from_telephely_id: activeTelephelyId,
          to_telephely_id: targetId,
          requested_by: user.id,
          message: message.trim() || null,
          status: 'pending',
          patient_name_snapshot: patientFullName,
          from_telephely_name_snapshot: fromTelephelyName,
          from_company_name_snapshot: fromCompanyName,
        })
        .select('id')
        .single();

      if (reqError) throw reqError;

      // 2. Log entry
      await supabase.from('patient_share_log').insert({
        patient_id: patient.id,
        from_telephely_id: activeTelephelyId,
        to_telephely_id: targetId,
        action: 'share_requested',
        performed_by: user.id,
        request_id: req.id,
        message: message.trim() || null,
      });

      toast.success(`Megosztási kérelem elküldve: ${targetName}`);
      onOpenChange(false);
      setShareCode('');
      setMessage('');
      setTargetName(null);
      setTargetId(null);
    } catch (err: any) {
      console.error('Share request error:', err);
      toast.error('Hiba a megosztási kérelem küldésekor: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const patientName = [patient.titulus, patient.vezeteknev, patient.keresztnev].filter(Boolean).join(' ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            <DialogTitle>Páciens megosztása</DialogTitle>
          </div>
          <DialogDescription>
            <span className="font-semibold text-foreground">{patientName}</span> megosztása egy másik telephellyel.
            A cél telephely klinika adminjai értesítést kapnak és elfogadhatják a kérelmet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="share-code">Cél telephely kódja</Label>
            <div className="relative">
              <Input
                id="share-code"
                placeholder="64 karakteres megosztási kód..."
                value={shareCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                className="font-mono text-xs tracking-wider uppercase"
                maxLength={64}
              />
              {lookupLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {targetName && (
              <div className="px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Cég:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {targetCompanyName || '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-emerald-500 opacity-0" />
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Telephely:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {targetName}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="share-message">Megjegyzés (opcionális)</Label>
            <Textarea
              id="share-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Mégse
          </Button>
          <Button
            onClick={handleSubmit}
          disabled={!targetId || shareCode.length !== 64 || loading}
            className="gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Kérelem küldése
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
