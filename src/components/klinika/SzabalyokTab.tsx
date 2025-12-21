import { useState, useEffect, useCallback, MouseEvent } from 'react';
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
import { FileUp, Trash2, Loader2, FileText, AlertCircle, Info, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { sanitizeNameForStorage, sanitizeFileName } from '@/lib/hungarianNormalizer';
import { GalaxyButton } from './GalaxyButton';

interface UploadedPdf {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  created_at: string;
  fogalom: string | null;
}

interface SzabalyokTabProps {
  companyId: string | null;
  telephelyId: string | null;
  companyName: string | null;
  telephelyName: string | null;
}

export function SzabalyokTab({ companyId, telephelyId, companyName, telephelyName }: SzabalyokTabProps) {
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
      setFiles(data || []);
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
      const { data: { user } } = await supabase.auth.getUser();
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

      // Save to database with display name, reference (fogalom), and other metadata
      const { error: dbError } = await supabase
        .from('feltoltott_pdf')
        .insert({
          file_name: `${finalFileName}.pdf`,
          file_path: filePath,
          file_size: pendingFile.size,
          company_id: companyId,
          telephely_id: telephelyId,
          uploaded_by: user.id,
          fogalom: uploadReference.trim() || null,
        });

      if (dbError) throw dbError;

      toast.success('Fájl sikeresen feltöltve');
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

  const handleEditSave = async () => {
    if (!editingFile) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('feltoltott_pdf')
        .update({ fogalom: editFogalom.trim() || null })
        .eq('id', editingFile.id);

      if (error) throw error;

      toast.success('Fogalom sikeresen mentve');
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

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card className="border-primary/20 bg-card/80 backdrop-blur-sm">
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
      <Card className="border-primary/20 bg-card/80 backdrop-blur-sm">
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
                <TableHead className="font-semibold">Méret</TableHead>
                <TableHead className="font-semibold">Feltöltve</TableHead>
                <TableHead className="text-right font-semibold">Műveletek</TableHead>
              </>
            }
            isEmpty={files.length === 0}
            emptyMessage="Még nincsenek feltöltött fájlok"
            emptyIcon={<FileText className="h-12 w-12" />}
          >
            {files.map((file, index) => (
              <AnimatedTableRow key={file.id} index={index}>
                <TableCell className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary/60" />
                  {file.file_name}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[200px] truncate">
                  {file.fogalom || <span className="italic text-muted-foreground/50">—</span>}
                </TableCell>
                <TableCell>{formatFileSize(file.file_size)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(file.created_at), 'yyyy. MMM d. HH:mm', { locale: hu })}
                </TableCell>
                <TableCell className="text-right flex items-center justify-end gap-1">
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
                    <TooltipContent side="top" className="max-w-[300px] text-sm">
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
                    <TooltipContent side="top" className="max-w-[300px] text-sm">
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
            <GalaxyButton onClick={handleEditSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Mentés
            </GalaxyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
