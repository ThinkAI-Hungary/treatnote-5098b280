import { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, ArrowRight, Save, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { toast } from '@/hooks/useToastMessage';
import { useNavigate } from 'react-router-dom';

import { patientWizardSchema, PatientWizardFormValues } from './form/schema';
import { Step1AlapAdatok } from './form/Step1AlapAdatok';
import { Step2TovabbiAdatok } from './form/Step2TovabbiAdatok';
import { Step3Anamnezis } from './form/Step3Anamnezis';
import { Step4Attekintes } from './form/Step4Attekintes';

const STEPS = [
  { id: 1, title: 'Alap adatok' },
  { id: 2, title: 'További adatok' },
  { id: 3, title: 'Anamnézis' },
  { id: 4, title: 'Áttekintés' }
];

export function NewPatientWizard({ 
  onCancel,
  existingPatient,
  onSuccess
}: { 
  onCancel: () => void;
  existingPatient?: any;
  onSuccess?: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { profile } = useProfile();
  const navigate = useNavigate();

  const scrubNulls = (obj: any): any => {
    if (obj === null) return undefined;
    if (typeof obj === 'object' && !Array.isArray(obj)) {
      const newObj: any = {};
      for (const key in obj) {
        newObj[key] = scrubNulls(obj[key]);
      }
      return newObj;
    }
    return obj;
  };

  const initialValues = existingPatient ? {
    ...scrubNulls(existingPatient),
    anamnezis: {
      nyilatkozat_adatkezeles: false,
      nyilatkozat_tajekoztatas: false,
      nyilatkozat_kockazat: false,
      nyilatkozat_rtg_megtart: false,
      nyilatkozat_megertettem: false,
      tudo_tbc: false,
      tudo_asztma: false,
      tudo_kronikus_bronhitisz: false,
      tudo_gyulladas: false,
      ideg_epilepszia: false,
      ideg_agyverzes: false,
      ideg_benulas: false,
      ...(existingPatient.anamnezis || {})
    }
  } : {
    kaphat_email_ertesitot: false,
    inaktiv_paciens: false,
    nem_kivant_paciens: false,
    nem_ker_levelet: false,
    orszag: 'Magyarország',
    telefon_1_orszagkod: '36',
    marketing_hozzajarulas: false,
    anamnezis: {
      nyilatkozat_adatkezeles: false,
      nyilatkozat_tajekoztatas: false,
      nyilatkozat_kockazat: false,
      nyilatkozat_rtg_megtart: false,
      nyilatkozat_megertettem: false,
      tudo_tbc: false,
      tudo_asztma: false,
      tudo_kronikus_bronhitisz: false,
      tudo_gyulladas: false,
      ideg_epilepszia: false,
      ideg_agyverzes: false,
      ideg_benulas: false,
    }
  };

  const methods = useForm<PatientWizardFormValues>({
    resolver: zodResolver(patientWizardSchema),
    defaultValues: initialValues as any,
    mode: 'onTouched'
  });

  const { trigger, handleSubmit, formState: { errors } } = methods;

  const validateStep = async (step: number) => {
    if (step === 1) {
      return await trigger(['vezeteknev', 'keresztnev', 'iranyitoszam', 'varos', 'utca_hazszam']);
    } else if (step === 3) {
      const valid = await trigger(['anamnezis.nyilatkozat_megertettem']);
      if (!valid) {
        toast.error('Kérjük, fogadja el a nyilatkozatot a folytatáshoz!');
        return false;
      }
    }
    return true;
  };

  const handleNext = async () => {
    const isValid = await validateStep(currentStep);

    if (isValid) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      toast.error('Kérjük töltsön ki minden kötelező mezőt a továbblépéshez!');
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStepClick = async (stepId: number) => {
    if (stepId === currentStep) return;
    
    // Check if we are trying to go forward
    if (stepId > currentStep) {
      // Validate all steps between current and target
      for (let i = currentStep; i < stepId; i++) {
        const valid = await validateStep(i);
        if (!valid) {
           toast.error('Olyan oldalra nem ugorhat, amíg a jelenlegi adatok hiányosak!');
           setCurrentStep(i); // keep them at the first invalid step
           return;
        }
      }
    }
    setCurrentStep(stepId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = async (data: PatientWizardFormValues) => {
    setIsSubmitting(true);
    try {
      if (!profile?.company_id) throw new Error('Nincs aktív company context.');
      const activeTelephelyId = (profile as any)?.current_telephely_id || profile.telephely_id;
      if (!activeTelephelyId) throw new Error('Nincs aktív telephely context.');

      // Format payloads and prep for insert
      const { anamnezis, ...mainFields } = data;
      
      const payload = {
        ...mainFields,
        flexident_id: mainFields.flexident_id || null,
        szuletesi_ido: mainFields.szuletesi_ido || null,
        husegprogram_vege: mainFields.husegprogram_vege || null,
        anamnezis: anamnezis,
        company_id: profile.company_id,
        telephely_ids: [activeTelephelyId]
      };

      if (existingPatient?.id) {
        const { error } = await supabase
          .from('patient_alap_adatok')
          .update(payload)
          .eq('id', existingPatient.id);

        if (error) throw error;
        toast.success('Páciens sikeresen frissítve!');
        
        if (onSuccess) {
           onSuccess();
        } else {
           onCancel();
        }
      } else {
        const { data: insertedData, error } = await supabase
          .from('patient_alap_adatok')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;

        toast.success('Páciens sikeresen regisztrálva!');
        
        // Navigate to patient profile view
        if (insertedData) {
          navigate(`/patients/${insertedData.id}`);
        } else {
          onCancel();
        }
      }

    } catch (err: any) {
      console.error('Error saving patient:', err);
      toast.error('Hiba történt a mentés során: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onFormError = (errors: any) => {
    console.error('Form validációs hibák:', errors);
    const translatedMessages: string[] = [];
    const extractMessagesWithKeys = (obj: any, path: string = '') => {
      for (const key in obj) {
        const currentPath = path ? `${path}.${key}` : key;
        if (obj[key] && obj[key].message) {
          let msg = obj[key].message;
          if (msg.includes('Expected string, received null')) msg = `(Mező: ${currentPath}) Egyik nem kötelező mező értéke betöltéskor hibás (null vs szöveg) állapotba került.`;
          else if (msg.includes('Required')) msg = `(Mező: ${currentPath}) Egy kötelező adat hiányzik.`;
          else if (msg.includes('Invalid')) msg = `(Mező: ${currentPath}) Érvénytelen formátum.`;
          else msg = `(Mező: ${currentPath}) ${msg}`;
          translatedMessages.push(msg);
        } else if (obj[key] && typeof obj[key] === 'object') {
          extractMessagesWithKeys(obj[key], currentPath);
        }
      }
    };
    extractMessagesWithKeys(errors);
    
    if (translatedMessages.length > 0) {
      toast.error(`Validációs hiba! Kérem ellenőrizze az alábbiakat: ${translatedMessages.join(', ')}`);
    } else {
      toast.error(`Validációs hiba! Hiányzó kötelező mezők a nyomtatványban.`);
    }
  };

  return (
    <Card className="w-full max-w-5xl mx-auto border-border">
      <CardHeader className="bg-muted/30 border-b pb-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <CardTitle className="text-2xl">
              {existingPatient ? 'Páciens Adatainak Szerkesztése' : 'Új Páciens Regisztráció'}
            </CardTitle>
            <CardDescription className="mt-1">
              {currentStep === 4 ? 'Kérjük, ellenőrizze az adatokat!' : 'A *-al jelölt mezők kitöltése kötelező.'}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Mégse / Bezárás
          </Button>
        </div>

        {/* Progress Bar steps */}
        <div className="relative flex justify-between items-start w-full mt-2 pt-2">
          {/* Vonalak a körök közepéhez (kör = h-8, azaz 32px, a közepe 16px-nél van, top-4) */}
          <div className="absolute left-0 top-4 w-full h-1 bg-border rounded-full -z-10" />
          <div 
            className="absolute left-0 top-4 h-1 bg-primary rounded-full -z-10 transition-all duration-300"
            style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
          />
          
          {STEPS.map((step) => (
            <button 
              type="button"
              key={step.id} 
              className="flex flex-col items-center gap-2 cursor-pointer transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none relative"
              onClick={() => handleStepClick(step.id)}
              disabled={isSubmitting}
            >
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-300 ${
                  step.id < currentStep ? 'bg-primary text-primary-foreground' :
                  step.id === currentStep ? 'bg-primary ring-4 ring-primary/20 text-primary-foreground' :
                  'bg-muted text-muted-foreground border-2 border-border/50'
                }`}
              >
                {step.id < currentStep ? <CheckCircle2 className="w-5 h-5" /> : step.id}
              </div>
              <span className={`text-xs font-semibold ${step.id === currentStep ? 'text-primary' : 'text-muted-foreground'}`}>
                {step.title}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit, onFormError)} className="flex flex-col">
          <CardContent className="p-6 md:p-8 min-h-[400px]">
            {currentStep === 1 && <Step1AlapAdatok />}
            {currentStep === 2 && <Step2TovabbiAdatok />}
            {currentStep === 3 && <Step3Anamnezis />}
            {currentStep === 4 && <Step4Attekintes />}
          </CardContent>

          <CardFooter className="bg-muted/30 border-t flex items-center justify-between p-6">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrev}
              disabled={currentStep === 1 || isSubmitting}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Vissza
            </Button>

            {currentStep < STEPS.length ? (
              <Button type="button" onClick={handleNext} className="min-w-[120px]">
                Tovább <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={isSubmitting} className="min-w-[140px]">
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Folyamatban</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> Mentés & Befejezés</>
                )}
              </Button>
            )}
          </CardFooter>
        </form>
      </FormProvider>
    </Card>
  );
}
