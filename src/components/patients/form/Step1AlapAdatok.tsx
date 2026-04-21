import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Info, CalendarIcon, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { PatientWizardFormValues } from './schema';
import { CITIES, getCityByZip, getZipByCity } from '@/lib/zipcodes';

const COUNTRIES_HU = [
  "Magyarország", "Afganisztán", "Albánia", "Algéria", "Andorra", "Angola", "Antigua és Barbuda", 
  "Argentína", "Örményország", "Ausztrália", "Ausztria", "Azerbajdzsán", "Bahama-szigetek", "Bahrein", 
  "Banglades", "Barbados", "Fehéroroszország", "Belgium", "Belize", "Benin", "Bhután", "Bolívia", 
  "Bosznia-Hercegovina", "Botswana", "Brazília", "Brunei", "Bulgária", "Burkina Faso", "Burundi", 
  "Kambodzsa", "Kamerun", "Kanada", "Zöld-foki Köztársaság", "Közép-afrikai Köztársaság", "Csád", 
  "Chile", "Kína", "Kolumbia", "Comore-szigetek", "Kongói Köztársaság", "Kongói Demokratikus Köztársaság", 
  "Costa Rica", "Elefántcsontpart", "Horvátország", "Kuba", "Ciprus", "Csehország", "Dánia", "Dzsibuti", 
  "Dominikai Közösség", "Dominikai Köztársaság", "Kelet-Timor", "Ecuador", "Egyiptom", "El Salvador", 
  "Egyenlítői-Guinea", "Eritrea", "Észtország", "Etiópia", "Fidzsi-szigetek", "Finnország", "Franciaország", 
  "Gabon", "Gambia", "Grúzia", "Németország", "Ghána", "Görögország", "Grenada", "Guatemala", "Guinea", 
  "Bissau-Guinea", "Guyana", "Haiti", "Honduras", "Izland", "India", "Indonézia", "Irán", "Irak", 
  "Írország", "Izrael", "Olaszország", "Jamaica", "Japán", "Jordánia", "Kazahsztán", "Kenya", "Kiribati", 
  "Koszovó", "Kuvait", "Kirgizisztán", "Laosz", "Lettország", "Libanon", "Lesotho", "Libéria", "Líbia", 
  "Liechtenstein", "Litvánia", "Luxemburg", "Észak-Macedónia", "Madagaszkár", "Malawi", "Malajzia", 
  "Maldív-szigetek", "Mali", "Málta", "Marshall-szigetek", "Mauritánia", "Mauritius", "Mexikó", 
  "Mikronézia", "Moldova", "Monaco", "Mongólia", "Montenegró", "Marokkó", "Mozambik", "Mianmar", 
  "Namíbia", "Nauru", "Nepál", "Hollandia", "Új-Zéland", "Nicaragua", "Niger", "Nigéria", "Észak-Korea", 
  "Norvégia", "Omán", "Pakisztán", "Palau", "Palesztina", "Panama", "Pápua Új-Guinea", "Paraguay", 
  "Peru", "Fülöp-szigetek", "Lengyelország", "Portugália", "Katar", "Románia", "Oroszország", "Ruanda", 
  "Saint Kitts és Nevis", "Saint Lucia", "Saint Vincent és a Grenadine-szigetek", "Szamoa", "San Marino", 
  "Sao Tomé és Príncipe", "Szaúd-Arábia", "Szenegál", "Szerbia", "Seychelle-szigetek", "Sierra Leone", 
  "Szingapúr", "Szlovákia", "Szlovénia", "Salamon-szigetek", "Szomália", "Dél-Afrika", "Dél-Korea", 
  "Dél-Szudán", "Spanyolország", "Srí Lanka", "Szudán", "Suriname", "Szváziföld", "Svédország", "Svájc", 
  "Szíria", "Tajvan", "Tádzsikisztán", "Tanzánia", "Thaiföld", "Togo", "Tonga", "Trinidad és Tobago", 
  "Tunézia", "Törökország", "Türkmenisztán", "Tuvalu", "Uganda", "Ukrajna", "Egyesült Arab Emírségek", 
  "Egyesült Királyság", "Egyesült Államok", "Uruguay", "Üzbegisztán", "Vanuatu", "Vatikán", 
  "Venezuela", "Vietnam", "Jemen", "Zambia", "Zimbabwe"
].sort((a, b) => a.localeCompare(b, 'hu'));

function ScrollColumn({ items, value, onChange, suffix, width }: any) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeout = useRef<NodeJS.Timeout>();

  const scrollToCenter = (el: HTMLElement) => {
      const container = containerRef.current;
      if (!container || !el) return;
      const targetTop = el.offsetTop - (container.clientHeight / 2) + (el.clientHeight / 2);
      const startTop = container.scrollTop;
      const distance = targetTop - startTop;
      
      if (Math.abs(distance) < 2) return;
      
      const duration = 250;
      let startTime: number | null = null;
      
      const step = (timestamp: number) => {
          if (!startTime) startTime = timestamp;
          const progress = timestamp - startTime;
          const percentage = Math.min(progress / duration, 1);
          // Ease-out cubic
          const ease = 1 - Math.pow(1 - percentage, 3);
          container.scrollTop = startTop + distance * ease;
          if (progress < duration) {
              window.requestAnimationFrame(step);
          }
      };
      window.requestAnimationFrame(step);
  };

  useEffect(() => {
    if (containerRef.current && value) {
      const el = containerRef.current.querySelector(`[data-value="${value}"]`) as HTMLElement;
      if (el) el.scrollIntoView({ block: 'center' });
    }
  }, [items]); // Re-center on mount or if items change (like moving from Jan to Feb)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      
      const key = e.key.toLowerCase();
      // Only trigger on explicit letter strokes
      if (key.length !== 1 || !/[a-záéíóöőúüű]/.test(key)) return;
      
      const firstMatch = items.find((item: any) => String(item.label).toLowerCase().startsWith(key));
      if (firstMatch && firstMatch.value !== value) {
         e.preventDefault();
         onChange(firstMatch.value);
         
         // Use setTimeout to ensure DOM has flushed and the center scroll calculates against the actual position
         setTimeout(() => {
            if (!containerRef.current) return;
            const el = containerRef.current.querySelector(`[data-value="${firstMatch.value}"]`) as HTMLElement;
            if (el) scrollToCenter(el);
         }, 0);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, value, onChange]);

  const handleScroll = () => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    
    scrollTimeout.current = setTimeout(() => {
      if (!containerRef.current) return;
      const containerCenter = containerRef.current.getBoundingClientRect().top + (containerRef.current.clientHeight / 2);
      let closestEl: Element | null = null;
      let minDistance = Infinity;
      
      containerRef.current.querySelectorAll('.wheel-item').forEach(child => {
          const rect = child.getBoundingClientRect();
          const childCenter = rect.top + (rect.height / 2);
          const distance = Math.abs(childCenter - containerCenter);
          if (distance < minDistance) {
              minDistance = distance;
              closestEl = child;
          }
      });
      
      if (closestEl) {
          const closestAttr = closestEl.getAttribute('data-value');
          if (closestAttr && closestAttr !== value) {
              onChange(closestAttr);
          }
          scrollToCenter(closestEl as HTMLElement);
      }
    }, 120);
  };

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className={cn("h-[210px] overflow-y-auto relative", width)} 
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <div className="h-[85px]" /> 
      {items.map((item: any) => (
        <div
          key={item.value}
          data-value={item.value}
          onClick={(e) => {
             onChange(item.value);
             scrollToCenter(e.currentTarget as HTMLElement);
          }}
          className={cn(
            "wheel-item h-10 flex items-center justify-center cursor-pointer transition-all duration-200",
            value === item.value ? "font-bold text-lg text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground"
          )}
        >
          {item.label}{suffix}
        </div>
      ))}
      <div className="h-[85px]" />
    </div>
  )
}

function DateOfBirthSelector() {
  const { watch, setValue } = useFormContext<PatientWizardFormValues>();
  const initialVal = watch('szuletesi_ido');
  const [isOpen, setIsOpen] = useState(false);
  
  const [year, setYear] = useState<string>('');
  const [month, setMonth] = useState<string>('');
  const [day, setDay] = useState<string>('');

  useEffect(() => {
    if (initialVal && initialVal.includes('-')) {
      const [y, m, d] = initialVal.split('-');
      if (y !== year) setYear(y);
      if (m !== month) setMonth(m);
      if (d !== day) setDay(d);
    } else if (!initialVal) {
      const d = new Date();
      setYear((d.getFullYear() - 30).toString());
      setMonth(String(d.getMonth() + 1).padStart(2, '0'));
      setDay('01');
    }
  }, [initialVal]);

  useEffect(() => {
    if (year && month && day) {
      const newDate = `${year}-${month}-${day}`;
      if (newDate !== watch('szuletesi_ido')) {
        setValue('szuletesi_ido', newDate, { shouldValidate: true, shouldDirty: true });
      }
    }
  }, [year, month, day, setValue, watch]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 120 }, (_, i) => {
    const v = (currentYear - i).toString();
    return { label: v, value: v };
  });
  
  const monthNames = ["Jan", "Feb", "Már", "Ápr", "Máj", "Jún", "Júl", "Aug", "Szep", "Okt", "Nov", "Dec"];
  const months = monthNames.map((name, i) => ({
    label: name,
    value: String(i + 1).padStart(2, '0')
  }));
  
  const daysInMonth = year && month ? new Date(parseInt(year), parseInt(month), 0).getDate() : 31;
  useEffect(() => {
     if (day && parseInt(day) > daysInMonth) {
        setDay(String(daysInMonth).padStart(2, '0'));
     }
  }, [daysInMonth, day]);

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const v = String(i + 1).padStart(2, '0');
    return { label: v, value: v };
  });

  const displayVal = initialVal && initialVal.includes('-') 
    ? initialVal.split('-').join('. ') + '.'
    : null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !displayVal && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayVal ? displayVal : "ÉÉÉÉ. HH. NN."}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-4" align="center">
        <div 
          onClick={() => setIsOpen(false)}
          className="relative flex h-[210px] w-full items-center justify-between overflow-hidden"
          style={{ 
            maskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)', 
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)' 
          }}
        >
          <div className="absolute left-0 right-0 top-1/2 h-10 -translate-y-1/2 rounded bg-accent/50 pointer-events-none" />
          
          <ScrollColumn items={years} value={year} onChange={setYear} width="flex-1" suffix="." />
          <ScrollColumn items={months} value={month} onChange={setMonth} width="flex-1" suffix="" />
          <ScrollColumn items={days} value={day} onChange={setDay} width="flex-1" suffix="." />
        </div>
      </PopoverContent>
    </Popover>
  );
}

const countryOptions = COUNTRIES_HU.map(c => ({ label: c, value: c }));

function OrszagSelector() {
  const { watch, setValue } = useFormContext<PatientWizardFormValues>();
  const [isOpen, setIsOpen] = useState(false);
  const selectedOrszag = watch('orszag') || 'Magyarország';

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between text-left font-normal"
        >
          <span className="truncate">{selectedOrszag}</span>
          <div className="opacity-50 text-xs">▼</div> 
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-4" align="center">
        <div 
          onClick={() => setIsOpen(false)}
          className="relative flex h-[210px] w-full items-center justify-center overflow-hidden"
          style={{ 
            maskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)', 
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)' 
          }}
        >
          <div className="absolute left-0 right-0 top-1/2 h-10 -translate-y-1/2 rounded bg-accent/50 pointer-events-none" />
          
          <ScrollColumn items={countryOptions} value={selectedOrszag} onChange={(v: string) => setValue('orszag', v, { shouldValidate: true, shouldDirty: true })} width="w-full" suffix="" />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CityCombobox() {
  const { watch, setValue, getValues, formState: { errors } } = useFormContext<PatientWizardFormValues>();
  const [open, setOpen] = useState(false);
  const selectedCity = watch('varos') || '';
  const [search, setSearch] = useState('');

  const filteredCities = useMemo(() => {
    if (!search) return [];
    const s = search.toLowerCase();
    return CITIES.filter(c => c.toLowerCase().includes(s));
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !selectedCity && "text-muted-foreground",
            errors.varos && "border-destructive"
          )}
        >
          {selectedCity ? selectedCity : "Válasszon vagy gépeljen..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* prevent flipping upwards and losing focus lag */}
      <PopoverContent 
        side="bottom" 
        sideOffset={4}
        avoidCollisions={false}
        className="w-[var(--radix-popover-trigger-width)] p-0 z-50 shadow-md" 
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Város keresése..." 
            value={search} 
            onValueChange={setSearch} 
          />
          <CommandList className="max-h-[250px] overflow-y-auto">
            <CommandEmpty>{search ? "Nincs találat." : "Kezdjen el gépelni a kereséshez..."}</CommandEmpty>
            <CommandGroup>
              {filteredCities.map((city) => (
                <CommandItem
                  key={city}
                  value={city}
                  onSelect={() => {
                    setValue('varos', city, { shouldValidate: true, shouldDirty: true });
                    const zip = getZipByCity(city);
                    if (zip) {
                       setValue('iranyitoszam', zip, { shouldValidate: true, shouldDirty: true });
                    }
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedCity === city ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {city}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function Step1AlapAdatok() {
  const { register, setValue, watch, getValues, formState: { errors } } = useFormContext<PatientWizardFormValues>();

  const vezeteknev = watch('vezeteknev');
  const keresztnev = watch('keresztnev');
  const prevVezeteknev = useRef(getValues('vezeteknev') || '');
  const prevKeresztnev = useRef(getValues('keresztnev') || '');

  useEffect(() => {
    const currentSzulVez = getValues('szuletesi_vezeteknev');
    if (!currentSzulVez || currentSzulVez === prevVezeteknev.current) {
      setValue('szuletesi_vezeteknev', vezeteknev || '', { shouldValidate: true, shouldDirty: true });
    }
    prevVezeteknev.current = vezeteknev || '';
  }, [vezeteknev, setValue, getValues]);

  useEffect(() => {
    const currentSzulKer = getValues('szuletesi_keresztnev');
    if (!currentSzulKer || currentSzulKer === prevKeresztnev.current) {
      setValue('szuletesi_keresztnev', keresztnev || '', { shouldValidate: true, shouldDirty: true });
    }
    prevKeresztnev.current = keresztnev || '';
  }, [keresztnev, setValue, getValues]);

  const kapEmail = watch('kapcsolattarto_email');
  useEffect(() => {
    if (!kapEmail) {
      setValue('kaphat_email_ertesitot', false);
    }
  }, [kapEmail, setValue]);

  const iranyitoszam = watch('iranyitoszam');
  const prevIranyitoszam = useRef(getValues('iranyitoszam') || '');

  useEffect(() => {
    if (iranyitoszam && iranyitoszam.length >= 4 && iranyitoszam !== prevIranyitoszam.current) {
      const city = getCityByZip(iranyitoszam.substring(0,4));
      if (city) {
         // Overwrite varos to match the new valid zip code
         setValue('varos', city, { shouldValidate: true, shouldDirty: true });
      }
    }
    prevIranyitoszam.current = iranyitoszam || '';
  }, [iranyitoszam, setValue, getValues]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
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
            <DateOfBirthSelector />
          </div>
          <div className="space-y-2">
            <Label htmlFor="szuletesi_hely">Születési hely</Label>
            <Input id="szuletesi_hely" {...register('szuletesi_hely')} />
          </div>
          <div className="space-y-2">
            <Label>Neme</Label>
            <Select value={watch('neme')} onValueChange={(v) => setValue('neme', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Válassza ki..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Férfi">Férfi</SelectItem>
                <SelectItem value="Nő">Nő</SelectItem>
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
            <Select value={watch('azonosito_okmany_tipusa')} onValueChange={(v) => setValue('azonosito_okmany_tipusa', v)}>
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
            <div className="flex items-center gap-2">
              <Label htmlFor="flexident_id">Páciens Flexident ID-ja</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>A Páciens ID megtalálható a "Páciens lista"-ban való szűrést követően az "ID" oszlopban, ezt a sorszámot kell ide beilleszteni arra a páciensre, akinek a felhasználójával dolgozni szeretne.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input id="flexident_id" {...register('flexident_id')} placeholder="Pl.: 104523" />
          </div>
          
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="orszag">Ország</Label>
            <OrszagSelector />
          </div>
          <div className="space-y-2">
            <Label htmlFor="iranyitoszam">Irányítószám *</Label>
            <Input id="iranyitoszam" {...register('iranyitoszam')} className={errors.iranyitoszam ? 'border-destructive' : ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="varos">Város *</Label>
            <CityCombobox />
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4">
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
    </div>
  );
}
