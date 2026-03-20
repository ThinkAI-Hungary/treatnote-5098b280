import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RuleDetailsPopup } from '@/components/shared/RuleDetailsPopup';
import {
    History, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight,
    Search, Mic, FileText, Book, Filter, AlertCircle
} from 'lucide-react';
import type { VoiceJob } from '@/hooks/useVoiceJobHistory';

interface AdminUser {
    id: string;
    email: string;
    full_name: string;
    company_name: string | null;
    company_id: string | null;
    telephely_id: string | null;
    telephely_name: string | null;
}

interface Company {
    id: string;
    name: string;
}

interface Telephely {
    id: string;
    name: string;
    company_id: string;
}

interface GlobalHistoryTabProps {
    users: AdminUser[];
    companies: Company[];
    telephelyek: Telephely[];
}

function formatDuration(seconds: number | null): string {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getModeLabel(mode: string): string {
    switch (mode) {
        case 'treatnote': return 'Kezelési terv';
        case 'voxis': return 'Státuszfelvétel';
        case 'ambulans': return 'Ambuláns';
        default: return mode;
    }
}

function StatusIcon({ status }: { status: VoiceJob['status'] }) {
    switch (status) {
        case 'processing': return <Loader2 className="h-4 w-4 animate-spin text-sparkle-blue" />;
        case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
        case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
        default: return null;
    }
}

function parseJobResult(result: unknown): { originalText: string | null; kitoltes: string | null; appliedRules: any[] } {
    try {
        let data: any = result;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch { return { originalText: null, kitoltes: null, appliedRules: [] }; }
        }
        if (Array.isArray(data) && data.length > 0) data = data[0];
        if (data && typeof data === 'object' && 'payload' in data) data = (data as any).payload;
        
        // Handle n8n wrapping
        let finalData = data;
        if (data && typeof data === 'object' && 'result' in data && typeof data.result === 'object') {
            finalData = data.result;
        }

        const appliedRules = finalData?.execution_report_human?.talalatok || [];

        return {
            originalText: finalData?.transcriber?.raw?.text ?? finalData?.transcriber?.text ?? null,
            kitoltes: finalData?.szoveges_lista ?? null,
            appliedRules: Array.isArray(appliedRules) ? appliedRules : [],
        };
    } catch {
        return { originalText: null, kitoltes: null, appliedRules: [] };
    }
}

function normalizeText(text: string): string {
    return text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

export function GlobalHistoryTab({ users, companies, telephelyek }: GlobalHistoryTabProps) {
    const [jobs, setJobs] = useState<VoiceJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const [filterCompany, setFilterCompany] = useState<string>('all');
    const [filterTelephely, setFilterTelephely] = useState<string>('all');
    const [filterUser, setFilterUser] = useState<string>('all');
    const [filterComplaint, setFilterComplaint] = useState<boolean>(false);

    
    // Popup state
    const [selectedRule, setSelectedRule] = useState<{ id: string; name: string } | null>(null);

    const fetchJobs = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_global_voice_jobs', {
                p_limit: 200,
                p_company_id: filterCompany === 'all' ? null : filterCompany,
                p_telephely_id: filterTelephely === 'all' ? null : filterTelephely,
                p_user_id: filterUser === 'all' ? null : filterUser
            });

            if (error) throw error;
            setJobs((data as VoiceJob[]) || []);
        } catch (error) {
            console.error('Error fetching global jobs:', error);
            toast.error('Hiba az előzmények betöltésekor');
        } finally {
            setLoading(false);
        }
    }, [filterCompany, filterTelephely, filterUser]);

    useEffect(() => {
        fetchJobs();
    }, [fetchJobs]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleCompanyChange = (val: string) => {
        setFilterCompany(val);
        setFilterTelephely('all');
        setFilterUser('all');
    };

    const handleTelephelyChange = (val: string) => {
        setFilterTelephely(val);
        setFilterUser('all');
    };

    const getFilteredTelephelyek = () => {
        if (filterCompany === 'all') return telephelyek;
        return telephelyek.filter(t => t.company_id === filterCompany);
    };

    const getFilteredUsers = () => {
        let u = users;
        if (filterCompany !== 'all') u = u.filter(user => user.company_id === filterCompany);
        if (filterTelephely !== 'all') u = u.filter(user => user.telephely_id === filterTelephely);
        return u;
    };

    const getUserDetails = (userId: string) => {
        return users.find(u => u.id === userId);
    };

    return (
        <AnimatedCard>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <History className="h-5 w-5 text-primary" />
                        Összes Előzmény
                        {jobs.length > 0 && (
                            <Badge variant="outline" className="ml-2 border-primary/30">
                                {jobs.length} eredmény
                            </Badge>
                        )}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">Globális nézet az összes páciens vizsgálati feldolgozásához</p>
                </div>
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="w-40">
                        <Select value={filterCompany} onValueChange={handleCompanyChange}>
                            <SelectTrigger className="border-primary/20 h-9">
                                <SelectValue placeholder="Minden cég" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Minden cég</SelectItem>
                                {companies.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="w-40">
                        <Select value={filterTelephely} onValueChange={handleTelephelyChange} disabled={filterCompany === 'all' && telephelyek.length === 0}>
                            <SelectTrigger className="border-primary/20 h-9">
                                <SelectValue placeholder="Minden telephely" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Minden telephely</SelectItem>
                                {getFilteredTelephelyek().map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="w-48">
                        <Select value={filterUser} onValueChange={setFilterUser}>
                            <SelectTrigger className="border-primary/20 h-9">
                                <SelectValue placeholder="Minden felhasználó" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Minden felhasználó</SelectItem>
                                {getFilteredUsers().map(u => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.full_name || u.email.split('@')[0]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button
                        variant={filterComplaint ? "default" : "outline"}
                        onClick={() => setFilterComplaint(!filterComplaint)}
                        className={cn("h-9 border-destructive/20 text-destructive", filterComplaint ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "hover:bg-destructive/10")}
                    >
                        <AlertCircle className="mr-2 h-4 w-4" />
                        Csak bejelentések
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={fetchJobs}
                        disabled={loading}
                        className="h-9 w-9 border border-primary/20 hover:bg-primary/10"
                    >
                        <Search className={cn("h-4 w-4", loading && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {loading && jobs.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-3 text-muted-foreground">Előzmények betöltése...</span>
                </div>
            ) : jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <History className="h-12 w-12 mb-4 text-primary/20" />
                    <p className="text-lg font-medium">Nincs rögzített előzmény</p>
                    <p className="text-sm mt-1">A megadott szűrőkkel nem található feldolgozás.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {jobs
                        .filter(job => !filterComplaint || job.user_complaint)
                        .map((job) => {
                        const isExpanded = expandedIds.has(job.id);
                        const { originalText, kitoltes, appliedRules } = parseJobResult(job.result);
                        const userDetails = getUserDetails(job.user_id);

                        return (
                            <div
                                key={job.id}
                                className="border border-primary/10 rounded-lg overflow-hidden bg-card/50 hover:bg-card/80 transition-colors"
                            >
                                {/* Header row */}
                                <div
                                    onClick={() => toggleExpand(job.id)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer select-none"
                                >
                                    {isExpanded
                                        ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    }

                                    <div className="flex items-center gap-2 min-w-[140px] flex-shrink-0">
                                        <StatusIcon status={job.status} />
                                        <span className="font-medium text-sm truncate">{getModeLabel(job.mode)}</span>
                                    </div>

                                    <span className="text-sm border-l border-primary/10 pl-3 text-muted-foreground min-w-[200px] flex-shrink-0 truncate">
                                        {userDetails ? (userDetails.full_name || userDetails.email) : 'Ismeretlen felhasználó'}
                                    </span>

                                    {job.user_complaint && (
                                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 hidden sm:inline-flex flex-shrink-0">
                                            <AlertCircle className="h-3 w-3 mr-1" />
                                            Bejelentés
                                        </Badge>
                                    )}

                                    <div className="flex-1 flex justify-end items-center gap-4 text-xs text-muted-foreground">
                                        <span className="bg-primary/5 px-2 py-0.5 rounded border border-primary/10">
                                            {formatDuration(job.duration_seconds)}
                                        </span>
                                        <span className="truncate min-w-[120px] text-right">
                                            {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: hu })}
                                        </span>
                                    </div>
                                </div>

                                {/* Expanded Detail view */}
                                {isExpanded && (
                                    <div className="border-t border-primary/10 px-4 py-4 space-y-4 bg-black/10">
                                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground border-b border-primary/10 pb-3">
                                            <div className="flex flex-col gap-1">
                                                <span className="font-medium text-foreground">Dátum</span>
                                                <span>{format(new Date(job.created_at), 'yyyy. MMMM d. HH:mm', { locale: hu })}</span>
                                            </div>
                                            {job.paciens_id && (
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-medium text-foreground">Páciens ID</span>
                                                    <span>#{job.paciens_id}</span>
                                                </div>
                                            )}
                                            {userDetails?.company_name && (
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-medium text-foreground">Cég</span>
                                                    <span>{userDetails.company_name}</span>
                                                </div>
                                            )}
                                            {userDetails?.telephely_name && (
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-medium text-foreground">Telephely</span>
                                                    <span>{userDetails.telephely_name}</span>
                                                </div>
                                            )}
                                        </div>

                                        {job.user_complaint && (
                                            <div className="mb-4 p-4 rounded-lg bg-destructive/5 border border-destructive/20 text-sm">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-semibold text-destructive flex items-center gap-2">
                                                        <AlertCircle className="h-4 w-4" />
                                                        Bejelentett probléma
                                                    </h4>
                                                    <span className="text-xs text-muted-foreground">
                                                        {job.user_complaint_date ? format(new Date(job.user_complaint_date), 'yyyy. MMMM d. HH:mm', { locale: hu }) : ''}
                                                    </span>
                                                </div>
                                                <p className="text-foreground/90 whitespace-pre-wrap">{job.user_complaint}</p>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {/* Eredeti szöveg */}
                                            <div className="rounded-lg border border-primary/20 bg-background/50">
                                                <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b border-primary/10">
                                                    <FileText className="h-4 w-4 text-primary" />
                                                    <span className="text-xs font-semibold uppercase tracking-wide">Hangfelvétel nyers szövege</span>
                                                </div>
                                                <div className="p-3">
                                                    {originalText ? (
                                                        <ScrollArea className="h-64">
                                                            <pre className="text-sm font-mono whitespace-pre-wrap text-muted-foreground">
                                                                {normalizeText(originalText)}
                                                            </pre>
                                                        </ScrollArea>
                                                    ) : (
                                                        <div className="flex justify-center flex-col items-center py-10 text-muted-foreground/50">
                                                            <Mic className="h-8 w-8 mb-2" />
                                                            <span className="text-xs">Nincs elérhető nyers szöveg</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Kitöltés */}
                                            <div className="rounded-lg border border-primary/20 bg-background/50">
                                                <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b border-primary/10">
                                                    <Book className="h-4 w-4 text-primary" />
                                                    <span className="text-xs font-semibold uppercase tracking-wide">Feldolgozott eredmény</span>
                                                </div>
                                                <div className="p-3">
                                                    {kitoltes ? (
                                                        <ScrollArea className="h-64">
                                                            <pre className="text-sm font-mono whitespace-pre-wrap text-foreground">
                                                                {normalizeText(kitoltes)}
                                                            </pre>
                                                        </ScrollArea>
                                                    ) : (
                                                        <div className="flex justify-center flex-col items-center py-10 text-muted-foreground/50">
                                                            {job.status === 'processing' ? (
                                                                <>
                                                                    <Loader2 className="h-8 w-8 mb-2 animate-spin text-primary" />
                                                                    <span className="text-xs text-primary">Feldolgozás alatt...</span>
                                                                </>
                                                            ) : job.status === 'error' ? (
                                                                <>
                                                                    <XCircle className="h-8 w-8 mb-2 text-destructive" />
                                                                    <span className="text-xs text-destructive">{job.error || 'A feldolgozás sikertelen'}</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <FileText className="h-8 w-8 mb-2" />
                                                                    <span className="text-xs">Nincs megjeleníthető adat</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Applied Rules Section */}
                                        {appliedRules.length > 0 && (
                                            <div className="rounded-lg border border-primary/20 bg-background/50 overflow-hidden">
                                                <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b border-primary/10">
                                                    <Filter className="h-4 w-4 text-primary" />
                                                    <span className="text-xs font-semibold uppercase tracking-wide">Alkalmazott Szabályok</span>
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
                                                            {appliedRules.map((t: any, idx: number) => {
                                                                const hasRuleId = !!t.eredmeny?.rule_id;
                                                                return (
                                                                    <tr 
                                                                        key={idx} 
                                                                        className={cn(
                                                                            "transition-colors",
                                                                            hasRuleId ? "hover:bg-primary/10 cursor-pointer" : "hover:bg-primary/5"
                                                                        )}
                                                                        onClick={() => {
                                                                            if (hasRuleId) {
                                                                                setSelectedRule({ id: t.eredmeny.rule_id, name: t.eredmeny.rule_name });
                                                                            }
                                                                        }}
                                                                    >
                                                                        <td className="px-4 py-3 text-muted-foreground font-medium">{t.sorszam || idx + 1}.</td>
                                                                        <td className="px-4 py-3 font-semibold text-primary">{t.eredmeny?.rule_name || '-'}</td>
                                                                        <td className="px-4 py-3 text-muted-foreground break-words text-xs min-w-[200px]">{t.context_text || '-'}</td>
                                                                        <td className="px-4 py-3 text-xs text-muted-foreground">{t.eredmeny?.mi_alapjan || '-'}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <RuleDetailsPopup 
                ruleId={selectedRule?.id || ''}
                ruleName={selectedRule?.name || ''}
                open={!!selectedRule}
                onOpenChange={(open) => !open && setSelectedRule(null)}
            />
        </AnimatedCard>
    );
}
