# Outside Audit Action Plan

Goal: Bring Baseline Video to 10/10 across Coach, UI/UX, and VC perspectives.

Note: Payment integration deferred until pre-launch.

---

## Implementation Status

| Priority | Item | Status |
|----------|------|--------|
| 1.1 | Parent Access Model | COMPLETED |
| 1.2 | Mobile-First Video Upload (PWA Share Target) | COMPLETED |
| 1.3 | Real-Time Notifications | COMPLETED (In-app) |
| 1.4 | Video Annotation Tools | COMPLETED |
| 2.1 | Simplify Navigation | COMPLETED |
| 2.2 | Calendly-Style Lesson Booking | COMPLETED |
| 2.3 | Onboarding Flow | COMPLETED |
| 2.4 | Simplify Comment Visibility | COMPLETED |
| 2.5 | Mobile-First Side-by-Side Comparison | COMPLETED |
| 4.3 | Increase Lesson Participant Limit | COMPLETED |

### Remaining Items (Deferred)

| Priority | Item | Status |
|----------|------|--------|
| 1.3b | Push Notifications (Web Push API) | DEFERRED |
| 1.3c | Email Notifications | DEFERRED |
| 3.1 | Video Compression Pipeline | DEFERRED |
| 3.2 | Real-Time Updates (Supabase Realtime) | DEFERRED |
| 3.3 | Google Calendar Sync | DEFERRED |
| 4.1 | Remove Admin Dashboard Complexity | DEFERRED |
| 4.2 | Simplify Program Builder | DEFERRED |
| 5.x | GTM and Positioning | DEFERRED |

---

## Completed Features Detail

### 1.1 Parent Access Model (COMPLETED)

**What was implemented:**
- Added `parent` role to profiles table
- Created `parent_player_links` table for parent-child relationships
- Parent dashboard at `/app/parent`
- Parent children view at `/app/parent/children`
- Parents can view linked player videos and lessons
- Parent-specific navigation in bottom nav and sidebar
- Parent onboarding flow

**Files created/modified:**
- `supabase/migrations/0032_parent_access.sql`
- `app/(app)/app/parent/page.tsx`
- `app/(app)/app/parent/children/page.tsx`
- `app/api/team/parents/route.ts`
- `app/api/onboarding/parent/route.ts`
- `app/(app)/BottomNav.tsx`
- `app/(app)/DesktopSidebar.tsx`
- `lib/db/types.ts`

### 1.2 Mobile-First Video Upload (COMPLETED)

**What was implemented:**
- PWA share target in `manifest.json`
- Share handler at `/app/upload/share`
- Users can share videos from phone to upload directly
- Streamlined upload flow

**Files created/modified:**
- `public/manifest.json` (added share_target)
- `app/(app)/upload/share/page.tsx`
- `app/(app)/upload/share/ShareUploadClient.tsx`
- `app/api/upload/share/route.ts`

### 1.3 Notifications (COMPLETED - In-App Only)

**What was implemented:**
- `notifications` table in database
- Notification bell component in header
- Notification center page at `/app/notifications`
- Unread count indicator
- Mark as read functionality

**Files created/modified:**
- `supabase/migrations/0033_notifications.sql`
- `components/NotificationBell.tsx`
- `app/(app)/app/notifications/page.tsx`
- `app/(app)/app/notifications/NotificationsClient.tsx`

### 1.4 Video Annotation Tools (COMPLETED)

**What was implemented:**
- Canvas overlay on paused video
- Drawing tools: freehand, line, arrow, circle, rectangle
- Color picker (red, yellow, green, blue, white)
- Undo/redo and clear all
- Save annotations to database
- Annotations appear at their timestamps during playback

**Files created/modified:**
- `supabase/migrations/0036_video_annotations.sql`
- `components/VideoAnnotationCanvas.tsx`
- `app/(app)/videos/[id]/videoClient.tsx`

### 2.1 Simplify Navigation (COMPLETED)

**What was implemented:**
- Removed drawer navigation entirely
- Desktop: Left sidebar (240px) with all navigation
- Mobile: Bottom nav with 5 items + "More" sheet
- More sheet contains Settings, Help, Profile, Sign Out
- Role-specific navigation items

**Files created/modified:**
- `app/(app)/DesktopSidebar.tsx` (NEW)
- `app/(app)/BottomNav.tsx` (refactored)
- `app/(app)/AppShell.tsx` (updated layout)
- `components/MoreSheet.tsx` (NEW)
- `app/globals.css` (sidebar styles)
- DELETED: `app/(app)/DrawerNav.tsx`

### 2.2 Calendly-Style Lesson Booking (COMPLETED)

**What was implemented:**
- Coach availability settings (weekly recurring)
- Available slots shown on calendar
- Auto-approve for bookings in available slots
- Request flow still works for times outside availability
- Schedule settings component

**Files created/modified:**
- `supabase/migrations/0035_auto_approve_lessons.sql`
- `app/(app)/settings/ScheduleSettings.tsx`
- `app/(app)/app/settings/page.tsx`

### 2.3 Onboarding Flow (COMPLETED)

**What was implemented:**
- Multi-step onboarding for coaches, players, parents
- Coach: Set availability, upload first video, invite first player
- Player: Welcome, upload first video, enable notifications
- Parent: Connected to player, quick tour
- Progress indicators and skip options

**Files created/modified:**
- `app/onboarding/OnboardingClient.tsx` (multi-step flow)
- `app/onboarding/page.tsx`
- `app/api/onboarding/coach/route.ts`
- `app/api/onboarding/player/route.ts`
- `app/api/onboarding/parent/route.ts`

### 2.4 Simplify Comment Visibility (COMPLETED)

**What was implemented:**
- Reduced from 3 options to 2:
  - "Visible to player" (default)
  - "Coach notes" (only coach sees)
- Removed `private` option
- Simple toggle in comment form

**Files modified:**
- `app/(app)/videos/[id]/commentForm.tsx`

### 2.5 Side-by-Side Comparison (COMPLETED)

**What was implemented:**
- Compare page at `/app/compare`
- Select two videos to compare
- Desktop: true side-by-side
- Mobile: stacked view
- Synced or independent playback

**Files created/modified:**
- `app/(app)/app/compare/page.tsx`
- `app/(app)/app/compare/CompareClient.tsx`

### 4.3 Increase Lesson Participant Limit (COMPLETED)

**What was implemented:**
- Changed from 2 to 6 max participants
- Updated database constraints
- Updated UI to allow more players

**Files modified:**
- `supabase/migrations/0034_increase_lesson_participants.sql`

---

## Database Migrations Summary

All migrations are consolidated in `supabase/ALL_MIGRATIONS.sql`.

Key migrations added:
- `0032_parent_access.sql` - Parent role and links
- `0033_notifications.sql` - Notification system
- `0034_increase_lesson_participants.sql` - 6 player limit
- `0035_auto_approve_lessons.sql` - Coach availability
- `0036_video_annotations.sql` - Drawing annotations

---

## Architecture Changes

### Navigation
- **Before**: 5 competing navigation patterns (drawer, bottom nav, breadcrumbs, top bar, FAB)
- **After**: 2 clear patterns
  - Desktop: Left sidebar (always visible)
  - Mobile: Bottom nav + More sheet

### User Roles
- **Before**: Coach, Player
- **After**: Coach, Player, Parent (with linked children)

### Lesson Booking
- **Before**: Player requests, coach approves
- **After**: Coach sets availability, player books (auto-approve) OR requests outside hours

### Comments
- **Before**: public, coach_only, private
- **After**: player_visible, coach_only

---

## Success Metrics (Post-Implementation)

**Coach Score Target: 9/10**
- Parent access: DONE
- Simple booking: DONE
- Video annotations: DONE
- Notifications: DONE
- (Payments: deferred)

**UI/UX Score Target: 9/10**
- Mobile-first: DONE
- Simple nav: DONE
- Onboarding: DONE
- Annotation tools: DONE
- (Real-time: deferred)

**VC Score Target: 8/10**
- Clear wedge (parent access): DONE
- (Viral loop: deferred)
- (Focused positioning: deferred)
- (Needs traction data for 10/10)

---

*Last updated: January 2026*
