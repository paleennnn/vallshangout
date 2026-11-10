-- Tempat terpilih di room, tanpa bergantung pada tabel `places` di database.
-- Tempat langganan masih disimpan lokal di perangkat tiap orang, jadi hasil undian menyimpan
-- NAMA dan angka service/pajaknya langsung di hangout (place_label, place_meta). Bila hasil undian
-- menunjuk baris `places` yang benar-benar ada, place_id tetap diisi seperti sebelumnya.

alter table public.hangouts
  add column if not exists place_label text
    check (place_label is null or char_length(place_label) between 1 and 80),
  add column if not exists place_meta jsonb
    check (place_meta is null or jsonb_typeof(place_meta) = 'object');

-- Perubahan hangout (mis. tempat terpilih) ikut dikirim lewat Realtime.
do $$
begin
  alter publication supabase_realtime add table public.hangouts;
exception when duplicate_object then null;
end $$;

-- Terima hasil spin (host). Untuk kind = 'place':
--   place_label = nama pemenang
--   place_meta  = {service_pct, tax_pct, tax_on_service} bila dikirim di winner.meta (nilai dibatasi 0..100)
--   place_id    = winner.ref_id HANYA bila id itu ada di tabel places
create or replace function public.accept_spin(p_spin uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  s      public.spins;
  v_ref  uuid;
  v_meta jsonb;
begin
  select * into s from public.spins where id = p_spin;
  if not found or not private.is_hangout_host(s.hangout_id) then
    raise exception 'hanya host yang boleh menerima hasil spin' using errcode = '42501';
  end if;
  if s.status <> 'active' then raise exception 'spin tidak aktif'; end if;

  update public.spins set status = 'accepted' where id = p_spin;

  if s.kind = 'place' then
    begin
      v_ref := nullif(s.winner ->> 'ref_id', '')::uuid;
    exception when invalid_text_representation then
      v_ref := null;
    end;
    if v_ref is not null and not exists (select 1 from public.places where id = v_ref) then
      v_ref := null;
    end if;

    begin
      if jsonb_typeof(s.winner -> 'meta') = 'object' then
        v_meta := jsonb_build_object(
          'service_pct', least(greatest(coalesce((s.winner -> 'meta' ->> 'service_pct')::numeric, 0), 0), 100),
          'tax_pct', least(greatest(coalesce((s.winner -> 'meta' ->> 'tax_pct')::numeric, 0), 0), 100),
          'tax_on_service', coalesce((s.winner -> 'meta' ->> 'tax_on_service')::boolean, true));
      end if;
    exception when others then
      v_meta := null;   -- meta rusak diabaikan; nama tempat tetap tersimpan
    end;

    update public.hangouts
       set place_id    = v_ref,
           place_label = left(s.winner ->> 'label', 80),
           place_meta  = v_meta
     where id = s.hangout_id;
  end if;
end $$;
