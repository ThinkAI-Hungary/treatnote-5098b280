import { useFormContext } from 'react-hook-form';
import { PatientWizardFormValues } from './schema';
import { Card, CardContent } from '@/components/ui/card';
import { HeartPulse, User, Phone, Pill, AlertTriangle } from 'lucide-react';

export function Step4Attekintes() {
  const { getValues } = useFormContext<PatientWizardFormValues>();
  const data = getValues();

  // Helper to extract true booleans or "Igen" text
  const isPos = (val: any) => val === 'Igen' || val === true;

  const anamnezis = data.anamnezis || {};

  const kockazatok = [];
  if (isPos(anamnezis.hajlamos_e_ajulasra)) kockazatok.push('Hajlamos ájulásra');
  if (isPos(anamnezis.szivbetegseg)) kockazatok.push('Szívbetegség');
  if (isPos(anamnezis.pacemaker)) kockazatok.push('Pacemaker');
  if (isPos(anamnezis.gyogyszer_allergia)) kockazatok.push(`Gyógyszer allergia (${anamnezis.gyogyszer_allergia_reszletek})`);
  if (isPos(anamnezis.verhigito)) kockazatok.push('Vérhígítót szed');
  if (isPos(anamnezis.cukorbetegseg)) kockazatok.push(`Cukorbeteg${isPos(anamnezis.inzulin) ? ' (Inzulinos)' : ''}`);
  if (isPos(anamnezis.magas_vernyomas)) kockazatok.push('Magas vérnyomás');
  if (isPos(anamnezis.varandos_vagy_szoptat)) kockazatok.push('Várandós / Szoptat');
  if (anamnezis.fertozo_betegseg) kockazatok.push(`Fertőző: ${anamnezis.fertozo_betegseg}`);

  const fobbGyogyszerek = [anamnezis.allando_gyogyszerek, anamnezis.jelenleg_szedett_gyogyszerek].filter(Boolean);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="bg-muted/50 p-4 rounded-lg border text-center mb-6">
        <h2 className="text-xl font-bold">Adatok áttekintése</h2>
        <p className="text-muted-foreground mt-1">Kérjük ellenőrizze az adatokat mentés előtt.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Személyes Adatok */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4 text-primary">
              <User className="h-5 w-5" />
              <h3 className="font-semibold text-lg">Személyes adatok</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">Név:</span>
                <span className="col-span-2 font-medium">{data.titulus ? `${data.titulus} ` : ''}{data.vezeteknev} {data.keresztnev}</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">Születési idő/hely:</span>
                <span className="col-span-2">{data.szuletesi_ido} {data.szuletesi_ido && data.szuletesi_hely ? '-' : ''} {data.szuletesi_hely}</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">Anyja neve:</span>
                <span className="col-span-2">{data.anyja_neve || '-'}</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">TAJ szám:</span>
                <span className="col-span-2">{data.taj_szam || '-'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Elérhetőségek */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4 text-primary">
              <Phone className="h-5 w-5" />
              <h3 className="font-semibold text-lg">Elérhetőségek és Cím</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">Lakcím:</span>
                <span className="col-span-2">{data.iranyitoszam} {data.varos}, {data.utca_hazszam}</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">Telefon:</span>
                <span className="col-span-2">{data.telefon_1_hivoszam ? `+${data.telefon_1_orszagkod} ${data.telefon_1_korzet} ${data.telefon_1_hivoszam}` : '-'}</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">E-mail:</span>
                <span className="col-span-2">{data.kapcsolattarto_email || '-'}</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">Hírlevél:</span>
                <span className="col-span-2">{data.marketing_hozzajarulas ? 'Engedélyezve' : 'Elutasítva'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Kockázati Tesztek */}
        <Card className="md:col-span-2 border-destructive/20 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-semibold text-lg">Kiemelt Kockázatok és Figyelmeztetések</h3>
            </div>
            {kockazatok.length > 0 ? (
              <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 list-disc list-inside text-sm font-medium text-destructive">
                {kockazatok.map((k, i) => <li key={i}>{k}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                Nincs kiemelt kockázati tényező regisztrálva.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Gyógyszerek */}
        <Card className="md:col-span-2">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4 text-primary">
              <Pill className="h-5 w-5" />
              <h3 className="font-semibold text-lg">Gyógyszerek</h3>
            </div>
            {fobbGyogyszerek.length > 0 ? (
              <div className="space-y-4">
                {anamnezis.allando_gyogyszerek && (
                  <div>
                    <span className="text-sm font-semibold tracking-wide text-muted-foreground block uppercase mb-1">Rendszeresen szedett:</span>
                    <p className="text-sm font-medium">{anamnezis.allando_gyogyszerek}</p>
                  </div>
                )}
                {anamnezis.jelenleg_szedett_gyogyszerek && (
                  <div>
                    <span className="text-sm font-semibold tracking-wide text-muted-foreground block uppercase mb-1">Jelenleg (elmúlt 12 óra):</span>
                    <p className="text-sm font-medium">{anamnezis.jelenleg_szedett_gyogyszerek}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nem szed gyógyszert.</p>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
