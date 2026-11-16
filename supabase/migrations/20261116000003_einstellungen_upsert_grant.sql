-- Upsert (INSERT ... ON CONFLICT DO UPDATE) setzt auch user_id; RLS stellt sicher, dass es die eigene ID bleibt.
grant update (user_id) on public.einstellungen to authenticated;
