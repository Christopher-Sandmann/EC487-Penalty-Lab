# Penalty Lab: zero-sum installation record

**Project:** zero-sum · `qeqxmigikngsxlktbpdg` · eu-west-1  
**Verified:** 2 October 2026, 14:39 London time (13:39 UTC).  
**State:** backend installed; frontend not yet published; instructor and student-auth setup still pending.

## Installed in the actual hosted project

| Database migration | Recorded version |
|---|---|
| penalty_lab_game | 20261002132936 |
| penalty_lab_clock | 20261002133047 |
| penalty_lab_live_v3 | 20261002133141 |
| penalty_lab_classroom_indexes | 20261002133822 |

The first three migrations install the supplied v3 game backend. The fourth adds nine foreign-key indexes and changes the player-notification RLS expression from `uid=auth.uid()` to `uid=(select auth.uid())`, preserving exactly the same access rule. It does not change probabilities, timings, matching rules, roles or scoring. The repository includes the equivalent migration as `202610020104_classroom_indexes.sql`; remote migration timestamps naturally differ from source filenames. No remote migration replay is needed. Do not run the fresh installer or v2 upgrade over this installation.

The other Supabase project, Oracle, was not modified.

## Checks actually executed against hosted PostgreSQL

The project initially had no application tables, migration history or Auth users. After installation, PostgreSQL reported version 17.11 and game API version 3. `penalty-room-clock` is active on a one-second schedule. Its five most recent runs succeeded; the final sampled heartbeat age was 399 ms.

All ten application tables have row-level security enabled. The eight private tables have no direct read/write grants to students or unauthenticated callers. Only the two safe notification tables, `public.room_events` and `public.player_events`, are published to Realtime. Neither contains a direction or a result. Private helper functions are not directly callable by students. Privileged application functions have a fixed search path and enforce membership or host authorization.

A database-level smoke test exercised a complete twelve-penalty game, including all four matrix cells, N/U mapping, strength reminders, private first submissions, immutable choices, idempotent retries, recorded visual outcomes, reading gates, personal history, and six appearances in each role. A separate three-player fixture verified that a timeout generated neither an outcome nor a counted appearance and that the responsive player was rematched with the third participant.

A second test explicitly switched to the `authenticated` database role and verified player- and room-notification isolation, denial of direct private-table access, denial of event-table writes and rejection of student host actions. Under the `anon` role, unauthenticated execution of the join RPC was denied.

These tests used synthetic Auth identities and manually adjusted fixture timestamps, exclusively inside transactions that were rolled back. The tests do not establish that Supabase Auth issues the right client tokens, that WebSocket delivery works on classroom devices, or that concurrent network requests and classroom load are safe. The first smoke-test attempt had an ambiguous variable in the test harness; that harness was corrected and the test rerun successfully. No change to game logic was needed.

The final live database count was zero Auth users, hosts, rooms, participants, matches, submissions and diagnostics. No artificial classroom observations remain.

## Advisor findings and their disposition

The initial performance review found nine missing foreign-key indexes and an avoidable per-row Auth evaluation. The additive fourth migration addressed both. The repeated performance scan returned only informational unused-index notices, expected for an unused installation. Those indexes were not dropped.

The security review still reports intentionally callable authenticated SECURITY DEFINER RPCs, private tables with RLS but no direct-access policies, and policies that permit anonymous **signed-in** participants to receive their own notification rows. These should not be described as a completely clean security scan. The explicit role and membership tests above passed. The Cron extension also has internal anonymous-policy notices; student roles lack usage on its schema, and its tables are not published in the game.

Official explanations:
- [Privileged functions callable by signed-in users](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Anonymous access policy warnings](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins)
- [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [RLS initialization-plan optimization](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)
- [Unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)

## What remains

1. In zero-sum, create a confirmed email/password Auth user for the instructor. Keep the password private. Provide only its email address or Auth UID so the intended account can be authorized in `penalty_private.hosts`. The Supabase dashboard login is not automatically a game instructor account.
2. Under Authentication → Sign In / Providers, enable anonymous sign-ins and permit new sign-ups. The current connector does not expose a setting editor; these settings have not been changed or verified through Auth.
3. Under Authentication → Rate Limits, raise the anonymous-sign-in quota for shared-campus-IP arrival. 500/hour/IP is an illustrative headroom setting for roughly 150 students, not a tested game capacity. The documented default is 30 new anonymous sign-ins/hour/IP, not 30 total players. Check actual Realtime and compute limits too.
4. Configure CAPTCHA/Turnstile before public teaching use. The secret stays in Supabase; add only the public site key to `site-config.json` or the `PENALTY_TURNSTILE_SITE_KEY` GitHub variable. This package does not silently disable a CAPTCHA setting in Supabase.
5. Upload this repository's contents, including `.github`, to GitHub. In Settings → Pages select GitHub Actions and run the supplied workflow. Nonempty GitHub variables override the filled-in `site-config.json`. The SQL job tests a disposable CI database; it does not reinstall zero-sum.
6. Use the published website for a real two-device rehearsal, including Auth, Realtime, sound, refresh/reconnection and timeout. Rehearse simultaneous arrival on classroom Wi-Fi. Create a separate fresh teaching room after rehearsal.

Current reference documentation: [Auth settings](https://supabase.com/docs/guides/auth/general-configuration), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [public versus secret API keys](https://supabase.com/docs/guides/getting-started/api-keys), [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).

## Package configuration

`site-config.json` contains the actual zero-sum public URL and active publishable key. It contains no database password, service-role key, management token or instructor credential. A publishable key is deliberately visible to browsers and does not replace user authentication or server-side authorization. The default room code EC487 does not create a room.

The older `docs/test-report.md` records the v3 delivery tests. This installation record is the later addendum: hosted SQL and role tests have now been run, but hosted browser/client authentication, Realtime transport, GitHub deployment and physical-device/classroom rehearsal have not.

## Checks on this configured repository

The public configuration validator and SQL-bundle consistency check passed. All 47 unit/transport/content tests passed in this runtime, and `npm run build` successfully produced a static frontend in Supabase mode using the filled-in public configuration. These are local build checks, not a hosted-browser rehearsal. The two execution logs are in `docs/test-artifacts/zero-sum-package-*.txt`.
