import { Layout } from '@/components/Layout';
import { DentalChart } from '@/components/dental/DentalChart';
import { ToothDetailPanel } from '@/components/dental/ToothDetailPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDentalStore } from '@/stores/dentalStore';
import { Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export default function DentalCharting() {
  const { isDirty, initializeTeeth } = useDentalStore();

  const handleSave = () => {
    // TODO: Implement save to database
    toast.success('Fogstátusz mentve');
  };

  const handleReset = () => {
    initializeTeeth();
    toast.info('Fogstátusz visszaállítva');
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Fogstátusz</h1>
            <p className="text-muted-foreground mt-1">
              FDI jelölésű interaktív fogstátusz diagram
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Visszaállítás
            </Button>
            <Button onClick={handleSave} disabled={!isDirty}>
              <Save className="mr-2 h-4 w-4" />
              Mentés
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DentalChart />
          </div>
          <div>
            <ToothDetailPanel />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Használati útmutató</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Fog kiválasztása:</strong> Kattintson bármelyik fogra a
              diagramon a részletek megtekintéséhez és szerkesztéséhez.
            </p>
            <p>
              <strong>Állapot módosítása:</strong> A jobb oldali panelen
              módosíthatja a kiválasztott fog állapotát, felületeit és egyéb
              tulajdonságait.
            </p>
            <p>
              <strong>Felületek:</strong> Kattintson a felület gombokra (M, D, O,
              B, L) az állapotok közötti váltáshoz.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
