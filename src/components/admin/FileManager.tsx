import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileManagerTree } from './FileManagerTree';
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

      console.log('Creating folder:', folderPath);

      const { data, error } = await supabase.functions.invoke('admin-file-manager', {
        body: { operation: 'create-folder', path: folderPath }
      });

      console.log('Create folder response:', data, error);

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

  const handleDelete = async (path: string, isFolder: boolean) => {
    const confirmed = window.confirm(
      isFolder 
        ? 'Biztosan törölni szeretné ezt a mappát és tartalmát?' 
        : 'Biztosan törölni szeretné ezt a fájlt?'
    );
    
    if (!confirmed) return;

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
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Fájlkezelő</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewFolderDialog(true)}
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              Új mappa
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
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
        <div className="flex items-center gap-1 text-sm mt-2">
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
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <FileManagerTree
            tree={tree}
            currentPath={currentPath}
            onNavigate={handleNavigate}
            onDelete={handleDelete}
            onDownload={handleDownload}
          />
        )}
      </CardContent>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleUpload}
      />

      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
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
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
              Mégse
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Létrehozás
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
