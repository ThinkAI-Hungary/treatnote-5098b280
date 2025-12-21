import { useState, MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Building2, Plus, Trash2, ChevronDown, ChevronRight, Loader2, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { GalaxyButton } from '@/components/klinika/GalaxyButton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface Telephely {
  id: string;
  name: string;
  company_id: string;
}

interface CompanyManagementProps {
  companies: Company[];
  telephelyek: Telephely[];
  onDataChange: () => void;
}

export function CompanyManagement({ companies, telephelyek, onDataChange }: CompanyManagementProps) {
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  
  // Company dialog state
  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);

  // Telephely dialog state
  const [addTelephelyOpen, setAddTelephelyOpen] = useState(false);
  const [newTelephelyName, setNewTelephelyName] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [savingTelephely, setSavingTelephely] = useState(false);

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ type: 'company' | 'telephely'; id: string; companyId?: string; name: string } | null>(null);
  const [deleteAnchorPosition, setDeleteAnchorPosition] = useState<{ x: number; y: number } | null>(null);

  const toggleCompany = (companyId: string) => {
    setExpandedCompanies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(companyId)) {
        newSet.delete(companyId);
      } else {
        newSet.add(companyId);
      }
      return newSet;
    });
  };

  const generateSlug = (name: string) => {
    // Slug for database: lowercase, spaces to hyphens, no special chars
    return name
      .toLowerCase()
      .trim()
      .replace(/[\/\\:*?"<>|]/g, '')
      .replace(/\s+/g, '-');
  };

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) {
      toast.error('Kérjük adja meg a cég nevét');
      return;
    }

    setSavingCompany(true);
    
    const companyName = newCompanyName.trim();
    
    const { data: newCompany, error } = await supabase
      .from('companies')
      .insert({
        name: companyName,
        slug: generateSlug(companyName),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating company:', error);
      toast.error('Hiba a cég létrehozásakor');
      setSavingCompany(false);
      return;
    }
    
    // Create the folder in storage - use the exact company name (Hungarian chars + spaces supported)
    const folderPath = `TreatNote/Companies/${companyName}`;
    console.log('Creating company folder:', folderPath);
    
    const { data: folderData, error: folderError } = await supabase.functions.invoke('admin-file-manager', {
      body: { operation: 'create-folder', path: folderPath }
    });
    
    if (folderError) {
      console.error('Error creating company folder:', folderError);
      toast.error('Figyelem: A cég létrejött, de a mappa létrehozása sikertelen');
    } else {
      console.log('Folder created successfully:', folderData);
    }

    toast.success('Cég sikeresen létrehozva');
    setNewCompanyName('');
    setAddCompanyOpen(false);
    onDataChange();
    setSavingCompany(false);
  };

  const openDeleteConfirm = (type: 'company' | 'telephely', id: string, name: string, event: MouseEvent, companyId?: string) => {
    event.stopPropagation();
    setPendingDelete({ type, id, name, companyId });
    setDeleteAnchorPosition({ x: event.clientX, y: event.clientY });
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    
    setDeleteConfirmOpen(false);
    
    if (pendingDelete.type === 'company') {
      await handleDeleteCompany(pendingDelete.id, pendingDelete.name);
    } else {
      await handleDeleteTelephely(pendingDelete.id, pendingDelete.companyId!, pendingDelete.name);
    }
    
    setPendingDelete(null);
    setDeleteAnchorPosition(null);
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    // Cascade delete will automatically remove associated telephelyek
    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', companyId);

    if (error) {
      console.error('Error deleting company:', error);
      toast.error('Hiba a cég törlésekor');
    } else {
      // Use raw company name - Hungarian chars + spaces are supported
      const folderPath = `TreatNote/Companies/${companyName}`;
      const { error: folderError } = await supabase.functions.invoke('admin-file-manager', {
        body: { operation: 'delete-folder', path: folderPath }
      });
      
      if (folderError) {
        console.error('Error deleting company folder:', folderError);
      }

      toast.success('Cég és telephelyek törölve');
      onDataChange();
    }
  };

  const openAddTelephelyDialog = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setAddTelephelyOpen(true);
  };

  const handleAddTelephely = async () => {
    if (!newTelephelyName.trim() || !selectedCompanyId) {
      toast.error('Kérjük adja meg a telephely nevét');
      return;
    }

    const company = companies.find(c => c.id === selectedCompanyId);
    const telephelyName = newTelephelyName.trim();
    
    setSavingTelephely(true);
    const { data: newTelephely, error } = await supabase
      .from('telephely')
      .insert({
        name: telephelyName,
        company_id: selectedCompanyId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating telephely:', error);
      toast.error('Hiba a telephely létrehozásakor');
      setSavingTelephely(false);
      return;
    }
    
    // Create the folder in storage - use exact names (Hungarian chars + spaces supported)
    if (company) {
      const folderPath = `TreatNote/Companies/${company.name}/${telephelyName}`;
      console.log('Creating telephely folder:', folderPath);
      
      const { data: folderData, error: folderError } = await supabase.functions.invoke('admin-file-manager', {
        body: { operation: 'create-folder', path: folderPath }
      });
      
      if (folderError) {
        console.error('Error creating telephely folder:', folderError);
        toast.error('Figyelem: A telephely létrejött, de a mappa létrehozása sikertelen');
      } else {
        console.log('Telephely folder created successfully:', folderData);
      }
    }

    toast.success('Telephely sikeresen létrehozva');
    setNewTelephelyName('');
    setAddTelephelyOpen(false);
    setSelectedCompanyId(null);
    onDataChange();
    setSavingTelephely(false);
  };

  const handleDeleteTelephely = async (telephelyId: string, companyId: string, telephelyName: string) => {
    const company = companies.find(c => c.id === companyId);
    
    const { error } = await supabase
      .from('telephely')
      .delete()
      .eq('id', telephelyId);

    if (error) {
      console.error('Error deleting telephely:', error);
      toast.error('Hiba a telephely törlésekor');
    } else {
      // Use raw names - Hungarian chars + spaces are supported
      if (company) {
        const folderPath = `TreatNote/Companies/${company.name}/${telephelyName}`;
        const { error: folderError } = await supabase.functions.invoke('admin-file-manager', {
          body: { operation: 'delete-folder', path: folderPath }
        });
        
        if (folderError) {
          console.error('Error deleting telephely folder:', folderError);
        }
      }

      toast.success('Telephely törölve');
      onDataChange();
    }
  };

  return (
    <>
      <AnimatedCard>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">
              Cégek és telephelyek kezelése
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Cégek létrehozása és telephelyek kezelése</p>
          </div>
          <Dialog open={addCompanyOpen} onOpenChange={setAddCompanyOpen}>
            <DialogTrigger asChild>
              <GalaxyButton size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Új cég
              </GalaxyButton>
            </DialogTrigger>
            <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle>Új cég hozzáadása</DialogTitle>
                <DialogDescription>Adja meg az új cég adatait</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Cég neve</Label>
                  <Input
                    placeholder="Cég neve"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCompany()}
                    className="border-primary/20 focus:border-primary/40"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddCompanyOpen(false)}>
                  Mégse
                </Button>
                <GalaxyButton onClick={handleAddCompany} disabled={savingCompany || !newCompanyName.trim()}>
                  {savingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Létrehozás
                </GalaxyButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {companies.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nincsenek cégek</p>
        ) : (
          <div className="space-y-2">
            {companies.map((company, index) => {
              const isExpanded = expandedCompanies.has(company.id);
              const companyTelephelyek = telephelyek.filter(t => t.company_id === company.id);
              
              return (
                <div 
                  key={company.id} 
                  className="border border-primary/10 rounded-lg overflow-hidden animate-fade-in bg-card/50"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Company Header */}
                  <div 
                    className="flex items-center justify-between p-3 bg-gradient-to-r from-primary/5 to-accent/5 cursor-pointer hover:from-primary/10 hover:to-accent/10 transition-colors"
                    onClick={() => toggleCompany(company.id)}
                  >
                    <div className="flex items-center gap-2">
                      <button className="p-0.5 hover:bg-muted rounded flex-shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="font-medium">{company.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({companyTelephelyek.length} telephely)
                      </span>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAddTelephelyDialog(company.id)}
                        className="hover:bg-primary/10"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Telephely
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => openDeleteConfirm('company', company.id, company.name, e)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Telephelyek List */}
                  {isExpanded && (
                    <div className="border-t border-primary/10 bg-background/50">
                      {companyTelephelyek.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nincsenek telephelyek
                        </p>
                      ) : (
                        <div className="divide-y divide-primary/5">
                          {companyTelephelyek.map((telephely, tIndex) => (
                            <div 
                              key={telephely.id} 
                              className="flex items-center justify-between p-3 pl-10 hover:bg-primary/5 transition-colors animate-fade-in"
                              style={{ animationDelay: `${tIndex * 30}ms` }}
                            >
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{telephely.name}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={(e) => openDeleteConfirm('telephely', telephely.id, telephely.name, e, company.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </AnimatedCard>

      {/* Add Telephely Dialog */}
      <Dialog open={addTelephelyOpen} onOpenChange={(open) => {
        setAddTelephelyOpen(open);
        if (!open) {
          setSelectedCompanyId(null);
          setNewTelephelyName('');
        }
      }}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Új telephely hozzáadása</DialogTitle>
            <DialogDescription>
              Telephely létrehozása: {companies.find(c => c.id === selectedCompanyId)?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Telephely neve</Label>
              <Input
                placeholder="Telephely neve"
                value={newTelephelyName}
                onChange={(e) => setNewTelephelyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTelephely()}
                className="border-primary/20 focus:border-primary/40"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTelephelyOpen(false)}>
              Mégse
            </Button>
            <GalaxyButton onClick={handleAddTelephely} disabled={savingTelephely || !newTelephelyName.trim()}>
              {savingTelephely && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Létrehozás
            </GalaxyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) {
            setPendingDelete(null);
            setDeleteAnchorPosition(null);
          }
        }}
        title={pendingDelete?.type === 'company' ? 'Cég törlése' : 'Telephely törlése'}
        description={
          pendingDelete?.type === 'company'
            ? 'Biztosan törölni szeretné ezt a céget?'
            : 'Biztosan törölni szeretné ezt a telephelyet?'
        }
        onConfirm={handleConfirmDelete}
        anchorPosition={deleteAnchorPosition}
      />
    </>
  );
}
