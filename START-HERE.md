# Take the Penalty Lab live

> **zero-sum installation update — 2 October 2026.** The backend is already installed in project `qeqxmigikngsxlktbpdg`. **Do not run INSTALL.sql or the v2 upgrade on that project again.** The public URL and publishable key are filled into `site-config.json`. Continue with the instructor account and Auth settings below, then GitHub Pages. No secret credentials are included. Read [SUPABASE-STATUS.md](SUPABASE-STATUS.md) for the executed checks and remaining tasks.


**Version 0.3 · 2 October 2026**

GitHub Pages serves the game. Supabase runs authentication, matching, private choices, results and persistence. You do **not** upload the HTML to Supabase or merely give Supabase a GitHub link. Install the supplied SQL in Supabase, then give the GitHub build the project's **public URL and publishable key**.

This is an editable live-deployment package, not an already deployed site. Local tests passed; your hosted Supabase project, GitHub workflow and campus devices still need their first rehearsal. The workflow checks the SQL in a disposable PostgreSQL database before publishing; that job has not been run in your account yet.

## 1. Create the Supabase backend — already done for zero-sum

Create a **dedicated Supabase project**. Keep the database password private.

In **Authentication**, enable **Anonymous Sign-Ins** for students. They will enter only an alias and Micro/Macro; no student email/password is requested. Leave sign-ups enabled.

Open **SQL Editor → New query**. Paste the entire `supabase/INSTALL.sql` file and run it once. It installs the schema, security rules, API functions, Realtime signals and independent one-second room clock in one transaction. Do not add the `penalty_private` schema to exposed Data API schemas and do not publish its tables to Realtime.

Wait a few seconds, then run `supabase/CHECK-BACKEND.sql`. Expect API version **3**, `clock_healthy = true`, an active `penalty-room-clock` job, and successful recent runs. A test room can be inspected without a running clock, but starting/resuming a **teaching room is blocked** when the clock is unhealthy. Supabase's Cron interface is under Integrations → Cron. See [Cron quickstart](https://supabase.com/docs/guides/cron/quickstart).

**Already installed v2?** Back up/export existing data, pause/end sessions, and run only `supabase/UPGRADE-v2-to-v3.sql`. Do not run the fresh installer over v2. The upgrade preserves records and the matrix. These scripts do not upgrade the older GOAT-branded schema.

## 2. Create your instructor account

Under **Authentication → Users**, create an email/password user with email confirmed. This is a user **inside this project**, distinct from the account used to log into the Supabase dashboard.

Open `supabase/ADD-INSTRUCTOR.sql` in SQL Editor, replace `YOUR_INSTRUCTOR_EMAIL` there with that user's email, and run it. This grants the host role only to that confirmed non-anonymous account. No password goes into SQL or GitHub. The room code never grants host privileges.

## 3. Raise the anonymous sign-in limit before shared-Wi-Fi rehearsal

The default **30/hour/IP** quota limits *new anonymous sign-ins*, not total accounts, room membership or simultaneous players. A classroom can share one public IP.

Open **Authentication → Rate Limits**, find **Anonymous sign-ins** / **Anonymous users**, raise it and save. As planning headroom, a class of around 150 students could use **500 per hour per IP**, allowing for new devices and rehearsal accounts. This is a suggested sign-in budget, **not a tested game capacity**. Existing persisted sessions do not create another account on each refresh. Avoid asking students to clear browser data.

The documented anonymous burst bucket equals the configured hourly quota; it is not independently fixed at 30. Other authentication limits, including token refresh, are separate. Do not change the email/SMS quota by mistake. See [current Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

Also check your project's **Realtime connection and message limits**. The documentation currently lists Free at 200 concurrent connections / 100 messages per second, and Pro at 500 / 500. Multiple tabs use connections; a synchronized classroom can create bursts. Raising the sign-in quota does not increase these limits or prove sufficient database/network capacity. Check your actual project and rehearse simultaneous arrival. See [Realtime limits](https://supabase.com/docs/guides/realtime/limits).

Keep abuse protection: set up a Cloudflare **Turnstile** widget for your eventual Pages hostname (for example, `YOUR_GITHUB_USERNAME.github.io`, without a repository path). In Supabase, enable CAPTCHA under Authentication / Bot and Abuse Protection, select Turnstile, and save its **secret key there**. The **public site key** goes into GitHub in step 4. Both student and instructor forms support it. See [Supabase CAPTCHA setup](https://supabase.com/docs/guides/auth/auth-captcha).

After the class, return temporarily enlarged quotas to your usual settings. `docs/rate-limits.md` has an optional private-terminal Management API method.

## 4. Upload the repository to GitHub

Create an empty repository, for example `ec487-penalty-lab`. Unzip the delivery and upload/commit its **contents at the repository root**, not the ZIP itself and not a parent folder. The root should contain `package.json`, `site-config.json`, `src/`, `supabase/` and the hidden `.github/` folder. GitHub Desktop or Git can include that hidden folder reliably. On Windows enable hidden items when necessary; confirm `.github/workflows/pages.yml` appears in GitHub after upload.

For this zero-sum package, the project URL, publishable key and default room are already in `site-config.json`; the supplied workflow uses them when the corresponding GitHub variables are absent or empty. You do not need to copy those values again. Add the public Turnstile site key when you enable CAPTCHA. Nonempty variables below override the file, so remove any old values that point to another project.

Optional overrides under **Settings → Secrets and variables → Actions → Variables**:

| Name | Value |
|---|---|
| `PENALTY_SUPABASE_URL` | Project origin, e.g. `https://YOUR_PROJECT_REF.supabase.co` |
| `PENALTY_SUPABASE_PUBLISHABLE_KEY` | The project's `sb_publishable_…` key |
| `PENALTY_TURNSTILE_SITE_KEY` | Public Turnstile site key, when CAPTCHA is enabled |
| `PENALTY_DEFAULT_ROOM` | `EC487`, or a 4–8-character uppercase/digit code |

The URL and publishable key are available from the Supabase project Connect/API Keys controls. A legacy **anon** key also works; never use `service_role` or `sb_secret_…`. Public configuration is visible to browsers even when entered as a GitHub secret. [Supabase explains the key distinction here](https://supabase.com/docs/guides/getting-started/api-keys).

Leave `PENALTY_MODE` unset (the workflow defaults to `supabase`), or explicitly set it to `supabase`. Do not use `practice` for the classroom. Alternatively, edit the same public values in `site-config.json`; nonempty GitHub variables override that file.

In **Settings → Pages**, choose **GitHub Actions** as the build source. In **Actions**, open **Verify and deploy Penalty Lab** and choose **Run workflow** on `main`. A first automatic run before variables were added may have failed; rerun it after configuration. The workflow runs unit/HTTP tests and an independent PostgreSQL SQL/security test, then builds and publishes. Do not disable a failing test to force publication; inspect its log.

No Node server, service-role key or Supabase management token is deployed to Pages. All paths are relative and routing uses URL fragments. See [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## 5. Open a live rehearsal room

Use the **actual Pages URL** shown by GitHub after deployment. The following is only its usual shape:

```text
https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY/
```

In Supabase Authentication → URL Configuration, set the Site URL to your actual Pages base URL. The game's anonymous and password flows do not require an email redirect, but this keeps the project configuration consistent. Add the corresponding allowed redirect URL when using an email-confirmation/recovery flow outside this game.

On the game, open **Instructor's room**, sign in with the account from step 2, select **Test rehearsal**, and **Create a new room** with code `TEST01`. Run **Check backend**. The host screen generates the real join link and QR code.

Open the join link on two different devices or independent browser profiles. Two ordinary tabs in the same profile deliberately reuse one student identity. Join with different usernames and preferences. You should see those usernames as opponents after the host presses **Start play**. Test one full 12-penalty game, including six of each role; the result should agree on both devices. Tick the sound opt-in or tap the speaker. Try a timeout, backgrounding, refresh, and rejoining the same room without clearing storage. Try an odd-numbered group and a late arrival.

Read `docs/instructor-run-sheet.md` for the same-network rehearsal. Vibration is supported only where the browser/device exposes it; it cannot be promised on every phone. Unsupported devices have a disabled haptics control. Reduced motion suppresses haptic pulses; sound remains independently controllable. See [MDN's vibration limitations](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate).

## 6. Run the class in a fresh teaching room

After rehearsal, end `TEST01`. Click **Open or create another room**, then create a **new** room, select **Teaching room**, and use code `EC487` or another unused code. Display the generated join QR/link, check arrivals, then start. The default room setting does **not** create a room by itself.

Start/resume, pause matching, open/close entry, benchmark visibility and CSV export are in the host screen. Pausing does not stop already-started decision clocks. Closing entry does not remove admitted players. The signed-in host can open **Statistics** directly without entering the matching pool. Return to **Instructor’s room** for the controls. Do not share host credentials.

At the end, end the session and export its audit CSV. Keep test and teaching rooms separate. Never create bots or invent results to finish an unmatched student's record. Check `docs/test-report.md` for exactly what has and has not been verified in this package.
