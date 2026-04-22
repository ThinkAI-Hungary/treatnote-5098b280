import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User, Phone, BriefcaseMedical } from 'lucide-react';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
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

  const leftColumnRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rightColumnRef.current || !leftColumnRef.current) return;
    
    // Sync the height of the left column to exactly match the right column dynamically
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (leftColumnRef.current) {
          leftColumnRef.current.style.height = `${entry.borderBoxSize[0].blockSize}px`;
        }
      }
    });

    ro.observe(rightColumnRef.current);
    return () => ro.disconnect();
  }, []);

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
    <div className="space-y-6 max-w-[1600px] w-full px-4 md:px-6 mx-auto animate-in fade-in duration-300 pb-16">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/patients')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {patient.titulus ? `${patient.titulus} ` : ''}{patient.vezeteknev} {patient.keresztnev}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Rögzítve: {format(new Date(patient.created_at), 'yyyy. MMMM d.', { locale: hu })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button 
              variant="destructive" 
              onClick={handleCleanUser}
              disabled={isCleaning}
            >
              {isCleaning ? 'Törlés folyamatban...' : 'Clean user'}
            </Button>
          )}
          <Button variant="outline" onClick={() => setIsEditing(true)}>Szerkesztés</Button>
          <Button>Új ellátás</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* COL 1: Voice History & Verdict (Left side) */}
        <div 
          className="lg:col-span-3 xl:col-span-3 flex flex-col gap-6 min-w-0 transition-all duration-300"
        >
          <div className="w-full h-full flex flex-col">
            <NativeVoiceJobHistory
              jobs={unifiedJobs as any}
              isLoading={unifiedLoading}
              selectedJobId={selectedNativeJobId}
              onSelectJob={(j) => setSelectedNativeJobId(j.id)}
              onJobTerminated={unifiedRefetch}
              className="flex-1"
            />
          </div>
        </div>

        <div className="lg:col-span-6 xl:col-span-6 flex flex-col gap-6">
          {/* Top row: Alapadatok and Elérhetőség side by side */}
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
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Phone className="w-5 h-5 text-primary" /> Elérhetőség
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2 flex-grow">
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground">Telefon:</span>
                  <span className="col-span-2 font-medium break-words">
                    {patient.telefon_1_hivoszam ? `+${patient.telefon_1_orszagkod} ${patient.telefon_1_korzet} ${patient.telefon_1_hivoszam}` : '-'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="col-span-2 font-medium break-all">{patient.kapcsolattarto_email || '-'}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground">Lakcím:</span>
                  <span className="col-span-2 font-medium break-words">
                    {patient.iranyitoszam} {patient.varos}, {patient.utca_hazszam}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom row: Gyors Anamnézis taking full width */}
          <Card className="w-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <BriefcaseMedical className="w-5 h-5 text-primary" /> Részletes Gyors Anamnézis
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {patient.anamnezis && Object.keys(patient.anamnezis).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Critical Info */}
                  <div className="space-y-1">
                    <h4 className="font-semibold text-muted-foreground mb-2 pb-1 border-b">Kritikus figyelmeztetések</h4>
                    {patient.anamnezis.gyogyszer_allergia === 'Igen' && (
                      <p className="text-destructive font-bold">• Gyógyszer allergia: {patient.anamnezis.gyogyszer_allergia_reszletek}</p>
                    )}
                    {patient.anamnezis.egyeb_allergia && (
                      <p className="text-destructive font-bold">• Egyéb allergia: {patient.anamnezis.egyeb_allergia}</p>
                    )}
                    {patient.anamnezis.verhigito === 'Igen' && (
                      <p className="text-destructive font-bold">• Vérhígítót szed</p>
                    )}
                    {patient.anamnezis.varandos_vagy_szoptat === 'Igen' && (
                      <p className="text-destructive font-bold">• Várandós / Szoptat</p>
                    )}
                    {patient.anamnezis.pacemaker === 'Igen' && (
                      <p className="text-destructive font-bold">• Pacemakerrel rendelkezik</p>
                    )}
                    {patient.anamnezis.gyogyszer_allergia !== 'Igen' && !patient.anamnezis.egyeb_allergia && patient.anamnezis.verhigito !== 'Igen' && patient.anamnezis.varandos_vagy_szoptat !== 'Igen' && patient.anamnezis.pacemaker !== 'Igen' && (
                      <p className="text-muted-foreground italic">Nincs kritikus bejegyzés.</p>
                    )}
                  </div>

                  {/* General Details */}
                  <div className="space-y-1">
                    <h4 className="font-semibold text-muted-foreground mb-2 pb-1 border-b">Fennálló egészségügyi állapotok</h4>
                    {patient.anamnezis.cukorbetegseg === 'Igen' && <p>• Cukorbetegség</p>}
                    {patient.anamnezis.magas_vernyomas === 'Igen' && <p>• Magas vérnyomás</p>}
                    {patient.anamnezis.alacsony_e_a_vernyomasa === 'Igen' && <p>• Alacsony vérnyomás</p>}
                    {patient.anamnezis.szivbetegseg === 'Igen' && <p>• Szívbetegség</p>}
                    {patient.anamnezis.pajzsmirigy === 'Igen' && <p>• Pajzsmirigy probléma</p>}
                    {patient.anamnezis.csontritkulas === 'Igen' && <p>• Csontritkulás</p>}
                    {patient.anamnezis.epilepszia === 'Igen' && <p>• Epilepszia</p>}
                    {patient.anamnezis.milyen_okkal_keresett_fel && <p>• Panasz: {patient.anamnezis.milyen_okkal_keresett_fel}</p>}
                    {patient.anamnezis.allando_gyogyszerek && (
                      <div className="mt-2 pt-2 border-t border-border/40">
                        <p><span className="font-semibold">Szedett gyógyszerek:</span> {patient.anamnezis.allando_gyogyszerek}</p>
                      </div>
                    )}
                    {!patient.anamnezis.cukorbetegseg && !patient.anamnezis.magas_vernyomas && !patient.anamnezis.szivbetegseg && !patient.anamnezis.allando_gyogyszerek && (
                       <p className="text-muted-foreground italic">Nincs egyéb alapbetegség rögzítve.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Nem áll rendelkezésre adat.</p>
              )}
            </CardContent>
          </Card>
          
          <div className="flex-1 flex flex-col min-h-[420px]">
            <PatientHistoryPanel patientId={patient.id} />
          </div>
        </div>

        {/* COL 3: Felvétel készítése panel (Right side) */}
        <div className="lg:col-span-3 xl:col-span-3 shrink-0 transition-all duration-300 flex flex-col h-full">
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

      {/* FULL WIDTH BOTTOM SECTION: Dental Chart */}
      <div className="w-full animate-in fade-in duration-500 delay-150 mt-8">
        <DentalChart patientId={patient.id} />
      </div>

      {/* FULL WIDTH BOTTOM SECTION: Verdikt Display (Előzmény részletei) */}
      {(selectedJob || selectedNativeJobId) && (
        <div key={selectedJob?.id || selectedNativeJobId} className="w-full animate-in fade-in slide-in-from-top-6 duration-300 mt-8">
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
