import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, Plus, Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';

type Patient = Tables<'patients'>;

export default function PatientManagement() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchPatients() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('patients')
          .select('*')
          .order('last_name', { ascending: true });

        if (error) throw error;
        setPatients(data || []);
      } catch (error) {
        console.error('Error fetching patients:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchPatients();
  }, [user]);

  const filteredPatients = patients.filter((patient) => {
    const fullName = `${patient.first_name} ${patient.last_name}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Páciensek</h1>
            <p className="text-muted-foreground mt-1">
              Páciensek kezelése és nyilvántartása
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Új páciens
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Keresés név alapján..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Betöltés...
          </div>
        ) : filteredPatients.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Nincs páciens</h3>
              <p className="text-muted-foreground text-center max-w-sm mt-1">
                {searchQuery
                  ? 'Nincs találat a keresésre.'
                  : 'Még nincs páciens rögzítve. Kattintson az "Új páciens" gombra a felvételhez.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredPatients.map((patient) => (
              <Card key={patient.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">
                    {patient.last_name} {patient.first_name}
                  </CardTitle>
                  <CardDescription>
                    Született: {format(new Date(patient.date_of_birth), 'yyyy. MMMM d.', { locale: hu })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    {patient.phone && (
                      <div className="text-muted-foreground">
                        Tel: {patient.phone}
                      </div>
                    )}
                    {patient.email && (
                      <div className="text-muted-foreground">
                        Email: {patient.email}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
