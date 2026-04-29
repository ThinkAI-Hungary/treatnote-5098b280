import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { toast } from '@/hooks/useToastMessage';

const formSchema = z.object({
  titulus: z.string().optional(),
  vezeteknev: z.string().min(1, 'A vezetéknév kötelező'),
  keresztnev: z.string().min(1, 'A keresztnév kötelező'),
  szuletesi_vezeteknev: z.string().optional(),
  szuletesi_keresztnev: z.string().optional(),
  anyja_neve: z.string().optional(),
  neme: z.string().optional(),
  szuletesi_ido: z.string().optional(),
  szuletesi_hely: z.string().optional(),
  azonosito_okmany_tipusa: z.string().optional(),
  taj_szam: z.string().optional(),
  naptar_megjegyzes: z.string().optional(),
  orszag: z.string().default('Magyarország'),
  iranyitoszam: z.string().min(1, 'Irányítószám kötelező'),
  varos: z.string().min(1, 'A város kötelező'),
  utca_hazszam: z.string().min(1, 'Az utca és házszám kötelező'),
  telefon_1_orszagkod: z.string().default('36').refine(val => !val || (val.length === 2 && /^\d+$/.test(val)), { message: 'Az országkód értékének 2 számjegyből kell állnia.' }),
  telefon_1_korzet: z.string().optional().refine(val => !val || (val.length === 2 && /^\d+$/.test(val)), { message: 'A szolgáltató értékének 2 számjegyből kell állnia.' }),
  telefon_1_hivoszam: z.string().optional().refine(val => !val || (val.length === 7 && /^\d+$/.test(val)), { message: 'A hívószám értékének 7 számjegyből kell állnia.' }),
  telefon_1_leiras: z.string().optional(),
  kaphat_email_ertesitot: z.boolean().default(false),
  kapcsolattarto_email: z.string().email('Az e-mail címnek tartalmaznia kell egy @ jelet!').optional().or(z.literal('')),
  inaktiv_paciens: z.boolean().default(false),
  nem_kivant_paciens: z.boolean().default(false),
  nem_kivant_paciens_ok: z.string().optional(),
  nem_ker_levelet: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

export function NewPatientForm({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { profile } = useProfile();

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      kaphat_email_ertesitot: false,
      inaktiv_paciens: false,
      nem_kivant_paciens: false,
      nem_ker_levelet: false,
      orszag: 'Magyarország',
      telefon_1_orszagkod: '36',
    }
  });

  const kapEmail = watch('kapcsolattarto_email');
  useEffect(() => {
    if (!kapEmail) {
      setValue('kaphat_email_ertesitot', false);
    }
  }, [kapEmail, setValue]);

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      if (!profile?.company_id) {
        throw new Error('Nincs aktív company context.');
      }
      const activeTelephelyId = (profile as any)?.current_telephely_id || profile.telephely_id;
      if (!activeTelephelyId) {
        throw new Error('Nincs aktív telephely context.');
      }

      // Format empty strings to null for date
      const payload = {
        ...data,
        szuletesi_ido: data.szuletesi_ido || null,
        company_id: profile.company_id,
        telephely_ids: [activeTelephelyId]
      };

      const { error } = await supabase
        .from('patient_alap_adatok')
        .insert([payload]);

      if (error) throw error;

      toast.success('Páciens sikeresen regisztrálva!');
      onSuccess();
    } catch (err: any) {
      console.error('Error saving patient:', err);
      toast.error('Hiba történt a mentés során: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto border-border">
      <CardHeader className="bg-muted/50 border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">Új páciens alapadatai</CardTitle>
            <CardDescription>
              Kérjük, töltse ki az alábbi űrlapot a páciens regisztrációjához. A *-al jelölt mezők kötelezőek.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onCancel}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Vissza
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-6">
        <form id="new-patient-form" onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          
          {/* NÉV SZEKCIÓ */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium border-b pb-2">Név</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="titulus">Titulus</Label>
                <Input id="titulus" {...register('titulus')} placeholder="Pl.: Dr." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vezeteknev">Vezetéknév *</Label>
                <Input id="vezeteknev" {...register('vezeteknev')} className={errors.vezeteknev ? 'border-destructive' : ''} />
                {errors.vezeteknev && <p className="text-xs text-destructive">{errors.vezeteknev.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="keresztnev">Keresztnév *</Label>
                <Input id="keresztnev" {...register('keresztnev')} className={errors.keresztnev ? 'border-destructive' : ''} />
                {errors.keresztnev && <p className="text-xs text-destructive">{errors.keresztnev.message}</p>}
              </div>
            </div>
          </div>

          {/* SZÜLETÉSI ADATOK */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium border-b pb-2">Személyes adatok</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="szuletesi_vezeteknev">Születési vezetéknév</Label>
                <Input id="szuletesi_vezeteknev" {...register('szuletesi_vezeteknev')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="szuletesi_keresztnev">Születési keresztnév</Label>
                <Input id="szuletesi_keresztnev" {...register('szuletesi_keresztnev')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="anyja_neve">Anyja neve</Label>
                <Input id="anyja_neve" {...register('anyja_neve')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="szuletesi_ido">Születési idő</Label>
                <Input id="szuletesi_ido" type="date" {...register('szuletesi_ido')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="szuletesi_hely">Születési hely</Label>
                <Input id="szuletesi_hely" {...register('szuletesi_hely')} />
              </div>
              <div className="space-y-2">
                <Label>Neme</Label>
                <Select onValueChange={(v) => setValue('neme', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="- nincs megadva -" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Férfi">Férfi</SelectItem>
                    <SelectItem value="Nő">Nő</SelectItem>
                    <SelectItem value="Egyéb">Egyéb</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* AZONOSÍTÓK */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium border-b pb-2">Azonosítók és Cím</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Azonosító okmány típusa</Label>
                <Select onValueChange={(v) => setValue('azonosito_okmany_tipusa', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Válasszon..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TAJ szám">1: TAJ szám</SelectItem>
                    <SelectItem value="Személyi igazolvány">2: Személyi igazolvány</SelectItem>
                    <SelectItem value="Útlevél">3: Útlevél</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taj_szam">TAJ szám (vagy azonosító szám)</Label>
                <Input id="taj_szam" {...register('taj_szam')} />
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="orszag">Ország</Label>
                <Input id="orszag" {...register('orszag')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iranyitoszam">Irányítószám *</Label>
                <Input id="iranyitoszam" {...register('iranyitoszam')} className={errors.iranyitoszam ? 'border-destructive' : ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="varos">Város *</Label>
                <Input id="varos" {...register('varos')} className={errors.varos ? 'border-destructive' : ''} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="utca_hazszam">Utca, házszám *</Label>
                <Input id="utca_hazszam" {...register('utca_hazszam')} className={errors.utca_hazszam ? 'border-destructive' : ''} />
              </div>
            </div>
          </div>

          {/* ELÉRHETŐSÉG */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium border-b pb-2">Elérhetőségek</h3>
            <div className="grid grid-cols-4 gap-4 items-start">
              <div className="space-y-2 col-span-1">
                <Label>Országkód</Label>
                <Input {...register('telefon_1_orszagkod')} maxLength={2} className={errors.telefon_1_orszagkod ? 'border-destructive' : ''} />
                {errors.telefon_1_orszagkod && <p className="text-xs text-destructive">{errors.telefon_1_orszagkod.message}</p>}
              </div>
              <div className="space-y-2 col-span-1">
                <Label>Szolgáltató</Label>
                <Input {...register('telefon_1_korzet')} maxLength={2} placeholder="Pl: 20, 30..." className={errors.telefon_1_korzet ? 'border-destructive' : ''} />
                {errors.telefon_1_korzet && <p className="text-xs text-destructive">{errors.telefon_1_korzet.message}</p>}
              </div>
              <div className="space-y-2 col-span-1">
                <Label>Hívószám</Label>
                <Input {...register('telefon_1_hivoszam')} maxLength={7} placeholder="1234567" className={errors.telefon_1_hivoszam ? 'border-destructive' : ''} />
                {errors.telefon_1_hivoszam && <p className="text-xs text-destructive">{errors.telefon_1_hivoszam.message}</p>}
              </div>
              <div className="space-y-2 col-span-1">
                <Label>Megjegyzés</Label>
                <Input {...register('telefon_1_leiras')} placeholder="Pl.: Mobil" />
              </div>
            </div>
            
            <div className="space-y-2 mt-4">
              <Label htmlFor="kapcsolattarto_email">Kapcsolattartó e-mail cím</Label>
              <Input id="kapcsolattarto_email" type="email" {...register('kapcsolattarto_email')} />
              {errors.kapcsolattarto_email && <p className="text-xs text-destructive">{errors.kapcsolattarto_email.message}</p>}
            </div>
            
            <div className="space-y-2 md:col-span-2 mt-4">
              <Label htmlFor="naptar_megjegyzes">Naptár megjegyzés</Label>
              <Input id="naptar_megjegyzes" {...register('naptar_megjegyzes')} />
            </div>
          </div>

          {/* BEÁLLÍTÁSOK */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium border-b pb-2">Státusz és beállítások</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="kaphat_email_ertesitot" 
                  checked={watch('kaphat_email_ertesitot')} 
                  onCheckedChange={(v) => setValue('kaphat_email_ertesitot', v)} 
                  disabled={!watch('kapcsolattarto_email')}
                />
                <Label htmlFor="kaphat_email_ertesitot">Kaphat e-mail értesítőt</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="inaktiv_paciens" 
                  checked={watch('inaktiv_paciens')} 
                  onCheckedChange={(v) => setValue('inaktiv_paciens', v)} 
                />
                <Label htmlFor="inaktiv_paciens">Jelölje be, ha inaktív páciens</Label>
              </div>
              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="nem_kivant_paciens" 
                    checked={watch('nem_kivant_paciens')} 
                    onCheckedChange={(v) => setValue('nem_kivant_paciens', v)} 
                  />
                  <Label htmlFor="nem_kivant_paciens" className="text-destructive">Nem kívánt páciens</Label>
                </div>
                {watch('nem_kivant_paciens') && (
                  <div className="pl-6 pt-1">
                     <Label htmlFor="nem_kivant_paciens_ok" className="text-xs text-muted-foreground mb-1 block">Ok megadása</Label>
                     <Input id="nem_kivant_paciens_ok" {...register('nem_kivant_paciens_ok')} className="h-8 text-sm" placeholder="Oka..." />
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="nem_ker_levelet" 
                  checked={watch('nem_ker_levelet')} 
                  onCheckedChange={(v) => setValue('nem_ker_levelet', v)} 
                />
                <Label htmlFor="nem_ker_levelet">Nem kér postai levelet</Label>
              </div>
            </div>
          </div>

        </form>
      </CardContent>
      <CardFooter className="bg-muted/50 border-t flex justify-end gap-3 rounded-b-lg p-6">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>Mégse</Button>
        <Button form="new-patient-form" type="submit" disabled={isSubmitting} className="min-w-[140px]">
          {isSubmitting ? (
             <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mentés folyamatban</>
          ) : (
            <><Save className="mr-2 h-4 w-4" /> Mentés</>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
