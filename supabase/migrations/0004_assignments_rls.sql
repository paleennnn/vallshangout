-- Tanda "siapa makan apa" (bill_item_assignments) hanya boleh diubah oleh:
--   * pemilik peserta itu sendiri (peserta dengan akun),
--   * anggota hangout mana pun untuk teman TANPA akun (user_id null), atau
--   * host hangout, untuk siapa pun.
-- Sebelumnya semua anggota hangout bisa menulis tanda atas nama siapa pun; aturan "tiap orang
-- menandai pesanannya sendiri" hanya dijaga di UI. Selain itu tanda tetap hanya bisa diubah
-- selagi bill berstatus draft (private.item_is_draft), dan hanya oleh anggota hangout.
--
-- USING dan WITH CHECK sama-sama memeriksa participant_id, sehingga tanda juga tidak bisa
-- dipindahkan ke peserta lain lewat UPDATE.

drop policy if exists bill_assignments_write on public.bill_item_assignments;

create policy bill_assignments_write on public.bill_item_assignments for all to authenticated
  using (private.is_hangout_member(hangout_id)
         and private.item_is_draft(item_id)
         and (private.can_act_as(participant_id) or private.is_hangout_host(hangout_id)))
  with check (private.is_hangout_member(hangout_id)
              and private.item_is_draft(item_id)
              and (private.can_act_as(participant_id) or private.is_hangout_host(hangout_id)));
