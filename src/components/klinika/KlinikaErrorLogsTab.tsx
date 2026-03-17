import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    AlertTriangle, ChevronDown, ChevronRight, ChevronLeft, Trash2, Loader2, X,
    RefreshCw, Copy, Check, ImageIcon, Clock, Terminal, Globe, Database,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface ErrorLog {
    id: string;
    created_at: string;
    script_name: string;
    domain: string | null;
    severity: 'info' | 'warning' | 'error';
    summary: string;
    full_log: string;
    screenshot_urls: string[];
    metadata: Record<string, any>;
    company_name: string | null;
    telephely_name: string | null;
    username: string | null;
    user_id: string | null;
    company_id: string | null;
}

const SEVERITY_CONFIG = {
    info: { label: 'Info', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    warning: { label: 'Figyelmeztetés', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    error: { label: 'Hiba', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

interface KlinikaErrorLogsTabProps {
    companyId: string | null;
}

export function KlinikaErrorLogsTab({ companyId }: KlinikaErrorLogsTabProps) {
    const [logs, setLogs] = useState<ErrorLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});
    const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

    // Keyboard navigation for lightbox
    useEffect(() => {
        if (!lightbox) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setLightbox(null); return; }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setLightbox(prev => prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev);
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setLightbox(prev => prev && prev.index < prev.urls.length - 1 ? { ...prev, index: prev.index + 1 } : prev);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [lightbox != null]); 

    const fetchLogs = useCallback(async () => {
        if (!companyId) return;
        
        setLoading(true);
        const { data, error } = await supabase
            .from('error_logs')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(50); // limit for performance

        if (error) {
            toast.error('Hiba a logok betöltésekor');
            console.error(error);
        } else {
            setLogs((data as any[]) || []);
        }
        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleExpand = async (log: ErrorLog) => {
        toggleExpand(log.id);
    };

    const handleCopyForAI = async (log: ErrorLog) => {
        const lines: string[] = [
            `# Error Log: ${log.summary}`,
            ``,
            `**Script:** ${log.script_name}`,
            `**Domain:** ${log.domain || 'N/A'}`,
            `**Severity:** ${log.severity}`,
            `**Time:** ${new Date(log.created_at).toLocaleString('hu-HU')}`,
            `**Cég:** ${log.company_name || 'N/A'}`,
            `**Telephely:** ${log.telephely_name || 'N/A'}`,
            `**Felhasználó:** ${log.username || 'N/A'}`,
            `**User ID:** ${log.user_id || 'N/A'}`,
            ``,
            `## Metadata`,
            '```json',
            JSON.stringify(log.metadata, null, 2),
            '```',
            ``,
            `## Full Log`,
            '```',
            log.full_log,
            '```',
        ];

        const text = lines.join('\n');

        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(log.id);
            toast.success('Kimásolva AI-nak!');
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopiedId(log.id);
            toast.success('Kimásolva AI-nak!');
            setTimeout(() => setCopiedId(null), 2000);
        }
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleString('hu-HU', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };

    const computeLogSize = (log: ErrorLog): string => {
        const total = new TextEncoder().encode(log.full_log || '').length;
        if (total >= 1024 * 1024) return `${(total / (1024 * 1024)).toFixed(1)} MB`;
        if (total >= 1024) return `${(total / 1024).toFixed(0)} KB`;
        return `${total} B`;
    };

    if (loading && logs.length === 0) {
        return (
            <AnimatedCard>
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-3 text-muted-foreground">Logok betöltése...</span>
                </div>
            </AnimatedCard>
        );
    }

    return (
        <>
            <AnimatedCard>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-orange-400" />
                        Rendszer hibák
                        {logs.length > 0 && (
                            <Badge variant="outline" className="ml-2 border-primary/30">
                                {logs.length} bejegyzés
                            </Badge>
                        )}
                    </h2>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchLogs}
                            disabled={loading}
                            className="border-primary/20 hover:bg-primary/10"
                        >
                            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                            Frissítés
                        </Button>
                    </div>
                </div>

                {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Check className="h-12 w-12 mb-4 text-green-400/50" />
                        <p className="text-lg font-medium">Nincs hibanapló</p>
                        <p className="text-sm mt-1">Minden rendszer stabilan működik!</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logs.map((log) => {
                            const isExpanded = expandedIds.has(log.id);
                            const severity = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.error;
                            const isCopied = copiedId === log.id;

                            return (
                                <div
                                    key={log.id}
                                    className="border border-primary/10 rounded-lg overflow-hidden bg-card/50 hover:bg-card/80 transition-colors"
                                >
                                    <button
                                        onClick={() => handleExpand(log)}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                                    >
                                        {isExpanded
                                            ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                            : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        }

                                        <Badge className={cn("text-xs border flex-shrink-0", severity.color)}>
                                            {severity.label}
                                        </Badge>

                                        <span className="font-medium truncate flex-1">{log.summary}</span>

                                        <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0 relative max-w-[150px]">
                                            <Terminal className="h-3 w-3" />
                                            <span className="truncate">{log.script_name}</span>
                                        </span>

                                        <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                            <Database className="h-3 w-3" />
                                            {computeLogSize(log)}
                                        </span>

                                        <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                            <Clock className="h-3 w-3" />
                                            {formatDate(log.created_at)}
                                        </span>
                                    </button>

                                    {isExpanded && (
                                        <div className="border-t border-primary/10 px-4 py-4 space-y-4">
                                            {/* Action buttons */}
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleCopyForAI(log)}
                                                    className={cn(
                                                        "border-primary/20",
                                                        isCopied
                                                            ? "bg-green-500/20 text-green-400 border-green-500/30"
                                                            : "hover:bg-primary/10"
                                                    )}
                                                >
                                                    {isCopied
                                                        ? <><Check className="h-4 w-4 mr-2" />Kimásolva!</>
                                                        : <><Copy className="h-4 w-4 mr-2" />Másolás Támogatásnak</>
                                                    }
                                                </Button>
                                            </div>

                                            {/* Company / User detail row */}
                                            {(log.telephely_name || log.username) && (
                                                <div className="flex flex-wrap gap-4 text-sm bg-black/20 p-2 rounded-md">
                                                    {log.telephely_name && (
                                                        <span className="text-muted-foreground">
                                                            <span className="font-medium text-foreground">Telephely:</span> {log.telephely_name}
                                                        </span>
                                                    )}
                                                    {log.username && (
                                                        <span className="text-muted-foreground">
                                                            <span className="font-medium text-foreground">Érintett felhasználó:</span> {log.username}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                <div>
                                                    <h4 className="text-sm font-medium text-muted-foreground mb-2">További adatok</h4>
                                                    <pre className="text-xs bg-black/30 rounded-md p-3 overflow-x-auto border border-primary/10">
                                                        {JSON.stringify(log.metadata, null, 2)}
                                                    </pre>
                                                </div>
                                            )}

                                            {/* Full log */}
                                            <div>
                                                <h4 className="text-sm font-medium text-muted-foreground mb-2">Technikai napló</h4>
                                                <pre className="text-xs bg-black/30 rounded-md p-3 overflow-x-auto max-h-96 border border-primary/10 whitespace-pre-wrap">
                                                    {log.full_log}
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </AnimatedCard>
        </>
    );
}
