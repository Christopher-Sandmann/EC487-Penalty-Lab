# Architecture and state

## Three distinct modes

`PracticeTransport` runs a local engine in the browser against a labelled simulated partner. Its records live only in the practice namespace and cannot be sent to a classroom room. The standalone HTML embeds all code and content.

`LocalTransport` calls the Node rehearsal server over HTTP and subscribes to safe event notifications. The server is authoritative, persists pseudonymous state, and creates no bots. Independent browser profiles receive independent tokens. The JavaScript process serializes mutation handlers; one engine operation completes before the next begins. This is not a horizontally scaled production service.

`SupabaseTransport` uses anonymous student Auth, authenticated RPCs and safe Realtime notifications. Persistent database state is authoritative. Revised SQL has been supplied but not cloud-executed. GitHub Pages serves the frontend only.

## State machine

Participants progress `lobby → waiting → matched → feedback → waiting/finished`, with `away` for a timed-out participant. An active match progresses `briefing → locked → resolved`, or from briefing/locked to `cancelled`.

A match is assigned before choices and receives a serial number. The briefing records two prepared flags and a 35-second timeout. Both acknowledgements are required; only then does `choiceStartsAt` become non-null and the deadline change to start + 12 seconds. The client also enforces a minimum visible 2.4-second read before acknowledging. Acknowledgements do not contain choices.

Both submissions must arrive strictly before the deadline. The initial choice cannot be replaced; an identical retry succeeds without another draw. After both choices are stored, the server determines the exact matrix cell and draws once. Only then are both directions and the result released. The new `visualOutcome` field is a deterministic decoration of that same draw and direction pair.

The feedback timer starts when the player sees the teaching card, not while a disconnected browser is absent. A retry does not reset it. Completion counts determine the next card (slots 0–11). No separate economist or card-matching sequence exists. Cancelled attempts cannot advance it.

## Local operations and corresponding cloud RPCs

| Local endpoint | Cloud RPC | Function |
|---|---|---|
| `/api/join` | `join_room` | Immutable username/preference registration |
| `/api/snapshot` | `room_snapshot` | Recover own authoritative state |
| `/api/prepare` | `prepare_match` | Finish the scoring reminder |
| `/api/submit` | `submit_choice` | Lock the first private choice |
| `/api/seen` | `feedback_seen` | Begin minimum reading interval |
| `/api/ready` | `ready_player` | Return to matching after feedback |
| `/api/heartbeat` | `player_heartbeat` | Presence without changing strategy |
| `/api/statistics` | `room_statistics` | Safe released data |
| Host routes | `host_create_room`, `host_room_action`, `host_export`, `host_delete_room` | Host-verified administration |

The local server uses a separate instructor bearer secret; a classroom code never grants host authority. Cloud hosts must be actual authenticated, non-anonymous users whitelisted by a database administrator.

## Database and privacy

The fresh `penalty_private` schema contains configuration, hosts, rooms, participants, matches, submissions and diagnostics. RLS is enabled and client roles have no direct private table access. Security-definer RPCs have a fixed empty search path and explicitly verify membership or host authority. Mutations serialize under a room advisory lock. Room-level locking and uniqueness constraints prevent double submissions and repeated results.

Realtime uses `public.room_events` for host-controlled room changes and `public.player_events` for owner-only player updates. Neither contains directions or results. Player signals are coalesced to at most one row update per participant per database transaction; the browser also coalesces bursts. An event tells an authorized client to fetch a safe snapshot; realtime delivery is not itself the source of truth. A room member can read released records, but not the opponent's hidden choice. Even host exports omit directions from still-active attempts.

A one-second Cron sweep cancels expired attempts and seeks feasible pairs independently of browser requests. Local rehearsal uses its own 200 ms server tick. Pause stops new pairings without interrupting an already assigned briefing or choice window. Ending cancels active attempts without fabricating results.

## Matching and statistics

Matching is random within role-feasible candidates, avoiding repeat opponents when feasible and protecting residual no-self-match feasibility. It does not depend on team, performance, paragraph or ranking. Same-team encounters are permitted; an unmatched player waits rather than receiving a bye or fabricated opponent.

Classroom inferential data include only resolved human choices. The original pre-choice attempt order is preserved; unresolved earlier observations buffer later ones, and a cancelled earlier member freezes that stream's inferential prefix. Later valid observations remain descriptive and in the export. See `method.md`.

## Rendering

The Canvas background is cached on resize, DPR is capped at two, and only a few sprites and impact effects move. requestAnimationFrame follows the display clock; geometry is time-based. Each view destroys its old canvas loop and resize observer. Backgrounded pages skip drawing. Reduced-motion shows settled outcomes without the flight and particle animation. Buttons remain HTML controls with keyboard support, focus states and live announcements. No portrait loading, remote font or live AI request sits on the critical path.

## v0.3 live operation

Personal snapshots contain only the viewer's resolved history plus their current match. Full room statistics are fetched only while viewing Statistics, when finished, or at session end, and only after the room version changes. Settled ended rooms stop their automatic requests/socket; unchanged final results are not downloaded repeatedly. Snapshots resynchronize roughly every 3–3.4 seconds as a fallback; heartbeats refresh presence roughly every 8–10 seconds. A socket failure never creates a new student identity. Broadcasts carry only wake-up information; every gameplay decision is read from the persistent authority.

`host_preflight` reports measured API version, database version and clock age. `host_room_action` rejects teaching start/resume unless the independent sweep ran within ten seconds. It does not check Auth quotas, physical devices or capacity.

Web Audio uses locally synthesized noise, crowd glissandos, fanfare and impact tones. Audio unlocks through a gesture and is opt-in. Muting stops scheduled sources; haptics have an independent switch and reduced-motion suppression. The real result remains entirely independent of audio, vibration, animation and local noise randomness.
