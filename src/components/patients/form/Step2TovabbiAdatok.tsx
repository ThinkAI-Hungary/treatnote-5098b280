import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PatientWizardFormValues } from './schema';

export function Step2TovabbiAdatok() {
  const { register, setValue, watch } = useFormContext<PatientWizardFormValues>();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="space-y-6">
        <h3 className="text-lg font-medium border-b pb-2">További információk a páciensről</h3>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="paciens_megszolitasa">Páciens megszólítása</Label>
            <Input id="paciens_megszolitasa" {...register('paciens_megszolitasa')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mit_var_kezelestol">Mit vár a páciens a kezeléstől?</Label>
            <Input id="mit_var_kezelestol" {...register('mit_var_kezelestol')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fontos_info_felelem">Fontos információ, félelem, egyéb a páciensről:</Label>
            <Textarea 
              id="fontos_info_felelem" 
              {...register('fontos_info_felelem')} 
              placeholder="Pl.: Fél a tűtől, korábban rossz élménye volt..."
              className="resize-none h-24"
            />
          </div>

          <div className="space-y-2 max-w-sm">
            <Label htmlFor="husegprogram_vege">Hűségprogram vége</Label>
            <Input id="husegprogram_vege" type="date" {...register('husegprogram_vege')} />
          </div>

          <div className="pt-4 border-t mt-6">
            <div className="flex items-center space-x-3">
              <Switch 
                id="marketing_hozzajarulas" 
                checked={watch('marketing_hozzajarulas')} 
                onCheckedChange={(v) => setValue('marketing_hozzajarulas', v)} 
              />
              <Label htmlFor="marketing_hozzajarulas" className="font-medium">
                Edukatív és marketing tartalmú hírlevelek küldéséhez hozzájárulok *
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mt-2 pl-12">
              (A hozzájárulás alapértelmezetten ki van kapcsolva. A páciens kérésére bekapcsolható.)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
