import { useState, useEffect, useRef, MouseEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileManagerTree } from './FileManagerTree';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AnimatedTable, AnimatedTableRow } from '@/components/ui/animated-table';
import { 
  FolderPlus, 
  Upload, 
  RefreshCw, 
  Home,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { GalaxyButton } from '@/components/klinika/GalaxyButton';

interface FileNode {
  name: string;
  type: 'folder' | 'file';
  size?: number;
  children?: FileNode[];
}

export function FileManager() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ path: string; isFolder: boolean } | null>(null);
  const [deleteAnchorPosition, setDeleteAnchorPosition] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTree = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-file-manager', {
        body: { operation: 'get-tree', path: currentPath }
      });

      if (error) throw error;
      setTree(data.tree || []);
    } catch (error: any) {
      console.error('Error fetching file tree:', error);
      toast.error('Hiba a fájlok betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
  }, [currentPath]);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
  };

  const handleGoHome = () => {
    setCurrentPath('');
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error('Kérem adjon meg egy mappanevet');
      return;
    }

    try {
      const folderPath = currentPath 
        ? `${currentPath}/${newFolderName.trim()}` 
        : newFolderName.trim();

      const { data, error } = await supabase.functions.invoke('admin-file-manager', {
        body: { operation: 'create-folder', path: folderPath }
      });

      if (error) throw error;
      
      toast.success('Mappa létrehozva');
      setNewFolderName('');
      setShowNewFolderDialog(false);
      await fetchTree();
    } catch (error: any) {
      console.error('Error creating folder:', error);
      toast.error('Hiba a mappa létrehozásakor: ' + (error.message || 'Ismeretlen hiba'));
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;

        const { error } = await supabase.functions.invoke('admin-file-manager', {
          body: { 
            operation: 'upload', 
            path: filePath,
            content: base64,
            contentType: file.type
          }
        });

        if (error) throw error;
        
        toast.success('Fájl feltöltve');
        fetchTree();
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast.error('Hiba a fájl feltöltésekor');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = (path: string, isFolder: boolean, event?: MouseEvent) => {
    setPendingDelete({ path, isFolder });
    if (event) {
      setDeleteAnchorPosition({ x: event.clientX, y: event.clientY });
    } else {
      setDeleteAnchorPosition(null);
    }
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    
    const { path, isFolder } = pendingDelete;
    setDeleteConfirmOpen(false);
    setPendingDelete(null);
    setDeleteAnchorPosition(null);

    try {
      const operation = isFolder ? 'delete-folder' : 'delete';
      const { error } = await supabase.functions.invoke('admin-file-manager', {
        body: { operation, path }
      });

      if (error) throw error;
      
      toast.success(isFolder ? 'Mappa törölve' : 'Fájl törölve');
      fetchTree();
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error('Hiba a törlés során');
    }
  };

  const handleDownload = async (path: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-file-manager', {
        body: { operation: 'download', path }
      });

      if (error) throw error;

      const byteCharacters = atob(data.content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.contentType || 'application/octet-stream' });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.split('/').pop() || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Fájl letöltve');
    } catch (error: any) {
      console.error('Error downloading:', error);
      toast.error('Hiba a letöltés során');
    }
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Fájlkezelő
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNewFolderDialog(true)}
            className="border-primary/20 hover:border-primary/40"
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            Új mappa
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="border-primary/20 hover:border-primary/40"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Feltöltés
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchTree}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
      
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={handleGoHome}
        >
          <Home className="h-4 w-4" />
        </Button>
        {pathParts.map((part, idx) => (
          <div key={idx} className="flex items-center">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => handleNavigate(pathParts.slice(0, idx + 1).join('/'))}
            >
              {part}
            </Button>
          </div>
        ))}
      </div>

      {/* File Tree */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Loader2 
                className="h-10 w-10 animate-spin"
                style={{ stroke: 'url(#loader-gradient-fm)' }}
              />
              <svg width="0" height="0">
                <defs>
                  <linearGradient id="loader-gradient-fm" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(var(--accent))" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">Betöltés...</span>
          </div>
        </div>
      ) : (
        <FileManagerTree
          tree={tree}
          currentPath={currentPath}
          onNavigate={handleNavigate}
          onDelete={(path, isFolder) => handleDelete(path, isFolder)}
          onDownload={handleDownload}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleUpload}
      />

      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Új mappa létrehozása</DialogTitle>
            <DialogDescription>
              Adja meg az új mappa nevét
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Mappa neve"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            autoFocus
            className="border-primary/20 focus:border-primary/40"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
              Mégse
            </Button>
            <GalaxyButton onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Létrehozás
            </GalaxyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) setDeleteAnchorPosition(null);
        }}
        title={pendingDelete?.isFolder ? 'Mappa törlése' : 'Fájl törlése'}
        description={
          pendingDelete?.isFolder
            ? 'Biztosan törölni szeretné ezt a mappát és annak teljes tartalmát?'
            : 'Biztosan törölni szeretné ezt a fájlt?'
        }
        onConfirm={confirmDelete}
        anchorPosition={deleteAnchorPosition}
      />
    </div>
  );
}
