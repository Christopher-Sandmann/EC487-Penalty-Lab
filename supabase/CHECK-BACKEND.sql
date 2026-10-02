-- Read-only checks in the Supabase SQL Editor. Run after installation.
select current_setting('server_version') as postgres_version;
select api_version, clock_seen_at,
 clock_timestamp()-clock_seen_at as tick_age,
 coalesce(clock_seen_at>clock_timestamp()-interval '10 seconds',false) as clock_healthy
from penalty_private.runtime;
select jobid,jobname,schedule,active from cron.job where jobname='penalty-room-clock';
select status,return_message,start_time,end_time from cron.job_run_details
where jobid in (select jobid from cron.job where jobname='penalty-room-clock')
order by start_time desc limit 5;
select schemaname,tablename from pg_publication_tables
where pubname='supabase_realtime';
-- Expect API 3; a recent tick; active '1 second' job; successful recent runs;
-- room_events and player_events published, NEVER penalty_private tables.
