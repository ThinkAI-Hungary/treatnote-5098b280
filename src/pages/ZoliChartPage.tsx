import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DentalChart } from '@/components/patients/dental-chart';
import { NativeVoiceRecordingPanel } from '@/components/voice/NativeVoiceRecordingPanel';
import { useUnifiedVoiceHistory } from '@/hooks/useUnifiedVoiceHistory';
import { isVoxisJob } from '@/lib/voxisUtils';
import { useProfile } from '@/hooks/useProfile';
import { mapVoxisToModels } from '@/components/patients/dental-chart/voxisMapper';
import { ToothModel } from '@/components/patients/dental-chart/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { LogOut, Loader2, Trash2 } from 'lucide-react';

export default function ZoliChartPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { profile } = useProfile();

  const patientId = "79f33d18-42a6-45ac-8f0d-d6dfacd0fca9";
  const [patient, setPatient] = useState<any>(null);
  const [patientLoading, setPatientLoading] = useState(true);
  const [selectedNativeJobId, setSelectedNativeJobId] = useState<string | null>(null);

  // Voice-extracted tooth data — shown in the chart without saving to DB
  const [extractedToothData, setExtractedToothData] = useState<Record<string, ToothModel> | undefined>(undefined);

  // Load patient details
  useEffect(() => {
    if (user && user.email === 'zoli@thinkai.hu') {
      setPatientLoading(true);
      supabase.from('patient_alap_adatok')
        .select('*')
        .eq('id', patientId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('Error loading ZOLIPROBA patient:', error);
            toast.error('Hiba a ZOLIPROBA paciens betöltésekor');
          } else {
            setPatient(data);
          }
          setPatientLoading(false);
        });
    }
  }, [user]);

  // Load voice history to detect job completion
  const { jobs: unifiedJobs, refetch: unifiedRefetch } = useUnifiedVoiceHistory(patientId);

  // When selected job completes with a voxis result, auto-apply extracted data to chart (no DB save)
  useEffect(() => {
    if (!selectedNativeJobId) return;
    const job = unifiedJobs.find(j => j.id === selectedNativeJobId);
    if (job && job.status === 'completed' && job.result && isVoxisJob(job.mode, job.result)) {
      const resultJson = typeof job.result === 'string' ? JSON.parse(job.result) : job.result;
      // Pass empty existingData ({}) so extracted values are fresh — no DB merge
      const updates = mapVoxisToModels(resultJson, {}, patientId);
      const newData: Record<string, ToothModel> = {};
      updates.forEach(u => {
        if (u.tooth_number) {
          newData[u.tooth_number] = u as ToothModel;
        }
      });
      setExtractedToothData(newData);
    }
  }, [unifiedJobs, selectedNativeJobId, patientId]);

  const handleResetStatus = async () => {
    if (!window.confirm("Biztosan törölni szeretné a ZOLIPROBA paciens összes státusz adatát? Ezt nem lehet visszavonni!")) {
      return;
    }
    try {
      const { error } = await supabase
        .from('dental_chart')
        .delete()
        .eq('patient_id', patientId);
      if (error) throw error;
      setExtractedToothData({});
      toast.success("Összes státusz adat sikeresen törölve!");
    } catch (err: any) {
      console.error("Error resetting patient status:", err);
      toast.error("Hiba a törlés során: " + (err.message || "Ismeretlen hiba"));
    }
  };

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate('/auth');
      } else if (user.email !== 'zoli@thinkai.hu') {
        navigate('/dashboard');
      }
    }
  }, [user, loading, navigate]);

  if (loading || !user || user.email !== 'zoli@thinkai.hu' || patientLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="animate-spin h-8 w-8 text-gray-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white p-6 text-black flex flex-col items-center zoli-chart-page">
      <style>{`
        /* Strip card borders, shadows, backgrounds */
        .zoli-chart-page .rounded-xl,
        .zoli-chart-page .border,
        .zoli-chart-page .border-b,
        .zoli-chart-page .shadow-sm {
          border: none !important;
          box-shadow: none !important;
          background: white !important;
        }
        .zoli-chart-page .bg-muted\/20,
        .zoli-chart-page .bg-muted\/5 {
          background: white !important;
        }
        /* Make sure baby teeth switcher text is readable on white */
        .zoli-chart-page label, 
        .zoli-chart-page span {
          color: black !important;
        }
        .zoli-chart-page .text-muted-foreground {
          color: #4b5563 !important; /* gray-600 */
        }
        /* Enable scrollbars inside Zoli chart page & for the main window body/html */
        body::-webkit-scrollbar,
        html::-webkit-scrollbar,
        .zoli-chart-page::-webkit-scrollbar,
        .zoli-chart-page *::-webkit-scrollbar {
          width: 8px !important;
          height: 8px !important;
          display: block !important;
        }
        body::-webkit-scrollbar-thumb,
        html::-webkit-scrollbar-thumb,
        .zoli-chart-page::-webkit-scrollbar-thumb,
        .zoli-chart-page *::-webkit-scrollbar-thumb {
          background-color: rgba(139, 92, 246, 0.3) !important;
          border-radius: 4px !important;
        }
        body::-webkit-scrollbar-track,
        html::-webkit-scrollbar-track,
        .zoli-chart-page::-webkit-scrollbar-track,
        .zoli-chart-page *::-webkit-scrollbar-track {
          background: transparent !important;
        }
        body, html,
        .zoli-chart-page,
        .zoli-chart-page * {
          scrollbar-width: thin !important;
          scrollbar-color: rgba(139, 92, 246, 0.3) transparent !important;
        }
        body, html {
          overflow: auto !important;
        }
      `}</style>

      {/* Header bar with logout */}
      <div className="w-full max-w-6xl flex justify-between items-center mb-4 pr-4 border-b pb-2">
        <h1 className="text-xl font-bold">Státusz rögzítés (ZOLIPROBA)</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={handleResetStatus}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Kartoték ürítése
          </button>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Kijelentkezés
          </button>
        </div>
      </div>

      <div className="w-full max-w-6xl space-y-4 bg-white">
        {patient && (
          <NativeVoiceRecordingPanel
            treatnotePatientId={patientId}
            isFlexi={profile?.voice_recording_preference === 'flexident'}
            flexiPatientId={patient.flexident_id}
            forceMode="voxis"
            variant="compact"
            onJobStarted={(jobId) => {
              setSelectedNativeJobId(jobId);
              setExtractedToothData({}); // clear chart for fresh start on each new recording
              unifiedRefetch();
            }}
            onJobComplete={(jobId) => {
              setSelectedNativeJobId(jobId);
              unifiedRefetch();
            }}
          />
        )}

        <DentalChart
          patientId={patientId}
          toothScale={1.5}
          readonly={false}
          overrideData={extractedToothData}
        />
      </div>
    </div>
  );
}
