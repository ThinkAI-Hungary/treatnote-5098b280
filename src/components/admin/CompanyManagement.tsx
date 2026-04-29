import { useState, MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Building2, Plus, Trash2, ChevronDown, ChevronRight, Loader2, MapPin, PowerOff, RotateCcw, FolderOpen, Folder } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { cn } from '@/lib/utils';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { GalaxyButton } from '@/components/klinika/GalaxyButton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { sanitizePathName } from '@/lib/hungarianNormalizer';

interface Company {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
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
  const [deactivatedFolderOpen, setDeactivatedFolderOpen] = useState(false);

  // Company dialog state
  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);

  // Telephely dialog state
  const [addTelephelyOpen, setAddTelephelyOpen] = useState(false);
  const [newTelephelyName, setNewTelephelyName] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [savingTelephely, setSavingTelephely] = useState(false);

  // Delete / deactivate confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ type: 'company' | 'telephely'; id: string; companyId?: string; name: string } | null>(null);
  const [deleteAnchorPosition, setDeleteAnchorPosition] = useState<{ x: number; y: number } | null>(null);

  // Deactivate confirmation
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<{ id: string; name: string } | null>(null);
  const [deactivateAnchorPosition, setDeactivateAnchorPosition] = useState<{ x: number; y: number } | null>(null);

  const activeCompanies = companies.filter(c => c.is_active !== false);
  const inactiveCompanies = companies.filter(c => c.is_active === false);

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
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating company:', error);
      toast.error('Hiba a cég létrehozásakor');
      setSavingCompany(false);
      return;
    }

    const sanitizedName = sanitizePathName(companyName);
    const folderPath = `TreatNote/Companies/${sanitizedName}`;

    const { error: folderError } = await supabase.functions.invoke('admin-file-manager', {
      body: { operation: 'create-folder', path: folderPath }
    });

    if (folderError) {
      toast.error('Figyelem: A cég létrejött, de a mappa létrehozása sikertelen');
    }

    toast.success('Cég sikeresen létrehozva');
    setNewCompanyName('');
    setAddCompanyOpen(false);
    onDataChange();
    setSavingCompany(false);
  };

  // ── Deactivate ──────────────────────────────────────────────────────────────

  const openDeactivateConfirm = (id: string, name: string, event: MouseEvent) => {
    event.stopPropagation();
    setPendingDeactivate({ id, name });
    setDeactivateAnchorPosition({ x: event.clientX, y: event.clientY });
    setDeactivateConfirmOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!pendingDeactivate) return;
    setDeactivateConfirmOpen(false);

    const { error } = await supabase
      .from('companies')
      .update({ is_active: false })
      .eq('id', pendingDeactivate.id);

    if (error) {
      console.error('Error deactivating company:', error);
      toast.error('Hiba a cég deaktiválásakor');
    } else {
      toast.success(`"${pendingDeactivate.name}" deaktiválva — felhasználói nem látják a cég adatait`);
      onDataChange();
    }

    setPendingDeactivate(null);
    setDeactivateAnchorPosition(null);
  };

  // ── Reactivate ───────────────────────────────────────────────────────────────

  const handleReactivate = async (id: string, name: string, event: MouseEvent) => {
    event.stopPropagation();

    const { error } = await supabase
      .from('companies')
      .update({ is_active: true })
      .eq('id', id);

    if (error) {
      console.error('Error reactivating company:', error);
      toast.error('Hiba a cég visszaállításakor');
    } else {
      toast.success(`"${name}" visszaállítva`);
      onDataChange();
    }
  };

  // ── Delete (only allowed for deactivated companies) ──────────────────────────

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
    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', companyId);

    if (error) {
      console.error('Error deleting company:', error);
      toast.error('Hiba a cég törlésekor');
    } else {
      const sanitizedName = sanitizePathName(companyName);
      const folderPath = `TreatNote/Companies/${sanitizedName}`;
      await supabase.functions.invoke('admin-file-manager', {
        body: { operation: 'delete-folder', path: folderPath }
      });
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

    if (company) {
      const sanitizedCompanyName = sanitizePathName(company.name);
      const sanitizedTelephelyName = sanitizePathName(telephelyName);
      const folderPath = `TreatNote/Companies/${sanitizedCompanyName}/${sanitizedTelephelyName}`;
      const { error: folderError } = await supabase.functions.invoke('admin-file-manager', {
        body: { operation: 'create-folder', path: folderPath }
      });
      if (folderError) {
        toast.error('Figyelem: A telephely létrejött, de a mappa létrehozása sikertelen');
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
      if (company) {
        const sanitizedCompanyName = sanitizePathName(company.name);
        const sanitizedTelephelyName = sanitizePathName(telephelyName);
        const folderPath = `TreatNote/Companies/${sanitizedCompanyName}/${sanitizedTelephelyName}`;
        await supabase.functions.invoke('admin-file-manager', {
          body: { operation: 'delete-folder', path: folderPath }
        });
      }
      toast.success('Telephely törölve');
      onDataChange();
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const renderCompanyRow = (company: Company, index: number, isDeactivated = false) => {
    const isExpanded = expandedCompanies.has(company.id);
    const companyTelephelyek = telephelyek.filter(t => t.company_id === company.id);

    return (
      <div
        key={company.id}
        className={cn(
          'border rounded-lg overflow-hidden animate-fade-in',
          isDeactivated
            ? 'border-muted/30 bg-muted/10 opacity-70'
            : 'border-primary/10 bg-card/50'
        )}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        {/* Company Header */}
        <div
          className={cn(
            'flex items-center justify-between p-3 cursor-pointer transition-colors',
            isDeactivated
              ? 'bg-muted/10 hover:bg-muted/20'
              : 'bg-gradient-to-r from-primary/5 to-accent/5 hover:from-primary/10 hover:to-accent/10'
          )}
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
            <Building2 className={cn('h-4 w-4', isDeactivated ? 'text-muted-foreground' : 'text-primary')} />
            <span className={cn('font-medium', isDeactivated && 'line-through text-muted-foreground')}>
              {company.name}
            </span>
            <span className="text-xs text-muted-foreground">
              ({companyTelephelyek.length} telephely)
            </span>
            {isDeactivated && (
              <span className="text-xs text-amber-500/80 font-medium">Deaktivált</span>
            )}
          </div>

          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {!isDeactivated ? (
              <>
                {/* Add telephely */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openAddTelephelyDialog(company.id)}
                  className="hover:bg-primary/10"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Telephely
                </Button>
                {/* Deactivate */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-amber-500 hover:text-amber-500 hover:bg-amber-500/10"
                  title="Deaktiválás"
                  onClick={(e) => openDeactivateConfirm(company.id, company.name, e)}
                >
                  <PowerOff className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                {/* Reactivate */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10"
                  onClick={(e) => handleReactivate(company.id, company.name, e)}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Visszaállítás
                </Button>
                {/* Delete — only for deactivated */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="Törlés"
                  onClick={(e) => openDeleteConfirm('company', company.id, company.name, e)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
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
                      <span className={cn('text-sm', isDeactivated && 'text-muted-foreground')}>{telephely.name}</span>
                    </div>
                    {/* Telephely delete only allowed if company is deactivated */}
                    {isDeactivated && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => openDeleteConfirm('telephely', telephely.id, telephely.name, e, company.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
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

        {/* Active companies */}
        {activeCompanies.length === 0 && inactiveCompanies.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nincsenek cégek</p>
        ) : (
          <div className="space-y-2">
            {activeCompanies.map((company, index) => renderCompanyRow(company, index, false))}
          </div>
        )}

        {/* Deactivated companies folder */}
        {inactiveCompanies.length > 0 && (
          <div className="mt-6 border border-dashed border-muted/40 rounded-lg overflow-hidden">
            {/* Folder header */}
            <button
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/10 transition-colors text-muted-foreground"
              onClick={() => setDeactivatedFolderOpen(prev => !prev)}
            >
              {deactivatedFolderOpen ? (
                <FolderOpen className="h-4 w-4 text-amber-500/70 flex-shrink-0" />
              ) : (
                <Folder className="h-4 w-4 text-amber-500/70 flex-shrink-0" />
              )}
              <span className="text-sm font-medium">
                Deaktivált cégek ({inactiveCompanies.length})
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 ml-auto transition-transform duration-200',
                  deactivatedFolderOpen ? 'rotate-0' : '-rotate-90'
                )}
              />
            </button>

            {/* Folder contents */}
            {deactivatedFolderOpen && (
              <div className="px-3 pb-3 space-y-2 bg-muted/5">
                {inactiveCompanies.map((company, index) => renderCompanyRow(company, index, true))}
              </div>
            )}
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

      {/* Deactivate Confirmation */}
      <ConfirmDialog
        open={deactivateConfirmOpen}
        onOpenChange={(open) => {
          setDeactivateConfirmOpen(open);
          if (!open) {
            setPendingDeactivate(null);
            setDeactivateAnchorPosition(null);
          }
        }}
        title="Cég deaktiválása"
        description={`Biztosan deaktiválni szeretné a(z) "${pendingDeactivate?.name}" céget? A céghez tartozó felhasználók nem látják majd a cég és telephely adataikat, amíg a cég deaktivált marad.`}
        confirmText="Deaktiválás"
        variant="warning"
        onConfirm={handleConfirmDeactivate}
        anchorPosition={deactivateAnchorPosition}
      />

      {/* Delete Confirmation (only for deactivated) */}
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
            ? `Biztosan véglegesen törölni szeretné a(z) "${pendingDelete?.name}" céget és összes telephelyét? Ez a művelet nem visszavonható.`
            : `Biztosan törölni szeretné ezt a telephelyet?`
        }
        onConfirm={handleConfirmDelete}
        anchorPosition={deleteAnchorPosition}
      />
    </>
  );
}
