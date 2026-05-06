import { useState, MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Building2, Plus, Trash2, ChevronDown, ChevronRight, Loader2, MapPin, PowerOff, RotateCcw, FolderOpen, Folder, User, Users } from 'lucide-react';
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
  is_solo?: boolean;
}

interface Telephely {
  id: string;
  name: string;
  company_id: string;
}

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  company_id: string | null;
  company_name: string | null;
  telephely_id: string | null;
  telephely_name: string | null;
  is_solo?: boolean;
}

interface CompanyManagementProps {
  companies: Company[];
  telephelyek: Telephely[];
  users?: AdminUser[];
  onDataChange: () => void;
}

export function CompanyManagement({ companies, telephelyek, users = [], onDataChange }: CompanyManagementProps) {
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [companiesFolderOpen, setCompaniesFolderOpen] = useState(true);  // open by default
  const [soloFolderOpen, setSoloFolderOpen] = useState(true);            // open by default
  const [deactivatedFolderOpen, setDeactivatedFolderOpen] = useState(false);

  // Partition
  const activeAdminCompanies = companies.filter(c => c.is_active !== false && !c.is_solo);
  const soloUsers = users.filter(u => u.is_solo === true);
  const inactiveCompanies = companies.filter(c => c.is_active === false);
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
    const companyUsers = users.filter(u => u.company_id === company.id);

    const renderUserBadge = (user: AdminUser) => (
      <div key={user.id} className="flex items-center gap-2 px-3 py-1.5 rounded bg-primary/5 border border-primary/10 text-xs">
        <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <span className="font-medium truncate">{user.full_name || user.email.split('@')[0]}</span>
        <span className="text-muted-foreground truncate">{user.email}</span>
        {user.telephely_name && (
          <span className="ml-auto text-[10px] bg-primary/10 px-1.5 py-0.5 rounded text-primary/70 whitespace-nowrap">{user.telephely_name}</span>
        )}
      </div>
    );

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
            {companyUsers.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-primary/60">
                <Users className="h-3 w-3" />{companyUsers.length} felhasználó
              </span>
            )}
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

        {/* Expanded: Telephelyek + Users */}
        {isExpanded && (
          <div className="border-t border-primary/10 bg-background/50">
            {companyTelephelyek.length === 0 && companyUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nincsenek telephelyek vagy felhasználók
              </p>
            ) : (
              <div>
                {/* Telephelyek with their users */}
                {companyTelephelyek.map((telephely, tIndex) => {
                  const telephelyUsers = companyUsers.filter(u => u.telephely_id === telephely.id);
                  return (
                    <div key={telephely.id} className="border-b border-primary/5 last:border-b-0">
                      <div
                        className="flex items-center justify-between p-3 pl-10 hover:bg-primary/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${tIndex * 30}ms` }}
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className={cn('text-sm font-medium', isDeactivated && 'text-muted-foreground')}>{telephely.name}</span>
                          {telephelyUsers.length > 0 && (
                            <span className="text-xs text-muted-foreground">({telephelyUsers.length} user)</span>
                          )}
                        </div>
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
                      {/* Users under this telephely */}
                      {telephelyUsers.length > 0 && (
                        <div className="px-4 pb-3 pl-14 space-y-1.5">
                          {telephelyUsers.map(renderUserBadge)}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Company-level users (no telephely) */}
                {companyUsers.filter(u => !u.telephely_id).length > 0 && (
                  <div className="border-t border-primary/5 px-4 py-3 pl-10">
                    <p className="text-xs text-muted-foreground mb-2">Telephely nélküli felhasználók</p>
                    <div className="space-y-1.5">
                      {companyUsers.filter(u => !u.telephely_id).map(renderUserBadge)}
                    </div>
                  </div>
                )}
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

        <div className="space-y-4">
        {/* ── 1. Admin-created companies (collapsible) ───────────────────── */}
        <div className="border border-primary/15 rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-primary/5 transition-colors"
            onClick={() => setCompaniesFolderOpen(prev => !prev)}
          >
            {companiesFolderOpen
              ? <FolderOpen className="h-4 w-4 text-primary/70 flex-shrink-0" />
              : <Folder className="h-4 w-4 text-primary/70 flex-shrink-0" />}
            <span className="text-sm font-medium">Céges regisztráltak</span>
            <span className="text-xs text-muted-foreground ml-1">({activeAdminCompanies.length} cég)</span>
            <ChevronDown className={cn('h-4 w-4 ml-auto transition-transform duration-200', companiesFolderOpen ? 'rotate-0' : '-rotate-90')} />
          </button>
          {companiesFolderOpen && (
            <div className="px-3 pb-3 pt-1 space-y-2 bg-muted/5">
              {activeAdminCompanies.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nincsenek admin-létrehozott cégek</p>
              ) : (
                activeAdminCompanies.map((company, index) => renderCompanyRow(company, index, false))
              )}
            </div>
          )}
        </div>

        {/* ── 2. Solo regisztráltak (collapsible) ────────────────────────── */}
        <div className="border border-dashed border-blue-500/20 rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-blue-500/5 transition-colors"
            onClick={() => setSoloFolderOpen(prev => !prev)}
          >
            {soloFolderOpen
              ? <FolderOpen className="h-4 w-4 text-blue-400/70 flex-shrink-0" />
              : <Folder className="h-4 w-4 text-blue-400/70 flex-shrink-0" />}
            <span className="text-sm font-medium text-blue-300">Solo regisztráltak</span>
            <span className="text-xs text-muted-foreground ml-1">({soloUsers.length} felhasználó — weboldalon regisztrált)</span>
            <ChevronDown className={cn('h-4 w-4 ml-auto transition-transform duration-200', soloFolderOpen ? 'rotate-0' : '-rotate-90')} />
          </button>
          {soloFolderOpen && (
            <div className="px-3 pb-3 pt-2 bg-blue-500/5">
              {soloUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nincsenek solo regisztráltak</p>
              ) : (
                <div className="space-y-1.5">
                  {soloUsers.map(user => (
                    <div key={user.id} className="flex items-center gap-2 px-3 py-1.5 rounded bg-blue-500/5 border border-blue-500/10 text-xs">
                      <User className="h-3 w-3 text-blue-400 flex-shrink-0" />
                      <span className="font-medium truncate">{user.full_name || (user as any).email?.split('@')[0]}</span>
                      <span className="text-muted-foreground truncate">{(user as any).email}</span>
                      <span className="ml-auto text-[10px] bg-blue-500/10 px-1.5 py-0.5 rounded text-blue-400 whitespace-nowrap">Solo</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 3. Deaktivált cégek (collapsible, legalul) ─────────────────── */}
        {inactiveCompanies.length > 0 && (
          <div className="border border-dashed border-muted/40 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/10 transition-colors text-muted-foreground"
              onClick={() => setDeactivatedFolderOpen(prev => !prev)}
            >
              {deactivatedFolderOpen
                ? <FolderOpen className="h-4 w-4 text-amber-500/70 flex-shrink-0" />
                : <Folder className="h-4 w-4 text-amber-500/70 flex-shrink-0" />}
              <span className="text-sm font-medium">Deaktivált cégek ({inactiveCompanies.length})</span>
              <ChevronDown className={cn('h-4 w-4 ml-auto transition-transform duration-200', deactivatedFolderOpen ? 'rotate-0' : '-rotate-90')} />
            </button>
            {deactivatedFolderOpen && (
              <div className="px-3 pb-3 space-y-2 bg-muted/5">
                {inactiveCompanies.map((company, index) => renderCompanyRow(company, index, true))}
              </div>
            )}
          </div>
        )}
        </div>{/* end space-y-4 */}
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
