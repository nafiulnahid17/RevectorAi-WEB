-- Automatically provision every invited Supabase Auth user as an isolated ReVector USER.
-- New users start incomplete, receive their own wallet, and must finish onboarding.

create or replace function revector_private.provision_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, revector_private, pg_temp
as $$
begin
  insert into public.revector_profiles (
    id, auth_user_id, name, email, company, role, status
  )
  values (
    new.id,
    new.id,
    '',
    lower(coalesce(new.email, '')),
    '',
    'USER',
    'ACTIVE'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists rv_auth_user_profile on auth.users;
create trigger rv_auth_user_profile
after insert on auth.users
for each row
execute function revector_private.provision_auth_user();

insert into public.revector_profiles (
  id, auth_user_id, name, email, company, role, status
)
select
  u.id,
  u.id,
  '',
  lower(coalesce(u.email, '')),
  '',
  'USER',
  'ACTIVE'
from auth.users u
left join public.revector_profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
