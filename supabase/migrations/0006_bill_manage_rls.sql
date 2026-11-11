-- Siapa boleh mengelola sebuah bill (mengubah angka struk, mengubah atau menghapus menu,
-- memfinalkan, membuka kembali, menghapus draft)?
--   * host hangout, atau
--   * yang membayar ke kasir (bills.paid_by): akunnya sendiri, atau siapa pun anggota hangout
--     bila pembayarnya teman tanpa akun (sama seperti aturan menandai di migrasi 0004).
--
-- Sebelumnya semua anggota hangout boleh melakukan semua itu. Yang paling berbahaya:
--   * finalize_bill hanya memvalidasi JUMLAH pembagian, bukan asalnya, jadi siapa pun bisa
--     memfinalkan dengan pembagian sembarang;
--   * DELETE pada bill final lolos karena bills_guard hanya menjaga UPDATE, dan menghapus
--     bill final menggeser saldo hangout tanpa jejak.
-- Yang tetap terbuka untuk semua anggota: membuat bill dan menambah menu (selagi draft),
-- serta menandai pesanan sendiri.

create or replace function private.can_manage_row(p_hangout uuid, p_payer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_hangout_host(p_hangout) or private.can_act_as(p_payer);
$$;

create or replace function private.can_manage_bill(p_bill uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bills b
    where b.id = p_bill and private.can_manage_row(b.hangout_id, b.paid_by));
$$;

-- ---------- bills ----------
drop policy if exists bills_all on public.bills;

create policy bills_select on public.bills for select to authenticated
  using (private.is_hangout_member(hangout_id));

-- Bill baru selalu draft (final hanya lewat finalize_bill).
create policy bills_insert on public.bills for insert to authenticated
  with check (private.is_hangout_member(hangout_id) and status = 'draft');

-- WITH CHECK ikut memeriksa baris baru: pengelola yang bukan host tidak bisa mengalihkan
-- pembayar ke orang lain (hanya host yang bisa).
create policy bills_update on public.bills for update to authenticated
  using (private.is_hangout_member(hangout_id) and private.can_manage_row(hangout_id, paid_by))
  with check (private.is_hangout_member(hangout_id) and private.can_manage_row(hangout_id, paid_by));

-- Bill final tidak boleh dihapus; buka kembali dulu (draft), baru hapus.
create policy bills_delete on public.bills for delete to authenticated
  using (private.can_manage_row(hangout_id, paid_by) and status = 'draft');

-- ---------- bill_items ----------
drop policy if exists bill_items_write on public.bill_items;

create policy bill_items_insert on public.bill_items for insert to authenticated
  with check (private.is_hangout_member(hangout_id) and private.bill_is_draft(bill_id));

create policy bill_items_update on public.bill_items for update to authenticated
  using (private.is_hangout_member(hangout_id) and private.bill_is_draft(bill_id) and private.can_manage_bill(bill_id))
  with check (private.is_hangout_member(hangout_id) and private.bill_is_draft(bill_id) and private.can_manage_bill(bill_id));

create policy bill_items_delete on public.bill_items for delete to authenticated
  using (private.is_hangout_member(hangout_id) and private.bill_is_draft(bill_id) and private.can_manage_bill(bill_id));

-- ---------- finalize_bill: hanya pengelola bill ----------
-- (isi sama dengan 0001, hanya ditambah pemeriksaan can_manage_row; hak EXECUTE tidak berubah)
create or replace function public.finalize_bill(p_bill uuid, p_shares jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  b          public.bills;
  v_subtotal bigint;
  v_grand    bigint;
  v_sum_tot  bigint;
  v_sum_sub  bigint;
begin
  select * into b from public.bills where id = p_bill for update;
  if not found or not private.is_hangout_member(b.hangout_id) then
    raise exception 'bill tidak ditemukan' using errcode = '42501';
  end if;
  if not private.can_manage_row(b.hangout_id, b.paid_by) then
    raise exception 'hanya host atau yang membayar ke kasir yang boleh memfinalkan bill' using errcode = '42501';
  end if;
  if b.status <> 'draft' then raise exception 'bill sudah final'; end if;

  select coalesce(sum(unit_price * qty), 0) into v_subtotal from public.bill_items where bill_id = p_bill;
  v_grand := v_subtotal + b.service_amount + b.tax_amount - b.discount_amount + b.rounding_amount;

  delete from public.bill_shares where bill_id = p_bill;

  -- FK komposit menolak peserta dari hangout lain; CHECK tabel menjaga total per baris.
  insert into public.bill_shares
    (bill_id, hangout_id, participant_id, subtotal, service_amount, tax_amount,
     discount_amount, rounding_amount, total)
  select p_bill, b.hangout_id, s.participant_id,
         coalesce(s.subtotal, 0), coalesce(s.service_amount, 0), coalesce(s.tax_amount, 0),
         coalesce(s.discount_amount, 0), coalesce(s.rounding_amount, 0), s.total
  from jsonb_to_recordset(p_shares) as s(
    participant_id uuid, subtotal bigint, service_amount bigint, tax_amount bigint,
    discount_amount bigint, rounding_amount bigint, total bigint);

  select coalesce(sum(total), 0), coalesce(sum(subtotal), 0)
    into v_sum_tot, v_sum_sub
    from public.bill_shares where bill_id = p_bill;

  if v_sum_tot <> v_grand then
    raise exception 'jumlah pembagian (%) tidak sama dengan total bill (%)', v_sum_tot, v_grand;
  end if;
  if v_sum_sub <> v_subtotal then
    raise exception 'jumlah subtotal pembagian (%) tidak sama dengan subtotal item (%)', v_sum_sub, v_subtotal;
  end if;

  update public.bills set status = 'final' where id = p_bill;
end $$;

