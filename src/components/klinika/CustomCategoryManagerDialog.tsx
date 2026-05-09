import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Trash2, Plus, Tag } from 'lucide-react';
import { CustomCategoryDialog } from './CustomCategoryDialog';
import { cn } from '@/lib/utils';

interface CustomCategoryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telephelyId: string;
  mode?: 'nativ' | 'flexi';
  onCategoriesChanged: () => void;
}

export function CustomCategoryManagerDialog({
  open,
  onOpenChange,
  telephelyId,
  mode = 'nativ',
  onCategoriesChanged
}: CustomCategoryManagerDialogProps) {
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const loadCategories = async () => {
    if (!open) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clinic_custom_categories')
        .select('id, name, color')
        .eq('telephely_id', telephelyId)
        .eq('mode', mode)
        .order('name');
      
      if (error) throw error;
      setCategories(data || []);
    } catch (err: any) {
      console.error('Error loading custom categories:', err);
      toast.error('Hiba történt a kategóriák betöltésekor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadCategories();
    }
  }, [open, telephelyId, mode]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Biztosan törölni szeretné a(z) "${name}" kategóriát? A már létrehozott tételek kategória neve megmarad.`)) {
      return;
    }
    
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('clinic_custom_categories')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      toast.success('Kategória törölve');
      setCategories(prev => prev.filter(c => c.id !== id));
      onCategoriesChanged();
    } catch (err: any) {
      console.error('Error deleting category:', err);
      toast.error('Hiba történt a törlés során.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md border-primary/20 bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Kategóriák kezelése
            </DialogTitle>
            <DialogDescription>
              Tekintse meg vagy törölje a létrehozott egyéni kategóriákat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Új kategória
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Nincsenek egyéni kategóriák.</p>
              </div>
            ) : (
              <ScrollArea className="h-[250px] border rounded-md">
                <div className="p-2 space-y-1">
                  {categories.map((category) => (
                    <div 
                      key={category.id}
                      className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded-full border border-black/10"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="font-medium text-sm">{category.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(category.id, category.name)}
                        disabled={deletingId === category.id}
                      >
                        {deletingId === category.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CustomCategoryDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        telephelyId={telephelyId}
        mode={mode}
        onSaved={(newName) => {
          loadCategories();
          onCategoriesChanged();
        }}
      />
    </>
  );
}
