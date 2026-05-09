import { useProfile } from '@/hooks/useProfile';
import { NativeVoiceJobHistory } from '../voice/NativeVoiceJobHistory';
import { NativeVoiceRecordingPanel } from '../voice/NativeVoiceRecordingPanel';
import { VoiceJobHistory } from '../voice/VoiceJobHistory';
import VoiceRecording from '@/pages/VoiceRecording';
import { useUnifiedVoiceHistory } from '@/hooks/useUnifiedVoiceHistory';
import { useState } from 'react';
import { VerdiktDisplay } from '../voice/VerdiktDisplay';
import { supabase } from '@/integrations/supabase/client';
import { VoxisReviewPanel } from './dental-chart/VoxisReviewPanel';
import { toast } from '@/hooks/useToastMessage';

export function PatientVoiceRecording({ patientId }: { patientId: string }) {
  const { profile } = useProfile();
  const pref = profile?.voice_recording_preference || 'treatnote_native';

  const { jobs: unifiedJobs, isLoading: unifiedLoading, refetch: unifiedRefetch } = useUnifiedVoiceHistory(patientId);
  const [selectedNativeJobId, setSelectedNativeJobId] = useState<string | null>(null);

  const selectedJob = selectedNativeJobId ? unifiedJobs?.find(j => j.id === selectedNativeJobId) : null;

  if (pref === 'treatnote_native') {
    return (
      <div className="mt-8 space-y-4">
        <h2 className="text-2xl font-bold">Hangfelvétel</h2>
        
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* LEFT SIDE: History and Verdikt details */}
          <div className="flex-1 w-full flex flex-col gap-6 min-w-0">
            <div className="w-full">
              <NativeVoiceJobHistory
                jobs={unifiedJobs as any}
                isLoading={unifiedLoading}
                selectedJobId={selectedNativeJobId}
                onSelectJob={(j) => setSelectedNativeJobId(j.id)}
                onJobTerminated={unifiedRefetch}
              />
            </div>
            
          </div>
          
          {/* RIGHT SIDE: Felvétel készítése panel (sticky to follow scroll) */}
          <div className="w-full lg:w-[400px] xl:w-[450px] shrink-0 lg:sticky lg:top-4">
            <NativeVoiceRecordingPanel 
              treatnotePatientId={patientId}
              onJobStarted={(jobId) => {
                setSelectedNativeJobId(jobId);
                unifiedRefetch();
              }}
              onJobComplete={(jobId, result) => {
                setSelectedNativeJobId(jobId);
                unifiedRefetch();
              }}
            />
          </div>
        </div>

        {/* BOTTOM AREA: Verdikt details */}
        {(selectedJob || selectedNativeJobId) && (
          <div className="w-full mt-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <VerdiktDisplay
              isLoading={selectedJob ? selectedJob.status === 'processing' : true}
              responseData={selectedJob?.result}
              isSelectedJob={true}
              selectedJobMode={selectedJob?.mode}
              selectedJobPaciensId={selectedJob?.treatnote_patient_id || patientId}
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
                selectedJob?.mode === 'voxis' && selectedJob?.status === 'completed' && selectedJob?.result ? (
                  <VoxisReviewPanel 
                    jobId={selectedJob.id}
                    patientId={patientId}
                    resultJson={typeof selectedJob.result === 'string' ? JSON.parse(selectedJob.result) : selectedJob.result}
                    isNewest={(unifiedJobs?.filter(j => j.mode === 'voxis' && j.status === 'completed')?.[0]?.id || '') === selectedJob.id}
                  />
                ) : undefined
              }
            />
          </div>
        )}
      </div>
    );
  }

  // Legacy flexident mode
  return (
    <div className="space-y-6 max-w-[1600px] w-full px-2 md:px-6 mx-auto animate-in fade-in duration-300">
      <div className="flex items-center justify-between border-b pb-4">
        <h2 className="text-2xl font-bold">Hangfelvétel (Flexi-Dent mód)</h2>
      </div>
      {/* We mount the entire VoiceRecording page! It has its own history and logic. */}
      {/* Since it's a "duplicate", this perfectly matches request. */}
      <div className="border border-border/50 rounded-lg p-6 bg-card/30">
        <VoiceRecording treatnotePatientId={patientId} />
      </div>
    </div>
  );
}
