import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    AlertTriangle, ChevronDown, ChevronRight, ChevronLeft, Trash2, Loader2, X,
    RefreshCw, Copy, Check, ImageIcon, Clock, Terminal, Globe, Database,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
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
}

const SEVERITY_CONFIG = {
    info: { label: 'Info', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    warning: { label: 'Figyelmeztetés', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    error: { label: 'Hiba', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

export function ErrorLogsTab() {
    const [logs, setLogs] = useState<ErrorLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});
    const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

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
    }, [lightbox != null]); // only re-attach when lightbox opens/closes, not on every index change

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('error_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            toast.error('Hiba a logok betöltésekor');
            console.error(error);
        } else {
            setLogs((data as any[]) || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(fetchLogs, 30000);
        return () => clearInterval(interval);
    }, [fetchLogs]);

    const groupedLogs = useMemo(() => {
        const groups: Record<string, ErrorLog[]> = {};
        for (const log of logs) {
            const key = log.summary || log.script_name || 'Ismeretlen hiba';
            if (!groups[key]) groups[key] = [];
            groups[key].push(log);
        }
        return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
    }, [logs]);

    const categories = useMemo(() => {
        return groupedLogs.map(([key]) => key);
    }, [groupedLogs]);

    const filteredGroups = useMemo(() => {
        if (selectedCategory === 'all') return groupedLogs;
        return groupedLogs.filter(([key]) => key === selectedCategory);
    }, [groupedLogs, selectedCategory]);

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

    const getSignedUrl = async (path: string): Promise<string> => {
        // Extract the storage path from the full URL
        const marker = '/storage/v1/object/error-screenshots/';
        const idx = path.indexOf(marker);
        const storagePath = idx >= 0 ? path.slice(idx + marker.length) : path;

        const { data, error } = await supabase.storage
            .from('error-screenshots')
            .createSignedUrl(storagePath, 3600); // 1 hour

        if (error || !data?.signedUrl) {
            console.error('Signed URL error:', error);
            return path; // Fallback to original URL
        }

        return data.signedUrl;
    };

    const loadScreenshots = async (log: ErrorLog) => {
        if (!log.screenshot_urls?.length) return;

        const urls: Record<string, string> = {};
        for (const rawUrl of log.screenshot_urls) {
            if (!screenshotUrls[rawUrl]) {
                urls[rawUrl] = await getSignedUrl(rawUrl);
            }
        }

        if (Object.keys(urls).length > 0) {
            setScreenshotUrls(prev => ({ ...prev, ...urls }));
        }
    };

    const handleExpand = async (log: ErrorLog) => {
        toggleExpand(log.id);
        if (!expandedIds.has(log.id)) {
            await loadScreenshots(log);
        }
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

        if (log.screenshot_urls?.length > 0) {
            lines.push('', `## Screenshots (${log.screenshot_urls.length} db)`);
            for (const url of log.screenshot_urls) {
                const signed = screenshotUrls[url] || url;
                lines.push(`- ${signed}`);
            }
        }

        const text = lines.join('\n');

        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(log.id);
            toast.success('Kimásolva AI-nak!');
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            // Fallback: select + copy
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

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);

        const { error } = await supabase
            .from('error_logs')
            .delete()
            .eq('id', deleteTarget);

        if (error) {
            toast.error('Törlés sikertelen');
        } else {
            toast.success('Log törölve');
            setLogs(prev => prev.filter(l => l.id !== deleteTarget));
        }

        setDeleting(false);
        setDeleteConfirmOpen(false);
        setDeleteTarget(null);
    };

    const handleDeleteAll = async () => {
        setDeleting(true);

        const { error } = await supabase
            .from('error_logs')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all

        if (error) {
            toast.error('Törlés sikertelen');
        } else {
            toast.success('Összes log törölve');
            setLogs([]);
        }

        setDeleting(false);
        setDeleteConfirmOpen(false);
        setDeleteTarget(null);
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleString('hu-HU', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };

    // Retrospective size: full_log UTF-8 bytes + ~100KB per screenshot stored in Storage
    const computeLogSize = (log: ErrorLog): string => {
        const logBytes = new TextEncoder().encode(log.full_log || '').length;
        const screenshotEstimate = (log.screenshot_urls?.length || 0) * 100 * 1024; // ~100KB each
        const total = logBytes + screenshotEstimate;
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
                        Hibakezelés
                        {logs.length > 0 && (
                            <Badge variant="outline" className="ml-2 border-primary/30">
                                {logs.length} bejegyzés
                            </Badge>
                        )}
                    </h2>
                    <div className="flex items-center gap-2">
                        {categories.length > 0 && (
                            <div className="w-56">
                                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                    <SelectTrigger className="border-primary/20 h-9">
                                        <SelectValue placeholder="Minden hiba" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Minden hiba</SelectItem>
                                        {categories.map(cat => (
                                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
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
                        {logs.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setDeleteTarget(null); setDeleteConfirmOpen(true); }}
                                className="border-red-500/20 hover:bg-red-500/10 text-red-400"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Összes törlése
                            </Button>
                        )}
                    </div>
                </div>

                {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Check className="h-12 w-12 mb-4 text-green-400/50" />
                        <p className="text-lg font-medium">Nincs hibanapló</p>
                        <p className="text-sm mt-1">Minden rendben fut!</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {filteredGroups.map(([groupName, groupLogs]) => (
                            <div key={groupName} className="space-y-3">
                                <div className="flex items-center gap-3 border-b border-primary/10 pb-2">
                                     <h3 className="text-base font-semibold text-foreground/90">{groupName}</h3>
                                     <Badge variant="outline" className="text-xs bg-primary/5">{groupLogs.length} eset</Badge>
                                </div>
                                <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-primary/20">
                                    {groupLogs.map((log) => {
                                        const isExpanded = expandedIds.has(log.id);
                                        const severity = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.error;
                                        const isCopied = copiedId === log.id;

                                        return (
                                            <div
                                    key={log.id}
                                    className="border border-primary/10 rounded-lg overflow-hidden bg-card/50 hover:bg-card/80 transition-colors"
                                >
                                    {/* Header row */}
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

                                        <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                            <Globe className="h-3 w-3" />
                                            {log.domain || '—'}
                                        </span>

                                        <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                            <Terminal className="h-3 w-3" />
                                            {log.script_name}
                                        </span>

                                        {log.screenshot_urls?.length > 0 && (
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                                <ImageIcon className="h-3 w-3" />
                                                {log.screenshot_urls.length}
                                            </span>
                                        )}

                                        <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                            <Database className="h-3 w-3" />
                                            {computeLogSize(log)}
                                        </span>

                                        <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                            <Clock className="h-3 w-3" />
                                            {formatDate(log.created_at)}
                                        </span>
                                    </button>

                                    {/* Expanded content */}
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
                                                        : <><Copy className="h-4 w-4 mr-2" />Másolás AI-nak</>
                                                    }
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => { setDeleteTarget(log.id); setDeleteConfirmOpen(true); }}
                                                    className="border-red-500/20 hover:bg-red-500/10 text-red-400"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Törlés
                                                </Button>
                                            </div>

                                            {/* Company / User detail row */}
                                            {(log.company_name || log.telephely_name || log.username) && (
                                                <div className="flex flex-wrap gap-4 text-sm">
                                                    {log.company_name && (
                                                        <span className="text-muted-foreground">
                                                            <span className="font-medium text-foreground">Cég:</span> {log.company_name}
                                                        </span>
                                                    )}
                                                    {log.telephely_name && (
                                                        <span className="text-muted-foreground">
                                                            <span className="font-medium text-foreground">Telephely:</span> {log.telephely_name}
                                                        </span>
                                                    )}
                                                    {log.username && (
                                                        <span className="text-muted-foreground">
                                                            <span className="font-medium text-foreground">Felhasználó:</span> {log.username}
                                                            {log.user_id && <span className="text-xs ml-1 opacity-60">({log.user_id})</span>}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                <div>
                                                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Metadata</h4>
                                                    <pre className="text-xs bg-black/30 rounded-md p-3 overflow-x-auto border border-primary/10">
                                                        {JSON.stringify(log.metadata, null, 2)}
                                                    </pre>
                                                </div>
                                            )}

                                            {/* Full log */}
                                            <div>
                                                <h4 className="text-sm font-medium text-muted-foreground mb-2">Teljes napló</h4>
                                                <pre className="text-xs bg-black/30 rounded-md p-3 overflow-x-auto max-h-96 border border-primary/10 whitespace-pre-wrap">
                                                    {log.full_log}
                                                </pre>
                                            </div>

                                            {/* Screenshots */}
                                            {log.screenshot_urls?.length > 0 && (
                                                <div>
                                                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                                                        Képernyőképek ({log.screenshot_urls.length} db)
                                                    </h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                        {log.screenshot_urls.map((url, i) => {
                                                            const signedUrl = screenshotUrls[url];
                                                            // Extract name from URL
                                                            const parts = url.split('/');
                                                            const name = parts[parts.length - 1]?.replace('.png', '') || `screenshot_${i + 1}`;

                                                            return (
                                                                <div key={i} className="border border-primary/10 rounded-lg overflow-hidden bg-black/20">
                                                                    <div className="p-2 text-xs text-muted-foreground font-mono truncate border-b border-primary/10">
                                                                        {name}
                                                                    </div>
                                                                    {signedUrl ? (
                                                                        <img
                                                                            src={signedUrl}
                                                                            alt={name}
                                                                            className="w-full h-auto cursor-pointer hover:opacity-80 transition-opacity"
                                                                            loading="lazy"
                                                                            onClick={() => {
                                                                                const allSignedUrls = log.screenshot_urls
                                                                                    .map(u => screenshotUrls[u])
                                                                                    .filter(Boolean) as string[];
                                                                                const idx = allSignedUrls.indexOf(signedUrl);
                                                                                setLightbox({ urls: allSignedUrls, index: idx >= 0 ? idx : 0 });
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                                                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                                            Betoltes...
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </AnimatedCard>

            {/* Screenshot Lightbox */}
            {lightbox && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
                    onClick={(e) => { if (e.target === e.currentTarget) setLightbox(null); }}
                >
                    {/* Close button */}
                    <button
                        className="absolute top-4 right-4 z-10 text-white/80 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
                        onClick={() => setLightbox(null)}
                    >
                        <X className="h-6 w-6" />
                    </button>

                    {/* Counter */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-mono bg-black/40 px-3 py-1 rounded-full">
                        {lightbox.index + 1} / {lightbox.urls.length}
                    </div>

                    {/* Previous button */}
                    <button
                        className={cn(
                            "absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/40 hover:bg-black/60 transition-colors",
                            lightbox.index > 0 ? "text-white/80 hover:text-white" : "text-white/20 cursor-not-allowed"
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (lightbox.index > 0)
                                setLightbox(prev => prev ? { ...prev, index: prev.index - 1 } : null);
                        }}
                    >
                        <ChevronLeft className="h-8 w-8" />
                    </button>

                    {/* Image — fixed window size regardless of screenshot resolution */}
                    <div
                        className="w-[80vw] h-[85vh] flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            key={lightbox.index}
                            src={lightbox.urls[lightbox.index]}
                            alt={`Screenshot ${lightbox.index + 1}`}
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                        />
                    </div>

                    {/* Next button */}
                    <button
                        className={cn(
                            "absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/40 hover:bg-black/60 transition-colors",
                            lightbox.index < lightbox.urls.length - 1 ? "text-white/80 hover:text-white" : "text-white/20 cursor-not-allowed"
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (lightbox.index < lightbox.urls.length - 1)
                                setLightbox(prev => prev ? { ...prev, index: prev.index + 1 } : null);
                        }}
                    >
                        <ChevronRight className="h-8 w-8" />
                    </button>
                </div>
            )}

            <ConfirmDialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
                title={deleteTarget ? "Log torlese" : "Osszes log torlese"}
                description={
                    deleteTarget
                        ? "Biztosan torolni szeretne ezt a hibanaplot?"
                        : "Biztosan torolni szeretne az OSSZES hibanaplot? Ez a muvelet nem vonhato vissza."
                }
                onConfirm={() => deleteTarget ? handleDelete() : handleDeleteAll()}
                variant="danger"
            />
        </>
    );
}
