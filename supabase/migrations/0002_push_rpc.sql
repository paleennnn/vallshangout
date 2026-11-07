-- Daftarkan / pindahkan langganan Web Push ke user yang sedang login.
-- Perlu RPC (bukan upsert langsung) karena satu perangkat bisa berganti akun anonim:
-- baris lama milik akun lama tidak bisa di-update lewat RLS, tapi endpoint-nya harus pindah.
create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_endpoint !~* '^https://' or char_length(p_endpoint) > 2000 then
    raise exception 'endpoint tidak valid';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent;
end $$;

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
