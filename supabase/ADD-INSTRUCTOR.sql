-- Run in the trusted Supabase SQL Editor, AFTER INSTALL.sql.
-- First create an email/password user under Authentication > Users and confirm
-- their email. This is the game's instructor account, not your dashboard login.
-- Replace the placeholder BELOW IN THE SQL EDITOR; do not commit your details.
do $$
declare
 instructor_email text := 'YOUR_INSTRUCTOR_EMAIL';
 instructor_id uuid;
begin
 select id into instructor_id from auth.users
 where lower(email)=lower(instructor_email)
   and not coalesce(is_anonymous,true) and email_confirmed_at is not null;
 if instructor_id is null then
  raise exception 'No confirmed, non-anonymous Auth user was found. Create/confirm the instructor user first and replace YOUR_INSTRUCTOR_EMAIL.';
 end if;
 insert into penalty_private.hosts(uid) values(instructor_id) on conflict(uid) do nothing;
 raise notice 'Instructor account authorized. Sign into the game with its email and password.';
end $$;
