import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { NativeVoiceRecordingPanel } from '@/components/voice/NativeVoiceRecordingPanel';
import { NativeVoiceJobHistory } from '@/components/voice/NativeVoiceJobHistory';
import { VerdiktDisplay } from '@/components/voice/VerdiktDisplay';
import { AmbulansllapReviewPanel } from '@/components/patients/ambulans/AmbulansllapReviewPanel';
import { useUnifiedVoiceHistory } from '@/hooks/useUnifiedVoiceHistory';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';

export default function PatientAmbulatoryChart() {
  const { id } = useParams();
  const { patient } = useOutletContext<{ patient: any }>();
  const { profile } = useProfile();
  const [selectedNativeJobId, setSelectedNativeJobId] = useState<string | null>(null);

  const { jobs: unifiedJobs, isLoading: unifiedLoading, refetch: unifiedRefetch } = useUnifiedVoiceHistory(patient.id);
  
  // Only filter ambulans jobs for history list
  const ambulansJobs = unifiedJobs.filter(j => j.mode === 'ambulans');
  const selectedJob = selectedNativeJobId ? unifiedJobs.find(j => j.id === selectedNativeJobId) : null;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Bal oldali oszlop (Fő tartalom) */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6 min-w-0">
          {!selectedJob && (
            <div className="flex items-center justify-center py-20 text-muted-foreground border border-dashed rounded-xl">
              Válasszon ki egy ambuláns lapot a jobb oldali előzmények közül, vagy rögzítsen egy újat.
            </div>
          )}
          
          {selectedJob && selectedJob.status === 'completed' && selectedJob.result && (
            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
              <div className="bg-muted/30 px-5 py-4 border-b">
                <h3 className="font-semibold text-lg">Ambuláns Lap Részletei</h3>
              </div>
              <div className="p-5">
                <AmbulansllapReviewPanel 
                  resultJson={typeof selectedJob.result === 'string' ? JSON.parse(selectedJob.result) : selectedJob.result} 
                />
              </div>
            </div>
          )}

          {/* Verdikt Display (Processing/Error state) */}
          {(selectedJob || selectedNativeJobId) && selectedJob?.status !== 'completed' && (
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
            forceMode="ambulans"
            onJobStarted={(jobId) => {
              setSelectedNativeJobId(jobId);
              unifiedRefetch();
            }}
            onJobComplete={(jobId) => {
              setSelectedNativeJobId(jobId);
              unifiedRefetch();
            }}
          />
          <div className="w-full flex-1 flex flex-col min-h-[400px]">
            <NativeVoiceJobHistory
              jobs={ambulansJobs as any}
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
