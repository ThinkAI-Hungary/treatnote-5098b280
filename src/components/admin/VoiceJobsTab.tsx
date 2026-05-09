import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Mic, ChevronDown, ChevronRight, Trash2, Loader2,
    RefreshCw, Check, Clock, User, Building, ExternalLink, XCircle, Copy, Filter, ChevronLeft, ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { cn } from '@/lib/utils';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface VoiceJob {
    id: string;
    paciens_id: string | null;
    type: string;
    audio_url: string | null;
    status: 'processing' | 'completed' | 'error';
    progress_percent: number;
    progress_message: string;
    company_id: string | null;
    telephely_id: string | null;
    user_id: string | null;
    result: any;
    error: string | null;
    created_at: string;
    completed_at: string | null;
    trace_logs?: Array<{ timestamp: string, node: string, status: 'processing' | 'completed' | 'error', details?: any }>;
    raw_audio_text?: string | null;
    claude_cleaned_text?: string | null;
    claude_cleaned_text?: string | null;
    trace_info?: any;
    // joined fields
    users?: { full_name: string; email: string };
    companies?: { name: string };
    
    // Virtual fields
    job_type: 'native' | 'legacy';
    complaints?: Array<{
        id: string;
        complaint_text: string;
        created_at: string;
        users?: { full_name: string };
    }>;
}

const STATUS_CONFIG = {
    processing: { label: 'Folyamatban', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    completed: { label: 'Sikeres', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    error: { label: 'Hiba', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

export function VoiceJobsTab() {
    const [jobs, setJobs] = useState<VoiceJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ id: string, type: 'native' | 'legacy' } | null>(null);
    const [deleting, setDeleting] = useState(false);
    
    const [filterSource, setFilterSource] = useState<'all' | 'native' | 'legacy'>('all');
    
    // Pagination
    const [page, setPage] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const pageSize = 50;

    const fetchJobs = useCallback(async () => {
        setLoading(true);
        try {
            const pSource = filterSource === 'all' ? null : filterSource;

            const countRes = await supabase.rpc('get_all_voice_jobs_count', {
                p_source: pSource
            });
            if (countRes.error) throw countRes.error;
            setTotalCount(countRes.data || 0);

            const { data, error } = await supabase.rpc('get_all_voice_jobs_paginated', {
                p_limit: pageSize,
                p_offset: page * pageSize,
                p_source: pSource
            });
            if (error) throw error;

            let merged = (data || []).map((j: any) => ({
                ...j,
                job_type: j.source_table,
                type: j.mode || 'ismeretlen',
                users: j.user_full_name || j.user_email ? { full_name: j.user_full_name, email: j.user_email } : null,
                companies: j.company_name ? { name: j.company_name } : null
            }));

            // Fetch complaints for these jobs
            const jobIds = merged.map(j => j.id);
            let complaintsByJob: Record<string, any[]> = {};
            if (jobIds.length > 0) {
                const topIds = jobIds.slice(0, 150);
                const { data: compData } = await supabase
                    .from('voice_job_complaints')
                    .select('*, users:created_by(full_name)')
                    .in('job_id', topIds)
                    .order('created_at', { ascending: true });
                
                if (compData) {
                    compData.forEach(c => {
                        if (!complaintsByJob[c.job_id]) complaintsByJob[c.job_id] = [];
                        complaintsByJob[c.job_id].push(c);
                    });
                }
            }

            // Assign complaints
            merged = merged.map(j => ({ ...j, complaints: complaintsByJob[j.id] || [] }));

            merged = merged.map(j => {
                if (j.job_type === 'legacy' && j.user_complaint && j.complaints.length === 0) {
                    j.complaints = [{
                        id: 'legacy-complaint',
                        complaint_text: j.user_complaint,
                        created_at: j.user_complaint_date || j.created_at,
                        users: { full_name: 'Ismeretlen (Régi)' }
                    }];
                }
                return j;
            });

            setJobs(merged as unknown as VoiceJob[]);
        } catch (e) {
            console.error(e);
            toast.error('Hiba a napló betöltésekor');
        }
        setLoading(false);
    }, [page, filterSource]);

    useEffect(() => {
        fetchJobs();
    }, [fetchJobs]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        if (page === 0) {
            const interval = setInterval(fetchJobs, 30000);
            return () => clearInterval(interval);
        }
    }, [fetchJobs, page]);

    const handleCopyForAI = (job: any, e: React.MouseEvent) => {
        e.stopPropagation();
        const rawText = job.raw_audio_text || job.result?.transcriber?.text || job.result?.transcriber?.raw?.text || 'Nincs nyers szöveg';
        const claudeText = job.claude_cleaned_text || job.result?.transcriber?.claude_text || 'Nincs tisztított szöveg';
        const rules = job.result?.execution_report_human?.talalatok || [];
        const rulesText = rules.length > 0 ? rules.map((r: any, i: number) => `${i+1}. Szabály: ${r.eredmeny?.rule_name || '-'} (Oka: ${r.eredmeny?.mi_alapjan || '-'})`).join('\n') : 'Nincs használt szabály';
        const finalJson = job.result ? JSON.stringify(job.result, null, 2) : '{}';

        const text = `## Hangfelvétel feldolgozás részletei
### Nyers szöveg:
${rawText}

### Tisztított (Claude) szöveg:
${claudeText}

### Felhasznált szabályok:
${rulesText}

### Végeredmény JSON:
${finalJson}`;

        navigator.clipboard.writeText(text);
        toast.success('Adatok másolva a vágólapra AI számára!');
    };

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);

        const tableName = deleteTarget.type === 'native' ? 'native_voice_jobs' : 'voice_jobs';

        const { error } = await supabase
            .from(tableName)
            .delete()
            .eq('id', deleteTarget.id);

        if (error) {
            toast.error('Törlés sikertelen');
        } else {
            toast.success('Rögzítés törölve');
            setJobs(prev => prev.filter(j => j.id !== deleteTarget.id));
            setExpandedIds(prev => {
                const next = new Set(prev);
                next.delete(deleteTarget.id);
                return next;
            });
        }

        setDeleting(false);
        setDeleteConfirmOpen(false);
        setDeleteTarget(null);
    };

    const formatDate = (iso: string) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleString('hu-HU', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };

    const getAudioPath = (job: any) => {
        const url = job.audio_url || job.audio_filename;
        if (!url) return null;
        if (url.startsWith('http')) return url;
        
        const { data } = supabase.storage.from('voice-recordings').getPublicUrl(url);
        return data.publicUrl;
    };

    if (loading && jobs.length === 0) {
        return (
            <AnimatedCard>
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-3 text-muted-foreground">Napló betöltése...</span>
                </div>
            </AnimatedCard>
        );
    }

    return (
        <>
            <AnimatedCard>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Mic className="h-5 w-5 text-purple-400" />
                        Hang Elemzések
                        {jobs.length > 0 && (
                            <Badge variant="outline" className="ml-2 border-primary/30">
                                {jobs.length} elemzés
                            </Badge>
                        )}
                    </h2>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center bg-muted/50 p-1 rounded-md border text-sm">
                            <button
                                onClick={() => setFilterSource('all')}
                                className={cn("px-3 py-1 rounded-sm whitespace-nowrap transition-colors", filterSource === 'all' && "bg-background shadow-sm text-foreground")}
                            >
                                Összes
                            </button>
                            <button
                                onClick={() => setFilterSource('native')}
                                className={cn("px-3 py-1 rounded-sm whitespace-nowrap transition-colors", filterSource === 'native' && "bg-background shadow-sm text-foreground")}
                            >
                                Natív Elemzések
                            </button>
                            <button
                                onClick={() => setFilterSource('legacy')}
                                className={cn("px-3 py-1 rounded-sm whitespace-nowrap transition-colors", filterSource === 'legacy' && "bg-background shadow-sm text-foreground")}
                            >
                                FlexiDent Elemzések
                            </button>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchJobs}
                            disabled={loading}
                            className="border-primary/20 hover:bg-primary/10 ml-2"
                        >
                            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                            Frissítés
                        </Button>
                    </div>
                </div>

                {jobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Check className="h-12 w-12 mb-4 text-green-400/50" />
                        <p className="text-lg font-medium">Nincs elemzési adat</p>
                        <p className="text-sm mt-1">Még senki sem használt hangfelvételt.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {jobs.filter(j => filterSource === 'all' || j.job_type === filterSource).map((job) => {
                            const isExpanded = expandedIds.has(job.id);
                            const statusConf = STATUS_CONFIG[job.status] || STATUS_CONFIG.error;
                            const typeLabel = job.type === 'statuszfelvetel' ? 'Státuszfelvétel' : (job.type === 'kezelest_terv' ? 'Kezelési Terv' : job.type);

                            // Dig out strings
                            const rawAudioText = job.raw_audio_text || job.result?.transcriber?.text || job.result?.transcriber?.raw?.text || 'Nincs adat. (Valószínűleg nem ElevenLabs-ot használt vagy üres)';
                            const claudeText = job.claude_cleaned_text || job.result?.transcriber?.claude_text || 'Nincs Claude markdown generálva.';
                            const rawJson = job.result ? JSON.stringify(job.result, null, 2) : '{}';
                            const traceInfo = job.trace_info || job.result?.trace_info || {};
                            const hasNewTrace = !!traceInfo.step2_claude_cleaner;
                            const traceLogs = job.trace_logs || [];

                            const getNodeStatus = (nodeName: string) => {
                                const states = traceLogs.filter(l => l.node === nodeName);
                                if (states.length === 0) return null;
                                return states[states.length - 1].status;
                            };

                            return (
                                <div
                                    key={job.id}
                                    className="border border-primary/10 rounded-lg overflow-hidden bg-card/50 transition-colors"
                                >
                                    <button
                                        onClick={() => toggleExpand(job.id)}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-card/80"
                                    >
                                        {isExpanded
                                            ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                            : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        }

                                        <Badge className={cn("text-xs border flex-shrink-0 w-24 justify-center", statusConf.color)}>
                                            {statusConf.label}
                                        </Badge>

                                        <span className="font-medium flex-1 text-primary capitalize flex items-center gap-2">
                                            {typeLabel}
                                            {job.job_type === 'legacy' ? (
                                                <Badge variant="outline" className="text-[10px] uppercase bg-orange-500/10 text-orange-400 border-orange-500/20">FlexiDent</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] uppercase bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Natív</Badge>
                                            )}
                                        </span>

                                        {Boolean(job.complaints && job.complaints.length > 0) && (
                                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 ml-2 hidden sm:flex font-medium">
                                                Hibabejelentés ({job.complaints!.length})
                                            </Badge>
                                        )}

                                        {job.users && (
                                            <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                                <User className="h-3 w-3" />
                                                {job.users.full_name || job.users.email}
                                            </span>
                                        )}

                                        {job.paciens_id && (
                                            <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0 w-32 truncate">
                                                Páciens: {job.paciens_id}
                                            </span>
                                        )}

                                        <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                            <Clock className="h-3 w-3" />
                                            {formatDate(job.created_at)}
                                        </span>
                                    </button>

                                    {/* Expanded UI */}
                                    {isExpanded && (
                                        <div className="border-t border-primary/10 px-4 py-4 space-y-6">
                                            {/* Top info bar */}
                                            <div className="flex flex-wrap items-center justify-between gap-4">
                                                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                                    {(job.companies || job.company_id) && (
                                                        <span className="flex items-center gap-1">
                                                            <Building className="h-4 w-4 text-foreground" /> 
                                                            <span className="font-medium text-foreground">Cég:</span> {job.companies?.name || job.company_id}
                                                        </span>
                                                    )}
                                                    {job.paciens_id && (
                                                        <span className="flex items-center gap-1">
                                                            <User className="h-4 w-4 text-foreground" /> 
                                                            <span className="font-medium text-foreground">Páciens ID:</span> {job.paciens_id}
                                                        </span>
                                                    )}
                                                    <span className="flex items-center gap-1">
                                                        <span className="font-medium text-foreground">Progress:</span> {job.progress_percent}% ({job.progress_message})
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={(e) => handleCopyForAI(job, e)}
                                                        className="border-primary/20 hover:bg-primary/10 text-primary"
                                                    >
                                                        <Copy className="h-4 w-4 mr-2" />
                                                        Másolás AI-nak
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => { setDeleteTarget({ id: job.id, type: job.job_type }); setDeleteConfirmOpen(true); }}
                                                        className="border-red-500/20 hover:bg-red-500/10 text-red-400"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Törlés
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Audio playback */}
                                            {getAudioPath(job) ? (
                                                <div className="bg-muted/50 p-4 rounded-lg border">
                                                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                                        <Mic className="h-4 w-4 text-primary" /> Rögzített Hang
                                                    </h4>
                                                    <audio src={getAudioPath(job) || ''} controls className="w-full max-w-md" />
                                                </div>
                                            ) : (
                                                <div className="text-xs text-muted-foreground italic bg-muted/50 p-3 rounded border inline-block">
                                                    Nincs csatolt hangfájl (vagy nem lett elmentve).
                                                </div>
                                            )}

                                            {/* Complaints */}
                                            {job.complaints && job.complaints.length > 0 && (
                                                <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-lg">
                                                    <h4 className="text-sm font-bold text-destructive mb-3 flex items-center gap-2">
                                                        <XCircle className="h-4 w-4" /> Felhasználói Hibabejelentések ({job.complaints.length})
                                                    </h4>
                                                    <div className="space-y-3">
                                                        {job.complaints.map((c, i) => (
                                                            <div key={i} className="bg-background/80 rounded p-3 text-xs border border-destructive/10">
                                                                <div className="flex items-center gap-2 mb-1 text-muted-foreground font-medium">
                                                                    <span>{new Date(c.created_at).toLocaleString('hu-HU')}</span>
                                                                    {c.users?.full_name && (
                                                                        <>
                                                                            <span>•</span>
                                                                            <span>{c.users.full_name}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                                <p className="text-foreground whitespace-pre-wrap">{c.complaint_text}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* If Error */}
                                            {job.error && (
                                                <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-lg">
                                                    <h4 className="text-sm font-bold text-red-400 mb-2 flex items-center gap-2">
                                                        <XCircle className="h-4 w-4" /> Hibajelentés (Kivétel)
                                                    </h4>
                                                    <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap">{job.error}</pre>
                                                </div>
                                            )}

                                            )}

                                            {/* Applied Rules Section */}
                                            {job.result?.execution_report_human?.talalatok?.length > 0 && (
                                                <div className="rounded-lg border border-primary/20 bg-background/50 overflow-hidden mb-4">
                                                    <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b border-primary/10">
                                                        <Filter className="h-4 w-4 text-primary" />
                                                        <span className="text-xs font-semibold uppercase tracking-wide">Alkalmazott Szabályok ({job.result.execution_report_human.talalatok.length})</span>
                                                    </div>
                                                    <div className="p-0 overflow-x-auto">
                                                        <table className="w-full text-sm text-left">
                                                            <thead className="bg-primary/5 text-muted-foreground border-b border-primary/10">
                                                                <tr>
                                                                    <th className="px-4 py-2 font-medium">Ssz.</th>
                                                                    <th className="px-4 py-2 font-medium">Szabály Neve</th>
                                                                    <th className="px-4 py-2 font-medium">Kontextus</th>
                                                                    <th className="px-4 py-2 font-medium">Egyezés Oka</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-primary/10">
                                                                {job.result.execution_report_human.talalatok.map((t: any, idx: number) => (
                                                                    <tr key={idx} className="transition-colors hover:bg-primary/5">
                                                                        <td className="px-4 py-3 text-muted-foreground font-medium">{t.sorszam || idx + 1}.</td>
                                                                        <td className="px-4 py-3 font-semibold text-primary">{t.eredmeny?.rule_name || '-'}</td>
                                                                        <td className="px-4 py-3 text-muted-foreground break-words text-xs min-w-[200px]">{t.context_text || '-'}</td>
                                                                        <td className="px-4 py-3 text-xs text-muted-foreground">{t.eredmeny?.mi_alapjan || '-'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Data Pipeline Grid (n8n node style) */}
                                            <div className="relative pt-2">
                                                {/* Total Duration Header */}
                                                {traceInfo.total_duration_ms && (
                                                    <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 border">
                                                        <Clock className="h-3.5 w-3.5" />
                                                        <span>Teljes feldolgozási idő: <span className="font-bold text-foreground">{(traceInfo.total_duration_ms / 1000).toFixed(1)}s</span></span>
                                                        <span className="text-muted-foreground/60">|</span>
                                                        <span>Modell: <span className="font-medium text-foreground">{traceInfo.step4_quadrant_extractors?.model || 'gpt-4o'}</span></span>
                                                        {traceInfo.step6_merge && (
                                                            <>
                                                                <span className="text-muted-foreground/60">|</span>
                                                                <span>Fogak adattal: <span className="font-bold text-foreground">{traceInfo.step6_merge.teeth_with_data || 0}/32</span></span>
                                                            </>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Vertical line connecting nodes */}
                                                <div className="absolute top-0 bottom-0 left-6 w-0.5 bg-gradient-to-b from-blue-500/20 via-purple-500/20 to-green-500/20"></div>
                                                
                                                <div className="space-y-4">
                                                    {/* Node 1: ElevenLabs STT */}
                                                    <div className="relative pl-14">
                                                        <div className={cn("absolute left-4 top-4 w-4 h-4 rounded-full border-4 border-background outline outline-1 shadow-sm transition-colors", getNodeStatus("1 - ElevenLabs STT") === 'processing' ? 'bg-blue-400 outline-blue-400 animate-pulse' : 'bg-blue-500 outline-blue-500/50')}></div>
                                                        <div className="bg-card rounded-lg overflow-hidden border shadow-sm">
                                                            <div className="bg-blue-500/10 px-4 py-2 border-b flex items-center gap-2">
                                                                {getNodeStatus("1 - ElevenLabs STT") === 'processing' ? (
                                                                    <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
                                                                ) : (
                                                                    <Mic className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                                )}
                                                                <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">1. ElevenLabs STT Engine</h4>
                                                                {traceInfo.step1_elevenlabs?.duration_ms && (
                                                                    <span className="ml-auto text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-mono">{(traceInfo.step1_elevenlabs.duration_ms / 1000).toFixed(1)}s</span>
                                                                )}
                                                            </div>
                                                            {(rawAudioText || getNodeStatus("1 - ElevenLabs STT")) && (
                                                                <div className="p-4 text-xs leading-5 text-foreground font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                                                                    {getNodeStatus("1 - ElevenLabs STT") === 'processing' ? 'Transcribing...' : rawAudioText}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Node 2: Claude Cleaner */}
                                                    <div className="relative pl-14">
                                                        <div className={cn("absolute left-4 top-4 w-4 h-4 rounded-full border-4 border-background outline outline-1 shadow-sm transition-colors", getNodeStatus("2 - AI Tisztítás (Claude)") === 'processing' ? 'bg-purple-400 outline-purple-400 animate-pulse' : 'bg-purple-500 outline-purple-500/50')}></div>
                                                        <div className="bg-card rounded-lg overflow-hidden border shadow-sm">
                                                            <div className="bg-purple-500/10 px-4 py-2 border-b flex items-center gap-2">
                                                                {getNodeStatus("2 - AI Tisztítás (Claude)") === 'processing' ? (
                                                                    <Loader2 className="h-4 w-4 text-purple-600 dark:text-purple-400 animate-spin" />
                                                                ) : (
                                                                    <RefreshCw className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                                                )}
                                                                <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300">2. {traceInfo.step2_claude_cleaner?.model || 'Claude'} Markdown Generator</h4>
                                                                {traceInfo.step2_claude_cleaner?.duration_ms && (
                                                                    <span className="ml-auto text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-mono">{(traceInfo.step2_claude_cleaner.duration_ms / 1000).toFixed(1)}s</span>
                                                                )}
                                                            </div>
                                                            {getNodeStatus("2 - AI Tisztítás (Claude)") === 'processing' ? (
                                                                <div className="p-4 text-xs font-mono text-muted-foreground animate-pulse">Feladat végrehajtása folyamatban...</div>
                                                            ) : hasNewTrace && traceInfo.step2_claude_cleaner ? (
                                                                <div className="p-4 space-y-3">
                                                                    <div className="bg-muted/50 rounded border p-2">
                                                                        <span className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Rendszer Prompt (System)</span>
                                                                        <div className="text-[10px] leading-4 text-foreground font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                                                                            {traceInfo.step2_claude_cleaner.system_prompt}
                                                                        </div>
                                                                    </div>
                                                                    <div className="bg-muted/50 rounded border p-2">
                                                                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase mb-1 block">Generated Markdown (Output)</span>
                                                                        <div className="text-[10px] leading-4 text-foreground font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                                                                            {traceInfo.step2_claude_cleaner.response}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ) : (claudeText || getNodeStatus("2 - AI Tisztítás (Claude)")) ? (
                                                                <div className="p-4 text-xs leading-5 text-foreground font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                                                                    {claudeText}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </div>

                                                    {/* Node 3: Markdown Splitter */}
                                                    {(traceInfo.chunks || traceInfo.step3_markdown_splitter?.chunks) && (
                                                        <div className="relative pl-14">
                                                            <div className="absolute left-4 top-4 w-4 h-4 rounded-full bg-pink-500 border-4 border-background outline outline-1 outline-pink-500/50 shadow-sm"></div>
                                                            <div className="bg-card rounded-lg overflow-hidden border shadow-sm">
                                                                <div className="bg-pink-500/10 px-4 py-2 border-b flex items-center gap-2">
                                                                    <Loader2 className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                                                                    <h4 className="text-sm font-medium text-pink-700 dark:text-pink-300">3. Markdown Splitter</h4>
                                                                    {traceInfo.step3_markdown_splitter?.duration_ms != null && (
                                                                        <span className="ml-auto text-[10px] bg-pink-500/20 text-pink-400 px-2 py-0.5 rounded-full font-mono">{traceInfo.step3_markdown_splitter.duration_ms}ms</span>
                                                                    )}
                                                                </div>
                                                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                    {Object.entries(traceInfo.step3_markdown_splitter?.chunks || traceInfo.chunks).map(([key, value]) => (
                                                                        <div key={key} className="bg-muted/50 rounded border p-2">
                                                                            <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 uppercase mb-1 block">{key} Chunk</span>
                                                                            <div className="text-[10px] leading-4 text-foreground font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                                                                                {(value as string) || '<üres>'}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Node 4: Quadrant Extractors (OpenAI Structured Outputs) */}
                                                    {hasNewTrace && traceInfo.step4_quadrant_extractors && (
                                                        <div className="relative pl-14">
                                                            <div className="absolute left-4 top-4 w-4 h-4 rounded-full bg-orange-500 border-4 border-background outline outline-1 outline-orange-500/50 shadow-sm"></div>
                                                            <div className="bg-card rounded-lg overflow-hidden border shadow-sm">
                                                                <div className="bg-orange-500/10 px-4 py-2 border-b flex items-center gap-2">
                                                                    <ExternalLink className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                                                    <h4 className="text-sm font-medium text-orange-700 dark:text-orange-300">4. OpenAI Quadrant Extractors ({traceInfo.step4_quadrant_extractors.model || 'gpt-4o'} {traceInfo.step4_quadrant_extractors.mode === 'structured_outputs' ? '• Structured Outputs' : ''})</h4>
                                                                    {traceInfo.step4_quadrant_extractors.duration_ms && (
                                                                        <span className="ml-auto text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-mono">{(traceInfo.step4_quadrant_extractors.duration_ms / 1000).toFixed(1)}s</span>
                                                                    )}
                                                                </div>
                                                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                    {['q1', 'q2', 'q3', 'q4'].map((q) => {
                                                                        const extr = traceInfo.step4_quadrant_extractors[q];
                                                                        if (!extr) return null;
                                                                        return (
                                                                            <div key={q} className="bg-muted/50 rounded border p-2">
                                                                                <div className="flex items-center justify-between mb-1">
                                                                                    <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase">{q} Extractor</span>
                                                                                    {extr.duration_ms && (
                                                                                        <span className="text-[9px] text-muted-foreground font-mono">{(extr.duration_ms / 1000).toFixed(1)}s</span>
                                                                                    )}
                                                                                </div>
                                                                                <details className="text-[10px]">
                                                                                    <summary className="cursor-pointer text-muted-foreground font-semibold hover:text-foreground">Prompt Mutatása ({extr.prompt?.length || 0} msg)</summary>
                                                                                    <pre className="mt-2 text-[9px] overflow-x-auto whitespace-pre-wrap bg-background p-1 border">{JSON.stringify(extr.prompt, null, 2)}</pre>
                                                                                </details>
                                                                                <details className="text-[10px] mt-1">
                                                                                    <summary className="cursor-pointer text-muted-foreground font-semibold hover:text-foreground">JSON Schema Mutatása</summary>
                                                                                    <pre className="mt-2 text-[9px] overflow-x-auto whitespace-pre-wrap bg-background p-1 border">{JSON.stringify(extr.schema, null, 2)}</pre>
                                                                                </details>
                                                                                <div className="mt-2 text-[10px] leading-4 text-foreground font-mono whitespace-pre-wrap max-h-40 overflow-y-auto bg-background p-1 border">
                                                                                    {JSON.stringify(extr.output, null, 2)}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Node 5: Sparse → Full Converter (NEW - was missing from old pipeline) */}
                                                    {hasNewTrace && traceInfo.step5_sparse_to_full && (
                                                        <div className="relative pl-14">
                                                            <div className="absolute left-4 top-4 w-4 h-4 rounded-full bg-cyan-500 border-4 border-background outline outline-1 outline-cyan-500/50 shadow-sm"></div>
                                                            <div className="bg-card rounded-lg overflow-hidden border shadow-sm">
                                                                <div className="bg-cyan-500/10 px-4 py-2 border-b flex items-center gap-2">
                                                                    <RefreshCw className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                                                                    <h4 className="text-sm font-medium text-cyan-700 dark:text-cyan-300">5. Sparse → Full Converter</h4>
                                                                    {traceInfo.step5_sparse_to_full.duration_ms != null && (
                                                                        <span className="ml-auto text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full font-mono">{traceInfo.step5_sparse_to_full.duration_ms}ms</span>
                                                                    )}
                                                                </div>
                                                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                    {['q1', 'q2', 'q3', 'q4'].map((q) => {
                                                                        const fullData = traceInfo.step5_sparse_to_full[q];
                                                                        if (!fullData) return null;
                                                                        const teethKeys = Object.keys(fullData).filter(k => /^\d{2}$/.test(k));
                                                                        const nonEmptyTeeth = teethKeys.filter(k => {
                                                                            const t = fullData[k];
                                                                            return t && (Object.keys(t).length > 1 || (t.Megjegyzes && t.Megjegyzes.length > 0));
                                                                        });
                                                                        return (
                                                                            <div key={q} className="bg-muted/50 rounded border p-2">
                                                                                <div className="flex items-center justify-between mb-1">
                                                                                    <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 uppercase">{q} Full JSON</span>
                                                                                    <span className="text-[9px] text-muted-foreground">{nonEmptyTeeth.length}/{teethKeys.length} fognak van adata</span>
                                                                                </div>
                                                                                <details className="text-[10px]">
                                                                                    <summary className="cursor-pointer text-muted-foreground font-semibold hover:text-foreground">Nested JSON Mutatása</summary>
                                                                                    <pre className="mt-2 text-[9px] overflow-x-auto whitespace-pre-wrap bg-background p-1 border max-h-60 overflow-y-auto">{JSON.stringify(fullData, null, 2)}</pre>
                                                                                </details>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Node 6: Final Merge */}
                                                    {hasNewTrace && traceInfo.step6_merge && (
                                                        <div className="relative pl-14">
                                                            <div className="absolute left-4 top-4 w-4 h-4 rounded-full bg-emerald-500 border-4 border-background outline outline-1 outline-emerald-500/50 shadow-sm"></div>
                                                            <div className="bg-card rounded-lg overflow-hidden border shadow-sm">
                                                                <div className="bg-emerald-500/10 px-4 py-2 border-b flex items-center gap-2">
                                                                    <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                                                    <h4 className="text-sm font-medium text-emerald-700 dark:text-emerald-300">6. Final Merge (Assembly)</h4>
                                                                    {traceInfo.step6_merge.duration_ms != null && (
                                                                        <span className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono">{traceInfo.step6_merge.duration_ms}ms</span>
                                                                    )}
                                                                </div>
                                                                <div className="p-4 space-y-3">
                                                                    <div className="flex flex-wrap gap-4 text-xs">
                                                                        <div className="bg-muted/50 rounded border px-3 py-2 flex items-center gap-2">
                                                                            <span className="text-muted-foreground">Fogak összesen:</span>
                                                                            <span className="font-bold text-foreground">{traceInfo.step6_merge.total_teeth}</span>
                                                                        </div>
                                                                        <div className="bg-muted/50 rounded border px-3 py-2 flex items-center gap-2">
                                                                            <span className="text-muted-foreground">Adattal:</span>
                                                                            <span className="font-bold text-emerald-400">{traceInfo.step6_merge.teeth_with_data}</span>
                                                                        </div>
                                                                        {traceInfo.step6_merge.megjegyzes_fo && (
                                                                            <div className="bg-muted/50 rounded border px-3 py-2 flex items-center gap-2 flex-1">
                                                                                <span className="text-muted-foreground">Megjegyzés:</span>
                                                                                <span className="font-medium text-foreground truncate">{traceInfo.step6_merge.megjegyzes_fo}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Node 7: Final JSON Output */}
                                                    <div className="relative pl-14">
                                                        <div className="absolute left-4 top-4 w-4 h-4 rounded-full bg-green-500 border-4 border-background outline outline-1 outline-green-500/50 shadow-sm"></div>
                                                        <div className="bg-card rounded-lg overflow-hidden border shadow-sm">
                                                            <div className="bg-green-500/10 px-4 py-2 border-b flex items-center gap-2">
                                                                <ExternalLink className="h-4 w-4 text-green-600 dark:text-green-400" />
                                                                <h4 className="text-sm font-medium text-green-700 dark:text-green-300">7. Final JSON Data (Result)</h4>
                                                            </div>
                                                            <pre className="p-4 bg-muted/30 text-[11px] text-foreground font-mono overflow-auto max-h-96 whitespace-pre-wrap">
                                                                {rawJson}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination Controls */}
                {totalCount > 0 && (
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-primary/10">
                        <div className="text-sm text-muted-foreground">
                            Összesen: <span className="font-bold text-foreground">{totalCount}</span> elemzés
                        </div>
                        <div className="flex items-center gap-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0 || loading}
                                className="border-primary/20 hover:bg-primary/10"
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Előző
                            </Button>
                            <span className="text-sm font-medium">
                                {page + 1}. oldal <span className="text-muted-foreground font-normal">/ {Math.max(1, Math.ceil(totalCount / pageSize))}</span>
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => p + 1)}
                                disabled={(page + 1) * pageSize >= totalCount || loading}
                                className="border-primary/20 hover:bg-primary/10"
                            >
                                Következő
                                <ChevronRightIcon className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </AnimatedCard>

            <ConfirmDialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
                title="Rögzítés törlése"
                description="Biztosan törölni szeretné ezt a hangfelvételes naplót? A generált adat már lementésre kerülhetett a pácienshez, de a log törlődik."
                onConfirm={handleDelete}
                variant="danger"
            />
        </>
    );
}
