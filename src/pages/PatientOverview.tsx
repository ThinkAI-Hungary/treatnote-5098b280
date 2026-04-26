import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, BriefcaseMedical } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

import { DentalChart } from '@/components/patients/dental-chart';
import { useProfile } from '@/hooks/useProfile';
import { useUnifiedVoiceHistory } from '@/hooks/useUnifiedVoiceHistory';
import { VerdiktDisplay } from '@/components/voice/VerdiktDisplay';
import { VoxisReviewPanel } from '@/components/patients/dental-chart/VoxisReviewPanel';
import { isVoxisJob } from '@/lib/voxisUtils';
import { PatientHistoryPanel } from '@/components/patients/history/PatientHistoryPanel';
import { SelectedTeethHistoryPanel } from '@/components/patients/dental-chart/SelectedTeethHistoryPanel';

export default function PatientOverview() {
  const { id } = useParams();
  const { patient } = useOutletContext<{ patient: any }>();

  // Voice State
  const { profile } = useProfile();
  const { jobs: unifiedJobs, isLoading: unifiedLoading, refetch: unifiedRefetch } = useUnifiedVoiceHistory(id || '');
  const [selectedNativeJobId, setSelectedNativeJobId] = useState<string | null>(null);
  const selectedJob = selectedNativeJobId ? unifiedJobs?.find(j => j.id === selectedNativeJobId) : null;

  // Selected Teeth State
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* ── SECTION 0: Patient Details Grid ── */}
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

      {/* ── SECTION 1: DENTAL CHART (first view, full width) ── */}
      <div className="w-full">
        <DentalChart 
          patientId={patient.id} 
          readonly={true} 
          onSelectionChange={setSelectedTeeth}
        />
      </div>

      {/* ── SECTION 2: History Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* LEFT: History */}
        <div className="lg:col-span-12 flex flex-col gap-4">
          {/* Removed details grid from here */}

          {/* ── SECTION 2.5: Selected Teeth History Panel ── */}
          <div className="w-full">
            <SelectedTeethHistoryPanel patientId={patient.id} selectedTeeth={selectedTeeth} />
          </div>

          {/* Patient Treatment History */}
          <div className="flex-1 flex flex-col min-h-[420px]">
            <PatientHistoryPanel patientId={patient.id} filterType="all" />
          </div>
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
