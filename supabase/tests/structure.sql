-- Run as database owner AFTER migrations in a dedicated staging project.
-- No users or teaching observations are created. NOT executed at handoff.
begin;
do $$
declare t record; f record;
begin
 if penalty_private.cfg()->'matrix_units' <> '{"UU":5911,"UN":9410,"NU":9310,"NN":7122}'::jsonb then raise exception 'Wrong technology';end if;
 for t in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='penalty_private' and c.relkind='r' loop
  if not t.relrowsecurity then raise exception 'RLS disabled: %',t.relname;end if;
  if has_table_privilege('authenticated',t.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon',t.oid,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'Private table privilege: %',t.relname;end if;
 end loop;
 if has_schema_privilege('authenticated','penalty_private','USAGE') then raise exception 'Private schema exposed';end if;
 for f in select p.oid,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='penalty_private' or (n.nspname='public' and p.proname in ('join_room','prepare_match','submit_choice','room_snapshot','room_statistics','host_create_room','host_room_action','host_export','host_delete_room','ready_player','feedback_seen','player_heartbeat','is_room_member','host_preflight'))) loop
  if f.prosecdef and not exists(select 1 from unnest(f.proconfig) x where x='search_path=""' or x='search_path=') then raise exception 'Unfixed search path: %',f.proname;end if;
  if has_function_privilege('anon',f.oid,'EXECUTE') then raise exception 'Unauthenticated RPC access: %',f.proname;end if;
 end loop;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_events') then raise exception 'Safe notification publication missing';end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='player_events') then raise exception 'Player notification publication missing';end if;
 if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='penalty_private') then raise exception 'Private data is published';end if;
 if not exists(select 1 from cron.job where jobname='penalty-room-clock' and active and schedule='1 second') then raise exception 'Independent one-second room clock missing';end if;
 raise notice 'Structural assertions passed. Real JWT/concurrency/timeout tests still required.';
end $$;
rollback;
