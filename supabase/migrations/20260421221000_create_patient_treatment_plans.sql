CREATE TABLE public.patient_treatment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES public.patient_alap_adatok(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    telephely_id UUID REFERENCES public.telephely(id),
    voice_job_id UUID REFERENCES public.native_voice_jobs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.patient_treatment_plan_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES public.patient_treatment_plans(id) ON DELETE CASCADE,
    vizit INTEGER NOT NULL,
    szakterulet TEXT,
    fog TEXT,
    hidtag TEXT,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    scaling TEXT,
    talalat BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for patient_treatment_plans
ALTER TABLE public.patient_treatment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view treatment plans in their telephely" 
    ON public.patient_treatment_plans FOR SELECT 
    USING (
        telephely_id IN (
            SELECT telephely_id FROM public.telephely_memberships WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert treatment plans in their telephely" 
    ON public.patient_treatment_plans FOR INSERT 
    WITH CHECK (
        telephely_id IN (
            SELECT telephely_id FROM public.telephely_memberships WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for patient_treatment_plan_items
ALTER TABLE public.patient_treatment_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items of their telephely's plans" 
    ON public.patient_treatment_plan_items FOR SELECT 
    USING (
        plan_id IN (
            SELECT id FROM public.patient_treatment_plans 
            WHERE telephely_id IN (
                SELECT telephely_id FROM public.telephely_memberships WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can insert items to their telephely's plans" 
    ON public.patient_treatment_plan_items FOR INSERT 
    WITH CHECK (
        plan_id IN (
            SELECT id FROM public.patient_treatment_plans 
            WHERE telephely_id IN (
                SELECT telephely_id FROM public.telephely_memberships WHERE user_id = auth.uid()
            )
        )
    );
