# Product Notes — Baseline Video (Coach-first)

These notes are written from the perspective of a baseball coach using Baseline Video daily: fast, calm, and focused on “what do I need to do right now?”

## Principles (coach reality)
- Coaches operate in short windows (between reps, before practice, after games).
- The product must reduce friction: fewer taps, fewer decisions, strong defaults.
- Everything should ladder into: **Upload → Review → Timestamped feedback → Player action**.
- Avoid “social” features; keep it a focused coaching tool.

---

## 50 improvements (issue + action plan)

### 1) Quick Upload (1-tap defaults)
- **Issue**: Upload flow asks for too much; slows practice-day usage.
- **Action plan**: Add “Quick Upload” mode: title optional, category defaults to last used, auto-navigate to detail after upload.

### 2) Better default title templates
- **Issue**: Titles are inconsistent; scanning a feed is hard.
- **Action plan**: Provide templates: `Player - Drill - Date` with auto-suggestions (player name + category + today).

### 3) Batch uploads (practice days)
- **Issue**: Coaches record multiple clips; one-by-one upload is painful.
- **Action plan**: Multi-select upload queue with per-file status, retry, and optional bulk category assignment.

### 4) Coach uploads assigned to a player
- **Issue**: Coaches upload for players; current model treats uploader as owner.
- **Action plan**: Coach upload UI adds “Player” selection; DB supports `owner_user_id` separate from `uploader_user_id`; update RLS insert policy for coaches.

### 5) “Today’s session” view
- **Issue**: Coaches think in sessions, not endless lists.
- **Action plan**: Add time-range filters: Today / Last 7 days / Custom.

### 6) Pin key reference videos
- **Issue**: “Important” clips get buried quickly.
- **Action plan**: Add `pinned` flag (coach-only) and show pinned section at top of player page/feed.

### 7) Dashboard triage: “Needs feedback”
- **Issue**: Coaches need to know what’s awaiting their attention.
- **Action plan**: Dashboard cards: videos with no coach comments, newest uploads, and oldest pending.

### 8) Unread indicators
- **Issue**: Coaches miss new player uploads/comments.
- **Action plan**: Track per-user `last_seen_at` per video; show unread badges; “Mark all read.”

### 9) Comment templates (coach shorthand)
- **Issue**: Coaches repeat cues constantly.
- **Action plan**: Saved snippets + quick insert in comment box (e.g., “Stay through it”, “Load earlier”).

### 10) Timestamp capture from playback
- **Issue**: Typing seconds is friction.
- **Action plan**: Add “Use current time” button that reads `video.currentTime` into timestamp input.

### 11) Click-to-seek timestamps
- **Issue**: Timestamp comments aren’t actionable unless they jump playback.
- **Action plan**: Make `@12s` clickable to seek in player.

### 12) Threaded replies (lightweight)
- **Issue**: Back-and-forth gets messy.
- **Action plan**: Add `parent_comment_id` for one-level threading; keep UI minimal.

### 13) Coach “Action Items”
- **Issue**: Feedback needs to translate to a next rep.
- **Action plan**: Add action-item comments with optional due date; player can mark “done.”

### 14) Mechanics tags (structured feedback)
- **Issue**: “Good swing” isn’t trackable.
- **Action plan**: Tag comments/videos with mechanics areas (timing, load, hands, hips, posture).

### 15) Player goals
- **Issue**: Coaching is goal-driven.
- **Action plan**: Player profile stores 1–3 active goals; show on player page and coach dashboard.

### 16) Side-by-side compare
- **Issue**: Coaches teach by comparison.
- **Action plan**: Select two videos → split view playback with synced scrub.

### 17) Slow-mo + frame step
- **Issue**: Mechanics require slow review.
- **Action plan**: Playback rates (0.25x/0.5x) + frame-step where supported.

### 18) Clip highlights
- **Issue**: Coaches often want the “one rep” as a shareable highlight.
- **Action plan**: Add clip start/end that creates a “segment” record; later: export/share.

### 19) Camera angle tagging
- **Issue**: Angle matters for mechanical diagnosis.
- **Action plan**: Add `angle` enum (side/front/behind/other) + filter.

### 20) Drill tagging
- **Issue**: Tee vs front toss vs live AB changes feedback.
- **Action plan**: Add drill tags (tee/front toss/machine/live) + custom tags.

### 21) Coach library (team-wide references)
- **Issue**: Coaches want model swings/drills available to everyone.
- **Action plan**: Add “Coach Library” videos visible to all team members; separate feed section.

### 22) Player private notes
- **Issue**: Players want self-notes not visible to coach sometimes.
- **Action plan**: Add “Private note” comment type visible only to author.

### 23) Coach internal notes
- **Issue**: Coaches keep scouting notes not for players.
- **Action plan**: Add “Coach-only note” visibility.

### 24) Better access code UX
- **Issue**: Codes are error-prone.
- **Action plan**: After code entry, show team name + coach name before final signup.

### 25) Access code rotation with audit
- **Issue**: Codes leak; coaches need control.
- **Action plan**: Show last rotated time; confirm rotation; optional expiry.

### 26) Invite links (optional upgrade)
- **Issue**: Codes are awkward in text messages.
- **Action plan**: Create invite tokens with link; click-to-join with signup.

### 27) Role-safe navigation
- **Issue**: Players shouldn’t stumble into coach pages.
- **Action plan**: Centralize nav by role; server guard on coach routes.

### 28) First-class onboarding route
- **Issue**: “Signed in but no profile” creates odd loops.
- **Action plan**: Dedicated `/onboarding` and middleware logic: `user && !profile → /onboarding`.

### 29) Mobile-first upload ergonomics
- **Issue**: Most uploads happen on phones.
- **Action plan**: Larger tap targets, sticky bottom CTA, progress UI, “keep screen awake” hint.

### 30) Upload progress + retry
- **Issue**: Upload failures feel random.
- **Action plan**: Show progress, retries, and clear failure message with action.

### 31) Size limit + trimming guidance
- **Issue**: Long videos kill upload success.
- **Action plan**: Enforce max size/duration with friendly “trim in Photos” guidance.

### 32) Retention policy (cost control)
- **Issue**: Storage costs can balloon.
- **Action plan**: Coach settings: auto-archive/delete after N days; export before delete.

### 33) Better playback for weak networks
- **Issue**: Fields have poor connectivity.
- **Action plan**: Next: transcode and adaptive streaming; short-term: upload guidance + caching.

### 34) “Last coach feedback” on player home
- **Issue**: Players need one clear next step.
- **Action plan**: Show last coach comment + link to timestamp.

### 35) “Do this next” section for players
- **Issue**: Players need structure.
- **Action plan**: Show active goals + action items + most recent upload status.

### 36) Coach workload view
- **Issue**: Coaches need to manage time and volume.
- **Action plan**: Dashboard metric: “X videos awaiting coach review.”

### 37) Quick comment from feed (coach)
- **Issue**: Opening every video is too slow.
- **Action plan**: Inline “quick comment” on feed card; timestamp optional.

### 38) Sort by “Last activity”
- **Issue**: Coaches care about what’s active now.
- **Action plan**: Add sort: last comment/last upload.

### 39) Search
- **Issue**: Coaches remember “that cage session last month.”
- **Action plan**: Search by player + title + tags + date range.

### 40) Roster management
- **Issue**: Players leave teams; coaches need control.
- **Action plan**: Coach can deactivate/remove player; decide on video retention semantics.

### 41) Team settings screen
- **Issue**: Rotation, retention, invites, and defaults need a home.
- **Action plan**: Coach-only settings page; confirmations for destructive actions.

### 42) Audit trail (trust)
- **Issue**: “Who deleted that video?”
- **Action plan**: Add `events` table logging deletes/edits; coach-only view.

### 43) Soft deletes (undo window)
- **Issue**: Accidental deletes happen.
- **Action plan**: Implement `deleted_at` for videos/comments; restore within 7 days; periodic cleanup.

### 44) Production-grade error UX
- **Issue**: “500” is unusable for coaches.
- **Action plan**: Standard error component; show next steps; log correlation IDs.

### 45) Automated permission tests
- **Issue**: RLS mistakes are catastrophic.
- **Action plan**: Add automated tests verifying coach/team visibility and player-only visibility (including deletes).

### 46) Visibility badges
- **Issue**: Players need confidence in privacy.
- **Action plan**: Show “Visible to: You + Coach” on player videos; coach sees “Team visible.”

### 47) Focused coach-to-player messages (minimal)
- **Issue**: Sometimes you need a short “do this today” note.
- **Action plan**: Minimal team message feature; no feed/likes; optional notifications later.

### 48) Low-noise notifications
- **Issue**: Coaches want alerts, not spam.
- **Action plan**: Email digest options: immediate vs daily; upload notifications for coach only.

### 49) On-field mode
- **Issue**: One-handed operation during practice.
- **Action plan**: “On-field” UI: simplified screens, big buttons, minimal navigation.

### 50) Baseline assessment workflow
- **Issue**: Coaches often run initial assessment sessions.
- **Action plan**: Create an assessment checklist per player (required angles, required drills) with a completion view.



