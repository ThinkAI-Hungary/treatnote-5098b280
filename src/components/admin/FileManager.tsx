import { useState, useEffect, useRef, MouseEvent } from 'react';
import { invokeWithRetry } from '@/lib/supabaseHelpers';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FileManagerTree } from './FileManagerTree';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { 
  FolderPlus, 
  RefreshCw, 
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
import { sanitizePathName } from '@/lib/hungarianNormalizer';
import { notifyUsersDataChanged } from '@/lib/userSyncEvents';

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
  
  // Upload confirmation dialog state
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadReference, setUploadReference] = useState('');

  const fetchTree = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeWithRetry<{ tree: FileNode[] }>('admin-file-manager', {
        operation: 'get-tree',
        path: currentPath
      });

      if (error) throw error;
      setTree(data?.tree || []);
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

      const { data, error } = await invokeWithRetry('admin-file-manager', {
        operation: 'create-folder',
        path: folderPath
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Get filename without extension for the default name
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    
    setPendingFile(file);
    setUploadFileName(nameWithoutExt);
    setUploadReference('');
    setShowUploadDialog(true);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadConfirm = async () => {
    if (!pendingFile || !uploadFileName.trim()) return;

    setUploading(true);
    setShowUploadDialog(false);
    
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        // Get the file extension from original file
        const ext = pendingFile.name.includes('.') ? '.' + pendingFile.name.split('.').pop() : '';
        const finalFileName = uploadFileName.trim() + ext;
        const filePath = currentPath ? `${currentPath}/${finalFileName}` : finalFileName;

        const { error } = await invokeWithRetry('admin-file-manager', { 
          operation: 'upload', 
          path: filePath,
          content: base64,
          contentType: pendingFile.type,
          reference: uploadReference.trim() || undefined
        });

        if (error) throw error;
        
        toast.success('Fájl feltöltve');
        
        // Refresh tree without resetting expanded states - just refetch data
        const { data: treeData, error: fetchError } = await invokeWithRetry<{ tree: FileNode[] }>('admin-file-manager', {
          operation: 'get-tree',
          path: currentPath
        });
        if (!fetchError) {
          setTree(treeData?.tree || []);
        }
      };
      reader.readAsDataURL(pendingFile);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast.error('Hiba a fájl feltöltésekor');
    } finally {
      setUploading(false);
      setPendingFile(null);
      setUploadFileName('');
      setUploadReference('');
    }
  };

  const handleUploadCancel = () => {
    setShowUploadDialog(false);
    setPendingFile(null);
    setUploadFileName('');
    setUploadReference('');
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
      const { error } = await invokeWithRetry('admin-file-manager', { operation, path });

      if (error) throw error;

      // Check if this is a company folder deletion (pattern: TreatNote/Companies/{companyName})
      if (isFolder) {
        const pathParts = path.split('/');
        // Check if it matches the company folder pattern
        if (pathParts.length === 3 && pathParts[0] === 'TreatNote' && pathParts[1] === 'Companies') {
          const companyFolderName = pathParts[2];
          // Find and delete the company from Supabase by matching the sanitized name
          const { data: companies } = await supabase
            .from('companies')
            .select('id, name');
          
          if (companies) {
            const matchingCompany = companies.find(c => 
              sanitizePathName(c.name) === companyFolderName
            );
            
            if (matchingCompany) {
              await supabase.from('companies').delete().eq('id', matchingCompany.id);
              console.log(`Deleted company "${matchingCompany.name}" from database`);
            }
          }
        }
        
        // Check if it's a telephely folder deletion (pattern: TreatNote/Companies/{companyName}/{telephelyName})
        if (pathParts.length === 4 && pathParts[0] === 'TreatNote' && pathParts[1] === 'Companies') {
          const companyFolderName = pathParts[2];
          const telephelyFolderName = pathParts[3];
          
          // Find company first
          const { data: companies } = await supabase
            .from('companies')
            .select('id, name');
          
          if (companies) {
            const matchingCompany = companies.find(c => 
              sanitizePathName(c.name) === companyFolderName
            );
            
            if (matchingCompany) {
              // Find and delete telephely
              const { data: telephelyek } = await supabase
                .from('telephely')
                .select('id, name')
                .eq('company_id', matchingCompany.id);
              
              if (telephelyek) {
                const matchingTelephely = telephelyek.find(t => 
                  sanitizePathName(t.name) === telephelyFolderName
                );
                
                if (matchingTelephely) {
                  await supabase.from('telephely').delete().eq('id', matchingTelephely.id);
                  console.log(`Deleted telephely "${matchingTelephely.name}" from database`);
                }
              }
            }
          }
        }
        
        // Check if it's a user folder deletion (pattern: TreatNote/Companies/{companyName}/{telephelyName}/Users/{userFolder})
        // or pattern: TreatNote/Companies/{companyName}/Users/{userFolder}
        const isUserFolder = pathParts.includes('Users') && pathParts[0] === 'TreatNote' && pathParts[1] === 'Companies';
        if (isUserFolder) {
          const usersIndex = pathParts.indexOf('Users');
          // Only if there's a folder after 'Users'
          if (usersIndex >= 0 && pathParts.length === usersIndex + 2) {
            const userFolderName = pathParts[usersIndex + 1];
            
            // Try to find user by matching sanitized name with profiles
            const { data: profiles } = await supabase
              .from('profiles')
              .select('user_id, full_name');
            
            if (profiles) {
              const matchingProfile = profiles.find(p => 
                p.full_name && sanitizePathName(p.full_name) === userFolderName
              );
              
              if (matchingProfile) {
                // Delete user completely using the delete-user edge function
                try {
                  const { error: deleteError } = await invokeWithRetry('delete-user', {
                    userId: matchingProfile.user_id,
                  });

                  if (deleteError) {
                    console.error('Error deleting user from auth:', deleteError);
                    toast.error('Hiba a felhasználó törlésekor');
                  } else {
                    console.log(`Deleted user "${matchingProfile.full_name}" from database`);
                    toast.success(`Felhasználó "${matchingProfile.full_name}" törölve az adatbázisból`);
                    notifyUsersDataChanged({ userId: matchingProfile.user_id, source: 'file-manager' });
                  }
                } catch (deleteErr) {
                  console.error('Error invoking delete-user function:', deleteErr);
                  toast.error('Hiba a felhasználó törlésekor');
                }
              }
            }
          }
        }
      }

      // If deleting a file from a Szabalyok folder, ensure the folder persists
      if (!isFolder && path.includes('/Szabalyok/')) {
        const folderPath = path.substring(0, path.lastIndexOf('/'));
        // Use create-folder operation instead of upload for placeholder
        await invokeWithRetry('admin-file-manager', { 
          operation: 'create-folder', 
          path: folderPath
        });
      }
      
      toast.success(isFolder ? 'Mappa törölve' : 'Fájl törölve');
      
      // Refresh tree without resetting expanded states - just refetch data
      const { data: treeData, error: fetchError } = await invokeWithRetry<{ tree: FileNode[] }>('admin-file-manager', {
        operation: 'get-tree',
        path: currentPath
      });
      if (!fetchError) {
        setTree(treeData?.tree || []);
      }
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error('Hiba a törlés során');
    }
  };

  const handleDownload = async (path: string) => {
    try {
      const { data, error } = await invokeWithRetry<{ content: string; contentType: string }>('admin-file-manager', {
        operation: 'download',
        path
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
          /
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
        onChange={handleFileSelect}
      />

      {/* Upload confirmation dialog */}
      <Dialog open={showUploadDialog} onOpenChange={(open) => !open && handleUploadCancel()}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Fájl feltöltése</DialogTitle>
            <DialogDescription>
              Adja meg a fájl adatait a feltöltéshez
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fileName">Mi legyen a file neve?</Label>
              <Input
                id="fileName"
                placeholder="Fájl neve"
                value={uploadFileName}
                onChange={(e) => setUploadFileName(e.target.value)}
                className="border-primary/20 focus:border-primary/40"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">Hogyan szeretnének rá hivatkozni?</Label>
              <Textarea
                id="reference"
                placeholder="Hivatkozás (opcionális)"
                value={uploadReference}
                onChange={(e) => setUploadReference(e.target.value)}
                className="border-primary/20 focus:border-primary/40 min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleUploadCancel}>
              Mégse
            </Button>
            <GalaxyButton onClick={handleUploadConfirm} disabled={!uploadFileName.trim() || uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Feltöltés...
                </>
              ) : (
                'Feltöltés'
              )}
            </GalaxyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
