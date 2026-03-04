import { useState } from 'react';
import { ExternalLink, FileText, CheckCircle, Clock, AlertTriangle, Eye, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { formatCurrency, formatDate } from '@/hooks/useBillingDetails';

export interface Invoice {
    id: string;
    number: string | null;
    amount_paid: number;
    amount_due: number;
    currency: string;
    status: string | null;
    created: number;
    period_start: number;
    period_end: number;
    invoice_pdf: string | null;
    hosted_invoice_url: string | null;
    description: string | null;
}

interface InvoiceRowProps {
    invoice: Invoice;
}

function StatusBadge({ status }: { status: string | null }) {
    switch (status) {
        case 'paid':
            return (
                <Badge className="text-[10px] px-2 py-0.5 h-5 gap-1 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                    <CheckCircle className="h-2.5 w-2.5" /> Fizetve
                </Badge>
            );
        case 'open':
            return (
                <Badge className="text-[10px] px-2 py-0.5 h-5 gap-1 bg-primary/10 text-primary border-primary/20">
                    <Clock className="h-2.5 w-2.5" /> Nyitott
                </Badge>
            );
        case 'past_due':
            return (
                <Badge variant="destructive" className="text-[10px] px-2 py-0.5 h-5 gap-1">
                    <AlertTriangle className="h-2.5 w-2.5" /> Késedelmes
                </Badge>
            );
        default:
            return (
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 h-5">
                    {status || 'Ismeretlen'}
                </Badge>
            );
    }
}

export function InvoiceRow({ invoice }: InvoiceRowProps) {
    const [previewOpen, setPreviewOpen] = useState(false);
    const amount = invoice.status === 'paid' ? invoice.amount_paid : invoice.amount_due;

    return (
        <>
            <div
                className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-muted/40 transition-colors group cursor-pointer"
                onClick={() => setPreviewOpen(true)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            {invoice.hosted_invoice_url ? (
                                <a
                                    href={invoice.hosted_invoice_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm font-medium hover:underline hover:text-primary transition-colors flex items-center gap-1"
                                    title="Kattints az online számla megtekintéséhez"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {invoice.number || invoice.id.slice(-8)}
                                    <ExternalLink className="h-3 w-3 opacity-50" />
                                </a>
                            ) : (
                                <span className="text-sm font-medium group-hover:text-primary transition-colors">{invoice.number || invoice.id.slice(-8)}</span>
                            )}
                            <StatusBadge status={invoice.status} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(invoice.created)} · {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm tabular-nums">
                        {formatCurrency(amount, invoice.currency)}
                    </span>

                    {invoice.invoice_pdf && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">

                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={(e) => { e.stopPropagation(); window.open(invoice.invoice_pdf!, '_blank'); }}
                                title="Fájl letöltése"
                            >
                                <Download className="h-3.5 w-3.5" />
                                <span className="sr-only">Letöltés</span>
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-1 sm:p-2 gap-0 overflow-hidden bg-background">
                    <DialogHeader className="px-4 py-3 shrink-0 flex flex-row items-center justify-between border-b border-border/40">
                        <div className="flex flex-col gap-1 text-left">
                            <DialogTitle className="text-base flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary" />
                                Számla: {invoice.number || invoice.id.slice(-8)}
                            </DialogTitle>
                            <DialogDescription className="text-xs">
                                Kiállítva: {formatDate(invoice.created)} · Összeg: {formatCurrency(amount, invoice.currency)}
                            </DialogDescription>
                        </div>
                        {invoice.invoice_pdf && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 mr-8 bg-background hidden sm:flex"
                                onClick={(e) => { e.stopPropagation(); window.open(invoice.invoice_pdf!, '_blank'); }}
                            >
                                <Download className="h-3.5 w-3.5 mr-1.5" /> PDF letöltése
                            </Button>
                        )}
                    </DialogHeader>
                    <div className="flex-1 w-full bg-muted/10 relative">
                        {invoice.invoice_pdf ? (
                            <iframe
                                src={`https://docs.google.com/viewer?url=${encodeURIComponent(invoice.invoice_pdf)}&embedded=true`}
                                className="w-full h-full border-0 absolute inset-0 rounded-b-lg"
                                title={`Számla ${invoice.number || invoice.id}`}
                            />
                        ) : invoice.hosted_invoice_url ? (
                            <iframe
                                src={invoice.hosted_invoice_url}
                                className="w-full h-full border-0 absolute inset-0 rounded-b-lg"
                                title={`Számla ${invoice.number || invoice.id}`}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                                <AlertTriangle className="h-8 w-8 opacity-50" />
                                <p>A számla előnézete nem érhető el.</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
