# The Penalty Lab · EC487

> **zero-sum installation update — 2 October 2026.** The backend is already installed in project `qeqxmigikngsxlktbpdg`. **Do not run INSTALL.sql or the v2 upgrade on that project again.** The public URL and publishable key are filled into `site-config.json`. Continue with the instructor account and Auth settings below, then GitHub Pages. No secret credentials are included. Read [SUPABASE-STATUS.md](SUPABASE-STATUS.md) for the executed checks and remaining tasks.


**Live-deployment edition v0.3** — GitHub Pages frontend, Supabase authoritative multiplayer.

Start with **[START-HERE.md](START-HERE.md)** for the complete no-command-line GitHub/Supabase setup. That guide includes the shared-IP **30 anonymous sign-ins/hour** setting, instructor bootstrap, CAPTCHA, live rehearsal and classroom run.

## New in this build

Human opponents' usernames are prominent during the reminder, choice and result, and in the personal record. Audio adds a synthesized stadium cheer/fanfare, kick/save/post sounds and an escalating twelve-second countdown; the speaker mutes every audio cue. Audio is opt-in. A separate vibration switch controls supported hardware; unsupported devices degrade without breaking play.

Live matching remains server-authoritative, role-feasible and independent of team/performance. Each participant aims to complete twelve valid penalties: six as striker and six as goalkeeper. No bots enter multiplayer. Both players review the probability reminder before the decision clock starts; directions remain private until both decisions are locked. The accepted matrix, twelve instructor passages, animation paths, record markers and statistical method are preserved.

Personal Realtime signals replace whole-room gameplay notifications. Snapshots include personal history; room statistics load on demand. Reconnection retains the same anonymous identity, with periodic resynchronization if the socket drops. A backend check shows API/clock health; teaching start requires a running independent clock.

## Local development

Requires Node 22+ and npm. In this directory:

```sh
npm ci
npm run dev
```

Use the printed local address and separate host token in two independent browser profiles. The local server is a rehearsal tool, **not** a server to expose on the internet and not the backend for Pages.

```sh
npm test                  # strict TypeScript build + unit/transport tests
npm run test:config       # SQL/TypeScript probability and timing consistency
npm run test:http         # direct local HTTP privacy/concurrency tests
npm run test:load         # 31/60/100-player LOCAL algorithm stress, not cloud load
npm run preview           # standalone simulated preview and practice dist/
npm run build             # live build; requires public Supabase config
```

Edit `site-config.json` or supply the documented environment variables. `npm run build:configured` loads a private local `.env` copied from `.env.example`. The build accepts only public client credentials, and fails rather than silently deploying practice when live credentials are missing. The checked-in site config contains no project credentials.

`Penalty-Lab-Preview.html` is a self-contained **simulated** preview. It never joins Supabase or contributes classroom data. `npm run build:unconfigured` creates a deployable setup-screen shell without keys, for inspecting packaging only; it is not a usable classroom room.

## Repository map

`src/` — interface, sound, Canvas renderer, transports, local engine, mathematical/statistical code.  
`content/` — exact technology and the twelve instructor texts.  
`supabase/INSTALL.sql` — atomic fresh-project installer.  
`supabase/UPGRADE-v2-to-v3.sql` — additive upgrade from v2, not from GOAT.  
`supabase/ADD-INSTRUCTOR.sql` and `CHECK-BACKEND.sql` — trusted admin setup/checks.  
`.github/workflows/pages.yml` — verification plus Pages deployment.  
`tests/`, `scripts/`, `e2e/` — reproducible tests and their harnesses.  
`docs/test-report.md` — executed tests and outstanding hosted/native-device checks.

The PostgreSQL integration job runs the actual SQL with disposable test Auth fixtures in GitHub Actions before publication. It does **not** substitute for a hosted Supabase/Cron/Realtime rehearsal. `npm run check:release` remains an optional manual classroom-readiness checklist; it is no longer a circular prerequisite to publishing the rehearsal site.

No cloud project or GitHub repository has been deployed from this environment. Do not put passwords, private JWTs, management tokens, database credentials or secret/service-role keys into the frontend or repository.
