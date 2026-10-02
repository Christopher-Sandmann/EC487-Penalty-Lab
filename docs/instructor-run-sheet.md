# Instructor run sheet · live v0.3

## Before the lecture — on the actual campus Wi-Fi

Use a test room, not the eventual teaching room. Confirm Pages serves the Supabase build rather than the standalone practice document. Run **Check backend**: API 3 and server clock running. Check saved anonymous-sign-in and Realtime limits and Turnstile hostname/keys.

Join simultaneously from several independent devices/profiles on the same public network, approaching the expected cohort size where possible. Watch Supabase Auth/Realtime logs for 429s and quota errors. An account reusing its saved session does not test a first-time anonymous signup. Do not reset active students' browser storage to perform this test.

Play a complete game on desktop, Android Chrome and iOS Safari. Confirm genuine opponent aliases, both probabilities/roles, four matrix cells, agreement on outcomes, six kicks/six keeps, and the twelve feedback texts. Test an odd-sized pool and a late arrival. There are no bots or byes in live rooms.

Tick sound opt-in; hear countdown, kick, crowd celebration and post/save cues. Mute during a celebration and check that sound stops. Test vibration only on supported hardware with device vibration enabled and reduced motion off. A disabled haptics control is expected on unsupported browsers; no physical haptic behaviour is certified by the automated tests.

For privacy and failure recovery: one player submits; confirm the other's screen/API cannot reveal their side yet. Leave a partner silent until timeout: no draw/count and the responsive player is available for a different opponent. Background a phone; return/refresh; reopen in the same profile; verify the same identity, counts and result. Two ordinary tabs should be one player, not two participants. Do not use new incognito windows as a recovery instruction.

To verify the **independent** clock, create a test match, let one participant submit, then stop all client traffic. After its deadline, use the host/database check to confirm cancellation with zero draw count. A browser countdown by itself is not this test.

## In the room

Create a fresh **Teaching room** with an unused code. Project its generated QR/link; keep instructor credentials private. Explain: ungraded, aliases only; Micro left/Macro right; N is the striker's natural side even when you keep. Both players dismiss the reminder, then have twelve seconds. A miss counts as a goalkeeper win. Continue after reading each text box.

Check arrivals, then press **Start play**. No common rounds are required. Close entry separately when appropriate. Pause stops new matching, not live clocks. Use Statistics for the question “Are statistical frequencies distinct from predicted play?” and retain the method/missing-data qualifications.

If an individual has trouble, ask them to return to the same browser/profile and keep storage. If many cannot join, check Auth logs/quota/CAPTCHA before telling them to retry. If the clock is unhealthy, stop teaching play and inspect Cron; do not substitute simulated results. Some students can legitimately finish fewer than twelve penalties if partners leave or time runs out.

## Afterwards

End the room, export the audit CSV, and keep rehearsal observations separate. Restore temporary Auth allowances. Deactivate the dedicated clock between teaching sessions if appropriate, and reactivate/check it before the next class. Record actual rehearsal evidence in `release-checklist.json`; never mark an unperformed check complete.

The signed-in instructor may open the Statistics tab without joining as a player. Use **Open or create another room** in the host dashboard to move from the rehearsal to a fresh teaching room.
