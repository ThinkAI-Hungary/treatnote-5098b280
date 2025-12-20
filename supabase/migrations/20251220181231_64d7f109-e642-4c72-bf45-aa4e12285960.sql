-- Drop existing foreign key constraints and recreate with proper cascade behavior

-- profiles.company_id -> companies.id (SET NULL on delete - don't lose user, just clear company)
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_company_id_fkey;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_company_id_fkey 
FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- profiles.telephely_id -> telephely.id (SET NULL on delete)
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_telephely_id_fkey;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_telephely_id_fkey 
FOREIGN KEY (telephely_id) REFERENCES public.telephely(id) ON DELETE SET NULL;

-- telephely.company_id -> companies.id (CASCADE on delete - delete telephelyek when company deleted)
ALTER TABLE public.telephely 
DROP CONSTRAINT IF EXISTS telephely_company_id_fkey;

ALTER TABLE public.telephely
ADD CONSTRAINT telephely_company_id_fkey 
FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- invitations.company_id -> companies.id (CASCADE on delete)
ALTER TABLE public.invitations 
DROP CONSTRAINT IF EXISTS invitations_company_id_fkey;

ALTER TABLE public.invitations
ADD CONSTRAINT invitations_company_id_fkey 
FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- invitations.telephely_id -> telephely.id (CASCADE on delete)
ALTER TABLE public.invitations 
DROP CONSTRAINT IF EXISTS invitations_telephely_id_fkey;

ALTER TABLE public.invitations
ADD CONSTRAINT invitations_telephely_id_fkey 
FOREIGN KEY (telephely_id) REFERENCES public.telephely(id) ON DELETE CASCADE;

-- feltoltott_pdf.company_id -> companies.id (CASCADE on delete)
ALTER TABLE public.feltoltott_pdf 
DROP CONSTRAINT IF EXISTS feltoltott_pdf_company_id_fkey;

ALTER TABLE public.feltoltott_pdf
ADD CONSTRAINT feltoltott_pdf_company_id_fkey 
FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- feltoltott_pdf.telephely_id -> telephely.id (CASCADE on delete)
ALTER TABLE public.feltoltott_pdf 
DROP CONSTRAINT IF EXISTS feltoltott_pdf_telephely_id_fkey;

ALTER TABLE public.feltoltott_pdf
ADD CONSTRAINT feltoltott_pdf_telephely_id_fkey 
FOREIGN KEY (telephely_id) REFERENCES public.telephely(id) ON DELETE CASCADE;

-- company_app_config.company_id -> companies.id (CASCADE on delete)
ALTER TABLE public.company_app_config 
DROP CONSTRAINT IF EXISTS company_app_config_company_id_fkey;

ALTER TABLE public.company_app_config
ADD CONSTRAINT company_app_config_company_id_fkey 
FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- appointments.company_id -> companies.id (SET NULL on delete)
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS appointments_company_id_fkey;

ALTER TABLE public.appointments
ADD CONSTRAINT appointments_company_id_fkey 
FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- patients.company_id -> companies.id (SET NULL on delete)
ALTER TABLE public.patients 
DROP CONSTRAINT IF EXISTS patients_company_id_fkey;

ALTER TABLE public.patients
ADD CONSTRAINT patients_company_id_fkey 
FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- examinations.company_id -> companies.id (SET NULL on delete)
ALTER TABLE public.examinations 
DROP CONSTRAINT IF EXISTS examinations_company_id_fkey;

ALTER TABLE public.examinations
ADD CONSTRAINT examinations_company_id_fkey 
FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- file_hashes.company_id -> companies.id (CASCADE on delete)
ALTER TABLE public.file_hashes 
DROP CONSTRAINT IF EXISTS file_hashes_company_id_fkey;

ALTER TABLE public.file_hashes
ADD CONSTRAINT file_hashes_company_id_fkey 
FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- folder_structure.company_id -> companies.id (SET NULL on delete)
ALTER TABLE public.folder_structure 
DROP CONSTRAINT IF EXISTS folder_structure_company_id_fkey;

ALTER TABLE public.folder_structure
ADD CONSTRAINT folder_structure_company_id_fkey 
FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;