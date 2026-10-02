# Deployment reference · v0.3

The primary step-by-step guide is **[../START-HERE.md](../START-HERE.md)**. Use it rather than the v0.2 deployment instructions.

## Installation paths

For a **fresh dedicated project**, run `supabase/INSTALL.sql` once. It combines migrations 101, 102 and 103 in one transaction with an existing-schema guard. Do not additionally execute those migrations after the installer.

For an existing **v2** project, export/back up data and stop active play, then run only `supabase/UPGRADE-v2-to-v3.sql` (the same SQL as migration 103). This replaces functions/adds signals without deleting gameplay records. It does not migrate an older GOAT-branded deployment.

For a migration-managed installation, apply the three numbered migrations in order instead of the combined installer. Do not mix installation methods. Supabase CLI migration history is not automatically created when pasting SQL manually into the dashboard.

v3 corrects a PL/pgSQL local-record/table-alias naming collision in the inherited matcher, adds per-participant signals and history, and measures Cron health. The one-second sweep must actually execute; RPC traffic is not sufficient evidence. Run `CHECK-BACKEND.sql` and `supabase/tests/structure.sql`, then inspect host **Check backend**.

## Public build settings and routing

`site-config.json` contains public settings only. Environment values with `PENALTY_` names override it. The Pages workflow defaults to Supabase mode and publishes only `dist/`, not local-server code. Asset URLs are relative; join links are `#play?room=CODE`, not server paths. No fabricated deployed URL is bundled.

GitHub Actions runs `npm ci`, unit/config/HTTP tests, and the separate disposable PostgreSQL test job. That database job does not need your Supabase secrets and must **never** point at your real project. The deploy job waits for both jobs. A failed migration/security test blocks deployment until fixed, rather than requiring you to mark unperformed checks complete.

The optional `release-checklist.json` / `npm run check:release` is now a **manual classroom checklist**, not a build gate. Keep entries false until the named real-world check has been performed and recorded.

## Additional hosted security check

After installation, `scripts/cloud-smoke.mjs` runs direct API tests with supplied **test** identities. In a private terminal set `PENALTY_ALLOW_TEST_ROOM=true`, project public URL/key, a whitelisted host access token, and three distinct fresh student access tokens named `PENALTY_TEST_TOKEN_A`, `_B`, `_C`. The host token name is `PENALTY_HOST_ACCESS_TOKEN`. Run `npm run test:cloud`. Never store these tokens in frontend settings, GitHub public variables or committed files.

It creates a clearly marked test room, checks unauthorized host actions, private choices, retries/concurrency, result agreement and feedback timing, then ends the test room without deleting its audit. It does not validate real phones, Wi-Fi throughput, browser storage, or the independent Cron timeout. Perform those manually too. No hosted tests were run for this handoff.

## Administration and retention

End sessions after class. Export before any destructive cleanup. `host_delete_room` is host-authorized and intentionally not a casual UI button; room deletion cascades to its gameplay data. Anonymous identities may be linked to multiple retained rooms, so do not run blanket account deletion against them.

The clock produces Cron run logs. When not using this dedicated project, deactivate the `penalty-room-clock` job in Integrations → Cron and reactivate it before the next rehearsal/class. Supabase documents that run history is not automatically removed; an administrator may separately set an appropriate job-log retention policy. Do not delete game observations as a way of clearing job logs. [Cron documentation](https://supabase.com/docs/guides/cron/quickstart).

This is an ungraded teaching game, not a claim of approved research infrastructure. Use classroom aliases; retain exports under the applicable teaching/data policy.
