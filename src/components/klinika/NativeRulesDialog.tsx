import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { NativeKezelesiSzabalyokTab } from './NativeKezelesiSzabalyokTab';
import { useKlinikaData } from '@/hooks/useKlinikaData';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NativeRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telephelyId: string | null;
  onSaved: () => void;
}

export function NativeRulesDialog({ open, onOpenChange, telephelyId, onSaved }: NativeRulesDialogProps) {
  const { companyId, companyName, telephelyName } = useKlinikaData();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 flex flex-col overflow-hidden bg-background">
        <ScrollArea className="flex-1 w-full h-full p-6">
          <div className="mb-8">
            <h2 className="text-2xl font-bold">Kezelési Szabályok Beállítása</h2>
            <p className="text-muted-foreground">Kezelje a klinika egyedi szabályait, vagy töltsön fel újakat.</p>
          </div>
          
          <NativeKezelesiSzabalyokTab 
            companyId={companyId} 
            telephelyId={telephelyId} 
            companyName={companyName} 
            telephelyName={telephelyName} 
          />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
