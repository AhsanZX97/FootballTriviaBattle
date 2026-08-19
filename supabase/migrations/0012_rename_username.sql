-- Lets a signed-in player change their own username. Run once via the
-- Supabase SQL editor (or `supabase db push`). Builds on 0001_accounts.
--
-- Clients still have no update policy on `profiles` (see 0001), so the rename
-- has to go through a security-definer RPC like every other profile write.
-- The function only ever touches auth.uid()'s own row — the caller cannot
-- name a target — and re-applies the same format rules the column's CHECK
-- constraint and the signup path enforce, so a hand-crafted RPC call can't
-- slip through a shape the signup form would have rejected.
--
-- Returns jsonb rather than raising, so the client can translate the reason
-- instead of surfacing Postgres prose:
--   {"ok": true,  "username": "<new name>"}
--   {"ok": false, "error": "format" | "taken" | "unauthorised"}
create function rename_username(p_username citext) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_current citext;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorised');
  end if;

  if char_length(p_username) not between 3 and 16
     or p_username !~ '^[A-Za-z0-9_]+$' then
    return jsonb_build_object('ok', false, 'error', 'format');
  end if;

  select username into v_current from profiles where id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unauthorised');
  end if;

  -- Case-only edits (ahsan -> Ahsan) are a real rename to the player but
  -- compare equal under citext, so the taken check below would reject them
  -- against the caller's own row. Take them straight to the update.
  if v_current <> p_username and exists (select 1 from profiles where username = p_username) then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;

  update profiles set username = p_username where id = auth.uid();
  return jsonb_build_object('ok', true, 'username', p_username::text);
-- Two callers can pass the exists() check at the same instant; the unique
-- index is the real arbiter, so the loser gets the same answer either way.
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

-- Signed-in players only: anon inherits EXECUTE from the default PUBLIC grant
-- otherwise, and while auth.uid() would be null there anyway, revoking keeps
-- the surface honest.
revoke execute on function rename_username(citext) from public, anon;
grant execute on function rename_username(citext) to authenticated;
