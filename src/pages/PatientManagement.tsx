import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, Plus, Search, Phone, Mail, MapPin } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { NewPatientWizard } from '@/components/patients/NewPatientWizard';

// We do not have auto-generated types yet, so defining manually for now
type Patient = any;

export default function PatientManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  async function fetchPatients() {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('patient_alap_adatok')
        .select('*')
        .order('vezeteknev', { ascending: true })
        .order('keresztnev', { ascending: true });

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPatients();
  }, [user]);

  const filteredPatients = patients.filter((patient) => {
    if (!searchQuery.trim()) return true;

    const pieces = [
      patient.titulus,
      patient.vezeteknev,
      patient.keresztnev,
      patient.szuletesi_vezeteknev,
      patient.szuletesi_keresztnev,
      patient.anyja_neve,
      patient.szuletesi_hely,
      patient.szuletesi_ido,
      patient.taj_szam,
      patient.iranyitoszam,
      patient.varos,
      patient.utca_hazszam,
      patient.kapcsolattarto_email,
      patient.telefon_1_orszagkod,
      patient.telefon_1_korzet,
      patient.telefon_1_hivoszam,
    ];

    let blob = pieces.filter(Boolean).map(p => String(p).toLowerCase()).join(' ');

    if (patient.telefon_1_orszagkod === '36' || patient.telefon_1_orszagkod === '+36') {
      blob += ' 06';
    }

    const searchTerms = searchQuery.toLowerCase().trim().split(/\s+/);
    return searchTerms.every(term => blob.includes(term));
  });

  if (isCreating) {
    return (
      <div className="space-y-6">
        <NewPatientWizard onCancel={() => setIsCreating(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-galaxy-header p-6 border border-primary/20 dark:border-sparkle-blue/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-[hsl(268_42%_72%)] via-[hsl(263_28%_80%)] to-[hsl(255_13%_88%)] dark:from-primary dark:to-accent flex items-center justify-center glow-purple">
                <Users className="h-7 w-7 text-primary-foreground" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-[hsl(268_52%_50%)] via-[hsl(263_32%_65%)] to-[hsl(255_18%_74%)] dark:from-primary dark:via-primary/60 dark:to-accent bg-clip-text text-transparent">
                Páciensek
              </h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Páciensek kezelése és nyilvántartása
              </p>
            </div>
          </div>
          <Button onClick={() => setIsCreating(true)} className="shrink-0 z-10 relative">
            <Plus className="mr-2 h-4 w-4" />
            Új páciens
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Keresés név, telefon, TAJ, település..."
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
        <div className="flex flex-col gap-3">
          {filteredPatients.map((patient) => (
            <Card
              key={patient.id}
              className="cursor-pointer hover:shadow-md transition-all hover:border-primary/50 group bg-gradient-to-r from-primary/5 to-transparent dark:from-primary/10 dark:to-transparent"
              onClick={() => navigate(`/patients/${patient.id}`)}
            >
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Column 1: Important IDs & Name */}
                <div className="flex-[1.5]">
                  <h3 className="text-lg font-semibold text-primary group-hover:text-primary/80 transition-colors">
                    {patient.titulus ? `${patient.titulus} ` : ''}{patient.vezeteknev} {patient.keresztnev}
                  </h3>
                  <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {patient.szuletesi_ido && (
                      <span className="flex items-center gap-1 font-medium">
                        Szül: {format(new Date(patient.szuletesi_ido), 'yyyy. MM. dd.')}
                      </span>
                    )}
                    {patient.szuletesi_ido && patient.taj_szam && (
                      <span className="text-border">|</span>
                    )}
                    {patient.taj_szam && (
                      <span className="flex items-center gap-1 font-medium">
                        TAJ: {String(patient.taj_szam).replace(/(.{3})/g, '$1 ').trim()}
                      </span>
                    )}
                    {patient.neme && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded-full">
                        {patient.neme}
                      </span>
                    )}
                  </div>
                </div>

                {/* Column 2: Contact */}
                <div className="flex-1 text-sm text-muted-foreground space-y-1.5">
                  {patient.telefon_1_hivoszam && (
                    <div className="flex items-center">
                      <Phone className="w-3.5 h-3.5 mr-2 text-primary/70" />
                      +{patient.telefon_1_orszagkod} {patient.telefon_1_korzet} {patient.telefon_1_hivoszam}
                    </div>
                  )}
                  {patient.kapcsolattarto_email && (
                    <div className="flex items-center truncate max-w-[200px]" title={patient.kapcsolattarto_email}>
                      <Mail className="w-3.5 h-3.5 mr-2 text-primary/70 shrink-0" />
                      <span className="truncate">{patient.kapcsolattarto_email}</span>
                    </div>
                  )}
                </div>

                {/* Column 3: Address & Tags */}
                <div className="flex-1 text-sm text-muted-foreground md:text-right flex flex-col md:items-end justify-center">
                  {patient.varos && (
                    <div className="flex items-center text-left md:text-right">
                      <MapPin className="w-3.5 h-3.5 mr-2 text-primary/70 md:hidden shrink-0" />
                      <span className="truncate max-w-[250px]">
                        {patient.iranyitoszam} {patient.varos}, {patient.utca_hazszam}
                      </span>
                    </div>
                  )}

                  {/* Anamnesis quick-flag */}
                  {patient.anamnezis && (patient.anamnezis.gyogyszer_allergia === 'Igen' || patient.anamnezis.cukorbetegseg === 'Igen' || patient.anamnezis.verhigito === 'Igen') && (
                    <div className="mt-2 md:mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
                      Kiemelt kockázat
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
