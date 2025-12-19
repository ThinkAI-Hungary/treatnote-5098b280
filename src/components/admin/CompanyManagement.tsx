import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Building2, Plus, Trash2, ChevronDown, ChevronRight, Loader2, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) {
      toast.error('Kérjük adja meg a cég nevét');
      return;
    }

    setSavingCompany(true);
    const { error } = await supabase
      .from('companies')
      .insert({
        name: newCompanyName.trim(),
        slug: generateSlug(newCompanyName),
      });

    if (error) {
      console.error('Error creating company:', error);
      toast.error('Hiba a cég létrehozásakor');
    } else {
      toast.success('Cég sikeresen létrehozva');
      setNewCompanyName('');
      setAddCompanyOpen(false);
      onDataChange();
    }
    setSavingCompany(false);
  };

  const handleDeleteCompany = async (companyId: string) => {
    const companyTelephelyek = telephelyek.filter(t => t.company_id === companyId);
    if (companyTelephelyek.length > 0) {
      toast.error('Először törölje a céghez tartozó telephelyeket');
      return;
    }

    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', companyId);

    if (error) {
      console.error('Error deleting company:', error);
      toast.error('Hiba a cég törlésekor');
    } else {
      toast.success('Cég törölve');
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

    setSavingTelephely(true);
    const { error } = await supabase
      .from('telephely')
      .insert({
        name: newTelephelyName.trim(),
        company_id: selectedCompanyId,
      });

    if (error) {
      console.error('Error creating telephely:', error);
      toast.error('Hiba a telephely létrehozásakor');
    } else {
      toast.success('Telephely sikeresen létrehozva');
      setNewTelephelyName('');
      setAddTelephelyOpen(false);
      setSelectedCompanyId(null);
      onDataChange();
    }
    setSavingTelephely(false);
  };

  const handleDeleteTelephely = async (telephelyId: string) => {
    const { error } = await supabase
      .from('telephely')
      .delete()
      .eq('id', telephelyId);

    if (error) {
      console.error('Error deleting telephely:', error);
      toast.error('Hiba a telephely törlésekor');
    } else {
      toast.success('Telephely törölve');
      onDataChange();
    }
  };

  return (
    <>
      <Card className="panel-float-in" style={{ animationDelay: '50ms' }}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Cégek és telephelyek kezelése
              </CardTitle>
              <CardDescription>Cégek létrehozása és telephelyek kezelése</CardDescription>
            </div>
            <Dialog open={addCompanyOpen} onOpenChange={setAddCompanyOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Új cég
                </Button>
              </DialogTrigger>
              <DialogContent>
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
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddCompanyOpen(false)}>
                    Mégse
                  </Button>
                  <Button onClick={handleAddCompany} disabled={savingCompany || !newCompanyName.trim()}>
                    {savingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Létrehozás
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
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
                    className="border rounded-lg overflow-hidden animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Company Header */}
                    <div 
                      className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
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
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Telephely
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteCompany(company.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Telephelyek List */}
                    {isExpanded && (
                      <div className="border-t bg-background">
                        {companyTelephelyek.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Nincsenek telephelyek
                          </p>
                        ) : (
                          <div className="divide-y">
                            {companyTelephelyek.map((telephely, tIndex) => (
                              <div 
                                key={telephely.id} 
                                className="flex items-center justify-between p-3 pl-10 hover:bg-muted/20 transition-colors animate-fade-in"
                                style={{ animationDelay: `${tIndex * 30}ms` }}
                              >
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">{telephely.name}</span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteTelephely(telephely.id)}
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
        </CardContent>
      </Card>

      {/* Add Telephely Dialog */}
      <Dialog open={addTelephelyOpen} onOpenChange={(open) => {
        setAddTelephelyOpen(open);
        if (!open) {
          setSelectedCompanyId(null);
          setNewTelephelyName('');
        }
      }}>
        <DialogContent>
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
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTelephelyOpen(false)}>
              Mégse
            </Button>
            <Button onClick={handleAddTelephely} disabled={savingTelephely || !newTelephelyName.trim()}>
              {savingTelephely && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Létrehozás
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
