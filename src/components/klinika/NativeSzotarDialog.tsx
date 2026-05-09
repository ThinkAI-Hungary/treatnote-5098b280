import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { KezelesiTetelekTab } from './KezelesiTetelekTab';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NativeSzotarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telephelyId: string | null;
  onSaved: () => void;
}

export function NativeSzotarDialog({ open, onOpenChange, telephelyId, onSaved }: NativeSzotarDialogProps) {
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 flex flex-col overflow-hidden bg-background">
        <ScrollArea className="flex-1 w-full h-full p-6">
          <div className="mb-8">
            <h2 className="text-2xl font-bold">Kezelési Tételek Beállítása</h2>
            <p className="text-muted-foreground">Kezelje a klinika egyedi tételeit, vagy töltsön fel újakat.</p>
          </div>
          
          {telephelyId && (
            <KezelesiTetelekTab telephelyId={telephelyId} />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
