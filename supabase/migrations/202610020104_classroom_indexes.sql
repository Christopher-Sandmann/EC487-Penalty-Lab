-- Additive deployment tuning only: no changes to play, probabilities or access rights.
begin;
create index if not exists diagnostics_match_idx on penalty_private.diagnostics(match_id);
create index if not exists diagnostics_participant_idx on penalty_private.diagnostics(participant_id);
create index if not exists diagnostics_room_idx on penalty_private.diagnostics(room_id);
create index if not exists matches_keeper_idx on penalty_private.matches(keeper);
create index if not exists matches_kicker_idx on penalty_private.matches(kicker);
create index if not exists participants_uid_idx on penalty_private.participants(uid);
create index if not exists rooms_host_idx on penalty_private.rooms(host);
create index if not exists player_events_room_idx on public.player_events(room_id);
create index if not exists player_events_uid_idx on public.player_events(uid);
alter policy own_player_notifications on public.player_events using(uid=(select auth.uid()));
commit;
