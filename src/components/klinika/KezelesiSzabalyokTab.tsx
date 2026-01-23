import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus, 
  Search, 
  Pencil, 
  Trash2, 
  Loader2,
  FileText,
  Tag,
  Clock,
  Filter,
  FileUp,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GalaxyButton } from './GalaxyButton';
import { AnimatedCard } from './AnimatedCard';
import { TreatmentRuleEditor } from './TreatmentRuleEditor';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { TreatmentRule, RuleVisit, RuleItem, CATEGORY_OPTIONS } from '@/types/treatmentRules';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface KezelesiSzabalyokTabProps {
  companyId: string;
  telephelyId: string;
  companyName: string;
  telephelyName: string;
}

export function KezelesiSzabalyokTab({ 
  companyId, 
  telephelyId, 
  companyName, 
  telephelyName 
}: KezelesiSzabalyokTabProps) {
  const { user } = useAuth();
  const [rules, setRules] = useState<TreatmentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'upload'>('list');
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TreatmentRule | null>(null);
  
  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteAnchorPosition, setDeleteAnchorPosition] = useState<{ x: number; y: number } | null>(null);

  // Bulk delete confirmation state
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteAnchorPosition, setBulkDeleteAnchorPosition] = useState<{ x: number; y: number } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  
  // Generate from dictionary state
  const [generating, setGenerating] = useState(false);
  const [backgroundProcessing, setBackgroundProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  // Load rules with visits and items
  const loadRules = useCallback(async () => {
    if (!telephelyId) return;
    
    setLoading(true);
    try {
      const { data: rulesData, error: rulesError } = await supabase
        .from('treatment_rules')
        .select('*')
        .eq('clinic_id', telephelyId)
        .order('created_at', { ascending: false });

      if (rulesError) throw rulesError;

      const rulesWithDetails: TreatmentRule[] = [];
      
      for (const rule of rulesData || []) {
        const { data: visitsData, error: visitsError } = await supabase
          .from('rule_visits')
          .select('*')
          .eq('rule_id', rule.id)
          .order('display_order');

        if (visitsError) throw visitsError;

        const visitsWithItems: RuleVisit[] = [];
        
        for (const visit of visitsData || []) {
          const { data: itemsData, error: itemsError } = await supabase
            .from('rule_items')
            .select('*')
            .eq('visit_id', visit.id)
            .order('display_order');

          if (itemsError) throw itemsError;

          visitsWithItems.push({
            ...visit,
            items: (itemsData || []) as RuleItem[],
          });
        }

        rulesWithDetails.push({
          ...rule,
          visits: visitsWithItems,
        });
      }

      setRules(rulesWithDetails);
    } catch (err: any) {
      console.error('Error loading rules:', err);
      toast.error('Hiba a szabályok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [telephelyId]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Filter rules - search in name, trigger words, and treatment items
  const filteredRules = rules.filter(rule => {
    const lowerSearch = searchTerm.toLowerCase();
    
    // Search in rule name
    const matchesName = rule.name.toLowerCase().includes(lowerSearch);
    
    // Search in trigger words
    const matchesTrigger = rule.trigger_words.some(w => 
      w.toLowerCase().includes(lowerSearch)
    );
    
    // Search in treatment items (items within visits)
    const matchesItem = rule.visits?.some(visit => 
      visit.items?.some(item => 
        item.name.toLowerCase().includes(lowerSearch)
      )
    ) || false;
    
    const matchesSearch = !searchTerm || matchesName || matchesTrigger || matchesItem;
    const matchesCategory = categoryFilter === 'all' || rule.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  // Selection derived state (after filteredRules is defined)
  const filteredRuleIds = new Set(filteredRules.map(r => r.id!));
  const visibleSelectedIds = new Set([...selectedIds].filter(id => filteredRuleIds.has(id)));
  
  const isAllSelected = filteredRules.length > 0 && visibleSelectedIds.size === filteredRules.length;
  const isSomeSelected = visibleSelectedIds.size > 0 && visibleSelectedIds.size < filteredRules.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRules.map(r => r.id!)));
    }
  };

  const toggleSelect = (ruleId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };

  // Open new rule editor
  const handleNewRule = () => {
    setEditingRule(null);
    setEditorOpen(true);
  };

  // Open edit rule editor
  const handleEditRule = (rule: TreatmentRule) => {
    setEditingRule(rule);
    setEditorOpen(true);
  };

  // Open delete confirmation
  const openDeleteConfirm = (ruleId: string, event: React.MouseEvent) => {
    setPendingDeleteId(ruleId);
    setDeleteAnchorPosition({ x: event.clientX, y: event.clientY });
    setDeleteConfirmOpen(true);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    
    try {
      const { error } = await supabase
        .from('treatment_rules')
        .delete()
        .eq('id', pendingDeleteId);

      if (error) throw error;

      toast.success('Szabály sikeresen törölve');
      loadRules();
    } catch (err: any) {
      console.error('Error deleting rule:', err);
      toast.error('Hiba a törléskor');
    } finally {
      setDeleteConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  // Open bulk delete confirmation
  const openBulkDeleteConfirm = (event: React.MouseEvent) => {
    setBulkDeleteAnchorPosition({ x: event.clientX, y: event.clientY });
    setBulkDeleteConfirmOpen(true);
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    setBulkDeleting(true);
    try {
      const idsToDelete = Array.from(selectedIds);
      const { error } = await supabase
        .from('treatment_rules')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;

      toast.success(`${idsToDelete.length} szabály sikeresen törölve`);
      setSelectedIds(new Set());
      loadRules();
    } catch (err: any) {
      console.error('Error bulk deleting rules:', err);
      toast.error('Hiba a törléskor');
    } finally {
      setBulkDeleting(false);
      setBulkDeleteConfirmOpen(false);
    }
  };

  // Count total items across all visits
  const countTotalItems = (rule: TreatmentRule): number => {
    return rule.visits?.reduce((sum, visit) => sum + (visit.items?.length || 0), 0) || 0;
  };

  // PDF Upload handlers - process single PDF and return result for aggregation
  const processSinglePdf = async (file: File): Promise<{ success: boolean; inserted: number; duplicates: number; error?: string }> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const { data, error } = await supabase.functions.invoke('szabalyepito-teszt-webhook', {
        body: {
          file_name: file.name,
          file_content_base64: base64,
          company_id: companyId,
          company_name: companyName,
          telephely_id: telephelyId,
          telephely_name: telephelyName,
          uploaded_by: user?.id,
        },
      });

      if (error) {
        return { success: false, inserted: 0, duplicates: 0, error: error.message || 'Edge function error' };
      }

      if (data?.ok) {
        if (data.status === 'processed') {
          return { success: true, inserted: data.inserted || 0, duplicates: data.duplicates || 0 };
        } else {
          // Async processing started
          return { success: true, inserted: 0, duplicates: 0 };
        }
      } else {
        const errorMessage = data?.message || 'Webhook küldése sikertelen';
        return { success: false, inserted: 0, duplicates: 0, error: errorMessage };
      }
    } catch (err: any) {
      console.error('Error uploading file:', err);
      return { success: false, inserted: 0, duplicates: 0, error: err.message || 'Hiba a fájl feltöltésekor' };
    }
  };

  // Single file upload handler (for single file selection)
  const handleFilePrepare = async (file: File) => {
    if (!companyId || !telephelyId || !companyName || !telephelyName || !user) {
      toast.error('Hiányzó cég vagy telephely azonosító');
      return;
    }

    if (file.type !== 'application/pdf') {
      toast.error('Csak PDF fájlok tölthetők fel!');
      return;
    }

    setUploading(true);
    try {
      const result = await processSinglePdf(file);
      
      if (result.success) {
        if (result.inserted > 0) {
          toast.success(`${result.inserted} szabály sikeresen hozzáadva!`);
          if (result.duplicates > 0) {
            toast.info(`${result.duplicates} duplikált szabály kihagyva`);
          }
          loadRules();
          setActiveSubTab('list');
        } else {
          toast.success('PDF elküldve feldolgozásra');
          setTimeout(() => loadRules(), 5000);
        }
      } else {
        toast.error(result.error || 'Hiba a fájl feltöltésekor');
      }
    } finally {
      setUploading(false);
    }
  };

  // Multiple file upload handler - process all PDFs in parallel
  const handleMultipleFiles = async (fileList: FileList) => {
    const pdfFiles = Array.from(fileList).filter(f => f.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      toast.error('Csak PDF fájlok tölthetők fel!');
      return;
    }
    
    if (pdfFiles.length < fileList.length) {
      toast.warning(`${fileList.length - pdfFiles.length} fájl kihagyva (nem PDF)`);
    }

    if (!companyId || !telephelyId || !companyName || !telephelyName || !user) {
      toast.error('Hiányzó cég vagy telephely azonosító');
      return;
    }
    
    setUploading(true);
    toast.info(`${pdfFiles.length} PDF feldolgozása...`);
    
    try {
      // Process all PDFs in parallel
      const results = await Promise.all(pdfFiles.map(file => processSinglePdf(file)));
      
      // Aggregate results
      const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
      const totalDuplicates = results.reduce((sum, r) => sum + r.duplicates, 0);
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;
      
      if (totalInserted > 0) {
        toast.success(`${totalInserted} szabály sikeresen hozzáadva ${successCount} fájlból!`);
      }
      if (totalDuplicates > 0) {
        toast.info(`${totalDuplicates} duplikált szabály kihagyva`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} fájl feldolgozása sikertelen`);
      }
      if (successCount > 0 && totalInserted === 0) {
        toast.success(`${successCount} PDF elküldve feldolgozásra`);
      }
      
      // Reload rules after processing
      loadRules();
      setActiveSubTab('list');
      
      // Poll for async results
      setTimeout(() => loadRules(), 5000);
    } finally {
      setUploading(false);
    }
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

  // Generate rules from dictionary
  const handleGenerateFromDictionary = async () => {
    if (!telephelyId || !user) {
      toast.error('Hiányzó telephely azonosító');
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('szotar-rules-webhook', {
        body: {
          telephely_id: telephelyId,
          user_id: user.id,
        },
      });

      if (error) {
        throw new Error(error.message || 'Edge function error');
      }

      if (data?.ok) {
        if (data.status === 'started') {
          // 🚀 Background processing started - use polling to check for new rules
          toast.success('Szabályok generálása elindult! A háttérben fut...');
          setGenerating(false); // Allow button to be clicked again
          setBackgroundProcessing(true); // Show processing indicator
          
          // Start aggressive polling: every 3 seconds for 2 minutes
          const initialRuleCount = rules.length;
          let pollCount = 0;
          const maxPolls = 40; // 2 minutes / 3 seconds = 40 polls
          
          const pollInterval = setInterval(async () => {
            pollCount++;
            await loadRules();
            
            // Check if new rules appeared
            const currentRuleCount = rules.length;
            if (currentRuleCount > initialRuleCount) {
              clearInterval(pollInterval);
              setBackgroundProcessing(false);
              toast.success(`Új szabályok érkeztek! (${currentRuleCount - initialRuleCount} új)`);
            }
            
            if (pollCount >= maxPolls) {
              clearInterval(pollInterval);
              setBackgroundProcessing(false);
              toast.info('Szabályok frissítve');
            }
          }, 3000);
          
          return; // Exit early, don't set generating to false again
          
        } else if (data.status === 'processed') {
          // Synchronous mode (legacy fallback)
          toast.success(`${data.inserted || 0} szabály sikeresen hozzáadva!`);
          if (data.duplicates > 0) {
            toast.info(`${data.duplicates} duplikált szabály kihagyva`);
          }
          if (data.errors > 0) {
            toast.warning(`${data.errors} szabály hibás volt`);
          }
          loadRules();
          setActiveSubTab('list');
        } else if (data.status === 'no_extractions') {
          toast.info('Az n8n nem küldött vissza szabályokat');
        } else {
          toast.success('Kérés elküldve feldolgozásra');
        }
      } else {
        const errorMessage = data?.message || 'Webhook hiba';
        if (data?.code === 'N8N_WEBHOOK_NOT_CONFIGURED') {
          toast.error('Az n8n webhook nincs konfigurálva');
        } else {
          toast.error(errorMessage);
        }
      }
    } catch (err: any) {
      console.error('Error generating from dictionary:', err);
      toast.error(err.message || 'Hiba a szabályok generálásakor');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AnimatedCard data-tour="kezelesi-szabalyok">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>Kezelési Szabályok</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-muted-foreground">
                  {rules.length} szabály • {telephelyName}
                </p>
                {backgroundProcessing && (
                  <Badge 
                    variant="secondary" 
                    className="animate-pulse bg-primary/20 text-primary border-primary/30"
                  >
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Feldolgozás...
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <GalaxyButton 
              onClick={handleGenerateFromDictionary}
              disabled={generating}
              className="relative"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {generating ? 'Generálás...' : 'Generálás szótárból'}
            </GalaxyButton>
            <Button
              variant="outline"
              size="icon"
              onClick={loadRules}
              disabled={loading}
              title="Frissítés"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <GalaxyButton onClick={handleNewRule}>
              <Plus className="h-4 w-4 mr-2" />
              Új szabály
            </GalaxyButton>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Sub-tabs for List / Upload */}
        <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Szabályok ({rules.length})
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <FileUp className="h-4 w-4" />
              PDF Feltöltés
            </TabsTrigger>
          </TabsList>

          {/* List Tab */}
          <TabsContent value="list" className="mt-4 space-y-4">
            {/* Filters */}
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Keresés név vagy trigger szó alapján..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Kategória" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Összes kategória</SelectItem>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={openBulkDeleteConfirm}
                  disabled={bulkDeleting}
                  className="flex items-center gap-2"
                >
                  {bulkDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Törlés ({selectedIds.size})
                </Button>
              )}
            </div>

            {/* Rules table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Összes kijelölése"
                        className={cn(isSomeSelected && "data-[state=checked]:bg-primary/50")}
                        {...(isSomeSelected ? { "data-state": "checked" } : {})}
                      />
                    </TableHead>
                    <TableHead className="w-[250px]">Név</TableHead>
                    <TableHead className="w-[150px]">Kategória</TableHead>
                    <TableHead>Trigger szavak</TableHead>
                    <TableHead className="w-[100px] text-center">Vizitek</TableHead>
                    <TableHead className="w-[100px] text-center">Tételek</TableHead>
                    <TableHead className="w-[150px]">Létrehozva</TableHead>
                    <TableHead className="w-[100px] text-right">Műveletek</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32">
                        <div className="flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredRules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <FileText className="h-8 w-8 mb-2 opacity-50" />
                          <p>{searchTerm || categoryFilter !== 'all' ? 'Nincs találat' : 'Még nincsenek szabályok'}</p>
                          {!searchTerm && categoryFilter === 'all' && (
                            <div className="flex gap-2 mt-2">
                              <Button 
                                variant="link" 
                                onClick={handleNewRule}
                              >
                                Hozza létre kézzel
                              </Button>
                              <span className="text-muted-foreground">vagy</span>
                              <Button 
                                variant="link" 
                                onClick={() => setActiveSubTab('upload')}
                              >
                                Töltsön fel PDF-et
                              </Button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRules.map((rule, index) => (
                      <TableRow 
                        key={rule.id}
                        className={cn(
                          "animate-fade-in",
                          "hover:bg-muted/30 transition-colors",
                          selectedIds.has(rule.id!) && "bg-primary/10"
                        )}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(rule.id!)}
                            onCheckedChange={() => toggleSelect(rule.id!)}
                            aria-label={`${rule.name} kijelölése`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                          {rule.category ? (
                            <Badge variant="secondary" className="bg-primary/10 text-primary">
                              {rule.category}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[300px]">
                            {rule.trigger_words.slice(0, 4).map((word) => (
                              <Badge 
                                key={word} 
                                variant="outline" 
                                className="text-xs"
                              >
                                <Tag className="h-2.5 w-2.5 mr-1" />
                                {word}
                              </Badge>
                            ))}
                            {rule.trigger_words.length > 4 && (
                              <Badge variant="outline" className="text-xs">
                                +{rule.trigger_words.length - 4}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">
                            {rule.visits?.length || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">
                            {countTotalItems(rule)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {rule.created_at ? (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(rule.created_at), 'yyyy.MM.dd', { locale: hu })}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditRule(rule)}
                              title="Szerkesztés"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={(e) => openDeleteConfirm(rule.id!, e)}
                              title="Törlés"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Upload Tab */}
          <TabsContent value="upload" className="mt-4">
            <Card
              className={cn(
                "border-2 border-dashed transition-all duration-300 cursor-pointer",
                dragActive 
                  ? "border-primary bg-primary/5 scale-[1.02]" 
                  : "border-border hover:border-primary/50 hover:bg-muted/30",
                uploading && "pointer-events-none opacity-70"
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                <div className={cn(
                  "h-16 w-16 rounded-full flex items-center justify-center transition-all",
                  dragActive 
                    ? "bg-primary text-primary-foreground scale-110" 
                    : "bg-muted text-muted-foreground"
                )}>
                  {uploading ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : (
                    <FileUp className="h-8 w-8" />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium">
                    {uploading ? 'Feldolgozás folyamatban...' : 'Húzza ide a PDF fájlokat'}
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
                      disabled={uploading}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        const input = e.currentTarget.parentElement?.querySelector('input');
                        input?.click();
                      }}
                    >
                      <FileUp className="h-4 w-4 mr-2" />
                      PDF kiválasztása
                    </GalaxyButton>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center max-w-md">
                  A feltöltött PDF-eket az n8n automatikusan feldolgozza és a kinyert szabályok 
                  közvetlenül megjelennek a Szabályok listában. A kategória és trigger szavak is automatikusan kerülnek hozzáadásra.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Rule Editor Dialog */}
      <TreatmentRuleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        clinicId={telephelyId}
        rule={editingRule}
        onSave={loadRules}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Szabály törlése"
        description="Biztosan törölni szeretné ezt a szabályt? Ez a művelet nem visszavonható."
        confirmText="Törlés"
        cancelText="Mégse"
        onConfirm={handleDelete}
        variant="danger"
        anchorPosition={deleteAnchorPosition}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
        title={`${selectedIds.size} szabály törlése`}
        description={`Biztosan törölni szeretné a kijelölt ${selectedIds.size} szabályt? Ez a művelet nem visszavonható.`}
        confirmText={`Törlés (${selectedIds.size})`}
        cancelText="Mégse"
        onConfirm={handleBulkDelete}
        variant="danger"
        anchorPosition={bulkDeleteAnchorPosition}
      />
    </AnimatedCard>
  );
}
