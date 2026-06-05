import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { DentalChart, clearDentalChartCache } from '@/components/patients/dental-chart';
import { NativeVoiceRecordingPanel } from '@/components/voice/NativeVoiceRecordingPanel';
import { VerdiktDisplay } from '@/components/voice/VerdiktDisplay';
import { VoxisReviewPanel } from '@/components/patients/dental-chart/VoxisReviewPanel';
import { useUnifiedVoiceHistory } from '@/hooks/useUnifiedVoiceHistory';
import { isVoxisJob } from '@/lib/voxisUtils';
import { toast } from '@/hooks/useToastMessage';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, LogOut } from 'lucide-react';

const ZOLI_PATIENT_ID = '79f33d18-42a6-45ac-8f0d-d6dfacd0fca9';

export default function ZoliChartPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<any>(null);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedNativeJobId, setSelectedNativeJobId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Hook for unified voice history
  const { jobs: unifiedJobs, refetch: unifiedRefetch } = useUnifiedVoiceHistory(ZOLI_PATIENT_ID);

  const selectedJob = selectedNativeJobId ? unifiedJobs.find(j => j.id === selectedNativeJobId) : null;

  // Protect the page - redirect to login if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Load the specific ZOLIPROBA patient data
  useEffect(() => {
    if (authLoading || !user) return;

    const fetchPatient = async () => {
      setLoadingPatient(true);
      try {
        let { data, error } = await supabase
          .from('patient_alap_adatok')
          .select('*')
          .eq('id', ZOLI_PATIENT_ID)
          .single();

        if (error) {
          // If the patient record doesn't exist by ID, try finding any record named ZOLIPROBA
          console.warn('Patient by ID not found, trying query by name...');
          const { data: nameQuery, error: nameError } = await supabase
            .from('patient_alap_adatok')
            .select('*')
            .eq('vezeteknev', 'ZOLIPROBA')
            .limit(1);

          if (!nameError && nameQuery && nameQuery.length > 0) {
            setPatient(nameQuery[0]);
          } else {
            // Fallback mock patient representation so the page still loads the component
            setPatient({
              id: ZOLI_PATIENT_ID,
              vezeteknev: 'ZOLIPROBA',
              keresztnev: 'Páciens',
              flexident_id: null
            });
          }
        } else {
          setPatient(data);
        }
      } catch (err) {
        console.error('Error fetching patient:', err);
        // Silent fallback so UI never crashes
        setPatient({
          id: ZOLI_PATIENT_ID,
          vezeteknev: 'ZOLIPROBA',
          keresztnev: 'Páciens'
        });
      } finally {
        setLoadingPatient(false);
      }
    };

    fetchPatient();
  }, [user, authLoading]);

  // Function to delete status data for ZOLIPROBA
  const handleResetChartData = async () => {
    setIsDeleting(true);
    try {
      // 1. Delete dental_chart_history first to avoid foreign key violations with dental_chart
      const { error: historyError } = await supabase
        .from('dental_chart_history')
        .delete()
        .eq('patient_id', ZOLI_PATIENT_ID);
      if (historyError) throw historyError;

      // 2. Delete dental_chart
      const { error: chartError } = await supabase
        .from('dental_chart')
        .delete()
        .eq('patient_id', ZOLI_PATIENT_ID);
      if (chartError) throw chartError;

      // 3. Delete patient_treatment_plans (which cascades and deletes patient_treatment_plan_items)
      const { error: planError } = await supabase
        .from('patient_treatment_plans')
        .delete()
        .eq('patient_id', ZOLI_PATIENT_ID);
      if (planError) throw planError;

      // 4. Delete native_voice_jobs
      const { error: nativeVoiceError } = await supabase
        .from('native_voice_jobs')
        .delete()
        .eq('treatnote_patient_id', ZOLI_PATIENT_ID);
      if (nativeVoiceError) throw nativeVoiceError;

      // 5. Delete voice_jobs
      const { error: voiceError } = await supabase
        .from('voice_jobs')
        .delete()
        .eq('treatnote_patient_id', ZOLI_PATIENT_ID);
      if (voiceError) throw voiceError;

      // 6. Clear local storage selected tooth selection
      localStorage.removeItem(`selected_tooth_${ZOLI_PATIENT_ID}`);

      // 7. Clear client-side dental chart cache
      clearDentalChartCache(ZOLI_PATIENT_ID);

      // 8. Refetch unified voice history
      await unifiedRefetch();

      toast.success('Minden státusz- és felvételi adat sikeresen törölve a páciens alól!');
      setRefreshTrigger(prev => prev + 1); // Triggers re-mount and re-fetch in DentalChart
    } catch (err: any) {
      console.error('Error resetting patient status data:', err);
      toast.error('Hiba történt a törlés során: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  if (authLoading || profileLoading || loadingPatient) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Betöltés...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-foreground p-6 sm:p-10 space-y-6">
      {/* Header controls bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Zoli-Chart</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Páciens: <span className="font-semibold text-foreground">{patient?.vezeteknev} {patient?.keresztnev}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button 
            variant="destructive" 
            onClick={handleResetChartData} 
            disabled={isDeleting}
            className="h-10 px-4 font-semibold shadow-sm flex items-center gap-2"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Státusz adatok törlése
          </Button>
          <Button 
            variant="outline" 
            onClick={handleLogout}
            className="h-10 px-4 font-semibold shadow-sm flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Kijelentkezés
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 max-w-6xl mx-auto">
        {/* Compact recording bar above the dental chart */}
        <div className="w-full">
          <NativeVoiceRecordingPanel
            treatnotePatientId={ZOLI_PATIENT_ID}
            isFlexi={profile?.voice_recording_preference === 'flexident'}
            flexiPatientId={patient?.flexident_id}
            forceMode="voxis"
            variant="compact"
            onJobStarted={(jobId) => {
              setSelectedNativeJobId(jobId);
              unifiedRefetch();
            }}
            onJobComplete={(jobId) => {
              setSelectedNativeJobId(jobId);
              unifiedRefetch();
              setRefreshTrigger(prev => prev + 1);
            }}
          />
        </div>

        {/* Dental chart */}
        <div className="w-full">
          <DentalChart
            patientId={ZOLI_PATIENT_ID}
            toothScale={1.5}
            readonly={false}
            onSelectionChange={setSelectedTeeth}
            key={`chart-${refreshTrigger}`}
          />
        </div>

        {/* VerdiktDisplay below the chart */}
        {(selectedJob || selectedNativeJobId) && (
          <div key={selectedJob?.id || selectedNativeJobId} className="w-full animate-in fade-in slide-in-from-top-6 duration-300">
            <VerdiktDisplay
              isLoading={selectedJob ? selectedJob.status === 'processing' : true}
              responseData={selectedJob?.result}
              isSelectedJob={true}
              selectedJobMode={selectedJob?.mode}
              selectedJobPaciensId={selectedJob?.treatnote_patient_id || ZOLI_PATIENT_ID}
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
              onViewInChart={() => setSelectedNativeJobId(null)}
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
                    patientId={ZOLI_PATIENT_ID}
                    resultJson={typeof selectedJob.result === 'string' ? JSON.parse(selectedJob.result) : selectedJob.result}
                    isNewest={(unifiedJobs?.filter(j => isVoxisJob(j.mode, j.result) && j.status === 'completed')?.[0]?.id || '') === selectedJob.id}
                  />
                ) : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
