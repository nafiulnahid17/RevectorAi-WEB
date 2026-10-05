-- Harden admin-managed ReVector payment settings at the database layer.
-- This mirrors the live Supabase migration applied on 2026-10-05.

alter table public.revector_payment_settings
  add constraint revector_payment_settings_bkash_shape_chk
  check (
    jsonb_typeof(bkash) = 'object'
    and jsonb_typeof(bkash->'enabled') = 'boolean'
    and jsonb_typeof(bkash->'instructions') = 'array'
    and length(coalesce(bkash->>'number','')) <= 40
    and jsonb_array_length(bkash->'instructions') <= 8
    and (
      coalesce((bkash->>'enabled')::boolean, false) = false
      or length(trim(coalesce(bkash->>'number',''))) > 0
    )
  ),
  add constraint revector_payment_settings_nagad_shape_chk
  check (
    jsonb_typeof(nagad) = 'object'
    and jsonb_typeof(nagad->'enabled') = 'boolean'
    and jsonb_typeof(nagad->'instructions') = 'array'
    and length(coalesce(nagad->>'number','')) <= 40
    and jsonb_array_length(nagad->'instructions') <= 8
    and (
      coalesce((nagad->>'enabled')::boolean, false) = false
      or length(trim(coalesce(nagad->>'number',''))) > 0
    )
  );
