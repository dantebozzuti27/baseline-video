# Baseline Video — Comprehensive App Audit

> **Audit Date**: January 2026  
> **Objective**: Transform this app into a no-brainer for baseball coaches  
> **Total Issues Identified**: 95

---

## Executive Summary

Baseline Video has solid foundational architecture but suffers from fragmented UX, incomplete features, and a lack of polish that prevents it from being a premium product. The core issues are:

1. **Fragmented workflows** — Features require too many clicks and page jumps
2. **Missing "coach-first" polish** — Coaches need faster, more visual tools
3. **Incomplete program feature** — The remote program builder is half-baked
4. **Generic UI** — Feels like a developer tool, not a premium coaching platform
5. **No mobile-first design** — Web-only with no PWA or native app support

---

## Category Breakdown

| Category | Issues | Priority |
|----------|--------|----------|
| 🔴 Critical UX Failures | 15 | Immediate |
| 🟠 Missing Core Features | 20 | High |
| 🟡 Program Feature Gaps | 15 | High |
| 🔵 Video Feature Gaps | 12 | Medium |
| 🟣 Lesson Booking Gaps | 10 | Medium |
| ⚪ UI/Design Polish | 15 | Medium |
| 🟤 Performance/Technical | 8 | Low |

---

## 🔴 CRITICAL UX FAILURES (1-15)

### 1. Can't Create Focuses/Drills Inline in Program Builder
**Current**: Must navigate to separate Library page, create item, navigate back  
**Expected**: Modal or inline form to create focus/drill without leaving context  
**Fix**: Add "Create new focus" / "Create new drill" buttons in template editor modals

### 2. No Onboarding Flow for Coaches
**Current**: Coach lands on empty dashboard with no guidance  
**Expected**: Step-by-step wizard: invite players → upload first video → explain features  
**Fix**: Create `/app/onboarding/coach` with 5-step guided setup

### 3. No Onboarding Flow for Players
**Current**: Player lands on empty feed with no explanation  
**Expected**: Welcome screen explaining what to expect, how to upload, what coach sees  
**Fix**: Create `/app/onboarding/player` with 3-step orientation

### 4. Navigation is Confusing — Too Many Pages
**Current**: Programs, Program Library, Library, Enrollments all separate pages  
**Expected**: Unified "Programs" section with tabs  
**Fix**: Combine into single `/app/programs` with tab navigation

### 5. Mobile Navigation is Drawer-Only (No Bottom Tabs)
**Current**: Hamburger menu requires 2+ taps to navigate  
**Expected**: Bottom tab bar for primary actions (Dashboard, Lessons, Programs, Upload)  
**Fix**: Add `<BottomNav />` component for mobile

### 6. Upload Button Not Prominent Enough
**Current**: Upload is just another nav item  
**Expected**: Floating action button (FAB) or persistent bottom bar  
**Fix**: Add FAB on mobile, prominent button in header on desktop

### 7. No Visual Feedback During Async Operations
**Current**: Buttons disable but no spinner/skeleton  
**Expected**: Skeleton loaders, spinners, optimistic updates  
**Fix**: Add `<Spinner />` component and skeleton states

### 8. Player Can't See Their Progress Visually
**Current**: Just a list of uploads  
**Expected**: Progress chart, completion streaks, badges  
**Fix**: Add player dashboard with stats cards

### 9. Coach Dashboard is Text-Heavy, No Visualization
**Current**: Lists and numbers only  
**Expected**: Charts, graphs, quick-action cards  
**Fix**: Add `<TeamStatsCard />` with upload trends, response time avg

### 10. No Notification System
**Current**: Users must manually check for updates  
**Expected**: In-app notification bell, email digests  
**Fix**: Add `notifications` table, bell icon, daily digest emails

### 11. Toasts Disappear Too Fast
**Current**: 3-second toast, no interaction  
**Expected**: Configurable duration, action buttons, stack multiple  
**Fix**: Upgrade toast system with queue and actions

### 12. No Breadcrumb Navigation
**Current**: User loses context in nested pages  
**Expected**: Breadcrumbs showing path (Programs > Program Name > Week 2 > Day 3)  
**Fix**: Add `<Breadcrumbs />` component

### 13. Form Validation Errors Not Inline
**Current**: Generic "Invalid input" response  
**Expected**: Per-field inline validation with helpful messages  
**Fix**: Show Zod errors mapped to form fields

### 14. No Keyboard Shortcuts
**Current**: Mouse-only interaction  
**Expected**: `Cmd+K` command palette, `/` to search  
**Fix**: Add command palette component

### 15. Session Timeout Jarring
**Current**: Sudden redirect to sign-in  
**Expected**: Warning modal 5 min before timeout, option to extend  
**Fix**: Add session monitor with warning

---

## 🟠 MISSING CORE FEATURES (16-35)

### 16. No Search Functionality
**Current**: Can only browse  
**Expected**: Global search for players, videos, programs  
**Fix**: Add `/api/search` and search input in header

### 17. No Video Trimming/Clipping
**Current**: Upload full video only  
**Expected**: In-app trim to create clips  
**Fix**: Integrate client-side video trimmer

### 18. No Video Thumbnail Selector
**Current**: Auto-generated or none  
**Expected**: Choose frame or upload custom thumbnail  
**Fix**: Add thumbnail selection UI

### 19. No Bulk Upload
**Current**: One file at a time  
**Expected**: Drag-drop multiple files  
**Fix**: Multi-file upload with queue progress

### 20. No Video Tagging/Labels
**Current**: Only category (game/training)  
**Expected**: Custom tags (AB, drill name, date)  
**Fix**: Add `video_tags` table and tag input

### 21. No Video Collections/Playlists
**Current**: Flat library  
**Expected**: Create collections like "Best ABs 2025"  
**Fix**: Add `collections` table and UI

### 22. No Drawing/Annotation on Video
**Current**: Text comments only  
**Expected**: Draw lines, circles on video frames  
**Fix**: Canvas overlay with drawing tools

### 23. No Slow-Mo / Frame-by-Frame Controls
**Current**: Standard video controls only  
**Expected**: 0.25x, 0.5x playback, frame step buttons  
**Fix**: Custom video controls component

### 24. No Side-by-Side Comparison Viewer
**Current**: Separate compare page  
**Expected**: Inline comparison in video view  
**Fix**: Split-screen component with sync playback

### 25. No Voice Comments
**Current**: Text only  
**Expected**: Record voice note, auto-transcribe  
**Fix**: Audio recording with Whisper transcription

### 26. No Mobile App (PWA or Native)
**Current**: Web only  
**Expected**: Installable PWA with offline support  
**Fix**: Add manifest.json, service worker, offline mode

### 27. No Team Announcements
**Current**: No broadcast messaging  
**Expected**: Coach sends announcement to all players  
**Fix**: Add announcements feed

### 28. No Direct Messaging
**Current**: Only video comments  
**Expected**: 1:1 chat between coach and player  
**Fix**: Add messaging system (or integrate existing)

### 29. No Activity Log/Audit Trail
**Current**: No history of actions  
**Expected**: "Player uploaded video", "Coach commented"  
**Fix**: Already have `events` table, add UI

### 30. No Player Goals/Targets
**Current**: No goal-setting  
**Expected**: Coach sets goals, player tracks progress  
**Fix**: Add `player_goals` table and UI

### 31. No Calendar View for Videos
**Current**: Reverse-chronological list only  
**Expected**: Calendar showing upload dates  
**Fix**: Add calendar visualization

### 32. No Export/Download Options
**Current**: No data export  
**Expected**: Download CSV of player stats, download video  
**Fix**: Add export endpoints

### 33. No Parent/Guardian Access
**Current**: Only coach and player roles  
**Expected**: Parents can view their child's progress  
**Fix**: Add `guardian` role with limited read access

### 34. No Multi-Sport Support
**Current**: Baseball-specific terminology  
**Expected**: Configurable for softball, golf, etc.  
**Fix**: Add `sport` field to teams, adjust UI terminology

### 35. No Dark/Light Mode Toggle
**Current**: Dark mode only  
**Expected**: User preference toggle  
**Fix**: Add theme toggle, CSS variables for light mode

---

## 🟡 PROGRAM FEATURE GAPS (36-50)

### 36. Can't Create Focus Inline in Program Builder ⭐
**Current**: Must go to separate Library page  
**Expected**: "Create focus" button opens inline modal  
**Fix**: Add create modal in `TemplateEditorClient`

### 37. Can't Create Drill Inline in Program Builder ⭐
**Current**: Must go to separate Library page  
**Expected**: "Create drill" button when adding assignment  
**Fix**: Add create modal in assignment modal

### 38. No Program Templates Library
**Current**: Every program from scratch  
**Expected**: Pre-built templates (8-week hitting, pitching, etc.)  
**Fix**: Add template marketplace/library

### 39. No Program Preview Mode
**Current**: Must enroll to see what player sees  
**Expected**: "Preview as player" button  
**Fix**: Add preview mode in template editor

### 40. No Program Duplication
**Current**: Must rebuild each program  
**Expected**: "Duplicate program" button  
**Fix**: Add clone RPC and button

### 41. No Drag-and-Drop Assignment Reordering
**Current**: Delete and recreate to reorder  
**Expected**: Drag to reorder drills in day  
**Fix**: Add react-beautiful-dnd or similar

### 42. No Copy Day/Week Functionality
**Current**: Manual recreation  
**Expected**: "Copy to Day 2" button  
**Fix**: Add copy assignment RPC

### 43. No Week-at-a-Glance View
**Current**: Click each day to see contents  
**Expected**: Grid showing all days with focus/drill count  
**Fix**: Add summary cards for each day

### 44. No Player Progress Dashboard in Program
**Current**: Coach sees submissions only  
**Expected**: % complete, streak, upcoming assignments  
**Fix**: Add program progress component

### 45. No Automatic Reminders for Players
**Current**: Player must remember to check app  
**Expected**: Push/email notifications for due assignments  
**Fix**: Add reminder cron job and notifications

### 46. No Program Analytics
**Current**: No metrics  
**Expected**: Completion rates, avg time to complete, drop-off points  
**Fix**: Add analytics dashboard

### 47. No Rest Days / Off Days
**Current**: Every day must have content  
**Expected**: Mark day as rest day with optional message  
**Fix**: Add `is_rest_day` boolean to template days

### 48. No Recurring Programs
**Current**: Fixed length only  
**Expected**: Repeating weekly plans  
**Fix**: Add recurring program type

### 49. No Program Versioning
**Current**: Edits affect all enrolled players  
**Expected**: Lock enrolled version, update creates new version  
**Fix**: Add version control for templates

### 50. Instruction Videos Don't Auto-Play
**Current**: Click to play each  
**Expected**: Auto-play in sequence with pause between  
**Fix**: Add playlist player component

---

## 🔵 VIDEO FEATURE GAPS (51-62)

### 51. No Video Categories Beyond Game/Training
**Current**: Only 2 options  
**Expected**: Custom categories per team  
**Fix**: Add `video_categories` table

### 52. Comments Not Real-Time
**Current**: Refresh to see new comments  
**Expected**: Live update via websockets  
**Fix**: Add Supabase realtime subscription

### 53. No Comment Threading/Replies
**Current**: Flat comment list  
**Expected**: Reply to specific comments  
**Fix**: Add `parent_comment_id` field

### 54. No Comment Reactions (Like, 🔥)
**Current**: No reactions  
**Expected**: Quick reactions to comments  
**Fix**: Add reactions table

### 55. No Video Bookmarks
**Current**: Can't save specific timestamps  
**Expected**: Bookmark moments for quick access  
**Fix**: Add bookmarks table

### 56. No Automatic Clip Detection
**Current**: Full videos only  
**Expected**: AI detect swings/throws and auto-clip  
**Fix**: Integrate action detection model

### 57. No Video Quality Options
**Current**: Whatever was uploaded  
**Expected**: 720p, 1080p selector  
**Fix**: Add transcoding pipeline

### 58. No Video Compression on Upload
**Current**: Raw file upload  
**Expected**: Client-side compression option  
**Fix**: Add compression toggle

### 59. External Links Don't Show Preview
**Current**: Just opens in new tab  
**Expected**: Embedded preview when possible  
**Fix**: Add oEmbed support

### 60. No Video Description Field
**Current**: Title only  
**Expected**: Rich description with context  
**Fix**: Add `description` column

### 61. No Video Privacy Controls
**Current**: Coach sees all  
**Expected**: Player can mark video "private" (coach still sees)  
**Fix**: Add privacy flag

### 62. Library Has No Folders/Organization
**Current**: Flat list  
**Expected**: Create folders for drills, reference swings, etc.  
**Fix**: Add folder structure to library

---

## 🟣 LESSON BOOKING GAPS (63-72)

### 63. No Recurring Lessons
**Current**: Book one at a time  
**Expected**: "Repeat weekly for 8 weeks"  
**Fix**: Add recurrence option

### 64. No Lesson Types/Packages
**Current**: All lessons same  
**Expected**: 30-min, 60-min, evaluation, etc.  
**Fix**: Add `lesson_types` table

### 65. No Pricing Display
**Current**: No pricing shown  
**Expected**: Show cost per lesson  
**Fix**: Add pricing to lesson types

### 66. No Location Field for In-Person
**Current**: No location info  
**Expected**: Address, map, directions  
**Fix**: Add location field

### 67. No Lesson Notes History
**Current**: Notes don't persist after lesson  
**Expected**: View notes from past lessons  
**Fix**: Add lesson history page

### 68. No Pre-Lesson Questionnaire
**Current**: Nothing before lesson  
**Expected**: "What do you want to work on?"  
**Fix**: Add intake form

### 69. No Post-Lesson Summary
**Current**: Lesson just ends  
**Expected**: Coach sends summary, drills to practice  
**Fix**: Add lesson summary template

### 70. No Lesson Reminders
**Current**: No reminders  
**Expected**: Email/SMS 24hr and 1hr before  
**Fix**: Add reminder notifications

### 71. Mobile Calendar Tiny and Hard to Use
**Current**: Cramped week view  
**Expected**: Day view default, larger touch targets  
**Fix**: Optimize mobile calendar

### 72. No Waitlist for Full Slots
**Current**: Just shows blocked  
**Expected**: Join waitlist for slot  
**Fix**: Add waitlist feature

---

## ⚪ UI/DESIGN POLISH (73-87)

### 73. Buttons Too Similar — Can't Distinguish Primary Actions
**Current**: Primary and default look similar  
**Expected**: Clear visual hierarchy  
**Fix**: Stronger color contrast for primary

### 74. Cards Lack Visual Hierarchy
**Current**: All cards look the same  
**Expected**: Important cards stand out  
**Fix**: Add card variants (elevated, featured)

### 75. No Loading States on Page Transitions
**Current**: Blank during RSC render  
**Expected**: Skeleton or spinner  
**Fix**: Add loading.tsx files

### 76. Empty States Are Boring
**Current**: "No data" text  
**Expected**: Illustrations, helpful CTAs  
**Fix**: Add empty state illustrations

### 77. Forms Don't Show Progress
**Current**: No step indicator for multi-step  
**Expected**: Progress bar or step dots  
**Fix**: Add progress component

### 78. Typography Lacks Variety
**Current**: Same font weight everywhere  
**Expected**: Headlines, body, caption styles  
**Fix**: Add typography scale

### 79. Colors Don't Convey Status
**Current**: Same blue for everything  
**Expected**: Green=success, yellow=pending, red=error  
**Fix**: Add semantic color tokens

### 80. Icons Are Text (→, ≡, ×)
**Current**: ASCII characters  
**Expected**: Proper icon library  
**Fix**: Add Lucide or Heroicons

### 81. Tables Not Mobile-Friendly
**Current**: Horizontal scroll  
**Expected**: Card layout on mobile  
**Fix**: Responsive table component

### 82. Date/Time Display Inconsistent
**Current**: Mix of formats  
**Expected**: Consistent relative + absolute dates  
**Fix**: Standardize via LocalDateTime

### 83. No Avatar/Profile Photos
**Current**: Names only  
**Expected**: Upload profile photo, initials fallback  
**Fix**: Add avatar upload

### 84. Landing Page Lacks Social Proof
**Current**: No testimonials  
**Expected**: Quotes, logos, success metrics  
**Fix**: Add testimonial section

### 85. Sign-Up Flow Too Long
**Current**: Multiple pages  
**Expected**: Single-page with sections  
**Fix**: Streamline to single form

### 86. Error Pages Are Generic
**Current**: Default Next.js 404/500  
**Expected**: Branded error pages with helpful links  
**Fix**: Create custom error pages

### 87. No Micro-Interactions/Animations
**Current**: Static UI  
**Expected**: Subtle hover, transition, entrance effects  
**Fix**: Add Framer Motion or CSS transitions

---

## 🟤 PERFORMANCE/TECHNICAL (88-95)

### 88. No Image Optimization
**Current**: Raw images served  
**Expected**: WebP, lazy loading, responsive sizes  
**Fix**: Use next/image properly

### 89. No Request Caching Strategy
**Current**: `force-dynamic` everywhere  
**Expected**: Smart caching with revalidation  
**Fix**: Add ISR where appropriate

### 90. Bundle Size Not Optimized
**Current**: No code splitting  
**Expected**: Dynamic imports for heavy components  
**Fix**: Add `dynamic()` for modals, charts

### 91. No Error Boundary
**Current**: Crashes break whole page  
**Expected**: Graceful error recovery  
**Fix**: Add error boundary components

### 92. Database Queries Not Batched
**Current**: Multiple sequential queries  
**Expected**: Parallel queries, joins  
**Fix**: Optimize with Promise.all

### 93. No Rate Limiting
**Current**: APIs unprotected  
**Expected**: Rate limit per user/IP  
**Fix**: Add Upstash rate limiter

### 94. No Logging/Monitoring
**Current**: Console.error only  
**Expected**: Structured logging, error tracking  
**Fix**: Add Sentry or LogRocket

### 95. No Database Backups Verified
**Current**: Relying on Supabase  
**Expected**: Tested backup/restore process  
**Fix**: Document and test restore

---

## Priority Action Plan

### Week 1: Critical UX Fixes
- [ ] Inline focus/drill creation in program builder (#36, #37)
- [ ] Coach onboarding wizard (#2)
- [ ] Bottom nav for mobile (#5)
- [ ] Notification system foundation (#10)

### Week 2: Program Feature Completion  
- [ ] Drag-and-drop assignments (#41)
- [ ] Program preview mode (#39)
- [ ] Program duplication (#40)
- [ ] Week-at-a-glance view (#43)

### Week 3: Video Feature Polish
- [ ] Video tagging (#20)
- [ ] Slow-mo controls (#23)
- [ ] Comment threading (#53)
- [ ] Drawing annotations (#22)

### Week 4: Polish & PWA
- [ ] Mobile PWA with offline support (#26)
- [ ] Keyboard shortcuts / command palette (#14)
- [ ] Loading states and skeletons (#7, #75)
- [ ] Custom error pages (#86)

---

## Conclusion

This app has a solid technical foundation but feels like an MVP. To make it a premium product:

1. **Make it delightful** — Animations, polish, pro design
2. **Make it faster** — Fewer clicks, inline actions, keyboard shortcuts
3. **Make it smarter** — Analytics, insights, recommendations
4. **Make it essential** — Features coaches can't live without
5. **Make it mobile** — PWA with offline support for dugout use

The remote program feature is the biggest differentiator — get that right and coaches will love it.

---

*Audit conducted by Claude Opus 4.5 — January 2026*

