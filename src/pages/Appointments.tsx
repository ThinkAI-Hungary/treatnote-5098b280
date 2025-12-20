import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

export default function Appointments() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Időpontok</h1>
        <p className="text-muted-foreground mt-1">
          Időpontok kezelése és foglalás
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">Időpont naptár</h3>
          <p className="text-muted-foreground text-center max-w-sm mt-1">
            Az időpont naptár funkció fejlesztés alatt áll.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
