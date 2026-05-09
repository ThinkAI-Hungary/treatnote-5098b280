import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { DentalChart } from '@/components/patients/dental-chart';
import { NativeVoiceRecordingPanel } from '@/components/voice/NativeVoiceRecordingPanel';
import { VerdiktDisplay } from '@/components/voice/VerdiktDisplay';
import { VoxisReviewPanel } from '@/components/patients/dental-chart/VoxisReviewPanel';
import { useUnifiedVoiceHistory } from '@/hooks/useUnifiedVoiceHistory';
import { isVoxisJob } from '@/lib/voxisUtils';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';

export default function PatientStatus() {
  const { id } = useParams();
  const { patient } = useOutletContext<{ patient: any }>();
  const { profile } = useProfile();
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { jobs: unifiedJobs, isLoading: _unifiedLoading, refetch: unifiedRefetch } = useUnifiedVoiceHistory(patient.id);
  const [selectedNativeJobId, setSelectedNativeJobId] = useState<string | null>(null);
  
  const voxisJobs = unifiedJobs.filter(j => j.mode === 'voxis');
  const selectedJob = selectedNativeJobId ? unifiedJobs.find(j => j.id === selectedNativeJobId) : null;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Compact recording bar above the dental chart */}
      <NativeVoiceRecordingPanel
        treatnotePatientId={patient.id}
        isFlexi={profile?.voice_recording_preference === 'flexident'}
        flexiPatientId={patient.flexident_id}
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

      {/* Dental chart */}
      <DentalChart
        patientId={patient.id}
        toothScale={1.5}
        readonly={false}
        onSelectionChange={setSelectedTeeth}
        key={`chart-${refreshTrigger}`}
      />

      {/* VerdiktDisplay below the chart */}
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
