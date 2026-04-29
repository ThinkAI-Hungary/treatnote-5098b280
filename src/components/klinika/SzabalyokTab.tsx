import { useState, useEffect, useCallback, useRef, MouseEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TableCell, TableHead } from '@/components/ui/table';
import { AnimatedTable, AnimatedTableRow } from '@/components/ui/animated-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FileUp, Trash2, Loader2, FileText, AlertCircle, Info, Pencil, RefreshCw, Clock, CheckCircle2, XCircle, Hourglass } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { sanitizeNameForStorage, sanitizeFileName } from '@/lib/hungarianNormalizer';
import { GalaxyButton } from './GalaxyButton';
import { Badge } from '@/components/ui/badge';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForStorageObject(params: {
  bucket: string;
  path: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<boolean> {
  const { bucket, path, timeoutMs = 12_000, intervalMs = 600 } = params;

  const lastSlash = path.lastIndexOf('/');
  const folder = lastSlash >= 0 ? path.slice(0, lastSlash) : '';
  const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, {
      limit: 100,
      search: name,
    });

    if (!error && data?.some((o) => o.name === name)) return true;
    await sleep(intervalMs);
  }

  return false;
}

type WebhookStatus = 'idle' | 'feldolgozas_alatt' | 'feldolgozva' | 'hiba';

interface UploadedPdf {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  created_at: string;
  fogalom: string | null;
  webhook_status: WebhookStatus;
}

// Webhook is now handled by the szabalyok-webhook edge function

interface SzabalyokTabProps {
  companyId: string | null;
  telephelyId: string | null;
  companyName: string | null;
  telephelyName: string | null;
}

export function SzabalyokTab({ companyId, telephelyId, companyName, telephelyName }: SzabalyokTabProps) {
  const { user } = useAuth();
  const [files, setFiles] = useState<UploadedPdf[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; filePath: string } | null>(null);
  const [deleteAnchorPosition, setDeleteAnchorPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Upload dialog state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadReference, setUploadReference] = useState('');
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<UploadedPdf | null>(null);
  const [editFogalom, setEditFogalom] = useState('');
  const [saving, setSaving] = useState(false);
  const [reprocessWarningOpen, setReprocessWarningOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  
  // PDF Preview dialog state
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedPdf | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageWidth, setPageWidth] = useState(900);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  // Extraction details dialog state
  interface ExtractionItem {
    qty: number;
    unit: string;
    name: string;
  }
  interface ExtractionVisit {
    visit_no: number;
    duration_days?: number;
    healing_time_months?: number;
    items: ExtractionItem[];
  }
  const [extractionDialogOpen, setExtractionDialogOpen] = useState(false);
  const [extractionVisits, setExtractionVisits] = useState<ExtractionVisit[]>([]);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionFogalom, setExtractionFogalom] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    if (!companyId || !telephelyId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('feltoltott_pdf')
        .select('*')
        .eq('company_id', companyId)
        .eq('telephely_id', telephelyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFiles((data as UploadedPdf[]) || []);
    } catch (err: any) {
      console.error('Error loading files:', err);
      toast.error('Hiba a fájlok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [companyId, telephelyId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (!previewDialogOpen) return;
    const el = previewContainerRef.current;
    if (!el) return;

    const update = () => {
      const width = Math.max(320, Math.min(980, el.clientWidth - 32));
      setPageWidth(width);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewDialogOpen]);

  type WebhookResult = {
    status: WebhookStatus;
    code?: string;
    message?: string;
  };

  // Send webhook via edge function and update status
  const sendWebhook = async (
    pdfId: string,
    fileName: string,
    fogalom: string | null,
    storagePath: string,
    epochMillis: number
  ): Promise<WebhookResult> => {
    try {
      // Update status to "feldolgozas_alatt"
      await supabase
        .from('feltoltott_pdf')
        .update({ webhook_status: 'feldolgozas_alatt' })
        .eq('id', pdfId);

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('szabalyok-webhook', {
        body: {
          pdf_id: pdfId,
          file_name: fileName,
          fogalom: fogalom,
          company_id: companyId,
          company_name: companyName,
          telephely_id: telephelyId,
          telephely_name: telephelyName,
          epoch_millis: epochMillis,
          storage_path: storagePath,
          uploaded_by: user?.id || null,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Edge function error');
      }

      const status: WebhookStatus = data?.ok ? 'feldolgozva' : 'hiba';
      const code = (data?.code as string | undefined) ?? undefined;
      const message = (data?.message as string | undefined) ?? undefined;

      if (!data?.ok) {
        console.error('Webhook failed:', message || 'Unknown error');
      }

      // Update status in database
      await supabase
        .from('feltoltott_pdf')
        .update({ webhook_status: status })
        .eq('id', pdfId);

      return { status, code, message };
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);

      // supabase-js invoke errors often look like:
      // "Edge function returned 502: Error, {\"ok\":false,...}"
      let code: string | undefined;
      let message: string | undefined;
      const jsonMatch = rawMessage.match(/\{[\s\S]*\}$/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as { code?: unknown; message?: unknown };
          if (typeof parsed.code === 'string') code = parsed.code;
          if (typeof parsed.message === 'string') message = parsed.message;
        } catch {
          // ignore
        }
      }

      console.error('Webhook error:', err);

      // Update status to "hiba"
      await supabase
        .from('feltoltott_pdf')
        .update({ webhook_status: 'hiba' })
        .eq('id', pdfId);

      return { status: 'hiba', code, message: message || rawMessage };
    }
  };

  // Retry webhook for failed/idle uploads
  const handleRetryWebhook = async (file: UploadedPdf) => {
    setRetryingId(file.id);
    try {
      // Extract epoch_millis from file_path (format: .../epoch_filename.pdf)
      const pathParts = file.file_path.split('/');
      const filename = pathParts[pathParts.length - 1];
      const epochMatch = filename.match(/^(\d+)_/);
      const epochMillis = epochMatch ? parseInt(epochMatch[1], 10) : Date.now();

      const result = await sendWebhook(file.id, file.file_name, file.fogalom, file.file_path, epochMillis);
      if (result.status === 'feldolgozva') {
        toast.success('Webhook sikeresen elküldve');
      } else {
        toast.error(
          result.code === 'N8N_WEBHOOK_NOT_REGISTERED'
            ? 'Az n8n webhook nincs aktiválva (Test URL). Nyomd meg az „Execute workflow”-t, vagy használd a Production URL-t.'
            : result.message || 'Webhook küldése sikertelen'
        );
      }
      loadFiles();
    } finally {
      setRetryingId(null);
    }
  };

  const handleFilePrepare = (file: File) => {
    if (!companyId || !telephelyId) {
      toast.error('Hiányzó cég vagy telephely azonosító');
      return;
    }

    if (!companyName || !telephelyName) {
      toast.error('Hiányzó cég vagy telephely név');
      return;
    }

    // Validate PDF
    if (file.type !== 'application/pdf') {
      setError('Csak PDF fájlok tölthetők fel! A kiválasztott fájl típusa: ' + file.type);
      toast.error('Csak PDF fájlok tölthetők fel!');
      return;
    }

    // Open dialog with file details
    setPendingFile(file);
    setUploadFileName(file.name.replace('.pdf', ''));
    setUploadReference('');
    setUploadDialogOpen(true);
  };

  const handleUploadConfirm = async () => {
    if (!pendingFile || !companyId || !telephelyId || !companyName || !telephelyName) return;

    setError(null);
    setUploading(true);
    setUploadDialogOpen(false);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Nincs bejelentkezett felhasználó');

      // Create folder structure using the normalizer
      const sanitizedCompany = sanitizeNameForStorage(companyName);
      const sanitizedTelephely = sanitizeNameForStorage(telephelyName);
      const folderPath = `TreatNote/Companies/${sanitizedCompany}/${sanitizedTelephely}/Szabalyok`;

      // Create unique file path with timestamp and sanitized filename
      const timestamp = Date.now();
      const finalFileName = uploadFileName.trim() || pendingFile.name.replace('.pdf', '');
      const sanitizedFinalName = sanitizeFileName(`${finalFileName}.pdf`);
      const filePath = `${folderPath}/${timestamp}_${sanitizedFinalName}`;

      // Upload to client-files bucket (same as admin file manager)
      const { error: uploadError } = await supabase.storage
        .from('client-files')
        .upload(filePath, pendingFile);

      if (uploadError) throw uploadError;

      // Wait until the object is visible in Storage before continuing (avoid race conditions)
      toast.info('Feltöltés kész, ellenőrzöm a tárhelyen…');
      const isPresent = await waitForStorageObject({ bucket: 'client-files', path: filePath });
      if (!isPresent) {
        throw new Error('A feltöltött fájl még nem elérhető a tárhelyen. Próbáld újra pár másodperc múlva.');
      }

      // Save to database with display name, reference (fogalom), and other metadata
      const { data: insertedData, error: dbError } = await supabase
        .from('feltoltott_pdf')
        .insert({
          file_name: `${finalFileName}.pdf`,
          file_path: filePath,
          file_size: pendingFile.size,
          company_id: companyId,
          telephely_id: telephelyId,
          uploaded_by: user.id,
          fogalom: uploadReference.trim() || null,
          webhook_status: 'idle',
        })
        .select()
        .single();

      if (dbError) throw dbError;

      toast.success('Fájl sikeresen feltöltve');

      // Send webhook after successful upload
      if (insertedData) {
        const result = await sendWebhook(
          insertedData.id,
          `${finalFileName}.pdf`,
          uploadReference.trim() || null,
          filePath,
          timestamp
        );

        if (result.status !== 'feldolgozva') {
          toast.error(
            result.code === 'N8N_WEBHOOK_NOT_REGISTERED'
              ? 'Az n8n webhook nincs aktiválva (Test URL). Nyomd meg az „Execute workflow”-t, vagy használd a Production URL-t.'
              : result.message || 'A webhook feldolgozás sikertelen'
          );
        }
      }

      loadFiles();
    } catch (err: any) {
      console.error('Error uploading file:', err);
      toast.error(err.message || 'Hiba a fájl feltöltésekor');
    } finally {
      setUploading(false);
      setPendingFile(null);
      setUploadFileName('');
      setUploadReference('');
    }
  };

  const handleUploadCancel = () => {
    setUploadDialogOpen(false);
    setPendingFile(null);
    setUploadFileName('');
    setUploadReference('');
  };

  const openEditDialog = (file: UploadedPdf) => {
    setEditingFile(file);
    setEditFogalom(file.fogalom || '');
    setEditDialogOpen(true);
  };

  const handleEditCancel = () => {
    setEditDialogOpen(false);
    setEditingFile(null);
    setEditFogalom('');
  };

  const handleEditSaveClick = () => {
    if (!editingFile) return;
    
    // If the file is already processed and fogalom changed, show warning
    const fogalomChanged = (editFogalom.trim() || null) !== (editingFile.fogalom || null);
    if (editingFile.webhook_status === 'feldolgozva' && fogalomChanged) {
      setReprocessWarningOpen(true);
    } else {
      handleEditSave(false);
    }
  };

  const handleEditSave = async (reprocess: boolean) => {
    if (!editingFile) return;
    
    setSaving(true);
    setReprocessWarningOpen(false);
    
    try {
      const newFogalom = editFogalom.trim() || null;
      const { error } = await supabase
        .from('feltoltott_pdf')
        .update({ fogalom: newFogalom })
        .eq('id', editingFile.id);

      if (error) throw error;

      toast.success('Fogalom sikeresen mentve');
      
      // If reprocessing is needed, trigger webhook
      if (reprocess) {
        // Extract epoch_millis from file_path
        const pathParts = editingFile.file_path.split('/');
        const filename = pathParts[pathParts.length - 1];
        const epochMatch = filename.match(/^(\d+)_/);
        const epochMillis = epochMatch ? parseInt(epochMatch[1], 10) : Date.now();

        const result = await sendWebhook(editingFile.id, editingFile.file_name, newFogalom, editingFile.file_path, epochMillis);
        if (result.status === 'feldolgozva') {
          toast.info('A PDF újrafeldolgozása elindult');
        } else {
          toast.error(
            result.code === 'N8N_WEBHOOK_NOT_REGISTERED'
              ? 'Az n8n webhook nincs aktiválva (Test URL). Nyomd meg az „Execute workflow”-t, vagy használd a Production URL-t.'
              : result.message || 'Újrafeldolgozás indítása sikertelen'
          );
        }
      }
      
      setEditDialogOpen(false);
      setEditingFile(null);
      setEditFogalom('');
      loadFiles();
    } catch (err: any) {
      console.error('Error updating fogalom:', err);
      toast.error('Hiba a fogalom mentésekor');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirm = (id: string, filePath: string, event: MouseEvent) => {
    setPendingDelete({ id, filePath });
    setDeleteAnchorPosition({ x: event.clientX, y: event.clientY });
    setDeleteConfirmOpen(true);
  };

  // Open extraction details dialog for processed PDFs
  const openExtractionDetails = async (file: UploadedPdf) => {
    if (file.webhook_status !== 'feldolgozva') return;
    
    setExtractionFogalom(file.fogalom);
    setExtractionLoading(true);
    setExtractionDialogOpen(true);
    setExtractionVisits([]);

    try {
      const { data, error } = await supabase
        .from('pdf_extractions')
        .select('raw_json')
        .eq('document_id', file.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data?.raw_json) {
        // Navigate to parsed.visits in the raw_json structure
        const rawJson = data.raw_json as any;
        const visits = rawJson?.[0]?.parsed?.visits || rawJson?.parsed?.visits || [];
        setExtractionVisits(visits);
      }
    } catch (err) {
      console.error('Error loading extraction details:', err);
      toast.error('Hiba az extrakció betöltésekor');
    } finally {
      setExtractionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    
    const { id, filePath } = pendingDelete;
    setDeleteConfirmOpen(false);
    setDeletingId(id);
    
    try {
      // Delete from client-files bucket
      const { error: storageError } = await supabase.storage
        .from('client-files')
        .remove([filePath]);

      if (storageError) {
        console.error('Storage delete error:', storageError);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('feltoltott_pdf')
        .delete()
        .eq('id', id);

      if (dbError) throw dbError;

      // Ensure the Szabalyok folder persists by creating a placeholder if needed
      if (companyName && telephelyName) {
        const sanitizedCompany = sanitizeNameForStorage(companyName);
        const sanitizedTelephely = sanitizeNameForStorage(telephelyName);
        const folderPath = `TreatNote/Companies/${sanitizedCompany}/${sanitizedTelephely}/Szabalyok`;
        
        // Create placeholder to keep folder visible
        const placeholderPath = `${folderPath}/.folder_placeholder`;
        await supabase.storage
          .from('client-files')
          .upload(placeholderPath, new Blob(['']), { upsert: true });
      }

      toast.success('Fájl törölve');
      loadFiles();
    } catch (err: any) {
      console.error('Error deleting file:', err);
      toast.error('Hiba a fájl törlésekor');
    } finally {
      setDeletingId(null);
      setPendingDelete(null);
      setDeleteAnchorPosition(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFilePrepare(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFilePrepare(e.target.files[0]);
    }
    e.target.value = '';
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const openPdfPreview = async (file: UploadedPdf) => {
    setPreviewFile(file);
    setPreviewDialogOpen(true);
    setPreviewLoading(true);
    setNumPages(0);
    setPreviewBlob(null);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    try {
      const { data, error } = await supabase.storage
        .from('client-files')
        .download(file.file_path);

      if (error) throw error;

      setPreviewBlob(data);

      const blobUrl = URL.createObjectURL(data);
      setPreviewUrl(blobUrl);
    } catch (err) {
      console.error('Error getting PDF:', err);
      toast.error('Hiba a PDF betöltésekor');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePdfPreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewDialogOpen(false);
    setPreviewFile(null);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setNumPages(0);
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card data-tour="szabalyok-upload" className="border-primary/20 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" />
            PDF Fájl Feltöltése
          </CardTitle>
          <CardDescription>
            Húzza ide a PDF fájlt vagy kattintson a feltöltéshez
            {companyName && telephelyName && (
              <span className="block mt-1 text-xs">
                Mentési hely: TreatNote/Companies/{companyName}/{telephelyName}/Szabalyok
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300",
              dragActive 
                ? "border-primary bg-primary/10 scale-[1.02]" 
                : "border-primary/30 hover:border-primary/60 hover:bg-primary/5",
              uploading && "pointer-events-none opacity-50"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => document.getElementById('pdf-upload')?.click()}
          >
            <input
              id="pdf-upload"
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />
            
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <span className="text-lg font-medium text-muted-foreground">Feltöltés...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <FileUp 
                    className={cn(
                      "h-16 w-16 transition-transform duration-300",
                      dragActive ? "scale-110" : ""
                    )}
                    style={{ 
                      color: dragActive ? 'hsl(var(--primary))' : undefined,
                      stroke: 'url(#neon-gradient)'
                    }}
                  />
                  <svg width="0" height="0">
                    <defs>
                      <linearGradient id="neon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="hsl(300 70% 60%)" />
                        <stop offset="100%" stopColor="hsl(60 90% 55%)" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <span 
                  className="text-xl font-semibold"
                  style={{
                    background: 'linear-gradient(135deg, hsl(300 70% 60%), hsl(60 90% 55%))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  File feltöltése
                </span>
                <span className="text-sm text-muted-foreground">
                  Csak PDF formátum elfogadott
                </span>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Files Table */}
      <Card data-tour="szabalyok-table" className="border-primary/20 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Feltöltött Szabályzatok
          </CardTitle>
          <CardDescription>
            A telephelyhez tartozó PDF dokumentumok
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnimatedTable
            loading={loading}
            headers={
              <>
                <TableHead className="font-semibold">Fájlnév</TableHead>
                <TableHead className="font-semibold">Fogalom</TableHead>
                <TableHead className="font-semibold">Feltöltve</TableHead>
                <TableHead className="font-semibold">Státusz</TableHead>
                <TableHead className="text-right font-semibold">Műveletek</TableHead>
              </>
            }
            isEmpty={files.length === 0}
            emptyMessage="Még nincsenek feltöltött fájlok"
            emptyIcon={<FileText className="h-12 w-12" />}
          >
            {files.map((file, index) => (
              <AnimatedTableRow key={file.id} index={index}>
                <TableCell className="font-medium">
                  <button
                    onClick={() => openPdfPreview(file)}
                    className="flex items-center gap-2 hover:text-primary transition-colors cursor-pointer text-left"
                  >
                    <FileText className="h-4 w-4 text-primary/60 shrink-0" />
                    <span className="hover:underline">{file.file_name}</span>
                  </button>
                </TableCell>
                <TableCell className="max-w-[200px]">
                  {file.webhook_status === 'feldolgozva' && file.fogalom ? (
                    <button
                      onClick={() => openExtractionDetails(file)}
                      className="text-muted-foreground hover:text-primary hover:underline transition-colors cursor-pointer text-left truncate block w-full"
                      title="Kattints a részletek megtekintéséhez"
                    >
                      {file.fogalom}
                    </button>
                  ) : (
                    <span className={cn("truncate block", file.fogalom ? "text-muted-foreground" : "italic text-muted-foreground/50")}>
                      {file.fogalom || "—"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(file.created_at), 'yyyy. MMM d. HH:mm', { locale: hu })}
                </TableCell>
                <TableCell data-tour="szabalyok-status">
                  {file.webhook_status === 'feldolgozva' && (
                    <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Feldolgozva
                    </Badge>
                  )}
                  {file.webhook_status === 'feldolgozas_alatt' && (
                    <Badge variant="default" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                      <Hourglass className="h-3 w-3 mr-1 animate-pulse" />
                      Feldolgozás alatt
                    </Badge>
                  )}
                  {file.webhook_status === 'hiba' && (
                    <Badge variant="destructive" className="bg-destructive/20 text-destructive border-destructive/30">
                      <XCircle className="h-3 w-3 mr-1" />
                      Hiba
                    </Badge>
                  )}
                  {file.webhook_status === 'idle' && (
                    <Badge variant="secondary" className="bg-muted/50 text-muted-foreground border-muted">
                      <Clock className="h-3 w-3 mr-1" />
                      Idle
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right flex items-center justify-end gap-1">
                  {(file.webhook_status === 'hiba' || file.webhook_status === 'idle') && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => handleRetryWebhook(file)}
                            disabled={retryingId === file.id}
                          >
                            {retryingId === file.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Webhook újraküldése</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-primary hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => openEditDialog(file)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => openDeleteConfirm(file.id, file.file_path, e)}
                    disabled={deletingId === file.id}
                  >
                    {deletingId === file.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </AnimatedTableRow>
            ))}
          </AnimatedTable>
        </CardContent>
      </Card>

      {/* Upload Confirmation Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5 text-primary" />
              Fájl feltöltése
            </DialogTitle>
            <DialogDescription>
              Adja meg a fájl adatait a feltöltés előtt
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="file-name">Mi legyen a file neve?</Label>
              <Input
                id="file-name"
                placeholder="Fájl neve"
                value={uploadFileName}
                onChange={(e) => setUploadFileName(e.target.value)}
                className="border-primary/20 focus:border-primary/40"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="reference">Hogyan szeretnének rá hivatkozni?</Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help hover:text-primary transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8} collisionPadding={16} className="max-w-[300px] text-sm z-[100]">
                      Az ide beírt szó fogja aktiválni a PDF-ből kiolvasott fogalmat. Pl: Feltöltésre kerül egy "Foghúzás és implantálás ideiglenessel.pdf", ellenben a megszokott rendelői "nyelvjárás"-ban ez máshogy van használva, akkor a lenti dobozba beírt fogalom fogja ezt jelenteni.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Textarea
                id="reference"
                placeholder="Ezzel a kimondott fogalommal lehet majd aktiválni a szabályt"
                value={uploadReference}
                onChange={(e) => setUploadReference(e.target.value)}
                className="border-primary/20 focus:border-primary/40 min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleUploadCancel}>
              Mégse
            </Button>
            <GalaxyButton 
              onClick={handleUploadConfirm} 
              disabled={!uploadFileName.trim() || !uploadReference.trim()}
            >
              Feltöltés
            </GalaxyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) {
            setPendingDelete(null);
            setDeleteAnchorPosition(null);
          }
        }}
        title="PDF fájl törlése"
        description="Biztosan törölni szeretné ezt a fájlt?"
        onConfirm={handleDelete}
        anchorPosition={deleteAnchorPosition}
      />

      {/* Edit Fogalom Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Fogalom szerkesztése
            </DialogTitle>
            <DialogDescription>
              Módosítsa a hivatkozási szöveget: <span className="font-medium text-foreground">{editingFile?.file_name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="edit-fogalom">Hogyan szeretnének rá hivatkozni?</Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help hover:text-primary transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8} collisionPadding={16} className="max-w-[300px] text-sm z-[100]">
                      Az ide beírt szó fogja aktiválni a PDF-ből kiolvasott fogalmat. Pl: Feltöltésre kerül egy "Foghúzás és implantálás ideiglenessel.pdf", ellenben a megszokott rendelői "nyelvjárás"-ban ez máshogy van használva, akkor a lenti dobozba beírt fogalom fogja ezt jelenteni.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Textarea
                id="edit-fogalom"
                placeholder="Ezzel a kimondott fogalommal lehet majd aktiválni a szabályt"
                value={editFogalom}
                onChange={(e) => setEditFogalom(e.target.value)}
                className="border-primary/20 focus:border-primary/40 min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleEditCancel} disabled={saving}>
              Mégse
            </Button>
            <GalaxyButton onClick={handleEditSaveClick} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Mentés
            </GalaxyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-process Warning Dialog */}
      <Dialog open={reprocessWarningOpen} onOpenChange={setReprocessWarningOpen}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertCircle className="h-5 w-5" />
              Újrafeldolgozás szükséges
            </DialogTitle>
            <DialogDescription>
              Ez a PDF már fel lett dolgozva. Ha módosítja a fogalmat, a dokumentumot újra kell feldolgozni.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Biztosan menti a módosítást és elindítja az újrafeldolgozást?
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReprocessWarningOpen(false)} disabled={saving}>
              Mégse
            </Button>
            <GalaxyButton onClick={() => handleEditSave(true)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Mentés és újrafeldolgozás
            </GalaxyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={(open) => !open && closePdfPreview()}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {previewFile?.file_name}
            </DialogTitle>
            {previewFile?.fogalom && (
              <DialogDescription>
                Fogalom: {previewFile.fogalom}
              </DialogDescription>
            )}
          </DialogHeader>
          <div
            ref={previewContainerRef}
            className="flex-1 min-h-0 rounded-lg overflow-hidden border border-primary/20 bg-muted/30"
          >
            {previewLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : previewBlob ? (
              <div className="h-full overflow-auto p-4">
                <Document
                  file={previewBlob}
                  onLoadSuccess={({ numPages: nextNumPages }) => setNumPages(nextNumPages)}
                  loading={
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  }
                  error={
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                      <AlertCircle className="h-8 w-8" />
                      <span>Nem sikerült betölteni a PDF-et</span>
                    </div>
                  }
                >
                  {Array.from(new Array(numPages || 0), (_, i) => (
                    <div key={`page_${i + 1}`} className="mb-6 flex justify-center">
                      <Page
                        pageNumber={i + 1}
                        width={pageWidth}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </div>
                  ))}
                </Document>

                {previewUrl && (
                  <div className="flex justify-center pb-2">
                    <a
                      href={previewUrl}
                      download={previewFile?.file_name}
                      className="text-primary hover:underline"
                    >
                      Letöltés
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <AlertCircle className="h-8 w-8" />
                <span>Nem sikerült betölteni a PDF-et</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Extraction Details Dialog */}
      <Dialog open={extractionDialogOpen} onOpenChange={setExtractionDialogOpen}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Feldolgozott adatok
            </DialogTitle>
            {extractionFogalom && (
              <DialogDescription>
                Fogalom: {extractionFogalom}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {extractionLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : extractionVisits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <AlertCircle className="h-8 w-8" />
                <span>Nincs elérhető adat</span>
              </div>
            ) : (
              <div className="space-y-6 py-4">
                {extractionVisits.map((visit) => (
                  <div key={visit.visit_no} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-semibold">
                        {visit.visit_no}. Vizit
                      </Badge>
                      {visit.healing_time_months !== undefined && visit.healing_time_months > 0 && (
                        <span className="text-xs text-muted-foreground">
                          (gyógyulási idő: {visit.healing_time_months} hónap)
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 pl-4 border-l-2 border-primary/20">
                      {visit.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-baseline gap-2 text-sm py-1.5 hover:bg-muted/30 rounded px-2 -ml-2 transition-colors"
                        >
                          <span className="font-medium text-primary min-w-[3rem] text-right">
                            {item.qty} {item.unit}
                          </span>
                          <span className="text-foreground">{item.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtractionDialogOpen(false)}>
              Bezárás
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
