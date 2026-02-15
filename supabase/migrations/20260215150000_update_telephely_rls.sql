-- Allow users to view telephelys they are members of
-- This is necessary for Context Switcher to show telephely names even if they belong to a different company than the current profile's company_id.

create policy "Users can view telephelys they are members of"
  on public.telephely
  for select
  using (
    exists (
      select 1 from public.telephely_memberships tm
      where tm.telephely_id = telephely.id
      and tm.user_id = auth.uid()
    )
  );
