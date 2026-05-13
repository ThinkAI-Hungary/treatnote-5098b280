import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { V2MappingTab } from './V2MappingTab';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telephelyId: string | null;
  isStdl: boolean;
}

export function MappingDialog({ open, onOpenChange, telephelyId, isStdl }: MappingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 flex flex-col overflow-hidden bg-background">
        <ScrollArea className="flex-1 w-full h-full p-6">
          <div className="mb-8">
            <h2 className="text-2xl font-bold">Mappingek Ellenőrzése</h2>
            <p className="text-muted-foreground">
              Ellenőrizze és hagyja jóvá a mesterséges intelligencia által automatikusan létrehozott összerendeléseket.
            </p>
          </div>
          
          {telephelyId && (
            <V2MappingTab 
              telephelyId={telephelyId} 
              isStdl={isStdl}
            />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
