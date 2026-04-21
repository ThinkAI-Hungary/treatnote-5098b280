import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ToothModel } from './types';
import { DENTAL_STATUSES, SURFACES } from './constants';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toothNumber: string | null;
  initialData?: ToothModel;
  onSave: (data: ToothModel) => void;
};

export function ToothDialog({ open, onOpenChange, toothNumber, initialData, onSave }: Props) {
  const [status, setStatus] = useState<string>('healthy');
  const [surfaces, setSurfaces] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (open) {
      if (initialData) {
        setStatus(initialData.status);
        setSurfaces(initialData.surfaces ? initialData.surfaces.split(',') : []);
        setNotes(initialData.notes || '');
      } else {
        setStatus('healthy');
        setSurfaces([]);
        setNotes('');
      }
    }
  }, [open, initialData]);

  const selectedStatusDef = DENTAL_STATUSES.find(s => s.id === status);
  const showSurfaces = selectedStatusDef?.hasSurfaces;

  // Group statuses
  const groupedStatuses = DENTAL_STATUSES.reduce((acc, curr) => {
    if (!acc[curr.group]) acc[curr.group] = [];
    acc[curr.group].push(curr);
    return acc;
  }, {} as Record<string, typeof DENTAL_STATUSES>);

  const handleSurfaceChange = (surfaceId: string, checked: boolean) => {
    if (checked) {
      setSurfaces(prev => [...prev, surfaceId]);
    } else {
      setSurfaces(prev => prev.filter(s => s !== surfaceId));
    }
  };

  const handleSave = () => {
    if (!toothNumber) return;
    onSave({
      ...(initialData || {}),
      tooth_number: toothNumber,
      status,
      surfaces: showSurfaces && surfaces.length > 0 ? surfaces.join(',') : null,
      notes: notes || null
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Fog szerkesztése: {toothNumber}</DialogTitle>
          <DialogDescription>
            Állítsa be a fog állapotát és az érintett felületeket.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="status">Státusz / Állapot</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Válasszon státuszt" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="healthy">Egészséges</SelectItem>
                {Object.entries(groupedStatuses).map(([groupName, items]) => (
                  <SelectGroup key={groupName}>
                    <SelectLabel className="bg-muted px-2 py-1 mt-1">{groupName}</SelectLabel>
                    {items.map(item => (
                      <SelectItem key={item.id} value={item.id} className="pl-6">
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showSurfaces && (
            <div className="space-y-3 p-4 bg-muted/40 rounded-lg border">
              <Label>Érintett felületek (Felület)</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {SURFACES.map((surf) => (
                  <div key={surf.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`surf-${surf.id}`}
                      checked={surfaces.includes(surf.id)}
                      onCheckedChange={(checked) => handleSurfaceChange(surf.id, checked as boolean)}
                    />
                    <Label htmlFor={`surf-${surf.id}`} className="text-sm cursor-pointer">
                      {surf.id} - {surf.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Mégse</Button>
          <Button onClick={handleSave}>Mentés</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
