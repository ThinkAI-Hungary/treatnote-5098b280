import { useParams, useNavigate, Outlet, useLocation, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Phone, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

import { NewPatientWizard } from '@/components/patients/NewPatientWizard';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const { isAdmin } = useUserRole();

  async function fetchPatient() {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('patient_alap_adatok')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      setPatient(data);
    } catch (err) {
      console.error('Error fetching patient', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPatient();
  }, [id]);

  async function handleCleanUser() {
    if (!id) return;
    if (!window.confirm('Biztosan törölni szeretné a páciens összes fogstátuszát? Ez a művelet nem vonható vissza, de a kezelési napló megmarad.')) {
      return;
    }

    setIsCleaning(true);
    try {
      const { error } = await supabase
        .from('dental_chart')
        .delete()
        .eq('patient_id', id);

      if (error) throw error;
      
      toast.success('Páciens fogstátusza sikeresen alaphelyzetbe állítva (törölve).');
      window.location.reload();
    } catch (err: any) {
      console.error('Hiba a fogstátusz törlésekor:', err);
      toast.error('Hiba történt a törlés során: ' + err.message);
    } finally {
      setIsCleaning(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Adatok betöltése...</div>;
  }

  if (!patient) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold mb-4">Páciens nem található</h2>
        <Button onClick={() => navigate('/patients')}>Vissza a páciensekhez</Button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="space-y-6 pt-2">
        <NewPatientWizard 
          existingPatient={patient}
          onCancel={() => setIsEditing(false)}
          onSuccess={() => {
            setIsEditing(false);
            fetchPatient();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] w-full px-4 md:px-6 mx-auto animate-in fade-in duration-300 pb-16">
      {/* ── TOP BAR: Patient name + quick info + actions ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/patients')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {patient.titulus ? `${patient.titulus} ` : ''}{patient.vezeteknev} {patient.keresztnev}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-0.5">
              {patient.szuletesi_ido && (
                <span>Szül.: {format(new Date(patient.szuletesi_ido), 'yyyy. MM. dd.')}</span>
              )}
              {patient.taj_szam && <span>TAJ: {patient.taj_szam}</span>}
              {patient.telefon_1_hivoszam && (
                <span>
                  <Phone className="w-3 h-3 inline mr-1" />
                  +{patient.telefon_1_orszagkod} {patient.telefon_1_korzet} {patient.telefon_1_hivoszam}
                </span>
              )}
              {patient.kapcsolattarto_email && (
                <span className="break-all">{patient.kapcsolattarto_email}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {isAdmin && (
            <Button 
              variant="destructive" 
              size="sm"
              onClick={handleCleanUser}
              disabled={isCleaning}
            >
              {isCleaning ? 'Törlés...' : 'Clean user'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>Szerkesztés</Button>
          <Button size="sm">Új ellátás</Button>
        </div>
      </div>

      {/* ── CRITICAL ALERTS BAR (anamnézis warnings, inline) ── */}
      {patient.anamnezis && (
        (() => {
          const warnings: string[] = [];
          if (patient.anamnezis.gyogyszer_allergia === 'Igen') warnings.push(`Gyógyszer allergia: ${patient.anamnezis.gyogyszer_allergia_reszletek || 'Igen'}`);
          if (patient.anamnezis.egyeb_allergia) warnings.push(`Allergia: ${patient.anamnezis.egyeb_allergia}`);
          if (patient.anamnezis.verhigito === 'Igen') warnings.push('Vérhígítót szed');
          if (patient.anamnezis.varandos_vagy_szoptat === 'Igen') warnings.push('Várandós / Szoptat');
          if (patient.anamnezis.pacemaker === 'Igen') warnings.push('Pacemaker');
          
          if (warnings.length === 0) return null;
          return (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-destructive font-bold text-xs uppercase tracking-wider flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Figyelem:</span>
              {warnings.map((w, i) => (
                <span key={i} className="text-destructive text-sm font-medium">• {w}</span>
              ))}
            </div>
          );
        })()
      )}

      {/* ── CONTENT AREA ── */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-56 shrink-0 flex flex-col gap-2">
          <Button
            variant={location.pathname === `/patients/${patient.id}` ? "default" : "ghost"}
            className="justify-start"
            asChild
          >
            <Link to={`/patients/${patient.id}`}>Áttekintés</Link>
          </Button>
          <Button
            variant={location.pathname === `/patients/${patient.id}/status` ? "default" : "ghost"}
            className="justify-start"
            asChild
          >
            <Link to={`/patients/${patient.id}/status`}>Státuszkezelés</Link>
          </Button>
          <Button
            variant={location.pathname === `/patients/${patient.id}/treatment-plan` ? "default" : "ghost"}
            className="justify-start"
            asChild
          >
            <Link to={`/patients/${patient.id}/treatment-plan`}>Kezelési terv</Link>
          </Button>
          <Button
            variant={location.pathname === `/patients/${patient.id}/ambulatory-chart` ? "default" : "ghost"}
            className="justify-start"
            asChild
          >
            <Link to={`/patients/${patient.id}/ambulatory-chart`}>Ambuláns lap</Link>
          </Button>
        </div>

        {/* Right Outlet */}
        <div className="flex-1 min-w-0">
          <Outlet context={{ patient }} />
        </div>
      </div>
    </div>
  );
}
