import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard } from 'lucide-react';

export default function Billing() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Számlázás</h1>
          <p className="text-muted-foreground mt-1">
            Előfizetés és számlázási információk
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Számlázás</h3>
            <p className="text-muted-foreground text-center max-w-sm mt-1">
              A számlázás funkció fejlesztés alatt áll.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
