import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Stethoscope, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';

interface Examination {
  id: string;
  created_at: string;
  chief_complaint: string | null;
  risk_level: string | null;
  patient: {
    first_name: string;
    last_name: string;
  }[] | null;
}

export default function ExaminationsList() {
  const { user } = useAuth();
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchExaminations() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('examinations')
          .select(`
            id,
            created_at,
            chief_complaint,
            risk_level,
            patient:patients(first_name, last_name)
          `)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setExaminations(data as Examination[] || []);
      } catch (error) {
        console.error('Error fetching examinations:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchExaminations();
  }, [user]);

  const getRiskBadgeColor = (risk: string | null) => {
    switch (risk) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Vizsgálatok</h1>
            <p className="text-muted-foreground mt-1">
              Fogorvosi vizsgálatok listája
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Új vizsgálat
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Betöltés...
          </div>
        ) : examinations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Stethoscope className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Nincs vizsgálat</h3>
              <p className="text-muted-foreground text-center max-w-sm mt-1">
                Még nincs vizsgálat rögzítve. Kattintson az "Új vizsgálat" gombra a kezdéshez.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {examinations.map((exam) => (
              <Card key={exam.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                      {exam.patient && exam.patient[0]
                        ? `${exam.patient[0].last_name} ${exam.patient[0].first_name}`
                        : 'Ismeretlen páciens'}
                    </CardTitle>
                    {exam.risk_level && (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskBadgeColor(exam.risk_level)}`}>
                        {exam.risk_level === 'high' ? 'Magas' : exam.risk_level === 'medium' ? 'Közepes' : 'Alacsony'} kockázat
                      </span>
                    )}
                  </div>
                  <CardDescription>
                    {format(new Date(exam.created_at), 'yyyy. MMMM d. HH:mm', { locale: hu })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {exam.chief_complaint || 'Nincs panasz megadva'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
