import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Download,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GalaxyButton } from './GalaxyButton';
import { AnimatedCard } from './AnimatedCard';
import { TreatmentRuleEditor } from './TreatmentRuleEditor';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { TreatmentRule, RuleVisit, RuleItem, CATEGORY_OPTIONS, DEFAULT_RULE_ITEM } from '@/types/treatmentRules';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ExtractionRecord {
  id: string;
  event_id: string;
  source_file_name: string;
  fogalom: string;
  kategoria: string | null;
  trigger_words: any | null;
  parsed_json: {
    visits?: Array<{
      visit_no: number;
      duration_days?: number;
      healing_time_months?: number;
      items: Array<{
        name: string;
        qty: number;
        unit: string;
        target_tooth_type?: string;
      }>;
    }>;
  };
  created_at: string;
}

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
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'upload' | 'import'>('list');
  
  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TreatmentRule | null>(null);
  
  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteAnchorPosition, setDeleteAnchorPosition] = useState<{ x: number; y: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Import state
  const [extractions, setExtractions] = useState<ExtractionRecord[]>([]);
  const [loadingExtractions, setLoadingExtractions] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

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

  // Load extractions for import
  const loadExtractions = useCallback(async () => {
    if (!companyId || !telephelyId) return;
    
    setLoadingExtractions(true);
    try {
      const { data, error } = await supabase
        .from('szabalyepito_teszt_extractions')
        .select('*')
        .eq('company_id', companyId)
        .eq('telephely_id', telephelyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExtractions((data as ExtractionRecord[]) || []);
    } catch (err: any) {
      console.error('Error loading extractions:', err);
      toast.error('Hiba az extrakciók betöltésekor');
    } finally {
      setLoadingExtractions(false);
    }
  }, [companyId, telephelyId]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  useEffect(() => {
    if (activeSubTab === 'import') {
      loadExtractions();
    }
  }, [activeSubTab, loadExtractions]);

  // Filter rules
  const filteredRules = rules.filter(rule => {
    const matchesSearch = !searchTerm || 
      rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.trigger_words.some(w => w.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = categoryFilter === 'all' || rule.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

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
    
    setDeleting(true);
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
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  // Count total items across all visits
  const countTotalItems = (rule: TreatmentRule): number => {
    return rule.visits?.reduce((sum, visit) => sum + (visit.items?.length || 0), 0) || 0;
  };

  // PDF Upload handlers
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
          uploaded_by: user.id,
        },
      });

      if (error) {
        throw new Error(error.message || 'Edge function error');
      }

      if (data?.ok) {
        toast.success('PDF elküldve feldolgozásra');
        toast.info('A feldolgozás folyamatban van, az eredmények hamarosan megjelennek az Import tab-on...');
        // Switch to import tab to see results
        setTimeout(() => {
          setActiveSubTab('import');
          loadExtractions();
        }, 3000);
      } else {
        const errorMessage = data?.message || 'Webhook küldése sikertelen';
        if (data?.code === 'N8N_WEBHOOK_NOT_REGISTERED') {
          toast.error('Az n8n webhook nincs aktiválva.');
        } else {
          toast.error(errorMessage);
        }
      }
    } catch (err: any) {
      console.error('Error uploading file:', err);
      toast.error(err.message || 'Hiba a fájl feltöltésekor');
    } finally {
      setUploading(false);
    }
  };

  const handleMultipleFiles = async (fileList: FileList) => {
    const pdfFiles = Array.from(fileList).filter(f => f.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      toast.error('Csak PDF fájlok tölthetők fel!');
      return;
    }
    
    if (pdfFiles.length < fileList.length) {
      toast.warning(`${fileList.length - pdfFiles.length} fájl kihagyva (nem PDF)`);
    }
    
    const uploadPromises = pdfFiles.map(file => handleFilePrepare(file));
    await Promise.all(uploadPromises);
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

  // Import extraction to treatment_rules
  const handleImportExtraction = async (extraction: ExtractionRecord) => {
    if (!telephelyId) return;

    setImportingId(extraction.id);
    try {
      // Parse trigger words
      let triggerWords: string[] = [];
      if (extraction.trigger_words) {
        if (Array.isArray(extraction.trigger_words)) {
          triggerWords = extraction.trigger_words;
        } else if (typeof extraction.trigger_words === 'object') {
          triggerWords = Object.values(extraction.trigger_words).filter(v => typeof v === 'string') as string[];
        }
      }

      // Create the treatment rule
      const { data: ruleData, error: ruleError } = await supabase
        .from('treatment_rules')
        .insert({
          clinic_id: telephelyId,
          name: extraction.fogalom,
          category: extraction.kategoria || null,
          trigger_words: triggerWords,
        })
        .select('id')
        .single();

      if (ruleError) throw ruleError;

      // Create visits and items
      const visits = extraction.parsed_json?.visits || [];
      for (let vi = 0; vi < visits.length; vi++) {
        const visit = visits[vi];
        
        const { data: visitData, error: visitError } = await supabase
          .from('rule_visits')
          .insert({
            rule_id: ruleData.id,
            visit_number: visit.visit_no || vi + 1,
            duration_days: visit.duration_days || 0,
            healing_months: visit.healing_time_months || 0,
            display_order: vi,
          })
          .select('id')
          .single();

        if (visitError) throw visitError;

        if (visit.items && visit.items.length > 0) {
          const itemsToInsert = visit.items.map((item, ii) => ({
            visit_id: visitData.id,
            name: item.name || '',
            quantity: item.qty || 1,
            unit: item.unit || 'db',
            scaling: 'per_tooth' as const,
            target_tooth_type: (item.target_tooth_type === 'pillar_only' || item.target_tooth_type === 'pontic_only') 
              ? item.target_tooth_type 
              : 'all' as const,
            display_order: ii,
          }));

          const { error: itemsError } = await supabase
            .from('rule_items')
            .insert(itemsToInsert);

          if (itemsError) throw itemsError;
        }
      }

      // Optionally delete the extraction record after import
      await supabase
        .from('szabalyepito_teszt_extractions')
        .delete()
        .eq('id', extraction.id);

      toast.success(`"${extraction.fogalom}" sikeresen importálva!`);
      loadRules();
      loadExtractions();
      setActiveSubTab('list');
    } catch (err: any) {
      console.error('Error importing extraction:', err);
      toast.error('Hiba az importáláskor: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setImportingId(null);
    }
  };

  // Import all extractions
  const handleImportAll = async () => {
    if (extractions.length === 0) return;
    
    for (const extraction of extractions) {
      await handleImportExtraction(extraction);
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
              <p className="text-sm text-muted-foreground mt-1">
                {rules.length} szabály • {telephelyName}
              </p>
            </div>
          </div>
          
          <GalaxyButton onClick={handleNewRule}>
            <Plus className="h-4 w-4 mr-2" />
            Új szabály
          </GalaxyButton>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Sub-tabs for List / Upload / Import */}
        <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="list" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Szabályok
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <FileUp className="h-4 w-4" />
              PDF Feltöltés
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Import ({extractions.length})
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
            </div>

            {/* Rules table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
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
                      <TableCell colSpan={7} className="h-32">
                        <div className="flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredRules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <FileText className="h-8 w-8 mb-2 opacity-50" />
                          <p>{searchTerm || categoryFilter !== 'all' ? 'Nincs találat' : 'Még nincsenek szabályok'}</p>
                          {!searchTerm && categoryFilter === 'all' && (
                            <Button 
                              variant="link" 
                              onClick={handleNewRule}
                              className="mt-2"
                            >
                              Hozza létre az elsőt
                            </Button>
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
                          "hover:bg-muted/30 transition-colors"
                        )}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
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
                <p className="text-xs text-muted-foreground mt-2">
                  A feltöltött PDF-eket az n8n feldolgozza, majd az Import tab-on importálhatja a szabályokat.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Import Tab */}
          <TabsContent value="import" className="mt-4 space-y-4">
            {loadingExtractions ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : extractions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Download className="h-8 w-8 mb-2 opacity-50" />
                <p>Nincs importálható rekord</p>
                <Button 
                  variant="link" 
                  onClick={() => setActiveSubTab('upload')}
                  className="mt-2"
                >
                  Töltsön fel PDF-et
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {extractions.length} feldolgozott PDF importálható
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={handleImportAll}
                    disabled={importingId !== null}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Összes importálása
                  </Button>
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Fogalom</TableHead>
                        <TableHead>Kategória</TableHead>
                        <TableHead>Forrás fájl</TableHead>
                        <TableHead className="text-center">Vizitek</TableHead>
                        <TableHead>Feltöltve</TableHead>
                        <TableHead className="text-right">Művelet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {extractions.map((extraction, index) => (
                        <TableRow 
                          key={extraction.id}
                          className="animate-fade-in hover:bg-muted/30"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <TableCell className="font-medium">{extraction.fogalom}</TableCell>
                          <TableCell>
                            {extraction.kategoria ? (
                              <Badge variant="secondary" className="bg-primary/10 text-primary">
                                {extraction.kategoria}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {extraction.source_file_name}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">
                              {extraction.parsed_json?.visits?.length || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(extraction.created_at), 'yyyy.MM.dd HH:mm', { locale: hu })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => handleImportExtraction(extraction)}
                              disabled={importingId === extraction.id}
                              className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
                            >
                              {importingId === extraction.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <ArrowRight className="h-4 w-4 mr-1" />
                                  Import
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
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
    </AnimatedCard>
  );
}
