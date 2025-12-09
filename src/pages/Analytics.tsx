import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export default function Analytics() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analitika</h1>
          <p className="text-muted-foreground mt-1">
            Statisztikák és jelentések
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Analitika</h3>
            <p className="text-muted-foreground text-center max-w-sm mt-1">
              Az analitika funkció fejlesztés alatt áll.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
