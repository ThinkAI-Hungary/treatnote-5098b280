import { useState, useEffect, useCallback, useRef, MouseEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TableCell, TableHead } from '@/components/ui/table';
import { AnimatedTable, AnimatedTableRow } from '@/components/ui/animated-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FileUp, Trash2, Loader2, FileText, Info, Eye, RefreshCw, Pencil, Square } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { GalaxyButton } from './GalaxyButton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TreatmentPlanEditor } from './TreatmentPlanEditor';

interface ExtractionRecord {
  id: string;
  event_id: string;
  source_file_name: string;
  fogalom: string;
  kategoria: string | null;
  trigger_words: string[] | null;
  parsed_file_name: string | null;
  parsed_json: {
    visits?: Array<{
      visit_no: number;
      duration_days?: number;
      healing_time_months?: number;
      items: Array<{
        name: string;
        qty: number;
        unit: string;
      }>;
    }>;
  };
  created_at: string;
}

interface SzabalyepitoTesztTabProps {
  companyId: string | null;
  telephelyId: string | null;
  companyName: string | null;
  telephelyName: string | null;
}

export function SzabalyepitoTesztTab({ companyId, telephelyId, companyName, telephelyName }: SzabalyepitoTesztTabProps) {
  const { user } = useAuth();
  const [records, setRecords] = useState<ExtractionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const abortUploadRef = useRef(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string } | null>(null);
  const [deleteAnchorPosition, setDeleteAnchorPosition] = useState<{ x: number; y: number } | null>(null);

  // Details dialog state
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ExtractionRecord | null>(null);

  // Editor dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ExtractionRecord | null>(null);

  const loadRecords = useCallback(async () => {
    if (!companyId || !telephelyId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('szabalyepito_teszt_extractions')
        .select('*')
        .eq('company_id', companyId)
        .eq('telephely_id', telephelyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecords((data as ExtractionRecord[]) || []);
    } catch (err: any) {
      console.error('Error loading records:', err);
      toast.error('Hiba a rekordok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [companyId, telephelyId]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleFilePrepare = async (file: File): Promise<{ inserted: number; duplicates: number } | null> => {
    if (!companyId || !telephelyId || !companyName || !telephelyName || !user) {
      toast.error('Hiányzó cég vagy telephely azonosító');
      return null;
    }

    // Validate PDF
    if (file.type !== 'application/pdf') {
      toast.error('Csak PDF fájlok tölthetők fel!');
      return null;
    }

    try {
      // Convert file to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // Send to webhook edge function (now synchronous — waits for n8n result)
      const { data, error } = await supabase.functions.invoke('szabalyepito-teszt-webhook', {
        body: {
          file_name: file.name,
          file_content_base64: base64,
          company_id: companyId,
          company_name: companyName,
          telephely_id: telephelyId,
          telephely_name: telephelyName,
          uploaded_by: user.id,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Edge function error');
      }

      if (data?.ok) {
        const inserted = data.inserted ?? 0;
        const duplicates = data.duplicates ?? 0;
        if (inserted > 0 || duplicates > 0) {
          toast.success(`${file.name}: ${inserted} szabály létrehozva${duplicates > 0 ? `, ${duplicates} duplikált` : ''}`);
        } else {
          toast.success(`${file.name}: feldolgozva (nincs új szabály)`);
        }
        return { inserted, duplicates };
      } else {
        const errorMessage = data?.message || 'Webhook küldése sikertelen';
        if (data?.code === 'N8N_WEBHOOK_NOT_REGISTERED') {
          toast.error('Az n8n webhook nincs aktiválva. Nyomja meg az „Execute workflow"-t az n8n-ben.');
        } else {
          toast.error(`${file.name}: ${errorMessage}`);
        }
        return null;
      }
    } catch (err: any) {
      console.error('Error uploading file:', err);
      toast.error(`${file.name}: ${err.message || 'Hiba a fájl feltöltésekor'}`);
      return null;
    }
  };

  const handleMultipleFiles = async (fileList: FileList) => {
    const pdfFiles = Array.from(fileList).filter(f => f.type === 'application/pdf');

    if (pdfFiles.length === 0) {
      toast.error('Csak PDF fájlok tölthetők fel!');
      return;
    }

    if (pdfFiles.length < fileList.length) {
      toast.warning(`${fileList.length - pdfFiles.length} fájl kihagyva (nem PDF)`);
    }

    // Process PDFs sequentially to avoid overwhelming n8n / edge function timeouts
    setUploading(true);
    abortUploadRef.current = false;
    // Yield to the browser so React can re-render and show the abort button
    // before the first long-running await begins.
    await new Promise(resolve => setTimeout(resolve, 50));
    let totalInserted = 0;
    let totalDuplicates = 0;
    let successCount = 0;

    for (let i = 0; i < pdfFiles.length; i++) {
      if (abortUploadRef.current) {
        toast.warning(`Feltöltés leállítva — ${successCount}/${pdfFiles.length} PDF feldolgozva`);
        break;
      }
      setUploadProgress({ current: i + 1, total: pdfFiles.length });
      const result = await handleFilePrepare(pdfFiles[i]);
      if (result) {
        totalInserted += result.inserted;
        totalDuplicates += result.duplicates;
        successCount++;
      }
      // Small delay between uploads to avoid rate limiting
      if (i < pdfFiles.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setUploading(false);
    setUploadProgress(null);

    if (pdfFiles.length > 1) {
      toast.success(`Kész! ${successCount}/${pdfFiles.length} PDF feldolgozva — ${totalInserted} szabály, ${totalDuplicates} duplikált`);
    }

    // Reload records after all uploads complete
    loadRecords();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleMultipleFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleMultipleFiles(files);
    }
    e.target.value = '';
  };

  const openDeleteConfirm = (id: string, event: MouseEvent) => {
    setPendingDelete({ id });
    setDeleteAnchorPosition({ x: event.clientX, y: event.clientY });
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;

    setDeletingId(pendingDelete.id);
    setDeleteConfirmOpen(false);

    try {
      const { error } = await supabase
        .from('szabalyepito_teszt_extractions')
        .delete()
        .eq('id', pendingDelete.id);

      if (error) throw error;

      toast.success('Rekord sikeresen törölve');
      loadRecords();
    } catch (err: any) {
      console.error('Error deleting record:', err);
      toast.error('Hiba a rekord törlésekor');
    } finally {
      setDeletingId(null);
      setPendingDelete(null);
    }
  };

  const openDetailsDialog = (record: ExtractionRecord) => {
    setSelectedRecord(record);
    setDetailsDialogOpen(true);
  };

  const openEditor = (record: ExtractionRecord) => {
    setEditingRecord(record);
    setEditorOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <Card
        className={cn(
          "border-2 border-dashed transition-colors duration-200",
          dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        )}
        data-tour="szabalyepito-upload"
      >
        <CardContent className="py-8">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className="flex flex-col items-center justify-center gap-4"
          >
            <div className="rounded-full bg-primary/10 p-4">
              <FileUp className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium">
                {uploading
                  ? (uploadProgress
                    ? `Feldolgozás: ${uploadProgress.current}/${uploadProgress.total} PDF...`
                    : 'Feldolgozás folyamatban...')
                  : 'Húzza ide a PDF fájlokat'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                vagy kattintson a feltöltéshez (több fájl is kiválasztható)
              </p>
            </div>
            <div className="flex gap-2">
              <label>
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={uploading}
                />
                <GalaxyButton
                  type="button"
                  disabled={uploading}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.parentElement?.querySelector('input');
                    input?.click();
                  }}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {uploadProgress ? `${uploadProgress.current}/${uploadProgress.total}...` : 'Feldolgozás...'}
                    </>
                  ) : (
                    <>
                      <FileUp className="h-4 w-4 mr-2" />
                      PDF kiválasztása
                    </>
                  )}
                </GalaxyButton>
              </label>
              <Button
                variant="outline"
                size="icon"
                onClick={loadRecords}
                disabled={loading}
                title="Frissítés"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
            </div>
            {uploading && (
              <Button
                variant="destructive"
                size="lg"
                onClick={() => {
                  abortUploadRef.current = true;
                  toast.info('Leállítás kérve, az aktuális PDF befejezése után leáll...');
                }}
                className="gap-2 mt-2"
              >
                <Square className="h-4 w-4" />
                Feltöltés leállítása
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Extractions table */}
      <div data-tour="szabalyepito-table">
        <AnimatedTable
          loading={loading}
          headers={
            <>
              <TableHead className="w-[30%]">Fogalom</TableHead>
              <TableHead className="w-[20%]">Forrás fájl</TableHead>
              <TableHead className="w-[15%]">Kategória</TableHead>
              <TableHead className="w-[20%]">Feltöltve</TableHead>
              <TableHead className="w-[15%] text-right">Műveletek</TableHead>
            </>
          }
          isEmpty={records.length === 0}
          emptyMessage="Még nincsenek feldolgozott fogalmak"
          emptyIcon={<FileText className="h-12 w-12" />}
        >
          {records.map((record, index) => (
            <AnimatedTableRow key={record.id} index={index}>
              <TableCell className="font-medium">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help flex items-center gap-2">
                        {record.fogalom}
                        {record.trigger_words && record.trigger_words.length > 0 && (
                          <Info className="h-3 w-3 text-muted-foreground" />
                        )}
                      </span>
                    </TooltipTrigger>
                    {record.trigger_words && record.trigger_words.length > 0 && (
                      <TooltipContent>
                        <p className="text-xs">Trigger szavak:</p>
                        <p className="text-xs text-muted-foreground">
                          {record.trigger_words.join(', ')}
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {record.source_file_name}
              </TableCell>
              <TableCell>
                {record.kategoria ? (
                  <Badge variant="secondary">{record.kategoria}</Badge>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(record.created_at), 'yyyy.MM.dd HH:mm', { locale: hu })}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openDetailsDialog(record)}
                    title="Részletek"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditor(record)}
                    title="Szerkesztés"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => openDeleteConfirm(record.id, e)}
                    disabled={deletingId === record.id}
                    title="Törlés"
                  >
                    {deletingId === record.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
              </TableCell>
            </AnimatedTableRow>
          ))}
        </AnimatedTable>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={handleDeleteConfirm}
        title="Rekord törlése"
        description="Biztosan törölni szeretné ezt a rekordot? Ez a művelet nem vonható vissza."
        confirmText="Törlés"
        cancelText="Mégse"
        variant="danger"
        anchorPosition={deleteAnchorPosition}
      />

      {/* Details dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedRecord?.fogalom}</DialogTitle>
            <DialogDescription>
              Forrás: {selectedRecord?.source_file_name}
              {selectedRecord?.kategoria && ` • Kategória: ${selectedRecord.kategoria}`}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            {selectedRecord?.parsed_json?.visits && selectedRecord.parsed_json.visits.length > 0 ? (
              <div className="space-y-4">
                {selectedRecord.parsed_json.visits.map((visit, visitIndex) => (
                  <Card key={visitIndex}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold">
                          {visit.visit_no}. vizit
                        </h4>
                        {(visit.duration_days !== undefined || visit.healing_time_months !== undefined) && (
                          <div className="text-sm text-muted-foreground">
                            {visit.duration_days !== undefined && `${visit.duration_days} nap`}
                            {visit.duration_days !== undefined && visit.healing_time_months !== undefined && ' • '}
                            {visit.healing_time_months !== undefined && `${visit.healing_time_months} hónap gyógyulás`}
                          </div>
                        )}
                      </div>

                      {visit.items && visit.items.length > 0 && (
                        <div className="space-y-1">
                          {visit.items.map((item, itemIndex) => (
                            <div
                              key={itemIndex}
                              className="flex items-center justify-between py-1 border-b border-border/50 last:border-0"
                            >
                              <span className="text-sm">{item.name}</span>
                              <span className="text-sm text-muted-foreground whitespace-nowrap ml-4">
                                {item.qty} {item.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nincsenek részletes adatok ehhez a fogalomhoz</p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Treatment Plan Editor */}
      {editingRecord && (
        <TreatmentPlanEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          recordId={editingRecord.id}
          fogalom={editingRecord.fogalom}
          sourceFileName={editingRecord.source_file_name}
          initialData={editingRecord.parsed_json}
          onSave={loadRecords}
        />
      )}
    </div>
  );
}
