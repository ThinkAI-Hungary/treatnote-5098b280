-- =====================================================
-- SUPABASE DATABASE SCHEMA - Treatnote
-- =====================================================

-- Step 1: Create custom enum types
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- =====================================================
-- Step 2: Create Tables
-- =====================================================

-- Companies table
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  telephely text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Telephely table
CREATE TABLE public.telephely (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Profiles table
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  full_name text,
  phone text,
  avatar_url text,
  company_id uuid REFERENCES public.companies(id),
  company_name text,
  telephely_id uuid REFERENCES public.telephely(id),
  subscription_status text NOT NULL DEFAULT 'inactive',
  subscription_plan text,
  subscription_amount numeric,
  subscription_start_date timestamptz,
  subscription_end_date timestamptz,
  can_create_users boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Patients table
CREATE TABLE public.patients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Appointments table
CREATE TABLE public.appointments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  appointment_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  appointment_type text,
  notes text,
  reminder_sent boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Examinations table
CREATE TABLE public.examinations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  chief_complaint text,
  history_notes text,
  conditions text[] DEFAULT '{}',
  medications text[] DEFAULT '{}',
  allergies text[] DEFAULT '{}',
  asa_class integer,
  pain_scale integer,
  smoker boolean DEFAULT false,
  recent_caries boolean DEFAULT false,
  visible_plaque boolean DEFAULT false,
  appliances boolean DEFAULT false,
  saliva_adequacy boolean DEFAULT true,
  diet_frequency boolean DEFAULT false,
  fluoride_exposure boolean DEFAULT true,
  manual_override boolean DEFAULT false,
  risk_level text,
  risk_rationale text,
  full_upper_prosthesis boolean DEFAULT false,
  full_lower_prosthesis boolean DEFAULT false,
  partial_removable_prosthesis boolean DEFAULT false,
  all_on_4_upper boolean DEFAULT false,
  all_on_4_lower boolean DEFAULT false,
  csak_hid boolean DEFAULT false,
  egybeontott_korona boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Teeth table
CREATE TABLE public.teeth (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  tooth_number integer NOT NULL,
  tooth_type text NOT NULL DEFAULT 'permanent',
  present boolean DEFAULT true,
  caries boolean DEFAULT false,
  caries_locations text[] DEFAULT '{}',
  restoration text NOT NULL DEFAULT 'none',
  restoration_locations text[] DEFAULT '{}',
  crown text NOT NULL DEFAULT 'none',
  bridge text NOT NULL DEFAULT 'none',
  prosthesis text NOT NULL DEFAULT 'none',
  endo_status text NOT NULL DEFAULT 'none',
  pathology text NOT NULL DEFAULT 'none',
  treatment_plan text NOT NULL DEFAULT 'none',
  mobility integer DEFAULT 0,
  fissure_sealing boolean DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Bridge actions table
CREATE TABLE public.bridge_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  blue_teeth integer[] NOT NULL DEFAULT '{}',
  yellow_teeth integer[] NOT NULL DEFAULT '{}',
  is_sin boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Diagnoses table
CREATE TABLE public.diagnoses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  description text NOT NULL,
  tooth_number integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Treatment items table
CREATE TABLE public.treatment_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  tooth_number integer,
  label text NOT NULL,
  display_order integer NOT NULL,
  status text,
  priority text,
  estimated_cost numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Company app config table
CREATE TABLE public.company_app_config (
  company_id uuid NOT NULL PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  min_required_version text NOT NULL DEFAULT '0.0.0',
  enforce_mandatory_update boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Files table
CREATE TABLE public.files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  created_at timestamptz DEFAULT now()
);

-- File hashes table
CREATE TABLE public.file_hashes (
  path text NOT NULL PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id),
  version text,
  sha256 text NOT NULL,
  size bigint NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Folder structure table
CREATE TABLE public.folder_structure (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_path text NOT NULL UNIQUE,
  parent_path text,
  company_id uuid REFERENCES public.companies(id),
  is_client_folder boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Folder access table
CREATE TABLE public.folder_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id uuid NOT NULL REFERENCES public.folder_structure(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  granted_at timestamptz DEFAULT now(),
  UNIQUE(folder_id, user_id)
);

-- Flexi auth table
CREATE TABLE public.flexi_auth (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  name text,
  flexi_username text,
  flexi_pw text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- Step 3: Create Functions
-- =====================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.subscription_is_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND p.subscription_status = 'active'
      AND (p.subscription_end_date IS NULL OR p.subscription_end_date > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_company_version(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = _user_id
        AND p.company_id = _company_id
        AND p.subscription_status = 'active'
        AND (p.subscription_end_date IS NULL OR p.subscription_end_date > now())
    )
    OR
    public.has_role(_user_id, 'admin');
$$;

CREATE OR REPLACE FUNCTION public.can_access_path(_user_id uuid, _path text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH user_company AS (
    SELECT 
      p.company_id,
      c.name as company_name,
      c.slug as company_slug
    FROM public.profiles p
    LEFT JOIN public.companies c ON p.company_id = c.id
    WHERE p.user_id = _user_id
  )
  SELECT
    public.has_role(_user_id, 'admin')
    OR
    EXISTS (
      SELECT 1
      FROM public.folder_access fa
      JOIN public.folder_structure fs ON fa.folder_id = fs.id
      WHERE fa.user_id = _user_id
        AND fs.is_client_folder = false
        AND _path LIKE fs.folder_path || '/%'
    )
    OR
    EXISTS (
      SELECT 1
      FROM user_company uc
      WHERE uc.company_name IS NOT NULL
        AND _path LIKE 'Molaire/Voxis/Telephely/' || uc.company_name || '/Version/%'
    )
    OR
    EXISTS (
      SELECT 1
      FROM user_company uc
      JOIN public.profiles p ON p.user_id = _user_id
      WHERE uc.company_name IS NOT NULL
        AND _path LIKE 'Molaire/Voxis/Telephely/' || uc.company_name || '/' || 
                       COALESCE(NULLIF(p.full_name, ''), _user_id::text) || '/%'
    );
$$;

CREATE OR REPLACE FUNCTION public.get_company_names()
RETURNS TABLE(company_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT profiles.company_name
  FROM public.profiles
  WHERE profiles.company_name IS NOT NULL
  ORDER BY profiles.company_name;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_company_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    SELECT name INTO NEW.company_name
    FROM public.companies
    WHERE id = NEW.company_id;
  ELSE
    NEW.company_name := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_email_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    INSERT INTO public.profiles (user_id, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
    ON CONFLICT (user_id) DO NOTHING;
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- =====================================================
-- Step 4: Create Triggers
-- =====================================================

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sync_profiles_company_name
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_company_name();

-- =====================================================
-- Step 5: Enable RLS on all tables
-- =====================================================

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephely ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teeth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folder_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folder_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flexi_auth ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Step 6: Create RLS Policies
-- =====================================================

-- Companies policies
CREATE POLICY "Admins can manage companies" ON public.companies FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own company" ON public.companies FOR SELECT USING (id IN (SELECT company_id FROM profiles WHERE user_id = auth.uid()));

-- Telephely policies
CREATE POLICY "Admins can manage telephely" ON public.telephely FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their company's telephely" ON public.telephely FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE user_id = auth.uid()));

-- Profiles policies
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User roles policies
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Patients policies
CREATE POLICY "Admins can manage all patients" ON public.patients FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own patients" ON public.patients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own patients" ON public.patients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own patients" ON public.patients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own patients" ON public.patients FOR DELETE USING (auth.uid() = user_id);

-- Appointments policies
CREATE POLICY "Admins can manage all appointments" ON public.appointments FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own appointments" ON public.appointments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own appointments" ON public.appointments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own appointments" ON public.appointments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own appointments" ON public.appointments FOR DELETE USING (auth.uid() = user_id);

-- Examinations policies
CREATE POLICY "Admins can manage all examinations" ON public.examinations FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own examinations" ON public.examinations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own examinations" ON public.examinations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own examinations" ON public.examinations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own examinations" ON public.examinations FOR DELETE USING (auth.uid() = user_id);

-- Teeth policies
CREATE POLICY "Admins can manage all teeth" ON public.teeth FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can manage teeth from their examinations" ON public.teeth FOR ALL USING (EXISTS (SELECT 1 FROM examinations e WHERE e.id = teeth.examination_id AND e.user_id = auth.uid()));

-- Bridge actions policies
CREATE POLICY "Admins can manage all bridge actions" ON public.bridge_actions FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can manage bridge actions from their examinations" ON public.bridge_actions FOR ALL USING (EXISTS (SELECT 1 FROM examinations e WHERE e.id = bridge_actions.examination_id AND e.user_id = auth.uid()));

-- Diagnoses policies
CREATE POLICY "Admins can manage all diagnoses" ON public.diagnoses FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can manage diagnoses from their examinations" ON public.diagnoses FOR ALL USING (EXISTS (SELECT 1 FROM examinations e WHERE e.id = diagnoses.examination_id AND e.user_id = auth.uid()));

-- Treatment items policies
CREATE POLICY "Admins can manage all treatment items" ON public.treatment_items FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can manage treatment items from their examinations" ON public.treatment_items FOR ALL USING (EXISTS (SELECT 1 FROM examinations e WHERE e.id = treatment_items.examination_id AND e.user_id = auth.uid()));

-- Company app config policies
CREATE POLICY "Admins can manage app config" ON public.company_app_config FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their company config" ON public.company_app_config FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE user_id = auth.uid()));

-- Files policies
CREATE POLICY "Admins can view all files" ON public.files FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert files" ON public.files FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete files" ON public.files FOR DELETE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own files" ON public.files FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view files in accessible folders" ON public.files FOR SELECT USING (can_access_path(auth.uid(), file_url));

-- File hashes policies
CREATE POLICY "Admins can manage file hashes" ON public.file_hashes FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their company's file hashes" ON public.file_hashes FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE user_id = auth.uid()));

-- Folder structure policies
CREATE POLICY "Admins can view all folders" ON public.folder_structure FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert folders" ON public.folder_structure FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update folders" ON public.folder_structure FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete folders" ON public.folder_structure FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Folder access policies
CREATE POLICY "Admins can view all folder access" ON public.folder_access FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert folder access" ON public.folder_access FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete folder access" ON public.folder_access FOR DELETE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own folder access" ON public.folder_access FOR SELECT USING (auth.uid() = user_id);

-- Flexi auth policies
CREATE POLICY "Admins can manage all flexi auth" ON public.flexi_auth FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own flexi auth" ON public.flexi_auth FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own flexi auth" ON public.flexi_auth FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own flexi auth" ON public.flexi_auth FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own flexi auth" ON public.flexi_auth FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- Step 7: Create Storage Bucket
-- =====================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('client-files', 'client-files', false);

-- Storage policies
CREATE POLICY "Admins can manage all storage" ON storage.objects FOR ALL USING (
  bucket_id = 'client-files' AND has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can access their files" ON storage.objects FOR SELECT USING (
  bucket_id = 'client-files' AND can_access_path(auth.uid(), name)
);