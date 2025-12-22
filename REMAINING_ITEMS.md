# Remaining Items — Baseline Video

This file lists **everything still outstanding** (not fully implemented) after the recent sprint work. It’s organized for coach-first shipping: high leverage first, complexity later.

## Legend
- **[ ] Not started**
- **[~] Partially implemented / MVP**
- **[x] Implemented** (included only when helpful for context)

---

## A) Items from your requested list (still remaining / incomplete)

These correspond to the numbered items you asked to implement:  
`1,2,3,4,6,8,10,11,16,21,22,23,24,26,27,28,29,30,36,38,40,41,42,43,44,45,46,48,49`

### Upload speed + coach workflow
- **[~] (1) Quick Upload**: quick mode exists, but needs “single-tap” flow on mobile (sticky CTA, fewer fields shown).
- **[~] (2) Title templates**: template exists; add drill/angle tags to auto-compose stronger titles.
- **[~] (3) Batch uploads**: queue exists; add parallel upload (2–3 at a time), retry per file, and progress % per item.
- **[~] (4) Coach uploads assigned to player**: UI + API support exists; ensure DB RLS policy is applied and add coach “upload for player” defaults on player page.
- **[~] (6) Pin videos**: pinned flag + UI exist; add pinned ordering in coach player pages and pin list for coach across players.
- **[~] (29) Mobile-first upload ergonomics**: improved, but needs a bottom sticky upload button, stronger touch spacing, and camera-first flows.
- **[~] (30) Upload progress + retry**: queue status exists; missing progress % (XHR progress) and resilient retries.

### Feedback + review workflow
- **[~] (8) Unread indicators**: “NEW since last seen” exists, but **true unread** per video/comment not implemented.
- **[x] (10) Timestamp capture**: “Use current time” exists.
- **[x] (11) Click-to-seek timestamps**: `#t=seconds` seek exists.
- **[~] (16) Side-by-side compare**: compare exists; needs sync scrub/play and “compare this video” friction-free workflow.
- **[~] (21) Coach library**: exists as a flag; needs dedicated library section/page + coach curation UX.
- **[ ] (22) Player private notes**: comment visibility type not implemented.
- **[ ] (23) Coach internal notes**: comment visibility type not implemented.
- **[~] (36) Coach workload view**: “Needs feedback” exists; add “awaiting coach comment” count per player + oldest pending queue.
- **[x] (38) Sort by last activity**: `last_activity_at` exists (requires DB migration applied).

### Access / onboarding / navigation
- **[x] (24) Better access code UX**: team preview exists on player sign-up; refine copy + handle invalid code states gracefully.
- **[x] (26) Invite links**: invite link generation + `/join/[token]` exists (requires DB migration applied).
- **[~] (27) Role-safe navigation**: nav is role-aware, but still needs stricter “server guard” + fewer coach-only links visible to players.
- **[ ] (28) First-class onboarding route**: still missing `/onboarding` flow for signed-in users with no profile.

### Team admin + safety
- **[~] (40) Roster management**: deactivate/reactivate exists; still missing remove player, transfer ownership, and “inactive cannot access” enforcement in middleware.
- **[~] (41) Team settings screen**: page exists; still missing retention, defaults, code rotation info, invite management list.
- **[~] (42) Audit trail**: events + audit page exist; expand events coverage and include actor names + metadata.
- **[ ] (43) Soft deletes + restore**: still missing (undo window, trash view, restore actions).
- **[~] (44) Production-grade error UX**: improved some API messaging; still missing consistent error component + correlation IDs.
- **[ ] (45) Automated permission tests**: not implemented.
- **[x] (46) Visibility badges**: basic “Visible to …” exists on video detail; add badges on feed cards and library.
- **[ ] (48) Notifications**: not implemented (email digest / upload pings).
- **[~] (49) On-field mode**: field mode exists; expand for one-handed workflows and coach “triage” in field mode.

---

## B) Additional high-leverage coach-first roadmap (not yet implemented)

### Coaching structure
- **[ ] Player goals**: 1–3 active goals per player, surfaced on player page + dashboard.
- **[ ] Coach action items**: comment type with “done” toggle + due date.
- **[ ] Mechanics tags**: simple tag set to structure coaching (timing/load/hands/hips/posture).
- **[ ] Drill + angle metadata**: tee/front toss/live; side/front/behind; filter + default on upload.

### Playback + analysis
- **[ ] Compare v2**: sync play/pause/seek, quick “compare against” button, timestamp hopping across both.
- **[ ] Slow motion**: playback rates + frame-step (where supported).
- **[ ] Clip highlights**: pick start/end; store “segment” without reuploading.

### Feed + triage
- **[ ] True unread**: per-video last_seen and per-comment seen state; coach “unread queue”.
- **[ ] “No coach comments yet”**: explicit query and dashboard section; not just “no comments”.
- **[ ] Search**: player/title/tags/date range.

### Team management
- **[ ] Remove player**: remove access while optionally preserving videos.
- **[ ] Transfer team ownership**: coach handoff.
- **[ ] Invite management**: list active invites, revoke, expiry, usage counts.

### Reliability + cost control
- **[ ] Retention policy**: auto-archive/delete after N days, coach configurable.
- **[ ] Storage transcoding/streaming**: optional later; for now “upload limits + guidance”.
- **[ ] Upload size limits + clearer errors**: preflight checks and friendly guidance.

### Privacy & trust
- **[ ] Soft delete + audit restore**: trash + restore window, audit logs for restore.
- **[ ] Fine-grained visibility**: library videos, private notes, coach notes.

### Notifications
- **[ ] Email digest**: coach daily digest (players uploaded) + configurable frequency.
- **[ ] Minimal in-app notifications**: queue + badge counts.

---

## C) DB migrations required (apply in Supabase SQL Editor)
- `supabase/migrations/0006_hotfix_names_and_deletes.sql`: first/last names, deletes, safe profile update.
- `supabase/migrations/0007_fast_wins_coach_features.sql`: pinned/library + last_seen + access code preview + coach-assigned upload RLS updates.
- `supabase/migrations/0008_sprint2_invites_events_activity_roster.sql`: invites, events, last_activity, roster deactivation.

---

## D) Recommended next shipping order (coach-first)
1. **Soft deletes + restore** (prevents trust-killing mistakes).
2. **True unread + Needs feedback** (coach triage becomes the home base).
3. **Goals + action items** (turn feedback into reps).
4. **Compare v2 + slow-mo** (actual mechanics coaching).
5. **Tags + search** (scale to teams).
6. **Notifications** (only after triage is solid).



