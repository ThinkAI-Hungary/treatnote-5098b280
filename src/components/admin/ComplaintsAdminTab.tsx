import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import {
    AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Loader2, User, Building, Trash2, ChevronLeft, ChevronRight as ChevronRightIcon, ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToastMessage';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';

interface VoiceJob {
    source_table: string;
    id: string;
    created_at: string;
    user_id: string;
    paciens_id: string | null;
    company_id: string;
    telephely_id: string;
    mode: string;
    status: string;
    error: string | null;
    result: any;
    duration_seconds: number;
    raw_audio_text: string | null;
    claude_cleaned_text: string | null;
    audio_url: string | null;
    progress_percent: number;
    progress_message: string | null;
    user_full_name: string | null;
    user_email: string | null;
    company_name: string | null;
}

interface AdminUser { id: string; email: string; full_name: string; company_id: string | null; }
interface Company { id: string; name: string; }

interface ComplaintsAdminTabProps {
    users: AdminUser[];
    companies: Company[];
}

function getModeLabel(mode: string | null): string {
    if (!mode) return '—';
    switch (mode) {
        case 'treatnote': return 'Kezelési terv';
        case 'voxis': return 'Státuszfelvétel';
        case 'ambulans': return 'Ambuláns';
        default: return mode;
    }
}

export function ComplaintsAdminTab({ users, companies }: ComplaintsAdminTabProps) {
    const [jobs, setJobs] = useState<VoiceJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [filterCompany, setFilterCompany] = useState<string>('all');

    // Pagination
    const [page, setPage] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const pageSize = 50;

    const fetchErrors = useCallback(async () => {
        setLoading(true);
        try {
            const countRes = await supabase.rpc('get_all_voice_jobs_count', {
                p_company_id: filterCompany === 'all' ? null : filterCompany,
                p_status: 'error'
            });
            if (countRes.error) throw countRes.error;
            setTotalCount(countRes.data || 0);

            const { data, error } = await supabase.rpc('get_all_voice_jobs_paginated', {
                p_limit: pageSize,
                p_offset: page * pageSize,
                p_company_id: filterCompany === 'all' ? null : filterCompany,
                p_status: 'error'
            });

            if (error) throw error;
            setJobs((data as VoiceJob[]) || []);
        } catch (e: any) {
            console.error('Error fetching system errors:', e);
            toast.error('Hiba a rendszerhibák betöltésekor');
        } finally {
            setLoading(false);
        }
    }, [page, filterCompany]);

    useEffect(() => {
        fetchErrors();
    }, [fetchErrors]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    return (
        <AnimatedCard>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Rendszer Hibák
                        {totalCount > 0 && (
                            <Badge className="ml-2 bg-destructive text-destructive-foreground border-0">
                                {totalCount} hiba
                            </Badge>
                        )}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Szerveroldali hibák és megszakadt AI feldolgozások listája
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={filterCompany} onValueChange={(v) => { setFilterCompany(v); setPage(0); }}>
                        <SelectTrigger className="border-primary/20 h-9 w-40">
                            <SelectValue placeholder="Minden cég" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Minden cég</SelectItem>
                            {companies.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline" size="sm"
                        onClick={fetchErrors} disabled={loading}
                        className="border-primary/20 hover:bg-primary/10"
                    >
                        <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
                        Frissítés
                    </Button>
                </div>
            </div>

            {loading && jobs.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-3 text-muted-foreground">Rendszerhibák betöltése...</span>
                </div>
            ) : jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mb-4 text-green-400/50" />
                    <p className="text-lg font-medium">Nincs rögzített rendszerhiba</p>
                    <p className="text-sm mt-1">A szűrők alapján nincs találat.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {jobs.map(job => {
                        const isExpanded = expandedIds.has(job.id);

                        return (
                            <div key={job.id} className="border border-primary/10 rounded-lg overflow-hidden bg-card/50">
                                {/* Header row */}
                                <button
                                    onClick={() => toggleExpand(job.id)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-card/80 transition-colors"
                                >
                                    {isExpanded
                                        ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    }

                                    <Badge className="text-xs border flex-shrink-0 flex items-center gap-1 w-28 justify-center bg-red-500/20 text-red-400 border-red-500/30">
                                        <AlertTriangle className="h-3 w-3" />
                                        Hiba
                                    </Badge>

                                    <span className="text-sm flex-1 truncate text-foreground/90 font-mono text-destructive">
                                        {job.error || 'Ismeretlen hiba'}
                                    </span>

                                    {job.company_name && (
                                        <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                            <Building className="h-3 w-3" />
                                            {job.company_name}
                                        </span>
                                    )}

                                    <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                        <User className="h-3 w-3" />
                                        {job.user_full_name || job.user_email || 'Ismeretlen'}
                                    </span>

                                    <span className="text-xs text-muted-foreground flex-shrink-0">
                                        {format(new Date(job.created_at), 'yyyy.MM.dd HH:mm')}
                                    </span>
                                </button>

                                {/* Expanded */}
                                {isExpanded && (
                                    <div className="border-t border-primary/10 px-4 py-4 space-y-4 bg-black/10">
                                        {/* Meta row */}
                                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground border-b border-primary/10 pb-3">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-medium text-foreground text-xs uppercase tracking-wide">Feldolgozva</span>
                                                <span>{format(new Date(job.created_at), 'yyyy. MMMM d. HH:mm', { locale: hu })}</span>
                                            </div>
                                            {(job.user_full_name || job.user_email) && (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-foreground text-xs uppercase tracking-wide">Felhasználó</span>
                                                    <span>{job.user_full_name || job.user_email}</span>
                                                </div>
                                            )}
                                            {job.company_name && (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-foreground text-xs uppercase tracking-wide">Cég</span>
                                                    <span>{job.company_name}</span>
                                                </div>
                                            )}
                                            {job.mode && (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-foreground text-xs uppercase tracking-wide">Típus</span>
                                                    <span className="flex items-center gap-1.5">
                                                        {getModeLabel(job.mode)}
                                                        <Badge variant="outline" className={cn('text-[10px]', job.source_table === 'legacy' ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10')}>
                                                            {job.source_table === 'legacy' ? 'FlexiDent' : 'Natív'}
                                                        </Badge>
                                                    </span>
                                                </div>
                                            )}
                                            {job.paciens_id && (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-foreground text-xs uppercase tracking-wide">Páciens ID</span>
                                                    <span>#{job.paciens_id}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Error text */}
                                        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
                                            <h4 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
                                                <AlertTriangle className="h-4 w-4" />
                                                Hibaüzenet
                                            </h4>
                                            <p className="text-sm text-foreground/90 font-mono whitespace-pre-wrap leading-relaxed">
                                                {job.error || 'Nincs részletes hibaüzenet'}
                                            </p>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-3">
                                            {job.paciens_id && (
                                                <Button
                                                    size="sm" variant="ghost"
                                                    asChild
                                                    className="text-muted-foreground hover:text-foreground"
                                                >
                                                    <a href={`/patients/${job.paciens_id}`} target="_blank" rel="noopener noreferrer">
                                                        <ExternalLink className="h-3 w-3 mr-2" />
                                                        Páciens megnyitása
                                                    </a>
                                                </Button>
                                            )}
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
                        Összesen: <span className="font-bold text-foreground">{totalCount}</span> rendszerhiba
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
    );
}
