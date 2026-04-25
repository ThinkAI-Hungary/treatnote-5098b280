import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User, Phone, BriefcaseMedical } from 'lucide-react';
import { format } from 'date-fns';

import { NewPatientWizard } from '@/components/patients/NewPatientWizard';
import { DentalChart } from '@/components/patients/dental-chart';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

// Voice Imports
import { useProfile } from '@/hooks/useProfile';
import { useUnifiedVoiceHistory } from '@/hooks/useUnifiedVoiceHistory';
import { NativeVoiceJobHistory } from '@/components/voice/NativeVoiceJobHistory';
import { NativeVoiceRecordingPanel } from '@/components/voice/NativeVoiceRecordingPanel';
import { VerdiktDisplay } from '@/components/voice/VerdiktDisplay';
import { VoxisReviewPanel } from '@/components/patients/dental-chart/VoxisReviewPanel';
import VoiceRecording from '@/pages/VoiceRecording';
import { isVoxisJob } from '@/lib/voxisUtils';
import { PatientHistoryPanel } from '@/components/patients/history/PatientHistoryPanel';
import { TreatmentPlanEditor } from '@/components/patients/treatment-plan/TreatmentPlanEditor';

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const { isAdmin } = useUserRole();

  // Voice State
  const { profile } = useProfile();
  const pref = profile?.voice_recording_preference || 'treatnote_native';
  const { jobs: unifiedJobs, isLoading: unifiedLoading, refetch: unifiedRefetch } = useUnifiedVoiceHistory(id || '');
  const [selectedNativeJobId, setSelectedNativeJobId] = useState<string | null>(null);
  const selectedJob = selectedNativeJobId ? unifiedJobs?.find(j => j.id === selectedNativeJobId) : null;



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
      // Reload page to refresh the dental chart
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
    <div className="space-y-4 max-w-[1600px] w-full px-4 md:px-6 mx-auto animate-in fade-in duration-300 pb-16">
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
              <span className="text-destructive font-bold text-xs uppercase tracking-wider">⚠ Figyelem:</span>
              {warnings.map((w, i) => (
                <span key={i} className="text-destructive text-sm font-medium">• {w}</span>
              ))}
            </div>
          );
        })()
      )}

      {/* ── SECTION 1: DENTAL CHART (first view, full width) ── */}
      <div className="w-full">
        <DentalChart patientId={patient.id} />
      </div>

      {/* ── SECTION 1b: TREATMENT PLAN EDITOR ── */}
      <div className="w-full">
        <TreatmentPlanEditor patientId={patient.id} />
      </div>

      {/* ── SECTION 2: Voice + Patient Details Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT: Voice History */}
        <div className="lg:col-span-3 flex flex-col">
          <NativeVoiceJobHistory
            jobs={unifiedJobs as any}
            isLoading={unifiedLoading}
            selectedJobId={selectedNativeJobId}
            onSelectJob={(j) => setSelectedNativeJobId(j.id)}
            onJobTerminated={unifiedRefetch}
            className="flex-1"
          />
        </div>

        {/* CENTER: Patient Info + History */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          {/* Compact patient details in a collapsible/accordion style */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" /> Alapadatok
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2 flex-grow">
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground">Született:</span>
                  <span className="col-span-2 font-medium">{patient.szuletesi_ido ? format(new Date(patient.szuletesi_ido), 'yyyy. MM. dd.') : '-'}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground">Anyja neve:</span>
                  <span className="col-span-2 font-medium">{patient.anyja_neve || '-'}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground">TAJ szám:</span>
                  <span className="col-span-2 font-medium">{patient.taj_szam || '-'}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground">Nem:</span>
                  <span className="col-span-2 font-medium">{patient.neme || '-'}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground">Lakcím:</span>
                  <span className="col-span-2 font-medium break-words">
                    {patient.iranyitoszam} {patient.varos}, {patient.utca_hazszam}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BriefcaseMedical className="w-5 h-5 text-primary" /> Anamnézis
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1 flex-grow">
                {patient.anamnezis && Object.keys(patient.anamnezis).length > 0 ? (
                  <>
                    {patient.anamnezis.cukorbetegseg === 'Igen' && <p>• Cukorbetegség</p>}
                    {patient.anamnezis.magas_vernyomas === 'Igen' && <p>• Magas vérnyomás</p>}
                    {patient.anamnezis.alacsony_e_a_vernyomasa === 'Igen' && <p>• Alacsony vérnyomás</p>}
                    {patient.anamnezis.szivbetegseg === 'Igen' && <p>• Szívbetegség</p>}
                    {patient.anamnezis.pajzsmirigy === 'Igen' && <p>• Pajzsmirigy</p>}
                    {patient.anamnezis.csontritkulas === 'Igen' && <p>• Csontritkulás</p>}
                    {patient.anamnezis.epilepszia === 'Igen' && <p>• Epilepszia</p>}
                    {patient.anamnezis.milyen_okkal_keresett_fel && <p>• Panasz: {patient.anamnezis.milyen_okkal_keresett_fel}</p>}
                    {patient.anamnezis.allando_gyogyszerek && (
                      <p className="pt-1 border-t mt-1"><span className="font-semibold">Gyógyszerek:</span> {patient.anamnezis.allando_gyogyszerek}</p>
                    )}
                    {!patient.anamnezis.cukorbetegseg && !patient.anamnezis.magas_vernyomas && !patient.anamnezis.szivbetegseg && !patient.anamnezis.allando_gyogyszerek && (
                      <p className="text-muted-foreground italic">Nincs bejegyzés.</p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground italic">Nem áll rendelkezésre adat.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Patient Treatment History */}
          <div className="flex-1 flex flex-col min-h-[420px]">
            <PatientHistoryPanel patientId={patient.id} />
          </div>
        </div>

        {/* RIGHT: Voice Recording */}
        <div className="lg:col-span-3 flex flex-col">
          <NativeVoiceRecordingPanel 
            treatnotePatientId={patient.id}
            isFlexi={pref === 'flexident'}
            flexiPatientId={patient.flexident_id}
            onJobStarted={(jobId) => {
              setSelectedNativeJobId(jobId);
              unifiedRefetch();
            }}
            onJobComplete={(jobId, result) => {
              setSelectedNativeJobId(jobId);
              unifiedRefetch();
            }}
            className="flex-1"
          />
        </div>
      </div>

      {/* ── SECTION 3: Verdikt Display (full width, conditional) ── */}
      {(selectedJob || selectedNativeJobId) && (
        <div key={selectedJob?.id || selectedNativeJobId} className="w-full animate-in fade-in slide-in-from-top-6 duration-300">
          <VerdiktDisplay
            isLoading={selectedJob ? selectedJob.status === 'processing' : true}
            responseData={selectedJob?.result}
            isSelectedJob={true}
            selectedJobMode={selectedJob?.mode}
            selectedJobPaciensId={selectedJob?.treatnote_patient_id || id}
            selectedJobError={selectedJob?.error}
            selectedJobStatus={selectedJob?.status || 'processing'}
            jobId={selectedJob?.id || selectedNativeJobId!}
            userComplaint={selectedJob?.complaint}
            progressPercent={(selectedJob as any)?.progress_percent || 0}
            progressMessage={(selectedJob as any)?.progress_message || "Inicializálás..."}
            rawAudioText={(selectedJob as any)?.raw_audio_text}
            claudeCleanedText={(selectedJob as any)?.claude_cleaned_text}
            onComplaintSubmitted={unifiedRefetch}
            onClose={() => setSelectedNativeJobId(null)}
            onTerminate={async () => {
              const targetJob = selectedJob || { id: selectedNativeJobId, isFlexi: false };
              const table = targetJob.isFlexi ? 'voice_jobs' : 'native_voice_jobs';
              const { error } = await supabase
                .from(table)
                .update({ status: 'error', error: 'Megszakítva felhasználó által', completed_at: new Date().toISOString() })
                .eq('id', targetJob.id);
              if (error) {
                toast.error('Hiba a megszakítás során!');
              } else {
                toast.info('Feldolgozás megszakítva.');
                unifiedRefetch();
              }
            }}
            voxisReviewPanelNode={
              isVoxisJob(selectedJob?.mode, selectedJob?.result) && selectedJob?.status === 'completed' && selectedJob?.result ? (
                <VoxisReviewPanel 
                  jobId={selectedJob.id}
                  patientId={id!}
                  resultJson={typeof selectedJob.result === 'string' ? JSON.parse(selectedJob.result) : selectedJob.result}
                  isNewest={(unifiedJobs?.filter(j => isVoxisJob(j.mode, j.result) && j.status === 'completed')?.[0]?.id || '') === selectedJob.id}
                />
              ) : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
