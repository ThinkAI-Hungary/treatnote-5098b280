import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Download, FileText, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface FileItem {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  created_at: string;
}

interface ProfileData {
  subscription_status: string;
  subscription_end_date: string | null;
}

const Downloads = () => {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    loadFiles();
    loadProfile();

    // Subscribe to real-time changes in files table
    const filesChannel = supabase
      .channel('files-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'files'
        },
        () => {
          loadFiles();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(filesChannel);
    };
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('subscription_status, subscription_end_date')
      .eq('user_id', user.id)
      .single();

    setProfile(data);
  };

  const loadFiles = async () => {
    if (!user) return;

    // Get all files using the RLS policy that checks folder access
    const { data: filesData } = await supabase
      .from('files')
      .select('id, file_name, file_url, file_size, created_at')
      .order('created_at', { ascending: false });

    setFiles(filesData || []);
    setLoading(false);
  };

  const canDownload = () => {
    if (!profile) return false;
    
    // Check if subscription is active
    if (profile.subscription_status !== 'active') {
      return false;
    }
    
    // Check if subscription hasn't expired
    if (profile.subscription_end_date) {
      const endDate = new Date(profile.subscription_end_date);
      if (endDate < new Date()) {
        return false;
      }
    }
    
    return true;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Ismeretlen';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    if (!canDownload()) {
      toast.error('Aktív előfizetés szükséges a letöltéshez');
      return;
    }

    try {
      const encodedPath = encodeURI(fileUrl);
      console.log('Attempting to download file:', { fileUrl, encodedPath, fileName });
      
      const { data, error } = await supabase.storage.from('client-files').download(encodedPath);
      
      if (error) {
        console.error('Download error:', error);
        toast.error(error.message || 'Nem sikerült a fájl letöltése. Próbálja újra.');
        return;
      }

      if (data) {
        console.log('Download successful, creating blob URL');
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast.success(`${fileName} letöltése elkezdődött`);
      }
    } catch (error) {
      console.error('Unexpected download error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Váratlan hiba történt a letöltés során';
      toast.error(errorMessage);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Letöltések</h1>
          <p className="text-muted-foreground mt-2">Elérhető fájlok</p>
        </div>

        {profile && !canDownload() && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/10">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">
                  Előfizetés szükséges
                </h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-200 mt-1">
                  Az előfizetése {profile.subscription_status === 'active' ? 'aktív' : 'inaktív'}. Aktív előfizetés szükséges a fájlok letöltéséhez.
                </p>
                <Link to="/billing">
                  <Button variant="outline" size="sm" className="mt-3">
                    Előfizetési lehetőségek
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Fájlok</span>
              {profile && (
                <Badge variant={canDownload() ? 'default' : 'secondary'}>
                  {profile.subscription_status === 'active' ? 'Aktív' : 'Inaktív'}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {files.length} fájl elérhető
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-center py-8">Fájlok betöltése...</p>
            ) : files.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Még nincsenek elérhető fájlok</p>
              </div>
            ) : (
              <div className="space-y-3">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-primary" />
                      <div>
                        <p className="font-medium">{file.file_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString('hu-HU')}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleDownload(file.file_url, file.file_name)}
                      size="sm"
                      disabled={!canDownload()}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Letöltés
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Downloads;
