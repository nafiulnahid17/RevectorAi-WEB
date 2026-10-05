begin;

-- Allow normal USER accounts to be removed cleanly from Supabase Auth.
-- Privileged ReVector accounts remain protected by a database trigger.

create or replace function revector_private.prevent_privileged_profile_delete()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if old.role in ('ADMIN','SUPPORT') then
    raise exception 'PRIVILEGED_ACCOUNT_DELETE_BLOCKED'
      using errcode='PT403';
  end if;
  return old;
end
$$;

drop trigger if exists rv_profiles_protect_privileged_delete
  on public.revector_profiles;

create trigger rv_profiles_protect_privileged_delete
before delete on public.revector_profiles
for each row execute function revector_private.prevent_privileged_profile_delete();

-- Auth user -> ReVector profile.
alter table public.revector_profiles
  drop constraint if exists revector_profiles_id_fkey,
  add constraint revector_profiles_id_fkey
    foreign key (id) references auth.users(id) on delete cascade;

alter table public.revector_profiles
  drop constraint if exists revector_profiles_auth_user_id_fkey,
  add constraint revector_profiles_auth_user_id_fkey
    foreign key (auth_user_id) references auth.users(id) on delete cascade;

-- User-owned records are removed with the ReVector profile.
alter table public.revector_wallets
  drop constraint if exists revector_wallets_user_id_fkey,
  add constraint revector_wallets_user_id_fkey
    foreign key (user_id) references public.revector_profiles(id) on delete cascade;

alter table public.revector_wallet_transactions
  drop constraint if exists revector_wallet_transactions_user_id_fkey,
  add constraint revector_wallet_transactions_user_id_fkey
    foreign key (user_id) references public.revector_profiles(id) on delete cascade;

alter table public.revector_usage_events
  drop constraint if exists revector_usage_events_user_id_fkey,
  add constraint revector_usage_events_user_id_fkey
    foreign key (user_id) references public.revector_profiles(id) on delete cascade;

alter table public.revector_user_model_preferences
  drop constraint if exists revector_user_model_preferences_user_id_fkey,
  add constraint revector_user_model_preferences_user_id_fkey
    foreign key (user_id) references public.revector_profiles(id) on delete cascade;

alter table public.revector_requests
  drop constraint if exists revector_requests_user_id_fkey,
  add constraint revector_requests_user_id_fkey
    foreign key (user_id) references public.revector_profiles(id) on delete cascade;

-- Child/support history belonging to a deleted request follows the request.
alter table public.revector_support_messages
  drop constraint if exists revector_support_messages_request_id_fkey,
  add constraint revector_support_messages_request_id_fkey
    foreign key (request_id) references public.revector_requests(id) on delete cascade;

alter table public.revector_support_messages
  drop constraint if exists revector_support_messages_author_id_fkey,
  add constraint revector_support_messages_author_id_fkey
    foreign key (author_id) references public.revector_profiles(id) on delete cascade;

-- Historical actor references survive as NULL when a non-privileged account is removed.
alter table public.revector_requests
  drop constraint if exists revector_requests_decided_by_fkey,
  add constraint revector_requests_decided_by_fkey
    foreign key (decided_by) references public.revector_profiles(id) on delete set null;

alter table public.revector_wallet_transactions
  drop constraint if exists revector_wallet_transactions_created_by_fkey,
  add constraint revector_wallet_transactions_created_by_fkey
    foreign key (created_by) references public.revector_profiles(id) on delete set null;

-- A deleted reservation must never block cleanup of usage rows.
alter table public.revector_usage_events
  drop constraint if exists revector_usage_events_reservation_id_fkey,
  add constraint revector_usage_events_reservation_id_fkey
    foreign key (reservation_id) references public.revector_usage_events(id) on delete set null;

-- Keep the private helper private.
revoke all on function revector_private.prevent_privileged_profile_delete()
  from public, anon, authenticated;
grant execute on function revector_private.prevent_privileged_profile_delete()
  to service_role;

commit;
