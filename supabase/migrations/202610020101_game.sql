-- EC487 Penalty Lab. Supabase/Postgres 15+.
-- Production authority. Apply to a DEDICATED project as the database owner.
-- All writes are authenticated RPCs; every mutation takes the same room advisory lock.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists penalty_private;
revoke all on schema penalty_private from public, anon, authenticated;
alter default privileges in schema penalty_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema penalty_private revoke execute on functions from public, anon, authenticated;

create table penalty_private.config (singleton boolean primary key default true check(singleton), value jsonb not null);
-- Generated seed is maintained from content/game-config.json by scripts/check-config.mjs.
insert into penalty_private.config(value) values ('{"matrix_units":{"UU":5911,"UN":9410,"NU":9310,"NN":7122},"denominator":10000,"decision_ms":12000,"feedback_ms":5000,"appearances_per_role":6,"presence_ms":25000,"alpha_family":0.05,"inference_streams":12,"briefing_min_ms":2400,"briefing_timeout_ms":35000,"reveal_ms":2200}');
create table penalty_private.hosts(uid uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
create table penalty_private.rooms(
 id uuid primary key default gen_random_uuid(), code text unique not null check(code ~ '^[A-Z0-9]{4,8}$'),
 host uuid not null references auth.users(id), phase text not null default 'lobby' check(phase in ('lobby','playing','paused','ended')),
 entry_open boolean not null default true, show_benchmarks boolean not null default true, practice boolean not null default true,
 created_at timestamptz not null default now(), ended_at timestamptz, next_serial bigint not null default 1, version bigint not null default 1
);
create table penalty_private.participants(
 id uuid primary key default gen_random_uuid(), uid uuid not null references auth.users(id), room_id uuid not null references penalty_private.rooms(id) on delete cascade,
 username text not null check(char_length(username) between 2 and 18), preference text not null check(preference in ('micro','macro')),
 kicks integer not null default 0 check(kicks between 0 and 6), keeps integer not null default 0 check(keeps between 0 and 6),
 status text not null default 'lobby' check(status in ('lobby','waiting','matched','feedback','finished','away')),
 matchmaking_ready_at timestamptz not null default now(), last_seen timestamptz not null default now(), disconnect_logged boolean not null default false,
 active_match uuid, pending_result uuid, feedback_since timestamptz, registered_at timestamptz not null default now(), unique(room_id,uid)
);
create unique index unique_classroom_username on penalty_private.participants(room_id,lower(username));
create index matching_pool on penalty_private.participants(room_id,status,matchmaking_ready_at);
create table penalty_private.matches(
 id uuid primary key default gen_random_uuid(), room_id uuid not null references penalty_private.rooms(id) on delete cascade, serial bigint not null,
 kicker uuid not null references penalty_private.participants(id) on delete cascade, keeper uuid not null references penalty_private.participants(id) on delete cascade,
 kicker_prepared boolean not null default false, keeper_prepared boolean not null default false, choice_starts_at timestamptz,
 kicker_wait_ms bigint not null, keeper_wait_ms bigint not null,
 locked_at timestamptz not null, deadline timestamptz not null, status text not null default 'briefing' check(status in ('briefing','locked','resolved','cancelled')),
 result jsonb, draw integer check(draw between 0 and 9999), draw_count integer not null default 0 check(draw_count in (0,1)), reason text, closed_at timestamptz,
 unique(room_id,serial),check(kicker<>keeper), check(deadline>locked_at),
 check((status='resolved' and result is not null and draw is not null and draw_count=1) or (status<>'resolved' and result is null and draw is null and draw_count=0))
);
create index room_attempt_order on penalty_private.matches(room_id,serial);
create index match_timeouts on penalty_private.matches(deadline) where status in('briefing','locked');
create table penalty_private.submissions(
 match_id uuid not null references penalty_private.matches(id) on delete cascade, participant_id uuid not null references penalty_private.participants(id) on delete cascade,
 choice text not null check(choice in ('micro','macro')), submitted_at timestamptz not null, request_id uuid not null,
 primary key(match_id,participant_id), unique(participant_id,request_id)
);
create table penalty_private.diagnostics(
 id bigint generated always as identity primary key, room_id uuid not null references penalty_private.rooms(id) on delete cascade,
 participant_id uuid references penalty_private.participants(id) on delete cascade, match_id uuid references penalty_private.matches(id) on delete cascade,
 kind text not null, occurred_at timestamptz not null default clock_timestamp(), details jsonb not null default '{}'
);
-- The ONLY table clients may subscribe to. It never contains a direction or result.
create table public.room_events(room_id uuid primary key references penalty_private.rooms(id) on delete cascade, version bigint not null, changed_at timestamptz not null default clock_timestamp());
alter table public.room_events enable row level security;
revoke all on public.room_events from public,anon,authenticated;
grant select on public.room_events to authenticated;

do $$ declare t record;begin for t in select tablename from pg_tables where schemaname='penalty_private' loop execute format('alter table penalty_private.%I enable row level security',t.tablename);end loop;end $$;
revoke all on all tables in schema penalty_private from public,anon,authenticated;
revoke all on all sequences in schema penalty_private from public,anon,authenticated;

create function penalty_private.cfg() returns jsonb language sql stable security definer set search_path='' as $$select value from penalty_private.config where singleton$$;
create function penalty_private.ms(t timestamptz) returns bigint language sql immutable set search_path='' as $$select floor(extract(epoch from t)*1000)::bigint$$;
create function penalty_private.lock_room(p_room uuid) returns void language sql volatile set search_path='' as $$select pg_advisory_xact_lock(hashtextextended(p_room::text,487))$$;
create function penalty_private.random_int(p_max integer) returns integer language plpgsql volatile security definer set search_path='' as $$
declare b bytea;u bigint;cap bigint;begin
 if p_max<1 then raise exception 'Invalid random bound';end if;
 cap:=(4294967296::bigint/p_max)*p_max;
 loop b:=extensions.gen_random_bytes(4);u:=get_byte(b,0)::bigint*16777216+get_byte(b,1)::bigint*65536+get_byte(b,2)::bigint*256+get_byte(b,3);exit when u<cap;end loop;
 return (u%p_max)::integer;
end $$;
create function penalty_private.require_host(p_room uuid default null) returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();begin
 if u is null or not exists(select 1 from penalty_private.hosts h join auth.users a on a.id=h.uid where h.uid=u and not coalesce(a.is_anonymous,true)) then raise exception 'Instructor authorization required' using errcode='42501';end if;
 if p_room is not null and not exists(select 1 from penalty_private.rooms r where r.id=p_room and r.host=u) then raise exception 'You do not host this room' using errcode='42501';end if;return u;
end $$;
create function penalty_private.member(p_code text) returns penalty_private.participants language plpgsql volatile security definer set search_path='' as $$
declare p penalty_private.participants;begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select a.* into p from penalty_private.participants a join penalty_private.rooms r on r.id=a.room_id where r.code=upper(p_code) and a.uid=auth.uid();
 if p.id is null then raise exception 'Join this room first' using errcode='42501';end if;return p;
end $$;
create function public.is_room_member(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from penalty_private.participants p where p.room_id=p_room and p.uid=auth.uid()) or exists(select 1 from penalty_private.rooms r join penalty_private.hosts h on h.uid=r.host where r.id=p_room and r.host=auth.uid()))
$$;
create policy room_member_notifications on public.room_events for select to authenticated using(public.is_room_member(room_id));
create function penalty_private.bump(p_room uuid) returns void language plpgsql volatile security definer set search_path='' as $$
declare v bigint;begin update penalty_private.rooms set version=version+1 where id=p_room returning version into v;
 insert into public.room_events(room_id,version) values(p_room,v) on conflict(room_id) do update set version=excluded.version,changed_at=clock_timestamp();end $$;
create function penalty_private.public_player(p penalty_private.participants) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'username',p.username,'preference',p.preference,'kicks',p.kicks,'keeps',p.keeps,'status',p.status)
$$;
create function penalty_private.public_room(r penalty_private.rooms) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'code',r.code,'host','','phase',r.phase,'entryOpen',r.entry_open,'showBenchmarks',r.show_benchmarks,'practice',r.practice,'createdAt',penalty_private.ms(r.created_at),'nextSerial',r.next_serial,'version',r.version)
$$;
create function penalty_private.match_view(p_match uuid,p_viewer uuid default null) returns jsonb language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'roomId',m.room_id,'serial',m.serial,'kicker',m.kicker,'keeper',m.keeper,'kickerPrepared',m.kicker_prepared,'keeperPrepared',m.keeper_prepared,'choiceStartsAt',penalty_private.ms(m.choice_starts_at),
 'lockedAt',penalty_private.ms(m.locked_at),'deadline',penalty_private.ms(m.deadline),'status',m.status,'result',case when m.status='resolved' then m.result else null end,'reason',m.reason,'closedAt',penalty_private.ms(m.closed_at),
 'kickerPlayer',penalty_private.public_player(k),'keeperPlayer',penalty_private.public_player(g)) ||
 case when p_viewer in (m.kicker,m.keeper) then jsonb_build_object('kickerReady',exists(select 1 from penalty_private.submissions s where s.match_id=m.id and s.participant_id=m.kicker),'keeperReady',exists(select 1 from penalty_private.submissions s where s.match_id=m.id and s.participant_id=m.keeper),'ownChoice',(select s.choice from penalty_private.submissions s where s.match_id=m.id and s.participant_id=p_viewer)) else '{}'::jsonb end
 from penalty_private.matches m join penalty_private.participants k on k.id=m.kicker join penalty_private.participants g on g.id=m.keeper where m.id=p_match
$$;
create function penalty_private.cancel_match(p_match uuid,p_reason text) returns void language plpgsql volatile security definer set search_path='' as $$
declare m penalty_private.matches;p penalty_private.participants;responsive boolean;begin
 select * into m from penalty_private.matches where id=p_match;if m.status not in('briefing','locked') then return;end if;
 update penalty_private.matches set status='cancelled',reason=p_reason,closed_at=clock_timestamp() where id=m.id;
 for p in select * from penalty_private.participants where id in(m.kicker,m.keeper) loop
  select exists(select 1 from penalty_private.submissions where match_id=m.id and participant_id=p.id) or (m.status='briefing' and case when p.id=m.kicker then m.kicker_prepared else m.keeper_prepared end) into responsive;
  update penalty_private.participants set active_match=null,status=case when responsive then 'waiting' else 'away' end,matchmaking_ready_at=clock_timestamp() where id=p.id;
  insert into penalty_private.diagnostics(room_id,participant_id,match_id,kind,details) values(m.room_id,p.id,m.id,case when responsive then 'cancelled-responsive' else 'timeout-or-abandonment' end,jsonb_build_object('reason',p_reason));
 end loop;perform penalty_private.bump(m.room_id);
end $$;

-- The room lock must already be held. This is the sole matchmaking implementation.
create function penalty_private.tick_room(p_room uuid) returns void language plpgsql volatile security definer set search_path='' as $$
declare r penalty_private.rooms;m penalty_private.matches;p penalty_private.participants;pair record;k penalty_private.participants;g penalty_private.participants;a penalty_private.participants;b penalty_private.participants;mid uuid;t timestamptz;serial_no bigint;both_roles boolean;remaining bigint;critical uuid[];c jsonb:=penalty_private.cfg();begin
 select * into r from penalty_private.rooms where id=p_room;
 for m in select * from penalty_private.matches where room_id=p_room and status in('briefing','locked') and deadline<=clock_timestamp() loop perform penalty_private.cancel_match(m.id,case when m.status='briefing' then 'briefing-timeout' else 'decision-timeout' end);end loop;
 for p in select * from penalty_private.participants where room_id=p_room and status<>'finished' and not disconnect_logged and last_seen<=clock_timestamp()-(c->>'presence_ms')::integer*interval '1 millisecond' loop
  update penalty_private.participants set disconnect_logged=true where id=p.id;
  insert into penalty_private.diagnostics(room_id,participant_id,match_id,kind) values(p_room,p.id,p.active_match,'disconnected');
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

create function public.room_snapshot(p_code text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p penalty_private.participants;r penalty_private.rooms;counts jsonb;t timestamptz:=clock_timestamp();begin
 p:=penalty_private.member(p_code);select * into r from penalty_private.rooms where id=p.room_id;
 select jsonb_build_object('waiting',count(*) filter(where status='waiting'),'matched',count(*) filter(where status='matched'),'finished',count(*) filter(where status='finished'),'away',count(*) filter(where status='away'),'feedback',count(*) filter(where status='feedback'),'lobby',count(*) filter(where status='lobby'),'disconnected',count(*) filter(where status<>'finished' and last_seen<=t-interval '25 seconds')) into counts from penalty_private.participants where room_id=r.id;
 return jsonb_build_object('serverNow',penalty_private.ms(t),'room',penalty_private.public_room(r),'me',penalty_private.public_player(p)||jsonb_build_object('uid',p.uid,'roomId',p.room_id,'readyAt',penalty_private.ms(p.matchmaking_ready_at),'lastSeen',penalty_private.ms(p.last_seen),'activeMatch',p.active_match,'pendingResult',p.pending_result,'feedbackSince',penalty_private.ms(p.feedback_since),'registeredAt',penalty_private.ms(p.registered_at)),
 'match',penalty_private.match_view(coalesce(p.active_match,p.pending_result),p.id),'waiting',counts->'waiting','counts',counts,'diagnostics',jsonb_build_object('cancelled',(select count(*) from penalty_private.matches where room_id=r.id and status='cancelled'),'unresolved',(select count(*) from penalty_private.matches where room_id=r.id and status in('briefing','locked'))));
end $$;
create function public.join_room(p_code text,p_username text,p_preference text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r penalty_private.rooms;u uuid:=auth.uid();name text;begin
 if u is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into r from penalty_private.rooms where code=upper(p_code);if r.id is null then raise exception 'Room not found';end if;perform penalty_private.lock_room(r.id);
 if exists(select 1 from penalty_private.participants where room_id=r.id and uid=u) then return public.room_snapshot(p_code);end if;
 select * into r from penalty_private.rooms where id=r.id;if not r.entry_open or r.phase='ended' then raise exception 'This room is not accepting new entrants';end if;
 name:=regexp_replace(btrim(normalize(p_username,NFKC)),'\s+',' ','g');
 if name is null or name !~ '^[[:alnum:]][[:alnum:] ._-]{1,17}$' then raise exception 'Use 2–18 letters, numbers, spaces, dots, underscores or hyphens';end if;
 if p_preference is null or p_preference not in('micro','macro') then raise exception 'Choose Micro or Macro';end if;
 insert into penalty_private.participants(uid,room_id,username,preference,status,matchmaking_ready_at,last_seen)
 values(u,r.id,name,p_preference,case when r.phase='lobby' then 'lobby' else 'waiting' end,clock_timestamp(),clock_timestamp());
 perform penalty_private.bump(r.id);perform penalty_private.tick_room(r.id);return public.room_snapshot(p_code);
end $$;
-- Pure cosmetic use of the residual of the ONE authoritative draw.
create function penalty_private.visual_outcome(drawn integer, units integer, same_side boolean) returns text language plpgsql immutable set search_path='' as $$
declare r numeric;begin
 if drawn<units then return 'goal';end if;
 r:=(drawn-units)::numeric/(10000-units);
 if same_side then
  if r<0.65 then return 'save';elsif r<0.77 then return 'post';elsif r<0.90 then return 'wide';else return 'high';end if;
 end if;
 if r<0.34 then return 'post';elsif r<0.67 then return 'wide';else return 'high';end if;
end $$;
-- Both clients must explicitly finish the flashcard before either can choose.
create function public.prepare_match(p_match uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare m penalty_private.matches;p penalty_private.participants;t timestamptz;c jsonb:=penalty_private.cfg();begin
 select * into m from penalty_private.matches where id=p_match;
 select * into p from penalty_private.participants where room_id=m.room_id and uid=auth.uid();
 if p.id is null or p.id not in(m.kicker,m.keeper) then raise exception 'You are not in this match' using errcode='42501';end if;
 perform penalty_private.lock_room(m.room_id);select * into m from penalty_private.matches where id=p_match;
 if m.status in('locked','resolved') then return jsonb_build_object('ok',true,'status',m.status);end if;
 if m.status<>'briefing' then return jsonb_build_object('ok',false,'status',m.status);end if;
 t:=clock_timestamp();
 if t>=m.deadline then perform penalty_private.cancel_match(m.id,'briefing-timeout');perform penalty_private.tick_room(m.room_id);return jsonb_build_object('ok',false,'status','cancelled');end if;
 if t-m.locked_at<(c->>'briefing_min_ms')::integer*interval '1 millisecond' then raise exception 'Take a moment to read the scoring probabilities';end if;
 update penalty_private.participants set last_seen=t where id=p.id;
 if (p.id=m.kicker and m.kicker_prepared) or (p.id=m.keeper and m.keeper_prepared) then return jsonb_build_object('ok',true);end if;
 update penalty_private.matches set kicker_prepared=kicker_prepared or p.id=kicker,keeper_prepared=keeper_prepared or p.id=keeper where id=m.id;
 update penalty_private.participants set last_seen=t where id=p.id;
 update penalty_private.matches set status='locked',choice_starts_at=t,deadline=t+(c->>'decision_ms')::integer*interval '1 millisecond' where id=m.id and kicker_prepared and keeper_prepared;
 perform penalty_private.bump(m.room_id);return jsonb_build_object('ok',true);
end $$;
create function public.submit_choice(p_match uuid,p_choice text,p_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare m penalty_private.matches;p penalty_private.participants;k penalty_private.participants;g penalty_private.participants;old text;kc text;gc text;kn boolean;gn boolean;units integer;drawn integer;t timestamptz;c jsonb:=penalty_private.cfg();begin
 select * into m from penalty_private.matches where id=p_match;
 select * into p from penalty_private.participants where room_id=m.room_id and uid=auth.uid();
 if p.id is null or p.id not in(m.kicker,m.keeper) then raise exception 'You are not in this match' using errcode='42501';end if;
 if p_choice is null or p_choice not in('micro','macro') or p_request_id is null then raise exception 'A valid choice and request id are required';end if;
 perform penalty_private.lock_room(m.room_id);select * into m from penalty_private.matches where id=p_match;
 select choice into old from penalty_private.submissions where match_id=p_match and participant_id=p.id;
 if old is not null then if old<>p_choice then raise exception 'Your first choice is locked';end if;return jsonb_build_object('ok',true,'status',m.status);end if;
 if m.status<>'locked' then return jsonb_build_object('ok',false,'status',m.status);end if;
 t:=clock_timestamp();if t>=m.deadline then
  -- Do not RAISE here: that would roll back the cancellation and its diagnostic record.
  perform penalty_private.cancel_match(m.id,'decision-timeout');perform penalty_private.tick_room(m.room_id);return jsonb_build_object('ok',false,'status','cancelled');
 end if;
 insert into penalty_private.submissions(match_id,participant_id,choice,submitted_at,request_id) values(m.id,p.id,p_choice,t,p_request_id);
 update penalty_private.participants set last_seen=t where id=p.id;
 select choice into kc from penalty_private.submissions where match_id=m.id and participant_id=m.kicker;
 select choice into gc from penalty_private.submissions where match_id=m.id and participant_id=m.keeper;
 if kc is not null and gc is not null then
  select * into k from penalty_private.participants where id=m.kicker;select * into g from penalty_private.participants where id=m.keeper;
  kn:=kc=k.preference;gn:=gc=k.preference;
  units:=(c->'matrix_units'->>((case when kn then 'N' else 'U' end)||(case when gn then 'N' else 'U' end)))::integer;
  drawn:=penalty_private.random_int((c->>'denominator')::integer);
  update penalty_private.matches set status='resolved',draw=drawn,draw_count=1,closed_at=t,result=jsonb_build_object('kickerChoice',kc,'keeperChoice',gc,'kickerN',kn,'keeperN',gn,'probability',units::numeric/(c->>'denominator')::integer,'goal',drawn<units,'visualOutcome',penalty_private.visual_outcome(drawn,units,kc=gc),'resolvedAt',penalty_private.ms(t)) where id=m.id;
  update penalty_private.participants set kicks=kicks+case when id=m.kicker then 1 else 0 end,keeps=keeps+case when id=m.keeper then 1 else 0 end,status='feedback',active_match=null,pending_result=m.id,feedback_since=null where id in(m.kicker,m.keeper);
 end if;perform penalty_private.bump(m.room_id);return jsonb_build_object('ok',true,'status',case when kc is not null and gc is not null then 'resolved' else 'locked' end);
end $$;
create function public.feedback_seen(p_match uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p penalty_private.participants;begin
 select * into p from penalty_private.participants where uid=auth.uid() and pending_result=p_match;
 if p.id is null then raise exception 'No feedback is due for this match' using errcode='42501';end if;perform penalty_private.lock_room(p.room_id);
 update penalty_private.participants set feedback_since=coalesce(feedback_since,clock_timestamp()) where id=p.id and pending_result=p_match;return jsonb_build_object('ok',true);
end $$;
create function public.ready_player(p_code text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p penalty_private.participants;r penalty_private.rooms;t timestamptz;c jsonb:=penalty_private.cfg();begin
 p:=penalty_private.member(p_code);perform penalty_private.lock_room(p.room_id);select * into p from penalty_private.participants where id=p.id;select * into r from penalty_private.rooms where id=p.room_id;t:=clock_timestamp();
 update penalty_private.participants set last_seen=t where id=p.id;
 if p.status in('matched','waiting','finished') then return jsonb_build_object('ok',true);end if;
 if p.pending_result is not null and (p.feedback_since is null or t-p.feedback_since<(c->>'feedback_ms')::integer*interval '1 millisecond') then raise exception 'Please take a moment to read the card';end if;
 update penalty_private.participants set pending_result=null,feedback_since=null,status=case when kicks+keeps=12 then 'finished' when r.phase='lobby' then 'lobby' else 'waiting' end,matchmaking_ready_at=t where id=p.id;
 perform penalty_private.bump(p.room_id);perform penalty_private.tick_room(p.room_id);return jsonb_build_object('ok',true);
end $$;
create function public.player_heartbeat(p_code text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p penalty_private.participants;begin
 p:=penalty_private.member(p_code);perform penalty_private.lock_room(p.room_id);select * into p from penalty_private.participants where id=p.id;
 if p.disconnect_logged then insert into penalty_private.diagnostics(room_id,participant_id,kind) values(p.room_id,p.id,'reconnected');end if;
 update penalty_private.participants set last_seen=clock_timestamp(),disconnect_logged=false where id=p.id;
 perform penalty_private.tick_room(p.room_id);return jsonb_build_object('ok',true);
end $$;
create function public.room_statistics(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r penalty_private.rooms;begin
 select * into r from penalty_private.rooms where code=upper(p_code);
 if r.id is null or not public.is_room_member(r.id) then raise exception 'Room membership required' using errcode='42501';end if;
 return jsonb_build_object('serverNow',penalty_private.ms(clock_timestamp()),'room',penalty_private.public_room(r),
 'players',coalesce((select jsonb_agg(penalty_private.public_player(p) order by p.registered_at,p.id) from penalty_private.participants p where p.room_id=r.id),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(penalty_private.match_view(m.id) order by m.serial) from penalty_private.matches m where m.room_id=r.id),'[]'::jsonb),
 'counts',jsonb_build_object('connected',(select count(*) from penalty_private.participants p where p.room_id=r.id and p.last_seen>clock_timestamp()-interval '25 seconds'),'disconnected',(select count(*) from penalty_private.participants p where p.room_id=r.id and p.status<>'finished' and p.last_seen<=clock_timestamp()-interval '25 seconds')));
end $$;
create function public.host_create_room(p_code text,p_practice boolean default true) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u uuid;r penalty_private.rooms;begin u:=penalty_private.require_host();
 insert into penalty_private.rooms(code,host,practice) values(upper(p_code),u,coalesce(p_practice,true)) returning * into r;
 insert into public.room_events(room_id,version) values(r.id,r.version);return penalty_private.public_room(r);
end $$;
create function public.host_room_action(p_code text,p_action text,p_value jsonb default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r penalty_private.rooms;m penalty_private.matches;v boolean;begin
 select * into r from penalty_private.rooms where code=upper(p_code);if r.id is null then raise exception 'Room not found';end if;perform penalty_private.require_host(r.id);perform penalty_private.lock_room(r.id);select * into r from penalty_private.rooms where id=r.id;
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
create function public.host_export(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r penalty_private.rooms;rows jsonb;begin select * into r from penalty_private.rooms where code=upper(p_code);if r.id is null then raise exception 'Room not found';end if;perform penalty_private.require_host(r.id);
 select coalesce(jsonb_agg(rowdata order by sort_serial,sort_type),'[]'::jsonb) into rows from (
 select m.serial sort_serial,0 sort_type,jsonb_build_object('record_type','penalty-attempt','room',r.code,'session_id',r.id,'practice',r.practice,'serial',m.serial,'match_id',m.id,'status',m.status,'reason',m.reason,'kicker_id',k.id,'keeper_id',g.id,'kicker_preference',k.preference,'keeper_preference',g.preference,
 'kicker_label',case when m.status in('resolved','cancelled') then ks.choice end,'keeper_label',case when m.status in('resolved','cancelled') then gs.choice end,'kicker_N',m.result->'kickerN','keeper_N',m.result->'keeperN','goal_probability',m.result->'probability','goal',m.result->'goal','visual_outcome',m.result->>'visualOutcome','choice_starts_at',m.choice_starts_at,'draw_count',m.draw_count,
 'locked_at',m.locked_at,'deadline',m.deadline,'closed_at',m.closed_at,'kicker_submitted_at',case when m.status in('resolved','cancelled') then ks.submitted_at end,'keeper_submitted_at',case when m.status in('resolved','cancelled') then gs.submitted_at end,'kicker_wait_ms',m.kicker_wait_ms,'keeper_wait_ms',m.keeper_wait_ms,'participant_id',null,'event_at',null) rowdata
 from penalty_private.matches m join penalty_private.participants k on k.id=m.kicker join penalty_private.participants g on g.id=m.keeper left join penalty_private.submissions ks on ks.match_id=m.id and ks.participant_id=k.id left join penalty_private.submissions gs on gs.match_id=m.id and gs.participant_id=g.id where m.room_id=r.id
 union all
 select coalesce(m.serial,0),1,jsonb_build_object('record_type','diagnostic','room',r.code,'session_id',r.id,'practice',r.practice,'serial',m.serial,'match_id',d.match_id,'status',null,'reason',d.kind,'kicker_id',null,'keeper_id',null,'kicker_preference',null,'keeper_preference',null,'kicker_label',null,'keeper_label',null,'kicker_N',null,'keeper_N',null,'goal_probability',null,'goal',null,'visual_outcome',null,'choice_starts_at',null,'draw_count',0,'locked_at',null,'deadline',null,'closed_at',null,'kicker_submitted_at',null,'keeper_submitted_at',null,'kicker_wait_ms',null,'keeper_wait_ms',null,'participant_id',d.participant_id,'event_at',d.occurred_at)
 from penalty_private.diagnostics d left join penalty_private.matches m on m.id=d.match_id where d.room_id=r.id
 ) allrows;return rows;
end $$;
create function public.host_delete_room(p_code text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r penalty_private.rooms;begin select * into r from penalty_private.rooms where code=upper(p_code);if r.id is null then raise exception 'Room not found';end if;perform penalty_private.require_host(r.id);perform penalty_private.lock_room(r.id);
 if r.phase<>'ended' then raise exception 'End the room before deleting it';end if;delete from penalty_private.rooms where id=r.id;return jsonb_build_object('deleted',true);end $$;

-- Explicit allowlist. Anonymous Auth users have the authenticated database role;
-- unauthenticated anon-key-only requests receive NO execute privilege.
revoke execute on all functions in schema penalty_private from public,anon,authenticated;
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('is_room_member','room_snapshot','join_room','prepare_match','submit_choice','feedback_seen','ready_player','player_heartbeat','room_statistics','host_create_room','host_room_action','host_export','host_delete_room') loop
 execute format('revoke execute on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
-- Add only the safe notification table, never submissions or private match rows.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_events') then alter publication supabase_realtime add table public.room_events;end if;
end $$;
commit;
