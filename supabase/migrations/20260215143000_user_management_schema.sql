-- Create telephely_memberships table
-- First, ensure app_role type has necessary values
-- We cannot easily check enum values in migration without failing if exists, 
-- but we can try to add 'klinika_admin' if it's missing.
-- However, standard practice is to alter type or creating if not exists.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('admin', 'klinika_admin', 'user');
  else
    -- If exists, we might need to add values. 
    -- Postgrest/Supabase doesn't support 'add value if not exists' easily in a single block
    -- without catching exceptions.
    -- For now assume app_role exists and might need update.
    -- We'll just try to use it.
    -- But safe approach:
    alter type app_role add value if not exists 'klinika_admin';
    alter type app_role add value if not exists 'user';
  end if;
end$$;

create table if not exists public.telephely_memberships (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  telephely_id uuid not null references public.telephely(id) on delete cascade,
  role app_role not null default 'user',
  created_at timestamptz not null default now(),
  constraint telephely_memberships_pkey primary key (id),
  constraint telephely_memberships_user_id_telephely_id_key unique (user_id, telephely_id)
);

-- Note: We are ignoring company_id in memberships for now as it's implicit via telephely -> company.
-- But the plan diagram showed company_id. If we want faster lookups we can add it, but normalization suggests keeping it on telephely.
-- Queries can join.

-- Enable RLS
alter table public.telephely_memberships enable row level security;

-- Add current_telephely_id to profiles
alter table public.profiles add column if not exists current_telephely_id uuid references public.telephely(id);

-- Update invitations table
alter table public.invitations add column if not exists role app_role not null default 'user';
alter table public.invitations add column if not exists expires_at timestamptz not null default (now() + interval '24 hours');
alter table public.invitations add column if not exists used_at timestamptz;

-- RLS Policies for telephely_memberships

-- 1. Users can view their own memberships
drop policy if exists "Users can view their own memberships" on public.telephely_memberships;
create policy "Users can view their own memberships"
  on public.telephely_memberships
  for select
  using (auth.uid() = user_id);

-- 2. Klinika Admins can view memberships for their telephely
drop policy if exists "Klinika Admins can view memberships for their telephely" on public.telephely_memberships;
create policy "Klinika Admins can view memberships for their telephely"
  on public.telephely_memberships
  for select
  using (
    exists (
      select 1 from public.telephely_memberships as admin_membership
      where admin_membership.user_id = auth.uid()
      and admin_membership.telephely_id = telephely_memberships.telephely_id
      and admin_membership.role = 'klinika_admin'
    )
  );
  
-- 3. Klinika Admins can insert/update/delete memberships for their telephely (Invite flow)
-- Actually, invite flow creates memberships via Trigger (System level).
-- But managing existing users? removing them?
drop policy if exists "Klinika Admins can manage memberships" on public.telephely_memberships;
create policy "Klinika Admins can manage memberships"
  on public.telephely_memberships
  for all
  using (
    exists (
      select 1 from public.telephely_memberships as admin_membership
      where admin_membership.user_id = auth.uid()
      and admin_membership.telephely_id = telephely_memberships.telephely_id
      and admin_membership.role = 'klinika_admin'
    )
  );

-- Function to handle new user connection
create or replace function public.handle_invite_acceptance()
returns trigger as $$
declare
  invite_record record;
begin
  -- Check for invitation matching email
  select * into invite_record
  from public.invitations
  where invited_email = new.email
  and status = 'pending'
  and expires_at > now()
  limit 1;

  if invite_record is not null then
      -- Valid invite found.
      
      -- 1. Create Profile if not exists (it should be created by handle_new_user usually, 
      -- but we might replace existing profile creation logic or augment it)
      -- Assuming there is an existing trigger for profiles, we should ensure we don't conflict.
      -- If there is NO existing trigger for profiles, we create one. 
      -- If there IS, we let it run, but we also add membership.
      
      -- Let's check duplicate key violation just in case.
      insert into public.profiles (user_id, full_name, email, role)
      values (new.id, new.raw_user_meta_data->>'full_name', new.email, 'user')
      on conflict (user_id) do nothing; -- Update?

      -- 2. Create Membership
      insert into public.telephely_memberships (user_id, telephely_id, role)
      values (new.id, invite_record.telephely_id, invite_record.role)
      on conflict (user_id, telephely_id) do nothing;

      -- 3. Mark invite used
      update public.invitations
      set status = 'accepted',
          invited_user_id = new.id,
          responded_at = now(),
          used_at = now()
      where id = invite_record.id;
      
      -- 4. Set current telephely
      update public.profiles
      set current_telephely_id = invite_record.telephely_id
      where user_id = new.id;
      
  else
      -- No invite found.
      -- Check if "admin_created" flag is present (for backend-created users)
      if (new.raw_user_meta_data->>'admin_created')::boolean is not true then
          -- If not admin created and no invite -> BLOCK.
          raise exception 'Registration is invite-only.';
      end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Attach trigger
-- We need to check if there are other triggers on auth.users that might conflict.
-- Usually Supabase has a `on_auth_user_created` trigger for basic profile.
-- We might want to REPLACE it or run AFTER it.
-- For now, we'll create a new one `enforce_invite_on_signup`.
drop trigger if exists enforce_invite_on_signup on auth.users;
create trigger enforce_invite_on_signup
  after insert on auth.users
  for each row execute procedure public.handle_invite_acceptance();
