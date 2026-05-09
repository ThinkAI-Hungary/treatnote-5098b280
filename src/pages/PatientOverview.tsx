import { useState, useEffect } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, BriefcaseMedical, Share2, Building2, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';

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

  // Shared telephelyes
  type SharedTelephely = { id: string; name: string; companyName: string | null };
  const [sharedWith, setSharedWith] = useState<SharedTelephely[]>([]);

  // Shared telephely section collapsed by default
  const [sharedExpanded, setSharedExpanded] = useState(false);

  useEffect(() => {
    const ids: string[] = patient?.telephely_ids || [];
    if (ids.length < 2) { setSharedWith([]); return; }
    (async () => {
      const { data: tRows } = await supabase
        .from('telephely')
        .select('id, name, display_name, company_id')
        .in('id', ids);
      if (!tRows) return;
      const companyIds = [...new Set(tRows.map((t: any) => t.company_id).filter(Boolean))];
      let companyMap = new Map<string, string>();
      if (companyIds.length > 0) {
        const { data: companies } = await supabase
          .rpc('get_companies_basic_info', { company_ids: companyIds });
        companyMap = new Map((companies || []).map((c: any) => [c.id, c.display_name || c.name || null]));
      }
      setSharedWith(tRows.map((t: any) => ({
        id: t.id,
        name: t.display_name || t.name,
        companyName: t.company_id ? (companyMap.get(t.company_id) || null) : null,
      })));
    })();
  }, [patient?.telephely_ids]);

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

      {/* ── Megosztás info (only if patient is shared with multiple telephelyes) ── */}
      {sharedWith.length > 1 && (
        <Card className="border-violet-500/20 bg-violet-500/5">
          {/* Clickable header */}
          <button
            className="w-full text-left"
            onClick={() => setSharedExpanded(prev => !prev)}
          >
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-sm flex items-center gap-2 text-violet-600 dark:text-violet-300 font-medium">
                <Share2 className="w-3.5 h-3.5" /> Megosztva
                <span className="text-xs font-normal text-violet-400 ml-1">{sharedWith.length} telephely</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 ml-auto transition-transform duration-200 ${
                    sharedExpanded ? 'rotate-0' : '-rotate-90'
                  }`}
                />
              </CardTitle>
            </CardHeader>
          </button>
          {/* Collapsible content */}
          {sharedExpanded && (
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {sharedWith.map(t => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/30 bg-background text-sm"
                  >
                    <Building2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                    <span>
                      {t.companyName && (
                        <span className="font-semibold text-violet-500 dark:text-violet-300">{t.companyName}</span>
                      )}
                      {t.companyName && <span className="text-muted-foreground mx-1">/</span>}
                      <span className="text-foreground">{t.name}</span>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── SECTION 1: DENTAL CHART (first view, full width) ── */}
      <div className="w-full">
        <DentalChart 
          patientId={patient.id}
          toothScale={1.5}
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
