# Outside Audit Action Plan

Goal: Bring Baseline Video to 10/10 across Coach, UI/UX, and VC perspectives.

Note: Payment integration deferred until pre-launch.

---

## Priority 1: Critical Blockers (Must fix before any user testing)

### 1.1 Parent Access Model

**Problem:** 80% of youth sports clients are managed by parents. No parent login = dead on arrival.

**Implementation:**
1. Add `parent` role to profiles table (alongside `coach`, `player`)
2. Create `parent_player_links` table:
   ```sql
   id, parent_user_id, player_user_id, access_level ('view_only', 'full'), created_at
   ```
3. Parents can:
   - View all videos for their linked player(s)
   - See lesson schedule and history
   - Request/cancel lessons on behalf of player
   - Receive notifications for new coach feedback
4. Parents cannot:
   - Upload videos (unless `full` access)
   - Access other players' content
   - Modify coach settings
5. Coach can invite parents via email or link
6. Parent can link to multiple children (families with multiple athletes)
7. UI: Parent dashboard shows all linked children with quick-switch

**Files to modify:**
- `supabase/migrations/` - new migration for parent role and links table
- `lib/auth/profile.ts` - handle parent role
- `middleware.ts` - route guards for parent role
- Create `app/(app)/app/parent/` - parent dashboard
- Create `app/api/team/parents/` - parent invite and link APIs
- Modify `DrawerNav.tsx`, `BottomNav.tsx` - parent-specific nav

### 1.2 Mobile-First Video Upload

**Problem:** Current upload requires logging into web app. Parents will just text videos instead.

**Implementation:**
1. **PWA Share Target API:**
   - Add to `manifest.json`:
     ```json
     "share_target": {
       "action": "/app/upload/share",
       "method": "POST",
       "enctype": "multipart/form-data",
       "params": {
         "files": [{ "name": "video", "accept": ["video/*"] }]
       }
     }
     ```
   - Create `/app/upload/share/route.ts` to handle incoming shares
   - User selects "Baseline Video" from iOS/Android share sheet
   - Video uploads directly, user picks player and category in 2 taps

2. **Streamlined upload flow:**
   - Remove all non-essential fields from upload form
   - Default to "training" category
   - Auto-detect player if only one on roster
   - Show upload progress with large, clear percentage
   - Success: Single "Done" button, no redirect options

3. **iOS optimization:**
   - Test and optimize for Safari PWA
   - Add "Add to Home Screen" prompt after first upload
   - Ensure video compression before upload (client-side)

**Files to modify:**
- `public/manifest.json` - add share_target
- Create `app/(app)/app/upload/share/route.ts` - share handler
- Refactor `app/(app)/app/upload/uploadForm.tsx` - simplify drastically
- Add client-side video compression (use `ffmpeg.wasm` or similar)

### 1.3 Real-Time Notifications

**Problem:** Users don't know when they have new feedback. In-app only = low engagement.

**Implementation:**
1. **Push Notifications (Web Push API):**
   - Create `notifications` table:
     ```sql
     id, user_id, type, title, body, data (jsonb), read_at, created_at
     ```
   - Create `push_subscriptions` table:
     ```sql
     id, user_id, endpoint, p256dh, auth, created_at
     ```
   - Add service worker for push handling
   - Prompt for push permission after first meaningful action

2. **Email Notifications:**
   - Use Supabase Edge Functions or external service (Resend, Postmark)
   - Notification types:
     - New comment on your video
     - Lesson request received (coach)
     - Lesson approved/declined (player)
     - New program assignment
   - User preferences: immediate, daily digest, off

3. **In-App Notification Center:**
   - Bell icon in header with unread count
   - Dropdown with recent notifications
   - Mark as read on view
   - "Mark all read" action

**Files to create:**
- `supabase/migrations/` - notifications and push_subscriptions tables
- `public/sw.js` - service worker for push
- `lib/notifications/` - send functions (push, email)
- `app/api/notifications/` - CRUD routes
- `components/NotificationBell.tsx` - UI component
- `app/(app)/app/notifications/page.tsx` - full notification list

### 1.4 Video Annotation Tools

**Problem:** Coaches can't draw on video frames. This is THE killer feature for sports coaching.

**Implementation:**
1. **Canvas overlay on paused video:**
   - When video paused, show transparent canvas overlay
   - Tools: Freehand draw, straight line, arrow, circle, rectangle, text
   - Colors: Red, yellow, green, blue, white
   - Undo/redo stack
   - Clear all

2. **Save annotations:**
   - Create `video_annotations` table:
     ```sql
     id, video_id, user_id, timestamp_seconds, canvas_data (jsonb), created_at
     ```
   - Save as JSON (paths, shapes, colors)
   - Attach to timestamp in comment

3. **Playback with annotations:**
   - When playing, show annotations at their timestamps
   - Annotations appear for 2-3 seconds, then fade
   - Toggle annotations on/off

4. **Mobile support:**
   - Touch drawing with finger
   - Pinch to zoom while paused
   - Simple tool palette (3-4 tools max on mobile)

**Files to create:**
- `components/VideoAnnotation/` - canvas component, tools, save/load
- `supabase/migrations/` - video_annotations table
- `app/api/videos/[id]/annotations/` - CRUD routes
- Modify `app/(app)/videos/[id]/VideoPlayer.tsx` - integrate canvas

---

## Priority 2: UX Overhaul (Fix before beta users)

### 2.1 Simplify Navigation

**Problem:** 5 navigation patterns competing for attention.

**Implementation:**
1. **Keep:**
   - Bottom nav (mobile) - primary navigation
   - Search command palette (⌘K) - power users

2. **Remove/Consolidate:**
   - Remove drawer nav entirely (hamburger menu)
   - Move drawer items to bottom nav or settings
   - Remove breadcrumbs (use back button instead)
   - Keep Upload FAB but make it contextual (only on pages where upload makes sense)

3. **New nav structure (mobile):**
   - Bottom: Home | Videos | Lessons | Programs | More
   - "More" opens sheet with: Settings, Help, Profile, Sign Out

4. **New nav structure (desktop):**
   - Left sidebar (always visible, not drawer)
   - Compact: icons only, expand on hover
   - Or: top horizontal nav bar

**Files to modify:**
- Delete `app/(app)/DrawerNav.tsx`
- Refactor `app/(app)/BottomNav.tsx` - add "More" sheet
- Refactor `app/(app)/layout.tsx` - remove drawer
- Create `components/MoreSheet.tsx` - settings/profile sheet
- Update `app/globals.css` - remove drawer styles

### 2.2 Calendly-Style Lesson Booking

**Problem:** Current flow is player requests → coach approves. Should be coach sets availability → player books.

**Implementation:**
1. **Coach availability settings:**
   - Weekly recurring availability (e.g., Tue/Thu 3-7pm)
   - Exception dates (block specific dates)
   - Lesson duration options (30, 45, 60 min)
   - Buffer time between lessons
   - Max lessons per day

2. **Player booking flow:**
   - See coach's available slots on calendar
   - Click slot → confirm booking
   - No approval needed for open slots
   - Coach can still block/cancel if needed

3. **Keep request flow as backup:**
   - If player wants time outside availability, they can still request
   - Coach approves/declines as before

**Files to modify:**
- Modify `app/(app)/app/settings/schedule/` - availability settings
- Modify `app/(app)/app/lessons/` - show available slots
- Create `app/api/lessons/availability/` - get available slots
- Modify RPCs - auto-approve bookings in available slots

### 2.3 Onboarding Flow

**Problem:** No documented first-time experience. This makes or breaks adoption.

**Implementation:**
1. **Coach onboarding (after signup):**
   - Step 1: "Welcome! Let's set up your coaching business"
   - Step 2: Set availability (Calendly-style)
   - Step 3: Upload first instruction video (optional)
   - Step 4: Invite your first player
   - Show progress bar, allow skip

2. **Player onboarding (after joining via invite):**
   - Step 1: "Welcome to [Coach Name]'s team!"
   - Step 2: Upload your first video
   - Step 3: Enable notifications
   - Quick, 3 screens max

3. **Parent onboarding:**
   - Step 1: "You're connected to [Player Name]"
   - Step 2: Quick tour of what you can see/do
   - Step 3: Enable notifications

**Files to create:**
- `app/(app)/app/onboarding/` - onboarding flow pages
- `components/OnboardingStep.tsx` - reusable step component
- Add `onboarding_completed` flag to profiles table
- Check flag in dashboard, redirect if not completed

### 2.4 Simplify Comment Visibility

**Problem:** `public`, `coach_only`, `private` adds cognitive load.

**Implementation:**
1. **Reduce to 2 options:**
   - "Visible to player" (default) - player and coach see it
   - "Coach notes" - only coach sees it

2. **Remove `private` option entirely** - when would a coach make a note only they can see? Just use a notes app.

3. **Update UI:**
   - Simple toggle: "Share with player" (on by default)
   - When off, show subtle "Only you will see this" indicator

**Files to modify:**
- `supabase/migrations/` - simplify visibility enum
- `app/(app)/videos/[id]/CommentForm.tsx` - simplify toggle
- `app/api/videos/[id]/comments/` - update logic

### 2.5 Mobile-First Side-by-Side Comparison

**Problem:** Side-by-side is mentioned but not detailed for mobile.

**Implementation:**
1. **Mobile UX:**
   - Stacked view (video 1 on top, video 2 below)
   - Synced playback (play one, both play)
   - Swipe to swap positions
   - Pinch to zoom individual video

2. **Desktop UX:**
   - True side-by-side
   - Adjustable split position
   - Synced or independent playback toggle

3. **Quick compare from video list:**
   - Long-press video → "Compare with..."
   - Select second video → opens compare view

**Files to modify:**
- Create `app/(app)/videos/compare/page.tsx` - compare view
- Add compare action to video list items
- Create `components/VideoCompare.tsx` - comparison component

---

## Priority 3: Technical Improvements

### 3.1 Video Compression Pipeline

**Problem:** Raw video uploads will kill storage costs and load times.

**Implementation:**
1. **Client-side compression before upload:**
   - Use `ffmpeg.wasm` to compress in browser
   - Target: 720p max, reasonable bitrate
   - Show compression progress
   - Fallback to server-side if client fails

2. **Server-side processing:**
   - Use Supabase Edge Functions or external service (Mux, Cloudflare Stream)
   - Generate thumbnail at 2-second mark
   - Generate HLS/DASH for adaptive streaming
   - Store original + processed versions

3. **CDN for video delivery:**
   - Use Cloudflare or similar CDN in front of Supabase Storage
   - Or migrate to dedicated video hosting (Mux, Cloudflare Stream)

**Files to create:**
- `lib/video/compress.ts` - client-side compression
- `supabase/functions/process-video/` - server-side processing
- Add `thumbnail_url`, `processed_url` columns to videos table

### 3.2 Real-Time Updates

**Problem:** Comments don't appear in real-time.

**Implementation:**
1. **Supabase Realtime subscriptions:**
   - Subscribe to comments table for current video
   - New comment appears immediately for all viewers
   - Optimistic UI for comment poster

2. **Presence indicators:**
   - Show who's currently viewing a video
   - "Coach is typing..." indicator

**Files to modify:**
- `app/(app)/videos/[id]/VideoClient.tsx` - add realtime subscription
- Create `lib/realtime/` - subscription helpers

### 3.3 Google Calendar Sync

**Problem:** Coaches use Google Calendar. No sync = manual double-entry.

**Implementation:**
1. **OAuth integration:**
   - Google OAuth for calendar access
   - Store refresh tokens securely
   - Sync coach's lessons to Google Calendar
   - Two-way: changes in Google reflect in app

2. **Apple Calendar (ICS):**
   - Generate ICS subscription URL
   - Read-only for now
   - Updates every 15 minutes

**Files to create:**
- `app/api/integrations/google/` - OAuth flow
- `lib/calendar/google.ts` - sync logic
- `app/api/calendar/ics/` - ICS feed generation
- Add calendar settings to coach settings page

---

## Priority 4: Feature Simplification (Remove complexity)

### 4.1 Remove or Hide Admin Dashboard Complexity

**Problem:** Cohort heatmaps and device analytics are overkill for target users.

**Implementation:**
1. **Keep simple metrics visible:**
   - Total videos, lessons, active players
   - This week's activity
   - Recent uploads list

2. **Move complex analytics to `/app/admin/advanced` (hidden):**
   - Cohort retention (for internal use)
   - Device/browser breakdown (for debugging)
   - Keep building but don't show to regular admins

3. **Or remove entirely** if not needed for internal decision-making

### 4.2 Simplify Program Builder

**Problem:** 52-week programs are overkill. Most coaches do 4-8 week plans.

**Implementation:**
1. **Default templates:**
   - 4-week, 6-week, 8-week presets
   - Custom length (max 12 weeks for now)

2. **Remove 52-week option** from UI

3. **Focus on simplicity:**
   - Weekly view instead of daily
   - Drag-and-drop drills into weeks
   - Quick duplicate week

### 4.3 Increase Lesson Participant Limit

**Problem:** 2-on-1 is too limiting. Coaches run 3-4 player clinics.

**Implementation:**
1. Change lesson model to support 1-6 participants
2. Update `lesson_participants` constraints
3. Update UI to allow adding more players
4. Consider "clinic" vs "private lesson" distinction

---

## Priority 5: GTM and Positioning (For VC concerns)

### 5.1 Pick One Sport

**Decision:** Focus on **baseball** (hitting coaches specifically).

**Why:**
- Large market, passionate parents, video-heavy sport
- Clear use case: swing analysis
- "Baseline" name already fits

**Implementation:**
- Landing page copy: baseball-focused
- Demo videos: baseball content
- Case studies: baseball coaches
- Feature prioritization: swing comparison

### 5.2 Define Clear Wedge

**Wedge:** "The only platform where parents and players both have access."

**Positioning:**
- CoachNow: Coach and player only
- Baseline: Coach, player, AND parents
- Parents = the decision makers and payers

### 5.3 Build Viral Loop

**Implementation:**
1. **Player referral:**
   - "Invite a teammate" button
   - When teammate joins, both get badge/reward
   - Teammate's coach can also discover the platform

2. **Coach referral:**
   - "Refer a coach" → both get 1 month free (when payments launch)
   - Track referral source

3. **Social sharing:**
   - "Share progress video" to Instagram/Twitter
   - Watermark with Baseline logo
   - Link back to public profile

---

## Execution Order

**Phase 1: Core Fixes (Weeks 1-3)**
1. Parent access model
2. Simplify navigation
3. Mobile-first upload (share target)
4. Basic push notifications

**Phase 2: Killer Features (Weeks 4-6)**
5. Video annotation tools
6. Calendly-style booking
7. Onboarding flows
8. Side-by-side comparison

**Phase 3: Technical Polish (Weeks 7-8)**
9. Video compression
10. Real-time updates
11. Google Calendar sync

**Phase 4: Simplification (Week 9)**
12. Remove admin complexity
13. Simplify programs
14. Increase lesson limit

**Phase 5: GTM Prep (Week 10)**
15. Baseball-focused positioning
16. Viral loop mechanics
17. Referral system

---

## Success Metrics (Post-Implementation)

**Coach Score Target: 9/10**
- Parent access: ✓
- Simple booking: ✓
- Video annotations: ✓
- Notifications: ✓
- (Payments: deferred)

**UI/UX Score Target: 9/10**
- Mobile-first: ✓
- Simple nav: ✓
- Onboarding: ✓
- Real-time: ✓
- Annotation tools: ✓

**VC Score Target: 8/10**
- Clear wedge (parent access): ✓
- Viral loop: ✓
- Focused positioning: ✓
- (Needs traction data for 10/10)

---

## Files Quick Reference

**New files to create:**
- `app/(app)/app/parent/` - parent dashboard
- `app/api/team/parents/` - parent APIs
- `app/(app)/app/upload/share/` - share target handler
- `components/NotificationBell.tsx`
- `components/VideoAnnotation/`
- `app/(app)/app/onboarding/`
- `components/MoreSheet.tsx`
- `app/(app)/videos/compare/`
- `lib/video/compress.ts`
- `lib/notifications/`
- `lib/calendar/`

**Files to heavily modify:**
- `app/(app)/layout.tsx` - remove drawer
- `app/(app)/BottomNav.tsx` - add More sheet
- `app/(app)/app/upload/uploadForm.tsx` - simplify
- `app/(app)/videos/[id]/` - annotations, realtime
- `app/(app)/app/lessons/` - availability booking
- `public/manifest.json` - share target

**Files to delete:**
- `app/(app)/DrawerNav.tsx`
- Complex admin pages (or move to /advanced)

