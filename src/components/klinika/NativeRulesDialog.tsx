import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUp, Pencil, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface NativeRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telephelyId: string | null;
  onSaved: () => void;
}

export function NativeRulesDialog({ open, onOpenChange, telephelyId, onSaved }: NativeRulesDialogProps) {
  const [manualText, setManualText] = useState('');
  
  const handleSave = () => {
    // Fake save for now
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Natív Szabályok beállítása</DialogTitle>
          <DialogDescription>
            Adja meg a kezelési szabályokat. Ezt megteheti fájl feltöltésével vagy kézi szerkesztéssel.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="default" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            A feltöltött adatok feldolgozása egyelőre nem elérhető. Kérjük térjen vissza később!
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="upload" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <FileUp className="h-4 w-4" />
              Fájl feltöltése
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Kézi szerkesztés
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="upload" className="mt-4 space-y-4">
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-10 flex flex-col items-center justify-center text-center hover:bg-muted/50 transition-colors cursor-pointer">
              <FileUp className="h-10 w-10 text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">Húzza ide a fájlt</h3>
              <p className="text-sm text-muted-foreground">vagy kattintson a tallózáshoz</p>
              <p className="text-xs text-muted-foreground mt-4">Támogatott formátumok: JSON, XML, PDF</p>
            </div>
          </TabsContent>
          
          <TabsContent value="manual" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Szabály definíciók (JSON formátumban)</Label>
              <Textarea 
                placeholder="Például:&#10;[&#10;  {&#10;    &quot;name&quot;: &quot;Tömés szabály&quot;,&#10;    &quot;trigger&quot;: &quot;tömés&quot;&#10;  }&#10;]"
                className="min-h-[200px] font-mono text-sm"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Mégse
          </Button>
          <Button onClick={handleSave} disabled={true}>
            Mentés
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
