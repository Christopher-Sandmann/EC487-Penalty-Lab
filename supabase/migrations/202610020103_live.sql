-- Penalty Lab v3: additive upgrade from the supplied v2 schema.
-- Does not delete or reset rooms, choices, results, players or the matrix.
-- Run after 202610020101_game.sql and 202610020102_clock.sql.
begin;
create table if not exists penalty_private.runtime (
 singleton boolean primary key default true check(singleton),
 api_version integer not null default 3, clock_seen_at timestamptz
);
alter table penalty_private.runtime enable row level security;
revoke all on penalty_private.runtime from public,anon,authenticated;
insert into penalty_private.runtime(singleton,api_version) values(true,3)
 on conflict(singleton) do update set api_version=excluded.api_version;

-- Targeted wake-up signals, NEVER the direction or the result. A match update
-- goes only to its two participants, instead of fanning out across the whole class.
create table if not exists public.player_events(
 participant_id uuid primary key references penalty_private.participants(id) on delete cascade,
 uid uuid not null references auth.users(id),
 room_id uuid not null references penalty_private.rooms(id) on delete cascade,
 version bigint not null default 1, changed_at timestamptz not null default clock_timestamp()
);
alter table public.player_events enable row level security;
revoke all on public.player_events from public,anon,authenticated;
grant select on public.player_events to authenticated;
drop policy if exists own_player_notifications on public.player_events;
create policy own_player_notifications on public.player_events for select to authenticated using(uid=auth.uid());
create or replace function penalty_private.notify_player(p_id uuid) returns void
 language sql volatile security definer set search_path='' as $$
 insert into public.player_events(participant_id,uid,room_id,version)
 select id,uid,room_id,txid_current() from penalty_private.participants where id=p_id
 on conflict(participant_id) do update set version=excluded.version,changed_at=clock_timestamp()
 where player_events.version is distinct from excluded.version
$$;
create or replace function penalty_private.participant_signal() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then perform penalty_private.notify_player(new.id);
 elsif row(old.status,old.active_match,old.pending_result,old.kicks,old.keeps,old.feedback_since)
 is distinct from row(new.status,new.active_match,new.pending_result,new.kicks,new.keeps,new.feedback_since)
 then perform penalty_private.notify_player(new.id);end if;
 return new;
end $$;
drop trigger if exists participant_signal on penalty_private.participants;
create trigger participant_signal after insert or update on penalty_private.participants
 for each row execute function penalty_private.participant_signal();
create or replace function penalty_private.match_signal() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then return new;
 elsif row(old.status,old.kicker_prepared,old.keeper_prepared)
 is distinct from row(new.status,new.kicker_prepared,new.keeper_prepared) then
  perform penalty_private.notify_player(new.kicker);perform penalty_private.notify_player(new.keeper);
 end if;return new;
end $$;
drop trigger if exists match_signal on penalty_private.matches;
create trigger match_signal after insert or update on penalty_private.matches
 for each row execute function penalty_private.match_signal();
create or replace function penalty_private.submission_signal() returns trigger
 language plpgsql security definer set search_path='' as $$
declare m penalty_private.matches;begin
 select * into m from penalty_private.matches where id=new.match_id;
 perform penalty_private.notify_player(m.kicker);perform penalty_private.notify_player(m.keeper);
 return new;
end $$;
drop trigger if exists submission_signal on penalty_private.submissions;
create trigger submission_signal after insert on penalty_private.submissions
 for each row execute function penalty_private.submission_signal();
create or replace function penalty_private.room_signal() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if row(old.phase,old.entry_open,old.show_benchmarks) is distinct from row(new.phase,new.entry_open,new.show_benchmarks) then
  insert into public.room_events(room_id,version) values(new.id,new.version)
  on conflict(room_id) do update set version=room_events.version+1,changed_at=clock_timestamp();
 end if;return new;
end $$;
drop trigger if exists room_signal on penalty_private.rooms;
create trigger room_signal after update on penalty_private.rooms
 for each row execute function penalty_private.room_signal();
-- Statistics keep a monotone version; only instructor room changes are broadcast.
create or replace function penalty_private.bump(p_room uuid) returns void
 language sql volatile security definer set search_path='' as $$
 update penalty_private.rooms set version=version+1 where id=p_room
$$;
insert into public.player_events(participant_id,uid,room_id)
 select id,uid,room_id from penalty_private.participants on conflict(participant_id) do nothing;

-- Remove an inherited PL/pgSQL record / relation-alias naming collision.
create or replace function penalty_private.tick_room(p_room uuid) returns void language plpgsql volatile security definer set search_path='' as $$
declare r penalty_private.rooms;match_row penalty_private.matches;participant_row penalty_private.participants;pair record;k penalty_private.participants;g penalty_private.participants;a penalty_private.participants;b penalty_private.participants;mid uuid;t timestamptz;serial_no bigint;both_roles boolean;remaining bigint;critical uuid[];c jsonb:=penalty_private.cfg();begin
 select * into r from penalty_private.rooms where id=p_room;
 for match_row in select * from penalty_private.matches where room_id=p_room and status in('briefing','locked') and deadline<=clock_timestamp() loop perform penalty_private.cancel_match(match_row.id,case when match_row.status='briefing' then 'briefing-timeout' else 'decision-timeout' end);end loop;
 for participant_row in select * from penalty_private.participants where room_id=p_room and status<>'finished' and not disconnect_logged and last_seen<=clock_timestamp()-(c->>'presence_ms')::integer*interval '1 millisecond' loop
  update penalty_private.participants set disconnect_logged=true where id=participant_row.id;
  insert into penalty_private.diagnostics(room_id,participant_id,match_id,kind) values(p_room,participant_row.id,participant_row.active_match,'disconnected');
 end loop;
 if r.phase<>'playing' then return;end if;
 loop
  t:=clock_timestamp();
  -- Preserve residual no-self-match degree feasibility while unfinished players
  -- remain present. Locked appearances are reserved, even before resolution.
  select coalesce(sum(6-p.kicks),0)-(select count(*) from penalty_private.matches m where m.room_id=p_room and m.status in('briefing','locked')) into remaining from penalty_private.participants p where p.room_id=p_room and p.kicks+p.keeps<12;
  critical:=array[]::uuid[];
  if not exists(select 1 from penalty_private.participants p where p.room_id=p_room and p.kicks+p.keeps<12 and p.last_seen<=t-(c->>'presence_ms')::integer*interval '1 millisecond') then
   select coalesce(array_agg(p.id),array[]::uuid[]) into critical from penalty_private.participants p where p.room_id=p_room and p.kicks+p.keeps<12 and 12-p.kicks-p.keeps-(p.active_match is not null)::integer>=remaining;
  end if;
  select x.id a_id,y.id b_id into pair from penalty_private.participants x join penalty_private.participants y on x.room_id=y.room_id and x.id<y.id
  where x.room_id=p_room and x.status='waiting' and y.status='waiting'
    and x.last_seen>t-(c->>'presence_ms')::integer*interval '1 millisecond' and y.last_seen>t-(c->>'presence_ms')::integer*interval '1 millisecond'
    and ((x.kicks<6 and y.keeps<6) or (y.kicks<6 and x.keeps<6))
    and critical <@ array[x.id,y.id]
  order by     exists(select 1 from penalty_private.matches z where z.room_id=p_room and z.status='resolved' and ((z.kicker=x.id and z.keeper=y.id) or (z.kicker=y.id and z.keeper=x.id))),
    ((x.kicks=6 or x.keeps=6)::integer+(y.kicks=6 or y.keeps=6)::integer) desc,
    penalty_private.random_int(2147483647)
  limit 1;
  exit when not found;
  select * into a from penalty_private.participants where id=pair.a_id;select * into b from penalty_private.participants where id=pair.b_id;
  both_roles:=a.kicks<6 and b.keeps<6 and b.kicks<6 and a.keeps<6;
  if a.kicks<6 and b.keeps<6 and (not both_roles or penalty_private.random_int(2)=0) then k:=a;g:=b;else k:=b;g:=a;end if;
  t:=clock_timestamp();update penalty_private.rooms set next_serial=next_serial+1 where id=p_room returning next_serial-1 into serial_no;
  insert into penalty_private.matches(room_id,serial,kicker,keeper,kicker_wait_ms,keeper_wait_ms,locked_at,deadline)
   values(p_room,serial_no,k.id,g.id,greatest(0,penalty_private.ms(t)-penalty_private.ms(k.matchmaking_ready_at)),greatest(0,penalty_private.ms(t)-penalty_private.ms(g.matchmaking_ready_at)),t,t+(c->>'briefing_timeout_ms')::integer*interval '1 millisecond') returning id into mid;
  update penalty_private.participants set status='matched',active_match=mid where id in(k.id,g.id);perform penalty_private.bump(p_room);
 end loop;
end $$;


-- Clock health is measured on the server, not inferred from browser timers.
create or replace function penalty_private.sweep() returns void
 language plpgsql volatile security definer set search_path='' as $$
declare r record;begin
 update penalty_private.runtime set clock_seen_at=clock_timestamp() where singleton;
 for r in select id from penalty_private.rooms where phase<>'ended' loop
  if pg_try_advisory_xact_lock(hashtextextended(r.id::text,487)) then perform penalty_private.tick_room(r.id);end if;
 end loop;
end $$;
create or replace function public.host_preflight(p_code text) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare r penalty_private.rooms;x penalty_private.runtime;begin
 select * into r from penalty_private.rooms where code=upper(p_code);
 if r.id is null then raise exception 'Room not found';end if;
 perform penalty_private.require_host(r.id);
 select * into x from penalty_private.runtime where singleton;
 return jsonb_build_object('apiVersion',x.api_version,'databaseVersion',current_setting('server_version'),
 'clockLastSeen',penalty_private.ms(x.clock_seen_at),
 'clockAgeMs',penalty_private.ms(clock_timestamp())-penalty_private.ms(x.clock_seen_at),
 'clockHealthy',coalesce(x.clock_seen_at>clock_timestamp()-interval '10 seconds',false),
 'room',r.code,'practice',r.practice,'playerCount',(select count(*) from penalty_private.participants where room_id=r.id));
end $$;

create or replace function public.room_snapshot(p_code text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p penalty_private.participants;r penalty_private.rooms;counts jsonb;t timestamptz:=clock_timestamp();begin
 p:=penalty_private.member(p_code);select * into r from penalty_private.rooms where id=p.room_id;
 select jsonb_build_object('waiting',count(*) filter(where status='waiting'),'matched',count(*) filter(where status='matched'),'finished',count(*) filter(where status='finished'),'away',count(*) filter(where status='away'),'feedback',count(*) filter(where status='feedback'),'lobby',count(*) filter(where status='lobby'),'disconnected',count(*) filter(where status<>'finished' and last_seen<=t-interval '25 seconds')) into counts from penalty_private.participants where room_id=r.id;
 return jsonb_build_object('serverNow',penalty_private.ms(t),'room',penalty_private.public_room(r),'me',penalty_private.public_player(p)||jsonb_build_object('uid',p.uid,'roomId',p.room_id,'readyAt',penalty_private.ms(p.matchmaking_ready_at),'lastSeen',penalty_private.ms(p.last_seen),'activeMatch',p.active_match,'pendingResult',p.pending_result,'feedbackSince',penalty_private.ms(p.feedback_since),'registeredAt',penalty_private.ms(p.registered_at)),
 'history',coalesce((select jsonb_agg(penalty_private.match_view(h.id) order by h.serial) from penalty_private.matches h where h.room_id=r.id and h.status='resolved' and p.id in(h.kicker,h.keeper)),'[]'::jsonb),
 'match',penalty_private.match_view(coalesce(p.active_match,p.pending_result),p.id),'waiting',counts->'waiting','counts',counts,'diagnostics',jsonb_build_object('cancelled',(select count(*) from penalty_private.matches where room_id=r.id and status='cancelled'),'unresolved',(select count(*) from penalty_private.matches where room_id=r.id and status in('briefing','locked'))));
end $$;

create or replace function public.host_room_action(p_code text,p_action text,p_value jsonb default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r penalty_private.rooms;m penalty_private.matches;v boolean;begin
 select * into r from penalty_private.rooms where code=upper(p_code);if r.id is null then raise exception 'Room not found';end if;perform penalty_private.require_host(r.id);perform penalty_private.lock_room(r.id);select * into r from penalty_private.rooms where id=r.id;
 if p_action in('start','resume') and not r.practice and not exists(select 1 from penalty_private.runtime where singleton and clock_seen_at>clock_timestamp()-interval '10 seconds') then raise exception 'Server clock is not healthy. Enable the penalty-room-clock Cron job and run Check backend before teaching.';end if;
 if p_action='start' and r.phase='lobby' then update penalty_private.rooms set phase='playing' where id=r.id;update penalty_private.participants set status='waiting',matchmaking_ready_at=clock_timestamp() where room_id=r.id and status='lobby';
 elsif p_action='pause' and r.phase='playing' then update penalty_private.rooms set phase='paused' where id=r.id;
 elsif p_action='resume' and r.phase='paused' then update penalty_private.rooms set phase='playing' where id=r.id;
 elsif p_action in('entry','benchmarks') and r.phase<>'ended' then
  if jsonb_typeof(p_value)<>'boolean' then raise exception 'A boolean value is required';end if;v:=(p_value#>>'{}')::boolean;
  if p_action='entry' then update penalty_private.rooms set entry_open=v where id=r.id;else update penalty_private.rooms set show_benchmarks=v where id=r.id;end if;
 elsif p_action='end' then update penalty_private.rooms set phase='ended',entry_open=false,ended_at=clock_timestamp() where id=r.id;
  for m in select * from penalty_private.matches where room_id=r.id and status in('briefing','locked') loop perform penalty_private.cancel_match(m.id,'session-ended');end loop;
 else raise exception 'That action is unavailable in the current phase';end if;
 perform penalty_private.bump(r.id);perform penalty_private.tick_room(r.id);select * into r from penalty_private.rooms where id=r.id;return penalty_private.public_room(r);
end $$;

revoke execute on all functions in schema penalty_private from public,anon,authenticated;
revoke execute on function public.host_preflight(text) from public,anon,authenticated;
grant execute on function public.host_preflight(text) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='player_events') then
  alter publication supabase_realtime add table public.player_events;
 end if;
end $$;
notify pgrst, 'reload schema';
commit;
