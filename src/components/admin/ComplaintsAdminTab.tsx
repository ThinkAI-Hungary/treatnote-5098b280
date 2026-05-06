import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import {
    AlertCircle, ChevronDown, ChevronRight, RefreshCw, Loader2,
    CheckCircle2, Clock, Building, MessageSquare, User, ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToastMessage';
import { format, formatDistanceToNow } from 'date-fns';
import { hu } from 'date-fns/locale';

type ComplaintStatus = 'new' | 'in_progress' | 'resolved';

interface Complaint {
    id: string;
    job_id: string;
    job_type: string;
    complaint_text: string;
    created_at: string;
    status: ComplaintStatus;
    created_by: string | null;
    reporter_name: string | null;
    reporter_email: string | null;
    job_mode: string | null;
    job_status: string | null;
    patient_id: string | null;
    company_name: string | null;
    job_user_name: string | null;
}

interface AdminUser { id: string; email: string; full_name: string; company_id: string | null; }
interface Company { id: string; name: string; }

interface ComplaintsAdminTabProps {
    users: AdminUser[];
    companies: Company[];
    onUnreadCountChange?: (count: number) => void;
}

const STATUS_CONFIG: Record<ComplaintStatus, { label: string; color: string; Icon: any }> = {
    new: { label: 'Új', color: 'bg-red-500/20 text-red-400 border-red-500/30', Icon: AlertCircle },
    in_progress: { label: 'Folyamatban', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', Icon: Clock },
    resolved: { label: 'Megoldva', color: 'bg-green-500/20 text-green-400 border-green-500/30', Icon: CheckCircle2 },
};

const STATUS_TRANSITIONS: Record<ComplaintStatus, { next: ComplaintStatus; label: string }> = {
    new: { next: 'in_progress', label: 'Folyamatban' },
    in_progress: { next: 'resolved', label: 'Megoldva' },
    resolved: { next: 'new', label: 'Újra nyitni' },
};

function getModeLabel(mode: string | null): string {
    if (!mode) return '—';
    switch (mode) {
        case 'treatnote': return 'Kezelési terv';
        case 'voxis': return 'Státuszfelvétel';
        case 'ambulans': return 'Ambuláns';
        default: return mode;
    }
}

export function ComplaintsAdminTab({ users, companies, onUnreadCountChange }: ComplaintsAdminTabProps) {
    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterCompany, setFilterCompany] = useState<string>('all');

    const fetchComplaints = useCallback(async () => {
        setLoading(true);
        try {
            const { data: rawComplaints, error } = await supabase
                .from('voice_job_complaints')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(300);

            if (error) throw error;

            const all = rawComplaints || [];
            const nativeIds = all.filter(c => c.job_type !== 'legacy').map(c => c.job_id).filter(Boolean);
            const legacyIds = all.filter(c => c.job_type === 'legacy').map(c => c.job_id).filter(Boolean);

            const nativeJobMap: Record<string, any> = {};
            const legacyJobMap: Record<string, any> = {};

            if (nativeIds.length > 0) {
                const { data } = await supabase
                    .from('native_voice_jobs')
                    .select('id, mode, status, user_id, treatnote_patient_id, company_id, companies:company_id(name), job_user:user_id(full_name)')
                    .in('id', nativeIds);
                (data || []).forEach((j: any) => { nativeJobMap[j.id] = j; });
            }

            if (legacyIds.length > 0) {
                const { data } = await supabase
                    .from('voice_jobs')
                    .select('id, mode, status, user_id, paciens_id, company_id, companies:company_id(name), job_user:user_id(full_name)')
                    .in('id', legacyIds);
                (data || []).forEach((j: any) => { legacyJobMap[j.id] = j; });
            }

            const merged: Complaint[] = all.map((c: any) => {
                const job = c.job_type === 'legacy' ? legacyJobMap[c.job_id] : nativeJobMap[c.job_id];
                const reporterUser = users.find(u => u.id === c.created_by);
                return {
                    id: c.id,
                    job_id: c.job_id,
                    job_type: c.job_type || 'native',
                    complaint_text: c.complaint_text,
                    created_at: c.created_at,
                    status: (c.status || 'new') as ComplaintStatus,
                    created_by: c.created_by,
                    reporter_name: reporterUser?.full_name || c.reporter?.full_name || null,
                    reporter_email: reporterUser?.email || c.reporter?.email || null,
                    job_mode: job?.mode || null,
                    job_status: job?.status || null,
                    patient_id: job?.treatnote_patient_id || job?.paciens_id || null,
                    company_name: job?.companies?.name || null,
                    job_user_name: job?.job_user?.full_name || null,
                };
            });

            setComplaints(merged);
            const newCount = merged.filter(c => c.status === 'new').length;
            onUnreadCountChange?.(newCount);
        } catch (e: any) {
            console.error('Error fetching complaints:', e);
            toast.error('Hiba a bejelentések betöltésekor');
        } finally {
            setLoading(false);
        }
    }, [onUnreadCountChange]);

    useEffect(() => {
        fetchComplaints();
    }, [fetchComplaints]);

    const updateStatus = async (id: string, newStatus: ComplaintStatus) => {
        setUpdatingId(id);
        try {
            const { error } = await supabase
                .from('voice_job_complaints')
                .update({ status: newStatus })
                .eq('id', id);
            if (error) throw error;
            const updated = complaints.map(c => c.id === id ? { ...c, status: newStatus } : c);
            setComplaints(updated);
            const newCount = updated.filter(c => c.status === 'new').length;
            onUnreadCountChange?.(newCount);
            toast.success('Státusz frissítve');
        } catch {
            toast.error('Hiba a státusz frissítésekor');
        } finally {
            setUpdatingId(null);
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const filtered = complaints.filter(c => {
        if (filterStatus !== 'all' && c.status !== filterStatus) return false;
        if (filterCompany !== 'all') {
            const co = companies.find(x => x.id === filterCompany);
            if (co && c.company_name !== co.name) return false;
        }
        return true;
    });

    const newCount = complaints.filter(c => c.status === 'new').length;

    if (loading && complaints.length === 0) {
        return (
            <AnimatedCard>
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-3 text-muted-foreground">Bejelentések betöltése...</span>
                </div>
            </AnimatedCard>
        );
    }

    return (
        <AnimatedCard>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-destructive" />
                        Hibabejelentések
                        {newCount > 0 && (
                            <Badge className="ml-2 bg-destructive text-destructive-foreground border-0">
                                {newCount} új
                            </Badge>
                        )}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Felhasználók által beküldött problémák — {complaints.length} összesen
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="border-primary/20 h-9 w-36">
                            <SelectValue placeholder="Minden státusz" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Minden státusz</SelectItem>
                            <SelectItem value="new">Új</SelectItem>
                            <SelectItem value="in_progress">Folyamatban</SelectItem>
                            <SelectItem value="resolved">Megoldva</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={filterCompany} onValueChange={setFilterCompany}>
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
                        onClick={fetchComplaints} disabled={loading}
                        className="border-primary/20 hover:bg-primary/10"
                    >
                        <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
                        Frissítés
                    </Button>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mb-4 text-green-400/50" />
                    <p className="text-lg font-medium">Nincs bejelentés</p>
                    <p className="text-sm mt-1">A szűrők alapján nincs találat.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map(c => {
                        const isExpanded = expandedIds.has(c.id);
                        const conf = STATUS_CONFIG[c.status];
                        const { Icon } = conf;
                        const transition = STATUS_TRANSITIONS[c.status];

                        return (
                            <div key={c.id} className="border border-primary/10 rounded-lg overflow-hidden bg-card/50">
                                {/* Header row */}
                                <button
                                    onClick={() => toggleExpand(c.id)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-card/80 transition-colors"
                                >
                                    {isExpanded
                                        ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    }

                                    <Badge className={cn('text-xs border flex-shrink-0 flex items-center gap-1 w-28 justify-center', conf.color)}>
                                        <Icon className="h-3 w-3" />
                                        {conf.label}
                                    </Badge>

                                    <span className="text-sm flex-1 truncate text-foreground/90">
                                        {c.complaint_text}
                                    </span>

                                    {c.company_name && (
                                        <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                            <Building className="h-3 w-3" />
                                            {c.company_name}
                                        </span>
                                    )}

                                    <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                        <User className="h-3 w-3" />
                                        {c.reporter_name || c.reporter_email || 'Ismeretlen'}
                                    </span>

                                    <span className="text-xs text-muted-foreground flex-shrink-0">
                                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: hu })}
                                    </span>
                                </button>

                                {/* Expanded */}
                                {isExpanded && (
                                    <div className="border-t border-primary/10 px-4 py-4 space-y-4 bg-black/10">
                                        {/* Meta row */}
                                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground border-b border-primary/10 pb-3">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-medium text-foreground text-xs uppercase tracking-wide">Bejelentve</span>
                                                <span>{format(new Date(c.created_at), 'yyyy. MMMM d. HH:mm', { locale: hu })}</span>
                                            </div>
                                            {c.reporter_name && (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-foreground text-xs uppercase tracking-wide">Bejelentő</span>
                                                    <span>{c.reporter_name}</span>
                                                </div>
                                            )}
                                            {c.company_name && (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-foreground text-xs uppercase tracking-wide">Cég</span>
                                                    <span>{c.company_name}</span>
                                                </div>
                                            )}
                                            {c.job_user_name && (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-foreground text-xs uppercase tracking-wide">Job felhasználó</span>
                                                    <span>{c.job_user_name}</span>
                                                </div>
                                            )}
                                            {c.job_mode && (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-foreground text-xs uppercase tracking-wide">Típus</span>
                                                    <span className="flex items-center gap-1.5">
                                                        {getModeLabel(c.job_mode)}
                                                        <Badge variant="outline" className={cn('text-[10px]', c.job_type === 'legacy' ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10')}>
                                                            {c.job_type === 'legacy' ? 'FlexiDent' : 'Natív'}
                                                        </Badge>
                                                    </span>
                                                </div>
                                            )}
                                            {c.patient_id && (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-foreground text-xs uppercase tracking-wide">Páciens ID</span>
                                                    <span>#{c.patient_id}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Complaint text */}
                                        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
                                            <h4 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
                                                <AlertCircle className="h-4 w-4" />
                                                Bejelentett probléma
                                            </h4>
                                            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                                                {c.complaint_text}
                                            </p>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-3">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => updateStatus(c.id, transition.next)}
                                                disabled={updatingId === c.id}
                                                className={cn(
                                                    'border-primary/20 hover:bg-primary/10',
                                                    transition.next === 'resolved' && 'border-green-500/30 hover:bg-green-500/10 text-green-400',
                                                    transition.next === 'in_progress' && 'border-yellow-500/30 hover:bg-yellow-500/10 text-yellow-400',
                                                    transition.next === 'new' && 'border-red-500/30 hover:bg-red-500/10 text-red-400',
                                                )}
                                            >
                                                {updatingId === c.id
                                                    ? <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                                    : <>{transition.next === 'resolved' ? <CheckCircle2 className="h-3 w-3 mr-2" /> : transition.next === 'in_progress' ? <Clock className="h-3 w-3 mr-2" /> : <AlertCircle className="h-3 w-3 mr-2" />}</>
                                                }
                                                {transition.label}
                                            </Button>

                                            {c.patient_id && (
                                                <Button
                                                    size="sm" variant="ghost"
                                                    asChild
                                                    className="text-muted-foreground hover:text-foreground"
                                                >
                                                    <a href={`/patients/${c.patient_id}`} target="_blank" rel="noopener noreferrer">
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
        </AnimatedCard>
    );
}
