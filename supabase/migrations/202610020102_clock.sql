-- Requires Supabase Cron / pg_cron with sub-minute schedules (see docs/deployment.md).
-- Independent server ticks are essential: waiting and timed-out users may send no RPCs.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create function penalty_private.sweep() returns void language plpgsql volatile security definer set search_path='' as $$
declare r record;begin
 for r in select id from penalty_private.rooms where phase<>'ended' loop
  -- Avoid one busy room delaying another. The next one-second tick retries it.
  if pg_try_advisory_xact_lock(hashtextextended(r.id::text,487)) then perform penalty_private.tick_room(r.id);end if;
 end loop;
end $$;
revoke execute on function penalty_private.sweep() from public,anon,authenticated;
select cron.schedule('penalty-room-clock','1 second','select penalty_private.sweep();');
commit;
