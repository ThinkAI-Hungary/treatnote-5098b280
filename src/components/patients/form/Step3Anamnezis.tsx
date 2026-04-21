import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { PatientWizardFormValues } from './schema';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function RadioYesNo({ name, label }: { name: any, label: string }) {
  const { watch, setValue } = useFormContext<PatientWizardFormValues>();
  const value = watch(name);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-border/50 gap-2">
      <Label className="text-sm font-medium pr-4 flex-1">{label}</Label>
      <RadioGroup 
        className="flex items-center space-x-4 shrink-0" 
        value={value || ''}
        onValueChange={(v) => setValue(name, v as any)}
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="Igen" id={`${name}-igen`} />
          <Label htmlFor={`${name}-igen`} className="font-normal cursor-pointer">Igen</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="Nem" id={`${name}-nem`} />
          <Label htmlFor={`${name}-nem`} className="font-normal cursor-pointer">Nem</Label>
        </div>
      </RadioGroup>
    </div>
  );
}

export function Step3Anamnezis() {
  const { register, watch, setValue } = useFormContext<PatientWizardFormValues>();

  const tudobetegseg = watch('anamnezis.tudobetegseg');
  const idegrendszeri = watch('anamnezis.idegrendszeri_betegseg');
  const szorongas = watch('anamnezis.szorongas_depresszio');
  const mutet = watch('anamnezis.korabbi_mutet');
  const allergiagyogyszer = watch('anamnezis.gyogyszer_allergia');
  const erzestelenites = watch('anamnezis.erzestelenites_komplikacio');
  const dohanyzik = watch('anamnezis.dohanyzik');
  const drog = watch('anamnezis.drog_rendszeresen');

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-300">
      
      {/* 1. Általános kérdések */}
      <section className="space-y-4">
        <h3 className="text-xl font-semibold bg-muted/50 p-3 rounded-md">Általános kérdések</h3>
        <div className="space-y-4 px-2">
          <div className="space-y-2">
            <Label htmlFor="milyen_okkal_keresett_fel" className="text-destructive font-medium">
              Milyen okkal kereste fel a rendelőnket? Kérjük, részletesen fejtse ki! *
            </Label>
            <Textarea 
              id="milyen_okkal_keresett_fel" 
              {...register('anamnezis.milyen_okkal_keresett_fel')}
              className="h-24"
            />
          </div>
          
          <RadioYesNo name="anamnezis.hajlamos_e_ajulasra" label="Hajlamos-e ájulásra? *" />
          <RadioYesNo name="anamnezis.alacsony_e_a_vernyomasa" label="Alacsony-e a vérnyomása? *" />
          <RadioYesNo name="anamnezis.szokott_e_zugni_a_fule" label="Szokott-e zúgni a füle? *" />
        </div>
      </section>

      {/* 2. Szív és Érrendszer */}
      <section className="space-y-4">
        <h3 className="text-xl font-semibold bg-muted/50 p-3 rounded-md">Szív és Érrendszer</h3>
        <div className="px-2">
          <RadioYesNo name="anamnezis.szivbetegseg" label="Tud-e szívbetegségről? *" />
          <RadioYesNo name="anamnezis.szivfejlodesi_rendellenesseg" label="Tud-e szívfejlődési rendellenességről? *" />
          <RadioYesNo name="anamnezis.mubillentyu_beultetes" label="Tud-e műbillentyű beültetésről? *" />
          <RadioYesNo name="anamnezis.szivbelhartya_gyulladas" label="Tud-e szívbelhártya gyulladásról? *" />
          <RadioYesNo name="anamnezis.szivmutet" label="Tud-e szívműtétről? *" />
          <RadioYesNo name="anamnezis.pacemaker" label="Van-e pacemakere? *" />
          <RadioYesNo name="anamnezis.stent" label="Van-e stentje? *" />
        </div>
      </section>

      {/* 3. Gyógyszerek és Rendszeres kezelések */}
      <section className="space-y-4">
        <h3 className="text-xl font-semibold bg-muted/50 p-3 rounded-md">Gyógyszerek és Kezelések</h3>
        <div className="space-y-4 px-2">
          <div className="space-y-2">
            <Label htmlFor="allando_gyogyszerek">Milyen gyógyszereket szed rendszeresen? (altató, nyugtató, egyéb) *</Label>
            <Input id="allando_gyogyszerek" {...register('anamnezis.allando_gyogyszerek')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jelenleg_szedett_gyogyszerek">Milyen gyógyszereket szed jelenleg? (az elmúlt 12 órában) *</Label>
            <Input id="jelenleg_szedett_gyogyszerek" {...register('anamnezis.jelenleg_szedett_gyogyszerek')} />
          </div>

          <RadioYesNo name="anamnezis.csontritkulas" label="Van-e csontritkulása? *" />
          <div className="space-y-2">
            <Label htmlFor="csontritkulas_gyogyszer">Szed-e csontritkulásra gyógyszert, s ha igen, mit? *</Label>
            <Input id="csontritkulas_gyogyszer" {...register('anamnezis.csontritkulas_gyogyszer')} />
          </div>

          <RadioYesNo name="anamnezis.verhigito" label="Szed jelenleg vérhígítót? *" />
        </div>
      </section>

      {/* 4. Allergiák */}
      <section className="space-y-4">
        <h3 className="text-xl font-semibold bg-muted/50 p-3 rounded-md">Allergiák</h3>
        <div className="px-2 space-y-4">
          <div className="space-y-2">
            <RadioYesNo name="anamnezis.gyogyszer_allergia" label="Van-e allergiás panasza bármilyen gyógyszerre, vagy gyógyszerhatású készítményre? *" />
            {allergiagyogyszer === 'Igen' && (
              <div className="pl-4 pb-4 border-b border-border/50 animate-in fade-in">
                <Label htmlFor="gyogyszer_allergia_reszletek">Ha igen, melyekre?</Label>
                <Input id="gyogyszer_allergia_reszletek" className="mt-2" {...register('anamnezis.gyogyszer_allergia_reszletek')} />
              </div>
            )}
          </div>
          
          <div className="space-y-2 border-b border-border/50 pb-4">
            <Label htmlFor="egyeb_allergia_reszletek" className="text-destructive font-medium">Van-e allergiás panasza fémekre, műanyagokra, növényekre, virágokra, élelmiszerre, egyébre? Melyekre? *</Label>
            <Input id="egyeb_allergia_reszletek" {...register('anamnezis.egyeb_allergia')} />
          </div>
        </div>
      </section>

      {/* 5. Életmód */}
      <section className="space-y-4">
        <h3 className="text-xl font-semibold bg-muted/50 p-3 rounded-md">Életmód</h3>
        <div className="px-2 space-y-2">
          <RadioYesNo name="anamnezis.varandos_vagy_szoptat" label="Várandós vagy szoptat-e? *" />
          <RadioYesNo name="anamnezis.alkohol_rendszeresen" label="Alkoholt fogyaszt-e rendszeresen? *" />
          
          <div className="space-y-2">
            <RadioYesNo name="anamnezis.drog_rendszeresen" label="Tudatmódosító szert, drogot fogyaszt-e rendszeresen? *" />
            {drog === 'Igen' && (
              <div className="pl-4 pb-2 animate-in fade-in">
                <Label htmlFor="drog_reszletek">Ha igen, mit és mennyit?</Label>
                <Input id="drog_reszletek" className="mt-2" {...register('anamnezis.drog_reszletek')} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <RadioYesNo name="anamnezis.dohanyzik" label="Dohányzik-e rendszeresen? *" />
            {dohanyzik === 'Igen' && (
              <div className="pl-4 pb-2 animate-in fade-in border-b border-border/50">
                <Label htmlFor="dohanyzas_mennyiseg">Ha igen, mennyit naponta?</Label>
                <Input id="dohanyzas_mennyiseg" className="mt-2" {...register('anamnezis.dohanyzas_mennyiseg')} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 6. Egyéb Betegségek */}
      <section className="space-y-4">
        <h3 className="text-xl font-semibold bg-muted/50 p-3 rounded-md">Egyéb Betegségek</h3>
        <div className="px-2">
            <RadioYesNo name="anamnezis.cukorbetegseg" label="Szenved-e cukorbetegségben? *" />
            <RadioYesNo name="anamnezis.inzulin" label="Inzulint használ? *" />
            <RadioYesNo name="anamnezis.magas_vernyomas" label="Szenved-e magas vérnyomás betegségben? *" />
            <RadioYesNo name="anamnezis.pajzsmirigy" label="Szenved-e pajzsmirigy funkciós problémákban? *" />
            <RadioYesNo name="anamnezis.reumas_betegseg" label="Szenved-e reumás betegségben? *" />
            <RadioYesNo name="anamnezis.epilepszia" label="Szenved-e epilepsziás betegségben? *" />
            
            <div className="space-y-4 border-b border-border/50 pb-4">
              <RadioYesNo name="anamnezis.tudobetegseg" label="Szenved-e tüdőbetegségben? *" />
              {tudobetegseg === 'Igen' && (
                <div className="pl-4 space-y-2 animate-in fade-in block">
                  <Label className="text-muted-foreground block mb-2">Ha igen, miben?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-row items-start space-x-2">
                      <Checkbox id="t_tbc" checked={watch('anamnezis.tudo_tbc')} onCheckedChange={v => setValue('anamnezis.tudo_tbc', !!v)} />
                      <Label htmlFor="t_tbc" className="font-normal cursor-pointer">TBC</Label>
                    </div>
                    <div className="flex flex-row items-start space-x-2">
                      <Checkbox id="t_asztma" checked={watch('anamnezis.tudo_asztma')} onCheckedChange={v => setValue('anamnezis.tudo_asztma', !!v)} />
                      <Label htmlFor="t_asztma" className="font-normal cursor-pointer">Asztma</Label>
                    </div>
                    <div className="flex flex-row items-start space-x-2">
                      <Checkbox id="t_kronikus" checked={watch('anamnezis.tudo_kronikus_bronhitisz')} onCheckedChange={v => setValue('anamnezis.tudo_kronikus_bronhitisz', !!v)} />
                      <Label htmlFor="t_kronikus" className="font-normal cursor-pointer">Krónikus bronhitisz</Label>
                    </div>
                    <div className="flex flex-row items-start space-x-2">
                      <Checkbox id="t_gyulladas" checked={watch('anamnezis.tudo_gyulladas')} onCheckedChange={v => setValue('anamnezis.tudo_gyulladas', !!v)} />
                      <Label htmlFor="t_gyulladas" className="font-normal cursor-pointer">Tüdőgyulladás</Label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <RadioYesNo name="anamnezis.vesebetegseg" label="Szenved-e vesebetegségben? *" />
            
            <div className="space-y-4 border-b border-border/50 pb-4">
              <RadioYesNo name="anamnezis.idegrendszeri_betegseg" label="Szenved-e idegrendszeri betegségben? *" />
              {idegrendszeri === 'Igen' && (
                <div className="pl-4 space-y-2 animate-in fade-in block">
                  <div className="flex flex-row items-start space-x-2">
                    <Checkbox id="i_epilepszia" checked={watch('anamnezis.ideg_epilepszia')} onCheckedChange={v => setValue('anamnezis.ideg_epilepszia', !!v)} />
                    <Label htmlFor="i_epilepszia" className="font-normal cursor-pointer">Epilepszia</Label>
                  </div>
                  <div className="flex flex-row items-start space-x-2">
                    <Checkbox id="i_agyverzes" checked={watch('anamnezis.ideg_agyverzes')} onCheckedChange={v => setValue('anamnezis.ideg_agyverzes', !!v)} />
                    <Label htmlFor="i_agyverzes" className="font-normal cursor-pointer">Agyvérzés</Label>
                  </div>
                  <div className="flex flex-row items-start space-x-2">
                    <Checkbox id="i_benulas" checked={watch('anamnezis.ideg_benulas')} onCheckedChange={v => setValue('anamnezis.ideg_benulas', !!v)} />
                    <Label htmlFor="i_benulas" className="font-normal cursor-pointer">Bénulás</Label>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <RadioYesNo name="anamnezis.szorongas_depresszio" label="Állt-e, vagy áll-e jelenleg szorongás, depresszió miatt kezelés alatt? *" />
              {szorongas === 'Igen' && (
                <div className="pl-4 pb-2 animate-in fade-in border-b border-border/50">
                  <Label htmlFor="szorongas_gyogyszer">Ha igen, milyen gyógyszereket szedett/szed?</Label>
                  <Input id="szorongas_gyogyszer" className="mt-2" {...register('anamnezis.szorongas_gyogyszer')} />
                </div>
              )}
            </div>

            <RadioYesNo name="anamnezis.immunhiany_hiv" label="Szenved-e immunhiányos betegségben - HIV pozitív? *" />
            <RadioYesNo name="anamnezis.autoimmun" label="Van-e autoimmun betegsége? *" />
            <RadioYesNo name="anamnezis.emesztorendszeri" label="Szenved-e emésztőrendszeri betegségben? *" />
            
            <div className="space-y-4 mt-4 px-2">
              <div className="space-y-2 pb-2">
                <Label htmlFor="fertozo" className="text-destructive font-medium">Szenved-e fertőző betegségben? (pl. influenza, hepatitis stb.) Ha igen, melyek ezek? *</Label>
                <Input id="fertozo" {...register('anamnezis.fertozo_betegseg')} />
              </div>
              <div className="space-y-2 pb-2">
                <Label htmlFor="egyeb_betegs" className="font-medium">Szenved-e egyéb betegségben? Ha igen, melyek ezek?</Label>
                <Input id="egyeb_betegs" {...register('anamnezis.egyeb_betegseg')} />
              </div>

              <div className="space-y-2">
                <RadioYesNo name="anamnezis.korabbi_mutet" label="Volt-e bármilyen műtétje korábban? *" />
                {mutet === 'Igen' && (
                  <div className="pl-4 pb-2 animate-in fade-in border-b border-border/50">
                    <Label htmlFor="k_mutet_resz">Ha igen, milyen?</Label>
                    <Input id="k_mutet_resz" className="mt-2" {...register('anamnezis.korabbi_mutet_reszletek')} />
                  </div>
                )}
              </div>
              
              <div className="space-y-2 pt-2">
                <Label htmlFor="maj_tipus" className="text-destructive font-medium">Volt-e fertőző májgyulladása? Melyik típus? *</Label>
                <Input id="maj_tipus" placeholder="Pl: A, B, C..." {...register('anamnezis.majgyulladas_tipus')} />
              </div>
            </div>
        </div>
      </section>

      {/* 7. Fogászati Specifikus */}
      <section className="space-y-4">
        <h3 className="text-xl font-semibold bg-muted/50 p-3 rounded-md">Fogászati Anamnézis</h3>
        <div className="px-2 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rago_fajdalom" className="text-destructive font-medium">Rágóizomzatát szokta-e fájdalmasnak érezni? Ha igen, hol? *</Label>
            <Input id="rago_fajdalom" {...register('anamnezis.ragoizomzat_fajdalom')} />
          </div>
          <div className="space-y-2">
            <Label className="text-destructive font-medium">Kattog-e valamelyik oldali rágóizülete? Ha igen, melyik oldali? *</Label>
            <Select value={watch('anamnezis.kattog_ragoizulet')} onValueChange={(v) => setValue('anamnezis.kattog_ragoizulet', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Válasszon..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Nem kattog">Nem kattog</SelectItem>
                <SelectItem value="Bal">Bal</SelectItem>
                <SelectItem value="Jobb">Jobb</SelectItem>
                <SelectItem value="Mindkettő">Mindkettő</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <RadioYesNo name="anamnezis.fogszabalyozo" label="Volt-e fogszabályozó készüléke? *" />

          <div className="space-y-2 border-b border-border/50 pb-4">
            <Label htmlFor="kapott_erz" className="text-destructive font-medium">Kapott-e már fogászati érzéstelenítést? *</Label>
            <Input id="kapott_erz" {...register('anamnezis.kapott_erzestelenitest')} />
          </div>

          <div className="space-y-2">
            <RadioYesNo name="anamnezis.erzestelenites_komplikacio" label="Fellépett-e komplikáció a fogászati érzéstelenítés során? *" />
            {erzestelenites === 'Igen' && (
              <div className="pl-4 pb-2 animate-in fade-in border-b border-border/50">
                <Label htmlFor="erz_komp">Ha igen, mi?</Label>
                <Input id="erz_komp" className="mt-2" {...register('anamnezis.erzestelenites_komplikacio_reszletek')} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 8. Alvás és Fájdalmak */}
      <section className="space-y-4">
        <h3 className="text-xl font-semibold bg-muted/50 p-3 rounded-md">Alvás és Fájdalmak</h3>
        <div className="px-2">
          <RadioYesNo name="anamnezis.horkol" label="Horkol? *" />
          <RadioYesNo name="anamnezis.kiakad_allkapocs" label="Szokott-e kiakadni az állkapcsa? *" />
          <RadioYesNo name="anamnezis.reggel_fejfajas" label="Szokott-e reggelente fejfájással ébredni? *" />
          <RadioYesNo name="anamnezis.reggel_nyak_hat_fajas" label="Szokott-e reggelente fájni a nyaka, háta? *" />
          <RadioYesNo name="anamnezis.forgolodik_alvas_kozben" label="Szokott-e forgolódni alvás közben? *" />
          <RadioYesNo name="anamnezis.migrenes_fejfajas" label="Szenved-e migrénes fejfájástól? *" />
          <RadioYesNo name="anamnezis.nappali_almossag" label="Szokta-e nappal erős álmosság gyötörni? *" />
          <RadioYesNo name="anamnezis.delutan_nyakfajas" label="Szokott-e délután fájni a nyaka? *" />
          <RadioYesNo name="anamnezis.delutan_fejfajas" label="Szokott-e délután fájni a feje? *" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
            <div className="space-y-2">
              <Label className="font-medium">Milyen sűrűn fáj a feje?</Label>
              <Select value={watch('anamnezis.fejfajas_suruseg')} onValueChange={(v) => setValue('anamnezis.fejfajas_suruseg', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Válasszon..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Nem fáj">Nem fáj</SelectItem>
                  <SelectItem value="Ritkán">Ritkán</SelectItem>
                  <SelectItem value="Hetente">Hetente</SelectItem>
                  <SelectItem value="Naponta">Naponta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-medium">Milyen sűrűn fáj a nyaka?</Label>
              <Select value={watch('anamnezis.nyakfajas_suruseg')} onValueChange={(v) => setValue('anamnezis.nyakfajas_suruseg', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Válasszon..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Nem fáj">Nem fáj</SelectItem>
                  <SelectItem value="Ritkán">Ritkán</SelectItem>
                  <SelectItem value="Hetente">Hetente</SelectItem>
                  <SelectItem value="Naponta">Naponta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4 pb-4">
            <div className="space-y-2">
              <Label htmlFor="fajdalom_resz">Amennyiben Önnek szokott fájni a feje, nyaka vagy a válla, kérjük, írja körül pontosan a fájdalmak jelentkezésének helyét (fej, váll, nyak, elől-hátul, bal-jobb, stb).</Label>
              <Textarea id="fajdalom_resz" className="h-20" {...register('anamnezis.fajdalom_reszletezes')} />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="egyeb_befol" className="text-destructive font-medium">Van-e tudomása bármilyen olyan egyéb körülményről, ami a kezelést befolyásolhatja? *</Label>
              <Textarea id="egyeb_befol" className="h-20" {...register('anamnezis.egyeb_befolyasolo_korulmeny')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="honnan_ert" className="text-destructive font-medium">Honnan értesült rendelőnkről? (családtag, rokon, ismerős, sajtó, internet, tv, egyéb, mégpedig: *</Label>
              <Input id="honnan_ert" {...register('anamnezis.honnan_ertesult')} />
            </div>
          </div>
        </div>
      </section>

      {/* 9. Jogi Nyilatkozatok */}
      <section className="space-y-6 pt-6 border-t border-border">
        <h3 className="text-xl font-semibold p-3 rounded-md border border-destructive/20 bg-destructive/5 text-destructive">Nyilatkozatok és Hozzájárulások *</h3>
        <div className="px-2 space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox 
              id="ny_adatkezeles" 
              checked={watch('anamnezis.nyilatkozat_adatkezeles')} 
              onCheckedChange={v => setValue('anamnezis.nyilatkozat_adatkezeles', !!v)} 
            />
            <Label htmlFor="ny_adatkezeles" className="font-normal text-sm text-balance leading-snug cursor-pointer">
              Jelen nyilatkozatom alapján visszavonásig hozzájárulok ahhoz, hogy a rendelő az Adatkezelési Szabályzatában meghatározott feltételek alapján, az abban foglalt Adatkezelők a megadott személyes Adataimat az ellátásomhoz közvetlenül szükséges egészségügyi adataimat az Adatkezelő révén nyújtott szolgáltatásokkal kapcsolatos feladataik ellátásához szükséges mértékben kezeljék...
            </Label>
          </div>
          
          <div className="pl-7 space-y-2 pb-4 border-b border-border/50">
            <RadioYesNo name="anamnezis.nyilatkozat_email" label="A rendelő a megadott elektronikus kapcsolattartási adatokon keresztül email értesítőt küldhet számomra: *" />
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox 
              id="ny_tajekoztatas" 
              checked={watch('anamnezis.nyilatkozat_tajekoztatas')} 
              onCheckedChange={v => setValue('anamnezis.nyilatkozat_tajekoztatas', !!v)} 
            />
            <Label htmlFor="ny_tajekoztatas" className="font-normal text-sm text-balance leading-snug cursor-pointer">
              Tudomásul veszem, hogy az Egészségügyi Törvényben foglalt kötelezettségeimnek megfelelően az ellátásomban közreműködő egészségügyi dolgozókat tájékoztatnom kell mindarról, amely szükséges a kórisme megállapításához, a megfelelő kezelési terv elkészítéséhez és a beavatkozások elvégzéséhez...
            </Label>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox 
              id="ny_kockazat" 
              checked={watch('anamnezis.nyilatkozat_kockazat')} 
              onCheckedChange={v => setValue('anamnezis.nyilatkozat_kockazat', !!v)} 
            />
            <Label htmlFor="ny_kockazat" className="font-normal text-sm text-balance leading-snug cursor-pointer">
              A fogászati kezelések mikrosebészeti műtéti beavatkozásnak minősülnek. A műtéti beavatkozásoknak a legnagyobb gondosság mellett is lehetnek nemkívánatos következményei pl.: az eszközök véletlenszerű lenyelése, légutakba kerülése, idősérülés. Az érzéstelenítés együtt járhat a tű betörésével, fertőzéssel...
            </Label>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox 
              id="ny_rtg" 
              checked={watch('anamnezis.nyilatkozat_rtg_megtart')} 
              onCheckedChange={v => setValue('anamnezis.nyilatkozat_rtg_megtart', !!v)} 
            />
            <Label htmlFor="ny_rtg" className="font-normal text-sm text-balance leading-snug cursor-pointer">
              A készült RTG felvételeket, illetve nálunk leadott RTG felvételeket jogi és orvosi okokból megtartjuk. (Ezekről kérésre ingyenesen digitális másolatot készítünk)
            </Label>
          </div>

          <div className="flex items-start space-x-3 mt-6 p-4 bg-muted/50 rounded-lg border border-border">
            <Checkbox 
              id="ny_megertettem" 
              checked={watch('anamnezis.nyilatkozat_megertettem')} 
              onCheckedChange={v => setValue('anamnezis.nyilatkozat_megertettem', !!v)} 
            />
            <Label htmlFor="ny_megertettem" className="font-bold text-sm cursor-pointer">
              Kijelentem, hogy ezt a dokumentumot teljes egészében elolvastam, és teljes mértékben megértettem az itt leírtakat. *
            </Label>
          </div>
        </div>
      </section>
    </div>
  );
}
