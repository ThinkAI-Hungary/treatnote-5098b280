import { useState, useEffect } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { DentalChart } from '@/components/patients/dental-chart';
import { TreatmentPlanEditor } from '@/components/patients/treatment-plan/TreatmentPlanEditor';
import { NativeVoiceRecordingPanel } from '@/components/voice/NativeVoiceRecordingPanel';
import { NativeVoiceJobHistory } from '@/components/voice/NativeVoiceJobHistory';
import { VerdiktDisplay } from '@/components/voice/VerdiktDisplay';
import { VoxisReviewPanel } from '@/components/patients/dental-chart/VoxisReviewPanel';
import { useUnifiedVoiceHistory } from '@/hooks/useUnifiedVoiceHistory';
import { isVoxisJob } from '@/lib/voxisUtils';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function PatientTreatmentPlan() {
  const { id } = useParams();
  const { patient } = useOutletContext<{ patient: any }>();
  const { profile } = useProfile();
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const [hasItems, setHasItems] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { jobs: unifiedJobs, isLoading: unifiedLoading, refetch: unifiedRefetch } = useUnifiedVoiceHistory(patient.id);
  const [selectedNativeJobId, setSelectedNativeJobId] = useState<string | null>(null);
  
  const treatnoteJobs = unifiedJobs.filter(j => j.mode === 'treatnote');
  const selectedJob = selectedNativeJobId ? unifiedJobs.find(j => j.id === selectedNativeJobId) : null;

  useEffect(() => {
    if (hasItems || selectedTeeth.length > 0) {
      setShowEditor(true);
    }
  }, [hasItems, selectedTeeth]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bal oldali oszlop (Fogtérkép + Kezelési terv + Előzmények) */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6 min-w-0">
          <div className="w-full">
            <DentalChart 
              patientId={patient.id} 
              toothScale={1.5} 
              readonly={true}
              onSelectionChange={setSelectedTeeth}
            />
          </div>

          <div className={cn(
            "w-full flex-1 flex flex-col",
            showEditor ? 'animate-in slide-in-from-bottom-4 fade-in duration-500' : 'hidden'
          )}>
            <TreatmentPlanEditor 
              key={refreshTrigger}
              patientId={patient.id} 
              onPlanLoad={setHasItems}
            />
          </div>



          {/* Verdikt Display */}
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

        {/* Jobb oldali oszlop (Hangfelvevő) */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
          <NativeVoiceRecordingPanel 
            treatnotePatientId={patient.id}
            isFlexi={profile?.voice_recording_preference === 'flexident'}
            flexiPatientId={patient.flexident_id}
            forceMode="treatnote"
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
          <div className="w-full flex-1 flex flex-col min-h-[400px]">
            <NativeVoiceJobHistory
              jobs={treatnoteJobs as any}
              isLoading={unifiedLoading}
              selectedJobId={selectedNativeJobId}
              onSelectJob={(j) => setSelectedNativeJobId(j.id)}
              onJobTerminated={unifiedRefetch}
              className="flex-1"
            />
          </div>
        </div>
      </div>

    </div>
  );
}
