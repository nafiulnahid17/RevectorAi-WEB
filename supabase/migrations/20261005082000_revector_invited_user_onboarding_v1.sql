begin;

alter table public.revector_profiles
  add column if not exists avatar_path text,
  add column if not exists password_updated_at timestamptz,
  add column if not exists profile_completed_at timestamptz;

-- Admin/support accounts do not use the invited-user onboarding gate.
update public.revector_profiles
set
  password_updated_at = coalesce(password_updated_at, created_at, now()),
  profile_completed_at = coalesce(profile_completed_at, created_at, now())
where role in ('ADMIN','SUPPORT');

-- Private avatar storage. Files are only read/written by the server-side Worker.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'revector-avatars',
  'revector-avatars',
  false,
  3145728,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
