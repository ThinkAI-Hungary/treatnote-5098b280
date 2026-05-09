import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Plus, Search, Phone, Mail, MapPin, Share2, Bell, Building2, Check, X, Clock, RotateCcw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { useNavigate, useLocation } from 'react-router-dom';
import { NewPatientWizard } from '@/components/patients/NewPatientWizard';
import { PatientShareDialog } from '@/components/patients/PatientShareDialog';
import { useShareRequestsStore } from '@/hooks/useShareRequestsStore';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from '@/hooks/useToastMessage';
import { cn } from '@/lib/utils';

// We do not have auto-generated types yet, so defining manually for now
type Patient = any;

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  share_requested: { label: 'Kérelem elküldve', color: 'text-blue-500' },
  share_accepted:  { label: 'Elfogadva', color: 'text-emerald-500' },
  share_rejected:  { label: 'Elutasítva', color: 'text-destructive' },
  share_cancelled: { label: 'Visszavonva', color: 'text-muted-foreground' },
};

export default function PatientManagement() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isKlinikaAdmin } = useCachedRoles();
  const { isAdmin } = useUserRole();
  const canShare = isKlinikaAdmin || isAdmin;
  const navigate = useNavigate();
  const location = useLocation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [shareTarget, setShareTarget] = useState<Patient | null>(null);
  const [activeTab, setActiveTab] = useState((location.state as any)?.tab || 'patients');
  const [shareLogs, setShareLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const activeTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id;

  const {
    incoming,
    outgoing,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    fetchRequests,
  } = useShareRequestsStore();

  const pendingCount = incoming.length + outgoing.length;

  async function fetchPatients() {
    if (!user || !activeTelephelyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('patient_alap_adatok')
        .select('*')
        .contains('telephely_ids', [activeTelephelyId])
        .order('vezeteknev', { ascending: true })
        .order('keresztnev', { ascending: true });

      if (error) throw error;

      // Kérjük le az érvényes telephely ID-kat, hogy a megosztások száma pontos legyen
      const { data: validTelephelyek } = await supabase.from('telephely').select('id');
      const validIds = new Set(validTelephelyek?.map(t => t.id) || []);

      const cleanedData = (data || []).map(p => ({
        ...p,
        valid_telephely_count: p.telephely_ids ? p.telephely_ids.filter((id: string) => validIds.has(id)).length : 0
      }));

      setPatients(cleanedData);
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchShareLogs() {
    if (!activeTelephelyId) return;
    setLogsLoading(true);
    try {
      const { data } = await supabase
        .from('patient_share_log')
        .select('*')
        .or(`from_telephely_id.eq.${activeTelephelyId},to_telephely_id.eq.${activeTelephelyId}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data && data.length > 0) {
        const patientIds = [...new Set(data.map((r: any) => r.patient_id))];
        const fromIds = [...new Set(data.map((r: any) => r.from_telephely_id))];
        const toIds = [...new Set(data.map((r: any) => r.to_telephely_id))];
        const allTelephelyIds = [...new Set([...fromIds, ...toIds])];

        const [pRes, tRes] = await Promise.all([
          supabase.from('patient_alap_adatok').select('id, vezeteknev, keresztnev, titulus').in('id', patientIds),
          supabase.from('telephely').select('id, name, display_name, company_id').in('id', allTelephelyIds),
        ]);

        // Fetch company names
        const companyIds = [...new Set((tRes.data || []).map((t: any) => t.company_id).filter(Boolean))];
        let companyMap = new Map<string, string>();
        if (companyIds.length > 0) {
          const { data: companies } = await supabase.rpc('get_companies_basic_info', { company_ids: companyIds });
          companyMap = new Map((companies || []).map((c: any) => [c.id, c.display_name || c.name || null]));
        }

        const pMap = new Map((pRes.data || []).map((p: any) => [p.id, [p.titulus, p.vezeteknev, p.keresztnev].filter(Boolean).join(' ')]));
        // tMap: id -> { name, companyName }
        const tMap = new Map((tRes.data || []).map((t: any) => [
          t.id,
          { name: t.display_name || t.name, companyName: t.company_id ? (companyMap.get(t.company_id) || null) : null },
        ]));

        setShareLogs(data.map((r: any) => ({
          ...r,
          patient_name: pMap.get(r.patient_id) || '—',
          from_name: tMap.get(r.from_telephely_id)?.name || '—',
          from_company: tMap.get(r.from_telephely_id)?.companyName || null,
          to_name: tMap.get(r.to_telephely_id)?.name || '—',
          to_company: tMap.get(r.to_telephely_id)?.companyName || null,
        })));
      } else {
        setShareLogs([]);
      }
    } catch (err) {
      console.error('Share log fetch error:', err);
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => { fetchPatients(); }, [user, activeTelephelyId]);
  useEffect(() => { if (activeTab === 'notifications') fetchShareLogs(); }, [activeTab, activeTelephelyId]);

  const filteredPatients = patients.filter((patient) => {
    if (!searchQuery.trim()) return true;
    const pieces = [
      patient.titulus, patient.vezeteknev, patient.keresztnev,
      patient.szuletesi_vezeteknev, patient.szuletesi_keresztnev,
      patient.anyja_neve, patient.szuletesi_hely, patient.szuletesi_ido,
      patient.taj_szam, patient.iranyitoszam, patient.varos, patient.utca_hazszam,
      patient.kapcsolattarto_email, patient.telefon_1_orszagkod,
      patient.telefon_1_korzet, patient.telefon_1_hivoszam,
    ];
    let blob = pieces.filter(Boolean).map(p => String(p).toLowerCase()).join(' ');
    if (patient.telefon_1_orszagkod === '36' || patient.telefon_1_orszagkod === '+36') blob += ' 06';
    return searchQuery.toLowerCase().trim().split(/\s+/).every(term => blob.includes(term));
  });

  if (isCreating) {
    return (
      <div className="space-y-6">
        <NewPatientWizard onCancel={() => { setIsCreating(false); fetchPatients(); }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-galaxy-header p-6 border border-primary/20 dark:border-sparkle-blue/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-[hsl(268_42%_72%)] via-[hsl(263_28%_80%)] to-[hsl(255_13%_88%)] dark:from-primary dark:to-accent flex items-center justify-center glow-purple">
                <Users className="h-7 w-7 text-primary-foreground" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-[hsl(268_52%_50%)] via-[hsl(263_32%_65%)] to-[hsl(255_18%_74%)] dark:from-primary dark:via-primary/60 dark:to-accent bg-clip-text text-transparent">
                Páciensek
              </h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Páciensek kezelése és nyilvántartása
              </p>
            </div>
          </div>
          <Button onClick={() => setIsCreating(true)} className="shrink-0 z-10 relative">
            <Plus className="mr-2 h-4 w-4" />
            Új páciens
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="patients" className="gap-2">
            <Users className="h-4 w-4" />
            Páciensek
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2 relative">
            <Bell className="h-4 w-4" />
            Értesítések
            {pendingCount > 0 && (
              <Badge className="ml-1 h-5 min-w-5 px-1.5 text-xs bg-destructive text-destructive-foreground">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Páciensek tab ──────────────────────────────────────────────── */}
        <TabsContent value="patients" className="space-y-4 mt-0">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Keresés név, telefon, TAJ, település..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Betöltés...</div>
          ) : filteredPatients.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">Nincs páciens</h3>
                <p className="text-muted-foreground text-center max-w-sm mt-1">
                  {searchQuery ? 'Nincs találat a keresésre.' : 'Még nincs páciens rögzítve. Kattintson az "Új páciens" gombra a felvételhez.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredPatients.map((patient) => (
                <Card
                  key={patient.id}
                  className="cursor-pointer hover:shadow-md transition-all hover:border-primary/50 group bg-gradient-to-r from-primary/5 to-transparent dark:from-primary/10 dark:to-transparent"
                  onClick={() => navigate(`/patients/${patient.id}`)}
                >
                  <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Column 1: Name */}
                    <div className="flex-[1.5]">
                      <h3 className="text-lg font-semibold text-primary group-hover:text-primary/80 transition-colors">
                        {patient.titulus ? `${patient.titulus} ` : ''}{patient.vezeteknev} {patient.keresztnev}
                      </h3>
                      <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {patient.szuletesi_ido && (
                          <span className="flex items-center gap-1 font-medium">
                            Szül: {format(new Date(patient.szuletesi_ido), 'yyyy. MM. dd.')}
                          </span>
                        )}
                        {patient.szuletesi_ido && patient.taj_szam && <span className="text-border">|</span>}
                        {patient.taj_szam && (
                          <span className="flex items-center gap-1 font-medium">
                            TAJ: {String(patient.taj_szam).replace(/(.{3})/g, '$1 ').trim()}
                          </span>
                        )}
                        {patient.neme && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded-full">{patient.neme}</span>
                        )}
                        {/* Multi-telephely badge */}
                        {patient.valid_telephely_count > 1 && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-500/10 text-violet-500 rounded-full text-xs">
                            <Share2 className="h-3 w-3" /> {patient.valid_telephely_count} telephely
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Column 2: Contact */}
                    <div className="flex-1 text-sm text-muted-foreground space-y-1.5">
                      {patient.telefon_1_hivoszam && (
                        <div className="flex items-center">
                          <Phone className="w-3.5 h-3.5 mr-2 text-primary/70" />
                          +{patient.telefon_1_orszagkod} {patient.telefon_1_korzet} {patient.telefon_1_hivoszam}
                        </div>
                      )}
                      {patient.kapcsolattarto_email && (
                        <div className="flex items-center truncate max-w-[200px]" title={patient.kapcsolattarto_email}>
                          <Mail className="w-3.5 h-3.5 mr-2 text-primary/70 shrink-0" />
                          <span className="truncate">{patient.kapcsolattarto_email}</span>
                        </div>
                      )}
                    </div>

                    {/* Column 3: Address + Share button */}
                    <div className="flex-1 text-sm text-muted-foreground md:text-right flex flex-col md:items-end justify-center gap-2">
                      {patient.varos && (
                        <div className="flex items-center text-left md:text-right">
                          <MapPin className="w-3.5 h-3.5 mr-2 text-primary/70 md:hidden shrink-0" />
                          <span className="truncate max-w-[250px]">
                            {patient.iranyitoszam} {patient.varos}, {patient.utca_hazszam}
                          </span>
                        </div>
                      )}
                      {patient.anamnezis && (patient.anamnezis.gyogyszer_allergia === 'Igen' || patient.anamnezis.cukorbetegseg === 'Igen' || patient.anamnezis.verhigito === 'Igen') && (
                        <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
                          Kiemelt kockázat
                        </div>
                      )}
                      {/* Share button — klinika admins and admins */}
                      {canShare && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-xs gap-1.5 z-10"
                          onClick={(e) => { e.stopPropagation(); setShareTarget(patient); }}
                        >
                          <Share2 className="h-3.5 w-3.5" /> Megosztás
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Értesítések tab ────────────────────────────────────────────── */}
        <TabsContent value="notifications" className="space-y-6 mt-0">
          {/* Incoming pending */}
          {canShare && incoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Bell className="h-4 w-4" /> Beérkező kérelmek
              </h2>
              {incoming.map((req) => (
                <Card key={req.id} className="border-violet-500/30 bg-violet-500/5">
                  <CardContent className="p-4 flex items-start gap-4">
                    <Share2 className="h-5 w-5 text-violet-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        <span className="text-violet-400">
                          {req.from_company_name
                            ? <><span className="font-semibold">{req.from_company_name}</span> / {req.from_telephely_name}</>
                            : req.from_telephely_name}
                        </span>{' '}meg szeretné osztani:{' '}
                        <span className="font-semibold">{req.patient_name}</span>
                      </p>
                      {req.message && <p className="text-xs text-muted-foreground mt-1">„{req.message}"</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(req.created_at), 'yyyy. MM. dd. HH:mm', { locale: hu })}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm" variant="outline"
                        className="h-8 px-3 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={async () => {
                          const ok = await rejectRequest(req.id, req.patient_id, user!.id);
                          if (ok) { toast.info('Elutasítva'); fetchShareLogs(); }
                        }}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Elutasít
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700"
                        onClick={async () => {
                          const ok = await acceptRequest(req.id, req.patient_id, user!.id);
                          if (ok) { toast.success('Elfogadva! A páciens megjelenik a listában.'); fetchShareLogs(); fetchPatients(); }
                        }}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Elfogad
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}

          {/* Outgoing pending */}
          {outgoing.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Clock className="h-4 w-4" /> Függőben lévő kérelmeim
              </h2>
              {outgoing.map((req) => (
                <Card key={req.id} className="border-blue-500/30 bg-blue-500/5">
                  <CardContent className="p-4 flex items-center gap-4">
                    <Share2 className="h-5 w-5 text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        <span className="font-semibold">{req.patient_name}</span>
                        {' '}&rarr; várakozás az elfogadásra
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(req.created_at), 'yyyy. MM. dd. HH:mm', { locale: hu })}
                      </p>
                    </div>
                    <Button
                      size="sm" variant="outline"
                      className="h-8 px-3 text-xs shrink-0"
                      onClick={async () => {
                        const ok = await cancelRequest(req.id, req.patient_id, user!.id);
                        if (ok) { toast.info('Kérelem visszavonva'); fetchShareLogs(); }
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Visszavon
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}

          {incoming.length === 0 && outgoing.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nincsenek aktív megosztási kérelmek
            </div>
          )}

          {/* Share log */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Megosztási előzmények
            </h2>
            {logsLoading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Betöltés...</div>
            ) : shareLogs.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Nincsenek előzmények</div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Dátum</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Páciens</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Küldő → Cél</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden lg:table-cell">Megjegyzés</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Státusz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shareLogs.map((log, i) => {
                      const action = ACTION_LABELS[log.action] || { label: log.action, color: '' };
                      return (
                        <tr key={log.id} className={cn('border-b last:border-0', i % 2 === 0 ? 'bg-background' : 'bg-muted/20')}>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                            {format(new Date(log.created_at), 'MM. dd. HH:mm', { locale: hu })}
                          </td>
                          <td className="px-4 py-2.5 font-medium">{log.patient_name}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                            <div className="flex items-center gap-1">
                              <div>
                                {log.from_company && <div className="text-[10px] text-muted-foreground/60 leading-tight">{log.from_company}</div>}
                                <span>{log.from_name}</span>
                              </div>
                              <span className="mx-1 text-muted-foreground/40">→</span>
                              <div>
                                {log.to_company && <div className="text-[10px] text-muted-foreground/60 leading-tight">{log.to_company}</div>}
                                <span>{log.to_name}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell italic">
                            {log.message || '—'}
                          </td>
                          <td className={cn('px-4 py-2.5 font-medium text-xs', action.color)}>
                            {action.label}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>

      {/* Patient Share Dialog */}
      {shareTarget && (
        <PatientShareDialog
          open={!!shareTarget}
          onOpenChange={(open) => { if (!open) setShareTarget(null); }}
          patient={shareTarget}
        />
      )}
    </div>
  );
}
