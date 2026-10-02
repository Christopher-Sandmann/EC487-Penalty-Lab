> **Later hosted-installation addendum:** see [SUPABASE-STATUS.md](../SUPABASE-STATUS.md). The historical delivery tests below remain unchanged; the subsequent hosted SQL and role tests are documented separately.

# Verification report — Penalty Lab v0.3

Revision: 2 October 2026. All test data are synthetic and isolated from teaching data. **No Supabase project or GitHub Pages site has been deployed or cloud-tested from this environment.**

## Tests actually executed

| Check | Result | Evidence |
|---|---|---|
| Strict TypeScript build | Passed; TypeScript 5.8.3, Node 22.16.0 | `test-artifacts/unit-tests.txt` |
| Unit and transport tests | **47 passed, 0 failed** | Same log; `tests/` |
| Configuration and installation-bundle parity | Passed | `test-artifacts/config-check.txt` |
| Direct local HTTP integration | **11 passed** | `test-artifacts/local-http-tests.txt` |
| Full Chromium UI check groups | **12 passed** | `browser-results.json`, `test-artifacts/browser-checks.txt` |
| Audio/haptic-control checks | **2 passed** | `effects-results.json`, `test-artifacts/effects-checks.txt` |
| Instructor navigation (transport fixture) | **1 passed** | `host-ui-results.json`, `test-artifacts/host-ui-checks.txt` |
| Missing-live-config navigation | Passed; no practice fallback | `performance-audio-results.json` |
| Larger local matching simulations | 31, 60 and 100 synthetic players each completed 6+6 | `test-artifacts/local-load-tests.txt` |
| Unconfigured live shell build | Passed; setup screen, no live credentials | `test-artifacts/build-live.txt` |

The matching simulations produced 186, 360 and 600 resolved penalties respectively. They exercise the local **algorithm**, not 100 simultaneous browsers, campus signups or cloud capacity. Runtime figures in the raw log are algorithm execution times, not network latency measurements.

The compiler was already installed at the pinned version. Package-registry access was unavailable here, so a fresh `npm ci` was not verified. The repository includes a pinned lockfile and the GitHub workflow installs from it before testing.

## What these checks establish

The inherited mathematical and engine checks cover the four exact matrix cells, both preference relabellings, minimax indifference, interval numerics, prescribed statistics groups, missing-observation treatment, role-balanced scores, six-per-role constraints, odd rosters, timeouts and feedback gating. The visual tests exhaustively enumerate all 10,000 possible draws in each action/preference configuration: the same goal counts are retained, all five visual outcomes occur, and wrong-way dives cannot become physical saves. Flight/post-rebound samples remain on the selected side.

The **local Node HTTP server** rejected unauthorized operations and unrevealed-choice reads. Sixty simultaneous submissions/retries committed one draw, one common result and one appearance each. An independent local clock cancelled a silent partner without a draw or count. These are genuine local HTTP checks, **not** a substitute for executing the Supabase SQL.

New tests check that live configuration rejects recognizable secret/service-role keys, missing live settings cannot instantiate practice, the live socket subscribes to the owner-specific player signal as well as room controls, and a valid in-memory Auth session survives unavailable browser storage. The socket test is a protocol-contract fixture, not a connection to Supabase.

Chromium completed all twelve penalties at desktop and 360-pixel mobile widths: all probability reminders, private-choice controls, exact twelve instructor paragraphs, six striker/six keeper appearances, outcome history markers/details, replay, and the statistics-first question/filter controls. No horizontal overflow or uncaught JavaScript errors were observed. The functional portion uses an accelerated test clock and reduced motion; the performance portion below does not.

The separate effects check used actual Web Audio source scheduling and an instrumented vibration API. It observed opt-in sound, countdown ticks, urgency for the final three seconds, kick/goal/save/post/wide/high cues, mute stopping further sound scheduling, optional haptics, and deduplication of repeated result notifications. **No physical phone vibration or human audition of the synthesized sounds is claimed.**

The full twelve-penalty browser suite completed before the final instructor-only navigation adjustment. That adjustment (host Statistics without joining, switching/creating rooms, and synchronizing the selected room with the player transport) passed a separate embedded Chromium check with an explicit transport fixture. Strict compilation and all 47 unit/transport tests were rerun after the adjustment. A subsequent repeat of the long full-game browser suite hit this environment's 120-second execution limit; it is not counted as another completed run (`test-artifacts/browser-rerun-interrupted.txt`).

## Short real-time animation samples — sound enabled

Chromium 144.0.7559.96, headless, ordinary requestAnimationFrame timestamps. Approximately four seconds per sample; initial frame intervals discarded. The renderer caps device pixel ratio at two. These final samples had sound enabled through the onboarding control.

| Viewport | DPR | Frame intervals | Mean fps | 95th percentile | Maximum | Intervals >25 ms |
|---|---:|---:|---:|---:|---:|---:|
| 1440x1000 | 1 | 246 | 60.01 | 16.7 ms | 16.8 ms | 0 |
| 360x800 | 2 | 244 | 60.00 | 16.7 ms | 16.8 ms | 0 |

A preceding desktop run also recorded one 33.4 ms interval (59.76 mean fps). The later short samples do not guarantee uninterrupted 60 fps on every browser, physical phone, thermal state or busy classroom network. Mobile here means Chromium viewport/touch emulation, not native iOS Safari or Android Chrome.

## Included checks not executed here

**Actual PostgreSQL authority:** `scripts/postgres-tests.mjs` is supplied as a required GitHub Actions job with a disposable PostgreSQL 17 service. It applies the real migrations 101 and 103 and checks permissions, early/private choices, actual SQL concurrency, owner-only signal RLS, timeouts, preflight health and a 15-player complete roster. It uses explicit Auth fixtures; it does not include hosted Auth, the actual Cron scheduler or a Realtime service. It has **not run in this environment** because PostgreSQL/Docker were unavailable. Do not treat its inclusion as a pass. The deployment job waits for its first successful run in GitHub.

**Hosted Supabase:** migrations/installer, real Auth, Realtime delivery, Cron scheduling, security/concurrent submissions, mass anonymous arrival and recovery on a hosted project remain to be tested. `supabase/CHECK-BACKEND.sql`, `supabase/tests/structure.sql`, host **Check backend**, and the authorized `npm run test:cloud` script support that rehearsal. The additive v2 upgrade is supplied but was not applied to an existing cloud database.

**Browser networking:** a local browser-navigation harness was attempted and blocked before joining by `ERR_BLOCKED_BY_ADMINISTRATOR` on loopback navigation. `local-browser-results.json` records the failed attempt; it is not counted as a pass. Embedded-document UI and direct Node HTTP tests work here, but they do not jointly certify a real browser's network transport. The separate `e2e/local_browser_checks.py` remains available for an environment permitting ordinary loopback access.

**Classroom:** GitHub Pages repository-subpath deployment, physical iOS/Android, persistent-origin reload/multiple tabs, interrupted Wi-Fi, same-campus-IP signups and realistic class-size load are outstanding. No live URL is invented. Publish a test room, rehearse, then create a separate teaching room as described in `../START-HERE.md`.

The twelve teaching paragraphs are the accepted instructor-provided v2 content; this release does not newly research or revise their historical/theoretical claims. No economist selection, referee portraits or external audio recordings remain.

## Reproduce

```sh
npm ci
npm test
npm run test:config
npm run test:http
npm run test:load
python e2e/browser_checks.py
python e2e/effects_checks.py
```

The browser scripts require Python Playwright and Chromium; override `CHROMIUM_PATH` as needed. Run PostgreSQL/hosted checks only with the disposable database or authorized test credentials specified in their scripts and deployment guide. The manual classroom checklist is separate from publishing the initial rehearsal site.
